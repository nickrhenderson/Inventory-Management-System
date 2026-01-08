// Modal functionality for product and ingredient creation

// Variables for modal management
let availableIngredients = [];

// ==== PRODUCT MODAL FUNCTIONS ====

/**
 * Open product creation modal
 * @param {Object} productData - Existing product data for editing (optional)
 * @param {boolean} isEditMode - Whether this is edit mode
 */
async function openProductModal(productData = null, isEditMode = false) {
    try {
        // Load available ingredients first
        await loadAvailableIngredients();
        
        // Populate group dropdown
        populateGroupDropdown(productData);
        
        // Show modal
        const modal = document.getElementById('productModalBackdrop');
        if (modal) {
            modal.classList.add('open');
            
            // Update modal title and button text based on mode
            const modalTitle = document.querySelector('#productModal h3');
            const submitButton = document.getElementById('submitProductButton');
            const cancelButton = document.querySelector('#productModal .modal-button.cancel');
            
            if (isEditMode && productData) {
                modalTitle.textContent = 'Edit Product';
                submitButton.textContent = 'Update Product';
                // Store edit data for form submission
                window.editingProductData = productData;
                // Populate form with existing data AFTER ingredients are loaded
                await populateProductForm(productData);
            } else {
                modalTitle.textContent = 'Add New Product';
                submitButton.textContent = 'Add Product';
                window.editingProductData = null;
                // Clear any existing ingredient data
                window.editingProductIngredients = null;
                // Set default date to today for new products
                const today = new Date().toISOString().split('T')[0];
                document.getElementById('mixedDate').value = today;
                // Set default amount to 1 for new products
                document.getElementById('productAmount').value = 1;
            }
            
            // Restore buttons in case they were hidden from previous use
            if (submitButton) {
                submitButton.style.display = '';
                submitButton.disabled = false;
            }
            if (cancelButton) {
                cancelButton.style.display = '';
            }
            
            // Initialize barcode scanner (now enabled in both create and edit modes)
            initializeBarcodeScanner();
            
            // Ensure form event listener is attached
            attachProductFormListener();
        }
    } catch (error) {
        console.error('Error opening product modal:', error);
        if (window.notifyError) {
            window.notifyError('Failed to load ingredients for product creation.');
        } else {
            alert('Failed to load ingredients for product creation.');
        }
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
 * Populate group dropdown with available groups
 * @param {Object} productData - Product data (optional, for edit mode)
 */
function populateGroupDropdown(productData = null) {
    const groupSelect = document.getElementById('productGroup');
    if (!groupSelect) return;
    
    // Clear existing options except the first "None" option
    groupSelect.innerHTML = '<option value="">None</option>';
    
    // Get available groups from window.productGroups
    if (window.productGroups && window.productGroups.length > 0) {
        window.productGroups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.name;
            groupSelect.appendChild(option);
        });
    }
    
    // If editing a product, select the group it belongs to
    if (productData && productData.id && window.productGroups) {
        const productGroup = window.productGroups.find(g => g.productIds.includes(productData.id));
        if (productGroup) {
            groupSelect.value = productGroup.id;
        } else {
            groupSelect.value = ''; // Set to None
        }
    } else {
        // Default to None for new products
        groupSelect.value = '';
    }
}

/**
 * Populate product form with existing data for editing
 * @param {Object} productData - Existing product data
 */
