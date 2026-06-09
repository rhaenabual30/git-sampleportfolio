import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

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

// Listen for login state changes
// onAuthStateChanged(auth, async (user) => {
// 	if (user) {
// 		// User is logged in
// 		console.log("User is logged in:", user.email);

// 		window.location.href = "index.html";
// 	} else {
// 		// No user logged in
// 		console.log("No user logged in.");
// 	}
// });

function hideNotification() {
    const modal = document.getElementById('notificationModal');
    if (modal) modal.classList.remove('show');
}

// Birth date function
function populateYears(selectedYear = 2000) {
    const yearSelect = document.getElementById("birth-year");
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 1900; y--) {
        const option = document.createElement("option");
        option.value = y;
        option.textContent = y;
        if (y === selectedYear) option.selected = true;
        yearSelect.appendChild(option);
    }
}

function populateDays(month = 1, year = 2000, selectedDay = 1) {
    const daySelect = document.getElementById("birth-day");
    daySelect.innerHTML = '<option value="">Day</option>';
    
    if (!month || !year) return;

    const daysInMonth = new Date(year, month, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
        const option = document.createElement("option");
        option.value = i;
        option.textContent = i;
        if (i === selectedDay) option.selected = true;
        daySelect.appendChild(option);
    }
}

function setDefaultMonth(selectedMonth = 1) {
    const monthSelect = document.getElementById("birth-month");
    monthSelect.value = selectedMonth;
}

// Call on page load
setDefaultMonth();          // January
populateYears();            // 2000
populateDays(1, 2000);      // 1st

// Add event listeners to re-render days when month/year change
document.getElementById("birth-month").addEventListener("change", () => {
    const month = parseInt(document.getElementById("birth-month").value);
    const year = parseInt(document.getElementById("birth-year").value);
    populateDays(month, year);
});

document.getElementById("birth-year").addEventListener("change", () => {
    const month = parseInt(document.getElementById("birth-month").value);
    const year = parseInt(document.getElementById("birth-year").value);
    populateDays(month, year);
});

// Real-time validation for phone number
document.getElementById("contact-number").addEventListener("input", (e) => {
    const input = e.target;
    const value = input.value;
    
    // Remove any non-digit characters
    const cleanValue = value.replace(/\D/g, '');
    
    // Limit to 11 digits
    if (cleanValue.length > 11) {
        input.value = cleanValue.slice(0, 11);
        return;
    }
    
    input.value = cleanValue;
    
    // Visual feedback
    if (cleanValue.length === 11 && cleanValue.startsWith('09')) {
        input.style.borderColor = '#28a745';
    } else if (cleanValue.length > 0) {
        input.style.borderColor = '#dc3545';
    } else {
        input.style.borderColor = '';
    }
});

// Real-time validation for email
document.getElementById("email").addEventListener("blur", (e) => {
    const input = e.target;
    const email = input.value.toLowerCase();
    
    const trustedProviders = [
        '@gmail.com', '@yahoo.com', '@outlook.com', '@hotmail.com',
        '@rocketmail.com', '@live.com', '@msn.com', '@icloud.com',
        '@me.com', '@mac.com'
    ];
    
    if (email && !trustedProviders.some(provider => email.endsWith(provider))) {
        input.style.borderColor = '#dc3545';
        input.title = 'Please use a trusted email provider: Gmail, Yahoo, Outlook, Hotmail, Rocketmail, Live, MSN, or iCloud';
    } else if (email) {
        input.style.borderColor = '#28a745';
        input.title = '';
    } else {
        input.style.borderColor = '';
    }
});

// --- Form Submission Handler ---


// --- Non-blocking status message for email sending ---
function showEmailStatus(msg) {
	let statusDiv = document.getElementById('email-status');
	if (!statusDiv) {
		statusDiv = document.createElement('div');
		statusDiv.id = 'email-status';
		statusDiv.style.position = 'fixed';
		statusDiv.style.top = '0';
		statusDiv.style.left = '0';
		statusDiv.style.width = '100%';
		statusDiv.style.background = '#7c5e99';
		statusDiv.style.color = '#fff';
		statusDiv.style.textAlign = 'center';
		statusDiv.style.padding = '12px 0';
		statusDiv.style.zIndex = '9999';
		document.body.appendChild(statusDiv);
	}
	statusDiv.textContent = msg;
	statusDiv.style.display = 'block';
}
function hideEmailStatus() {
	const statusDiv = document.getElementById('email-status');
	if (statusDiv) statusDiv.style.display = 'none';
}

