// Role-based access control for admin pages
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';

// Reuse the same Firebase config used across admin pages
const firebaseConfig = {
  apiKey: "AIzaSyAOpuKx1x0IXKZROiThWfrak1iDupk7puc",
  authDomain: "senseat-42219.firebaseapp.com",
  databaseURL: "https://senseat-42219-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "senseat-42219",
  storageBucket: "senseat-42219.firebasestorage.app",
  messagingSenderId: "375530241499",
  appId: "1:375530241499:web:960d8484c2cba69e8d3bfe"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

function normalizeRole(role){
  if (!role) return '';
  const r = String(role).toLowerCase().trim();
  if (r === 'head-chef' || r === 'headchef') return 'chef';
  return r;
}

const ALL_ADMIN_PAGES = [
  'admin-dashboard.html',
  'admin-sales.html',
  'admin-reservation.html',
  'admin-table.html',
  'admin-orders.html',
  'admin-kitchen.html',
  'admin-menu.html',
  'admin-employees.html'
];

function allowedPagesFor(role){
  const r = normalizeRole(role);
  if (r === 'admin' || r === 'manager') return ALL_ADMIN_PAGES.slice();
  if (r === 'chef' || r === 'cook') return ['admin-orders.html','admin-kitchen.html'];
  if (r === 'waiter' || r === 'cashier') return ['admin-reservation.html','admin-table.html','admin-orders.html'];
  return []; // unknown or unauthorized
}

function currentFilename(){
  try {
    const parts = window.location.pathname.split('/');
    return parts[parts.length-1] || '';
  } catch { return ''; }
}

function isAdminPageFile(file){
  return /^admin-.*\.html$/i.test(file);
}

function firstAllowedPage(role){
  const pages = allowedPagesFor(role);
  return pages[0] || 'index.html';
}

function updateSidebarVisibility(role){
  const allowed = new Set(allowedPagesFor(role));
  const links = document.querySelectorAll('.sidebar a[href]');
  links.forEach(a => {
    const href = a.getAttribute('href') || '';
    if (isAdminPageFile(href)){
      if (!allowed.has(href)) a.style.display = 'none';
      else a.style.display = '';
    }
  });
}

async function getUserRole(uid){
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) return normalizeRole(snap.data().role);
  } catch (e) {
    console.warn('[RBAC] Failed to load user role:', e);
  }
  return '';
}

function enforceAccess(role){
  const file = currentFilename();
  if (!isAdminPageFile(file)) return; // only guard admin pages
  const allowed = new Set(allowedPagesFor(role));
  if (allowed.size === 0){
    // No access at all
    window.location.replace('login.html');
    return;
  }
  if (!allowed.has(file)){
    window.location.replace(firstAllowedPage(role));
  }
}

// Wait for auth state and then apply guards
onAuthStateChanged(auth, async (user) => {
  if (!user){
    // Not logged in — let page handle or redirect to login
    window.location.replace('login.html');
    return;
  }
  const role = await getUserRole(user.uid);
  updateSidebarVisibility(role);
  enforceAccess(role);
});
