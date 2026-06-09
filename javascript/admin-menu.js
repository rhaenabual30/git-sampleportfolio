import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getFirestore, collection, query, orderBy, onSnapshot, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const openBtn = document.getElementById("openCategories");
const modal = document.getElementById("categoriesModal");
const closeBtn = document.getElementById("closeCategories");

openBtn.onclick = () => {
    modal.style.display = "block";
};

closeBtn.onclick = () => {
    modal.style.display = "none";
};

window.onclick = (event) => {
    if (event.target === modal) {
        modal.style.display = "none";
    }
};

// Table body reference
const tableBody = document.querySelector(".menu-table-container tbody");

/////////////////
// Add Product //
/////////////////

// Add Product Modal open/close
const addProductModal = document.getElementById("addProductModal");
const openAddProductBtn = document.querySelector(".btn.add");
const closeAddProductBtn = document.getElementById("closeAddProduct");

openAddProductBtn.addEventListener("click", () => {
  addProductModal.style.display = "block";
  loadCategories(); // load categories every time modal opens
});

closeAddProductBtn.addEventListener("click", () => {
  addProductModal.style.display = "none";
});

// Close modal if clicked outside
window.addEventListener("click", (e) => {
  if (e.target === addProductModal) {
    addProductModal.style.display = "none";
  }
});

// Add Product Form
document.getElementById("addProductForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("productName").value;
    const fileInput = document.getElementById("productImageFile");
    const file = fileInput?.files?.[0];
    const price = parseFloat(document.getElementById("productPrice").value);
    const description = document.getElementById("productDescription").value;
    const minPax = parseInt(document.getElementById("productMinPax").value || "0", 10);
    const maxPax = parseInt(document.getElementById("productMaxPax").value || "0", 10);
    const categoryValue = document.getElementById("productCategory").value;
    const date = document.getElementById("productDate").value;
    const time = document.getElementById("productTime").value;
    const status = document.getElementById("productStatus").value;

    if (!categoryValue) {
        alert("Please select a category.");
        return;
    }

    const categoryObj = JSON.parse(categoryValue);
    const category = {
        category_name: categoryObj.name,
        category_uid: categoryObj.uid
    };

    if (!file) {
        alert("Please choose an image to upload.");
        return;
    }

    try {
        // Generate a new doc reference with UID
        const newProductRef = doc(collection(db, "products"));

        // Upload the file to local PHP endpoint
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('php/upload-image.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            const msg = result && result.error ? result.error : `Upload failed (${response.status})`;
            alert(msg);
            return;
        }

        const imageUrl = result.url; // relative URL like assets/uploads/products/...

        await setDoc(newProductRef, {
        uid: newProductRef.id,  // store the UID inside the document
        name,
        imageUrl,
        price,
        description,
        minPax,
        maxPax,
        category,
        date,
        time,
        status,
        createdAt: new Date()
        });

        alert("✅ Product added successfully!");
        addProductModal.style.display = "none";
        e.target.reset();
    } catch (error) {
        console.error("Error adding product:", error);
        alert("Failed to add product. Check console for details.");
    }
});

document.getElementById("productDateTimeNow").addEventListener("click", () => {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    document.getElementById("productDate").value = `${year}-${month}-${day}`;

    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    document.getElementById("productTime").value = `${hours}:${minutes}`;
});

//////////////////
// Edit Product //
//////////////////

const editProductModal = document.getElementById("editProductModal");
const closeEditModal = document.getElementById("closeEditModal");
const editProductForm = document.getElementById("editProductForm");
const editCategorySelect = document.getElementById("editCategory");

let currentEditId = null;

// Open modal when "More" is clicked
tableBody.addEventListener("click", async (e) => {
	if (e.target.classList.contains("more-btn")) {
		currentEditId = e.target.dataset.id;

		// Fetch product data
		const docRef = doc(db, "products", currentEditId);
		const docSnap = await getDoc(docRef);

		if (docSnap.exists()) {
			const product = docSnap.data();

			// Fill form
			document.getElementById("editName").value = product.name || "";
			document.getElementById("editPrice").value = product.price || "";
			document.getElementById("editDate").value = product.date || "";
			document.getElementById("editTime").value = product.time || "";
			document.getElementById("editDescription").value = product.description || "";
			document.getElementById("editMinPax").value = product.minPax || "";
			document.getElementById("editMaxPax").value = product.maxPax || "";

			// Load categories into dropdown
			await loadCategoriesForEdit(product.category?.category_uid);

			// Prefill status
			const editStatus = document.getElementById("editStatus");
			if (editStatus) editStatus.value = (product.status || 'in_stock');

			editProductModal.style.display = "flex";
		}
	}
});

