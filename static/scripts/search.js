// Search functionality for the inventory system

/**
 * Initialize search functionality
 */
function initializeSearch() {
    const searchBar = document.querySelector('.search-bar');
    if (searchBar) {
        let searchTimeout;
        
        searchBar.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            
            // Debounce search to avoid too many API calls
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                await filterProductsData(searchTerm);
            }, INVENTORY_CONFIG.SEARCH.DEBOUNCE_DELAY);
        });
        
        // Clear search on escape key
        searchBar.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchBar.value = '';
                clearTimeout(searchTimeout);
                filterProductsData('');
            }
        });
    }
}

/**
 * Filter products data based on search term
 * @param {string} searchTerm - The search term to filter by
 */
async function filterProductsData(searchTerm) {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody || !window.allProductsData || !window.allProductsData.length) return;
    
    if (!searchTerm) {
        // Show all products and ingredients if search is empty
        await Promise.all([
            showAllProducts(),
            showAllIngredientsIfApplicable()
        ]);
        return;
    }
    
    // Run product search and ingredient filtering in parallel
    const [matchingProductIds] = await Promise.all([
        searchProducts(searchTerm),
        filterIngredientsIfApplicable(searchTerm)
    ]);
    
    // Get all current rows
    const allRows = Array.from(tbody.querySelectorAll('tr'));
    
    // Separate matching and non-matching rows
    const matchingRows = [];
    const nonMatchingRows = [];
    
    allRows.forEach(row => {
        const productId = parseInt(row.dataset.productId);
        const product = window.allProductsData.find(p => p.id === productId);
        
        if (product) {
            const matchesDirectSearch = checkDirectProductMatch(product, searchTerm);
            const matchesIngredientSearch = matchingProductIds.has(product.id);
            
            if (matchesDirectSearch || matchesIngredientSearch) {
                matchingRows.push(row);
            } else {
                nonMatchingRows.push(row);
            }
        }
    });
    
    // Animate both fade-out and fade-in concurrently
    await Promise.all([
        fadeOutRows(nonMatchingRows),
        fadeInRows(matchingRows)
    ]);
    
    // If no rows match, show empty message
    if (matchingRows.length === 0) {
        showNoResultsMessage(tbody);
    }
}

/**
 * Show all products with fade-in animation
 */
async function showAllProducts() {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    
    // Also show all ingredients if applicable
    await showAllIngredientsIfApplicable();
    
    // Remove any empty message
    removeNoResultsMessage(tbody);
    
    // If table is empty, rebuild it completely
    if (tbody.children.length === 0 || tbody.querySelector('.no-results-row')) {
        await rebuildProductsTable(window.allProductsData);
        return;
    }
    
    // Fade in all existing rows
    const allRows = Array.from(tbody.querySelectorAll('tr'));
    await fadeInRows(allRows);
}

/**
 * Fade out specified rows with optimized batching
 * @param {Array<HTMLElement>} rows - Rows to fade out
 */
async function fadeOutRows(rows) {
    if (rows.length === 0) return;
    
    // Process rows in smaller batches for better performance
    const batchSize = 10;
    const batches = [];
    
    for (let i = 0; i < rows.length; i += batchSize) {
        batches.push(rows.slice(i, i + batchSize));
    }
    
    // Process batches with minimal delay between them
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        // Start all animations in the batch simultaneously
        const batchPromises = batch.map((row, index) => {
            return new Promise(resolve => {
                // Minimal stagger within batch for visual smoothness
                setTimeout(() => {
                    row.classList.add(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_FADE_OUT);
                    row.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_FADE_IN);
                    
                    // Hide the row after animation completes
                    setTimeout(() => {
                        row.style.display = 'none';
                        resolve();
                    }, INVENTORY_CONFIG.ANIMATION.FADE_DURATION);
                }, index * 10); // Reduced from 50ms to 10ms
            });
        });
        
        // Wait for current batch to complete before starting next
        await Promise.all(batchPromises);
    }
}

/**
 * Fade in specified rows with optimized batching
 * @param {Array<HTMLElement>} rows - Rows to fade in
 */
