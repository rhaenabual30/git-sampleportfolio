import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
    getFirestore,
    collection,
    onSnapshot,
    query,
    doc,
    addDoc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    where,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyAOpuKx1x0IXKZROiThWfrak1iDupk7puc",
    authDomain: "senseat-42219.firebaseapp.com",
    databaseURL: "https://senseat-42219-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "senseat-42219",
    storageBucket: "senseat-42219.firebasestorage.app",
    messagingSenderId: "375530241499",
    appId: "1:375530241499:web:960d8484c2cba69e8d3bfe"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// UID → Table Name mapping
const tableMap = {
    "433E2738": "IN1",
    "D3191A38": "IN2"
};

// DOM refs
const tableBody = document.querySelector("#reservationTable tbody");
const menuContainer = document.getElementById("menuContainer");

// -----------------------
// Helper utilities
// -----------------------
const safeEl = (id) => document.getElementById(id);
function closeModal(id) {
    const m = safeEl(id);
    if (m) {
        m.style.display = "none";
        document.body.style.overflow = "";
    }
}
function openModalElement(id) {
    const m = safeEl(id);
    if (m) {
        m.style.display = "flex";
        document.body.style.overflow = "hidden";
    }
}

// Globals / state
let currentTables = [];
let mergeSourceId = null;     // table doc id clicked (keeps original behavior)
let activeTableId = null;
let activeOrderId = null;     // used by add-to-cart and live summary
let currentOrderId = null;    // last-resolved order id
let lastComputedTotal = 0;
let activeOrderUnsub = null;  // unsubscribe function for live order listener
let activeCheckoutUnsub = null;  // unsubscribe function for checkout modal listener
// Local cache for menu products (for searching/filtering)
let productsCache = [];

// -----------------------
// Tables: real-time render
// -----------------------
const tablesQuery = query(collection(db, "tables"));
onSnapshot(tablesQuery, snapshot => {
    tableBody.innerHTML = "";
    currentTables = [];

    if (snapshot.empty) {
        const noDataRow = document.createElement("tr");
        noDataRow.innerHTML = `<td colspan="4" style="text-align:center; padding:15px; color:#888;">No live table order as of now.</td>`;
        tableBody.appendChild(noDataRow);
        return;
    }

    snapshot.forEach(s => {
        const data = s.data();
        currentTables.push({ id: s.id, ...data });
    });

    // sort (keeps original ordering logic)
    currentTables.sort((a, b) => {
        const order = ["IN1", "IN2", "IN3", "IN4"];
        const nameA = Array.isArray(a.uid) ? a.uid.map(u => tableMap[u] || u).join(" + ") : tableMap[a.uid] || a.uid;
        const nameB = Array.isArray(b.uid) ? b.uid.map(u => tableMap[b.uid] || b).join(" + ") : tableMap[b.uid] || b.uid;
        return order.indexOf(nameA) - order.indexOf(nameB);
    });

    // render rows
    currentTables.forEach(d => {
        const row = document.createElement("tr");
        const tableName = Array.isArray(d.uid) ? d.uid.map(u => tableMap[u] || u).join(" + ") : tableMap[d.uid] || d.uid;
        const uidDisplay = Array.isArray(d.uid) ? d.uid.join(", ") : d.uid;

        row.innerHTML = `
            <td>${tableName}</td>
            <td>${uidDisplay}</td>
            <td><span class="status-badge ${d.status?.toLowerCase() || ""}">${d.status || ""}</span></td>
            <td><img src="assets/images/icons/more.png" class="icon more-btn" data-id="${d.id}"></td>
        `;
        row.setAttribute("data-doc-id", d.id);
        tableBody.appendChild(row);
    });

    // attach listeners
    document.querySelectorAll(".more-btn").forEach(btn => {
        btn.onclick = (e) => {
            const id = e.currentTarget.dataset.id;
            mergeSourceId = id;
            openMergeModal(id);
        };
    });
});

// -----------------------
// Cancel Table
// -----------------------
const cancelTableBtn = safeEl("cancelTable");
if (cancelTableBtn) {
    cancelTableBtn.addEventListener("click", async () => {
        if (!mergeSourceId) { alert("No table selected to cancel."); return; }
        if (!confirm("Are you sure you want to cancel this table? This action cannot be undone.")) return;

        try {
            await deleteDoc(doc(db, "tables", mergeSourceId));
            alert("Table successfully canceled.");
            closeModal("mergeTableModal");
            mergeSourceId = null;
        } catch (err) {
            console.error("Failed to cancel table:", err);
            alert("Failed to cancel table: " + (err.message || err));
        }
    });
}

// -----------------------
// Merge toggle (UI helper)
// -----------------------
document.addEventListener("DOMContentLoaded", () => {
    const mergeToggle = safeEl("mergeToggle");
    const mergeTargetContainer = safeEl("mergeTargetContainer");
    if (mergeToggle && mergeTargetContainer) {
        mergeToggle.addEventListener("click", () => {
            const enabled = mergeToggle.getAttribute("data-enabled") === "true";
            mergeToggle.textContent = enabled ? "Enable" : "Disable";
            mergeToggle.setAttribute("data-enabled", enabled ? "false" : "true");
            mergeTargetContainer.style.display = enabled ? "none" : "block";
        });
    }
});

// -----------------------
// Modal handling
// -----------------------
function openModal(id, tableId = null) {
    const modal = safeEl(id);

    // if we have a tableId and are opening order/checkout, prepare order state first
    if ((id === "orderPopup" || id === "checkoutPopup") && tableId) {
        if (id === "orderPopup") {
            setupOrderForTable(tableId);
        } else if (id === "checkoutPopup") {
            (async () => {
                try {
                    const tableRef = doc(db, "tables", tableId);
                    const tableSnap = await getDoc(tableRef);
                    if (!tableSnap.exists()) {
                        console.warn("[openModal] table not found:", tableId);
                        const checkoutBody = safeEl("checkoutSummaryBody");
                        if (checkoutBody) checkoutBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Table not found.</td></tr>`;
                        openModalElement(id);
                        return;
                    }
                    const orderId = tableSnap.data().orderId;
                    if (!orderId) {
                        console.warn("[openModal] no orderId for table:", tableId);
                        const checkoutBody = safeEl("checkoutSummaryBody");
                        if (checkoutBody) checkoutBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No order found for this table.</td></tr>`;
                        openModalElement(id);
                        return;
                    }

                    // set globals
                    activeOrderId = orderId;
                    currentOrderId = orderId;

                    // stop previous listener
                    if (activeOrderUnsub) { try { activeOrderUnsub(); } catch (e) {} ; activeOrderUnsub = null; }

                    // populate checkout modal
                    await populateCheckoutPopup(orderId);
                } catch (err) {
                    console.error("[openModal] prepare checkout failed:", err);
                } finally {
                    openModalElement(id);
                }
            })();
            return;
        }
    }

    if (modal) openModalElement(id);
}

