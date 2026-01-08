// Ingredient management functionality for the inventory system

// Intersection Observer for viewport-based animations
let ingredientItemObserver = null;

/**
 * Initialize Intersection Observer for ingredient item animations
 */
function initIngredientItemObserver() {
    if (ingredientItemObserver) {
        ingredientItemObserver.disconnect();
    }
    
    const observerOptions = {
        root: document.getElementById('rightBoxContent'), // Observe within the right panel
        rootMargin: '50px', // Start animating 50px before entering viewport
        threshold: 0.01 // Trigger when even 1% is visible
    };
    
    ingredientItemObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const item = entry.target;
                // Only animate if it hasn't been animated yet
                if (item.classList.contains(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_HIDDEN)) {
                    animateIngredientItemIn(item);
                }
                // Stop observing once animated
                ingredientItemObserver.unobserve(item);
            }
        });
    }, observerOptions);
    
    return ingredientItemObserver;
}

/**
 * Cleanup ingredient item observer
 */
function cleanupIngredientItemObserver() {
    if (ingredientItemObserver) {
        ingredientItemObserver.disconnect();
        ingredientItemObserver = null;
    }
}

/**
 * Display ingredients details in the right panel
 * @param {Array} ingredients - Array of ingredient data
 */
function displayIngredientsDetails(ingredients) {
    const rightContainer = document.getElementById('rightBoxContent');
    const totalContainer = document.getElementById('ingredientsTotalFixed');
    
    if (!ingredients || ingredients.length === 0) {
        rightContainer.innerHTML = '';
        totalContainer.innerHTML = '';
        totalContainer.style.display = 'none';
        
        // Show title indicating a product is selected but has no ingredients
        updateIngredientsTitle('Product Ingredients', false);
        return;
    }
    
    const { ingredientsHTML, totalCost } = createIngredientsDetailsHTML(ingredients, false); // Don't show delete button for product ingredients
    
    rightContainer.innerHTML = ingredientsHTML;
    
    // Show title indicating a product is selected with ingredients
    updateIngredientsTitle('Product Ingredients', false);
    
    // Display total cost in fixed bottom section
    totalContainer.innerHTML = `<h4>Total Ingredients Cost: ${formatCurrency(totalCost)}</h4>`;
    totalContainer.style.display = 'flex';
}

/**
 * Create HTML for ingredients details
 * @param {Array} ingredients - Array of ingredient data
 * @param {boolean} showDeleteButton - Whether to show delete button
 * @returns {Object} Object containing ingredientsHTML and totalCost
 */
function createIngredientsDetailsHTML(ingredients, showDeleteButton = false) {
    let ingredientsHTML = '<div class="ingredients-list">';
    let totalCost = 0;
    
    ingredients.forEach(ingredient => {
        const cost = parseFloat(ingredient.total_ingredient_cost);
        totalCost += cost;
        
        const isFlagged = ingredient.is_flagged === 1;
        const flaggedClass = isFlagged ? ' flagged' : '';
        const flaggedButtonClass = isFlagged ? ' flagged' : '';
        
        ingredientsHTML += createIngredientItemHTML(ingredient, isFlagged, flaggedClass, flaggedButtonClass, cost, showDeleteButton);
    });
    
    ingredientsHTML += '</div>';
    
    return { ingredientsHTML, totalCost };
}

/**
 * Create HTML for a single ingredient item
 * @param {Object} ingredient - Ingredient data
 * @param {boolean} isFlagged - Whether ingredient is flagged
 * @param {string} flaggedClass - CSS class for flagged state
 * @param {string} flaggedButtonClass - CSS class for flagged button
 * @param {number} cost - Ingredient cost
 * @param {boolean} showDeleteButton - Whether to show delete button
 * @returns {string} HTML for ingredient item
 */
