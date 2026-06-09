// Admin Sales JavaScript with Firebase integration

// Firebase imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import { getFirestore, collection, query, where, orderBy, getDocs, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

// Firebase config (reuse same project as other admin pages)
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

// Cached categories map: id -> name
const categoryIdToName = new Map();
let categoriesLoading = null;

// Export snapshot of last computed data
const LAST = {
  rangeLabel: '',
  filterMode: 'currently',
  // sales summary
  reservationTotals: { total: 0, completed: 0, cancelled: 0 },
  orderTotals: { totalSales: 0, totalIncome: 0, tablesCompleted: 0 },
  // chart
  dailyLabels: [],
  dailyValues: [],
  // tables
  categories: [], // [{ name, count, percentage }]
  products: [] // [{ name, count, percentage }]
};

async function ensureCategoriesLoaded() {
  if (categoryIdToName.size > 0) return; // already loaded
  if (categoriesLoading) return categoriesLoading; // in-flight
  categoriesLoading = (async () => {
    try {
      const snap = await getDocs(collection(db, 'categories'));
      categoryIdToName.clear();
      snap.forEach(docSnap => {
        const data = docSnap.data() || {};
        const name = data.name || data.category_name || 'Unknown';
        categoryIdToName.set(docSnap.id, name);
      });
    } catch (e) {
      console.warn('[Sales] Failed to load categories map:', e);
    }
  })();
  return categoriesLoading;
}

// // Function to show load and disable all buttons on load
// function showLoad() {
//   const overlayElement = document.getElementById("overlay");
//   const loadElement = document.getElementById("load");
//   const body = document.querySelector("body");

//   if (overlayElement) overlayElement.style.display = "flex";
//   if (loadElement) loadElement.style.display = "flex";
//   if (body) body.style.overflow = "hidden";
// }

// // Function to remove load
// function hideLoad() {
//   const overlayElement = document.getElementById("overlay");
//   const loadElement = document.getElementById("load");
//   const body = document.querySelector("body");

//   if (overlayElement) overlayElement.style.display = "none";
//   if (loadElement) loadElement.style.display = "none";
//   if (body) body.style.overflow = "auto";
// }

document.addEventListener('DOMContentLoaded', () => {
  wireLogoutModal();
  initFilters();
  // Initialize with default view
  handleFilterModeChange();
  wireExport();
});

function wireLogoutModal() {
  const showLogout = document.getElementById('showLogout');
  const modal = document.getElementById('logoutModal');
  const confirmBtn = document.getElementById('confirmLogout');
  const cancelBtn = document.getElementById('cancelLogout');
  if (showLogout) showLogout.addEventListener('click', (e) => { e.preventDefault(); modal.style.display = 'block'; });
  if (confirmBtn) confirmBtn.addEventListener('click', () => { window.location.href = 'login.html'; });
  if (cancelBtn) cancelBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
}

