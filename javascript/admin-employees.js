// Admin Employees JavaScript
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, getDoc, collection, query, where, orderBy, limit, getDocs, Timestamp, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Firebase config (same project as registration)
const firebaseConfig = {
    apiKey: "AIzaSyAOpuKx1x0IXKZROiThWfrak1iDupk7puc",
    authDomain: "senseat-42219.firebaseapp.com",
    databaseURL: "https://senseat-42219-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "senseat-42219",
    storageBucket: "senseat-42219.firebasestorage.app",
    messagingSenderId: "375530241499",
    appId: "1:375530241499:web:960d8484c2cba69e8d3bfe"
};

// Initialize default app if needed (for Firestore usage)
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Use a secondary app for creating users so we don't affect current admin session
const secondaryApp = initializeApp(firebaseConfig, 'admin-employees-secondary');
const secondaryAuth = getAuth(secondaryApp);

// DOM Content Loaded Event
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    // Load employees table on page load
    loadEmployees();
});

// Initialize all event listeners
function initializeEventListeners() {
    // Add Employee Modal functionality
    const openAddEmployeeBtn = document.getElementById('openAddEmployee');
    const closeAddEmployeeBtn = document.getElementById('closeAddEmployee');
    const addEmployeeModal = document.getElementById('addEmployeeModal');

    if (openAddEmployeeBtn) {
        openAddEmployeeBtn.addEventListener('click', function() {
            addEmployeeModal.style.display = 'block';
        });
    }

    if (closeAddEmployeeBtn) {
        closeAddEmployeeBtn.addEventListener('click', function() {
            addEmployeeModal.style.display = 'none';
        });
    }

    // Close modal when clicking outside of it
    window.addEventListener('click', function(event) {
        if (event.target === addEmployeeModal) {
            addEmployeeModal.style.display = 'none';
        }
    });

    // Logout modal functionality
    const showLogoutBtn = document.getElementById('showLogout');
    const logoutModal = document.getElementById('logoutModal');

    if (showLogoutBtn) {
        showLogoutBtn.addEventListener('click', function() {
            logoutModal.style.display = 'block';
        });
    }

    // Logout modal buttons
    const confirmLogoutBtn = logoutModal.querySelector('.confirm');
    const cancelLogoutBtn = logoutModal.querySelector('.cancel');

    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', function() {
            confirmLogout();
        });
    }

    if (cancelLogoutBtn) {
        cancelLogoutBtn.addEventListener('click', function() {
            hideLogoutModal();
        });
    }

    // Add Employee Form functionality (ready for future submit handling)
    const addEmployeeForm = document.getElementById('addEmployeeForm');
    if (addEmployeeForm) {
        addEmployeeForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            const saveBtn = addEmployeeForm.querySelector('.btn.save');
            try {
                if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
                const data = getEmployeeFormData();
                // Basic validation
                if (!data.firstName || !data.lastName || !data.position || !data.email || !data.contactNumber || !data.status) {
                    showInfoModal('Please fill in all required fields.');
                    return;
                }
                if (!validateEmail(data.email)) {
                    showInfoModal('Please enter a valid email address.');
                    return;
                }
                // For employee creation, generate a temporary password if none specified
                const tempPassword = generateTempPassword();

                // Create Auth user using secondary auth to avoid switching current session
                const userCred = await createUserWithEmailAndPassword(secondaryAuth, data.email, tempPassword);
                const newUser = userCred.user;

                // Build employeeId like <YEAR>-0001 (increment within same year)
                const now = new Date();
                const year = now.getFullYear();
                const employeeId = await generateNextEmployeeId(year);

                // Build Firestore document
                const userDocRef = doc(db, 'users', newUser.uid);
                const payload = {
                    firstName: data.firstName,
                    middleName: data.middleName || '',
                    lastName: data.lastName,
                    email: data.email,
                    contactNumber: data.contactNumber,
                    status: data.status,
                    role: data.position,
                    employeeId: employeeId,
                    createdAt: serverTimestamp()
                };

                // Optional birthdate
                if (data.birthYear && data.birthMonth && data.birthDay) {
                    const bd = new Date(data.birthYear, data.birthMonth - 1, data.birthDay);
                    if (!isNaN(bd.getTime())) {
                        payload.birthdate = Timestamp.fromDate(bd);
                    }
                }

                await setDoc(userDocRef, payload);

                // Attempt to send welcome email with temp password
                const emailOk = await sendEmployeeWelcomeEmail({
                    email: data.email,
                    name: `${data.firstName} ${data.lastName}`.trim(),
                    employeeId,
                    tempPassword,
                    position: data.position
                });

                const msg = emailOk
                    ? `Employee created.\nEmployee ID: ${employeeId}\nTemporary password: ${tempPassword}\n\nAn email has been sent to the employee.`
                    : `Employee created.\nEmployee ID: ${employeeId}\nTemporary password: ${tempPassword}\n\nWarning: Failed to send email notification.`;
                showInfoModal(msg);
                // Refresh the employees table
                loadEmployees();
                clearAddEmployeeForm();
                document.getElementById('addEmployeeModal').style.display = 'none';
            } catch (err) {
                console.error('Create employee failed:', err);
                showInfoModal('Failed to create employee: ' + (err && err.message ? err.message : err));
            } finally {
                try { await signOut(secondaryAuth); } catch {}
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
            }
        });
    }

    // Generic modal functionality for info and confirm modals
    setupGenericModals();

    // Edit Employee modal events
    setupEditEmployeeModal();
}