function attachGlobalCloseButtons() {
    document.querySelectorAll(".close-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const modal = btn.closest(".modal");
            if (!modal) return;
            modal.style.display = "none";
            document.body.style.overflow = "";
            if (modal.id === "orderPopup" && activeOrderUnsub) {
                try { activeOrderUnsub(); } catch (e) {}
                activeOrderUnsub = null;
            }
            if (modal.id === "checkoutPopup" && activeCheckoutUnsub) {
                try { activeCheckoutUnsub(); } catch (e) {}
                activeCheckoutUnsub = null;
            }
        });
    });
}
attachGlobalCloseButtons();

// -----------------------
// Confirm Merge
// -----------------------
const confirmMergeBtn = safeEl("confirmMerge");
if (confirmMergeBtn) {
    confirmMergeBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const mergeTargetId = safeEl("mergeTarget")?.value;
        if (!mergeSourceId || !mergeTargetId) return;

        try {
            const sourceDocRef = doc(db, "tables", mergeSourceId);
            const targetDocRef = doc(db, "tables", mergeTargetId);
            const sourceSnap = await getDoc(sourceDocRef);
            const targetSnap = await getDoc(targetDocRef);

            if (sourceSnap.exists() && targetSnap.exists()) {
                const sourceData = sourceSnap.data();
                const targetData = targetSnap.data();

                const mergedUIDs = Array.isArray(sourceData.uid) ? [...sourceData.uid] : [sourceData.uid];
                if (Array.isArray(targetData.uid)) mergedUIDs.push(...targetData.uid);
                else mergedUIDs.push(targetData.uid);

                const uniqueUIDs = [...new Set(mergedUIDs)];
                const newDocId = `${mergeSourceId}-${mergeTargetId}`;

                await setDoc(doc(db, "tables", newDocId), {
                    uid: uniqueUIDs,
                    status: targetData.status || sourceData.status || "",
                    timestamp: Timestamp.now()
                });

                await deleteDoc(sourceDocRef);
                await deleteDoc(targetDocRef);
            }
        } catch (err) {
            console.error("Confirm merge failed:", err);
            alert("Failed to merge tables: " + (err.message || err));
        } finally {
            closeModal("mergeTableModal");
            mergeSourceId = null;
        }
    });
}

// -----------------------
// Confirm Table -> create order (keeps current behavior)
// -----------------------
const confirmTableBtn = safeEl("confirmTable");
if (confirmTableBtn) {
    confirmTableBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!mergeSourceId) { alert('No table selected.'); return; }

        // --- NEW: detect reservation(s) related to this table BEFORE marking ordering ---
        try {
            const sourceRef = doc(db, "tables", mergeSourceId);
            const sourceSnap = await getDoc(sourceRef);
            if (!sourceSnap.exists()) {
                alert('Selected table document no longer exists.');
                return;
            }

            const sourceData = sourceSnap.data();
            const uids = Array.isArray(sourceData.uid) ? [...sourceData.uid] : [sourceData.uid];
            const labels = uids.map(u => tableMap[u] || u);
            
            // DEBUG: Log search parameters
            console.log('🔍 RESERVATION DEBUG:');
            console.log('Table UIDs:', uids);
            console.log('Table Labels:', labels);
            console.log('Current time:', new Date().toLocaleString());

            let foundReservation = null;
            const now = new Date();
            const ONE_HOUR_MS = 60 * 60 * 1000;
            const seen = new Set();

            const inspectDoc = (docSnap) => {
                if (foundReservation) return;
                if (seen.has(docSnap.id)) return;
                seen.add(docSnap.id);
                const rdata = docSnap.data();
                if (!rdata || !rdata.slot) {
                    console.log(`⚠️ Skipping reservation ${docSnap.id}: no slot data`);
                    return;
                }
                let slotDate = null;
                try {
                    if (typeof rdata.slot === 'object' && typeof rdata.slot.toDate === 'function') slotDate = rdata.slot.toDate();
                    else slotDate = new Date(rdata.slot);
                } catch (err) { 
                    console.log(`⚠️ Skipping reservation ${docSnap.id}: slot parse error`, err);
                    return; 
                }
                if (!slotDate || isNaN(slotDate.getTime())) {
                    console.log(`⚠️ Skipping reservation ${docSnap.id}: invalid slot date`);
                    return;
                }
                
                const timeDiff = now - slotDate;
                const withinWindow = now >= slotDate && timeDiff <= ONE_HOUR_MS;
                console.log(`⏰ Time check for ${docSnap.id}:`, {
                    slotTime: slotDate.toLocaleString(),
                    currentTime: now.toLocaleString(),
                    timeDiffMinutes: Math.round(timeDiff / (1000 * 60)),
                    withinWindow
                });
                
                if (withinWindow) {
                    console.log(`✅ FOUND MATCHING RESERVATION: ${docSnap.id}`);
                    foundReservation = { id: docSnap.id, data: rdata, slotDate };
                }
            };

            // search by label/tableId
            for (const lbl of labels) {
                if (foundReservation) break;
                console.log(`🔍 Searching for tableId: ${lbl}`);
                
                const qA = query(collection(db, 'reservations'), where('tableId', 'array-contains', lbl), where('status', '==', 'booked'));
                const snapA = await getDocs(qA);
                console.log(`📋 Array-contains query for ${lbl}: ${snapA.size} results`);
                snapA.forEach(docSnap => {
                    const rdata = docSnap.data();
                    console.log(`📄 Found reservation:`, {
                        id: docSnap.id,
                        name: rdata.name,
                        tableId: rdata.tableId,
                        slot: rdata.slot,
                        status: rdata.status
                    });
                });
                snapA.forEach(inspectDoc);
                
                if (foundReservation) break;
                const qB = query(collection(db, 'reservations'), where('tableId', '==', lbl), where('status', '==', 'booked'));
                const snapB = await getDocs(qB);
                console.log(`📋 Exact match query for ${lbl}: ${snapB.size} results`);
                snapB.forEach(docSnap => {
                    const rdata = docSnap.data();
                    console.log(`📄 Found reservation:`, {
                        id: docSnap.id,
                        name: rdata.name,
                        tableId: rdata.tableId,
                        slot: rdata.slot,
                        status: rdata.status
                    });
                });
                snapB.forEach(inspectDoc);
            }

            // search by physical uid
            for (const physical of uids) {
                if (foundReservation) break;
                const qC = query(collection(db, 'reservations'), where('uid', 'array-contains', physical), where('status', '==', 'booked'));
                const snapC = await getDocs(qC);
                snapC.forEach(inspectDoc);
                if (foundReservation) break;
                const qD = query(collection(db, 'reservations'), where('uid', '==', physical), where('status', '==', 'booked'));
                const snapD = await getDocs(qD);
                snapD.forEach(inspectDoc);
            }

            if (foundReservation) {
                const rname = foundReservation.data.name || 'Unknown';
                const slotStr = foundReservation.slotDate.toLocaleString();
                const message = `Reservation detected for ${rname} scheduled at ${slotStr}.\n\nIs the arriving customer the reserving customer?`;
                const isReserving = confirm(message);

                if (isReserving) {
                    try {
                        await updateDoc(doc(db, 'reservations', foundReservation.id), { status: 'seated', updatedAt: Timestamp.now() });
                        alert('Reservation status updated to "seated".');
                    } catch (err) {
                        console.error('Failed to mark reservation seated:', err);
                        alert('Failed to update reservation: ' + (err.message || err));
                    }
                } else {
                    const doCancel = confirm('Not the reserving customer. Do you want to cancel this reservation? (OK = Cancel reservation, Cancel = Keep booked)');
                    if (doCancel) {
                        try {
                            await updateDoc(doc(db, 'reservations', foundReservation.id), { status: 'cancelled', updatedAt: Timestamp.now() });
                            alert('Reservation cancelled.');
                        } catch (err) {
                            console.error('Failed to cancel reservation:', err);
                            alert('Failed to cancel reservation: ' + (err.message || err));
                        }
                    } else {
                        // keep booked
                        alert('Reservation left as "booked".');
                    }
                }
            }
        } catch (resErr) {
            console.error('Reservation detection failed:', resErr);
        }
        // --- END NEW ---

        if (!confirm('Mark this table as ordering and open the order page?')) return;

        try {
            // mark table ordering
            await setDoc(doc(db, 'tables', mergeSourceId), { status: 'ordering' }, { merge: true });

            // read table doc
            const sourceDocRef = doc(db, 'tables', mergeSourceId);
            const sourceSnap = await getDoc(sourceDocRef);
            if (!sourceSnap.exists()) { alert('Table no longer exists.'); return; }

            const sourceData = sourceSnap.data();
            const tableIdArray = Array.isArray(sourceData.uid) ? [...sourceData.uid] : [sourceData.uid];

            // create order (Firestore generates id)
            const orderData = {
                tableId: tableIdArray,
                status: 'ordering',
                timestamp: Timestamp.now(),
                items: [],
                totalAmount: 0,
                addBatchCounter: 0
            };

            const orderRef = await addDoc(collection(db, 'orders'), orderData);
            await setDoc(orderRef, { uid: orderRef.id }, { merge: true });
            await setDoc(sourceDocRef, { orderId: orderRef.id }, { merge: true });

            // Keep the table ID for opening the order modal
            const tableId = mergeSourceId;

            closeModal("mergeTableModal");
            openModal("orderPopup", tableId);
        } catch (err) {
            console.error('Failed to update status or create order:', err);
            alert('Failed to update table status or create order: ' + (err.message || err));
        }
    });
}

