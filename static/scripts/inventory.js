// Main inventory application module - coordinates all functionality

/**
 * Initialize the application
 */
async function initializeApp() {
    // Clear search bar on startup to prevent unwanted filtering
    const searchBar = document.querySelector('.search-bar');
    if (searchBar) {
        searchBar.value = '';
    }
    
    // Initialize context menu functionality
    initializeContextMenu();
    
    // Display all ingredients in the right panel (silently loads in background)
    await displayAllIngredients();
    
    // Add click handler to left box for unselecting products
    addLeftBoxClickHandler();
    
    // Load products data (silently loads in background)
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
