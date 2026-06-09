import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

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
// let userEmail = null;

// Forward declaration
let updateMobileAuthSection;

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    // if (currentUser) {
    //     userEmail = currentUser.email;
    //     console.log(`User is ${userEmail}`);
    // } else {
    //     userEmail = null;
    //     console.log('No user is logged in');
    // }
    updateDropdown();
    updateSubmitButtonState();
    if (updateMobileAuthSection) updateMobileAuthSection();
});

// Define mapping from table label -> physical UID
const tableUidMap = {
    IN1: "433E2738",
    IN2: "D3191A38"
};

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

			showNotification("You’ve been logged out.");
			updateDropdown();

            window.location.href = "login.html";
		});

		dropdown.appendChild(profileLink);
		dropdown.appendChild(logoutLink);
	}
}

// Mobile menu functionality
const mobileMenuTrigger = document.getElementById("mobile-menu-trigger");
const mobileDropdown = document.getElementById("mobile-dropdown");
const mobileAuthSection = document.getElementById("mobile-auth-section");

updateMobileAuthSection = function() {
	const authContainer = mobileAuthSection.querySelector('.auth-links') || document.createElement('div');
	authContainer.className = 'auth-links';
	authContainer.innerHTML = "";

	if (!currentUser) {
		const loginLink = document.createElement("a");
		loginLink.href = "login.html";
		loginLink.textContent = "LOGIN";
		authContainer.appendChild(loginLink);
	} else {
		const profileLink = document.createElement("a");
		profileLink.href = "profile.html";
		profileLink.textContent = "VIEW PROFILE";

		const logoutLink = document.createElement("a");
		logoutLink.href = "#";
		logoutLink.textContent = "LOGOUT";
		logoutLink.addEventListener("click", async (e) => {
			e.preventDefault();
			await signOut(auth);
			showNotification("You've been logged out.");
			updateDropdown();
			updateMobileAuthSection();
			mobileDropdown.style.display = "none";
			window.location.href = "login.html";
		});

		authContainer.appendChild(profileLink);
		authContainer.appendChild(logoutLink);
	}

	// Clear existing auth links and add updated ones
	const existingAuthLinks = mobileAuthSection.querySelector('.auth-links');
	if (existingAuthLinks) {
		existingAuthLinks.remove();
	}
	mobileAuthSection.appendChild(authContainer);
}

// Mobile menu toggle
if (mobileMenuTrigger) {
	mobileMenuTrigger.addEventListener("click", (e) => {
		e.stopPropagation();
		const isVisible = mobileDropdown.style.display === "block";
		mobileDropdown.style.display = isVisible ? "none" : "block";
		
		if (!isVisible) {
			updateMobileAuthSection();
		}
	});
}

// Close mobile menu when clicking outside
document.addEventListener("click", (e) => {
	if (mobileDropdown && !mobileMenuTrigger.contains(e.target) && !mobileDropdown.contains(e.target)) {
		mobileDropdown.style.display = "none";
	}
});

function updateSubmitButtonState() {
	const submitButton = document.querySelector('.submit-button');
	if (!submitButton) return;

	if (!currentUser) {
		submitButton.disabled = true;
		submitButton.textContent = "Login Required";
		submitButton.style.backgroundColor = "#ccc";
		submitButton.style.cursor = "not-allowed";
		submitButton.title = "Please log in to check availability";
	} else {
		submitButton.disabled = false;
		submitButton.textContent = "Check Availability";
		submitButton.style.backgroundColor = "#d2691e";
		submitButton.style.cursor = "pointer";
		submitButton.title = "";
	}
}

//------- REMOVED FUNCTIONS---  
// --- UI Elements ---

/*
const indoorButton = document.getElementById('indoor-button');
const outdoorButton = document.getElementById('outdoor-button');
*/

const reservationForm = document.querySelector('.reservation-form');
const resultMessage = document.querySelector('.result-message strong');

