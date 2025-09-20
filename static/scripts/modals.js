// Modal functionality for product and ingredient creation

// Variables for modal management
let availableIngredients = [];

// ==== PRODUCT MODAL FUNCTIONS ====

/**
 * Open product creation modal
 */
async function openProductModal() {
    try {
        // Load available ingredients
        await loadAvailableIngredients();
        
        // Show modal
        const modal = document.getElementById('productModalBackdrop');
        if (modal) {
            modal.classList.add('open');
            
            // Restore buttons in case they were hidden from previous use
            const submitButton = document.getElementById('submitProductButton');
            const cancelButton = document.querySelector('#productModal .modal-button.cancel');
            if (submitButton) {
                submitButton.style.display = '';
                submitButton.disabled = false;
            }
            if (cancelButton) {
                cancelButton.style.display = '';
            }
            
            // Set default date to today
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('mixedDate').value = today;
            
            // Initialize barcode scanner
            initializeBarcodeScanner();
            
            // Ensure form event listener is attached
            attachProductFormListener();
        }
    } catch (error) {
        console.error('Error opening product modal:', error);
        alert('Failed to load ingredients for product creation.');
    }
}

/**
 * Close product creation modal
 */
function closeProductModal() {
    const modal = document.getElementById('productModalBackdrop');
    if (modal) {
        modal.classList.remove('open');
        
        // Reset form after animation
        setTimeout(() => {
            resetProductForm();
        }, 300);
    }
}

/**
 * Load available ingredients for product creation
 */
async function loadAvailableIngredients() {
    try {
        const ingredients = await pywebview.api.get_all_ingredients();
        availableIngredients = ingredients;
        displayIngredientSelector(ingredients);
    } catch (error) {
        console.error('Error loading ingredients:', error);
        // Fallback - show empty selector
        availableIngredients = [];
        displayIngredientSelector([]);
    }
}

/**
 * Display ingredient selector checkboxes
 * @param {Array} ingredients - Array of available ingredients
 */
function displayIngredientSelector(ingredients) {
    const selector = document.getElementById('ingredientSelector');
    
    if (!ingredients || ingredients.length === 0) {
        selector.innerHTML = '<p style="color: #666; text-align: center;">No ingredients available</p>';
        return;
    }
    
    let selectorHTML = '';
    ingredients.forEach(ingredient => {
        selectorHTML += `
            <div class="ingredient-option" onclick="toggleIngredientSelection(${ingredient.id})">
                <input type="checkbox" id="ingredient-${ingredient.id}" onchange="handleIngredientChange(${ingredient.id})">
                <div>
                    <strong>${ingredient.name}</strong>
                    <div style="font-size: 0.9em; color: #666;">${ingredient.barcode_id}</div>
                </div>
            </div>
        `;
    });
    
    selector.innerHTML = selectorHTML;
}

/**
 * Toggle ingredient selection in product modal
 * @param {number} ingredientId - ID of the ingredient
 */
function toggleIngredientSelection(ingredientId) {
    const checkbox = document.getElementById(`ingredient-${ingredientId}`);
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        handleIngredientChange(ingredientId);
    }
}

/**
 * Handle ingredient checkbox changes
 * @param {number} ingredientId - ID of the ingredient
 */
function handleIngredientChange(ingredientId) {
    const checkbox = document.getElementById(`ingredient-${ingredientId}`);
    
    if (checkbox.checked) {
        // Add ingredient to selected list
        const ingredient = availableIngredients.find(ing => ing.id === ingredientId);
        if (ingredient) {
            addSelectedIngredient(ingredient);
        }
    } else {
        // Remove ingredient from selected list
        const existingItem = document.getElementById(`selected-${ingredientId}`);
        if (existingItem) {
            existingItem.remove();
        }
    }
}

/**
 * Add selected ingredient with quantity input
 * @param {Object} ingredient - Ingredient data
 */
