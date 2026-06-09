import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, updatePassword, updateEmail, sendEmailVerification } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

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

// --- DOM Elements (support both legacy and registration-style forms) ---
// Legacy fields
const fullnameInput = document.getElementById("fullname");
const birthdayInput = document.getElementById("birthday");
const contactInput = document.getElementById("contact");
// Registration-style fields
const firstNameInput = document.getElementById("first-name");
const middleNameInput = document.getElementById("middle-name");
const lastNameInput = document.getElementById("last-name");
const contactNumberInput = document.getElementById("contact-number");
const birthMonthSelect = document.getElementById("birth-month");
const birthYearSelect = document.getElementById("birth-year");
const birthDaySelect = document.getElementById("birth-day");

// Common fields
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirm-password");
const saveBtn = document.getElementById("saveBtn");
const logoutBtn = document.getElementById("logoutBtn");
const emailVerifyStatus = document.getElementById("email-verify-status");
const verifyEmailBtn = document.getElementById("verifyEmailBtn");
const changePasswordBtn = document.getElementById("changePasswordBtn");

function isRegistrationForm() {
    return !!(firstNameInput || middleNameInput || lastNameInput || birthMonthSelect || birthYearSelect || birthDaySelect || contactNumberInput || confirmPasswordInput);
}

// Helpers for registration-style birthdate selects
function populateYears() {
    if (!birthYearSelect) return;
    const currentYear = new Date().getFullYear();
    while (birthYearSelect.options.length > 1) birthYearSelect.remove(1);
    for (let y = currentYear; y >= 1900; y--) {
        const opt = document.createElement('option');
        opt.value = String(y);
        opt.textContent = String(y);
        birthYearSelect.appendChild(opt);
    }
}
function daysInMonth(year, month) { // month 1..12
    return new Date(year, month, 0).getDate();
}
function populateDays() {
    if (!birthDaySelect) return;
    const y = parseInt(birthYearSelect?.value || '0', 10);
    const m = parseInt(birthMonthSelect?.value || '0', 10);
    const max = (y && m) ? daysInMonth(y, m) : 31;
    const prev = birthDaySelect.value;
    while (birthDaySelect.options.length > 1) birthDaySelect.remove(1);
    for (let d = 1; d <= max; d++) {
        const opt = document.createElement('option');
        opt.value = String(d);
        opt.textContent = String(d);
        birthDaySelect.appendChild(opt);
    }
    if (prev && parseInt(prev, 10) <= max) birthDaySelect.value = prev;
}
if (isRegistrationForm()) {
    populateYears();
    populateDays();
    birthMonthSelect?.addEventListener('change', populateDays);
    birthYearSelect?.addEventListener('change', populateDays);
}

// --- Modal Elements ---
const logoutModal = document.getElementById("logoutModal");
const cancelLogout = document.getElementById("cancelLogout");
const confirmLogout = document.getElementById("confirmLogout");
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
// --- Load Profile Data ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html"; // Redirect if not logged in
        return;
    }

    // Always show auth email (if field exists)
    if (emailInput) emailInput.value = user.email;
    if (emailVerifyStatus) {
        emailVerifyStatus.textContent = user.emailVerified ? 'Verified' : 'Unverified';
        emailVerifyStatus.classList.toggle('verified', !!user.emailVerified);
        emailVerifyStatus.classList.toggle('unverified', !user.emailVerified);
    }
    if (verifyEmailBtn) verifyEmailBtn.style.display = user.emailVerified ? 'none' : 'inline-block';
    if (changePasswordBtn) changePasswordBtn.disabled = !user.emailVerified;
    console.log('Email verification status:', user.emailVerified ? 'Verified' : 'Unverified');

    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const data = userSnap.data();
            console.log("📂 Firestore Data:", data);

            if (isRegistrationForm()) {
                if (firstNameInput) firstNameInput.value = data.firstName || "";
                if (middleNameInput) middleNameInput.value = data.middleName || "";
                if (lastNameInput) lastNameInput.value = data.lastName || "";

                // birthdate -> selects
                let bDate = null;
                if (data.birthdate) {
                    if (typeof data.birthdate.toDate === 'function') bDate = data.birthdate.toDate();
                    else if (data.birthdate.seconds) bDate = new Date(data.birthdate.seconds * 1000);
                    else bDate = new Date(data.birthdate);
                }
                if (bDate && !isNaN(bDate.getTime())) {
                    const y = bDate.getFullYear();
                    const m = bDate.getMonth() + 1;
                    const d = bDate.getDate();
                    if (birthYearSelect) birthYearSelect.value = String(y);
                    if (birthMonthSelect) birthMonthSelect.value = String(m);
                    populateDays();
                    if (birthDaySelect) birthDaySelect.value = String(d);
                }
                if (contactNumberInput) contactNumberInput.value = data.contactNumber || "";
            } else {
                if (fullnameInput) fullnameInput.value = `${data.firstName || ""} ${data.lastName || ""}`.trim();
                if (data.birthdate) {
                    let d = null;
                    if (typeof data.birthdate.toDate === 'function') d = data.birthdate.toDate();
                    else if (data.birthdate.seconds) d = new Date(data.birthdate.seconds * 1000);
                    else d = new Date(data.birthdate);
                    if (d && !isNaN(d.getTime()) && birthdayInput) birthdayInput.value = d.toISOString().split("T")[0];
                }
                if (contactInput) contactInput.value = data.contactNumber || "";
            }
        } else {
            console.warn("⚠️ No Firestore profile found for user:", user.uid);
        }
    } catch (err) {
        console.error("🔥 Error loading profile:", err);
    }
});