// -----------------------
// Products -> menu rendering + search
// -----------------------
if (menuContainer) {
    const searchInput = document.getElementById("menuSearch");
    const searchBtn = document.getElementById("searchBtn");

    const normalize = (v) => (v ?? "").toString().toLowerCase();

    function renderMenuCards(list) {
        menuContainer.innerHTML = "";

        if (!Array.isArray(list) || list.length === 0) {
            const empty = document.createElement("div");
            empty.textContent = "No items found.";
            empty.style.color = "#666";
            empty.style.padding = "8px";
            menuContainer.appendChild(empty);
            return;
        }

        list.forEach(p => {
            const menuCard = document.createElement("div");
            menuCard.className = "menu-card";
            menuCard.dataset.id = p.id;
            menuCard.dataset.category = p.categoryUid || "";

            const hasRange = (p.minPax !== undefined && p.minPax !== null) && (p.maxPax !== undefined && p.maxPax !== null);
            const servingsStr = hasRange
                ? `👥 ${p.minPax} - ${p.maxPax}`
                : (p.servings ? `👥 ${p.servings}` : '👥 2-4');

            menuCard.innerHTML = `
                <img src="${p.imageUrl}" alt="${p.name}">
                <h4>${p.name}</h4>
                <p>${p.description}</p>
                <div class="menu-info">
                    <span class="price">₱${(p.price || 0).toFixed(2)}</span>
                    <span class="servings">${servingsStr}</span>
                </div>
                <button class="add-to-cart">🛒</button>
            `;
            menuContainer.appendChild(menuCard);
        });
    }

    function applyFilter() {
        const q = normalize(searchInput?.value?.trim());
        if (!q) {
            renderMenuCards(productsCache);
            return;
        }

        const filtered = productsCache.filter(p => {
            const haystack = [
                p.name,
                p.description,
                p.categoryName,
                Array.isArray(p.keywords) ? p.keywords.join(" ") : ""
            ].map(normalize).join(" ");
            return haystack.includes(q);
        });
        renderMenuCards(filtered);
    }

    function debounce(fn, wait = 200) {
        let t = null;
        return (...args) => {
            if (t) clearTimeout(t);
            t = setTimeout(() => fn(...args), wait);
        };
    }

    const debouncedFilter = debounce(applyFilter, 150);

    // Wire up search controls (click, type, Enter)
    if (searchBtn) {
        searchBtn.addEventListener("click", (e) => {
            e.preventDefault();
            applyFilter();
        });
    }
    if (searchInput) {
        searchInput.addEventListener("input", debouncedFilter);
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                applyFilter();
            }
        });
    }

    onSnapshot(collection(db, "products"), snapshot => {
        const fallbackImg = 'assets/images/placeholders/placeholder.png';
        productsCache = [];
        snapshot.forEach(s => {
            const p = s.data() || {};
            productsCache.push({
                id: s.id,
                name: p.name || "",
                description: p.description || "",
                price: Number(p.price || 0),
                imageUrl: p.imageUrl || fallbackImg,
                servings: p.servings || "",
                // Support multiple possible field names for pax range
                minPax: (p.minPax ?? p.servingsMin ?? null),
                maxPax: (p.maxPax ?? p.servingsMax ?? null),
                categoryUid: p.category?.category_uid || "",
                categoryName: p.category?.category_name || p.category?.name || "",
                keywords: Array.isArray(p.keywords) ? p.keywords : []
            });
        });
        // Render using current filter (if any)
        applyFilter();
    }, err => console.error("Products snapshot error:", err));
}

// -----------------------
// Add to Cart
// -----------------------
document.addEventListener("click", async (e) => {
    if (!e.target.classList.contains("add-to-cart")) return;
    const menuCard = e.target.closest(".menu-card");
    if (!menuCard) return;

    // must have an active order id (set by setupOrderForTable / confirm flow)
    if (!activeOrderId) {
        alert("No active order selected.");
        return;
    }

            const productId = menuCard.dataset.id;
        const productName = menuCard.querySelector("h4")?.textContent.trim() || "Unnamed";
        const productCost = parseFloat(menuCard.querySelector(".price")?.textContent.replace("₱", "").trim() || "0") || 0;
        const productCategoryUid = menuCard.dataset.category || "";

        try {
            const orderRef = doc(db, "orders", activeOrderId);
            const orderSnap = await getDoc(orderRef);
            if (!orderSnap.exists()) { 
                alert("Order document does not exist."); 
                return; 
            }

            const orderData = orderSnap.data();
            const items = Array.isArray(orderData.items) ? orderData.items : [];
            const batch = Number(orderData.addBatchCounter || 0);
            items.push({ 
                name: productName, 
                id: productId, 
                cost: productCost, 
                category: productCategoryUid, 
                served: false,
                additional: batch > 0 ? batch : 0
            });

            await setDoc(orderRef, { items }, { merge: true });
        
        // keep in-memory ids in sync
        currentOrderId = activeOrderId;
        alert(`${productName} added to the order.`);
    } catch (err) {
        console.error("Failed to add product to order:", err);
        alert("Failed to add product to order: " + (err.message || err));
    }
});