// Customer modals
let modalOverlay; // created lazily
function ensureModalOverlay() {
	if (modalOverlay) return modalOverlay;
	modalOverlay = document.createElement('div');
	modalOverlay.style.position = 'fixed';
	modalOverlay.style.left = '0';
	modalOverlay.style.top = '0';
	modalOverlay.style.width = '100%';
	modalOverlay.style.height = '100%';
	modalOverlay.style.background = 'rgba(0,0,0,0.5)';
	modalOverlay.style.display = 'none';
	modalOverlay.style.zIndex = '1000';
	document.body.appendChild(modalOverlay);
	return modalOverlay;
}
function showModal(contentNode) {
	const overlay = ensureModalOverlay();
	overlay.innerHTML = '';
	const modal = document.createElement('div');
	modal.style.position = 'fixed';
	modal.style.top = '50%';
	modal.style.left = '50%';
	modal.style.transform = 'translate(-50%, -50%)';
	modal.style.background = '#fff';
	modal.style.padding = '20px';
	modal.style.width = '90%';
	modal.style.maxWidth = '420px';
	modal.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
	modal.style.fontFamily = 'Montserrat, sans-serif';
	modal.appendChild(contentNode);
	overlay.appendChild(modal);
	overlay.style.display = 'block';
	return overlay;
}
function hideModal() {
	if (modalOverlay) modalOverlay.style.display = 'none';
}

// Track selection
let selectedDate = null;
let selectedTime = null;
let selectedPeople = 0;
let reservedTableIdsForSelection = new Set();
let selectedTableIdsForBooking = new Set(); // NEW: tables user selected for this booking

const PERSONS_PER_TABLE = 4; // capacity per table used for multi-table calculation

// Define per-table capacity (adjust as needed)
const tableCapacity = {
	IN1: 4, IN2: 4, IN3: 4, IN4: 4, IN5: 4, IN6: 4,
	OU1: 4, OU2: 4, OU3: 4, OU4: 4, OU5: 4, OU6: 4
};

function parseAreaFromTableId(tableId) {
	return tableId.startsWith('IN') ? 'inside' : 'outside';
}

/*
function setLayoutVisibility(showInside) {
	const insideLayout = document.getElementById("inside-layout");
	const outsideLayout = document.getElementById("outside-layout");
	insideLayout.style.display = showInside ? "grid" : "none";
	outsideLayout.style.display = showInside ? "none" : "grid";
}
*/

/*
indoorButton.addEventListener("click", function() {
	setLayoutVisibility(false);
});
*/

/*outdoorButton.addEventListener("click", function() {
	setLayoutVisibility(true);
});
*/



// Safe hover behavior: only flip available <-> table-select
function setupHoverHandlers() {
	document.querySelectorAll('.table').forEach(table => {
		const img = table.querySelector('img');
		table.addEventListener('mouseenter', () => {
			if (img.src.includes('available.png')) {
				img.src = img.src.replace('available.png', 'table-select.png');
			}
		});
		table.addEventListener('mouseleave', () => {
			if (img.src.includes('table-select.png')) {
				img.src = img.src.replace('table-select.png', 'available.png');
			}
		});
	});
}

function setAllTablesToAvailable() {
	document.querySelectorAll('.table img').forEach(img => {
		img.src = img.src.replace('reserved.png', 'available.png').replace('table-select.png', 'available.png');
	});
}

function applyReservedToUI(reservedIds) {
	document.querySelectorAll('.table').forEach(table => {
		const img = table.querySelector('img');
		if (reservedIds.has(table.id)) {
			img.src = img.src.replace('available.png', 'reserved.png').replace('table-select.png', 'reserved.png');
		}
	});
}

async function fetchReservedTableIds(dateStr, timeStr) {
    const slot = `${dateStr}T${timeStr}`;
    const reservationsRef = collection(db, 'reservations');
    const q = query(
        reservationsRef,
        where('slot', '==', slot)
    );
    const snap = await getDocs(q);
    const ids = new Set();

    snap.forEach(docSnap => {
        const data = docSnap.data();
        if (!data || data.tableId == null) return;

        // tableId may be stored as array or single value (handle both)
        if (Array.isArray(data.tableId)) {
            data.tableId.forEach(t => {
                if (t != null) ids.add(String(t).trim());
            });
        } else if (typeof data.tableId === 'string' || typeof data.tableId === 'number') {
            ids.add(String(data.tableId).trim());
        } else if (typeof data.tableId === 'object' && data.tableId.toString) {
            // fallback for odd serializations
            ids.add(String(data.tableId).trim());
        }
    });

    return ids;
}