// --- Save Changes ---
saveBtn?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        // 1) Email update (non-blocking for profile saving)
        if (emailInput && emailInput.value && emailInput.value !== user.email) {
            try {
                await updateEmail(user, emailInput.value);
                await sendEmailVerification(user);
                showNotification('Email Updated', 'Email updated! Please check your inbox to verify the new address.');

                // reflect status as unverified after change until user verifies
                if (emailVerifyStatus) {
                    emailVerifyStatus.textContent = 'Unverified';
                    emailVerifyStatus.classList.add('unverified');
                    emailVerifyStatus.classList.remove('verified');
                }
                if (verifyEmailBtn) verifyEmailBtn.style.display = 'inline-block';
            } catch (e) {
                console.error("Email update failed:", e);
                if (e?.code === 'auth/requires-recent-login') {
                    showNotification('Re-authentication Required', 'For security, please log out and log back in to change your email.');
                } else {
                    showNotification('Warning', 'Failed to update email. Profile info will still be saved.');
                }
            }
        }

        // 2) Prepare profile fields
        let firstNameVal = "";
        let middleNameVal = "";
        let lastNameVal = "";
        let contactVal = "";
        let birthdateVal = null;

        if (isRegistrationForm()) {
            firstNameVal = (firstNameInput?.value || '').trim();
            middleNameVal = (middleNameInput?.value || '').trim();
            lastNameVal = (lastNameInput?.value || '').trim();
            contactVal = (contactNumberInput?.value || '').trim();

            const by = birthYearSelect?.value || '';
            const bm = birthMonthSelect?.value || '';
            const bd = birthDaySelect?.value || '';
            if (!firstNameVal || !lastNameVal) return showNotification('Validation Error', 'First and Last name are required.');
            if (!/^\d{11}$/.test(contactVal)) return showNotification('Validation Error', 'Contact number must be 11 digits.');
            if (!by || !bm || !bd) return showNotification('Validation Error', 'Please select a complete birth date.');
            const d = new Date(parseInt(by,10), parseInt(bm,10)-1, parseInt(bd,10));
            if (isNaN(d.getTime())) return showNotification('Validation Error', 'Invalid birth date.');
            birthdateVal = d;
        } else {
            // legacy: split fullname
            const [first, ...lastParts] = (fullnameInput?.value || '').trim().split(' ');
            firstNameVal = first || '';
            lastNameVal = lastParts.join(' ');
            contactVal = (contactInput?.value || '').trim();
            const dstr = birthdayInput?.value || '';
            birthdateVal = dstr ? new Date(dstr) : null;
        }

        // 3) Save profile to Firestore
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
            firstName: firstNameVal,
            middleName: middleNameVal,
            lastName: lastNameVal,
            birthdate: birthdateVal || null,
            contactNumber: contactVal
        });

        // 4) Password update (optional, non-blocking)
        const newPass = (passwordInput?.value || '').trim();
        const confirmPass = (confirmPasswordInput?.value || '').trim();
        if (newPass || confirmPass) {
            if (newPass !== confirmPass && confirmPasswordInput) {
                return showNotification("Error",'Passwords do not match.');
            }
            try {
                await updatePassword(user, newPass);
                showNotification('Success', 'Profile and password updated successfully!');
            } catch (e) {
                console.error('Password update failed:', e);
                if (e?.code === 'auth/requires-recent-login') {
                    showNotification('Try again','For security, please log out and log back in to change your password.');
                } else {
                    showNotification('Error','Failed to update password. Your profile info was saved.');
                }
            }
        } else {
            showNotification('Update Success',"Profile updated successfully!");
        }

        if (passwordInput) passwordInput.value = "";
        if (confirmPasswordInput) confirmPasswordInput.value = "";
    } catch (err) {
        console.error("🔥 Error updating profile:", err);
        showNotification("Error","Failed to update profile.");
    }
});

