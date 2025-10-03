// Product management functionality for the inventory system

// Global variables for product management
let allProductsData = [];
let selectedProductId = null;

// Make selectedProductId globally accessible
window.selectedProductId = selectedProductId;

/**
 * Animate product row in (without the gray-to-white highlight effect)
 * @param {HTMLElement} row - Table row element to animate
 */
function animateProductRowIn(row) {
    row.getBoundingClientRect();
    row.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_HIDDEN);
    row.classList.add(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_ANIMATE_IN);
    
    setTimeout(() => {
        // Remove the animation class without adding the loaded class
        // This prevents the gray-to-white highlight animation
        row.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_ANIMATE_IN);
    }, INVENTORY_CONFIG.ANIMATION.ANIMATION_DURATION);
}

/**
 * Load and display products data
 */
async function loadProductsData() {
    const container = document.getElementById('inventoryTable');
    
    try {
        container.innerHTML = createLoadingHTML('Loading products database...');
        
        await waitForPywebview();
        await new Promise(resolve => setTimeout(resolve, INVENTORY_CONFIG.ANIMATION.LOADING_DELAY));
        
        const productsData = await pywebview.api.get_products_data();
        
        container.querySelector('.loading-text').textContent = 'Rendering product entries...';
        await new Promise(resolve => setTimeout(resolve, INVENTORY_CONFIG.ANIMATION.RENDER_DELAY));
        
        displayProductsTable(productsData);
        
    } catch (error) {
        console.error(ERROR_MESSAGES.LOAD_PRODUCTS_FAILED, error);
        handleProductsLoadError(container, error);
    }
}

/**
 * Display message when no products are available
 * @param {HTMLElement} container - Container element to show message in
 */
function displayNoProductsMessage(container) {
    container.innerHTML = '';
}

/**
 * Handle products loading error
 * @param {HTMLElement} container - Container element to show error in
 * @param {Error} error - The error that occurred
 */