function initFilters() {
  const mode = document.getElementById('filterMode');
  const fromDate = document.getElementById('fromDate');
  const toDate = document.getElementById('toDate');
  const month = document.getElementById('month');
  const day = document.getElementById('day');
  const year = document.getElementById('year');

  // Populate month/day/year dropdowns
  month.innerHTML = '<option value="" selected>Month</option>' +
    Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}</option>`).join('');
  year.innerHTML = '<option value="" selected>Year</option>' +
    Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i).map(y => `<option value="${y}">${y}</option>`).join('');
  day.innerHTML = '<option value="" selected>Day</option>' +
    Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');

  function updateDateInputs() {
    const v = mode.value;
    const isRange = v === 'range';
    
    // Show/hide date inputs based on filter mode
    const dateElements = document.getElementsByClassName('date');
    Array.from(dateElements).forEach(element => {
      element.style.display = isRange ? 'inline-block' : 'none';
    });

    // Enable/disable the date inputs based on filter mode
    fromDate.disabled = !isRange;
    toDate.disabled = !isRange;

    // Show/hide month/day/year dropdowns (hide them for now since we're focusing on range/today)
    month.style.display = 'none';
    day.style.display = 'none';
    year.style.display = 'none';

    if (isRange) {
      // Clear previous dates
      fromDate.value = '';
      toDate.value = '';
      // Do not refresh until both dates are picked
    } else {
      // Trigger refresh for today's data
      displaySalesData();
    }
  }

  if (mode) mode.addEventListener('change', updateDateInputs);
  
  if (fromDate) fromDate.addEventListener('change', () => {
    if (mode.value !== 'range') return;
    // keep dates in order
    if (toDate.value && toDate.value < fromDate.value) toDate.value = fromDate.value;
  });
  
  if (toDate) toDate.addEventListener('change', () => {
    if (mode.value !== 'range') return;
    if (!fromDate.value) fromDate.value = toDate.value;
    if (fromDate.value > toDate.value) fromDate.value = toDate.value;
    // Filter data when both dates are selected
    if (fromDate.value && toDate.value) {
      filterSalesData('range');
    }
  });
  
  updateDateInputs();
}

// Function to handle filter mode changes
async function handleFilterModeChange() {
  const filterMode = document.getElementById('filterMode').value;
  
  if (filterMode === 'currently') {
    displaySalesData();
  } else if (filterMode === 'range') {
    // Range mode will be handled by date input changes
    const fromDate = document.getElementById('fromDate');
    const toDate = document.getElementById('toDate');
    if (fromDate.value && toDate.value) {
      await filterSalesData('range');
    }
  }
}

// Function to fetch and display sales data for "currently" (today) filter
function displaySalesData() {
  // showLoad();
  refreshSalesData();
}

async function filterSalesData(mode) {
  // showLoad();
  if (mode === "range") {
    const fromDateValue = document.getElementById('fromDate').value;
    const toDateValue = document.getElementById('toDate').value;

    if (!fromDateValue || !toDateValue) {
      // hideLoad();
      return;
    }
  }
  refreshSalesData();
}

async function refreshSalesData() {
  try {
    const { startTs, endTs } = getDateRange();

    // Get reservation data from both collections like admin-reservation.js
    const reservationTotals = await getReservationData(startTs, endTs);
    
    // Get order data like admin-orders.js  
    const orderTotals = await getOrderData(startTs, endTs);

  // Build chart series (daily or monthly depending on range)
  const chartSeries = buildChartSeriesFromDailyMap(orderTotals.dailySales, startTs, endTs);

  // Update the UI with the processed data
  updateSalesDisplay(reservationTotals, orderTotals, chartSeries);

    // Update LAST snapshot for export
    const dateFmt = (d) => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
    LAST.filterMode = document.getElementById('filterMode')?.value || 'currently';
    LAST.rangeLabel = LAST.filterMode === 'range' ? `${dateFmt(startTs)} - ${dateFmt(endTs)}` : 'Today';
    LAST.reservationTotals = { ...reservationTotals };
    LAST.orderTotals = { totalSales: orderTotals.totalSales, totalIncome: orderTotals.totalIncome, tablesCompleted: orderTotals.tablesCompleted };
    LAST.chartLabels = chartSeries.labels.slice();
    LAST.chartValues = chartSeries.values.slice();
    LAST.chartGranularity = chartSeries.granularity;
    // Convert Maps to arrays for export tables
    const catEntries = Array.from(orderTotals.categoryCounts.entries());
    const catTotal = catEntries.reduce((s, [,c]) => s + Number(c||0), 0) || 0;
    LAST.categories = catEntries
      .sort((a,b) => b[1]-a[1])
      .map(([name, count]) => ({ name, count: Number(count||0), percentage: catTotal ? ((Number(count||0)/catTotal)*100) : 0 }));
    const prodEntries = Array.from(orderTotals.productCounts.entries());
    const prodTotal = prodEntries.reduce((s, [,c]) => s + Number(c||0), 0) || 0;
    LAST.products = prodEntries
      .sort((a,b) => b[1]-a[1])
      .map(([name, count]) => ({ name, count: Number(count||0), percentage: prodTotal ? ((Number(count||0)/prodTotal)*100) : 0 }));
    
    // hideLoad();
  } catch (error) {
    console.error("Error refreshing sales data: ", error);
    // hideLoad();
  }
}

function getDateRange() {
  const mode = document.getElementById('filterMode').value;
  
  if (mode === 'range') {
    const fromDateValue = document.getElementById('fromDate').value;
    const toDateValue = document.getElementById('toDate').value;
    
    if (fromDateValue && toDateValue) {
      return {
        startTs: new Date(fromDateValue + 'T00:00:00'),
        endTs: new Date(toDateValue + 'T23:59:59')
      };
    }
  }
  
  // Default to today
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  
  return { startTs: startOfDay, endTs: endOfDay };
}

async function getReservationData(startTs, endTs) {
  const reservationTotals = { total: 0, completed: 0, cancelled: 0 };
  
  // Query both collections like admin-reservation.js
  const collections = ['reservations', 'reservation'];
  
  for (const collectionName of collections) {
    try {
      const snapshot = await getDocs(collection(db, collectionName));
      
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        
        // Check if reservation is within date range
        if (isReservationInRange(data, startTs, endTs)) {
          reservationTotals.total++;
          
          const status = (data.status || '').toLowerCase();
          if (status === 'complete') {
            reservationTotals.completed++;
          } else if (status === 'cancelled') {
            reservationTotals.cancelled++;
          }
        }
      });
    } catch (error) {
      console.warn(`Error querying ${collectionName}:`, error);
    }
  }
  
  return reservationTotals;
}

function isReservationInRange(data, startTs, endTs) {
  // Try to get timestamp from slot field first (like admin-reservation.js)
  if (data.slot) {
    const slotDate = new Date(data.slot);
    if (!isNaN(slotDate.getTime())) {
      return slotDate >= startTs && slotDate <= endTs;
    }
  }
  
  // Fallback to date/time fields
  if (data.date && data.time) {
    const dateTimeStr = `${data.date}T${data.time}`;
    const dateTime = new Date(dateTimeStr);
    if (!isNaN(dateTime.getTime())) {
      return dateTime >= startTs && dateTime <= endTs;
    }
  }
  
  // Fallback to createdAt
  if (data.createdAt && data.createdAt.seconds) {
    const createdAt = new Date(data.createdAt.seconds * 1000);
    return createdAt >= startTs && createdAt <= endTs;
  }
  
  return false;
}

async function getOrderData(startTs, endTs) {
  const orderTotals = {
    totalSales: 0,
    totalIncome: 0,
    tablesCompleted: 0,
    dailySales: new Map(),
    productCounts: new Map(),
    categoryCounts: new Map()
  };
  
  try {
    // Make sure we have category id -> name map ready
    await ensureCategoriesLoaded();
    
    // Query sales documents with status 'complete' only
    const salesQuery = query(
      collection(db, 'sales'),
      where('status', '==', 'complete'),
      orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(salesQuery);
    
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      
      // Check if sale is within date range using completedAt, timestamp, or createdAt
      const saleDate = data.completedAt ? data.completedAt.toDate() : 
                      data.timestamp ? data.timestamp.toDate() : 
                      data.createdAt ? data.createdAt.toDate() : null;
      
      if (saleDate && saleDate >= startTs && saleDate <= endTs) {
        // Add to sales total using the calculated totalAmount from sales document
        const amount = Number(data.totalAmount) || 0;
        orderTotals.totalSales += amount;
        orderTotals.totalIncome += amount; // Assuming income equals sales for now
        
        // Count completed sales (tables completed)
        orderTotals.tablesCompleted += 1;
        
        // Add to daily sales for chart
        const dateKey = saleDate.toISOString().split('T')[0];
        orderTotals.dailySales.set(dateKey, (orderTotals.dailySales.get(dateKey) || 0) + amount);
        
        // Process items for product/category counts
        if (Array.isArray(data.items)) {
          data.items.forEach(item => {
            const productName = item.name || 'Unknown Product';
            orderTotals.productCounts.set(productName, (orderTotals.productCounts.get(productName) || 0) + 1);

            // Resolve category: accept embedded object, id, or name
            let catName = 'Unknown Category';
            const catField = item.category;
            if (catField && typeof catField === 'object') {
              // Could be { category_uid, category_name } as per admin-menu
              catName = catField.category_name || catField.name || catField.title || 'Unknown Category';
              // If only uid present, map via categories collection
              const uid = catField.category_uid || catField.id;
              if ((!catName || catName === 'Unknown Category') && uid && categoryIdToName.has(uid)) {
                catName = categoryIdToName.get(uid);
              }
            } else if (typeof catField === 'string') {
              // If it's a string, it could be an id or already a name
              catName = categoryIdToName.get(catField) || catField;
            } else if (item.categoryName) {
              catName = item.categoryName;
            }

            orderTotals.categoryCounts.set(catName, (orderTotals.categoryCounts.get(catName) || 0) + 1);
          });
        }
      }
    });
  } catch (error) {
    console.error("Error querying sales:", error);
  }
  
  return orderTotals;
}

function updateSalesDisplay(reservationTotals, orderTotals, chartSeries) {
  // Update reservations summary cells
  setText('info-res-total', String(Number(reservationTotals.total || 0)));
  setText('info-res-completed', String(Number(reservationTotals.completed || 0)));
  setText('info-res-cancelled', String(Number(reservationTotals.cancelled || 0)));

  // Update sales money summary
  setText('info-sales', peso(orderTotals.totalSales));
  //setText('info-income', peso(orderTotals.totalIncome));

  // Update tables completed
  setText('info-tables-completed', String(Number(orderTotals.tablesCompleted || 0)));

  // Render chart with selected granularity series
  renderSalesChart(chartSeries);
  
  // Update product and category tables
  updateProductCategoryTables(orderTotals.productCounts, orderTotals.categoryCounts);
}

function updateProductCategoryTables(productCounts, categoryCounts) {
  // Categories table
  const catBody = document.querySelector('#categoryTable tbody');
  const catFoot = document.querySelector('#categoryTable tfoot');
  if (catBody && catFoot) {
    const catArr = Array.from(categoryCounts.entries()).sort(([,a],[,b]) => Number(b)-Number(a));
    const catTotal = catArr.reduce((s,[,c]) => s + Number(c||0), 0);
    if (catArr.length === 0) {
      catBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#888;">No data</td></tr>';
      catFoot.innerHTML = '<tr><td><strong>Total</strong></td><td><strong>0</strong></td><td><strong>0%</strong></td></tr>';
    } else {
      catBody.innerHTML = catArr.map(([name,count]) => {
        const pct = catTotal ? ((Number(count||0)/catTotal)*100).toFixed(1) : '0.0';
        return `<tr><td>${escapeHtml(name)}</td><td>${Number(count||0)}</td><td>${pct}%</td></tr>`;
      }).join('');
      catFoot.innerHTML = `<tr><td><strong>Total</strong></td><td><strong>${catTotal}</strong></td><td><strong>100%</strong></td></tr>`;
    }
  }

  // Products table
  const prodBody = document.querySelector('#productTable tbody');
  const prodFoot = document.querySelector('#productTable tfoot');
  if (prodBody && prodFoot) {
    const prodArr = Array.from(productCounts.entries()).sort(([,a],[,b]) => Number(b)-Number(a));
    const prodTotal = prodArr.reduce((s,[,c]) => s + Number(c||0), 0);
    if (prodArr.length === 0) {
      prodBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#888;">No data</td></tr>';
      prodFoot.innerHTML = '<tr><td><strong>Total</strong></td><td><strong>0</strong></td><td><strong>0%</strong></td></tr>';
    } else {
      prodBody.innerHTML = prodArr.map(([name,count]) => {
        const pct = prodTotal ? ((Number(count||0)/prodTotal)*100).toFixed(1) : '0.0';
        return `<tr><td>${escapeHtml(name)}</td><td>${Number(count||0)}</td><td>${pct}%</td></tr>`;
      }).join('');
      prodFoot.innerHTML = `<tr><td><strong>Total</strong></td><td><strong>${prodTotal}</strong></td><td><strong>100%</strong></td></tr>`;
    }
  }
}

function renderSalesChart(series) {
  const ctx = document.getElementById('sales-chart').getContext('2d');
  
  if (window.salesChart) window.salesChart.destroy();

  const label = series.granularity === 'monthly' ? 'Monthly Sales' : 'Daily Sales';
  const xTitle = series.granularity === 'monthly' ? 'Month' : 'Date';

  window.salesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [{
        label,
        data: series.values,
        borderColor: 'lightgreen',
        backgroundColor: 'lightgreen',
        fill: false,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: { title: { display: true, text: xTitle } },
        y: { title: { display: true, text: 'Sales (₱)' }, beginAtZero: true }
      }
    }
  });
}

function buildChartSeriesFromDailyMap(dailySalesMap, startTs, endTs){
  const rangeDays = Math.max(1, Math.floor((endTs - startTs) / (1000*60*60*24)) + 1);
  const monthly = rangeDays > 31;
  if (!monthly){
    // Daily labels (MM/DD)
    const labels = [];
    const values = [];
    const cur = new Date(startTs.getFullYear(), startTs.getMonth(), startTs.getDate());
    const end = new Date(endTs.getFullYear(), endTs.getMonth(), endTs.getDate());
    while (cur <= end){
      const y = cur.getFullYear();
      const m = String(cur.getMonth()+1).padStart(2,'0');
      const d = String(cur.getDate()).padStart(2,'0');
      const key = `${y}-${m}-${d}`;
      labels.push(`${m}/${d}`);
      values.push(Number(dailySalesMap.get(key) || 0));
      cur.setDate(cur.getDate()+1);
    }
    return { granularity: 'daily', labels, values };
  }
  // Monthly buckets: aggregate daily map into YYYY-MM -> sum
  const monthMap = new Map();
  for (const [key, val] of dailySalesMap.entries()){
    // key is YYYY-MM-DD
    const ym = key.slice(0,7); // YYYY-MM
    monthMap.set(ym, (monthMap.get(ym) || 0) + Number(val||0));
  }
  // Build ordered list from start month to end month
  const labels = [];
  const values = [];
  const curM = new Date(startTs.getFullYear(), startTs.getMonth(), 1);
  const endM = new Date(endTs.getFullYear(), endTs.getMonth(), 1);
  while (curM <= endM){
    const y = curM.getFullYear();
    const m = String(curM.getMonth()+1).padStart(2,'0');
    const ym = `${y}-${m}`;
    labels.push(`${m}/${String(y).slice(-2)}`);
    values.push(Number(monthMap.get(ym) || 0));
    curM.setMonth(curM.getMonth()+1);
  }
  return { granularity: 'monthly', labels, values };
}

function renderTables({ tabs, categories, products }) {
  const tabsTbody = document.querySelector('#tabsTable tbody');
  if (tabsTbody) {
    const safeTabs = Array.isArray(tabs) ? tabs : [];
    if (!safeTabs.length) {
      tabsTbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#888;">No data</td></tr>`;
    } else {
      tabsTbody.innerHTML = safeTabs.map(t => `<tr><td><p>${escapeHtml(t.name)}</p></td><td><p id="sold">${t.quantity}</p></td><td><p>${t.percent}%</p></td></tr>`).join('');
    }
  }

  const catTbody = document.querySelector('#categoryTable tbody');
  const catTfoot = document.querySelector('#categoryTable tfoot');
  if (catTbody && catTfoot) {
    const safeCats = Array.isArray(categories) ? categories : [];
    const catTotal = safeCats.reduce((s, c) => s + (Number(c.quantity) || 0), 0);
    if (!safeCats.length) catTbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#888;">No data</td></tr>`;
    else catTbody.innerHTML = safeCats.map(c => `<tr><td>${escapeHtml(c.name)}</td><td>${c.quantity}</td><td>${c.percent}%</td></tr>`).join('');
    catTfoot.innerHTML = `<tr><td><strong>Total</strong></td><td><strong>${catTotal}</strong></td><td><strong>${safeCats.length ? '100%' : '0%'}</strong></td></tr>`;
  }

  const prodTbody = document.querySelector('#productTable tbody');
  const prodTfoot = document.querySelector('#productTable tfoot');
  if (prodTbody && prodTfoot) {
    const safeProds = Array.isArray(products) ? products : [];
    const prodTotal = safeProds.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    if (!safeProds.length) prodTbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#888;">No data</td></tr>`;
    else prodTbody.innerHTML = safeProds.map(p => `<tr><td>${escapeHtml(p.name)}</td><td>${p.quantity}</td><td>${p.percent}%</td></tr>`).join('');
    prodTfoot.innerHTML = `<tr><td><strong>Total</strong></td><td><strong>${prodTotal}</strong></td><td><strong>${safeProds.length ? '100%' : '0%'}</strong></td></tr>`;
  }
}

