import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getFirestore, collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Firebase config (reuse same project)
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

// Table UID -> display name mapping (same mapping used in admin-table.js)
const tableMap = {
    "433E2738": "IN1",
    "D3191A38": "IN2"
};

// Details & generic modals
const detailsModal = document.getElementById("reservationDetailsModal");
const detailsBody = document.getElementById("reservationDetailsBody");
const closeDetailsBtn = document.getElementById("closeReservationDetails");
const infoModal = document.getElementById("adminInfoModal");
const infoText = document.getElementById("adminInfoText");
const infoOk = document.getElementById("adminInfoOk");
const confirmModal = document.getElementById("adminConfirmModal");
const confirmText = document.getElementById("adminConfirmText");
const confirmOk = document.getElementById("adminConfirmOk");
const confirmCancel = document.getElementById("adminConfirmCancel");

////////////
// Modals //
////////////

function showInfo(message) {
	infoText.textContent = message;
	infoModal.style.display = "block";
}
// --- Modal System ---
function showNotification(title, message) {
    const modal = document.getElementById('notificationModal');
    const titleEl = document.getElementById('notificationTitle');
    const messageEl = document.getElementById('notificationMessage');
    
    if (modal && titleEl && messageEl) {
        titleEl.textContent = title;
        messageEl.textContent = message;
        modal.classList.add('show');
    }
}

function hideNotification() {
    const modal = document.getElementById('notificationModal');
    if (modal) modal.classList.remove('show');
}

// Initialize modal listeners
document.addEventListener('DOMContentLoaded', () => {
    const notificationOk = document.getElementById('notificationOk');
    if (notificationOk) {
        notificationOk.addEventListener('click', hideNotification);
    }
    
    const notificationModal = document.getElementById('notificationModal');
    if (notificationModal) {
        notificationModal.addEventListener('click', (e) => {
            if (e.target === notificationModal) {
                hideNotification();
            }
        });
    }
});
function hideInfo() { infoModal.style.display = "none"; }
infoOk.addEventListener("click", hideInfo);

function showConfirm(message) {
	return new Promise((resolve) => {
		confirmText.textContent = message;
		confirmModal.style.display = "block";
		const onOk = () => { cleanup(); resolve(true); };
		const onCancel = () => { cleanup(); resolve(false); };
		function cleanup() {
			confirmOk.removeEventListener("click", onOk);
			confirmCancel.removeEventListener("click", onCancel);
			confirmModal.style.display = "none";
		}
		confirmOk.addEventListener("click", onOk);
		confirmCancel.addEventListener("click", onCancel);
	});
}

function openAddModal() {
	addModal.style.display = "block";
}

function closeAddModal() {
	addModal.style.display = "none";
	addForm.reset();
}

// modal close wiring for order details
function attachOrderDetailsClose() {
    const closeBtn = document.getElementById("closeOrderDetails");
    if (!closeBtn) return;
    closeBtn.addEventListener("click", () => {
        const modal = document.getElementById("orderDetailsModal");
        if (modal) modal.style.display = "none";
    });
}