// -----------------------
// Live order listener -> summary table
// -----------------------
function listenToOrderUpdates(orderId) {
    const summaryTableBody = document.querySelector(".summary-table tbody");
    if (!summaryTableBody) return () => {};

    const orderRef = doc(db, "orders", orderId);
    return onSnapshot(orderRef, (snap) => {
        if (!snap.exists()) {
            summaryTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No order data available.</td></tr>`;
            return;
        }

        const orderData = snap.data();
        const items = orderData.items || [];

        // aggregate quantities
        const itemCounts = {};
        items.forEach(i => {
            if (!itemCounts[i.id]) itemCounts[i.id] = { ...i, quantity: 1 };
            else itemCounts[i.id].quantity++;
        });

        summaryTableBody.innerHTML = "";
        let itemTotal = 0;
        let grossTotal = 0;
        Object.values(itemCounts).forEach(item => {
            const itemVATTotal = (item.cost - (item.cost * 0.12)) * item.quantity;
            const itemNoVATTotal = item.cost * item.quantity;
            itemTotal += itemNoVATTotal;
            grossTotal += itemVATTotal;
            const row = document.createElement("tr");
            row.innerHTML = `<td>${item.name}</td><td>${item.quantity}x</td><td class="amount">₱${itemVATTotal.toFixed(2)}</td>`;
            summaryTableBody.appendChild(row);
        });

        // totals
        const vat = itemTotal * 0.12;
        const subtotal = grossTotal;
        const discount = 0;
        const total = subtotal + vat;
        lastComputedTotal = total;

        const subtotalEl = safeEl("subtotalAmount");
        const vatEl = safeEl("vatAmount");
        const discountEl = safeEl("discountAmount");
        const totalEl = safeEl("totalAmount");
        if (subtotalEl) subtotalEl.textContent = `₱${subtotal.toFixed(2)}`;
        if (vatEl) vatEl.textContent = `₱${vat.toFixed(2)}`;
        if (discountEl) discountEl.textContent = `₱${discount.toFixed(2)}`;
        if (totalEl) totalEl.textContent = `₱${total.toFixed(2)}`;
    }, err => {
        console.error("Order listener error:", err);
    });
}

// -----------------------
// Revert status (order popup) -> delete order + set table to confirming
// -----------------------
document.addEventListener("DOMContentLoaded", () => {
    const revertBtn = safeEl("revertStatus");
    const orderPopup = safeEl("orderPopup");

    async function getActiveOrderTableId() {
        if (!orderPopup) return null;
        const fromDataset = orderPopup.dataset.tableId || orderPopup.dataset.docId || orderPopup.getAttribute("data-doc-id") || orderPopup.getAttribute("data-table-id");
        if (fromDataset) return fromDataset;
        if (typeof mergeSourceId !== "undefined" && mergeSourceId) return mergeSourceId;
        if (typeof activeTableId !== "undefined" && activeTableId) return activeTableId;
        return null;
    }

    if (revertBtn) {
        revertBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            const tableId = await getActiveOrderTableId();
            if (!tableId) { alert("No table selected to revert."); return; }

            try {
                const tableRef = doc(db, "tables", tableId);
                const snap = await getDoc(tableRef);
                if (!snap.exists()) { alert("Table no longer exists."); return; }
                const data = snap.data();
                const orderId = data.orderId;

                // set table to confirming and clear orderId
                await setDoc(tableRef, { status: "confirming", timestamp: Timestamp.now(), orderId: null }, { merge: true });

                // delete order doc if present
                if (orderId) {
                    await deleteDoc(doc(db, "orders", orderId));
                }

                if (typeof closeModal === "function") closeModal("orderPopup");
                alert("Table reverted and order deleted.");
            } catch (err) {
                console.error("Failed to revert status:", err);
                alert("Failed to revert status: " + (err.message || err));
            }
        });
    }
});

// -----------------------
// Confirm Order -> move to checkout
// -----------------------
const confirmOrderBtn = safeEl("confirmOrder");
if (confirmOrderBtn) {
    confirmOrderBtn.addEventListener("click", async () => {
        if (!mergeSourceId) { alert('No table selected.'); return; }
        if (!currentOrderId) { alert('No order selected.'); return; }

        try {
            // Get the current order data to record in sales
            const orderRef = doc(db, 'orders', currentOrderId);
            const orderSnap = await getDoc(orderRef);
            
            if (!orderSnap.exists()) {
                alert('Order not found.');
                return;
            }
            
            const orderData = orderSnap.data();
            
            // Calculate totals for sales record
            const grossTotal = lastComputedTotal || orderData.totalAmount || 0;
            const vat = grossTotal * 0.12;
            const subtotal = grossTotal - vat;
            
            // Record sale with status "confirming"
            const salesData = {
                orderId: currentOrderId,
                tableId: orderData.tableId || [],
                items: orderData.items || [],
                subtotal: subtotal,
                vat: vat,
                discount: 0,
                totalAmount: grossTotal,
                status: 'confirming',
                timestamp: Timestamp.now(),
                createdAt: Timestamp.now()
            };
            
            const salesRef = await addDoc(collection(db, 'sales'), salesData);
            console.log('Sales record created:', salesRef.id);
            
            // Link the sales document ID to the order
            await updateDoc(orderRef, { 
                status: 'placed', 
                totalAmount: grossTotal,
                salesId: salesRef.id 
            });

            // update table status
            await setDoc(doc(db, 'tables', mergeSourceId), { status: 'checkout' }, { merge: true });

            // open checkout popup and populate
            closeModal("orderPopup");
            openModal("checkoutPopup", mergeSourceId);
            await populateCheckoutPopup(currentOrderId);
        } catch (err) {
            console.error('Failed to confirm order:', err);
            alert('Failed to confirm order: ' + (err.message || err));
        }
    });
}

// -----------------------
// Close order button
// -----------------------
const closeOrderBtn = safeEl("closeOrder");
if (closeOrderBtn) {
    closeOrderBtn.addEventListener("click", () => {
        closeModal("orderPopup");
        mergeSourceId = null;
    });
}

// -----------------------
// Checkout modal actions
// -----------------------
document.addEventListener("DOMContentLoaded", () => {
    const checkoutRevertBtn = safeEl("checkoutRevertStatus");
    const checkoutPopup = safeEl("checkoutPopup");

    const getPopupTableId = (popup) => {
        if (!popup) return null;
        return popup.dataset.tableId || popup.dataset.docId || popup.getAttribute("data-doc-id") || popup.getAttribute("data-table-id") || null;
    };

    if (checkoutRevertBtn) {
        checkoutRevertBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            const tableId = getPopupTableId(checkoutPopup) || mergeSourceId || activeTableId || null;
            if (!tableId) { alert("No table selected to revert."); return; }

            try {
                const tableRef = doc(db, "tables", tableId);
                const snap = await getDoc(tableRef);
                if (!snap.exists()) { alert("Table no longer exists."); return; }
                const data = snap.data();
                const orderId = data?.orderId || null;

                // revert table status to ordering
                await setDoc(tableRef, { status: "ordering", timestamp: Timestamp.now() }, { merge: true });

                // update order status back to ordering and bump additional batch counter
                // also delete the associated sales record
                if (orderId) {
                    try {
                        const orderRef = doc(db, "orders", orderId);
                        const orderSnap = await getDoc(orderRef);
                        
                        if (orderSnap.exists()) {
                            const orderData = orderSnap.data();
                            const current = orderData.addBatchCounter || 0;
                            const salesId = orderData.salesId;
                            
                            // Delete the sales record if it exists
                            if (salesId) {
                                try {
                                    await deleteDoc(doc(db, "sales", salesId));
                                    console.log('Sales record deleted:', salesId);
                                } catch (salesErr) {
                                    console.error("Failed to delete sales record:", salesErr);
                                }
                            }
                            
                            // Update order status and remove salesId reference
                            await updateDoc(orderRef, { 
                                status: "ordering", 
                                timestamp: Timestamp.now(), 
                                addBatchCounter: current + 1,
                                salesId: null
                            });
                        }
                    } catch (orderErr) {
                        console.error("Failed updating order status on revert:", orderErr);
                    }
                }

                if (typeof closeModal === "function") closeModal("checkoutPopup");
                alert("Table status reverted to ordering and sales record deleted.");
            } catch (err) {
                console.error("Failed to revert checkout status:", err);
                alert("Failed to revert status: " + (err.message || err));
            }
        });
    }
});

// -----------------------
// Checkout final -> delete table doc
// -----------------------
const checkoutTableBtn = safeEl("checkoutTableBtn");
if (checkoutTableBtn) {
    checkoutTableBtn.addEventListener("click", async () => {
        if (!mergeSourceId) { alert('No table selected.'); return; }
        if (!confirm('Checkout and archive this order? This cannot be undone.')) return;

        try {
            // First, get the table data to find the order and sales IDs
            const tableRef = doc(db, 'tables', mergeSourceId);
            const tableSnap = await getDoc(tableRef);
            
            if (tableSnap.exists()) {
                const tableData = tableSnap.data();
                const orderId = tableData.orderId;
                
                // Update sales record status to 'complete'
                if (orderId) {
                    try {
                        const orderRef = doc(db, 'orders', orderId);
                        const orderSnap = await getDoc(orderRef);
                        
                        if (orderSnap.exists()) {
                            const orderData = orderSnap.data();
                            const salesId = orderData.salesId;
                            
                            if (salesId) {
                                const salesRef = doc(db, 'sales', salesId);
                                await updateDoc(salesRef, {
                                    status: 'complete',
                                    completedAt: Timestamp.now(),
                                    updatedAt: Timestamp.now()
                                });
                                console.log('Sales record marked as complete:', salesId);
                            }
                        }
                    } catch (salesErr) {
                        console.error('Failed to update sales status:', salesErr);
                    }
                }
            }
            
            // Attempt to update any reservation(s) for this physical table to 'complete'
            // Only update reservations that are currently active (within the time window)
            try {
                if (tableSnap.exists()) {
                    const data = tableSnap.data();
                    const uids = Array.isArray(data.uid) ? data.uid : [data.uid];
                    const labels = uids.map(u => tableMap[u] || u);

                    let updatedCount = 0;
                    const now = new Date();
                    const ONE_HOUR_MS = 60 * 60 * 1000;
                    const seen = new Set();

                    // Helper function to check if a reservation is within the current time window
                    const isWithinTimeWindow = (rdata) => {
                        if (!rdata || !rdata.slot) return false;
                        
                        let slotDate = null;
                        try {
                            if (typeof rdata.slot === 'object' && typeof rdata.slot.toDate === 'function') {
                                slotDate = rdata.slot.toDate();
                            } else {
                                slotDate = new Date(rdata.slot);
                            }
                        } catch (err) { 
                            return false; 
                        }
                        
                        if (!slotDate || isNaN(slotDate.getTime())) return false;
                        
                        const timeDiff = now - slotDate;
                        return now >= slotDate && timeDiff <= ONE_HOUR_MS;
                    };

                    // Helper to process reservation snapshots with time window filtering
                    const processSnap = async (resSnap) => {
                        for (const r of resSnap.docs) {
                            if (seen.has(r.id)) continue;
                            seen.add(r.id);
                            
                            const rdata = r.data();
                            // Only update reservations that are within the current time window
                            if (isWithinTimeWindow(rdata)) {
                                try {
                                    await updateDoc(doc(db, 'reservations', r.id), { status: 'complete', updatedAt: Timestamp.now() });
                                    updatedCount++;
                                    console.log(`✅ Marked reservation ${r.id} as complete (customer: ${rdata.name || 'Unknown'})`);
                                } catch (uErr) {
                                    console.error('Failed updating reservation status for', r.id, uErr);
                                }
                            } else {
                                console.log(`⏰ Skipping reservation ${r.id} - not within current time window (customer: ${rdata.name || 'Unknown'})`);
                            }
                        }
                    };

                    // For each resolved label, find matching reservations and update
                    for (const lbl of labels) {
                        // reservations where tableId is an array containing this label
                        const q1 = query(collection(db, 'reservations'), where('tableId', 'array-contains', lbl), where('status', 'in', ['booked', 'seated']));
                        const snap1 = await getDocs(q1);
                        await processSnap(snap1);

                        // reservations where tableId equals the label (legacy single-value)
                        const q2 = query(collection(db, 'reservations'), where('tableId', '==', lbl), where('status', 'in', ['booked', 'seated']));
                        const snap2 = await getDocs(q2);
                        await processSnap(snap2);
                    }

                    // Also search by physical uid (array-contains and equality)
                    for (const physical of uids) {
                        const q3 = query(collection(db, 'reservations'), where('uid', 'array-contains', physical), where('status', 'in', ['booked', 'seated']));
                        const snap3 = await getDocs(q3);
                        await processSnap(snap3);

                        const q4 = query(collection(db, 'reservations'), where('uid', '==', physical), where('status', 'in', ['booked', 'seated']));
                        const snap4 = await getDocs(q4);
                        await processSnap(snap4);
                    }

                    if (updatedCount > 0) {
                        console.info(`Updated ${updatedCount} reservation(s) to 'complete' for table ${mergeSourceId}.`);
                    } else {
                        console.info(`No reservations within current time window found for table ${mergeSourceId}.`);
                    }
                }
            } catch (resErr) {
                console.error('Error while updating reservations on checkout:', resErr);
            }

            const row = document.querySelector(`[data-doc-id="${mergeSourceId}"]`);
            if (row) row.remove();
            await deleteDoc(doc(db, 'tables', mergeSourceId));
        } catch (err) {
            console.error('Failed to delete order:', err);
            alert('Failed to delete order: ' + (err.message || err));
        } finally {
            closeModal("checkoutPopup");
            mergeSourceId = null;
        }
    });
}

// -----------------------
// Senior Discount Modal & Logic
// -----------------------
document.addEventListener("DOMContentLoaded", () => {
    const applySeniorBtn = safeEl("applySenior");
    const seniorModal = safeEl("seniorDiscountModal");
    const closeSeniorBtn = safeEl("closeSeniorModal");
    const cancelSeniorBtn = safeEl("cancelSeniorDiscount");
    const confirmSeniorBtn = safeEl("confirmSeniorDiscount");
    const seniorCountInput = safeEl("seniorCount");
    const seniorCountMaxHint = safeEl("seniorCountMaxHint");

    // Open senior discount confirmation modal
    if (applySeniorBtn) {
        applySeniorBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            if (!currentOrderId) {
                alert('No active order to apply discount.');
                return;
            }
            
            try {
                // Resolve sales document and check discount state
                const orderRef = doc(db, "orders", currentOrderId);
                const orderSnap = await getDoc(orderRef);
                if (!orderSnap.exists()) { alert('Order not found.'); return; }
                const orderData = orderSnap.data();
                let salesId = orderData.salesId;
                if (!salesId) {
                    const qs = query(collection(db, 'sales'), where('orderId', '==', currentOrderId));
                    const qsSnap = await getDocs(qs);
                    if (!qsSnap.empty) salesId = qsSnap.docs[0].id;
                }
                if (!salesId) { alert('No sales record found. Please confirm the order before applying discounts.'); return; }
                const salesRef = doc(db, 'sales', salesId);
                const salesSnap = await getDoc(salesRef);
                if (!salesSnap.exists()) { alert('Sales record not found.'); return; }
                const salesData = salesSnap.data();
                const seniorDiscountApplied = !!salesData.seniorDiscountApplied;
                
                // If discount already applied, prompt to revert
                if (seniorDiscountApplied) {
                    const confirmRevert = confirm('A senior discount has already been applied to this order. Do you want to revert it?');
                    if (!confirmRevert) return;
                    
                    // Revert the discount based on sales items
                    const items = salesData.items || [];
                    const itemCounts = {};
                    items.forEach(it => {
                        if (!itemCounts[it.id]) itemCounts[it.id] = { name: it.name, cost: it.cost, quantity: 0 };
                        itemCounts[it.id].quantity += 1;
                    });
                    
                    // Recalculate without discount
                    let subtotalExVAT = 0;
                    let vatCharged = 0;
                    Object.values(itemCounts).forEach(item => {
                        const unitExVAT = item.cost * 0.88;
                        const unitVAT = item.cost * 0.12;
                        subtotalExVAT += unitExVAT * item.quantity;
                        vatCharged += unitVAT * item.quantity;
                    });
                    const totalDue = subtotalExVAT + vatCharged;
                    
                    // Update sales record only
                    const revertPayload = {
                        seniorDiscountApplied: false,
                        seniorDiscountItem: null,
                        seniorDiscountAmount: 0,
                        seniorDiscountCount: 0,
                        subtotal: subtotalExVAT,
                        vat: vatCharged,
                        discount: 0,
                        totalAmount: totalDue,
                        updatedAt: Timestamp.now()
                    };
                    console.log('About to revert sales document:', salesId);
                    console.log('Revert payload:', revertPayload);
                    try {
                        await setDoc(salesRef, revertPayload, { merge: true });
                        console.log('Sales record updated - discount reverted:', salesId);
                        
                        // Verify the revert by reading back the document
                        const verifySnap = await getDoc(salesRef);
                        if (verifySnap.exists()) {
                            const verifyData = verifySnap.data();
                            console.log('Verified sales data after revert:', {
                                discount: verifyData.discount,
                                seniorDiscountAmount: verifyData.seniorDiscountAmount,
                                subtotal: verifyData.subtotal,
                                totalAmount: verifyData.totalAmount,
                                vat: verifyData.vat,
                                seniorDiscountApplied: verifyData.seniorDiscountApplied,
                                seniorDiscountCount: verifyData.seniorDiscountCount
                            });
                        }
                    } catch (salesErr) {
                        console.error('Failed to update sales record during revert:', salesErr);
                    }
                    
                    alert('Senior discount has been reverted.');
                    return;
                }
                
                // No discount applied yet, proceed to show modal using sales items
                const items = salesData.items || [];
                const totalUnits = items.length;
                if (seniorCountInput) {
                    seniorCountInput.max = Math.max(1, totalUnits);
                    if (!seniorCountInput.value) seniorCountInput.value = "1";
                }
                if (seniorCountMaxHint) seniorCountMaxHint.textContent = totalUnits > 0 ? `(max ${totalUnits})` : '';
                openModalElement("seniorDiscountModal");
            } catch (e) {
                console.error('Error checking/reverting senior discount:', e);
                alert('Failed to process senior discount: ' + (e.message || e));
            }
        });
    }

    // Close modal handlers
    if (closeSeniorBtn) {
        closeSeniorBtn.addEventListener("click", () => {
            closeModal("seniorDiscountModal");
        });
    }

    if (cancelSeniorBtn) {
        cancelSeniorBtn.addEventListener("click", () => {
            closeModal("seniorDiscountModal");
        });
    }

    // Confirm senior discount
    if (confirmSeniorBtn) {
        confirmSeniorBtn.addEventListener("click", async () => {
            if (!currentOrderId) {
                alert('No active order found.');
                closeModal("seniorDiscountModal");
                return;
            }

            try {
                // Resolve sales document and use its items
                const orderRef = doc(db, "orders", currentOrderId);
                const orderSnap = await getDoc(orderRef);
                if (!orderSnap.exists()) { alert('Order not found.'); closeModal("seniorDiscountModal"); return; }
                const orderData = orderSnap.data();
                let salesId = orderData.salesId;
                if (!salesId) {
                    const qs = query(collection(db, 'sales'), where('orderId', '==', currentOrderId));
                    const qsSnap = await getDocs(qs);
                    if (!qsSnap.empty) salesId = qsSnap.docs[0].id;
                }
                if (!salesId) { alert('No sales record found. Please confirm the order before applying discounts.'); closeModal("seniorDiscountModal"); return; }
                const salesRef = doc(db, 'sales', salesId);
                const salesSnap = await getDoc(salesRef);
                if (!salesSnap.exists()) { alert('Sales record not found.'); closeModal("seniorDiscountModal"); return; }
                const salesData = salesSnap.data();
                const items = salesData.items || [];

                if (items.length === 0) {
                    alert('No items in order to apply discount.');
                    closeModal("seniorDiscountModal");
                    return;
                }

                // Build unit list and sort by unit cost desc
                const units = items.map((it, idx) => ({ id: it.id, name: it.name, cost: it.cost, index: idx })).sort((a, b) => b.cost - a.cost);
                console.log('Items from sales:', items);
                console.log('Units sorted by cost:', units);

                // Seniors count to apply
                const requestedCount = Math.max(1, parseInt((document.getElementById('seniorCount')?.value || '1'), 10));
                const applyCount = Math.min(requestedCount, units.length);
                console.log('Requested count:', requestedCount, 'Apply count:', applyCount);

                // Allocate discounted units by item id
                const discountAlloc = new Map();
                for (let i = 0; i < applyCount; i++) {
                    const u = units[i];
                    discountAlloc.set(u.id, (discountAlloc.get(u.id) || 0) + 1);
                }
                console.log('Discount allocation:', discountAlloc);

                // Aggregate per item for totals
                const aggregate = {};
                items.forEach(it => {
                    if (!aggregate[it.id]) aggregate[it.id] = { id: it.id, name: it.name, cost: it.cost, quantity: 0 };
                    aggregate[it.id].quantity += 1;
                });
                console.log('Item aggregates:', aggregate);

                let subtotalExVAT = 0;
                let vatCharged = 0;
                let vatRemoved = 0;
                let discount20Total = 0;

                Object.values(aggregate).forEach(item => {
                    const unitExVAT = item.cost * 0.88;
                    const unitVAT = item.cost * 0.12;
                    const discountedUnits = discountAlloc.get(item.id) || 0;
                    const normalUnits = item.quantity - discountedUnits;
                    
                    console.log(`Processing item ${item.name} (id: ${item.id}):`);
                    console.log(`  Cost: ${item.cost}, Quantity: ${item.quantity}`);
                    console.log(`  Discounted units: ${discountedUnits}, Normal units: ${normalUnits}`);
                    console.log(`  Unit ex-VAT: ${unitExVAT}, Unit VAT: ${unitVAT}`);

                    const itemSubtotal = (unitExVAT * normalUnits) + (unitExVAT * 0.80) * discountedUnits;
                    const itemVAT = unitVAT * normalUnits;
                    const itemDiscount = (unitExVAT * 0.20) * discountedUnits;
                    
                    console.log(`  Item subtotal: ${itemSubtotal}, Item VAT: ${itemVAT}, Item discount: ${itemDiscount}`);

                    subtotalExVAT += itemSubtotal;
                    vatCharged += itemVAT;
                    vatRemoved += unitVAT * discountedUnits;
                    discount20Total += itemDiscount;
                });

                const totalDue = subtotalExVAT + vatCharged;

                // Identify a label for discounted items
                let seniorDiscountItemLabel = '';
                const discountedItemIds = Array.from(discountAlloc.keys());
                if (discountedItemIds.length === 1) {
                    const id = discountedItemIds[0];
                    seniorDiscountItemLabel = aggregate[id]?.name || '';
                } else if (discountedItemIds.length > 1) {
                    seniorDiscountItemLabel = 'Multiple Items';
                }

                // Persist
                const updatePayload = {
                    seniorDiscountApplied: applyCount > 0,
                    seniorDiscountItem: seniorDiscountItemLabel,
                    seniorDiscountAmount: discount20Total,
                    seniorDiscountCount: applyCount,
                    subtotal: subtotalExVAT,
                    vat: vatCharged,
                    discount: discount20Total,
                    totalAmount: totalDue,
                    updatedAt: Timestamp.now()
                };

                // Update only the sales doc
                console.log('About to update sales document:', salesId);
                console.log('Update payload:', updatePayload);
                try {
                    await setDoc(salesRef, updatePayload, { merge: true });
                    console.log('Sales record updated with senior discounts:', salesId);
                    
                    // Verify the update by reading back the document
                    const verifySnap = await getDoc(salesRef);
                    if (verifySnap.exists()) {
                        const verifyData = verifySnap.data();
                        console.log('Verified sales data after update:', {
                            discount: verifyData.discount,
                            seniorDiscountAmount: verifyData.seniorDiscountAmount,
                            subtotal: verifyData.subtotal,
                            totalAmount: verifyData.totalAmount,
                            vat: verifyData.vat,
                            seniorDiscountApplied: verifyData.seniorDiscountApplied,
                            seniorDiscountCount: verifyData.seniorDiscountCount
                        });
                    }
                } catch (salesErr) {
                    console.error('Failed to update sales record:', salesErr);
                    alert('Warning: Failed to update sales record: ' + (salesErr.message || salesErr));
                }

                closeModal("seniorDiscountModal");
                alert(`Senior discounts applied: ${applyCount}. Total discount: ₱${discount20Total.toFixed(2)}.`);

            } catch (err) {
                console.error('Failed to apply senior discount:', err);
                alert('Failed to apply senior discount: ' + (err.message || err));
                closeModal("seniorDiscountModal");
            }
        });
    }
});

// -----------------------
// Open Merge Modal logic
// -----------------------
async function openMergeModal(sourceId) {
    const modal = safeEl("mergeTableModal");
    const mergeTargetSelect = safeEl("mergeTarget");
    const mergeSourceText = safeEl("mergeSource");
    const confirmMerge = safeEl("confirmMerge");

    mergeSourceId = sourceId;

    try {
        const sourceRef = doc(db, 'tables', sourceId);
        const sourceSnap = await getDoc(sourceRef);
        if (!sourceSnap.exists()) { alert('Selected table document no longer exists.'); return; }

        const sourceData = sourceSnap.data();
        const sourceStatus = sourceData?.status || '';

        // (Reservation detection moved to Confirm Table click handler)
 
        if (sourceStatus === 'ordering') {
            mergeSourceText.textContent = `Ordering: ${sourceId}`;

            const orderId = sourceData.orderId;
            if (orderId) {
                activeOrderId = orderId;
                currentOrderId = orderId;
                activeTableId = sourceId;
            } else {
                console.warn("Table is in ordering state but has no orderId.");
            }

            closeModal("mergeTableModal");
            openModal("orderPopup", mergeSourceId);
            return;
        }

        if (sourceStatus === 'checkout') {
            mergeSourceText.textContent = `Checkout: ${sourceId}`;
            closeModal("mergeTableModal");
            openModal("checkoutPopup", sourceId);
            return;
        }

        if (sourceStatus !== 'confirming') {
            alert(`Only "confirming" tables can be merged. Status is "${sourceStatus || 'unknown'}".`);
            return;
        }
    } catch (err) {
        console.error('Failed to fetch source doc:', err);
        alert('Failed to open merge modal.');
        return;
    }

    // build eligible targets
    mergeSourceText.textContent = `Merging from: ${sourceId}`;
    mergeTargetSelect.innerHTML = "";

    const eligibleTargets = currentTables.filter(t => t.id !== sourceId && t.status === 'confirming');
    if (eligibleTargets.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No eligible confirming tables";
        option.disabled = true;
        mergeTargetSelect.appendChild(option);
        if (confirmMerge) confirmMerge.disabled = true;
    } else {
        eligibleTargets.forEach(t => {
            const tableName = Array.isArray(t.uid) ? t.uid.map(u => tableMap[u] || u).join(" + ") : tableMap[t.uid] || t.uid;
            const option = document.createElement("option");
            option.value = t.id;
            option.textContent = `${tableName} (${t.id})`;
            mergeTargetSelect.appendChild(option);
        });
        if (confirmMerge) confirmMerge.disabled = false;
    }

    openModal("mergeTableModal");
}

// -----------------------
// Setup order for a specific table (starts live listener)
// -----------------------
async function setupOrderForTable(tableId) {
    try {
        const tableRef = doc(db, "tables", tableId);
        const tableSnap = await getDoc(tableRef);
        if (!tableSnap.exists()) { console.warn("Table doc not found:", tableId); return; }

        const orderId = tableSnap.data().orderId;
        if (!orderId) { console.warn("No orderId for table:", tableId); return; }

        // update globals
        activeOrderId = orderId;
        currentOrderId = orderId;

        // Update order ID display in order modal
        const orderModalOrderId = safeEl("orderModalOrderId");
        if (orderModalOrderId) {
            orderModalOrderId.textContent = `Order ID: ${orderId}`;
        }

        // stop previous listener
        if (activeOrderUnsub) { try { activeOrderUnsub(); } catch (e) {} }

        // start new listener
        activeOrderUnsub = listenToOrderUpdates(orderId);
    } catch (err) {
        console.error("Failed to setup order for table:", err);
    }
}

// -----------------------
// Populate checkout popup content with real-time updates
// -----------------------
async function populateCheckoutPopup(orderId) {
    const summaryBody = safeEl("checkoutSummaryBody");
    if (!summaryBody) return;

    // Update order ID display in checkout modal
    const checkoutModalOrderId = safeEl("checkoutModalOrderId");
    if (checkoutModalOrderId) {
        checkoutModalOrderId.textContent = `Order ID: ${orderId}`;
    }

    // Stop previous checkout listener if exists
    if (activeCheckoutUnsub) {
        try { activeCheckoutUnsub(); } catch (e) {}
        activeCheckoutUnsub = null;
    }

    try {
        // First, get the order to find the salesId
        const orderRef = doc(db, "orders", orderId);
        const orderSnap = await getDoc(orderRef);
        
        if (!orderSnap.exists()) {
            summaryBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No order data found.</td></tr>`;
            return;
        }

        const orderData = orderSnap.data();
        const salesId = orderData.salesId;

        if (!salesId) {
            summaryBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No sales record found.</td></tr>`;
            return;
        }

        // Set up real-time listener for sales document
        const salesRef = doc(db, "sales", salesId);
        activeCheckoutUnsub = onSnapshot(salesRef, (salesSnap) => {
            if (!salesSnap.exists()) {
                summaryBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No sales data found.</td></tr>`;
                return;
            }

            const salesData = salesSnap.data();
            const items = salesData.items || [];
            const itemCounts = {};

            items.forEach(it => {
                if (!itemCounts[it.id]) itemCounts[it.id] = { ...it, quantity: 1 };
                else itemCounts[it.id].quantity++;
            });

            // Discount metadata from sales
            const seniorDiscountApplied = !!salesData.seniorDiscountApplied;
            const seniorDiscountCount = salesData.seniorDiscountCount || 0;

            // Rebuild discount allocation map (same logic as confirm button)
            const discountAlloc = new Map();
            if (seniorDiscountApplied && seniorDiscountCount > 0) {
                // Sort all units by cost desc to match allocation logic
                const units = items.map((it, idx) => ({ id: it.id, name: it.name, cost: it.cost, index: idx })).sort((a, b) => b.cost - a.cost);
                const applyCount = Math.min(seniorDiscountCount, units.length);
                
                for (let i = 0; i < applyCount; i++) {
                    const u = units[i];
                    discountAlloc.set(u.id, (discountAlloc.get(u.id) || 0) + 1);
                }
            }

            // Aggregates
            let subtotalExVAT = 0;
            let vatCharged = 0;
            let vatRemoved = 0;
            let discount20Amount = 0;

            summaryBody.innerHTML = "";
            Object.values(itemCounts).forEach(item => {
                const unitExVAT = item.cost * 0.88; // remove 12% VAT
                const unitVAT = item.cost * 0.12;

                let rowExVATTotal = 0;
                let rowVATCharged = 0;
                let rowDiscount20 = 0;

                // Check how many units of this item are discounted
                const discountedUnits = discountAlloc.get(item.id) || 0;
                const normalUnits = item.quantity - discountedUnits;

                if (discountedUnits > 0) {
                    // Apply discount to N units, rest at normal price
                    const discountedUnitExVAT = unitExVAT * 0.80; // 20% off per unit
                    rowExVATTotal = (discountedUnitExVAT * discountedUnits) + (unitExVAT * normalUnits);
                    rowVATCharged = unitVAT * normalUnits; // no VAT on discounted units
                    rowDiscount20 = (unitExVAT * 0.20) * discountedUnits; // total discount for this row
                    vatRemoved += unitVAT * discountedUnits; // accumulate VAT removed
                } else {
                    rowExVATTotal = unitExVAT * item.quantity;
                    rowVATCharged = unitVAT * item.quantity;
                }

                subtotalExVAT += rowExVATTotal;
                vatCharged += rowVATCharged;
                discount20Amount += rowDiscount20;

                // Render row with inline discount if applicable
                const row = document.createElement("tr");
                if (rowDiscount20 > 0) {
                    row.innerHTML = `
                        <td>${item.name}</td>
                        <td>${item.quantity}x</td>
                        <td class="amount">(-₱${rowDiscount20.toFixed(2)}) ₱${rowExVATTotal.toFixed(2)}</td>
                    `;
                } else {
                    row.innerHTML = `<td>${item.name}</td><td>${item.quantity}x</td><td class="amount">₱${rowExVATTotal.toFixed(2)}</td>`;
                }
                summaryBody.appendChild(row);
            });

            // Footer totals based on ex-VAT subtotal
            const cs = safeEl("checkoutSubtotal");
            const cv = safeEl("checkoutVAT");
            const cvCalc = safeEl("checkoutVATCalc");
            const cd = safeEl("checkoutDiscount");
            const cdCalc = safeEl("checkoutDiscountCalc");
            const ct = safeEl("checkoutTotal");

            if (cs) cs.textContent = `₱${subtotalExVAT.toFixed(2)}`;
            if (cv) cv.textContent = `₱${vatCharged.toFixed(2)}`;
            if (cvCalc) cvCalc.textContent = (vatRemoved > 0) ? `(-₱${vatRemoved.toFixed(2)})` : '';
            if (cd) cd.textContent = (discount20Amount > 0) ? `-₱${discount20Amount.toFixed(2)}` : '₱0.00';
            if (cdCalc) cdCalc.textContent = (discount20Amount > 0) ? '(-20%)' : '';
            const totalDue = subtotalExVAT + vatCharged;
            if (ct) ct.textContent = `₱${totalDue.toFixed(2)}`;
        }, (err) => {
            console.error("Checkout listener error:", err);
            summaryBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Error loading sales data.</td></tr>`;
        });
    } catch (err) {
        console.error("Failed to populate checkout popup:", err);
        summaryBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Error loading checkout data.</td></tr>`;
    }
}

// -----------------------
// On load: ensure order popup wiring (keeps original behavior)
// -----------------------
document.addEventListener("DOMContentLoaded", () => {
    const orderPopup = safeEl("orderPopup");
    if (orderPopup) {
        orderPopup.addEventListener("click", () => {
            if (currentOrderId) {
                if (activeOrderUnsub) { try { activeOrderUnsub(); } catch (e) {} }
                activeOrderUnsub = listenToOrderUpdates(currentOrderId);
            } else {
                console.warn("[OrderSummary] No currentOrderId found when opening order popup.");
            }
        });
    }
});