function wireExport() {
  const btn = document.getElementById('export');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const lines = [];
    const title = 'Sales Report';
    const subtitle = LAST.rangeLabel ? `Range: ${LAST.rangeLabel}` : '';
    // Header
    lines.push(title);
    if (subtitle) lines.push(subtitle);
    lines.push('');

    // Summary section
    lines.push('Summary');
    lines.push('Metric,Value');
    lines.push(`Total Reservations,${LAST.reservationTotals.total||0}`);
    lines.push(`Reservations Completed,${LAST.reservationTotals.completed||0}`);
    lines.push(`Reservations Cancelled,${LAST.reservationTotals.cancelled||0}`);
    lines.push(`Total Sales,${Number(LAST.orderTotals.totalSales||0).toFixed(2)}`);
    //lines.push(`Total Income,${Number(LAST.orderTotals.totalIncome||0).toFixed(2)}`);
    lines.push(`Tables Completed,${LAST.orderTotals.tablesCompleted||0}`);
    lines.push('');

    // Chart data section (daily or monthly)
    const hasChart = Array.isArray(LAST.chartLabels) && LAST.chartLabels.length > 0;
    if (hasChart) {
      const header = LAST.chartGranularity === 'monthly' ? 'Monthly Sales' : 'Daily Sales';
      const xHeader = LAST.chartGranularity === 'monthly' ? 'Month' : 'Date';
      lines.push(header);
      lines.push([xHeader,'Sales'].join(','));
      for (let i=0;i<LAST.chartLabels.length;i++){
        lines.push([LAST.chartLabels[i], Number(LAST.chartValues[i]||0).toFixed(2)].join(','));
      }
      lines.push('');
    }

    // Categories section
    lines.push('Orders by Category');
    lines.push('Category,Quantity,Percentage');
    LAST.categories.forEach(c => {
      lines.push([csvCell(c.name), c.count, `${(c.percentage||0).toFixed(2)}%`].join(','));
    });
    // total line
    const catTotal = LAST.categories.reduce((s,c)=>s+(Number(c.count)||0),0);
    if (LAST.categories.length) lines.push([csvCell('Total'), catTotal, '100%'].join(','));
    lines.push('');

    // Products section
    lines.push('Orders by Product');
    lines.push('Product,Quantity,Percentage');
    LAST.products.forEach(p => {
      lines.push([csvCell(p.name), p.count, `${(p.percentage||0).toFixed(2)}%`].join(','));
    });
    const prodTotal = LAST.products.reduce((s,p)=>s+(Number(p.count)||0),0);
    if (LAST.products.length) lines.push([csvCell('Total'), prodTotal, '100%'].join(','));
    lines.push('');

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fileStamp = new Date().toISOString().slice(0,10);
    a.href = url; a.download = `sales-report-${fileStamp}.csv`; a.click();
    URL.revokeObjectURL(url);
  });
}