function handleProductsLoadError(container, error) {
    if (error.message.includes('Pywebview API not available')) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <p><strong>API Connection Issue</strong></p>
                <p>The database connection is not yet available.</p>
                <button onclick="loadProductsData()" style="
                    padding: 10px 20px; 
                    background: #be1d2b; 
                    color: white; 
                    border: none; 
                    border-radius: 5px; 
                    cursor: pointer;
                ">Retry</button>
            </div>
        `;
    } else {
        container.innerHTML = createErrorHTML(`${ERROR_MESSAGES.LOAD_PRODUCTS_FAILED}: ${error.message}`, 'loadProductsData');
    }
}

/**
 * Display products data in a table
 * @param {Array} data - Array of product data
 */
function displayProductsTable(data) {
    const container = document.getElementById('inventoryTable');
    
    if (!data || data.length === 0) {
        displayNoProductsMessage(container);
        return;
    }
    
    // Store data globally for search functionality
    allProductsData = [...data];
    window.allProductsData = allProductsData; // Make available to search module
    
    // Create the table structure for products
    const tableHTML = createProductsTableHTML();
    container.innerHTML = tableHTML;
    
    initializeSearch();
    animateProductsRows(allProductsData);
}

/**
 * Create HTML structure for products table
 * @returns {string} HTML for products table
 */
function createProductsTableHTML() {
    return `
        <table class="inventory-table">
            <thead>
                <tr>
                    <th>Product Name</th>
                    <th>Batch</th>
                    <th>Date Mixed</th>
                    <th>Total Cost</th>
                    <th>Quantity</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="productsTableBody">
            </tbody>
        </table>
    `;
}

/**
 * Animate products rows loading in
 * @param {Array} data - Array of product data
 */
async function animateProductsRows(data) {
    const tbody = document.getElementById('productsTableBody');
    
    for (let index = 0; index < data.length; index++) {
        const product = data[index];
        const row = await createProductRow(product, index);
        tbody.appendChild(row);
        
        // Trigger animation after a delay
        setTimeout(() => {
            animateProductRowIn(row);
        }, index * INVENTORY_CONFIG.ANIMATION.ROW_DELAY);
    }
}

/**
 * Create a product row element
 * @param {Object} product - Product data
 * @param {number} index - Row index
 * @returns {HTMLElement} Table row element
 */
async function createProductRow(product, index) {
    const row = document.createElement('tr');
    row.classList.add(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_HIDDEN);
    row.style.cursor = 'pointer';
    row.dataset.productId = product.id;
    
    const dateMixed = formatDate(product.date_mixed);
    const totalCost = formatCurrency(product.total_cost);
    const totalQuantity = formatQuantity(product.total_quantity);
    
    row.innerHTML = `
        <td><strong>${product.product_name}</strong></td>
        <td>${product.batch_number}</td>
        <td>${dateMixed}</td>
        <td class="price">${totalCost}</td>
        <td class="quantity">${totalQuantity}</td>
        <td>
            <div class="product-actions">
                <button class="product-edit-button" 
                        onclick="event.stopPropagation(); editProduct(${product.id})"
                        title="Edit Product">
                    <div class="edit-icon">
                        <img src="static/img/svg/edit.svg" alt="Edit" />
                    </div>
                </button>
                <button class="product-delete-button" 
                        onclick="event.stopPropagation(); confirmDeleteProduct(${product.id}, '${product.product_name}')"
                        title="Delete Product">
                    <div class="delete-icon">
                        <img src="static/img/svg/trash.svg" alt="Delete" />
                    </div>
                </button>
            </div>
        </td>
    `;
    
    // Check if product has flagged ingredients
    try {
        const hasFlaggedIngredients = await pywebview.api.check_product_has_flagged_ingredients(product.id);
        if (hasFlaggedIngredients) {
            row.classList.add(INVENTORY_CONFIG.CSS_CLASSES.FLAGGED_PRODUCT);
        }
    } catch (error) {
        console.error('Error checking flagged ingredients for product:', product.id, error);
    }
    
    // Add click handler for row selection
    row.addEventListener('click', () => selectProduct(product.id));
    
    return row;
}

// Make createProductRow globally accessible for search functionality
window.createProductRow = createProductRow;

// Make animateProductRowIn globally accessible for search functionality
window.animateProductRowIn = animateProductRowIn;

/**
 * Select a product and load its ingredients
 * @param {number} productId - ID of the product to select
 */
async function selectProduct(productId) {
    selectedProductId = productId;
    window.selectedProductId = productId; // Update global reference
    
    // Update visual selection
    updateProductSelection(productId);
    
    // Load ingredients for selected product
    await loadProductIngredients(productId);
}

/**
 * Update visual selection of products
 * @param {number} productId - ID of the selected product
 */
function updateProductSelection(productId) {
    const rows = document.querySelectorAll('#productsTableBody tr');
    rows.forEach(row => {
        if (row.dataset.productId == productId) {
            row.classList.add(INVENTORY_CONFIG.CSS_CLASSES.SELECTED_PRODUCT);
        } else {
            row.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.SELECTED_PRODUCT);
        }
    });
}

/**
 * Load and display ingredients for a selected product
 * @param {number} productId - ID of the product
 */
async function loadProductIngredients(productId) {
    const rightContainer = document.getElementById('rightBoxContent');
    
    try {
        rightContainer.innerHTML = createLoadingHTML('Loading ingredients...');
        updateIngredientsTitle('Loading...', false);
        
        const ingredients = await pywebview.api.get_product_ingredients(productId);
        displayIngredientsDetails(ingredients);
        
    } catch (error) {
        console.error(ERROR_MESSAGES.LOAD_INGREDIENTS_FAILED, error);
        rightContainer.innerHTML = createErrorHTML(`${ERROR_MESSAGES.LOAD_INGREDIENTS_FAILED}: ${error.message}`);
    }
}

/**
 * Update product table to show flagged status
 */
async function updateProductTableFlaggedStatus() {
    const rows = document.querySelectorAll('#productsTableBody tr');
    
    for (const row of rows) {
        const productId = row.dataset.productId;
        if (productId) {
            try {
                const hasFlaggedIngredients = await pywebview.api.check_product_has_flagged_ingredients(parseInt(productId));
                
                if (hasFlaggedIngredients) {
                    row.classList.add(INVENTORY_CONFIG.CSS_CLASSES.FLAGGED_PRODUCT);
                } else {
                    row.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.FLAGGED_PRODUCT);
                }
            } catch (error) {
                console.error('Error checking product flagged status:', error);
            }
        }
    }
}

/**
 * Clear product selection
 */
function clearProductSelection() {
    selectedProductId = null;
    window.selectedProductId = null; // Update global reference
    
    // Remove selection highlighting from all rows
    const rows = document.querySelectorAll('#productsTableBody tr');
    rows.forEach(row => {
        row.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.SELECTED_PRODUCT);
    });
}

/**
 * Unselect current product and reset ingredients panel
 */
async function unselectCurrentProduct() {
    clearProductSelection();
    await resetIngredientsPanel();
}

/**
 * Reset ingredients panel to initial state
 */
async function resetIngredientsPanel() {
    // Check if "All Ingredients" is already showing to avoid unnecessary reload
    const titleTextElement = document.getElementById('ingredientsTitleText');
    const isAlreadyShowingAllIngredients = titleTextElement && titleTextElement.textContent === 'All Ingredients';
    
    // Only reload if not already showing "All Ingredients"
    if (!isAlreadyShowingAllIngredients) {
        // Show loading state first
        showIngredientsLoading('Loading all ingredients...');
        
        // Display all ingredients instead of "Select a Product" message
        await displayAllIngredients();
        
        // Check if there's an active search and apply it to ingredients
        const searchBar = document.querySelector('.search-bar');
        if (searchBar && searchBar.value.trim()) {
            // Apply current search filter to the newly loaded ingredients
            await filterIngredientsIfApplicable(searchBar.value.trim());
        }
    }
}

/**
 * Edit an existing product
 * @param {number} productId - ID of the product to edit
 */
async function editProduct(productId) {
    try {
        // Get product data from API
        const productData = await pywebview.api.get_product_by_id(productId);
        if (!productData) {
            throw new Error('Product not found');
        }
        
        // Open product modal in edit mode
        await openProductModal(productData, true);
        
    } catch (error) {
        console.error('Error loading product for edit:', error);
        alert('Failed to load product data for editing.');
    }
}

/**
 * Show confirmation modal for deleting a product
 * @param {number} productId - ID of the product to delete
 * @param {string} productName - Name of the product
 */
async function confirmDeleteProduct(productId, productName) {
    showConfirmationModal(
        'Delete Product',
        `Are you sure you want to delete "${productName}"? This will permanently remove the product and all its associated ingredient relationships. This action cannot be undone.`,
        'Delete Product',
        true, // Use delete styling (red)
        async () => {
            try {
                const result = await pywebview.api.delete_product(productId);
                
                if (result.success) {
                    // Clear selection if the deleted product was selected
                    if (selectedProductId === productId) {
                        await unselectCurrentProduct();
                    }
                    
                    // Refresh the product table
                    await loadProductsData();
                } else {
                    throw new Error(result.message || 'Failed to delete product');
                }
            } catch (error) {
                console.error('Error deleting product:', error);
                alert('Failed to delete product. Please try again.');
            }
        }
    );
}

// Legacy function for compatibility
async function loadInventoryData() {
    await loadProductsData();
}