function formatResultMessage(people, dateStr, timeStr) {
	try {
		const [yy, mm, dd] = dateStr.split('-');
		const date = new Date(`${yy}-${mm}-${dd}T${timeStr}`);
		const options = { hour: '2-digit', minute: '2-digit' };
		const timePretty = date.toLocaleTimeString([], options);
		return `Available tables for ${people} person(s) on ${mm}-${dd}-${yy} at ${timePretty}.`;
	} catch (e) {
		return `Available tables for ${people} person(s) on ${dateStr} at ${timeStr}.`;
	}
}

async function checkAvailability(dateStr, timeStr, people) {
	reservedTableIdsForSelection = await fetchReservedTableIds(dateStr, timeStr);
	
	// Clear any previous selections when checking new availability
	selectedTableIdsForBooking.clear();
	
	setAllTablesToAvailable();
	applyReservedToUI(reservedTableIdsForSelection);
	updateSelectedUI(); // This will also update instructions
	
	if (resultMessage) {
		resultMessage.textContent = formatResultMessage(people, dateStr, timeStr);
	}
}

function ensureSelectionSet() {
    if (!selectedDate || !selectedTime || !selectedPeople) {
        showInfoModal('Please choose date, time, and number of people, then click "Check Availability".');
        return false;
    }
    return true;
}

function showInfoModal(message) {
	const content = document.createElement('div');
	content.innerHTML = `
		<div style="font-weight:700;margin-bottom:10px;">Info</div>
		<div style="margin-bottom:16px;">${message}</div>
		<div style="display:flex;justify-content:flex-end;gap:10px;">
			<button id="infoOkBtn" style="padding:8px 12px;background:#2B193C;color:#fff;border:2px solid #2B193C;font-weight:600;cursor:pointer;font-family:Montserrat, sans-serif;">OK</button>
		</div>
	`;
	showModal(content);
	document.getElementById('infoOkBtn').addEventListener('click', hideModal);
}

function showNameConfirmModal(tableId, onConfirm) {
	const content = document.createElement('div');
	content.innerHTML = `
		<div style="font-weight:700;margin-bottom:10px;">Confirm Reservation</div>
		<label style="display:block;margin-bottom:6px;">Reservation Name</label>
		<input id="reservationNameInput" type="text" placeholder="Mr. Gulper" style="width:calc(100% - 12px);padding:10px;border:1px solid #2B193C;margin-bottom:12px;box-sizing:border-box;"/>
		<div style="display:flex;justify-content:flex-end;gap:10px;">
			<button id="nameCancelBtn" style="padding:8px 12px;border:2px solid #2B193C;font-weight:600;cursor:pointer;font-family:Montserrat, sans-serif;">Cancel</button>
			<button id="nameConfirmBtn" style="padding:8px 12px;background:#2B193C;color:#fff;border:2px solid #2B193C;font-weight:600;cursor:pointer;font-family:Montserrat, sans-serif;">Confirm</button>
		</div>
	`;
	showModal(content);
	document.getElementById('nameCancelBtn').addEventListener('click', hideModal);
	document.getElementById('nameConfirmBtn').addEventListener('click', () => {
		const name = (document.getElementById('reservationNameInput').value || '').trim();
		if (!name) return; // keep modal open until filled
		hideModal();
		onConfirm(name);
    });
}

// Enhanced helper: update UI for selected tables with better visual feedback
function updateSelectedUI() {
    document.querySelectorAll('.table').forEach(table => {
        const img = table.querySelector('img');
        const id = table.id;
        if (!img) return;
        
        // Remove all selection classes first
        table.classList.remove('selected');
        
        if (reservedTableIdsForSelection.has(id)) {
            // Reserved tables - show as reserved
            img.src = img.src.replace('available.png', 'reserved.png').replace('table-select.png', 'reserved.png');
        } else if (selectedTableIdsForBooking.has(id)) {
            // Selected tables - show as selected with enhanced styling
            img.src = img.src.replace('available.png', 'table-select.png').replace('reserved.png', 'table-select.png');
            table.classList.add('selected');
        } else {
            // Available tables
            img.src = img.src.replace('reserved.png', 'available.png').replace('table-select.png', 'available.png');
        }
    });
    
    // Update selection instructions
    updateSelectionInstructions();
}