async function fadeInRows(rows) {
    if (rows.length === 0) return;
    
    // Process rows in smaller batches for better performance
    const batchSize = 10;
    const batches = [];
    
    for (let i = 0; i < rows.length; i += batchSize) {
        batches.push(rows.slice(i, i + batchSize));
    }
    
    // Process batches with minimal delay between them
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        // Start all animations in the batch simultaneously
        const batchPromises = batch.map((row, index) => {
            return new Promise(resolve => {
                // Minimal stagger within batch for visual smoothness
                setTimeout(() => {
                    // Show the row first
                    row.style.display = '';
                    
                    // Force reflow to ensure display change takes effect
                    row.offsetHeight;
                    
                    row.classList.add(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_FADE_IN);
                    row.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_FADE_OUT);
                    
                    setTimeout(() => {
                        resolve();
                    }, INVENTORY_CONFIG.ANIMATION.FADE_IN_DURATION);
                }, index * 8); // Reduced from 40ms to 8ms
            });
        });
        
        // Wait for current batch to complete before starting next
        await Promise.all(batchPromises);
    }
}

/**
 * Show no results message
 * @param {HTMLElement} tbody - Table body element
 */
function showNoResultsMessage(tbody) {
    // Remove existing message if any
    removeNoResultsMessage(tbody);
    
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'no-results-row';
    emptyRow.innerHTML = `
        <td colspan="6" style="text-align: center; padding: 20px; color: var(--text-gray);">
            No products match your search criteria
        </td>
    `;
    tbody.appendChild(emptyRow);
    
    // Fade in the message
    setTimeout(() => {
        emptyRow.classList.add(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_FADE_IN);
    }, 100);
}

/**
 * Remove no results message
 * @param {HTMLElement} tbody - Table body element
 */
function removeNoResultsMessage(tbody) {
    const existingMessage = tbody.querySelector('.no-results-row');
    if (existingMessage) {
        existingMessage.remove();
    }
}

/**
 * Rebuild the products table with filtered data
 * @param {Array} products - Array of products to display
 */
async function rebuildProductsTable(products) {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody) return;
    
    // Clear existing rows
    tbody.innerHTML = '';
    
    // If no products match, show a message
    if (products.length === 0) {
        showNoResultsMessage(tbody);
        return;
    }
    
    // Add matching products to the table with sequential fade-in animation
    for (let index = 0; index < products.length; index++) {
        const product = products[index];
        const row = await window.createProductRow(product, index);
        tbody.appendChild(row);
        
        // Animate row in with a slight delay for smooth effect
        setTimeout(() => {
            window.animateProductRowIn(row);
        }, index * INVENTORY_CONFIG.ANIMATION.ROW_FADE_DELAY);
    }
}

/**
 * Search for products by ingredient name or barcode
 * @param {string} searchTerm - The search term
 * @returns {Set} Set of matching product IDs
 */
async function searchProducts(searchTerm) {
    const isLikelyBarcode = isBarcodeLikeSearch(searchTerm);
    const matchingProductIds = new Set();
    
    try {
        // Prepare search promises
        const searchPromises = [];
        
        // Always try ingredient name search (unless it's clearly a complete barcode)
        if (!isLikelyBarcode || searchTerm.length < 8) {
            searchPromises.push(
                pywebview.api.search_products_by_ingredient_name(searchTerm)
                    .then(products => ({ type: 'name', products }))
                    .catch(error => {
                        console.error('Ingredient name search failed:', error);
                        return { type: 'name', products: [] };
                    })
            );
        }
        
        // Also try barcode search if it might be a barcode (or contains numbers)
        if (isLikelyBarcode || /\d/.test(searchTerm)) {
            searchPromises.push(
                pywebview.api.search_products_by_ingredient_barcode(searchTerm.replace(/\s/g, ''))
                    .then(products => ({ type: 'barcode', products }))
                    .catch(error => {
                        console.error('Barcode search failed:', error);
                        return { type: 'barcode', products: [] };
                    })
            );
        }
        
        // Execute all searches in parallel
        const results = await Promise.all(searchPromises);
        
        // Combine results from all search types
        results.forEach(result => {
            if (result.products && Array.isArray(result.products)) {
                result.products.forEach(product => matchingProductIds.add(product.id));
            }
        });
        
    } catch (error) {
        console.error('Error searching ingredients:', error);
    }
    
    return matchingProductIds;
}

/**
 * Check if search term looks like a barcode
 * @param {string} searchTerm - The search term to check
 * @returns {boolean} True if it looks like a barcode
 */