function addSelectedIngredient(ingredient) {
    const selectedContainer = document.getElementById('selectedIngredients');
    
    // Check if already exists
    if (document.getElementById(`selected-${ingredient.id}`)) {
        return;
    }
    
    const itemHTML = `
        <div class="selected-ingredient-item" id="selected-${ingredient.id}">
            <div class="selected-ingredient-info">
                <strong>${ingredient.name}</strong>
            </div>
            <div class="selected-ingredient-quantity">
                <input type="number" 
                       step="0.01" 
                       min="0" 
                       placeholder="0.00" 
                       id="quantity-${ingredient.id}"
                       required>
                <span>grams</span>
            </div>
        </div>
    `;
    
    selectedContainer.insertAdjacentHTML('beforeend', itemHTML);
}

/**
 * Reset product form to initial state
 */
function resetProductForm() {
    const form = document.getElementById('productForm');
    if (form) {
        form.reset();
    }
    
    // Clear selected ingredients
    const selectedContainer = document.getElementById('selectedIngredients');
    if (selectedContainer) {
        selectedContainer.innerHTML = '';
    }
    
    // Reset barcode scanner
    const barcodeScanner = document.getElementById('barcodeScanner');
    const barcodeStatus = document.getElementById('barcodeStatus');
    if (barcodeScanner) {
        barcodeScanner.value = '';
    }
    if (barcodeStatus) {
        barcodeStatus.innerHTML = '';
        barcodeStatus.className = 'barcode-status';
    }
    
    // Reset barcode result
    const barcodeResult = document.getElementById('barcodeResult');
    if (barcodeResult) {
        barcodeResult.style.display = 'none';
        barcodeResult.classList.remove('show', 'success', 'error');
    }
    
    // Reset submit button
    const submitButton = document.getElementById('submitProductButton');
    if (submitButton) {
        submitButton.textContent = 'Add Product';
        submitButton.className = 'modal-button submit';
        submitButton.disabled = false;
    }
}

// ==== BARCODE SCANNER FUNCTIONS ====

/**
 * Initialize barcode scanner functionality
 */
function initializeBarcodeScanner() {
    const barcodeScanner = document.getElementById('barcodeScanner');
    const barcodeStatus = document.getElementById('barcodeStatus');
    
    if (!barcodeScanner || !barcodeStatus) return;
    
    let scanTimeout;
    let lastInputTime = 0;
    
    // Remove any existing event listeners
    barcodeScanner.removeEventListener('input', handleBarcodeInput);
    barcodeScanner.removeEventListener('keydown', handleBarcodeKeydown);
    
    // Add event listeners
    barcodeScanner.addEventListener('input', handleBarcodeInput);
    barcodeScanner.addEventListener('keydown', handleBarcodeKeydown);
    
    function handleBarcodeInput(event) {
        const now = Date.now();
        const timeDiff = now - lastInputTime;
        lastInputTime = now;
        
        clearTimeout(scanTimeout);
        
        // If input is very fast (typical of barcode scanners), process after a short delay
        // If typing manually, wait longer to avoid false validation errors
        if (timeDiff < 50 && event.target.value.length > 3) {
            // Fast input - likely a scanner, process quickly
            scanTimeout = setTimeout(() => {
                processBarcodeInput(event.target.value);
            }, 150);
        } else if (event.target.value.length >= 8) {
            // Longer input - process after a longer delay to avoid interrupting typing
            scanTimeout = setTimeout(() => {
                processBarcodeInput(event.target.value);
            }, 500);
        }
    }
    
    function handleBarcodeKeydown(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            const barcodeValue = event.target.value.trim();
            if (barcodeValue) {
                processBarcodeInput(barcodeValue);
            }
        }
    }
}

/**
 * Process barcode input and search for ingredients
 * @param {string} barcode - The scanned barcode
 */
