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
        // Don't show loading spinner - just prepare the table silently
        
        await waitForPywebview();
        
        const productsData = await pywebview.api.get_products_data();
        
        // Store data globally
        allProductsData = [...productsData];
        window.allProductsData = allProductsData;
        
        // Create table structure
        const tableHTML = createProductsTableHTML();
        container.innerHTML = tableHTML;
        
        // Initialize search
        initializeSearch();
        initializeAmountChangeDetection();
        
        // Check if there's a search term and apply it, otherwise show all products
        const searchTerm = window.getCurrentSearchTerm ? window.getCurrentSearchTerm() : '';
        if (searchTerm) {
            // Apply search filter if user has already typed something
            const searchId = window.incrementSearchId ? window.incrementSearchId() : 0;
            await performDynamicSearch(searchTerm, searchId);
        } else {
            // Show all products - but wait for loading screen to complete before animating
            await animateProductsRowsWhenReady(allProductsData);
        }
        
    } catch (error) {
        console.error(ERROR_MESSAGES.LOAD_PRODUCTS_FAILED, error);
        handleProductsLoadError(container, error);
    }
}

/**
 * Unified refresh function - reloads both product and ingredient lists
 * while preserving the current search term
 */
async function refreshInventoryData() {
    console.log('Refreshing inventory data...');
    
    // Get current search term (DO NOT CLEAR IT)
    const searchTerm = window.getCurrentSearchTerm ? window.getCurrentSearchTerm() : '';
    console.log('Current search term:', searchTerm);
    
    // Store the currently selected product ID
    const previouslySelectedProductId = window.selectedProductId;
    
    try {
        // Load fresh product data from database (no loading spinner during refresh)
        
        await waitForPywebview();
        const productsData = await pywebview.api.get_products_data();
        
        const container = document.getElementById('inventoryTable');
        
        // Store data globally but don't display yet
        allProductsData = [...productsData];
        window.allProductsData = allProductsData;
        
        // Create empty table structure
        const tableHTML = createProductsTableHTML();
        container.innerHTML = tableHTML;
        
        // Re-initialize search (without displaying products)
        initializeSearch();
        initializeAmountChangeDetection();
        
        // Check if we need to refresh ingredients panel
        const titleTextElement = document.getElementById('ingredientsTitleText');
        const isShowingAllIngredients = titleTextElement && titleTextElement.textContent === 'All Ingredients';
        
        if (isShowingAllIngredients) {
            // Refresh the ingredients panel - it will respect the search term
            await displayAllIngredients();
        }
        
        // Apply search immediately to both products and ingredients (this will populate tables with filtered results)
        const searchId = window.incrementSearchId ? window.incrementSearchId() : 0;
        await performDynamicSearch(searchTerm, searchId);
        
        // Restore product selection if there was one
        if (previouslySelectedProductId) {
            // Check if the product still exists
            const productStillExists = allProductsData.find(p => p.id === previouslySelectedProductId);
            if (productStillExists) {
                updateProductSelection(previouslySelectedProductId);
            }
        }
        
        console.log('Inventory data refreshed successfully');
        
    } catch (error) {
        console.error('Error refreshing inventory data:', error);
        const container = document.getElementById('inventoryTable');
        handleProductsLoadError(container, error);
    }
}

// Make function globally accessible
window.refreshInventoryData = refreshInventoryData;

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
    
    // Ensure amount change detection is initialized
    initializeAmountChangeDetection();
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
                    <th>Amount</th>
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
 * Animate products rows but wait for loading screen to complete first
 * @param {Array} data - Array of product data
 */
async function animateProductsRowsWhenReady(data) {
    const tbody = document.getElementById('productsTableBody');
    
    // First, create all rows in hidden state
    for (let index = 0; index < data.length; index++) {
        const product = data[index];
        const row = await createProductRow(product, index);
        tbody.appendChild(row);
    }
    
    // If loading screen is already complete, animate immediately
    if (window.loadingScreenComplete) {
        animateExistingProductRows();
    } else {
        // Store the animation function to be called when loading screen completes
        window.pendingProductAnimation = animateExistingProductRows;
    }
}

/**
 * Animate existing product rows that are already in the DOM
 */