async function populateProductForm(productData) {
    // Fill basic product information
    document.getElementById('productName').value = productData.product_name || '';
    
    // Handle mixed date - ensure proper format for HTML date input without timezone issues
    const mixedDateValue = productData.date_mixed || '';
    
    if (mixedDateValue) {
        // Ensure date is properly formatted as YYYY-MM-DD
        // This prevents any timezone conversion issues
        const dateStr = String(mixedDateValue).split('T')[0]; // Remove time part if present
        document.getElementById('mixedDate').value = dateStr;
    } else {
        document.getElementById('mixedDate').value = '';
    }
    
    // Fill amount field
    document.getElementById('productAmount').value = productData.amount || 0;
    
    // Allow editing of both product name and mixed date in edit mode
    document.getElementById('productName').readOnly = false;
    document.getElementById('mixedDate').readOnly = false;
    
    // Ensure mixed date field appears editable (remove any read-only styling)
    const mixedDateField = document.getElementById('mixedDate');
    mixedDateField.style.backgroundColor = '';
    mixedDateField.style.color = '';
    
    // Modify the product name field to show batch ID inline
    const nameField = document.getElementById('productName');
    const nameGroup = nameField.closest('.form-group');
    
    if (nameGroup && !document.getElementById('productBatchDisplay')) {
        // Create a container for the inline inputs
        const inputContainer = document.createElement('div');
        inputContainer.className = 'inline-input-container';
        
        // Create the batch input
        const batchInput = document.createElement('input');
        batchInput.type = 'text';
        batchInput.id = 'productBatchDisplay';
        batchInput.value = productData.batch_number || '';
        batchInput.readOnly = true;
        batchInput.style.cssText = 'background-color: #f5f5f5; color: #666;';
        batchInput.placeholder = 'Batch ID';
        batchInput.title = 'Batch ID (cannot be changed)';
        
        // Move the name field and batch input into the container
        nameField.before(inputContainer);
        inputContainer.appendChild(nameField);
        inputContainer.appendChild(batchInput);
    }
    
    // Get product ingredients and pre-select them
    try {
        console.log('Loading product ingredients for product ID:', productData.id);
        const productIngredients = await pywebview.api.get_product_ingredients(productData.id);
        console.log('Product ingredients loaded:', productIngredients);
        
        // Store existing ingredient quantities for display in selector
        window.editingProductIngredients = {};
        productIngredients.forEach(ingredient => {
            // Use 'id' field from API response (ingredient.id is the ingredient ID)
            window.editingProductIngredients[ingredient.id] = ingredient.quantity_used;
            console.log(`Stored ingredient ${ingredient.id}: ${ingredient.quantity_used}g`);
        });
        
        // Refresh the ingredient selector to show existing quantities
        displayIngredientSelector(availableIngredients);
        
        // Clear any existing selections
        const selectedContainer = document.getElementById('selectedIngredients');
        selectedContainer.innerHTML = '';
        
        // Pre-select ingredients after DOM is ready
        console.log('About to pre-select ingredients...');
        await selectExistingIngredients(productIngredients);
        console.log('Ingredient pre-selection completed');
        
    } catch (error) {
        console.error('Error loading product ingredients for edit:', error);
    }

        // After ingredients and basic fields populated, load group parameters for this product if in a group
        try {
            const groupSelect = document.getElementById('productGroup');
            if (groupSelect && groupSelect.value) {
                await loadSelectedGroupParameters(groupSelect.value, productData.id);
            } else {
                // Ensure wrapper hidden when no group
                const wrapper = document.getElementById('productGroupParametersWrapper');
                if (wrapper) wrapper.style.display = 'none';
            }
        } catch (e) {
            console.warn('Failed to load group parameters for edited product:', e);
        }
}

/**
 * Select existing ingredients for product editing
 * @param {Array} productIngredients - Array of existing product ingredients
 */
async function selectExistingIngredients(productIngredients) {
    console.log('selectExistingIngredients called with:', productIngredients);
    
    return new Promise((resolve) => {
        // Use requestAnimationFrame to ensure DOM is fully rendered
        requestAnimationFrame(() => {
            console.log('Processing ingredients in requestAnimationFrame...');
            
            productIngredients.forEach((ingredient, index) => {
                // Use 'id' field from API response (ingredient.id is the ingredient ID)
                const ingredientId = ingredient.id;
                console.log(`Processing ingredient ${index + 1}/${productIngredients.length}: ID ${ingredientId}, Name: ${ingredient.name}`);
                
                const checkbox = document.getElementById(`ingredient-${ingredientId}`);
                console.log(`Checkbox for ingredient ${ingredientId}:`, checkbox);
                
                if (checkbox) {
                    // Check the checkbox
                    checkbox.checked = true;
                    console.log(`Checked checkbox for ingredient ${ingredientId}`);
                    
                    // Find the ingredient data
                    const ingredientData = availableIngredients.find(ing => ing.id === ingredientId);
                    console.log(`Found ingredient data:`, ingredientData);
                    
                    if (ingredientData) {
                        // Add to selected ingredients
                        addSelectedIngredient(ingredientData);
                        console.log(`Added selected ingredient: ${ingredientData.name}`);
                        
                        // Set the quantity value after a delay
                        setTimeout(() => {
                            const quantityInput = document.getElementById(`quantity-${ingredientId}`);
                            console.log(`Quantity input for ${ingredientId}:`, quantityInput);
                            
                            if (quantityInput) {
                                quantityInput.value = ingredient.quantity_used || '';
                                console.log(`Set quantity for ${ingredientData.name}: ${ingredient.quantity_used}g`);
                            } else {
                                console.warn(`Could not find quantity input for ingredient ${ingredientId}`);
                            }
                        }, 100 * (index + 1)); // Stagger the quantity setting
                    } else {
                        console.warn(`Could not find ingredient data for ID ${ingredientId}`);
                    }
                } else {
                    console.warn(`Could not find checkbox for ingredient ${ingredientId}`);
                }
            });
            
            // Resolve after all processing is done
            setTimeout(resolve, 200);
        });
    });
}

/**
 * Display ingredient selector checkboxes
 * @param {Array} ingredients - Array of available ingredients
 */