function createIngredientItemHTML(ingredient, isFlagged, flaggedClass, flaggedButtonClass, cost, showDeleteButton = false) {
    const purchaseDate = formatDate(ingredient.purchase_date);
    const expirationDate = formatDate(ingredient.expiration_date);
    
    // Create menu items based on available actions
    const menuItems = [
        `<div class="ingredient-menu-item" onclick="editIngredient(${ingredient.id}); closeIngredientMenu(${ingredient.id})">
            <img src="static/img/svg/edit.svg" alt="Edit" class="menu-icon" />
            <span>Edit Ingredient</span>
        </div>`,
        `<div class="ingredient-menu-item" onclick="toggleIngredientFlag(${ingredient.id}, '${ingredient.name}', ${isFlagged}); closeIngredientMenu(${ingredient.id})">
            <div class="flag-icon menu-icon">
                <svg viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M425.4,135.441h-84.044v-30.562c0-9.042-7.33-16.373-16.372-16.373H128.519V76.407c8.224-0.869,14.633-7.824,14.633-16.278c0-6.64-3.96-12.344-9.64-14.913c2.382-4.352,3.739-9.345,3.739-14.656C137.251,13.683,123.567,0,106.689,0C89.811,0,76.129,13.683,76.129,30.561c0,5.311,1.357,10.304,3.739,14.656c-5.68,2.569-9.64,8.273-9.64,14.913c0,8.454,6.409,15.408,14.633,16.278v413.764c0,12.056,9.773,21.829,21.829,21.829s21.829-9.773,21.829-21.829V288.247h62.214v30.561c0,9.042,7.33,16.372,16.373,16.372H425.4c9.042,0,16.372-7.33,16.372-16.372V151.813C441.772,142.771,434.443,135.441,425.4,135.441z"/>
                </svg>
            </div>
            <span>${isFlagged ? 'Remove Flag' : 'Flag Ingredient'}</span>
        </div>`
    ];
    
    // Add delete button if applicable
    if (showDeleteButton) {
        menuItems.push(`<div class="ingredient-menu-item danger" onclick="confirmDeleteIngredient(${ingredient.id}, '${ingredient.name}'); closeIngredientMenu(${ingredient.id})">
            <img src="static/img/svg/trash.svg" alt="Delete" class="menu-icon" />
            <span>Delete Ingredient</span>
        </div>`);
    }
    
    return `
        <div class="ingredient-item${flaggedClass}" data-ingredient-id="${ingredient.id}">
            <div class="ingredient-actions">
                <div class="ingredient-menu-container">
                    <button class="ingredient-menu-button" 
                            onclick="toggleIngredientMenu(${ingredient.id})"
                            title="More actions">
                        <img src="static/img/svg/dots-vertical.svg" alt="More actions" class="dots-icon" />
                    </button>
                    <div class="ingredient-menu" id="ingredientMenu${ingredient.id}">
                        ${menuItems.join('')}
                    </div>
                </div>
            </div>
            <div class="ingredient-header">
                <strong>${ingredient.name}</strong>
            </div>
            <div class="ingredient-barcode">
                <span class="label">Barcode ID:</span>
                <span class="value barcode-id">${ingredient.barcode_id}</span>
            </div>
            <div class="ingredient-details">
                <div class="ingredient-amount">
                    <span class="label">Amount Used:</span>
                    <span class="value">${ingredient.quantity_used} grams</span>
                </div>
                <div class="ingredient-cost">
                    <span class="label">Cost:</span>
                    <span class="value">${formatCurrency(cost)}</span>
                </div>
                <div class="ingredient-dates">
                    <div>
                        <span class="label">Purchase Date:</span>
                        <span class="value">${purchaseDate}</span>
                    </div>
                    <div>
                        <span class="label">Expiration:</span>
                        <span class="value expiration-date">${expirationDate}</span>
                    </div>
                </div>
                <div class="ingredient-supplier">
                    <span class="label">Supplier:</span>
                    <span class="value">${ingredient.supplier}</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Display all available ingredients in the inventory
 * @param {boolean} skipAnimation - Whether to skip the fade-in animation
 * @param {boolean} applySearchFilter - Whether to apply search filter immediately (default true, set to false during refresh)
 * @param {string} preFilterSearchTerm - Search term to pre-filter items before animation (prevents flash)
 */
async function displayAllIngredients(skipAnimation = false, applySearchFilter = true, preFilterSearchTerm = null) {
    const rightContainer = document.getElementById('rightBoxContent');
    const totalContainer = document.getElementById('ingredientsTotalFixed');
    
    try {
        // Don't show loading spinner - just prepare silently
        
        await waitForPywebview();
        const allIngredients = await pywebview.api.get_all_ingredients();
        
        if (!allIngredients || allIngredients.length === 0) {
            displayNoIngredientsMessage(rightContainer, totalContainer);
            return;
        }
        
        const ingredientsHTML = createAllIngredientsHTML(allIngredients);
        rightContainer.innerHTML = ingredientsHTML;
        
        // Show fixed title for all ingredients
        showIngredientsTitle('All Ingredients');
        
        // Hide total section for all ingredients view
        totalContainer.style.display = 'none';
        
        // IMPORTANT: Pre-filter items BEFORE animation if search term is provided
        // This prevents flashing all ingredients before filtering
        if (preFilterSearchTerm) {
            const filterData = await prepareIngredientFilterData(preFilterSearchTerm);
            if (filterData) {
                // Hide non-matching items immediately (before animation)
                const { matchingItems, nonMatchingItems } = filterData;
                
                nonMatchingItems.forEach(item => {
                    item.style.display = 'none';
                });
                
                // Handle empty state
                if (matchingItems.length === 0) {
                    showNoIngredientsMessage(rightContainer.querySelector('.ingredients-list.all-ingredients'));
                }
            }
        }
        // IMPORTANT: Apply search filter BEFORE animation if needed (for legacy calls)
        // This prevents flashing all ingredients before filtering
        else if (applySearchFilter) {
            const searchTerm = window.getCurrentSearchTerm ? window.getCurrentSearchTerm() : '';
            if (searchTerm) {
                // Apply search filter to the newly loaded ingredients BEFORE animating
                const searchId = window.getCurrentSearchId ? window.getCurrentSearchId() : 0;
                const filterData = await prepareIngredientFilterData(searchTerm);
                if (filterData) {
                    // Hide non-matching items immediately (before animation)
                    const { matchingItems, nonMatchingItems } = filterData;
                    
                    nonMatchingItems.forEach(item => {
                        item.style.display = 'none';
                    });
                    
                    // Handle empty state
                    if (matchingItems.length === 0) {
                        showNoIngredientsMessage(rightContainer.querySelector('.ingredients-list.all-ingredients'));
                    }
                }
            }
        }
        
        // Wait for loading screen to complete before showing ingredients
        await waitForLoadingScreenThenShow(skipAnimation);
        
    } catch (error) {
        console.error(ERROR_MESSAGES.LOAD_INGREDIENTS_FAILED, error);
        displayIngredientsError(rightContainer, totalContainer);
    }
}

/**
 * Wait for loading screen to complete, then show ingredients
 */
async function waitForLoadingScreenThenShow(skipAnimation = false) {
    // If loading screen is already complete, show immediately
    if (window.loadingScreenComplete) {
        animateIngredientsIn(skipAnimation);
    } else {
        // Store the animation function to be called when loading screen completes
        window.pendingIngredientAnimation = () => animateIngredientsIn(skipAnimation);
    }
}

/**
 * Animate ingredients in using Intersection Observer for viewport-based animations
 * Only animates items that are visible in the viewport
 */
function animateIngredientsIn(skipAnimation = false) {
    const ingredientItems = document.querySelectorAll('.ingredient-item.all-ingredient');
    
    if (skipAnimation) {
        // Skip animation - just show immediately
        ingredientItems.forEach(item => {
            item.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_HIDDEN);
        });
    } else {
        // Initialize observer
        const observer = initIngredientItemObserver();
        
        // Observe all items
        ingredientItems.forEach(item => {
            observer.observe(item);
        });
    }
}

/**
 * Animate ingredient item in (using same animation as product rows)
 * @param {HTMLElement} item - Ingredient item element to animate
 */
function animateIngredientItemIn(item) {
    item.getBoundingClientRect();
    item.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_HIDDEN);
    item.classList.add(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_ANIMATE_IN);
    
    setTimeout(() => {
        item.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_ANIMATE_IN);
    }, INVENTORY_CONFIG.ANIMATION.ANIMATION_DURATION);
}

// Make function globally accessible
window.displayAllIngredients = displayAllIngredients;

/**
 * Display message when no ingredients are available
 * @param {HTMLElement} rightContainer - Right container element
 * @param {HTMLElement} totalContainer - Total container element
 */
function displayNoIngredientsMessage(rightContainer, totalContainer) {
    rightContainer.innerHTML = `
        <div class="empty-state-message">
            <h3>Add Ingredient</h3>
            <p>Right click and select "Create Ingredient"</p>
        </div>
    `;
    totalContainer.style.display = 'none';
    updateIngredientsTitle('All Ingredients', true);
}

/**
 * Display error message for ingredients loading
 * @param {HTMLElement} rightContainer - Right container element
 * @param {HTMLElement} totalContainer - Total container element
 */
function displayIngredientsError(rightContainer, totalContainer) {
    rightContainer.innerHTML = `
        <div style="text-align: center; color: #666; padding: 40px 24px;">
            <h3>Error Loading Ingredients</h3>
            <p>Unable to load ingredients. Please try refreshing the page.</p>
            <button onclick="displayAllIngredients()" style="
                padding: 10px 20px; 
                background: #be1d2b; 
                color: white; 
                border: none; 
                border-radius: 5px; 
                cursor: pointer;
                margin-top: 10px;
            ">Retry</button>
        </div>
    `;
    totalContainer.style.display = 'none';
    hideIngredientsTitle();
}

/**
 * Create HTML for all ingredients display
 * @param {Array} allIngredients - Array of all ingredients
 * @returns {string} HTML for all ingredients
 */
function createAllIngredientsHTML(allIngredients) {
    let ingredientsHTML = '<div class="ingredients-list all-ingredients">';
    
    allIngredients.forEach(ingredient => {
        const unitCost = parseFloat(ingredient.unit_cost || 0);
        const isFlagged = ingredient.is_flagged === 1;
        const flaggedClass = isFlagged ? ' flagged' : '';
        const flaggedButtonClass = isFlagged ? ' flagged' : '';
        
        // Generate barcode display for this ingredient
        const barcodeDisplay = generateBarcodeDisplay(ingredient.barcode_id);
        
        ingredientsHTML += createAllIngredientItemHTML(ingredient, isFlagged, flaggedClass, flaggedButtonClass, unitCost, barcodeDisplay);
    });
    
    ingredientsHTML += '</div>';
    return ingredientsHTML;
}

/**
 * Create HTML for a single ingredient in all ingredients view
 * @param {Object} ingredient - Ingredient data
 * @param {boolean} isFlagged - Whether ingredient is flagged
 * @param {string} flaggedClass - CSS class for flagged state
 * @param {string} flaggedButtonClass - CSS class for flagged button
 * @param {number} unitCost - Unit cost of ingredient
 * @param {string} barcodeDisplay - HTML for barcode display
 * @returns {string} HTML for ingredient item
 */
function createAllIngredientItemHTML(ingredient, isFlagged, flaggedClass, flaggedButtonClass, unitCost, barcodeDisplay) {
    const purchaseDate = formatDate(ingredient.purchase_date);
    const expirationDate = formatDate(ingredient.expiration_date);
    
    // Create menu items for all ingredient actions
    const menuItems = [
        `<div class="ingredient-menu-item" onclick="editIngredient(${ingredient.id}); closeIngredientMenu(${ingredient.id})">
            <img src="static/img/svg/edit.svg" alt="Edit" class="menu-icon" />
            <span>Edit Ingredient</span>
        </div>`,
        `<div class="ingredient-menu-item" onclick="toggleIngredientFlag(${ingredient.id}, '${ingredient.name}', ${isFlagged}); closeIngredientMenu(${ingredient.id})">
            <div class="flag-icon menu-icon">
                <svg viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M425.4,135.441h-84.044v-30.562c0-9.042-7.33-16.373-16.372-16.373H128.519V76.407c8.224-0.869,14.633-7.824,14.633-16.278c0-6.64-3.96-12.344-9.64-14.913c2.382-4.352,3.739-9.345,3.739-14.656C137.251,13.683,123.567,0,106.689,0C89.811,0,76.129,13.683,76.129,30.561c0,5.311,1.357,10.304,3.739,14.656c-5.68,2.569-9.64,8.273-9.64,14.913c0,8.454,6.409,15.408,14.633,16.278v413.764c0,12.056,9.773,21.829,21.829,21.829s21.829-9.773,21.829-21.829V288.247h62.214v30.561c0,9.042,7.33,16.372,16.373,16.372H425.4c9.042,0,16.372-7.33,16.372-16.372V151.813C441.772,142.771,434.443,135.441,425.4,135.441z"/>
                </svg>
            </div>
            <span>${isFlagged ? 'Remove Flag' : 'Flag Ingredient'}</span>
        </div>`,
        `<div class="ingredient-menu-item danger" onclick="confirmDeleteIngredient(${ingredient.id}, '${ingredient.name}'); closeIngredientMenu(${ingredient.id})">
            <img src="static/img/svg/trash.svg" alt="Delete" class="menu-icon" />
            <span>Delete Ingredient</span>
        </div>`
    ];
    
    return `
        <div class="ingredient-item all-ingredient${flaggedClass} ${INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_HIDDEN}" data-ingredient-id="${ingredient.id}">
            <div class="ingredient-actions">
                <div class="ingredient-menu-container">
                    <button class="ingredient-menu-button" 
                            onclick="toggleIngredientMenu(${ingredient.id})"
                            title="More actions">
                        <img src="static/img/svg/dots-vertical.svg" alt="More actions" class="dots-icon" />
                    </button>
                    <div class="ingredient-menu" id="ingredientMenu${ingredient.id}">
                        ${menuItems.join('')}
                    </div>
                </div>
            </div>
            <div class="ingredient-header">
                <strong>${ingredient.name}</strong>
            </div>
            <div class="ingredient-details">
                <div class="ingredient-unit-cost">
                    <span class="label">Unit Cost:</span>
                    <span class="value">${formatCurrency(unitCost)}/g</span>
                </div>
                <div class="ingredient-dates">
                    <div>
                        <span class="label">Purchase Date:</span>
                        <span class="value">${purchaseDate}</span>
                    </div>
                    <div>
                        <span class="label">Expiration:</span>
                        <span class="value expiration-date">${expirationDate}</span>
                    </div>
                </div>
                <div class="ingredient-supplier">
                    <span class="label">Supplier:</span>
                    <span class="value">${ingredient.supplier || 'N/A'}</span>
                </div>
            </div>
            <div class="ingredient-barcode-display">
                <div class="barcode-display-container clickable-barcode" 
                     onclick="printBarcode('${ingredient.barcode_id}')" 
                     title="Print Barcode">
                    <div class="barcode-display">
                        ${barcodeDisplay}
                    </div>
                    <div class="barcode-text">${ingredient.barcode_id}</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Show the fixed ingredients title
 * @param {string} customTitle - Custom title text
 */
/**
 * Update the ingredients box title to reflect current state
 * @param {string} titleText - The title text to display
 * @param {boolean} showAddButton - Whether to show the add button
 */
function updateIngredientsTitle(titleText = 'Ingredients', showAddButton = true) {
    // Update global state variable
    if (titleText === 'All Ingredients') {
        window.currentIngredientsView = 'all';
    } else if (titleText === 'Product Ingredients') {
        window.currentIngredientsView = 'product';
    }
    
    // Handle add button visibility (if it exists)
    const addButton = document.getElementById('ingredientsAddButton');
    if (addButton) {
        addButton.style.display = showAddButton ? 'flex' : 'none';
    }
}

/**
 * Hide the ingredients title (legacy function for compatibility)
 */
function hideIngredientsTitle() {
    // This function is kept for compatibility but doesn't need to do anything
    // since we're now using the consistent box-title structure
}

/**
 * Show ingredients title (legacy function for compatibility)
 * @param {string} customTitle - Custom title text
 */
function showIngredientsTitle(customTitle = 'Product Ingredients') {
    // Convert to new title system
    if (customTitle === 'All Ingredients') {
        updateIngredientsTitle('All Ingredients', true);
    } else {
        updateIngredientsTitle(customTitle, false);
    }
}

/**
 * Toggle ingredient flag status
 * @param {number} ingredientId - ID of the ingredient
 * @param {string} ingredientName - Name of the ingredient
 * @param {boolean} isCurrentlyFlagged - Current flag status
 */
async function toggleIngredientFlag(ingredientId, ingredientName, isCurrentlyFlagged) {
    const action = isCurrentlyFlagged ? 'unflag' : 'flag';
    const actionText = isCurrentlyFlagged ? 'remove the flag from' : 'flag';
    const confirmText = isCurrentlyFlagged ? 'Remove Flag' : 'Flag Ingredient';
    
    showConfirmationModal(
        `${action.charAt(0).toUpperCase() + action.slice(1)} Ingredient`,
        `Are you sure you want to ${actionText} "${ingredientName}"? This will affect all products containing this ingredient.`,
        confirmText,
        isCurrentlyFlagged,
        async () => {
            try {
                let result;
                if (isCurrentlyFlagged) {
                    result = await pywebview.api.unflag_ingredient(ingredientId);
                } else {
                    result = await pywebview.api.flag_ingredient(ingredientId);
                }
                
                if (result.success) {
                    // Use unified refresh function to reload data with search persistence
                    await refreshInventoryData();
                } else {
                    throw new Error(result.message || ERROR_MESSAGES.TOGGLE_FLAG_FAILED);
                }
            } catch (error) {
                console.error('Error toggling ingredient flag:', error);
                if (window.notifyError) {
                    window.notifyError(ERROR_MESSAGES.TOGGLE_FLAG_FAILED);
                } else {
                    alert(ERROR_MESSAGES.TOGGLE_FLAG_FAILED);
                }
            }
        }
    );
}

/**
 * Edit an existing ingredient
 * @param {number} ingredientId - ID of the ingredient to edit
 */
async function editIngredient(ingredientId) {
    try {
        // Get ingredient data from API
        const ingredientData = await pywebview.api.get_ingredient_by_id(ingredientId);
        if (!ingredientData) {
            throw new Error('Ingredient not found');
        }
        
        // Open ingredient modal in edit mode
        await openIngredientModal(ingredientData, true);
        
    } catch (error) {
        console.error('Error loading ingredient for edit:', error);
        if (window.notifyError) {
            window.notifyError('Failed to load ingredient data for editing.');
        } else {
            alert('Failed to load ingredient data for editing.');
        }
    }
}

/**
 * Show confirmation modal for deleting an ingredient
 * @param {number} ingredientId - ID of the ingredient to delete
 * @param {string} ingredientName - Name of the ingredient
 */
async function confirmDeleteIngredient(ingredientId, ingredientName) {
    showConfirmationModal(
        'Delete Ingredient',
        `Are you sure you want to delete "${ingredientName}"? This will permanently remove the ingredient and all its associated product relationships. This action cannot be undone.`,
        'Delete Ingredient',
        true, // Use delete styling (red)
        async () => {
            try {
                const result = await pywebview.api.delete_ingredient(ingredientId);
                
                if (result.success) {
                    // Use unified refresh function to reload data with search persistence
                    await refreshInventoryData();
                } else {
                    throw new Error(result.message || 'Failed to delete ingredient');
                }
            } catch (error) {
                console.error('Error deleting ingredient:', error);
                if (window.notifyError) {
                    window.notifyError('Failed to delete ingredient. Please try again.');
                } else {
                    alert('Failed to delete ingredient. Please try again.');
                }
            }
        }
    );
}

/**
 * Show loading state in the ingredients panel
 * @param {string} message - Loading message to display
 */
function showIngredientsLoading(message = 'Loading...') {
    const rightContainer = document.getElementById('rightBoxContent');
    const totalContainer = document.getElementById('ingredientsTotalFixed');
    
    if (rightContainer) {
        rightContainer.innerHTML = createLoadingHTML(message);
    }
    
    if (totalContainer) {
        totalContainer.style.display = 'none';
    }
    
    // Set appropriate title for loading state
    updateIngredientsTitle('Loading...', false);
}

// Make function globally accessible
window.showIngredientsLoading = showIngredientsLoading;

/**
 * Toggle the visibility of an ingredient's action menu
 * @param {number} ingredientId - ID of the ingredient
 */
function toggleIngredientMenu(ingredientId) {
    const menu = document.getElementById(`ingredientMenu${ingredientId}`);
    const button = document.querySelector(`[onclick="toggleIngredientMenu(${ingredientId})"]`);
    const allMenus = document.querySelectorAll('.ingredient-menu');
    const allButtons = document.querySelectorAll('.ingredient-menu-button');
    
    // Close all other menus first and remove active class from other buttons
    allMenus.forEach(otherMenu => {
        if (otherMenu.id !== `ingredientMenu${ingredientId}`) {
            otherMenu.classList.remove('show');
        }
    });
    
    allButtons.forEach(otherButton => {
        if (otherButton !== button) {
            otherButton.classList.remove('active');
        }
    });
    
    // Toggle the clicked menu and button active state
    if (menu && button) {
        const isShowing = menu.classList.toggle('show');
        if (isShowing) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    }
}

/**
 * Close a specific ingredient menu
 * @param {number} ingredientId - ID of the ingredient
 */
function closeIngredientMenu(ingredientId) {
    const menu = document.getElementById(`ingredientMenu${ingredientId}`);
    const button = document.querySelector(`[onclick="toggleIngredientMenu(${ingredientId})"]`);
    if (menu) {
        menu.classList.remove('show');
    }
    if (button) {
        button.classList.remove('active');
    }
}

/**
 * Close all ingredient menus
 */
function closeAllIngredientMenus() {
    const allMenus = document.querySelectorAll('.ingredient-menu');
    const allButtons = document.querySelectorAll('.ingredient-menu-button');
    
    allMenus.forEach(menu => {
        menu.classList.remove('show');
    });
    
    allButtons.forEach(button => {
        button.classList.remove('active');
    });
}

// Add event listener to close menus when clicking outside
document.addEventListener('click', function(event) {
    // Check if the click was outside any ingredient menu or menu button
    if (!event.target.closest('.ingredient-menu-container')) {
        closeAllIngredientMenus();
    }
});