async function processBarcodeInput(barcode) {
    const barcodeStatus = document.getElementById('barcodeStatus');
    const barcodeScanner = document.getElementById('barcodeScanner');
    
    // Clear any existing status first
    clearBarcodeStatus();
    
    if (!barcode || barcode.length < 3) {
        showBarcodeStatus('Please enter a valid barcode', 'error');
        return;
    }
    
    try {
        showBarcodeStatus('Searching for ingredient...', 'info');
        
        // Search for ingredient by barcode
        const ingredient = await pywebview.api.search_ingredient_by_barcode(barcode);
        
        if (ingredient) {
            // Toggle the ingredient in the modal
            await toggleIngredientByBarcode(ingredient);
            
            // Clear the barcode input
            barcodeScanner.value = '';
            
            // Show success message
            showBarcodeStatus(`✓ ${ingredient.is_selected ? 'Added' : 'Removed'}: ${ingredient.name}`, 'success');
            
            // Clear status after delay
            setTimeout(() => {
                clearBarcodeStatus();
            }, 3000);
            
        } else {
            showBarcodeStatus(`No ingredient found with barcode: ${barcode}`, 'error');
            
            // Clear error after delay
            setTimeout(() => {
                clearBarcodeStatus();
            }, 4000);
        }
        
    } catch (error) {
        console.error('Error searching for ingredient by barcode:', error);
        showBarcodeStatus('Error searching for ingredient', 'error');
        
        setTimeout(() => {
            clearBarcodeStatus();
        }, 4000);
    }
}

/**
 * Toggle ingredient selection by barcode scan
 * @param {Object} ingredient - The ingredient to toggle
 */
async function toggleIngredientByBarcode(ingredient) {
    const checkbox = document.getElementById(`ingredient-${ingredient.id}`);
    
    if (!checkbox) {
        console.warn('Checkbox not found for ingredient:', ingredient.id);
        return;
    }
    
    // Toggle the checkbox
    const wasChecked = checkbox.checked;
    checkbox.checked = !wasChecked;
    
    // Store the selection state in the ingredient object for status message
    ingredient.is_selected = checkbox.checked;
    
    // Handle the change
    handleIngredientChange(ingredient.id);
    
    // Scroll the ingredient into view
    const ingredientOption = checkbox.closest('.ingredient-option');
    if (ingredientOption) {
        ingredientOption.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest' 
        });
        
        // Add a brief highlight effect
        ingredientOption.style.background = checkbox.checked ? 
            'rgba(46, 125, 50, 0.1)' : 'rgba(211, 47, 47, 0.1)';
        
        setTimeout(() => {
            ingredientOption.style.background = '';
        }, 1000);
    }
}

/**
 * Show barcode status message
 * @param {string} message - The message to show
 * @param {string} type - The type of message (success, error, info)
 */
function showBarcodeStatus(message, type) {
    const barcodeStatus = document.getElementById('barcodeStatus');
    if (barcodeStatus) {
        barcodeStatus.textContent = message;
        barcodeStatus.className = `barcode-status ${type}`;
    }
}

/**
 * Clear barcode status message
 */
function clearBarcodeStatus() {
    const barcodeStatus = document.getElementById('barcodeStatus');
    if (barcodeStatus) {
        barcodeStatus.textContent = '';
        barcodeStatus.className = 'barcode-status';
    }
}

/**
 * Attach product form event listener
 */
function attachProductFormListener() {
    const productForm = document.getElementById('productForm');
    if (productForm) {
        // Remove any existing listeners first
        productForm.removeEventListener('submit', handleProductSubmission);
        // Add the listener
        productForm.addEventListener('submit', handleProductSubmission);
        console.log('Product form event listener attached in modal open');
    }
}

/**
 * Handle product form submission
 * @param {Event} event - Form submission event
 */
async function handleProductSubmission(event) {
    console.log('Form submission handler called');
    event.preventDefault();
    event.stopPropagation();
    
    const submitButton = document.getElementById('submitProductButton');
    const barcodeResult = document.getElementById('barcodeResult');
    
    console.log('Processing form submission...');
    
    try {
        // Disable submit button
        submitButton.disabled = true;
        submitButton.textContent = 'Creating...';
        
        // Collect and validate form data
        const productData = collectProductFormData();
        
        console.log('Calling API to create product...');
        
        // Create product via API
        const result = await pywebview.api.create_product(productData);
        
        console.log('API result:', result);
        
        if (result.success) {
            handleProductCreationSuccess(submitButton, barcodeResult, productData.product_name);
        } else {
            throw new Error(result.message || ERROR_MESSAGES.CREATE_PRODUCT_FAILED);
        }
        
    } catch (error) {
        console.error('Error creating product:', error);
        handleProductCreationError(submitButton, barcodeResult, error.message);
    }
    
    return false; // Ensure no form submission
}

