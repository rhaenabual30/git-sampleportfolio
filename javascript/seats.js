// seats.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Mobile menu handling
const mobileMenuTrigger = document.querySelector('.mobile-menu-trigger');
const mainNav = document.getElementById('main-nav');

// Toggle mobile menu
mobileMenuTrigger.addEventListener('click', () => {
    mainNav.classList.toggle('show');
});

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    if (!mobileMenuTrigger.contains(e.target) && !mainNav.contains(e.target)) {
        mainNav.classList.remove('show');
    }
});

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

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbFS = getFirestore(app); // ✅ Firestore ready if needed

// --- Profile dropdown logic ---
const profileIcon = document.getElementById("profile");
const dropdown = document.getElementById("profile-dropdown");

let currentUser = null;

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateDropdown();
});

profileIcon.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
});

document.addEventListener("click", () => {
    dropdown.style.display = "none";
});

function updateDropdown() {
    dropdown.innerHTML = "";

    if (!currentUser) {
        const loginLink = document.createElement("a");
        loginLink.href = "login.html";
        loginLink.textContent = "LOGIN";
        dropdown.appendChild(loginLink);
    } else {
        const profileLink = document.createElement("a");
        profileLink.href = "profile.html";
        profileLink.textContent = "PROFILE";

        const logoutLink = document.createElement("a");
        logoutLink.href = "#";
        logoutLink.textContent = "LOGOUT";
        logoutLink.addEventListener("click", async (e) => {
            e.preventDefault();
            await signOut(auth);
            showNotification('Logged Out', "You've been logged out.");
            updateDropdown();
        });

        dropdown.appendChild(profileLink);
        dropdown.appendChild(logoutLink);
    }
}


// --- Ensure tableMap exists (fallback) ---
const tableMap = (typeof window !== 'undefined' && window.tableMap) ? window.tableMap : {
  "433E2738": "IN1",
  "D3191A38": "IN2"
  // add more uid: tableName pairs as needed
};

// Helper to set image safely (reuse if already defined)
function setTableImage(imgEl, occupied) {
    if (!imgEl) return;
    imgEl.src = occupied
      ? "assets/images/tables/occupied.png"
      : "assets/images/tables/available.png";
}

// Compute and display counts based on current DOM images
function updateSeatStatusCounts() {
    try {
        const tables = document.querySelectorAll('.restaurant-layout .table');
        let total = 0;
        let occupied = 0;
        tables.forEach(t => {
            total += 1;
            const img = t.querySelector('img');
            if (img) {
                const src = img.getAttribute('src') || img.src || '';
                if (src.endsWith('occupied.png') || src.includes('/tables/occupied.png')) {
                    occupied += 1;
                }
            }
        });
        const available = Math.max(0, total - occupied);
        const occEl = document.querySelector('.occupation-status');
        const availEl = document.querySelector('.availability-status');
        const restEl = document.querySelector('.restaurant-status');
        if (occEl) occEl.textContent = `${occupied} ${occupied === 1 ? 'Table' : 'Tables'} Occupied`;
        if (availEl) availEl.textContent = `${available} ${available === 1 ? 'Table' : 'Tables'} Available`;

        // Update restaurant overall status based on occupancy ratio
        if (restEl && total > 0) {
            const ratio = occupied / total;
            let label = 'Normal';
            if (ratio >= 0.8) label = 'Busy';
            else if (ratio >= 0.5) label = 'Moderate';
            else label = 'Normal';
            restEl.textContent = label;
            // Optional class toggle for styling emphasis
            if (label === 'Busy') restEl.classList.add('alert');
            else restEl.classList.remove('alert');
        }
    } catch (e) {
        console.warn('Failed to update seat status counts:', e);
    }
}

// Firestore listener: watch 'tables' collection and update IN1/IN2 images
// Only consider a table UID occupied if the document containing that UID has status === 'ordering'
const tablesCol = collection(dbFS, "tables");
onSnapshot(tablesCol, (snapshot) => {
    try {
        const occupiedUIDs = new Set();

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Only include UIDs from documents with status === 'ordering'
            if (data?.status === 'ordering' || data?.status === 'checkout') {
                const uidField = data.uid;
                if (Array.isArray(uidField)) {
                    uidField.forEach(u => { if (u) occupiedUIDs.add(String(u)); });
                } else if (uidField) {
                    occupiedUIDs.add(String(uidField));
                }
            }
        });

        // Debug: show which UIDs are counted as occupied (ordering status)
        console.log('Occupied UIDs (status=ordering):', Array.from(occupiedUIDs));

        // Update each mapped table image
        Object.entries(tableMap).forEach(([uid, tableName]) => {
            const occupied = occupiedUIDs.has(uid);
            const imgEl = document.querySelector(`#${tableName} img`);
            setTableImage(imgEl, occupied);
        });

        // After updating images, refresh the counts
        updateSeatStatusCounts();
    } catch (err) {
        console.error("Error processing tables snapshot:", err);
    }
}, (error) => {
    console.error("Error listening to Firestore 'tables' collection:", error);
});

// Initialize counts on load using default images
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateSeatStatusCounts);
} else {
    updateSeatStatusCounts();
}