// Add visual instructions for table selection
function updateSelectionInstructions() {
    const needed = requiredTablesCount();
    const selected = selectedTableIdsForBooking.size;
    
    let instructionText = '';
    if (needed > 1) {
        if (selected === 0) {
            instructionText = `Select ${needed} table(s) for ${selectedPeople} people. Click on available tables to select them.`;
        } else if (selected < needed) {
            instructionText = `Selected ${selected} of ${needed} table(s). Click on another available table to continue.`;
        } else {
            instructionText = `All ${needed} table(s) selected! Click "Confirm" to proceed with your reservation.`;
        }
    } else {
        instructionText = `Click on an available table to select it for your reservation.`;
    }
    
    // Update or create instruction element
    let instructionElement = document.getElementById('selection-instructions');
    if (!instructionElement) {
        instructionElement = document.createElement('div');
        instructionElement.id = 'selection-instructions';
        instructionElement.style.cssText = `
            margin: 15px 0;
            padding: 10px 15px;
            background: #f8f9fa;
            border-left: 4px solid #2B193C;
            border-radius: 4px;
            font-size: 14px;
            color: #333;
            text-align: left;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
        `;
        
        // Insert after the result message
        const resultMessage = document.querySelector('.result-message');
        if (resultMessage) {
            resultMessage.parentNode.insertBefore(instructionElement, resultMessage.nextSibling);
        }
    }
    
    instructionElement.textContent = instructionText;
}
// number of tables required for current party
function requiredTablesCount() {
    return Math.ceil(Math.max(1, selectedPeople) / PERSONS_PER_TABLE);
}

async function handleTableClick(event) {
const tableDiv = event.currentTarget;
const tableId = tableDiv.id;
const capacity = tableCapacity[tableId] || PERSONS_PER_TABLE;
const img = tableDiv.querySelector('img');

if (!ensureSelectionSet()) return;

// If this table is reserved for selected slot, show info and don't allow selecting it
if (reservedTableIdsForSelection.has(tableId) || (img && img.src.includes('reserved.png'))) {
    showInfoModal('Sorry, this table is already reserved for the selected time.');
    return;
}

// Determine how many tables needed
const needed = requiredTablesCount();

// Toggle selection
if (selectedTableIdsForBooking.has(tableId)) {
    selectedTableIdsForBooking.delete(tableId);
} else {
    // prevent selecting more than needed
    if (selectedTableIdsForBooking.size >= needed) {
        showInfoModal(`You only need to select ${needed} table(s) for ${selectedPeople} people. Deselect a table first to choose a different one.`);
        return;
    }
    selectedTableIdsForBooking.add(tableId);
}

// reflect UI
updateSelectedUI();

// If we've selected required number of tables, prompt to enter reservation name & confirm
if (selectedTableIdsForBooking.size === needed) {
    // Ask for name and then create one reservation document per selected table
    showNameConfirmModal(Array.from(selectedTableIdsForBooking).join(', '), async (name) => {
        const confirmationText = `Confirm reservation?\n\nTables: ${Array.from(selectedTableIdsForBooking).join(', ')}\nDate: ${selectedDate}\nTime: ${selectedTime}\nPeople: ${selectedPeople}\nName: ${name}`;
        const content = document.createElement('div');
        content.innerHTML = `
            <div style="font-weight:700;margin-bottom:10px;">Confirm Details</div>
            <pre style="white-space:pre-wrap;font-family:inherit;margin:0 0 12px 0;">${confirmationText}</pre>
            <div style="display:flex;justify-content:flex-end;gap:10px;">
                <button id="reserveCancelBtn" style="padding:8px 12px;border:2px solid #2B193C;font-weight:600;cursor:pointer;font-family:Montserrat, sans-serif;">Cancel</button>
                <button id="reserveOkBtn" style="padding:8px 12px;background:#2B193C;color:#fff;border:2px solid #2B193C;font-weight:600;cursor:pointer;font-family:Montserrat, sans-serif;">Confirm</button>
            </div>
        `;
        showModal(content);
        document.getElementById('reserveCancelBtn').addEventListener('click', () => {
            hideModal();
        });
        document.getElementById('reserveOkBtn').addEventListener('click', async () => {
            try {
                // create ONE reservation document for all selected tables
                const tablesToBook = Array.from(selectedTableIdsForBooking);
                const uids = tablesToBook.map(tId => tableUidMap[tId] || "00000000");
                const area = tablesToBook.length === 1 ? parseAreaFromTableId(tablesToBook[0]) : 'mixed';

                await addDoc(collection(db, 'reservations'), {
                    userId: currentUser ? currentUser.uid : null,
                    email: currentUser ? currentUser.email : null,
                    name,
                    tableId: tablesToBook,      // store array of table ids
                    uid: uids,                 // store array of physical uids
                    area,
                    date: selectedDate,
                    time: selectedTime,
                    slot: `${selectedDate}T${selectedTime}`,
                    people: selectedPeople,    // total party size
                    status: 'booked',
                    createdAt: serverTimestamp()
                });

                // --- Call backend to send email via SMTP ---
                if (currentUser?.email) {
                    const tablesPretty = Array.from(selectedTableIdsForBooking).length
                        ? Array.from(selectedTableIdsForBooking).join(', ')
                        : tablesToBook.join(', ');
                    const subject = 'Reservation Confirmation';
                    const html = `<strong>Gulpers' Restaurant Reservation</strong><br><br>` +
                        `Thank you for trusting The Gulpers' Restaurant! We have received your reservation request.<br>` +
                        `We are looking forward to seeing you in the restaurant!<br><br>` +
                        `<strong>Your Reservation Details:</strong><br>` +
                        `<strong>Name:</strong> ${name}<br>` +
                        `<strong>Date:</strong> ${selectedDate}<br>` +
                        `<strong>Time:</strong> ${selectedTime}<br>` +
                        `<strong>People:</strong> ${selectedPeople}<br>` +
                        `<strong>Table(s):</strong> ${tablesPretty}<br><br>` +
                        `Should there be any incorrect information, feel free to modify your reservation in your profile.<br><br>` +
                        `<strong>This is a no-reply email. Please do not respond.</strong>`;

                    fetch("php/smtp-email.php", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            email: currentUser.email,
                            name,
                            subject,
                            html
                        })
                    })
                    .then(async r => {
                        const text = await r.text();
                        try {
                            const res = JSON.parse(text);
                            console.log("Email status:", res);
                        } catch (e) {
                            console.error("Email response is not valid JSON:", text);
                        }
                    })
                    .catch(err => console.error("Email error:", err));
                }

                // mark these tables reserved locally
                for (const tId of tablesToBook) reservedTableIdsForSelection.add(tId);

                    // clear selection set after booking
                    selectedTableIdsForBooking.clear();
                    updateSelectedUI();
                    hideModal();
                    showInfoModal('Reservation confirmed!');
                } catch (e) {
                    console.error('Reservation error:', e);
                    hideModal();
                    showInfoModal('Failed to reserve table(s). Please try again.');
                }
            });
        });
    }
}