// --- Profile Dropdown ---
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
        logoutLink.addEventListener("click", (e) => {
            e.preventDefault();
            logoutModal.style.display = "flex"; // Show modal
        });

        dropdown.appendChild(profileLink);
        dropdown.appendChild(logoutLink);
    }
}

// --- Logout Modal Actions ---
logoutBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    logoutModal.style.display = "flex"; // Show modal
});

cancelLogout.addEventListener("click", () => {
    logoutModal.style.display = "none";
});

confirmLogout.addEventListener("click", async () => {
    try {
        await signOut(auth);
        window.location.href = "login.html";
    } catch (err) {
        console.error("🔥 Error logging out:", err);
        showNotification("Error","Failed to log out.");
    }
});

// --- Verify Email button ---
verifyEmailBtn?.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return showNotification('You must be signed in to verify email.');
    try {
        await sendEmailVerification(user);
        showNotification('Verification email sent. Please check your inbox.');
    } catch (e) {
        console.error('Failed to send verification email:', e);
        if (e?.code === 'auth/too-many-requests') {
            showNotification('Too many requests. Please try again later.');
        } else if (e?.code === 'auth/requires-recent-login') {
            showNotification('Please log out and back in, then try again.');
        } else {
            showNotification('Failed to send verification email.');
        }
    }
});