/**
 * Collect product form data and validate
 * @returns {Object} Product data object
 */
function collectProductFormData() {
    const productName = document.getElementById('productName').value.trim();
    const mixedDate = document.getElementById('mixedDate').value;
    
    console.log('Product name:', productName);
    console.log('Mixed date:', mixedDate);
    
    // Collect selected ingredients with quantities
    const selectedIngredients = [];
    const checkboxes = document.querySelectorAll('#ingredientSelector input[type="checkbox"]:checked');
    
    console.log('Selected checkboxes:', checkboxes.length);
    
    for (const checkbox of checkboxes) {
        const ingredientId = parseInt(checkbox.id.replace('ingredient-', ''));
        const quantityInput = document.getElementById(`quantity-${ingredientId}`);
        const quantity = parseFloat(quantityInput.value);
        
        console.log(`Ingredient ${ingredientId}: quantity ${quantity}`);
        
        if (!quantity || quantity <= 0) {
            throw new Error(ERROR_MESSAGES.VALIDATION_QUANTITY);
        }
        
        selectedIngredients.push({
            ingredient_id: ingredientId,
            quantity: quantity
        });
    }
    
    if (selectedIngredients.length === 0) {
        throw new Error(ERROR_MESSAGES.VALIDATION_INGREDIENTS);
    }
    
    return {
        product_name: productName,
        mixed_date: mixedDate,
        ingredients: selectedIngredients
    };
}

/**
 * Handle successful product creation
 * @param {HTMLElement} submitButton - Submit button element
 * @param {HTMLElement} barcodeResult - Barcode result element
 * @param {string} productName - Name of created product
 */
function handleProductCreationSuccess(submitButton, barcodeResult, productName) {
    // Hide the submit button since success message will be shown
    submitButton.style.display = 'none';
    
    // Also hide the cancel button
    const cancelButton = document.querySelector('#productModal .modal-button.cancel');
    if (cancelButton) {
        cancelButton.style.display = 'none';
    }
    
    // Show success message without animation
    barcodeResult.innerHTML = `
        <div style="color: #4caf50; font-weight: 600;">${SUCCESS_MESSAGES.PRODUCT_CREATED}</div>
        <div style="color: #666; font-size: 0.9em; margin-top: 8px;">Product "${productName}" has been added to your inventory.</div>
    `;
    barcodeResult.className = 'barcode-result success show';
    barcodeResult.style.display = 'block';
    
    // Refresh products table faster, then auto-close modal
    setTimeout(async () => {
        await loadProductsData();
        
        // Auto-close product modal after refresh
        setTimeout(() => {
            closeProductModal();
        }, 500);
    }, 300);
}

/**
 * Handle product creation error
 * @param {HTMLElement} submitButton - Submit button element
 * @param {HTMLElement} barcodeResult - Barcode result element
 * @param {string} errorMessage - Error message
 */
function handleProductCreationError(submitButton, barcodeResult, errorMessage) {
    // Show error
    submitButton.textContent = 'Failed';
    submitButton.className = 'modal-button error';
    
    barcodeResult.innerHTML = `
        <div style="color: #f44336; font-weight: 600;">Creation Failed</div>
        <div style="color: #666; font-size: 0.9em; margin-top: 8px;">${errorMessage}</div>
    `;
    barcodeResult.className = 'barcode-result error';
    barcodeResult.style.display = 'block';
    
    setTimeout(() => {
        barcodeResult.classList.add('show');
    }, 100);
    
    // Reset button after delay
    setTimeout(() => {
        submitButton.textContent = 'Add Product';
        submitButton.className = 'modal-button submit';
        submitButton.disabled = false;
    }, INVENTORY_CONFIG.ANIMATION.BUTTON_RESET_DELAY);
}

// ==== INGREDIENT MODAL FUNCTIONS ====

