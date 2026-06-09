import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

// Mobile menu handling
const mobileMenuTrigger = document.querySelector('.mobile-menu-trigger');
const mainNav = document.getElementById('main-nav');

mobileMenuTrigger.addEventListener('click', () => {
    mainNav.classList.toggle('show');
});

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    if (!mobileMenuTrigger.contains(e.target) && !mainNav.contains(e.target)) {
        mainNav.classList.remove('show');
    }
});

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
function showNotification(title, message) {
    const modal = document.getElementById('notificationModal');
    const titleEl = document.getElementById('notificationTitle');
    const messageEl = document.getElementById('notificationMessage');
    
    if (modal && titleEl && messageEl) {
        titleEl.textContent = title;
        messageEl.textContent = message;
        modal.classList.add('show'); // ✅ use class
    }
}

function hideNotification() {
    const modal = document.getElementById('notificationModal');
    if (modal) modal.classList.remove('show'); // ✅ remove class
}
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

			showNotification("You’ve been logged out.");
			updateDropdown();

            window.location.href = "login.html";
		});

		dropdown.appendChild(profileLink);
		dropdown.appendChild(logoutLink);
	}
}