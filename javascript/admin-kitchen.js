import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
    getFirestore,
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    getDoc,
    getDocs,
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Firebase config (same project)
const firebaseConfig = {
    apiKey: "AIzaSyAOpuKx1x0IXKZROiThWfrak1iDupk7puc",
    authDomain: "senseat-42219.firebaseapp.com",
    databaseURL: "https://senseat-42219-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "senseat-42219",
    storageBucket: "senseat-42219.firebasestorage.app",
    messagingSenderId: "375530241499",
    appId: "1:375530241499:web:960d8484c2cba69e8d3bfe"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Table UID -> display name mapping (reuse mapping)
const tableMap = {
    "433E2738": "IN1",
    "D3191A38": "IN2"
};

const container = document.getElementById("kitchenOrdersContainer");

// helper to safely create element
function el(tag, attrs = {}, html = "") {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
        if (k === "class") e.className = v;
        else if (k === "dataset") Object.entries(v).forEach(([dk, dv]) => e.dataset[dk] = dv);
        else e.setAttribute(k, v);
    });
    if (html) e.innerHTML = html;
    return e;
}

// Format timestamp
function formatTimestamp(ts) {
    if (!ts) return { date: "—", time: "—" };
    const d = (typeof ts.toDate === "function") ? ts.toDate() : new Date(ts);
    return {
        date: d.toLocaleDateString(),
        time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
}

// Toggle served boolean on an item (items are stored as array of maps)
// orderId: string, itemIndex: number, value: boolean
async function toggleItemServed(orderId, itemIndex, value) {
    try {
        const orderRef = doc(db, "orders", orderId);
        const snap = await getDoc(orderRef);
        if (!snap.exists()) return console.warn("Order not found:", orderId);
        const data = snap.data();
        const items = Array.isArray(data.items) ? [...data.items] : [];
        if (itemIndex < 0 || itemIndex >= items.length) return console.warn("Invalid itemIndex");

        // If checking this box would make all items served, confirm with the user
        if (value) {
            // simulate marking this item served to evaluate result
            const simulated = items.map((it, i) => i === itemIndex ? { ...it, served: true } : it);
            const allServedAfter = simulated.length > 0 && simulated.every(it => !!it.served);
            if (allServedAfter) {
                const proceed = confirm("This action will complete this order. Do you wish to continue?");
                if (!proceed) {
                    // revert the checkbox in the UI
                    const cb = document.querySelector(`input.kitchen-item-check[data-order-id="${orderId}"][data-index="${String(itemIndex)}"]`);
                    if (cb) cb.checked = false;
                    return;
                }
            }
        }

        // update the served flag for the item
        items[itemIndex] = { ...(items[itemIndex] || {}), served: !!value };
        await updateDoc(orderRef, { items });

        // if all items are served, mark order as 'served'
        const allServed = items.length > 0 && items.every(it => !!it.served);
        if (allServed && data.status !== 'served') {
            try {
                await updateDoc(orderRef, { status: 'served', servedAt: new Date() });
            } catch (err) {
                console.error("Failed to set order status to 'served':", err);
                // revert UI if update failed
                const cb = document.querySelector(`input.kitchen-item-check[data-order-id="${orderId}"][data-index="${String(itemIndex)}"]`);
                if (cb) cb.checked = false;
            }
        } else if (!allServed && data.status === 'served') {
            // if previously marked served but now not all served, revert to preparing
            try {
                await updateDoc(orderRef, { status: 'preparing' });
            } catch (err) {
                console.error("Failed to revert order status to 'preparing':", err);
            }
        }
    } catch (err) {
        console.error("Failed to toggle served:", err);
        // revert UI on unexpected error
        const cb = document.querySelector(`input.kitchen-item-check[data-order-id="${orderId}"][data-index="${String(itemIndex)}"]`);
        if (cb) cb.checked = !cb.checked;
    }
}

// Render a card for a single order (tableUids may be an array)
function renderOrderCard(orderDoc) {
    const data = orderDoc.data() || {};
    const orderId = orderDoc.id;
    const tableField = data.tableId;
    const tableUids = Array.isArray(tableField) ? tableField.filter(Boolean) : (tableField ? [tableField] : []);
    // Table No should show mapped names joined with " + " for merged tables
    const tableName = tableUids.length ? tableUids.map(u => tableMap[u] || u).join(" + ") : "-";
    // Table ID should display the actual UID(s) joined with " + " when merged
    const tableUidDisplay = tableUids.length ? tableUids.join(" + ") : "-";
    const ts = data.timestamp || data.createdAt || null;
    const { date, time } = formatTimestamp(ts);

    // Card wrapper
    const card = el("div", { class: "kitchen-order-card", dataset: { orderId } });

    // Header: Table No. and Table ID
    const header = el("div", { class: "kitchen-order-card-header" });
    header.innerHTML = `<div class="kitchen-order-card-title"><strong>Table No.</strong> ${escapeHTML(tableName)}</div>
                        <div class="kitchen-order-card-id"><strong>Table ID</strong> ${escapeHTML(tableUidDisplay)}</div>
                        <div class="kitchen-order-card-time">${date} ${time}</div>`;
    card.appendChild(header);

    // Body: items table
    const body = el("div", { class: "kitchen-order-card-body" });
    const tbl = el("table", { class: "kitchen-order-items" });
    const thead = el("thead", {}, `<tr><th>Product</th><th>Tag</th><th>Done</th></tr>`);
    const tbody = el("tbody");
    tbl.appendChild(thead);
    tbl.appendChild(tbody);

    const items = Array.isArray(data.items) ? data.items : [];

    // render each item as separate row with checkbox; keep index so toggle updates correct array element
    items.forEach((it, idx) => {
        const name = it.name || "Unnamed";
        const served = !!it.served;

        const row = el("tr");
        const tag = (it.additional && Number(it.additional) > 0) ? `Additional #${Number(it.additional)}` : '';
        row.innerHTML = `<td>${escapeHTML(name)}</td><td>${escapeHTML(tag)}</td><td></td>`;
        // checkbox
        const cb = el("input", { type: "checkbox", class: "kitchen-item-check", dataset: { orderId, index: String(idx) } });
        cb.checked = served;
        cb.addEventListener("change", (e) => {
            const checked = e.target.checked;
            toggleItemServed(orderId, idx, checked);
        });
        row.querySelector("td:last-child").appendChild(cb);
        tbody.appendChild(row);
    });

    body.appendChild(tbl);
    card.appendChild(body);
    return card;
}

function escapeHTML(s) {
    if (!s) return "";
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

// Real-time subscription: only orders with status 'placed' or 'preparing'
function subscribeKitchenOrders() {
    if (!container) return console.warn("kitchen container not found");
    // Firestore 'in' operator
    const q = query(collection(db, "orders"), where("status", "in", ["placed", "preparing"]), orderBy("timestamp", "desc"));
    onSnapshot(q, snapshot => {
        container.innerHTML = "";
        if (!snapshot || snapshot.empty) {
            container.innerHTML = `<div class="kitchen-empty">No active kitchen orders.</div>`;
            return;
        }
        snapshot.forEach(docSnap => {
            const card = renderOrderCard(docSnap);
            container.appendChild(card);
        });
    }, err => {
        console.error("Kitchen orders snapshot error:", err);
        container.innerHTML = `<div class="kitchen-error">Error loading kitchen orders.</div>`;
    });
}

// Promote any 'placed' orders to 'preparing' on page load
async function promotePlacedOrdersToPreparing() {
    try {
        const q = query(collection(db, "orders"), where("status", "==", "placed"));
        const snap = await getDocs(q);
        if (!snap || snap.empty) return;
        const updates = snap.docs.map(d => updateDoc(doc(db, "orders", d.id), { status: "preparing" }));
        await Promise.all(updates);
        console.info(`Promoted ${snap.size} placed order(s) to preparing.`);
    } catch (err) {
        console.error("Failed to promote placed orders:", err);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    subscribeKitchenOrders();
    await promotePlacedOrdersToPreparing();
});