// Logout functionality
function confirmLogout() {
    // Add logout logic here
    console.log('Logging out...');
    // For now, redirect to login page or clear session
    // window.location.href = 'login.html';
    hideLogoutModal();
}

function hideLogoutModal() {
    const logoutModal = document.getElementById('logoutModal');
    if (logoutModal) {
        logoutModal.style.display = 'none';
    }
}

// Backward compat for HTML onclick="hideModal()" in the logout modal
function hideModal() {
    hideLogoutModal();
}

// Setup generic modals (info and confirm modals)
function setupGenericModals() {
    // Info modal
    const adminInfoOk = document.getElementById('adminInfoOk');
    if (adminInfoOk) {
        adminInfoOk.addEventListener('click', function() {
            document.getElementById('adminInfoModal').style.display = 'none';
        });
    }

    // Confirm modal
    const adminConfirmCancel = document.getElementById('adminConfirmCancel');
    const adminConfirmOk = document.getElementById('adminConfirmOk');

    if (adminConfirmCancel) {
        adminConfirmCancel.addEventListener('click', function() {
            document.getElementById('adminConfirmModal').style.display = 'none';
        });
    }

    if (adminConfirmOk) {
        adminConfirmOk.addEventListener('click', function() {
            // This will be handled by specific confirm actions
            document.getElementById('adminConfirmModal').style.display = 'none';
        });
    }
}

// Utility functions for showing modals
function showInfoModal(message) {
    const modal = document.getElementById('adminInfoModal');
    const text = document.getElementById('adminInfoText');
    if (modal && text) {
        text.textContent = message;
        modal.style.display = 'block';
    }
}

function showConfirmModal(message, onConfirm) {
    const modal = document.getElementById('adminConfirmModal');
    const text = document.getElementById('adminConfirmText');
    const confirmBtn = document.getElementById('adminConfirmOk');
    
    if (modal && text && confirmBtn) {
        text.textContent = message;
        modal.style.display = 'block';
        
        // Remove any existing event listeners and add new one
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        newConfirmBtn.addEventListener('click', function() {
            modal.style.display = 'none';
            if (onConfirm && typeof onConfirm === 'function') {
                onConfirm();
            }
        });
    }
}

// Form validation helper functions
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePhoneNumber(phone) {
    // Basic phone validation - can be enhanced based on requirements
    const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
}

// Employee form data collection (ready for future use)
function getEmployeeFormData() {
    const form = document.getElementById('addEmployeeForm');
    if (!form) return null;

    return {
        firstName: document.getElementById('firstName').value.trim(),
        middleName: document.getElementById('middleName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        position: document.getElementById('position').value,
        email: document.getElementById('email').value.trim(),
        contactNumber: document.getElementById('contactNumber').value.trim(),
        status: document.getElementById('status').value,
        birthMonth: parseInt(document.getElementById('birth-month').value || '0'),
        birthYear: parseInt(document.getElementById('birth-year').value || '0'),
        birthDay: parseInt(document.getElementById('birth-day').value || '0')
    };
}

// Clear form function
function clearAddEmployeeForm() {
    const form = document.getElementById('addEmployeeForm');
    if (form) {
        form.reset();
    }
}

// Birthday dropdown helpers (mirroring registration.js)
function populateYears(selectedYear = 2000) {
    const yearSelect = document.getElementById('birth-year');
    if (!yearSelect) return;
    yearSelect.innerHTML = '<option value="">Year</option>';
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 1900; y--) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        if (y === selectedYear) option.selected = true;
        yearSelect.appendChild(option);
    }
}