/**
 * Open ingredient creation modal
 */
async function openIngredientModal() {
    try {
        // Show modal
        const modal = document.getElementById('ingredientModalBackdrop');
        if (modal) {
            modal.classList.add('open');
            
            // Restore buttons in case they were hidden from previous use
            const submitButton = document.getElementById('submitIngredientButton');
            const cancelButton = document.querySelector('#ingredientModal .modal-button.cancel');
            if (submitButton) {
                submitButton.style.display = '';
                submitButton.disabled = false;
            }
            if (cancelButton) {
                cancelButton.style.display = '';
            }
            
            // Set default date to today
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('ingredientPurchaseDate').value = today;
            
            // Ensure form event listener is attached
            attachIngredientFormListener();
        }
    } catch (error) {
        console.error('Error opening ingredient modal:', error);
        alert('Failed to open ingredient creation modal.');
    }
}

/**
 * Close ingredient creation modal
 */
function closeIngredientModal() {
    const modal = document.getElementById('ingredientModalBackdrop');
    if (modal) {
        modal.classList.remove('open');
        
        // Reset form after animation
        setTimeout(() => {
            resetIngredientForm();
        }, 300);
    }
}

/**
 * Reset ingredient form to initial state
 */
function resetIngredientForm() {
    const form = document.getElementById('ingredientForm');
    if (form) {
        form.reset();
        
        // Reset submit button to original state
        const submitButton = document.getElementById('submitIngredientButton');
        if (submitButton) {
            submitButton.textContent = 'Add Ingredient';
            submitButton.disabled = false;
            submitButton.style.backgroundColor = '';
            submitButton.style.color = '';
        }
        
        // Clear any barcode display
        const barcodeContainer = document.getElementById('ingredientBarcodeResult');
        if (barcodeContainer) {
            barcodeContainer.innerHTML = '';
            barcodeContainer.style.display = 'none';
            barcodeContainer.classList.remove('show', 'success', 'error');
        }
    }
}

/**
 * Attach ingredient form event listener
 */
function attachIngredientFormListener() {
    const ingredientForm = document.getElementById('ingredientForm');
    if (ingredientForm) {
        // Remove any existing listeners first
        ingredientForm.removeEventListener('submit', handleIngredientSubmission);
        // Add the listener
        ingredientForm.addEventListener('submit', handleIngredientSubmission);
        console.log('Ingredient form event listener attached in modal open');
    }
}

/**
 * Handle ingredient form submission
 * @param {Event} event - Form submission event
 */
async function handleIngredientSubmission(event) {
    console.log('Ingredient form submission intercepted!');
    event.preventDefault();
    event.stopPropagation();
    
    const submitButton = document.getElementById('submitIngredientButton');
    
    // Change button to loading state
    submitButton.textContent = 'Creating...';
    submitButton.disabled = true;
    submitButton.style.backgroundColor = '#6c757d';
    
    try {
        const ingredientData = collectIngredientFormData(event);
        
        console.log('Submitting ingredient data:', ingredientData);
        
        // Call backend to create ingredient with barcode
        const result = await pywebview.api.create_ingredient(ingredientData);
        
        if (result.success) {
            handleIngredientCreationSuccess(submitButton, result);
        } else {
            throw new Error(result.error || ERROR_MESSAGES.CREATE_INGREDIENT_FAILED);
        }
        
    } catch (error) {
        console.error('Error creating ingredient:', error);
        handleIngredientCreationError(submitButton, error.message);
    }
    
    return false; // Ensure no form submission
}

/**
 * Collect ingredient form data and validate
 * @param {Event} event - Form submission event
 * @returns {Object} Ingredient data object
 */
function collectIngredientFormData(event) {
    const formData = new FormData(event.target);
    const ingredientData = {
        name: formData.get('ingredientName'),
        location: formData.get('ingredientSupplier'), // Using supplier as location for now
        expiry_date: formData.get('ingredientExpirationDate'),
        cost: parseFloat(formData.get('ingredientUnitCost')) || 0
    };
    
    // Validate required fields
    if (!ingredientData.name) {
        throw new Error(ERROR_MESSAGES.VALIDATION_REQUIRED + ' (Name)');
    }
    
    return ingredientData;
}

