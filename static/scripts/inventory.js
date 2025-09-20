// Main inventory application module - coordinates all functionality

/**
 * Initialize the application
 */
async function initializeApp() {
    // Show initial loading state
    showIngredientsLoading('Loading inventory system...');
    
    // Display all ingredients in the right panel
    await displayAllIngredients();
    
    // Add click handler to left box for unselecting products
    addLeftBoxClickHandler();
    
    // Load products data
    await loadProductsData();
}

/**
 * Add click handler for unselecting products when clicking in empty areas
 */
function addLeftBoxClickHandler() {
    const leftBox = document.querySelector('.box.left');
    
    if (leftBox) {
        leftBox.addEventListener('click', function(event) {
            // Check if the click was NOT on a product row (tr element) or its children
            const clickedRow = event.target.closest('tr[data-product-id]');
            
            // If no product row was clicked, unselect current product
            if (!clickedRow) {
                unselectCurrentProduct();
            }
        });
    }
}

// Legacy function for compatibility
async function loadInventoryData() {
    await loadProductsData();
}