// Time
function formatTimestampToDateTime(ts) {
    if (!ts) return { date: "—", time: "—" };
    const d = (typeof ts.toDate === "function") ? ts.toDate() : new Date(ts);
    return {
        date: d.toLocaleDateString(),
        time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
}

///////////////////
// Render Orders //
///////////////////

// Constants
const ALLOWED_STATUSES = new Set(["placed", "preparing", "served", "complete"]);
const NO_ORDERS_HTML = `<tr><td colspan="7" style="text-align:center;color:#888;padding:20px;">No orders.</td></tr>`;
const DINE_TYPE = "DINE IN";
const CURRENCY = "₱";

// Global state for filtering
let allOrders = [];
let currentFilter = "";

function renderOrdersSnapshot(rowsEl, snapshot) {
    rowsEl.innerHTML = "";
    if (!snapshot || snapshot.empty) {
        rowsEl.innerHTML = NO_ORDERS_HTML;
        return;
    }

    // Store all orders in global state
    allOrders = [];
    snapshot.forEach(orderDoc => {
        const data = orderDoc.data() || {};
        const status = normalizeStatus(data.status);

        if (ALLOWED_STATUSES.has(status)) {
            allOrders.push({ id: orderDoc.id, data, status });
        }
    });

    // Apply current filter
    applyFilter();
}

///////////////////
// Helper Methods //
///////////////////

function normalizeStatus(statusRaw) {
    return String(statusRaw || "—").toLowerCase();
}

function createOrderRow(orderId, data, status) {
    const orderTotal = data.totalAmount ?? 0;
    const { tableName, tableUidDisplay } = formatTableInfo(data.tableId);
    const summary = formatOrderSummary(data.items);
    const { date, time } = formatTimestampToDateTime(data.timestamp || data.createdAt);

    const row = document.createElement("tr");
    row.setAttribute("data-doc-id", orderId);
    row.innerHTML = `
        <td class="order-id-cell" title="${orderId}">${orderId}</td>
        <td>${tableName}</td>
        <td>${tableUidDisplay}</td>
        <td>${summary}</td>
        <td>${CURRENCY}${orderTotal.toFixed(2)}</td>
        <td>${DINE_TYPE}</td>
        <td>${date}</td>
        <td>${time}</td>
        <td><span class="badge ${status}">${status.toUpperCase()}</span></td>
        <td><img src="assets/images/icons/more.png" class="icon more-btn" data-id="${orderId}"></td>
    `;

    row.querySelector(".more-btn").dataset.items = JSON.stringify(data.items || []);
    return row;
}

function formatTableInfo(rawTableField) {
    const tableUids = Array.isArray(rawTableField)
        ? rawTableField.filter(Boolean)
        : (rawTableField ? [rawTableField] : []);

    return {
        tableName: tableUids.length ? tableUids.map(u => tableMap[u] || u).join(" + ") : "—",
        tableUidDisplay: tableUids.length ? tableUids.join(", ") : "—"
    };
}

function formatOrderSummary(items) {
    if (!Array.isArray(items) || !items.length) return "—";
    return items
        .map(i => i.name)
        .slice(0, 2)
        .join(", ") + (items.length > 2 ? ` +${items.length - 2} more` : "");
}

function attachMoreHandlers(rowsEl) {
    rowsEl.querySelectorAll(".more-btn").forEach(btn => {
        btn.onclick = (e) => {
            const id = e.currentTarget.dataset.id;
            const items = JSON.parse(e.currentTarget.dataset.items || "[]");
            showOrderDetails(id, items);
        };
    });
}

function showOrderDetails(orderId, items) {
    const detailsBody = document.getElementById("orderDetailsBody");
    if (!detailsBody) {
        alert(`Order: ${orderId}`);
        return;
    }

    const aggregatedItems = aggregateItems(items);
    const itemsHtml = aggregatedItems.length
        ? aggregatedItems.map(it => {
            const qty = it.quantity || 1;
            const price = (it.cost || 0).toFixed(2);
            return `<div style="display:flex;justify-content:space-between;">
                        <div><strong>${it.name}</strong></div>
                        <div>${CURRENCY}${price} ×${qty}</div>
                    </div>`;
        }).join("")
        : "<div>No items</div>";

    detailsBody.innerHTML = `
        <div><strong>Order ID:</strong> ${orderId}</div>
        <div style="margin-top:8px;"><strong>Items:</strong></div>
        ${itemsHtml}
    `;

    const modal = document.getElementById("orderDetailsModal");
    if (modal) modal.style.display = "block";
}

function aggregateItems(items) {
    const itemCounts = {};
    items.forEach(it => {
        const key = it.id || it.name || JSON.stringify(it);
        if (!itemCounts[key]) itemCounts[key] = { ...it, quantity: 1 };
        else itemCounts[key].quantity++;
    });
    return Object.values(itemCounts);
}

function subscribeOrders() {
    const rowsEl = document.getElementById("orders-rows");
    if (!rowsEl) return console.warn("[subscribeOrders] #orders-rows not found");

    const ordersQuery = query(collection(db, "orders"), orderBy("timestamp", "desc"));
    onSnapshot(ordersQuery, snapshot => {
        renderOrdersSnapshot(rowsEl, snapshot);
    }, err => {
        console.error("Failed to load orders snapshot:", err);
        rowsEl.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#c00;padding:12px;">Error loading orders.</td></tr>`;
    });
}

// Apply filter to orders
function applyFilter() {
    const rowsEl = document.getElementById("orders-rows");
    if (!rowsEl) return;

    rowsEl.innerHTML = "";

    const filteredOrders = currentFilter
        ? allOrders.filter(order => 
            order.id.toLowerCase().includes(currentFilter.toLowerCase())
          )
        : allOrders;

    if (filteredOrders.length === 0) {
        rowsEl.innerHTML = currentFilter
            ? `<tr><td colspan="10" style="text-align:center;color:#888;padding:20px;">No orders found matching "${currentFilter}".</td></tr>`
            : NO_ORDERS_HTML;
        return;
    }

    filteredOrders.forEach(({ id, data, status }) => {
        const row = createOrderRow(id, data, status);
        rowsEl.appendChild(row);
    });

    attachMoreHandlers(rowsEl);
}

// Setup search functionality
function setupSearch() {
    const searchInput = document.getElementById("orderSearchInput");
    const searchBtn = document.getElementById("orderSearchBtn");
    const clearBtn = document.getElementById("orderClearBtn");

    if (!searchInput || !searchBtn || !clearBtn) return;

    // Real-time filtering as user types
    searchInput.addEventListener("input", () => {
        currentFilter = searchInput.value.trim();
        applyFilter();
    });

    // Search button click (for consistency)
    searchBtn.addEventListener("click", () => {
        currentFilter = searchInput.value.trim();
        applyFilter();
    });

    // Enter key in search input
    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            currentFilter = searchInput.value.trim();
            applyFilter();
        }
    });

    // Clear button click
    clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        currentFilter = "";
        applyFilter();
    });
}

/////////////
// On Load //
/////////////
document.addEventListener("DOMContentLoaded", () => {
    subscribeOrders();
    attachOrderDetailsClose();
    setupSearch();
});