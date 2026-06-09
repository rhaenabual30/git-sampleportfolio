import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// --- Firebase config ---
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
const db = getFirestore(app);

const profileIcon = document.getElementById("profile");
const dropdown = document.getElementById("profile-dropdown");

let currentUser = null;

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateDropdown();
});

// re-query cards dynamically when filtering (instead of the old static NodeList)
const buttons = document.querySelectorAll('.menu-categories button');

buttons.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const category = btn.getAttribute('data-category');

        // Query current cards in DOM
        const cards = document.querySelectorAll('.menu-card');
        cards.forEach(card => {
            if (category === 'all' || card.getAttribute('data-category') === category) {
                card.style.display = "block";
            } else {
                card.style.display = "none";
            }
        });
    });
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

            alert("You’ve been logged out.");
            updateDropdown();

            window.location.href = "login.html";
        });

        dropdown.appendChild(profileLink);
        dropdown.appendChild(logoutLink);
    }
}

// --- New: load products from Firestore into the .menu-grid ---
const menuGrid = document.querySelector('.menu-grid');

function formatPrice(v) {
    return v == null ? '—' : `₱${Number(v).toFixed(2)}`;
}

function renderProductCard(docSnap) {
    const p = docSnap.data();
    const categoryName = (p.category && p.category.category_name) ? String(p.category.category_name).toLowerCase() : 'all';
    const img = p.imageUrl || p.image || "assets/images/placeholders/placeholder.png";
    const price = formatPrice(p.price);
    const servings = (p.minPax && p.maxPax) ? `${p.minPax} - ${p.maxPax}` : (p.servings || '—');
    const description = p.description || p.desc || p.shortDescription || '';
    const name = p.name || '—';

    const card = document.createElement('div');
    card.className = 'menu-card';
    card.setAttribute('data-category', categoryName);
    card.innerHTML = `
        <img src="${img}" alt="${escapeHTML(name)}">
        <h3>${escapeHTML(name)}</h3>
        <p>${escapeHTML(description)}</p>
        <div class="menu-info">
            <span class="price">${escapeHTML(price)}</span>
            <span class="servings">
                <img class="icon" src="assets/images/icons/people.png" alt="people icon"> ${escapeHTML(servings)}
            </span>
        </div>
    `;
    return card;
}

function escapeHTML(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
}

function loadProductsRealtime() {
    const productsRef = collection(db, "products");
    // you can add ordering if desired: query(productsRef, orderBy('createdAt', 'desc'))
    onSnapshot(productsRef, (snapshot) => {
        if (!menuGrid) return;
        menuGrid.innerHTML = '';
        if (snapshot.empty) {
            // show fallback message
            const p = document.createElement('p');
            p.style.color = '#888';
            p.style.padding = '20px';
            p.textContent = 'No products available.';
            menuGrid.appendChild(p);
            return;
        }

        snapshot.forEach(docSnap => {
            const card = renderProductCard(docSnap);
            menuGrid.appendChild(card);
        });
    });
}

// --- New: load categories from Firestore into .menu-categories ---
const categoriesContainer = document.querySelector('.menu-categories');

// Remove static buttons if present
if (categoriesContainer) categoriesContainer.innerHTML = "";

// Listen for category button clicks (delegated)
if (categoriesContainer) {
    categoriesContainer.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button');
        if (!btn || !categoriesContainer.contains(btn)) return;
        const category = btn.getAttribute('data-category') || 'all';
        categoriesContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Filter menu cards
        const cards = document.querySelectorAll('.menu-card');
        cards.forEach(card => {
            if (category === 'all' || card.getAttribute('data-category') === category) {
                card.style.display = "block";
            } else {
                card.style.display = "none";
            }
        });
    });
}

// Load categories from Firestore (admin-menu stores with 'name', not 'category_name')
function loadCategoriesRealtime() {
    const colRef = collection(db, "categories");
    const q = query(colRef, orderBy('name'));
    onSnapshot(q, (snap) => {
        if (!categoriesContainer) return;
        // Always start with "All"
        const buttons = [];
        buttons.push(`<button data-category="all" class="active">All</button>`);
        snap.forEach(docSnap => {
            const data = docSnap.data() || {};
            const name = (data.name || '').toString().trim();
            if (!name) return;
            const key = name.toLowerCase();
            buttons.push(`<button data-category="${escapeHTML(key)}">${escapeHTML(name)}</button>`);
        });
        categoriesContainer.innerHTML = buttons.join(' ');
        // Set "All" as active by default
        const allBtn = categoriesContainer.querySelector('button[data-category="all"]');
        if (allBtn) allBtn.classList.add('active');
    }, (err) => {
        console.error('Failed to load categories:', err);
    });
}

// --- Menu Search Functionality ---
const menuSearchInput = document.getElementById('menu-search');
if (menuSearchInput) {
    menuSearchInput.addEventListener('input', () => {
        const searchTerm = menuSearchInput.value.trim().toLowerCase();
        const activeBtn = document.querySelector('.menu-categories button.active');
        const activeCategory = activeBtn ? activeBtn.getAttribute('data-category') : 'all';

        document.querySelectorAll('.menu-card').forEach(card => {
            const name = card.querySelector('h3') ? card.querySelector('h3').textContent.trim().toLowerCase() : '';
            const cardCategory = card.getAttribute('data-category');
            // Only search by name, and only within the active category (unless "all")
            const inCategory = (activeCategory === 'all') || (cardCategory === activeCategory);
            const matches = name.includes(searchTerm);
            card.style.display = (inCategory && (searchTerm === '' || matches)) ? 'block' : 'none';
        });
    });
}

// initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // start listening for products
    loadProductsRealtime();
    loadCategoriesRealtime();
});