/**
 * Handle successful ingredient creation
 * @param {HTMLElement} submitButton - Submit button element
 * @param {Object} result - API result object
 */
function handleIngredientCreationSuccess(submitButton, result) {
    console.log('Ingredient created successfully:', result);
    
    // Hide the submit button since success message will be shown
    submitButton.style.display = 'none';
    
    // Also hide the cancel button
    const cancelButton = document.querySelector('#ingredientModal .modal-button.cancel');
    if (cancelButton) {
        cancelButton.style.display = 'none';
    }
    
    // Display success message with barcode
    displayIngredientSuccess(result.ingredient, result.barcode_id);
    
    // Refresh the current ingredient display but DON'T auto-close the modal
    setTimeout(async () => {
        if (window.selectedProductId) {
            await loadProductIngredients(window.selectedProductId);
        } else {
            // If no product is selected, refresh the all ingredients view
            await displayAllIngredients();
        }
        // Note: No auto-close for ingredient modal - user must manually close
    }, 300);
}

/**
 * Handle ingredient creation error
 * @param {HTMLElement} submitButton - Submit button element
 * @param {string} errorMessage - Error message
 */
function handleIngredientCreationError(submitButton, errorMessage) {
    // Show failure on button - keep it permanently until modal closes
    submitButton.textContent = '✗ Failed';
    submitButton.style.backgroundColor = '#dc3545';
    submitButton.style.color = 'white';
    submitButton.disabled = true; // Keep disabled after failure
    
    alert(`${ERROR_MESSAGES.CREATE_INGREDIENT_FAILED}: ${errorMessage}`);
}

/**
 * Display ingredient creation success with printable barcode
 * @param {Object} ingredient - Created ingredient object
 * @param {string} barcodeId - Generated barcode ID
 */
function displayIngredientSuccess(ingredient, barcodeId) {
    console.log('Displaying ingredient success for:', ingredient.name, 'with barcode:', barcodeId);
    const container = document.getElementById('ingredientBarcodeResult');
    if (container) {
        const barcodeHTML = generateBarcodeDisplay(barcodeId);
        console.log('Generated barcode HTML:', barcodeHTML);
        
        container.innerHTML = `
            <div class="success-message">
                <div style="color: #4caf50; font-weight: 600; margin-bottom: 10px;">
                    ${SUCCESS_MESSAGES.INGREDIENT_CREATED}
                </div>
                <div style="margin-bottom: 15px;">
                    <strong>${ingredient.name}</strong> has been added to your inventory.
                </div>
                <div class="barcode-section">
                    <div style="font-weight: 600; margin-bottom: 10px;">Barcode ID: ${barcodeId}</div>
                    <div class="printable-barcode" id="printable-barcode-${barcodeId}">
                        <div class="barcode-display">
                            ${barcodeHTML}
                        </div>
                        <div class="barcode-text">${barcodeId}</div>
                    </div>
                    <div style="margin-top: 10px;">
                        <button onclick="printBarcode('${barcodeId}')" class="print-button">
                            🖨️ Print Barcode
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Show the container with proper CSS classes
        container.style.display = 'block';
        container.classList.add('show', 'success');
        
        console.log('Barcode container is now visible with classes:', container.classList.toString());
    } else {
        console.error('ingredientBarcodeResult container not found!');
    }
}

// ==== FORM EVENT LISTENERS INITIALIZATION ====

/**
 * Initialize modal form event listeners on DOM ready
 */
function initializeModalEventListeners() {
    document.addEventListener('DOMContentLoaded', function() {
        // Wait a bit for the DOM to be fully ready
        setTimeout(() => {
            const productForm = document.getElementById('productForm');
            if (productForm) {
                productForm.addEventListener('submit', handleProductSubmission);
                console.log('Product form event listener added');
            } else {
                console.log('Product form not found during initialization');
            }
        }, 100);
    });
}

// Initialize event listeners
initializeModalEventListeners();