function isBarcodeLikeSearch(searchTerm) {
    const cleanedTerm = searchTerm.replace(/\s/g, '');
    return INVENTORY_CONFIG.SEARCH.BARCODE_PATTERN.test(cleanedTerm);
}

/**
 * Check if product matches direct search criteria
 * @param {Object} product - Product object to check
 * @param {string} searchTerm - Search term to match against
 * @returns {boolean} True if product matches
 */
function checkDirectProductMatch(product, searchTerm) {
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    return product.product_name.toLowerCase().includes(lowerSearchTerm) ||
           product.batch_number.toLowerCase().includes(lowerSearchTerm) ||
           product.barcode_id.toLowerCase().includes(lowerSearchTerm) ||
           product.total_cost.toString().includes(searchTerm) ||
           formatDate(product.date_mixed).toLowerCase().includes(lowerSearchTerm);
}

/**
 * Filter ingredients if the right panel is showing "All Ingredients"
 * @param {string} searchTerm - The search term to filter by
 */
async function filterIngredientsIfApplicable(searchTerm) {
    // Check if we're showing "All Ingredients"
    const titleTextElement = document.getElementById('ingredientsTitleText');
    if (!titleTextElement || titleTextElement.textContent !== 'All Ingredients') {
        return; // Not showing all ingredients, skip filtering
    }
    
    const rightContainer = document.getElementById('rightBoxContent');
    const ingredientsList = rightContainer ? rightContainer.querySelector('.ingredients-list.all-ingredients') : null;
    
    if (!ingredientsList) {
        return; // No ingredients list found
    }
    
    const allIngredientItems = Array.from(ingredientsList.querySelectorAll('.ingredient-item.all-ingredient'));
    
    if (!searchTerm) {
        // Show all ingredients if search is empty
        await fadeInIngredientItems(allIngredientItems);
        removeNoIngredientsMessage();
        return;
    }
    
    // Separate matching and non-matching ingredients in parallel
    const matchingItems = [];
    const nonMatchingItems = [];
    
    // Use requestIdleCallback or immediate processing for better performance
    const processItems = (items) => {
        return new Promise(resolve => {
            const processChunk = (startIndex) => {
                const endIndex = Math.min(startIndex + 50, items.length); // Process 50 items at a time
                
                for (let i = startIndex; i < endIndex; i++) {
                    const item = items[i];
                    if (checkIngredientMatch(item, searchTerm)) {
                        matchingItems.push(item);
                    } else {
                        nonMatchingItems.push(item);
                    }
                }
                
                if (endIndex < items.length) {
                    // Use setTimeout to yield control and prevent blocking
                    setTimeout(() => processChunk(endIndex), 0);
                } else {
                    resolve();
                }
            };
            
            processChunk(0);
        });
    };
    
    await processItems(allIngredientItems);
    
    // Animate both fade-out and fade-in concurrently
    await Promise.all([
        fadeOutIngredientItems(nonMatchingItems),
        fadeInIngredientItems(matchingItems)
    ]);
    
    // Show empty message if no ingredients match
    if (matchingItems.length === 0) {
        showNoIngredientsMessage(ingredientsList);
    } else {
        removeNoIngredientsMessage();
    }
}

// Make function globally accessible
window.filterIngredientsIfApplicable = filterIngredientsIfApplicable;

/**
 * Show all ingredients if applicable (when clearing search)
 */
async function showAllIngredientsIfApplicable() {
    // Check if we're showing "All Ingredients"
    const titleTextElement = document.getElementById('ingredientsTitleText');
    if (!titleTextElement || titleTextElement.textContent !== 'All Ingredients') {
        return; // Not showing all ingredients, skip
    }
    
    const rightContainer = document.getElementById('rightBoxContent');
    const ingredientsList = rightContainer ? rightContainer.querySelector('.ingredients-list.all-ingredients') : null;
    
    if (!ingredientsList) {
        return; // No ingredients list found
    }
    
    // Remove any no results message
    removeNoIngredientsMessage();
    
    // Show all ingredient items
    const allIngredientItems = Array.from(ingredientsList.querySelectorAll('.ingredient-item.all-ingredient'));
    await fadeInIngredientItems(allIngredientItems);
}

/**
 * Check if ingredient matches search criteria
 * @param {HTMLElement} ingredientItem - Ingredient item element
 * @param {string} searchTerm - Search term to match against
 * @returns {boolean} True if ingredient matches
 */