function populateDays(month = 1, year = 2000, selectedDay = 1) {
    const daySelect = document.getElementById('birth-day');
    if (!daySelect) return;
    daySelect.innerHTML = '<option value="">Day</option>';
    if (!month || !year) return;
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        if (i === selectedDay) option.selected = true;
        daySelect.appendChild(option);
    }
}

function setDefaultMonth(selectedMonth = 1) {
    const monthSelect = document.getElementById('birth-month');
    if (monthSelect) monthSelect.value = selectedMonth;
}

// Initialize birthday selectors on DOM load
(function initEmployeeBirthdaySelectors() {
    setDefaultMonth();
    populateYears();
    populateDays(1, 2000);

    const monthEl = document.getElementById('birth-month');
    const yearEl = document.getElementById('birth-year');

    if (monthEl) {
        monthEl.addEventListener('change', () => {
            const m = parseInt(monthEl.value);
            const y = parseInt(yearEl.value);
            populateDays(m, y);
        });
    }

    if (yearEl) {
        yearEl.addEventListener('change', () => {
            const m = parseInt(monthEl.value);
            const y = parseInt(yearEl.value);
            populateDays(m, y);
        });
    }
})();

// Export functions for potential use in other modules
window.employeeAdmin = {
    showInfoModal,
    showConfirmModal,
    getEmployeeFormData,
    clearAddEmployeeForm,
    validateEmail,
    validatePhoneNumber
};

// Helpers
function zeroPad(num, size) {
    let s = String(num);
    while (s.length < size) s = '0' + s;
    return s;
}

async function generateNextEmployeeId(year) {
    // Query latest employeeId for the year and increment
    const yearPrefix = `${year}-`;
    const usersCol = collection(db, 'users');
    // Range query for strings starting with yearPrefix
    const q = query(
        usersCol,
        where('employeeId', '>=', yearPrefix),
        where('employeeId', '<=', yearPrefix + '\uf8ff'),
        orderBy('employeeId', 'desc'),
        limit(1)
    );
    try {
        const snap = await getDocs(q);
        if (snap.empty) {
            return `${year}-0001`;
        }
        const last = snap.docs[0].data().employeeId;
        const parts = String(last).split('-');
        const seq = parts.length === 2 ? parseInt(parts[1], 10) : 0;
        const nextSeq = isNaN(seq) ? 1 : seq + 1;
        return `${year}-${zeroPad(nextSeq, 4)}`;
    } catch (e) {
        // Fallback if query fails: start at 0001
        console.warn('generateNextEmployeeId fallback due to query error:', e);
        return `${year}-0001`;
    }
}

function generateTempPassword() {
    // 10-char temp password: 3 letters + 3 digits + 4 mixed
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const mixed = letters + digits + '!@#$%';
    function pick(src, n) { return Array.from({length:n}, () => src[Math.floor(Math.random()*src.length)]).join(''); }
    const pwd = pick(letters,3) + pick(digits,3) + pick(mixed,4);
    // const pwd = 'TempPass123!'; // Fixed temp password for simplicity; change as needed
    return pwd;
}

async function sendEmployeeWelcomeEmail({ email, name, tempPassword, employeeId, position }) {
    const subject = 'Welcome to the Gulpers\' Restaurant Crew!';
    // Build HTML similar to reservation.js usage pattern
    const html = `<strong>Welcome to The Gulpers' Restaurant</strong><br><br>` +
        `Hi <strong>${name}</strong>,<br><br>` +
        `Your employee account has been created. Here are your credentials:<br><br>` +
        `<strong>Employee ID:</strong> ${employeeId}<br>` +
        (position ? `<strong>Position:</strong> ${position}<br>` : '') +
        `<strong>Temporary Password:</strong> ${tempPassword}<br><br>` +
        `Please log in and change your password as soon as possible.<br><br>` +
        `<strong>This is a no-reply email. Please do not respond.</strong>`;
    try {
        const res = await fetch('php/employee-email.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name, subject, html, employeeId, tempPassword, position })
        });
        const text = await res.text();
        try {
            const json = JSON.parse(text);
            if (json && json.success) return true;
            console.warn('Email not successful:', json);
            return false;
        } catch (e) {
            console.error('Invalid email response:', text);
            return false;
        }
    } catch (err) {
        console.error('Email send error:', err);
        return false;
    }
}