function displayIngredientSelector(ingredients) {
    const selector = document.getElementById('ingredientSelector');
    
    if (!ingredients || ingredients.length === 0) {
        selector.innerHTML = '';
        return;
    }
    
    // Check if we have existing product ingredient data for display
    const existingIngredients = window.editingProductIngredients || {};
    
    let selectorHTML = '';
    ingredients.forEach(ingredient => {
        // Check if this ingredient is already used in the product being edited
        const existingQty = existingIngredients[ingredient.id];
        const quantityDisplay = existingQty ? ` (${existingQty}g used)` : '';
        const selectedClass = existingQty ? ' selected-in-edit' : '';
        
        selectorHTML += `
            <div class="ingredient-option${selectedClass}" onclick="toggleIngredientSelection(${ingredient.id})">
                <input type="checkbox" id="ingredient-${ingredient.id}" onchange="handleIngredientChange(${ingredient.id})">
                <div>
                    <strong>${ingredient.name}</strong>
                    <div style="font-size: 0.9em; color: #666;">${ingredient.barcode_id}${quantityDisplay}</div>
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
        barcodeScanner.disabled = false;
        barcodeScanner.placeholder = 'Scan or type barcode...';
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
    
    // Reset modal title
    const modalTitle = document.querySelector('#productModal h3');
    if (modalTitle) {
        modalTitle.textContent = 'Add New Product';
    }
    
    // Reset form field states
    const productNameInput = document.getElementById('productName');
    const mixedDate = document.getElementById('mixedDate');
    if (productNameInput) {
        productNameInput.readOnly = false;
        productNameInput.style.backgroundColor = '';
        productNameInput.style.color = '';
    }
    if (mixedDate) {
        mixedDate.readOnly = false;
        mixedDate.style.backgroundColor = '';
        mixedDate.style.color = '';
    }
    
    // Reset inline input container layout
    const inputContainer = document.querySelector('.inline-input-container');
    const productNameField = document.getElementById('productName');
    const nameGroup = document.querySelector('#productModal .form-group');
    
    if (inputContainer && productNameField && nameGroup) {
        // Move the product name field back to its original position
        nameGroup.appendChild(productNameField);
        // Remove the container
        inputContainer.remove();
    }
    
    if (productNameField) {
        productNameField.style.flex = '';
    }
    
    // Clear editing data
    window.editingProductData = null;
    window.editingProductIngredients = null;
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
 * Handle group assignment for a product
 * @param {number} productId - ID of the product
 * @param {number|null} groupId - ID of the group to assign to (null for no group)
 */
async function handleGroupAssignment(productId, groupId) {
    if (!window.productGroups) return;
    
    try {
        if (groupId) {
            // Add product to the specified group (also removes from any other group)
            await addProductToGroup(groupId, productId);
        } else {
            // Remove product from any group
            await removeProductFromGroup(null, productId);
        }
    } catch (error) {
        console.error('Failed to handle group assignment:', error);
        // Still update local cache even if database save fails
        window.productGroups.forEach(group => {
            group.productIds = group.productIds.filter(id => id !== productId);
        });
        
        if (groupId) {
            const targetGroup = window.productGroups.find(g => g.id === groupId);
            if (targetGroup && !targetGroup.productIds.includes(productId)) {
                targetGroup.productIds.push(productId);
            }
        }
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
    
    // Check if we're in edit mode
    const isEditMode = window.editingProductData !== null;
    
    try {
        // Disable submit button
        submitButton.disabled = true;
        submitButton.textContent = isEditMode ? 'Updating...' : 'Creating...';
        
        // Collect and validate form data
        const productData = collectProductFormData();
        
        console.log(isEditMode ? 'Calling API to update product...' : 'Calling API to create product...');
        
        // Create or update product via API
        let result;
        if (isEditMode) {
            productData.id = window.editingProductData.id;
            result = await pywebview.api.update_product(productData);
        } else {
            result = await pywebview.api.create_product(productData);
        }
        
        console.log('API result:', result);
        
        if (result.success) {
            // Store parameter values temporarily to persist after group assignment
            window.pendingParameterValues = productData.parameter_values || [];
            // Handle group assignment after product creation/update
            const productId = isEditMode ? productData.id : result.product_id;
            if (!isEditMode) {
                window.latestCreatedProductId = productId;
            }
            await handleGroupAssignment(productId, productData.group_id);
            
            if (isEditMode) {
                handleProductUpdateSuccess(submitButton, barcodeResult, productData.product_name);
            } else {
                handleProductCreationSuccess(submitButton, barcodeResult, productData.product_name);
            }
        } else {
            throw new Error(result.message || (isEditMode ? 'Failed to update product' : ERROR_MESSAGES.CREATE_PRODUCT_FAILED));
        }
        
    } catch (error) {
        console.error(isEditMode ? 'Error updating product:' : 'Error creating product:', error);
        
        // Always reset button state on any error, including validation errors
        submitButton.disabled = false;
        submitButton.textContent = isEditMode ? 'Update Product' : 'Add Product';
        submitButton.className = 'modal-button submit';
        
        if (isEditMode) {
            handleProductUpdateError(submitButton, barcodeResult, error.message);
        } else {
            handleProductCreationError(submitButton, barcodeResult, error.message);
        }
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
    const amount = parseInt(document.getElementById('productAmount').value) || 0;
    
    console.log('Product name:', productName);
    console.log('Mixed date:', mixedDate);
    console.log('Amount:', amount);
    
    // Validate amount
    if (amount < 0) {
        throw new Error('Number of batches cannot be negative');
    }
    
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
    
    // Get selected group (optional)
    const groupSelect = document.getElementById('productGroup');
    const selectedGroupId = groupSelect ? groupSelect.value : '';

    // Collect custom parameter values if wrapper visible
    const parameterValues = [];
    const paramInputs = document.querySelectorAll('#productGroupParametersContainer .product-group-parameter-input');
    paramInputs.forEach(input => {
        const paramId = parseInt(input.dataset.parameterId);
        const val = input.value.trim();
        if (paramId) {
            parameterValues.push({ parameter_id: paramId, value: val });
        }
    });
    
    return {
        product_name: productName,
        mixed_date: mixedDate,
        amount: amount,
        ingredients: selectedIngredients,
        group_id: selectedGroupId ? parseInt(selectedGroupId) : null,
        parameter_values: parameterValues
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

    // Product creation logs an inventory event in the DB; ensure Events will reload.
    try {
        if (typeof window.markEventsDirty === 'function') {
            window.markEventsDirty();
        }
    } catch (e) {
        console.warn('Unable to mark events dirty after product creation:', e);
    }
    
    // Use unified refresh function to reload data with search persistence
    setTimeout(async () => {
        // Clear search cache to ensure new items appear in searches
        if (window.clearSearchCache) {
            window.clearSearchCache();
        }
        
        await refreshInventoryData();

        // After product is created and group assignment done, save parameter values if any
        try {
            if (window.latestCreatedProductId && window.pendingParameterValues && window.pendingParameterValues.length > 0) {
                await pywebview.api.set_product_group_parameter_values(window.latestCreatedProductId, window.pendingParameterValues);
            }
        } catch (e) {
            console.error('Failed to save product parameter values:', e);
        }
        
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
    // Show error in result area
    barcodeResult.innerHTML = `
        <div style="color: #f44336; font-weight: 600;">Creation Failed</div>
        <div style="color: #666; font-size: 0.9em; margin-top: 8px;">${errorMessage}</div>
    `;
    barcodeResult.className = 'barcode-result error';
    barcodeResult.style.display = 'block';
    
    setTimeout(() => {
        barcodeResult.classList.add('show');
    }, 100);
    
    // Button state is already reset in the main error handler, so don't override it
}

/**
 * Handle successful product update
 * @param {HTMLElement} submitButton - Submit button element
 * @param {HTMLElement} barcodeResult - Barcode result element
 * @param {string} productName - Name of updated product
 */
function handleProductUpdateSuccess(submitButton, barcodeResult, productName) {
    // Hide the submit button since success message will be shown
    submitButton.style.display = 'none';
    
    // Also hide the cancel button
    const cancelButton = document.querySelector('#productModal .modal-button.cancel');
    if (cancelButton) {
        cancelButton.style.display = 'none';
    }
    
    // Show success message without animation
    barcodeResult.innerHTML = `
        <div style="color: #4caf50; font-weight: 600;">Product Updated Successfully</div>
        <div style="color: #666; font-size: 0.9em; margin-top: 8px;">Product "${productName}" has been updated.</div>
    `;
    barcodeResult.className = 'barcode-result success show';
    barcodeResult.style.display = 'block';
    
    // Use unified refresh function to reload data with search persistence
    setTimeout(async () => {
        // Clear search cache to ensure updated items appear correctly in searches
        if (window.clearSearchCache) {
            window.clearSearchCache();
        }
        
        await refreshInventoryData();

        // Save parameter values for existing product
        try {
            if (window.editingProductData && window.editingProductData.id) {
                const paramValues = [];
                const paramInputs = document.querySelectorAll('#productGroupParametersContainer .product-group-parameter-input');
                paramInputs.forEach(input => {
                    const pid = parseInt(input.dataset.parameterId);
                    const val = input.value.trim();
                    if (pid) {
                        paramValues.push({ parameter_id: pid, value: val });
                    }
                });
                if (paramValues.length > 0) {
                    await pywebview.api.set_product_group_parameter_values(window.editingProductData.id, paramValues);
                }
            }
        } catch (e) {
            console.error('Failed to update product parameter values:', e);
        }
        
        // Auto-close product modal after refresh
        setTimeout(() => {
            closeProductModal();
        }, 500);
    }, 300);
}

/**
 * Handle product update error
 * @param {HTMLElement} submitButton - Submit button element
 * @param {HTMLElement} barcodeResult - Barcode result element
 * @param {string} errorMessage - Error message
 */
function handleProductUpdateError(submitButton, barcodeResult, errorMessage) {
    // Show error in result area
    barcodeResult.innerHTML = `
        <div style="color: #f44336; font-weight: 600;">Update Failed</div>
        <div style="color: #666; font-size: 0.9em; margin-top: 8px;">${errorMessage}</div>
    `;
    barcodeResult.className = 'barcode-result error';
    barcodeResult.style.display = 'block';
    
    setTimeout(() => {
        barcodeResult.classList.add('show');
    }, 100);
    
    // Button state is already reset in the main error handler, so don't override it
}

// ==== INGREDIENT MODAL FUNCTIONS ====

/**
 * Open ingredient creation modal
 * @param {Object} ingredientData - Existing ingredient data for editing (optional)
 * @param {boolean} isEditMode - Whether this is edit mode
 */
async function openIngredientModal(ingredientData = null, isEditMode = false) {
    try {
        // Show modal
        const modal = document.getElementById('ingredientModalBackdrop');
        if (modal) {
            modal.classList.add('open');
            
            // Update modal title and button text based on mode
            const modalTitle = document.querySelector('#ingredientModal h3');
            const submitButton = document.getElementById('submitIngredientButton');
            const cancelButton = document.querySelector('#ingredientModal .modal-button.cancel');
            
            if (isEditMode && ingredientData) {
                modalTitle.textContent = 'Edit Ingredient';
                submitButton.textContent = 'Update Ingredient';
                // Store edit data for form submission
                window.editingIngredientData = ingredientData;
                // Populate form with existing data
                populateIngredientForm(ingredientData);
            } else {
                modalTitle.textContent = 'Add New Ingredient';
                submitButton.textContent = 'Add Ingredient';
                window.editingIngredientData = null;
                // Set default date to today for new ingredients
                const today = new Date().toISOString().split('T')[0];
                document.getElementById('ingredientPurchaseDate').value = today;
            }
            
            // Restore buttons in case they were hidden from previous use
            if (submitButton) {
                submitButton.style.display = '';
                submitButton.disabled = false;
            }
            if (cancelButton) {
                cancelButton.style.display = '';
            }
            
            // Ensure form event listener is attached
            attachIngredientFormListener();
        }
    } catch (error) {
        console.error('Error opening ingredient modal:', error);
        if (window.notifyError) {
            window.notifyError('Failed to open ingredient creation modal.');
        } else {
            alert('Failed to open ingredient creation modal.');
        }
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
 * Populate ingredient form with existing data for editing
 * @param {Object} ingredientData - Existing ingredient data
 */
function populateIngredientForm(ingredientData) {
    // Fill form fields with existing data
    document.getElementById('ingredientName').value = ingredientData.name || '';
    document.getElementById('ingredientUnitCost').value = ingredientData.unit_cost || '';
    document.getElementById('ingredientPurchaseDate').value = ingredientData.purchase_date || '';
    document.getElementById('ingredientExpirationDate').value = ingredientData.expiration_date || '';
    document.getElementById('ingredientSupplier').value = ingredientData.supplier || '';
    
    // Modify the ingredient name field to show barcode ID inline (similar to product modal)
    const nameField = document.getElementById('ingredientName');
    const nameGroup = nameField.closest('.form-group');
    
    if (nameGroup && !document.getElementById('ingredientBarcodeDisplay')) {
        // Create a container for the inline inputs
        const inputContainer = document.createElement('div');
        inputContainer.className = 'inline-input-container';
        
        // Create the barcode input
        const barcodeInput = document.createElement('input');
        barcodeInput.type = 'text';
        barcodeInput.id = 'ingredientBarcodeDisplay';
        barcodeInput.value = ingredientData.barcode_id || '';
        barcodeInput.readOnly = true;
        barcodeInput.style.cssText = 'background-color: #f5f5f5; color: #666;';
        barcodeInput.placeholder = 'Barcode ID';
        barcodeInput.title = 'Barcode ID (cannot be changed)';
        
        // Move the name field and barcode input into the container
        nameField.before(inputContainer);
        inputContainer.appendChild(nameField);
        inputContainer.appendChild(barcodeInput);
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
        
        // Remove inline container and restore original form structure if it exists
        const inlineContainer = document.querySelector('#ingredientModal .inline-input-container');
        if (inlineContainer) {
            const nameField = document.getElementById('ingredientName');
            const nameGroup = nameField.closest('.form-group');
            
            // Move the name field back to its original position
            inlineContainer.before(nameField);
            
            // Remove the inline container
            inlineContainer.remove();
        }
        
        // Reset modal title
        const modalTitle = document.querySelector('#ingredientModal h3');
        if (modalTitle) {
            modalTitle.textContent = 'Add New Ingredient';
        }
        
        // Clear editing data
        window.editingIngredientData = null;
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
    
    // Check if we're in edit mode
    const isEditMode = window.editingIngredientData !== null;
    
    // Change button to loading state
    submitButton.textContent = isEditMode ? 'Updating...' : 'Creating...';
    submitButton.disabled = true;
    submitButton.style.backgroundColor = '#6c757d';
    
    try {
        const ingredientData = collectIngredientFormData(event);
        
        console.log(isEditMode ? 'Updating ingredient data:' : 'Submitting ingredient data:', ingredientData);
        
        // Call backend to create or update ingredient
        let result;
        if (isEditMode) {
            ingredientData.id = window.editingIngredientData.id;
            result = await pywebview.api.update_ingredient(ingredientData);
        } else {
            result = await pywebview.api.create_ingredient(ingredientData);
        }
        
        if (result.success) {
            if (isEditMode) {
                handleIngredientUpdateSuccess(submitButton, result);
            } else {
                handleIngredientCreationSuccess(submitButton, result);
            }
        } else {
            throw new Error(result.error || (isEditMode ? 'Failed to update ingredient' : ERROR_MESSAGES.CREATE_INGREDIENT_FAILED));
        }
        
    } catch (error) {
        console.error(isEditMode ? 'Error updating ingredient:' : 'Error creating ingredient:', error);
        if (isEditMode) {
            handleIngredientUpdateError(submitButton, error.message);
        } else {
            handleIngredientCreationError(submitButton, error.message);
        }
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
        purchase_date: formData.get('ingredientPurchaseDate'),
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
    
    // Use unified refresh function to reload data with search persistence
    setTimeout(async () => {
        // Clear search cache to ensure new ingredients appear in searches
        if (window.clearSearchCache) {
            window.clearSearchCache();
        }
        
        // Use unified refresh to reload data with search persistence
        await refreshInventoryData();
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
    
    const msg = `${ERROR_MESSAGES.CREATE_INGREDIENT_FAILED}: ${errorMessage}`;
    if (window.notifyError) {
        window.notifyError(msg);
    } else {
        alert(msg);
    }
}

/**
 * Handle successful ingredient update
 * @param {HTMLElement} submitButton - Submit button element
 * @param {Object} result - API result object
 */
function handleIngredientUpdateSuccess(submitButton, result) {
    console.log('Ingredient updated successfully:', result);
    
    // Hide the submit button since success message will be shown
    submitButton.style.display = 'none';
    
    // Also hide the cancel button
    const cancelButton = document.querySelector('#ingredientModal .modal-button.cancel');
    if (cancelButton) {
        cancelButton.style.display = 'none';
    }
    
    // Display success message (match product success message format)
    const container = document.getElementById('ingredientBarcodeResult');
    if (container) {
        container.innerHTML = `
            <div style="color: #4caf50; font-weight: 600;">Ingredient Updated Successfully</div>
            <div style="color: #666; font-size: 0.9em; margin-top: 8px;">Ingredient "${result.ingredient ? result.ingredient.name : 'Ingredient'}" has been updated.</div>
        `;
        
        // Show the container with proper CSS classes
        container.className = 'barcode-result success show';
        container.style.display = 'block';
    }
    
    // Use unified refresh function to reload data with search persistence
    setTimeout(async () => {
        // Clear search cache to ensure updated ingredients appear correctly in searches
        if (window.clearSearchCache) {
            window.clearSearchCache();
        }
        
        // Use unified refresh to reload data with search persistence
        await refreshInventoryData();
        // Note: No auto-close for ingredient modal - user must manually close
    }, 300);
}

/**
 * Handle ingredient update error
 * @param {HTMLElement} submitButton - Submit button element
 * @param {string} errorMessage - Error message
 */
function handleIngredientUpdateError(submitButton, errorMessage) {
    // Show failure on button - keep it permanently until modal closes
    submitButton.textContent = '✗ Update Failed';
    submitButton.style.backgroundColor = '#dc3545';
    submitButton.style.color = 'white';
    submitButton.disabled = true; // Keep disabled after failure
    
    const msg = `Failed to update ingredient: ${errorMessage}`;
    if (window.notifyError) {
        window.notifyError(msg);
    } else {
        alert(msg);
    }
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

/**
 * Open group creation modal
 */
function openGroupModal() {
    console.log('openGroupModal called');
    
    const backdrop = document.getElementById('groupModalBackdrop');
    const modal = document.getElementById('groupModal');
    const form = document.getElementById('groupForm');
    
    console.log('Modal elements:', { backdrop, modal, form });
    
    if (!backdrop || !modal || !form) {
        console.error('Group modal elements not found');
        return;
    }
    
    // Reset form
    form.reset();

    // Creation mode flags
    window.editingGroupId = null;
    window.originalGroupParameters = [];
    const titleEl = document.querySelector('#groupModal h3');
    if (titleEl) titleEl.textContent = 'Create Group';
    const submitBtn = document.getElementById('submitGroupButton');
    if (submitBtn) submitBtn.textContent = 'Create Group';

    // Clear any existing parameter fields
    const paramsContainer = document.getElementById('groupParametersContainer');
    if (paramsContainer) {
        paramsContainer.innerHTML = '';
    }
    
    // Show modal with correct class
    backdrop.classList.add('open');
    
    // Focus on group name input
    const groupNameInput = document.getElementById('groupName');
    if (groupNameInput) {
        setTimeout(() => groupNameInput.focus(), 100);
    }
    
    // Add form submit handler
    form.removeEventListener('submit', handleGroupSubmission);
    form.addEventListener('submit', handleGroupSubmission);
    
    console.log('Group modal opened successfully');
}

// Open group edit modal
async function openEditGroupModal(groupId) {
    const backdrop = document.getElementById('groupModalBackdrop');
    const form = document.getElementById('groupForm');
    const paramsContainer = document.getElementById('groupParametersContainer');
    const titleEl = document.querySelector('#groupModal h3');
    const submitBtn = document.getElementById('submitGroupButton');
    if (!backdrop || !form || !paramsContainer) return;
    // Find group data
    const group = window.productGroups ? window.productGroups.find(g => g.id === groupId) : null;
    if (!group) return;
    // Set flags
    window.editingGroupId = groupId;
    window.originalGroupParameters = [];
    // Reset UI
    form.reset();
    paramsContainer.innerHTML = '';
    // Load existing parameters
    try {
        const params = await pywebview.api.get_group_parameters(groupId);
        window.originalGroupParameters = params || [];
        (params || []).forEach(p => {
            const row = document.createElement('div');
            row.className = 'group-parameter-row';
            row.style.cssText = 'display:flex; gap:8px; align-items:center; margin-top:6px;';
            row.innerHTML = `
                <input type="text" class="group-parameter-input" data-parameter-id="${p.id}" value="${p.name}" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:6px;" maxlength="64" />
                <button type="button" class="modal-button cancel" style="padding:8px 12px;" onclick="this.parentElement.remove()">Remove</button>
            `;
            paramsContainer.appendChild(row);
        });
    } catch (e) {
        console.warn('Failed to load group parameters for edit:', e);
    }
    // Set group name
    const groupNameInput = document.getElementById('groupName');
    if (groupNameInput) groupNameInput.value = group.name;
    // Update titles/buttons
    if (titleEl) titleEl.textContent = 'Edit Group';
    if (submitBtn) {
        submitBtn.textContent = 'Save Changes';
        submitBtn.disabled = false;
    }
    // Open modal
    backdrop.classList.add('open');
    // Attach handler
    form.removeEventListener('submit', handleGroupSubmission);
    form.addEventListener('submit', handleGroupSubmission);
    setTimeout(() => groupNameInput && groupNameInput.focus(), 100);
}
window.openEditGroupModal = openEditGroupModal;

/**
 * Close group creation modal
 */
function closeGroupModal() {
    const backdrop = document.getElementById('groupModalBackdrop');
    const form = document.getElementById('groupForm');
    
    if (!backdrop) return;
    
    backdrop.classList.remove('open');
    
    setTimeout(() => {
        if (form) {
            form.reset();
        }
    }, 300);
}

/**
 * Handle group form submission
 * @param {Event} event - Form submit event
 */
async function handleGroupSubmission(event) {
    event.preventDefault();
    
    const groupNameInput = document.getElementById('groupName');
    const submitButton = document.getElementById('submitGroupButton');
    
    if (!groupNameInput || !submitButton) return;
    
    const groupName = groupNameInput.value.trim();
    
    if (!groupName) {
        if (window.notifyError) {
            window.notifyError('Please enter a group name');
        } else {
            alert('Please enter a group name');
        }
        return;
    }
    
    // Disable submit button and show processing state
    submitButton.disabled = true;
    submitButton.textContent = 'Creating...';
    
    try {
        if (window.editingGroupId) {
            // EDIT MODE
            submitButton.textContent = 'Saving...';
            // Update group name
            const renameResp = await pywebview.api.update_group_name(window.editingGroupId, groupName);
            if (!renameResp.success) throw new Error(renameResp.message || 'Failed to rename group');
            // Determine changes to parameters
            const existingMap = new Map(window.originalGroupParameters.map(p => [p.id, p.name]));
            const currentParamInputs = Array.from(document.querySelectorAll('.group-parameter-input'));
            const remainingIds = new Set();
            // Create / update
            for (const input of currentParamInputs) {
                const name = input.value.trim();
                if (!name) continue;
                const pid = input.dataset.parameterId ? parseInt(input.dataset.parameterId) : null;
                if (pid) {
                    remainingIds.add(pid);
                    const originalName = existingMap.get(pid);
                    if (originalName !== name) {
                        const upd = await pywebview.api.update_group_parameter(pid, name);
                        if (!upd.success) console.warn('Failed to update parameter', pid, upd.message);
                    }
                } else {
                    // New parameter
                    try {
                        await pywebview.api.create_group_parameter(window.editingGroupId, name);
                    } catch (e) {
                        console.warn('Failed to create parameter', name, e);
                    }
                }
            }
            // Deletions
            for (const p of window.originalGroupParameters) {
                if (!remainingIds.has(p.id)) {
                    try {
                        await pywebview.api.delete_group_parameter(p.id);
                    } catch (e) {
                        console.warn('Failed to delete parameter', p.id, e);
                    }
                }
            }
            // Success UI
            submitButton.textContent = '✓ Saved';
            submitButton.style.backgroundColor = '#28a745';
            submitButton.style.color = 'white';
            setTimeout(async () => {
                closeGroupModal();
                window.editingGroupId = null;
                window.originalGroupParameters = [];
                submitButton.textContent = 'Create Group';
                submitButton.style.backgroundColor = '';
                submitButton.style.color = '';
                submitButton.disabled = false;
                if (window.refreshInventoryData) await window.refreshInventoryData();
            }, 500);
        } else {
            // CREATE MODE (previous logic simplified)
            if (typeof createGroup !== 'function') throw new Error('createGroup function not available');
            await createGroup(groupName);
            submitButton.textContent = '✓ Created';
            submitButton.style.backgroundColor = '#28a745';
            submitButton.style.color = 'white';
            setTimeout(async () => {
                // Identify created group (last in array)
                const createdGroup = window.productGroups[window.productGroups.length - 1];
                const paramInputs = document.querySelectorAll('.group-parameter-input');
                for (const input of paramInputs) {
                    const name = input.value.trim();
                    if (name) {
                        try { await pywebview.api.create_group_parameter(createdGroup.id, name); } catch (e) { console.warn('Param create failed', name, e); }
                    }
                }
                closeGroupModal();
                submitButton.textContent = 'Create Group';
                submitButton.style.backgroundColor = '';
                submitButton.style.color = '';
                submitButton.disabled = false;
                if (window.refreshInventoryData) await window.refreshInventoryData();
            }, 500);
        }
    } catch (error) {
        console.error('Error saving group:', error);
        submitButton.textContent = '✗ Failed';
        submitButton.style.backgroundColor = '#dc3545';
        submitButton.style.color = 'white';
        const msg = 'Failed to save group: ' + (error.message || 'Unknown error');
        if (window.notifyError) {
            window.notifyError(msg);
        } else {
            alert(msg);
        }
        setTimeout(() => {
            submitButton.textContent = window.editingGroupId ? 'Save Changes' : 'Create Group';
            submitButton.style.backgroundColor = '';
            submitButton.style.color = '';
            submitButton.disabled = false;
        }, 2000);
    }
}

// Make functions globally accessible
window.openGroupModal = openGroupModal;
window.closeGroupModal = closeGroupModal;
window.handleGroupSubmission = handleGroupSubmission;

// ===== Group Parameter Dynamic Fields =====

function addGroupParameterField() {
    const container = document.getElementById('groupParametersContainer');
    if (!container) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'group-parameter-row';
    wrapper.style.cssText = 'display:flex; gap:8px; align-items:center; margin-top:6px;';
    wrapper.innerHTML = `
        <input type="text" class="group-parameter-input" placeholder="Parameter name" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:6px;" maxlength="64" />
        <button type="button" class="modal-button cancel" style="padding:8px 12px;" onclick="this.parentElement.remove()">Remove</button>
    `;
    container.appendChild(wrapper);
}
window.addGroupParameterField = addGroupParameterField;

// ===== Product Group Parameters Handling =====

async function loadSelectedGroupParameters(groupId, productId = null) {
    const wrapper = document.getElementById('productGroupParametersWrapper');
    const container = document.getElementById('productGroupParametersContainer');
    if (!wrapper || !container) return;
    container.innerHTML = '';
    if (!groupId) {
        wrapper.style.display = 'none';
        return;
    }
    try {
        const params = await pywebview.api.get_group_parameters(parseInt(groupId));
        if (!params || params.length === 0) {
            wrapper.style.display = 'none';
            return;
        }
        wrapper.style.display = 'block';
        let existingValuesMap = new Map();
        if (productId) {
            try {
                const existingValues = await pywebview.api.get_product_group_parameter_values(productId);
                existingValues.forEach(v => existingValuesMap.set(v.group_parameter_id, v.value));
            } catch (e) {
                console.warn('Could not load existing parameter values for product', productId, e);
            }
        }
        params.forEach(param => {
            const row = document.createElement('div');
            row.className = 'product-group-parameter-row';
            row.style.cssText = 'display:flex; flex-direction:column; gap:4px; margin-bottom:10px; background:#f5f5f5; padding:10px; border-radius:6px;';
            const value = existingValuesMap.get(param.id) || '';
            row.innerHTML = `
                <label style="font-weight:600; color:#333;">${param.name}</label>
                <input type="text" data-parameter-id="${param.id}" class="product-group-parameter-input" value="${value}" placeholder="Enter value..." style="padding:8px; border:1px solid #ccc; border-radius:6px;" />
            `;
            container.appendChild(row);
        });
    } catch (e) {
        console.error('Failed to load group parameters:', e);
        wrapper.style.display = 'none';
    }
}
window.loadSelectedGroupParameters = loadSelectedGroupParameters;

// Listen for group selection changes inside product modal
document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'productGroup') {
        const groupId = e.target.value;
        const editingProduct = window.editingProductData ? window.editingProductData.id : null;
        loadSelectedGroupParameters(groupId, editingProduct);
    }
});