function checkIngredientMatch(ingredientItem, searchTerm) {
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    // Get ingredient data from the DOM
    const nameElement = ingredientItem.querySelector('.ingredient-header strong');
    const barcodeElement = ingredientItem.querySelector('.barcode-text');
    const supplierElement = ingredientItem.querySelector('.ingredient-supplier .value');
    const unitCostElement = ingredientItem.querySelector('.ingredient-unit-cost .value');
    
    const name = nameElement ? nameElement.textContent.toLowerCase() : '';
    const barcode = barcodeElement ? barcodeElement.textContent.toLowerCase() : '';
    const supplier = supplierElement ? supplierElement.textContent.toLowerCase() : '';
    const unitCost = unitCostElement ? unitCostElement.textContent.toLowerCase() : '';
    
    return name.includes(lowerSearchTerm) ||
           barcode.includes(lowerSearchTerm) ||
           supplier.includes(lowerSearchTerm) ||
           unitCost.includes(lowerSearchTerm);
}

/**
 * Fade out ingredient items with optimized batching
 * @param {Array<HTMLElement>} items - Items to fade out
 */
async function fadeOutIngredientItems(items) {
    if (items.length === 0) return;
    
    // Process items in smaller batches for better performance
    const batchSize = 8;
    const batches = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }
    
    // Process batches concurrently
    const batchPromises = batches.map((batch, batchIndex) => {
        return new Promise(async (resolve) => {
            // Small delay between batches for visual flow
            setTimeout(async () => {
                const itemPromises = batch.map((item, index) => {
                    return new Promise(itemResolve => {
                        // Minimal stagger within batch
                        setTimeout(() => {
                            item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                            item.style.opacity = '0';
                            item.style.transform = 'translateX(-10px)';
                            
                            setTimeout(() => {
                                item.style.display = 'none';
                                itemResolve();
                            }, 300);
                        }, index * 15); // Reduced from 30ms to 15ms
                    });
                });
                
                await Promise.all(itemPromises);
                resolve();
            }, batchIndex * 50);
        });
    });
    
    await Promise.all(batchPromises);
}

/**
 * Fade in ingredient items with optimized batching
 * @param {Array<HTMLElement>} items - Items to fade in
 */
async function fadeInIngredientItems(items) {
    if (items.length === 0) return;
    
    // Process items in smaller batches for better performance
    const batchSize = 8;
    const batches = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }
    
    // Process batches concurrently
    const batchPromises = batches.map((batch, batchIndex) => {
        return new Promise(async (resolve) => {
            // Small delay between batches for visual flow
            setTimeout(async () => {
                const itemPromises = batch.map((item, index) => {
                    return new Promise(itemResolve => {
                        // Minimal stagger within batch
                        setTimeout(() => {
                            item.style.display = '';
                            item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                            item.style.opacity = '0';
                            item.style.transform = 'translateX(-10px)';
                            
                            // Force reflow
                            item.offsetHeight;
                            
                            item.style.opacity = '1';
                            item.style.transform = 'translateX(0)';
                            
                            setTimeout(() => {
                                item.style.transition = '';
                                item.style.transform = '';
                                itemResolve();
                            }, 300);
                        }, index * 20); // Reduced from 40ms to 20ms
                    });
                });
                
                await Promise.all(itemPromises);
                resolve();
            }, batchIndex * 60);
        });
    });
    
    await Promise.all(batchPromises);
}

/**
 * Show no ingredients message
 * @param {HTMLElement} ingredientsList - Ingredients list container
 */
function showNoIngredientsMessage(ingredientsList) {
    removeNoIngredientsMessage();
    
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'no-ingredients-message';
    emptyMessage.style.cssText = `
        text-align: center;
        padding: 40px 20px;
        color: var(--text-gray);
        font-style: italic;
    `;
    emptyMessage.innerHTML = `
        <h3>No Ingredients Found</h3>
        <p>No ingredients match your search criteria.</p>
    `;
    
    ingredientsList.appendChild(emptyMessage);
}

/**
 * Remove no ingredients message
 */
function removeNoIngredientsMessage() {
    const existingMessage = document.querySelector('.no-ingredients-message');
    if (existingMessage) {
        existingMessage.remove();
    }
}