// ============================
// Employees table data loading
// ============================
async function loadEmployees() {
    const tbody = document.getElementById('employees-rows');
    if (!tbody) return;

    // Show a temporary loading state
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:12px;">Loading employees...</td></tr>';

    try {
        // Firestore: role != 'customer' requires orderBy on 'role'
        const usersCol = collection(db, 'users');
        const q = query(usersCol, where('role', '!=', 'customer'), orderBy('role'));
        const snap = await getDocs(q);

        const employees = [];
        snap.forEach(docSnap => {
            const d = docSnap.data() || {};
            employees.push({ id: docSnap.id, ...d });
        });

        // Optional: sort by employeeId if present, else by name
        employees.sort((a, b) => {
            const aId = a.employeeId || '';
            const bId = b.employeeId || '';
            if (aId && bId && aId !== bId) return aId.localeCompare(bId);
            const aName = formatFullName(a).toLowerCase();
            const bName = formatFullName(b).toLowerCase();
            return aName.localeCompare(bName);
        });

        // Render rows
        if (employees.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:12px;">No employees found.</td></tr>';
            return;
        }

        const rowsHtml = employees.map(emp => renderEmployeeRow(emp)).join('');
        tbody.innerHTML = rowsHtml;
    } catch (err) {
        console.error('Failed to load employees:', err);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:12px; color:#b00020;">Failed to load employees.</td></tr>';
    }
}

function formatFullName(d) {
    const parts = [d.firstName || '', d.middleName || '', d.lastName || '']
        .map(s => (s || '').trim())
        .filter(Boolean);
    return parts.join(' ');
}

function renderEmployeeRow(d) {
    const empId = d.employeeId || 'ΓÇö';
    const fullName = formatFullName(d) || 'ΓÇö';
    const position = d.role || 'ΓÇö';
    const email = d.email || 'ΓÇö';
    const contact = d.contactNumber || 'ΓÇö';
    const status = (d.status || '').toLowerCase() === 'inactive' ? 'inactive' : 'active';
    const badgeClass = status === 'active' ? 'badge active' : 'badge inactive';
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

    return `
        <tr data-doc-id="${d.id}" data-employee-id="${empId}">
            <td>${empId}</td>
            <td>${escapeHtml(fullName)}</td>
            <td>${escapeHtml(position)}</td>
            <td>${escapeHtml(email)}</td>
            <td>${escapeHtml(contact)}</td>
            <td><span class="${badgeClass}">${statusLabel}</span></td>
            <td><img src="assets/images/icons/more.png" alt="More" class="icon"></td>
        </tr>
    `;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================
// Edit Employee Modal Handling
// ============================
function setupEditEmployeeModal() {
    const tbody = document.getElementById('employees-rows');
    const modal = document.getElementById('editEmployeeModal');
    const closeBtn = document.getElementById('closeEditEmployee');
    const form = document.getElementById('editEmployeeForm');

    if (!tbody || !modal || !form) return;

    // Open modal via event delegation on More buttons
    tbody.addEventListener('click', async (e) => {
        const img = e.target.closest('img.icon');
        const row = e.target.closest('tr');
        if (!img || !row) return;

        const docId = row.getAttribute('data-doc-id');
        if (!docId) return;

        await openEditModal(docId);
    });

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.style.display = 'none');
    }

    // Click outside to close
    window.addEventListener('click', (event) => {
        if (event.target === modal) modal.style.display = 'none';
    });

    // Keep edit day options in sync when month/year changes
    const editMonthEl = document.getElementById('edit-birth-month');
    const editYearEl = document.getElementById('edit-birth-year');
    if (editMonthEl) {
        editMonthEl.addEventListener('change', () => {
            const m = parseInt(editMonthEl.value || '0');
            const y = parseInt(editYearEl.value || '0');
            populateEditDays(m, y);
        });
    }
    if (editYearEl) {
        editYearEl.addEventListener('change', () => {
            const m = parseInt(editMonthEl.value || '0');
            const y = parseInt(editYearEl.value || '0');
            populateEditDays(m, y);
        });
    }

    // Submit edits
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const saveBtn = form.querySelector('.btn.save');
        try {
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

            const docId = document.getElementById('editDocId').value;
            if (!docId) throw new Error('Missing document ID');

            const updates = collectEditFormData();
            // Basic validations
            if (!updates.firstName || !updates.lastName || !updates.role || !updates.email || !updates.contactNumber || !updates.status) {
                showInfoModal('Please fill in all required fields.');
                return;
            }
            if (!validateEmail(updates.email)) {
                showInfoModal('Please enter a valid email address.');
                return;
            }

            const ref = doc(db, 'users', docId);
            await updateDoc(ref, updates);

            showInfoModal('Employee updated successfully.');
            modal.style.display = 'none';
            loadEmployees();
        } catch (err) {
            console.error('Update employee failed:', err);
            showInfoModal('Failed to update employee: ' + (err && err.message ? err.message : err));
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
        }
    });
}