// Form handling: prevent submit and run availability check
if (reservationForm) {
	reservationForm.addEventListener('submit', async (e) => {
		e.preventDefault();

		// Check if user is logged in
		if (!currentUser) {
			showInfoModal('Please log in to check table availability and make reservations.');
			return;
		}

		const formData = new FormData(reservationForm);
		const dateStr = formData.get('date');
		const timeStr = formData.get('time');
		const people = parseInt(formData.get('people') || '0', 10);

		if (!dateStr || !timeStr || !people) {
			showInfoModal('Please fill date, time, and number of people.');
			return;
		}

		selectedDate = dateStr;
		selectedTime = timeStr;
		selectedPeople = people;
		await checkAvailability(selectedDate, selectedTime, selectedPeople);
	});
}

// Data and Time limits based on restaurant policy
(function() {
    const pad = n => String(n).padStart(2, '0');

    // Date: min = tomorrow (strictly AFTER today) and max = one month from today
    const dateInput = document.querySelector('input[name="date"]');
    if (dateInput) {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);

        // max = one month from today (same day next month)
        const maxDate = new Date(now);
        maxDate.setMonth(now.getMonth() + 1);

        const minDate = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
        const maxDateStr = `${maxDate.getFullYear()}-${pad(maxDate.getMonth() + 1)}-${pad(maxDate.getDate())}`;

        dateInput.min = minDate;
        dateInput.max = maxDateStr;
        dateInput.value = minDate;
    }

    // Time: only X:00 or X:30 from 11:00 to 18:00 inclusive
    const timeInput = document.querySelector('input[name="time"]');
    if (timeInput) {
        // build allowed times (hourly: 11:00, 12:00, ..., 18:00)
        const startHour = 11;
        const endHour = 18;
        const allowedTimes = [];
        for (let h = startHour; h <= endHour; h++) {
            allowedTimes.push(`${pad(h)}:00`);
        }

        // create or reuse a datalist for the allowed options so browser pickers show only allowed slots
        let dl = document.getElementById('allowedTimesDatalist');
        if (!dl) {
            dl = document.createElement('datalist');
            dl.id = 'allowedTimesDatalist';
            document.body.appendChild(dl);
        }
        dl.innerHTML = allowedTimes.map(t => `<option value="${t}"></option>`).join('');
        timeInput.setAttribute('list', 'allowedTimesDatalist');

        // enforce allowed value on input and blur (snap/replace invalid entries)
        if (!timeInput.value || !allowedTimes.includes(timeInput.value)) {
            timeInput.value = allowedTimes[0];
        }

        // prefer hourly step
        timeInput.step = 3600;

        timeInput.addEventListener('input', () => {
            const v = (timeInput.value || '').trim();
            if (allowedTimes.includes(v)) return;

            // attempt to normalize user input like "1300" or "13:20"
            const m = v.match(/^(\d{1,2}):?(\d{1,2})?$/);
            if (m) {
                let hh = parseInt(m[1], 10);
                let mm = m[2] ? parseInt(m[2], 10) : 0;
                if (isNaN(hh) || isNaN(mm)) { timeInput.value = allowedTimes[0]; return; }

                // round: any minutes >=30 push to next hour, otherwise keep same hour; result minute is 00
                if (mm >= 30) hh = hh + 1;
                // clamp hour to range
                if (hh < startHour) hh = startHour;
                if (hh > endHour) hh = endHour;

                const candidate = `${pad(hh)}:00`;
                if (allowedTimes.includes(candidate)) {
                    timeInput.value = candidate;
                    return;
                }
            }

            // fallback: reset to first allowed slot
            timeInput.value = allowedTimes[0];
        });

        timeInput.addEventListener('blur', () => {
            if (!allowedTimes.includes(timeInput.value)) {
                timeInput.value = allowedTimes[0];
            }
        });

        // Prevent obviously invalid keystrokes (allow digits, colon, backspace, arrows)
        timeInput.addEventListener('keydown', (ev) => {
            const allowedKeys = [
                'Backspace','ArrowLeft','ArrowRight','Tab','Delete','Home','End'
            ];
            if (allowedKeys.includes(ev.key)) return;
            if (/^[0-9:]$/.test(ev.key)) return;
            ev.preventDefault();
        });
    }

    // Extra client-side validation to guard against manual typing
    const form = document.querySelector('.reservation-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            const dateVal = form.querySelector('input[name="date"]')?.value;
            const timeVal = form.querySelector('input[name="time"]')?.value;
            if (!dateVal || !timeVal) return; // let existing checks handle empty fields

            // Ensure date is strictly after today
            const selectedDate = new Date(dateVal + 'T00:00:00');
            const today = new Date();
            today.setHours(0,0,0,0);
            if (selectedDate <= today) {
                e.preventDefault();
                alert('Please choose a date after today.');
                return;
            }

            // Ensure time is one of the allowed slots
            const [hhStr, mmStr] = timeVal.split(':');
            const hh = parseInt(hhStr, 10);
            const mm = parseInt(mmStr, 10);
            const validMinutes = (mm === 0 || mm === 30);
            if (isNaN(hh) || isNaN(mm) || hh < 11 || hh > 18 || !validMinutes || (hh === 18 && mm !== 0)) {
                e.preventDefault();
                alert('Please choose a time between 11:00 and 18:00, at :00 or :30 only.');
                return;
            }
        });
    }
})();

// Initial setup
setupHoverHandlers();
attachTableClickHandlers();
updateSubmitButtonState();

// // Default to showing inside layout
// setLayoutVisibility(true);

// attach click handlers to each table element
function attachTableClickHandlers() {
    document.querySelectorAll('.table').forEach(table => {
        // ensure previous listener removed to avoid duplicates
        table.removeEventListener('click', handleTableClick);
        table.addEventListener('click', handleTableClick);
    });
}

// Simple notification function
function showNotification(message) {
    // Create a simple alert for now - can be enhanced with toast notifications later
    alert(message);
}