// Helpers
function peso(n) { const v = Number(n) || 0; return '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function setText(id, val){ const el = document.getElementById(id); if (el) el.textContent = val; }
function text(id){ const el = document.getElementById(id); return el ? el.textContent : ''; }
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function csvCell(s){
  const v = String(s ?? '');
  if (v.includes(',') || v.includes('"') || v.includes('\n')){
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

// Range helpers
function formatYMD(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function dayBounds(dateStr){
  // dateStr: YYYY-MM-DD
  const start = new Date(`${dateStr}T00:00:00.000`);
  const end = new Date(`${dateStr}T23:59:59.999`);
  const startSlot = `${dateStr}T00:00`;
  const endSlot = `${dateStr}T23:59`;
  return { start, end, startSlot, endSlot };
}

function rangeFromFilters(){
  const mode = document.getElementById('filterMode');
  const fromDate = document.getElementById('fromDate');
  const toDate = document.getElementById('toDate');
  
  if (mode && mode.value === 'range' && fromDate && toDate && fromDate.value && toDate.value){
    const startDay = dayBounds(fromDate.value);
    const endDay = dayBounds(toDate.value);
    return {
      startTs: startDay.start,
      endTs: endDay.end,
      startSlot: startDay.startSlot,
      endSlot: endDay.endSlot
    };
  }
  
  // Default to today
  const today = formatYMD(new Date());
  const tb = dayBounds(today);
  return { startTs: tb.start, endTs: tb.end, startSlot: tb.startSlot, endSlot: tb.endSlot };
}

async function refreshSales(){
  try {
    // Ensure categories are loaded for name resolution
    await ensureCategoriesLoaded();
    const { startTs, endTs, startSlot, endSlot } = rangeFromFilters();

    // Reservations: scan both 'reservations' and 'reservation' collections
    // Use the same slot computation as admin-reservation.js and filter by the selected range client-side
    const resTotals = { total: 0, completed: 0, cancelled: 0 };
    const resCollections = ['reservations', 'reservation'];
    for (const colName of resCollections) {
      try {
        const snap = await getDocs(collection(db, colName));
        snap.forEach(docSnap => {
          const d = docSnap.data() || {};
          // Compute slot string same way as admin-reservation.js
          const slotStr = computeSlotStringFromDoc(d);
          let inRange = false;
          if (slotStr && slotStr.includes('T')) {
            // Lexicographic compare works for YYYY-MM-DDTHH:MM formatted strings
            inRange = (slotStr >= startSlot && slotStr <= endSlot);
          } else if (d.createdAt && d.createdAt.seconds) {
            const created = new Date(d.createdAt.seconds * 1000);
            inRange = (created >= startTs && created <= endTs);
          }
          if (!inRange) return;

          resTotals.total += 1;
          const status = String(d.status || '').toLowerCase();
          if (status === 'complete') resTotals.completed += 1;
          else if (status === 'cancelled') resTotals.cancelled += 1;
        });
      } catch (e) {
        console.warn('[Sales] Reservation scan failed for', colName, 'continuing:', e);
      }
    }

    // Sales: query sales documents with status 'complete' only
    const salesMap = new Map();
    const sQueries = [
      query(collection(db, 'sales'), where('status', '==', 'complete'), where('timestamp','>=', startTs), where('timestamp','<=', endTs), orderBy('timestamp')),
      query(collection(db, 'sales'), where('status', '==', 'complete'), where('createdAt','>=', startTs), where('createdAt','<=', endTs), orderBy('createdAt')),
      query(collection(db, 'sales'), where('status', '==', 'complete'), where('completedAt','>=', startTs), where('completedAt','<=', endTs), orderBy('completedAt'))
    ];
    
    for (const q of sQueries){
      try {
        const snap = await getDocs(q);
        snap.forEach(docSnap => { 
          salesMap.set(docSnap.id, docSnap.data() || {}); 
        });
      } catch (e) {
        // If query fails (e.g., missing index/field), continue with what we have
        console.warn('[Sales] Sales query failed for a path, continuing:', e);
      }
    }

    let totalSales = 0;
    let tablesCompleted = 0;
    // Aggregations for chart and tables
    const productCounts = new Map(); // name -> qty
    const categoryCounts = new Map(); // category -> qty
    const dailySales = new Map(); // 'YYYY-MM-DD' -> sum

    for (const d of salesMap.values()){
      const amt = Number(d.totalAmount || 0);
      if (!isNaN(amt)) totalSales += amt;

      // Prefer completedAt, then timestamp, then createdAt for date
      const ts = (d.completedAt && typeof d.completedAt.toDate === 'function') ? d.completedAt.toDate() : 
                 (d.timestamp && typeof d.timestamp.toDate === 'function') ? d.timestamp.toDate() : 
                 (d.createdAt && typeof d.createdAt.toDate === 'function') ? d.createdAt.toDate() : null;
      if (ts) {
        const y = ts.getFullYear();
        const m = String(ts.getMonth()+1).padStart(2,'0');
        const day = String(ts.getDate()).padStart(2,'0');
        const key = `${y}-${m}-${day}`;
        dailySales.set(key, (dailySales.get(key) || 0) + (isNaN(amt) ? 0 : amt));
      }

      // All sales documents queried have status 'complete', so count all
      tablesCompleted += 1;

      // Aggregate items for products/categories
      const items = Array.isArray(d.items) ? d.items : [];
      // Count items by id or name
      const localCounts = new Map();
      for (const it of items){
        const key = it.id || it.name || JSON.stringify(it);
        localCounts.set(key, (localCounts.get(key) || 0) + 1);
      }
      // Fold into global product counts by display name
      for (const it of items){
        const name = it.name || it.id || 'Unknown';
        const key = it.id || it.name || JSON.stringify(it);
        const qty = localCounts.get(key) || 1;
        // Only add once per unique key for this order to avoid double-adding; then reset to 0 to skip next
        if (localCounts.get(key) !== 0){
          productCounts.set(name, (productCounts.get(name) || 0) + qty);
          localCounts.set(key, 0);
        }
        const cat = getItemCategory(it);
        let catName = 'Unknown';
        if (cat && typeof cat === 'object') {
          catName = cat.category_name || cat.name || 'Unknown';
          const uid = cat.category_uid || cat.id;
          if ((!catName || catName === 'Unknown') && uid && categoryIdToName.has(uid)) catName = categoryIdToName.get(uid);
        } else if (typeof cat === 'string') {
          catName = categoryIdToName.get(cat) || cat;
        }
        if (catName){
          categoryCounts.set(catName, (categoryCounts.get(catName) || 0) + 1);
        }
      }
    }

    // For now, income equals sales (no COGS data available)
    const totalIncome = totalSales;

    // Build chart dataset across the selected date range (daily buckets)
    const chartData = buildChartData(dailySales, startTs, endTs);

    // Build category/product tables with percentages
    const productsArr = toPercentArray(productCounts);
    const categoriesArr = toPercentArray(categoryCounts);

    renderSalesSummary({
      reservationsTotal: resTotals.total,
      reservationsCompleted: resTotals.completed,
      reservationsCancelled: resTotals.cancelled,
      totalSales,
      totalIncome,
      tablesCompleted
    });
    renderChart(chartData);
    renderTables({ tabs: [], categories: categoriesArr, products: productsArr });

    // Update LAST snapshot for export (legacy path)
    LAST.filterMode = document.getElementById('filterMode')?.value || 'currently';
    const dateFmt = (d) => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
    LAST.rangeLabel = LAST.filterMode === 'range' ? `${dateFmt(startTs)} - ${dateFmt(endTs)}` : 'Today';
    LAST.reservationTotals = { total: resTotals.total, completed: resTotals.completed, cancelled: resTotals.cancelled };
    //LAST.orderTotals = { totalSales, totalIncome, tablesCompleted };
    LAST.dailyLabels = chartData.labels;
    LAST.dailyValues = chartData.values;
    LAST.categories = categoriesArr.map(c => ({ name: c.name, count: c.quantity, percentage: c.percent }));
    LAST.products = productsArr.map(p => ({ name: p.name, count: p.quantity, percentage: p.percent }));
    
  } catch (err) {
    console.error('[Sales] Failed to refresh metrics:', err);
    // On error, clear UI to safe defaults
    renderSalesSummary({
      reservationsTotal: 0,
      reservationsCompleted: 0,
      reservationsCancelled: 0,
      totalSales: 0,
      totalIncome: 0,
      tablesCompleted: 0
    });
    renderChart({ labels: [], values: [] });
    renderTables({ tabs: [], categories: [], products: [] });
  }
}

// Mirror the slot computation from admin-reservation.js
function computeSlotStringFromDoc(data){
  if (data && typeof data.slot === 'string' && data.slot.includes('T')) return data.slot;
  const date = data?.date || '';
  const time = data?.time || '';
  if (!date || !time) return '';
  return `${date}T${time}`;
}

// Build chart data across continuous days between start and end
function buildChartData(dailySalesMap, startTs, endTs){
  const labels = [];
  const values = [];
  // Normalize to local midnight for iteration
  const cur = new Date(startTs.getFullYear(), startTs.getMonth(), startTs.getDate());
  const end = new Date(endTs.getFullYear(), endTs.getMonth(), endTs.getDate());
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth()+1).padStart(2,'0');
    const d = String(cur.getDate()).padStart(2,'0');
    const key = `${y}-${m}-${d}`;
    labels.push(`${m}/${d}`);
    values.push(Number(dailySalesMap.get(key) || 0));
    cur.setDate(cur.getDate()+1);
  }
  return { labels, values };
}

// Turn a Map(name -> qty) into a sorted array with percentages
function toPercentArray(countsMap){
  const entries = Array.from(countsMap.entries()).map(([name, quantity]) => ({ name, quantity: Number(quantity)||0 }));
  entries.sort((a,b) => b.quantity - a.quantity);
  const total = entries.reduce((s,e)=>s+e.quantity,0) || 0;
  return entries.map(e => ({ name: e.name, quantity: e.quantity, percent: total ? Math.round((e.quantity/total)*100) : 0 }));
}

function getItemCategory(it){
  return it.category || it.cat || it.type || it.categoryName || 'Unknown';
}