async function openEditModal(docId) {
    const modal = document.getElementById('editEmployeeModal');
    const form = document.getElementById('editEmployeeForm');
    if (!modal || !form) return;

    try {
        // Get latest doc
        const ref = doc(db, 'users', docId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            showInfoModal('Employee document not found.');
            return;
        }
        const d = snap.data() || {};

        // Populate fields
        document.getElementById('editDocId').value = docId;
        document.getElementById('editEmployeeId').value = d.employeeId || '';
        document.getElementById('editFirstName').value = d.firstName || '';
        document.getElementById('editMiddleName').value = d.middleName || '';
        document.getElementById('editLastName').value = d.lastName || '';
        document.getElementById('editPosition').value = d.role || '';
        document.getElementById('editEmail').value = d.email || '';
        document.getElementById('editContactNumber').value = d.contactNumber || '';
        document.getElementById('editStatus').value = d.status || '';

        // Birthdate population
        const monthEl = document.getElementById('edit-birth-month');
        const yearEl = document.getElementById('edit-birth-year');
        const dayEl = document.getElementById('edit-birth-day');
        populateEditYears();
        if (d.birthdate && d.birthdate.toDate) {
            const bd = d.birthdate.toDate();
            monthEl.value = String(bd.getMonth() + 1);
            yearEl.value = String(bd.getFullYear());
            populateEditDays(parseInt(monthEl.value), parseInt(yearEl.value));
            dayEl.value = String(bd.getDate());
        } else {
            monthEl.value = '';
            yearEl.value = '';
            dayEl.innerHTML = '<option value="">Day</option>';
        }

        // Show modal
        modal.style.display = 'block';
    } catch (err) {
        console.error('Open edit modal failed:', err);
        showInfoModal('Failed to load employee details: ' + (err && err.message ? err.message : err));
    }
}

function collectEditFormData() {
    const year = parseInt(document.getElementById('edit-birth-year').value || '0');
    const month = parseInt(document.getElementById('edit-birth-month').value || '0');
    const day = parseInt(document.getElementById('edit-birth-day').value || '0');
    const updates = {
        firstName: document.getElementById('editFirstName').value.trim(),
        middleName: document.getElementById('editMiddleName').value.trim(),
        lastName: document.getElementById('editLastName').value.trim(),
        role: document.getElementById('editPosition').value,
        email: document.getElementById('editEmail').value.trim(),
        contactNumber: document.getElementById('editContactNumber').value.trim(),
        status: document.getElementById('editStatus').value
    };
    if (year && month && day) {
        const bd = new Date(year, month - 1, day);
        if (!isNaN(bd.getTime())) {
            updates.birthdate = Timestamp.fromDate(bd);
        }
    } else {
        updates.birthdate = null;
    }
    return updates;
}

function populateEditYears(selectedYear = 2000) {
    const yearSelect = document.getElementById('edit-birth-year');
    if (!yearSelect) return;
    yearSelect.innerHTML = '<option value="">Year</option>';
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 1900; y--) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        if (y === selectedYear) option.selected = true;
        yearSelect.appendChild(option);
    }
}

function populateEditDays(month = 1, year = 2000, selectedDay = 1) {
    const daySelect = document.getElementById('edit-birth-day');
    if (!daySelect) return;
    daySelect.innerHTML = '<option value="">Day</option>';
    if (!month || !year) return;
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        if (i === selectedDay) option.selected = true;
        daySelect.appendChild(option);
    }
}