function animateExistingProductRows() {
    const rows = document.querySelectorAll('#productsTableBody tr');
    rows.forEach((row, index) => {
        setTimeout(() => {
            animateProductRowIn(row);
        }, index * INVENTORY_CONFIG.ANIMATION.ROW_DELAY);
    });
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
    const amount = product.amount || 0;
    
    row.innerHTML = `
        <td><strong>${product.product_name}</strong></td>
        <td>${product.batch_number}</td>
        <td>${dateMixed}</td>
        <td class="price">${totalCost}</td>
        <td class="quantity">${totalQuantity}</td>
        <td class="amount">
            <div class="amount-controls">
                <button class="amount-button minus" 
                        onclick="event.stopPropagation(); adjustProductAmountLocal(${product.id}, -1)"
                        title="Decrease amount">
                    <div class="amount-icon">
                        <img src="static/img/svg/minus.svg" alt="Decrease" />
                    </div>
                </button>
                <input type="number" 
                       class="amount-input" 
                       value="${amount}" 
                       min="0" 
                       step="1"
                       data-product-id="${product.id}"
                       data-product-name="${product.product_name.replace(/"/g, '&quot;')}"
                       data-original-amount="${amount}"
                       onclick="event.stopPropagation()"
                       onchange="handleAmountInputChange(this)"
                       onblur="handleAmountInputBlur(this)"
                       onfocus="handleAmountInputFocus(this)">
                <button class="amount-button plus" 
                        onclick="event.stopPropagation(); adjustProductAmountLocal(${product.id}, 1)"
                        title="Increase amount">
                    <div class="amount-icon">
                        <img src="static/img/svg/plus.svg" alt="Increase" />
                    </div>
                </button>
            </div>
        </td>
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

// Make function globally accessible
window.loadProductIngredients = loadProductIngredients;

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
    
    // Get current search term to apply after loading
    const searchTerm = window.getCurrentSearchTerm ? window.getCurrentSearchTerm() : '';
    
    // Only reload if not already showing "All Ingredients"
    if (!isAlreadyShowingAllIngredients) {
        // Show loading state first
        showIngredientsLoading('Loading all ingredients...');
        
        // Display all ingredients - it will automatically apply search if active
        await displayAllIngredients(true);
    } else if (searchTerm) {
        // Already showing all ingredients, but ensure search filter is applied
        const searchId = window.getCurrentSearchId ? window.getCurrentSearchId() : 0;
        const filterData = await prepareIngredientFilterData(searchTerm);
        if (filterData) {
            await applyIngredientFilterResults(filterData, searchId);
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

// Global variable to track current editing state
let currentEditingProductId = null;
let pendingAmountChanges = new Map(); // productId -> {originalAmount, newAmount, productName}
let amountChangeDetectionInitialized = false;

/**
 * Start editing session for a product
 * @param {number} productId - ID of the product
 * @param {HTMLInputElement} amountInput - The amount input element
 */
function startEditingSession(productId, amountInput) {
    // If switching to a different product, check for pending changes on the previous one
    if (currentEditingProductId !== null && currentEditingProductId !== productId) {
        checkForPendingChanges(currentEditingProductId);
    }
    
    currentEditingProductId = productId;
    
    // Store original amount if not already stored
    if (!pendingAmountChanges.has(productId)) {
        const originalAmount = parseInt(amountInput.dataset.originalAmount) || 0;
        pendingAmountChanges.set(productId, {
            originalAmount: originalAmount,
            newAmount: parseInt(amountInput.value) || 0,
            productName: amountInput.dataset.productName
        });
    }
}

/**
 * Adjust product amount locally (no API call yet)
 * @param {number} productId - ID of the product to adjust
 * @param {number} delta - Amount to add/subtract (1 or -1)
 */
function adjustProductAmountLocal(productId, delta) {
    const row = document.querySelector(`tr[data-product-id="${productId}"]`);
    if (!row) return;
    
    const amountInput = row.querySelector('.amount-input');
    if (!amountInput) return;
    
    // Start editing session
    startEditingSession(productId, amountInput);
    
    const currentValue = parseInt(amountInput.value) || 0;
    const newValue = Math.max(0, currentValue + delta); // Prevent negative values
    
    amountInput.value = newValue;
    handleAmountInputChange(amountInput);
}

/**
 * Handle amount input focus
 * @param {HTMLInputElement} input - The amount input element
 */
function handleAmountInputFocus(input) {
    const productId = parseInt(input.dataset.productId);
    startEditingSession(productId, input);
}

/**
 * Handle amount input change
 * @param {HTMLInputElement} input - The amount input element
 */
function handleAmountInputChange(input) {
    const productId = parseInt(input.dataset.productId);
    const newAmount = Math.max(0, parseInt(input.value) || 0); // Ensure non-negative
    input.value = newAmount; // Update display to show corrected value
    
    // Update pending change
    if (pendingAmountChanges.has(productId)) {
        const change = pendingAmountChanges.get(productId);
        change.newAmount = newAmount;
    }
}

/**
 * Handle amount input blur - but only if not clicking on amount controls
 * @param {HTMLInputElement} input - The amount input element
 */
function handleAmountInputBlur(input) {
    // Don't immediately trigger confirmation - let the global click handler manage it
    // This prevents premature confirmation when clicking between plus/minus buttons
}

/**
 * Check for pending changes and show confirmation if needed
 * @param {number} productId - ID of the product to check
 */
function checkForPendingChanges(productId) {
    if (!pendingAmountChanges.has(productId)) {
        currentEditingProductId = null;
        return;
    }
    
    const change = pendingAmountChanges.get(productId);
    
    // Only show confirmation if there's actually a change
    if (change.originalAmount !== change.newAmount) {
        showAmountChangeConfirmation(productId, change);
    } else {
        // No change, just clean up
        pendingAmountChanges.delete(productId);
        currentEditingProductId = null;
    }
}

/**
 * Show confirmation modal for amount changes
 * @param {number} productId - ID of the product
 * @param {Object} change - Change object with originalAmount, newAmount, productName
 */
function showAmountChangeConfirmation(productId, change) {
    showConfirmationModal(
        'Confirm Amount Change',
        `Confirm your change for "${change.productName}" amount from ${change.originalAmount} to ${change.newAmount}.`,
        'Confirm',
        false, // Not a delete action
        async () => {
            // User confirmed - apply the change
            try {
                const result = await pywebview.api.update_product_amount(productId, change.newAmount);
                
                if (result.success) {
                    // Update the original amount to the new value
                    const row = document.querySelector(`tr[data-product-id="${productId}"]`);
                    if (row) {
                        const amountInput = row.querySelector('.amount-input');
                        if (amountInput) {
                            amountInput.dataset.originalAmount = change.newAmount.toString();
                        }
                    }
                    
                    // Clean up pending changes
                    pendingAmountChanges.delete(productId);
                    currentEditingProductId = null;
                } else {
                    throw new Error(result.message || 'Failed to update product amount');
                }
            } catch (error) {
                console.error('Error updating product amount:', error);
                alert('Failed to update product amount. Please try again.');
                
                // Revert the input to original value from database
                revertAmountToOriginal(productId);
            }
        },
        () => {
            // User cancelled or closed modal - revert the change to database value
            revertAmountToOriginal(productId);
        }
    );
}

/**
 * Revert amount input to original database value
 * @param {number} productId - ID of the product
 */
function revertAmountToOriginal(productId) {
    const row = document.querySelector(`tr[data-product-id="${productId}"]`);
    if (row) {
        const amountInput = row.querySelector('.amount-input');
        if (amountInput && pendingAmountChanges.has(productId)) {
            const change = pendingAmountChanges.get(productId);
            amountInput.value = change.originalAmount;
        }
    }
    
    // Clean up pending changes
    pendingAmountChanges.delete(productId);
    currentEditingProductId = null;
}

/**
 * Initialize global click handler for amount change detection
 */
function initializeAmountChangeDetection() {
    // Prevent duplicate initialization
    if (amountChangeDetectionInitialized) return;
    
    document.addEventListener('click', function(event) {
        // Check if we have an active editing session
        if (currentEditingProductId === null) return;
        
        const clickTarget = event.target;
        
        // Check if click is on amount controls for the currently editing product
        const currentRow = document.querySelector(`tr[data-product-id="${currentEditingProductId}"]`);
        if (!currentRow) return;
        
        const amountControls = currentRow.querySelector('.amount-controls');
        if (!amountControls) return;
        
        // Check if the click is within the amount controls
        const isClickInAmountControls = amountControls.contains(clickTarget) || 
                                       clickTarget.closest('.amount-controls') === amountControls;
        
        // If click is outside amount controls, trigger confirmation
        if (!isClickInAmountControls) {
            checkForPendingChanges(currentEditingProductId);
        }
    });
    
    amountChangeDetectionInitialized = true;
}

// Initialize the click detection when the page loads
document.addEventListener('DOMContentLoaded', initializeAmountChangeDetection);

// Also initialize immediately if DOM is already ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAmountChangeDetection);
} else {
    initializeAmountChangeDetection();
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
                    
                    // Use unified refresh function to reload data with search persistence
                    await refreshInventoryData();
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