// --- Reservations Modal ---
// create modal DOM (lazy)
function ensureReservationsModal() {
    let modal = document.getElementById('reservationsModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'reservationsModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-overlay" id="reservationsModalOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;">
            <div class="modal-card" style="width:920px;max-width:95%;background:#fff;border-radius:8px;padding:18px;box-shadow:0 6px 24px rgba(0,0,0,.25);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <h3 style="margin:0;font-size:18px;">My Reservations</h3>
                </div>
                <div id="reservationsList" style="max-height:60vh;overflow:auto;padding-right:6px;">
                    <p style="color:#666;margin:0 0 8px 0;">Loading reservations...</p>
                </div>
                <div style="text-align:right;margin-top:12px;">
                    <button id="closeReservationsModalFooter" style="padding:8px 12px;border:1px solid #ccc;background:#fff;cursor:pointer;border-radius:4px;">Close</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // close handlers (guard for existence)
    const footerBtn = modal.querySelector('#closeReservationsModalFooter');
    if (footerBtn) footerBtn.addEventListener('click', hideReservationsModal);

    const overlay = modal.querySelector('#reservationsModalOverlay');
    if (overlay) {
        overlay.addEventListener('click', (ev) => {
            if (ev.target === ev.currentTarget) hideReservationsModal();
        });
    }

    return modal;
}

function showReservationsModal() {
    const modal = ensureReservationsModal();
    modal.style.display = 'block';
}

function hideReservationsModal() {
    const modal = document.getElementById('reservationsModal');
    if (modal) modal.style.display = 'none';
}

function formatSlot(slot) {
    if (!slot) return '';
    let d;
    if (typeof slot === 'object' && typeof slot.toDate === 'function') d = slot.toDate();
    else d = new Date(slot);
    if (isNaN(d.getTime())) return String(slot);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function renderReservations(container, docs) {
    if (!docs || docs.length === 0) {
        container.innerHTML = `<p style="color:#444;">You have no reservations.</p>`;
        return;
    }

    // build table
    let html = `
        <table style="width:100%;border-collapse:collapse;font-family:Montserrat,system-ui,Segoe UI,Roboto,Arial,sans-serif;">
            <thead>
                <tr style="text-align:left;border-bottom:2px solid #eee;">
                    <th style="padding:8px 10px;font-weight:700;">RESERVATION ID</th>
                    <th style="padding:8px 10px;font-weight:700;">NAME</th>
                    <th style="padding:8px 10px;font-weight:700;">TABLES</th>
                    <th style="padding:8px 10px;font-weight:700;">DATE</th>
                    <th style="padding:8px 10px;font-weight:700;">TIME</th>
                    <th style="padding:8px 10px;font-weight:700;">STATUS</th>
                    <th style="padding:8px 10px;font-weight:700;"></th>
                </tr>
            </thead>
            <tbody>
    `;

    docs.forEach(d => {
        const data = d.data();
        const tables = Array.isArray(data.tableId) ? data.tableId.join(', ') : (data.tableId || '');
        const uids = Array.isArray(data.uid) ? data.uid.join(', ') : (data.uid || '');
        // derive date/time from slot if available
        let slotDate = null;
        if (data.slot) {
            try {
                slotDate = (typeof data.slot === 'object' && typeof data.slot.toDate === 'function')
                    ? data.slot.toDate()
                    : new Date(data.slot);
            } catch (e) {
                slotDate = null;
            }
        }
        // fallback to separate date/time fields
        if (!slotDate && data.date) {
            try {
                const timePart = data.time || '00:00';
                slotDate = new Date(`${data.date}T${timePart}`);
                if (isNaN(slotDate.getTime())) slotDate = null;
            } catch (e) {
                slotDate = null;
            }
        }

        const dateStr = slotDate ? slotDate.toLocaleDateString() : (data.date || '');
        const timeStr = slotDate ? slotDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (data.time || '');
        const status = (data.status || 'unknown').toLowerCase();
        const statusDisplay = (data.status || 'UNKNOWN').toUpperCase();

        const isBooked = status === 'booked';

        const btnStyle = isBooked
            ? 'padding:6px 10px;border-radius:4px;border:1px solid #c33;background:#fff;color:#c33;cursor:pointer;'
            : 'padding:6px 10px;border-radius:4px;border:1px solid #ddd;background:#f5f5f5;color:#999;cursor:default;';

        const disabledAttr = isBooked ? '' : 'disabled';

        // Truncate reservation ID for display
        // const truncatedId = d.id.length > 10 ? d.id.substring(0, 10) + '...' : d.id;

        html += `
            <tr style="border-bottom:1px solid #f1f1f1;">
                <td style="padding:10px;" title="${escapeHTML(d.id)}">${escapeHTML(d.id)}</td>
                <td style="padding:10px;">${escapeHTML(data.name || '—')}</td>
                <td style="padding:10px;">${escapeHTML(tables)}</td>
                <td style="padding:10px;">${escapeHTML(dateStr)}</td>
                <td style="padding:10px;">${escapeHTML(timeStr)}</td>
                <td style="padding:10px;font-weight:600;">${escapeHTML(statusDisplay)}</td>
                <td style="padding:10px;text-align:right;">
                    <button class="cancel-reservation-btn" data-res-id="${d.id}" ${disabledAttr} style="${btnStyle}">Cancel</button>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table>`;

    container.innerHTML = html;

    // attach handlers for cancel buttons after rendering
    attachCancelHandlers(container);
}

async function attachCancelHandlers(container) {
    container.querySelectorAll('.cancel-reservation-btn').forEach(btn => {
        // remove previous listener if any (safe)
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', async (e) => {
            const button = e.currentTarget;
            if (button.disabled) return;
            const resId = button.dataset.resId;
            if (!resId) return;
            const row = container.querySelector(`.reservation-row[data-res-id="${resId}"]`) || button.closest('tr');
            await cancelReservation(resId, row, button);
        });
    });
}

async function cancelReservation(reservationId, rowElement, buttonElement) {
    if (!confirm('Are you sure you want to cancel this reservation?')) return;

    try {
        const resRef = doc(db, 'reservations', reservationId);
        await updateDoc(resRef, { status: 'cancelled', updatedAt: new Date() });

        // update UI: change status text and remove button
        if (rowElement) {
            const statusEl = rowElement.querySelector('.res-status[data-res-id="' + reservationId + '"]');
            if (statusEl) statusEl.textContent = 'CANCELLED';
            const btn = rowElement.querySelector('.cancel-reservation-btn[data-res-id="' + reservationId + '"]');
            if (btn) btn.remove();
        } else if (buttonElement) {
            buttonElement.remove();
        }
    } catch (err) {
        console.error('Failed to cancel reservation:', err);
        showNotification('Failed to cancel reservation. Please try again.');
    }
}

function escapeHTML(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
}

// fetch reservations for a logged-in user (merge by uid and email, de-dupe, sort desc)
async function fetchReservationsForUser(uid, email) {
    const map = new Map(); // id -> doc
    try {
        if (uid) {
            const q1 = query(collection(db, 'reservations'), where('userId', '==', uid));
            const snap1 = await getDocs(q1);
            snap1.forEach(d => map.set(d.id, d));
        }
        if (email) {
            const q2 = query(collection(db, 'reservations'), where('email', '==', email));
            const snap2 = await getDocs(q2);
            snap2.forEach(d => map.set(d.id, d));
        }
    } catch (err) {
        console.error('Failed to fetch reservations:', err);
        throw err;
    }

    const docs = Array.from(map.values());

    // Normalize to a timestamp for sorting: prefer slot (Timestamp or ISO string), fallback date+time, then createdAt
    function sortKey(doc) {
        const data = doc.data();
        let dt = null;
        if (data.slot) {
            try {
                dt = (typeof data.slot === 'object' && typeof data.slot.toDate === 'function')
                    ? data.slot.toDate()
                    : new Date(data.slot);
            } catch (_) { dt = null; }
        }
        if ((!dt || isNaN(dt)) && data.date) {
            try {
                const timePart = data.time || '00:00';
                dt = new Date(`${data.date}T${timePart}`);
            } catch (_) { dt = null; }
        }
        if ((!dt || isNaN(dt)) && data.createdAt && typeof data.createdAt.toDate === 'function') {
            dt = data.createdAt.toDate();
        }
        return dt && !isNaN(dt) ? dt.getTime() : 0;
    }

    docs.sort((a, b) => sortKey(b) - sortKey(a));
    return docs;
}

// wire up click — waits for auth state then fetches and shows modal
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('seeReservation');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        showReservationsModal();
        const list = document.getElementById('reservationsList');
        list.innerHTML = `<p style="color:#666;margin:0 0 8px 0;">Loading reservations...</p>`;

        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                list.innerHTML = `<p style="color:#b00;">You must be signed in to view reservations.</p>`;
                return;
            }

            try {
                const docs = await fetchReservationsForUser(user.uid, user.email);
                // docs is array of QueryDocumentSnapshots
                renderReservations(list, docs);
            } catch (err) {
                list.innerHTML = `<p style="color:#b00;">Failed to load reservations. Try again later.</p>`;
            }
        });
    });
});