// Close modal
closeEditModal.addEventListener("click", () => {
	editProductModal.style.display = "none";
});

// Handle Save Changes
editProductForm.addEventListener("submit", async (e) => {
	e.preventDefault();

	if (!currentEditId) return;

	// Get selected category
	const selectedCategory = editCategorySelect.options[editCategorySelect.selectedIndex];
	const categoryName = selectedCategory.text;
	const categoryUid = selectedCategory.value;

	// Update Firestore
	await updateDoc(doc(db, "products", currentEditId), {
		name: document.getElementById("editName").value,
		price: parseFloat(document.getElementById("editPrice").value),
		date: document.getElementById("editDate").value,
		time: document.getElementById("editTime").value,
		description: document.getElementById("editDescription").value,
		minPax: parseInt(document.getElementById("editMinPax").value || "0", 10),
		maxPax: parseInt(document.getElementById("editMaxPax").value || "0", 10),
		status: document.getElementById("editStatus").value,
		category: {
			category_name: categoryName,
			category_uid: categoryUid
		}
	});

	editProductModal.style.display = "none";
});

// Edit Product Modal "Now" Button
document.addEventListener("DOMContentLoaded", () => {
    const nowBtn = document.getElementById("productEditDateTimeNow");
    const dateInput = document.getElementById("productEditDate");
    const timeInput = document.getElementById("productEditTime");

    if (nowBtn && dateInput && timeInput) {
        nowBtn.addEventListener("click", () => {
            const now = new Date();

            // Format YYYY-MM-DD
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, "0");
            const day = String(now.getDate()).padStart(2, "0");
            dateInput.value = `${year}-${month}-${day}`;

            // Format HH:MM (24-hour)
            const hours = String(now.getHours()).padStart(2, "0");
            const minutes = String(now.getMinutes()).padStart(2, "0");
            timeInput.value = `${hours}:${minutes}`;
        });
    }
});

///////////////////////
// Checkbox Function //
///////////////////////

// Multiple selection of products
document.addEventListener("DOMContentLoaded", () => {
	const selectAllCheckbox = document.getElementById("select-all");
	const table = document.querySelector(".menu-table-container");
	
	// Listen for "Select All" toggle
	selectAllCheckbox.addEventListener("change", () => {
		const rowCheckboxes = table.querySelectorAll("tbody input[type='checkbox']");
		rowCheckboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
	});

	// Listen for row checkbox changes to update "Select All"
	table.addEventListener("change", (e) => {
		if (e.target.matches("tbody input[type='checkbox']")) {
			const rowCheckboxes = table.querySelectorAll("tbody input[type='checkbox']");
			const allChecked = Array.from(rowCheckboxes).every(cb => cb.checked);
			const someChecked = Array.from(rowCheckboxes).some(cb => cb.checked);

			// Update "Select All" state
			selectAllCheckbox.checked = allChecked;
			selectAllCheckbox.indeterminate = !allChecked && someChecked;
		}
	});
});

/////////////////////
// Delete Function //
/////////////////////

// Target the "Delete Product" button specifically (in the header buttons container)
document.addEventListener("DOMContentLoaded", () => {
	const deleteBtn = document.querySelector(".btn.delete"); 
	const table = document.querySelector(".menu-table-container");

	deleteBtn.addEventListener("click", async () => {
		const rowCheckboxes = table.querySelectorAll("tbody input[type='checkbox']:checked");

		if (rowCheckboxes.length === 0) {
			alert("Please select at least one product to delete.");
			return;
		}

		if (!confirm(`Are you sure you want to delete ${rowCheckboxes.length} product(s)?`)) {
			return;
		}

		try {
			for (const checkbox of rowCheckboxes) {
				const docId = checkbox.getAttribute("data-id"); // ✅ FIXED: read directly from checkbox

				if (docId) {
					await deleteDoc(doc(db, "products", docId));
					console.log(`Deleted product: ${docId}`);
				}
			}
			alert("Selected products deleted successfully.");
		} catch (error) {
			console.error("Error deleting products: ", error);
			alert("Failed to delete some products. Check console for details.");
		}
	});
});