document.querySelector(".login-form").addEventListener("submit", async (e) => {
	e.preventDefault();

	// ...existing code...
	const firstName = document.getElementById("first-name").value.trim();
	const middleName = document.getElementById("middle-name").value.trim();
	const lastName = document.getElementById("last-name").value.trim();
	const contactNumber = document.getElementById("contact-number").value.trim();
	const birthMonth = parseInt(document.getElementById("birth-month").value);
	const birthDay = parseInt(document.getElementById("birth-day").value);
	const birthYear = parseInt(document.getElementById("birth-year").value);
	const email = document.getElementById("email").value.trim();
	const password = document.getElementById("password").value;
	const confirmPassword = document.getElementById("confirm-password").value;
// --- Modal System ---
function showNotification(title, message) {
    const modal = document.getElementById('notificationModal');
    const titleEl = document.getElementById('notificationTitle');
    const messageEl = document.getElementById('notificationMessage');
    
    if (modal && titleEl && messageEl) {
        titleEl.textContent = title;
        messageEl.textContent = message;
        modal.classList.add('show');
        
        // Attach listener each time (removes old ones automatically)
        const okBtn = document.getElementById('notificationOk');
        if (okBtn) {
            okBtn.onclick = hideNotification;
        }
        
        // Click outside to close
        modal.onclick = (e) => {
            if (e.target === modal) {
                hideNotification();
            }
        };
    }
}

	// ...existing code...
	if (
		!firstName || !lastName || !contactNumber ||
		!birthMonth || !birthDay || !birthYear ||
		!email || !password || !confirmPassword
	) {
		showNotification("Validation Error", "Please fill in all required fields.");
		return;
	}

	// Phone number validation - must start with "09" and be exactly 11 digits
	if (!/^09\d{9}$/.test(contactNumber)) {
		showNotification("Invalid Phone Number", "Phone number must start with '09' and be exactly 11 digits long.");
		return;
	}

	// Email validation - only trusted providers
	const trustedEmailProviders = [
		'@gmail.com',
		'@yahoo.com',
		'@outlook.com',
		'@hotmail.com',
		'@rocketmail.com',
		'@live.com',
		'@msn.com',
		'@icloud.com',
		'@me.com',
		'@mac.com'
	];
	
	const emailLower = email.toLowerCase();
	const isValidEmail = trustedEmailProviders.some(provider => emailLower.endsWith(provider));
	
	if (!isValidEmail) {
		showNotification("Invalid Email Provider", "Please use a trusted email provider: Gmail, Yahoo, Outlook, Hotmail, Rocketmail, Live, MSN, or iCloud.");
		return;
	}

	if (password !== confirmPassword) {
		showNotification("Password Mismatch", "Passwords do not match.");
		return;
	}

	// Generate random 6-digit code
	const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

	// Show non-blocking status message
	showEmailStatus("Sending verification code to your email. Please wait...");

	// Send verification code to user's email using SMTP
	try {
		fetch("php/smtp-email.php", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email,
				name: `${firstName} ${lastName}`,
				subject: "Email Verification Code",
				html: `<strong>Your verification code is:</strong> <br><br><span style='font-size:2em;'>${verificationCode}</span><br><br>Please enter this code to complete your registration.`
			})
		})
		.then(async r => {
			const text = await r.text();
			try {
				const res = JSON.parse(text);
				console.log("Email status:", res);
				hideEmailStatus();
				if (!res.success) {
					showNotification("Failed to send verification code. Please try again.");
					return;
				}
				// Email sent successfully, now show the prompt for verification code
				let userCode = prompt("A 6-digit verification code has been sent to your email. Please enter the code to complete registration:");
				if (!userCode) {
					showNotification("Registration cancelled. Verification code not entered.");
					return;
				}
				if (userCode.trim() !== verificationCode) {
					showNotification("Incorrect verification code. Please try registering again.");
					return;
				}
			} catch (e) {
				hideEmailStatus();
				console.error("Email response is not valid JSON:", text);
				showNotification("Failed to send verification code. Please try again.");
				return;
			}

			// Convert birthdate to Timestamp (month - 1 for JS Date)
			const birthdateObj = new Date(birthYear, birthMonth - 1, birthDay);
			const birthdateTimestamp = Timestamp.fromDate(birthdateObj);
			const createdAtTimestamp = Timestamp.now();

			try {
				// Create user in Firebase Auth
				const userCredential = await createUserWithEmailAndPassword(auth, email, password);
				const user = userCredential.user;

				// Update Firebase user profile
				await updateProfile(user, {
					displayName: `${firstName} ${lastName}`
				});

				// Save user data to Firestore
				const userDoc = doc(db, "users", user.uid);
				await setDoc(userDoc, {
					firstName,
					middleName,
					lastName,
					contactNumber,
					birthdate: birthdateTimestamp,
					email,
					role: "customer",
					createdAt: createdAtTimestamp
				});

				showNotification("Registration successful!");
				await signOut(auth);
				window.location.href = "login.html";
			} catch (error) {
				console.error("Registration error:", error);
				showNotification("Error: " + error.message);
			}
		})
		.catch(err => {
			hideEmailStatus();
			console.error("Email error:", err);
			showNotification("Failed to send verification code. Please try again.");
			return;
		});
		// Return here to prevent further execution until fetch completes
		return;
	} catch (err) {
		hideEmailStatus();
		console.error("Email send error:", err);
		showNotification("Failed to send verification code. Please try again.");
		return;
	}

	// ...rest of registration logic handled inside fetch then block...
});

setTimeout(() => {
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
}, 100);