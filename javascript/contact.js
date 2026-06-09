import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

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