////////////////////
// Category Modal //
////////////////////

document.addEventListener("DOMContentLoaded", () => {
    const tableBody = document.querySelector(".categories-table tbody");

    // Edit modal elements
    const editModal = document.getElementById("editCategoryModal");
    const closeEditBtn = document.getElementById("closeEditCategory");
    const editForm = document.getElementById("editCategoryForm");
    const deleteBtn = document.getElementById("deleteCategory");

    const editName = document.getElementById("editName");
    const editDescription = document.getElementById("editDescription");
    const editDate = document.getElementById("editDate");
    const editTime = document.getElementById("editTime");

    let currentDocId = null;

    // Query categories, latest first
    const categoriesQuery = query(
        collection(db, "categories"),
        orderBy("date", "desc"),
        orderBy("time", "desc")
    );

    onSnapshot(categoriesQuery, (snapshot) => {
        tableBody.innerHTML = "";

        snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        // Format time for table
        let formattedTime = data.time;
        if (formattedTime && formattedTime.includes(":")) {
            const [hour, minute] = formattedTime.split(":");
            let h = parseInt(hour, 10);
            const ampm = h >= 12 ? "PM" : "AM";
            h = h % 12 || 12;
            formattedTime = `${h}:${minute} ${ampm}`;
        }

        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${data.name || ""}</td>
            <td>${data.description || ""}</td>
            <td>${data.date || ""}</td>
            <td>${formattedTime || ""}</td>
            <td><img src="assets/images/icons/more.png" class="icon more-icon" data-id="${docSnap.id}"></td>
        `;

        tableBody.appendChild(row);
        });

        // Attach click listeners for "More" buttons
        document.querySelectorAll(".more-icon").forEach((icon) => {
            icon.addEventListener("click", async (e) => {
                currentDocId = e.target.getAttribute("data-id");
                const docRef = doc(db, "categories", currentDocId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                const cat = docSnap.data();

                // Fill modal inputs
                editName.value = cat.name || "";
                editDescription.value = cat.description || "";
                editDate.value = cat.date || "";
                editTime.value = cat.time || "";

                // Show modal
                editModal.style.display = "block";
                }
            });
        });
    });

    // Close modal
    closeEditBtn.addEventListener("click", () => {
        editModal.style.display = "none";
        currentDocId = null;
    });

    // Save Changes
    editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentDocId) return;

        try {
        await updateDoc(doc(db, "categories", currentDocId), {
            name: editName.value.trim(),
            description: editDescription.value.trim(),
            date: editDate.value,
            time: editTime.value
        });
        alert("Category updated!");
        editModal.style.display = "none";
        } catch (err) {
        console.error("Error updating category: ", err);
        alert("Failed to update category.");
        }
    });

    // Delete Category
    deleteBtn.addEventListener("click", async () => {
        if (!currentDocId) return;
        if (!confirm("Are you sure you want to delete this category?")) return;

        try {
        await deleteDoc(doc(db, "categories", currentDocId));
        alert("Category deleted!");
        editModal.style.display = "none";
        currentDocId = null;
        } catch (err) {
        console.error("Error deleting category: ", err);
        alert("Failed to delete category.");
        }
    });
});

// Add Category "NOW" Button
document.addEventListener("DOMContentLoaded", () => {
    const nowBtn = document.getElementById("date-time-now");
    const dateInput = document.getElementById("date");
    const timeInput = document.getElementById("time");

    nowBtn.addEventListener("click", () => {
        const now = new Date();

        // Format YYYY-MM-DD
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        dateInput.value = `${year}-${month}-${day}`;

        // Format HH:MM (24-hour, since <input type="time"> requires it)
        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");
        timeInput.value = `${hours}:${minutes}`;
    });
});

/////////////////////////
// Edit Category Modal //
/////////////////////////

// Edit Category "NOW" Button
document.addEventListener("DOMContentLoaded", () => {
    const nowBtn = document.getElementById("edit-date-time-now");
    const dateInput = document.getElementById("editDate");
    const timeInput = document.getElementById("editTime");

    nowBtn.addEventListener("click", () => {
        const now = new Date();

        // Format YYYY-MM-DD
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        dateInput.value = `${year}-${month}-${day}`;

        // Format HH:MM (24-hour, since <input type="time"> requires it)
        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");
        timeInput.value = `${hours}:${minutes}`;
    });
});

// Handle form submission
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("addCategoryForm");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const categoryName = document.getElementById("categoryName").value.trim();
        const description = document.getElementById("description").value.trim();
        const date = document.getElementById("date").value;
        const time = document.getElementById("time").value;

        try {
            // Create a new doc reference with random ID
            const newDocRef = doc(collection(db, "categories"));
            const uid = newDocRef.id;

            await setDoc(newDocRef, {
                uid: uid,  // store the random doc ID inside the doc
                name: categoryName,
                description: description,
                date: date,
                time: time,
                createdAt: new Date()
            });

            alert("Category saved successfully!");
            form.reset();
        } catch (err) {
            console.error("Error adding category: ", err);
            alert("Error saving category!");
        }
    });
});

///////////////
// Functions //
///////////////

// Load categories into the Add Product modal
async function loadCategories() {
    const categorySelect = document.getElementById("productCategory");
    categorySelect.innerHTML = '<option value="">-- Select Category --</option>';

    try {
        const querySnapshot = await getDocs(collection(db, "categories"));
        querySnapshot.forEach((doc) => {
        const category = doc.data();
        const option = document.createElement("option");
        option.value = JSON.stringify({ uid: doc.id, name: category.name }); 
        option.textContent = category.name;
        categorySelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading categories:", error);
    }
}

// Load products from Firestore Real-time
async function loadProducts() {
	const productsRef = collection(db, "products");

	onSnapshot(productsRef, (snapshot) => {
		tableBody.innerHTML = ""; // clear old rows first

		if (snapshot.empty) {
			// Show message if no products exist
			const row = document.createElement("tr");
			row.innerHTML = `
				<td colspan="8" style="text-align: center; padding: 20px; color: #888;">
					No products listed. Add products to start.
				</td>
			`;
			tableBody.appendChild(row);
			return;
		}

		snapshot.forEach((doc) => {
			const product = doc.data();

			// Handle category map properly
			let categoryName = product.category?.category_name || "—";
			let categoryUid = product.category?.category_uid || "";

			// Format price
			let price = product.price ? `₱${Number(product.price).toFixed(2)}` : "—";

			// Create row
			const row = document.createElement("tr");
			row.classList.add("menu-row");

			row.innerHTML = `
				<td><input type="checkbox" data-id="${doc.id}"></td>
				<td>${product.name || "—"}</td>
				<td>
					<img src="${product.imageUrl || "assets/images/placeholders/placeholder.png"}" 
						alt="Food" 
						style="width: 60px; height: 60px; object-fit: cover; aspect-ratio: 1 / 1; border-radius: 6px;">
				</td>
                <td>${product.description ? product.description : "—"}</td>
				<td>${categoryName}</td>
				<td>${price}</td>
				<td>${(product.status === 'in_stock' ? 'In Stock' : (product.status === 'out_of_stock' ? 'Out of Stock' : '—'))}</td>
				<td>${product.date || "—"}</td>
				<td>${product.time || "—"}</td>
				<td>
					<img src="assets/images/icons/more.png" 
						class="icon more-btn" 
						data-id="${doc.id}">
				</td>
			`;

			tableBody.appendChild(row);
		});
	});
}

// Load categories for edit dropdown
async function loadCategoriesForEdit(selectedId) {
	editCategorySelect.innerHTML = "";

	const querySnap = await getDocs(collection(db, "categories"));
	querySnap.forEach((doc) => {
		const option = document.createElement("option");
		option.value = doc.id;
		option.textContent = doc.data().name;
		if (doc.id === selectedId) {
			option.selected = true;
		}
		editCategorySelect.appendChild(option);
	});
}

//////////////////
// On page load //
//////////////////

document.addEventListener("DOMContentLoaded", loadProducts);