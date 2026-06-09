import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";


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
const provider = new GoogleAuthProvider();

// --- Modal System ---
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


// --- Utility Functions ---
function isValidEmail(email) {
    return /.+@.+\..+/.test(email);
}

// --- Forgot Password handler ---
const forgotBtn = document.getElementById('forgot-password');
if (forgotBtn) {
    forgotBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('email');
        let email = emailInput ? emailInput.value.trim() : '';
        if (!email) {
            email = prompt('Enter your account email to reset password:')?.trim() || '';
        }
        if (!email) {
            showNotification('Error', 'Email is required.');
            return;
        }
        if (!isValidEmail(email)) {
            showNotification('Error', 'Please enter a valid email address.');
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            showNotification('Success', 'Password reset email sent. Please check your inbox.');
        } catch (err) {
            console.error('Password reset error:', err);
            showNotification('Error', err?.message || 'Failed to send reset email.');
        }
    });
}

// --- Email/Password Login ---
const loginForm = document.querySelector("form.login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showNotification('Error', 'Please fill in all required fields.');
            return;
        }

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Check user data and redirect
            const querySnapshot = await getDocs(collection(db, "users"));
            querySnapshot.forEach((doc) => {
                if (doc.id === user.uid) {
                    const userRole = doc.data().role;
                    if (userRole !== 'customer') {
                        window.location.href = "admin-dashboard.html";
                    } else {
                        showNotification('Success', 'Login successful! Redirecting...');
                        setTimeout(() => {
                            window.location.href = "menu.html";
                        }, 1500);
                    }
                }
            });
        } catch (error) {
            console.error(error);
        
            let msg = 'An unexpected error occurred. Please try again.';
        
            // Map Firebase error codes to friendly messages
            if (error.code === 'auth/user-not-found') {
                msg = 'No account found with this email.';
            } else if (error.code === 'auth/invalid-credential') {
                msg = 'Invalid email or password';
            } else if (error.code === 'auth/wrong-password') {
                msg = 'Incorrect password. Please try again.';
            } else if (error.code === 'auth/too-many-requests') {
                msg = 'Too many attempts. Please try again later.';
            }
            
            showNotification('Login Failed', msg);
        }
    });
}

// --- Google Sign-In ---
const googleBtn = document.getElementById("google");
if (googleBtn) {
    googleBtn.addEventListener("click", async (e) => {
        e.preventDefault();

        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                // First time login → create record
                const [firstName, ...lastNameParts] = (user.displayName || "").split(" ");
                const currentDate = new Date();
                await setDoc(userRef, {
                    email: user.email,
                    firstName: firstName || "",
                    lastName: lastNameParts.join(" ") || "",
                    birthday: null,
                    phone: null,
                    role: "customer",
                    dateRegistered: currentDate.toISOString(),
                    active: true,
                    profileCompleted: false
                });
            }

            const userData = (await getDoc(userRef)).data();

            // Check if missing birthday or phone
            if (!userData.birthday || !userData.phone) {
                // Show profile completion modal
                const profileModal = document.getElementById('profileCompletionModal');
                profileModal.classList.add('show');

                // Initialize date selectors
                const yearSelect = document.getElementById('birthYear');
                const currentYear = new Date().getFullYear();
                for (let year = currentYear - 100; year <= currentYear - 18; year++) {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    yearSelect.appendChild(option);
                }

                // Update days based on month
                const updateDays = () => {
                    const month = parseInt(document.getElementById('birthMonth').value);
                    const year = parseInt(document.getElementById('birthYear').value);
                    const daySelect = document.getElementById('birthDay');
                    
                    // Clear existing days
                    daySelect.innerHTML = '<option value="">Day</option>';
                    
                    for (let d = 1; d <= 31; d++) {
                        let opt = document.createElement("option");
                        opt.value = d;
                        opt.textContent = d;
                        daySelect.appendChild(opt);
                    }
                };

                // Add event listeners for date updates
                document.getElementById('birthMonth').addEventListener('change', updateDays);
                document.getElementById('birthYear').addEventListener('change', updateDays);

                // Handle form submission
                document.getElementById('completeProfile').addEventListener('click', async () => {
                    const phoneNumber = document.getElementById('phoneNumber').value.trim();
                    const month = document.getElementById('birthMonth').value;
                    const day = document.getElementById('birthDay').value;
                    const year = document.getElementById('birthYear').value;
                    
                    // Reset error messages
                    document.getElementById('phoneError').textContent = '';
                    document.getElementById('birthdayError').textContent = '';
                    
                    // Validate phone number
                    if (!/^\d{11}$/.test(phoneNumber)) {
                        document.getElementById('phoneError').textContent = 'Please enter a valid 11-digit phone number';
                        return;
                    }
                    
                    // Validate birthday
                    if (!month || !day || !year) {
                        document.getElementById('birthdayError').textContent = 'Please select a complete birth date';
                        return;
                    }
                    
                    const birthDate = new Date(year, month - 1, day);
                    if (isNaN(birthDate.getTime())) {
                        document.getElementById('birthdayError').textContent = 'Please select a valid birth date';
                        return;
                    }
                    
                    // Update user profile
                    try {
                        await updateDoc(userRef, {
                            phone: phoneNumber,
                            birthday: birthDate.toISOString(),
                            profileCompleted: true
                        });
                        
                        profileModal.classList.remove('show');
                        showNotification('Success', 'Profile updated successfully! Redirecting...');
                        setTimeout(() => {
                            window.location.href = "menu.html";
                        }, 1500);
                    } catch (error) {
                        console.error('Error updating profile:', error);
                        showNotification('Error', 'Failed to update profile. Please try again.');
                    }
                });

                // Handle cancel
                document.getElementById('cancelProfile').addEventListener('click', async () => {
                    await auth.signOut();
                    profileModal.classList.remove('show');
                    showNotification('Logged Out', 'You must complete your profile to continue.');
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                });

            } else {
                // Redirect if profile is complete
                showNotification('Success', `Welcome ${user.displayName}! Redirecting...`);
                setTimeout(() => {
                    window.location.href = "menu.html";
                }, 1500);
            }

        } catch (error) {
            console.error("Google Sign-In failed:", error.message);
            showNotification('Google Sign-In Failed', error.message);
        }
    });
}
// --- Initialize Modal Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Notification modal OK button
    const notificationOk = document.getElementById('notificationOk');
    if (notificationOk) {
        notificationOk.addEventListener('click', hideNotification);
    }
    
    // Close modal when clicking outside
    const notificationModal = document.getElementById('notificationModal');
    if (notificationModal) {
        notificationModal.addEventListener('click', (e) => {
            if (e.target === notificationModal) {
                hideNotification();
            }
        });
    }
});