// --- Change Password Modal Logic ---
const changePasswordModal = document.getElementById('changePasswordModal');
const cancelChangePassword = document.getElementById('cancelChangePassword');
const confirmChangePassword = document.getElementById('confirmChangePassword');
const newPasswordInputEl = document.getElementById('newPasswordInput');
const confirmNewPasswordInputEl = document.getElementById('confirmNewPasswordInput');

changePasswordBtn?.addEventListener('click', () => {
    const user = auth.currentUser;
    if (!user) return showNotification('You must be signed in to change your password.');
    if (!user.emailVerified) return showNotification('Please verify your email before changing your password.');
    if (changePasswordModal) changePasswordModal.style.display = 'flex';
});

cancelChangePassword?.addEventListener('click', () => {
    if (changePasswordModal) changePasswordModal.style.display = 'none';
    if (newPasswordInputEl) newPasswordInputEl.value = '';
    if (confirmNewPasswordInputEl) confirmNewPasswordInputEl.value = '';
});

confirmChangePassword?.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return showNotification('You must be signed in to change your password.');
    if (!user.emailVerified) return showNotification('Please verify your email before changing your password.');
    const newPass = (newPasswordInputEl?.value || '').trim();
    const confirmPass = (confirmNewPasswordInputEl?.value || '').trim();
    if (!newPass || !confirmPass) return showNotification('Please enter and confirm your new password.');
    if (newPass !== confirmPass) return showNotification('Passwords do not match.');
    if (newPass.length < 6) return showNotification('Password must be at least 6 characters long.');
    try {
        await updatePassword(user, newPass);
        showNotification('Password updated successfully.');
        if (changePasswordModal) changePasswordModal.style.display = 'none';
        if (newPasswordInputEl) newPasswordInputEl.value = '';
        if (confirmNewPasswordInputEl) confirmNewPasswordInputEl.value = '';
    } catch (e) {
        console.error('Password update failed:', e);
        if (e?.code === 'auth/requires-recent-login') {
            showNotification('For security, please log out and log back in to change your password.');
        } else {
            showNotification('Failed to update password. Please try again.');
        }
    }
});