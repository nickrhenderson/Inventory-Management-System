// Search functionality for the inventory system

// Cache for search results to avoid duplicate API calls
const searchCache = new Map();
const CACHE_EXPIRY = 30000; // 30 seconds

// Global search state management
let currentSearchId = 0;
let activeAnimations = new Set();

/**
 * Cancel all active animations
 */
function cancelActiveAnimations() {
    activeAnimations.forEach(animationId => {
        clearTimeout(animationId);
    });
    activeAnimations.clear();
}

/**
 * Register an animation timeout
 * @param {number} timeoutId - The timeout ID to track
 */
function registerAnimation(timeoutId) {
    activeAnimations.add(timeoutId);
}

/**
 * Unregister an animation timeout
 * @param {number} timeoutId - The timeout ID to remove
 */
function unregisterAnimation(timeoutId) {
    activeAnimations.delete(timeoutId);
}

/**
 * Initialize search functionality
 */
function initializeSearch() {
    const searchBar = document.querySelector('.search-bar');
    if (searchBar) {
        let searchTimeout;
        let currentSearchController;
        
        searchBar.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim();
            
            // Cancel previous search if still running
            if (currentSearchController) {
                currentSearchController.abort();
            }
            
            // Cancel all active animations by incrementing search ID
            currentSearchId++;
            
            // Debounce search to avoid too many API calls
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                // Generate new search ID for this search
                const searchId = ++currentSearchId;
                currentSearchController = new AbortController();
                
                await performAsyncSearch(searchTerm, currentSearchController.signal, searchId);
                currentSearchController = null;
            }, INVENTORY_CONFIG.SEARCH.DEBOUNCE_DELAY);
        });
        
        // Clear search on escape key
        searchBar.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchBar.value = '';
                clearTimeout(searchTimeout);
                if (currentSearchController) {
                    currentSearchController.abort();
                    currentSearchController = null;
                }
                // Cancel animations by incrementing search ID
                const searchId = ++currentSearchId;
                performAsyncSearch('', null, searchId);
            }
        });
    }
}

/**
 * Perform comprehensive async search for both products and ingredients
 * @param {string} searchTerm - The search term
 * @param {AbortSignal} signal - Abort signal for cancelling search
 * @param {number} searchId - Unique search ID for this search operation
 */
async function performAsyncSearch(searchTerm, signal = null, searchId = 0) {
    try {
        if (!searchTerm) {
            // Show all data if search is empty
            await Promise.all([
                showAllProducts(),
                showAllIngredientsIfApplicable()
            ]);
            return;
        }
        
        // Execute the improved simultaneous search
        await filterProductsData(searchTerm, searchId);
        
        // Check if search was cancelled or superseded
        if (signal?.aborted || searchId !== currentSearchId) return;
        
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Search error:', error);
        }
    }
}

/**
 * Filter products data based on search term
 * @param {string} searchTerm - The search term to filter by
 * @param {number} searchId - Unique search ID for validation
 */
async function filterProductsData(searchTerm, searchId = 0) {
    const tbody = document.getElementById('productsTableBody');
    if (!tbody || !window.allProductsData || !window.allProductsData.length) return;
    
    if (!searchTerm) {
        // Show all products and ingredients if search is empty - run in parallel for sync
        await Promise.all([
            showAllProducts(),
            showAllIngredientsIfApplicable()
        ]);
        return;
    }
    
    // Run both product search and ingredient analysis in parallel, collecting results
    const [matchingProductIds, ingredientFilterData] = await Promise.all([
        searchProducts(searchTerm),
        prepareIngredientFilterData(searchTerm) // Returns data instead of applying changes
    ]);
    
    // Process product rows
    const allRows = Array.from(tbody.querySelectorAll('tr'));
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
    
    // Check if this search is still current before starting animations
    if (searchId !== currentSearchId) {
        return; // This search has been superseded
    }
    
    // Apply both product and ingredient visual updates with perfectly synchronized timing
    
    // First, fade out non-matching items simultaneously
    await Promise.all([
        fadeOutRows(nonMatchingRows, searchId),
        ingredientFilterData ? fadeOutIngredientItems(ingredientFilterData.nonMatchingItems || [], searchId) : Promise.resolve()
    ]);
    
    // Check again before fade-in animations
    if (searchId !== currentSearchId) {
        return; // This search has been superseded
    }
    
    // Then, fade in matching items simultaneously with coordinated timing
    await Promise.all([
        fadeInRows(matchingRows, searchId),
        ingredientFilterData ? fadeInIngredientItems(ingredientFilterData.matchingItems || [], searchId) : Promise.resolve()
    ]);
    
    // Handle ingredient empty state messaging
    if (ingredientFilterData) {
        if (ingredientFilterData.matchingItems.length === 0) {
            showNoIngredientsMessage(ingredientFilterData.ingredientsList);
        } else {
            removeNoIngredientsMessage();
        }
    }
    
    // Show empty message if no products match
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
    
    // Remove any empty message
    removeNoResultsMessage(tbody);
    
    // If table is empty, rebuild it completely
    if (tbody.children.length === 0 || tbody.querySelector('.no-results-row')) {
        await rebuildProductsTable(window.allProductsData);
        return;
    }
    
    // Fade in all existing rows
    const allRows = Array.from(tbody.querySelectorAll('tr'));
    await fadeInRows(allRows, currentSearchId);
}

/**
 * Fade out specified rows with optimized batching
 * @param {Array<HTMLElement>} rows - Rows to fade out
 * @param {number} searchId - Search ID for validation
 */
async function fadeOutRows(rows, searchId = 0) {
    if (rows.length === 0) return;
    
    // Process rows in smaller batches for better performance
    const batchSize = 15; // Increased for faster processing
    const batches = [];
    
    for (let i = 0; i < rows.length; i += batchSize) {
        batches.push(rows.slice(i, i + batchSize));
    }
    
    // Process all batches concurrently for maximum speed
    const batchPromises = batches.map((batch, batchIndex) => {
        return new Promise(resolve => {
            // Start batch with small delay for visual flow
            const batchTimeout = setTimeout(async () => {
                unregisterAnimation(batchTimeout);
                const rowPromises = batch.map((row, index) => {
                    return new Promise(rowResolve => {
                        // Calculate total delay for smooth stagger
                        const totalDelay = index * 10; // 10ms stagger
                        
                        const itemTimeout = setTimeout(() => {
                            unregisterAnimation(itemTimeout);
                            
                            // Check if search is still current
                            if (searchId !== currentSearchId) {
                                rowResolve();
                                return;
                            }
                            
                            row.classList.add(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_FADE_OUT);
                            row.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_FADE_IN);
                            
                            // Hide the row after animation completes
                            const hideTimeout = setTimeout(() => {
                                unregisterAnimation(hideTimeout);
                                row.style.display = 'none';
                                rowResolve();
                            }, INVENTORY_CONFIG.ANIMATION.FADE_DURATION);
                            registerAnimation(hideTimeout);
                        }, totalDelay);
                        registerAnimation(itemTimeout);
                    });
                });
                
                await Promise.all(rowPromises);
                resolve();
            }, batchIndex * 8); // Further reduced batch delay for faster fade-out
            registerAnimation(batchTimeout);
        });
    });
    
    // Wait for all batches to complete
    await Promise.all(batchPromises);
}

/**
 * Fade in specified rows with optimized batching
 * @param {Array<HTMLElement>} rows - Rows to fade in
 * @param {number} searchId - Search ID for validation
 */
async function fadeInRows(rows, searchId = 0) {
    if (rows.length === 0) return;
    
    // Process rows in smaller batches for better performance
    const batchSize = 15; // Increased for faster processing
    const batches = [];
    
    for (let i = 0; i < rows.length; i += batchSize) {
        batches.push(rows.slice(i, i + batchSize));
    }
    
    // Process all batches concurrently for maximum speed
    const batchPromises = batches.map((batch, batchIndex) => {
        return new Promise(resolve => {
            // Small delay between batch starts for visual flow
            setTimeout(async () => {
                // Check if search is still current
                if (searchId !== currentSearchId) {
                    resolve();
                    return;
                }
                
                const rowPromises = batch.map((row, index) => {
                    return new Promise(rowResolve => {
                        // Calculate total delay: item stagger only
                        const totalDelay = index * 5; // Reduced to 5ms stagger for faster response
                        
                        setTimeout(() => {
                            // Check if search is still current before animating
                            if (searchId !== currentSearchId) {
                                rowResolve();
                                return;
                            }
                            
                            // Show the row first
                            row.style.display = '';
                            
                            // Force reflow to ensure display change takes effect
                            row.offsetHeight;
                            
                            row.classList.add(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_FADE_IN);
                            row.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_FADE_OUT);
                            
                            setTimeout(() => {
                                rowResolve();
                            }, INVENTORY_CONFIG.ANIMATION.FADE_IN_DURATION);
                        }, totalDelay);
                    });
                });
                
                await Promise.all(rowPromises);
                resolve();
            }, batchIndex * 10); // Reduced batch delay for faster animation start
        });
    });
    
    // Wait for all batches to complete
    await Promise.all(batchPromises);
}

/**
 * Show no results message
 * @param {HTMLElement} tbody - Table body element
 */
function showNoResultsMessage(tbody) {
    // Remove existing message if any
    removeNoResultsMessage(tbody);
    
    // No message displayed - just clean the table
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
    const cacheKey = `products_${searchTerm.toLowerCase()}`;
    const now = Date.now();
    
    // Check cache first
    if (searchCache.has(cacheKey)) {
        const cached = searchCache.get(cacheKey);
        if (now - cached.timestamp < CACHE_EXPIRY) {
            return cached.data;
        }
        searchCache.delete(cacheKey);
    }
    
    const isLikelyBarcode = isBarcodeLikeSearch(searchTerm);
    const matchingProductIds = new Set();
    
    try {
        // Create all search promises simultaneously for maximum parallelism
        const searchPromises = [];
        
        // Ingredient name search (always run unless it's a clear long barcode)
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
        
        // Barcode search (run if likely barcode or contains numbers)
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
        
        // Execute all API searches in parallel with improved error handling
        const results = await Promise.allSettled(searchPromises);
        
        // Process results from successful searches only
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value.products && Array.isArray(result.value.products)) {
                result.value.products.forEach(product => matchingProductIds.add(product.id));
            }
        });
        
        // Cache the results
        searchCache.set(cacheKey, {
            data: matchingProductIds,
            timestamp: now
        });
        
    } catch (error) {
        console.error('Error in searchProducts:', error);
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
/**
 * Prepare ingredient filter data without applying visual changes
 * @param {string} searchTerm - The search term
 * @returns {Object|null} Filter data or null if not applicable
 */
async function prepareIngredientFilterData(searchTerm) {
    // Check if we're showing "All Ingredients"
    const titleTextElement = document.getElementById('ingredientsTitleText');
    if (!titleTextElement || titleTextElement.textContent !== 'All Ingredients') {
        return null; // Not showing all ingredients, skip filtering
    }
    
    const rightContainer = document.getElementById('rightBoxContent');
    const ingredientsList = rightContainer ? rightContainer.querySelector('.ingredients-list.all-ingredients') : null;
    
    if (!ingredientsList) {
        return null; // No ingredients list found
    }
    
    const allIngredientItems = Array.from(ingredientsList.querySelectorAll('.ingredient-item.all-ingredient'));
    
    if (!searchTerm) {
        // Show all ingredients if search is empty
        return {
            ingredientsList,
            matchingItems: allIngredientItems,
            nonMatchingItems: [],
            showAllItems: true
        };
    }
    
    // Separate matching and non-matching ingredients in parallel
    const matchingItems = [];
    const nonMatchingItems = [];
    
    // Use async processing with requestIdleCallback for optimal performance
    const processItems = (items) => {
        return new Promise(resolve => {
            const CHUNK_SIZE = 100; // Increased chunk size for better performance
            
            const processChunk = async (startIndex) => {
                const endIndex = Math.min(startIndex + CHUNK_SIZE, items.length);
                
                // Process items in the current chunk
                for (let i = startIndex; i < endIndex; i++) {
                    const item = items[i];
                    if (checkIngredientMatch(item, searchTerm)) {
                        matchingItems.push(item);
                    } else {
                        nonMatchingItems.push(item);
                    }
                }
                
                if (endIndex < items.length) {
                    // Use requestIdleCallback if available, otherwise setTimeout
                    if (window.requestIdleCallback) {
                        requestIdleCallback(() => processChunk(endIndex));
                    } else {
                        setTimeout(() => processChunk(endIndex), 0);
                    }
                } else {
                    resolve();
                }
            };
            
            processChunk(0);
        });
    };
    
    await processItems(allIngredientItems);
    
    return {
        ingredientsList,
        matchingItems,
        nonMatchingItems,
        showAllItems: false
    };
}

/**
 * Apply ingredient filter results to the UI (simplified for coordinated timing)
 * @param {Object|null} filterData - Filter data from prepareIngredientFilterData
 */
async function applyIngredientFilterResults(filterData) {
    if (!filterData) {
        return; // No ingredient filtering needed
    }
    
    const { ingredientsList, matchingItems, nonMatchingItems, showAllItems } = filterData;
    
    if (showAllItems) {
        // Show all ingredients
        await fadeInIngredientItems(matchingItems, searchId);
        removeNoIngredientsMessage();
        return;
    }
    
    // This function is now primarily used for the legacy filterIngredientsIfApplicable
    // The main search coordination happens in filterProductsData for better timing
    await Promise.all([
        fadeOutIngredientItems(nonMatchingItems, searchId),
        fadeInIngredientItems(matchingItems, searchId)
    ]);
    
    // Show empty message if no ingredients match
    if (matchingItems.length === 0) {
        showNoIngredientsMessage(ingredientsList);
    } else {
        removeNoIngredientsMessage();
    }
}

async function filterIngredientsIfApplicable(searchTerm) {
    const filterData = await prepareIngredientFilterData(searchTerm);
    await applyIngredientFilterResults(filterData);
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
    await fadeInIngredientItems(allIngredientItems, currentSearchId);
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
async function fadeOutIngredientItems(items, searchId = 0) {
    if (items.length === 0) return;
    
    // Use same batch size as products for consistency
    const batchSize = 15; // Increased for faster processing
    const batches = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }
    
    // Process batches concurrently
    const batchPromises = batches.map((batch, batchIndex) => {
        return new Promise(async (resolve) => {
            // Small delay between batches for visual flow
            setTimeout(async () => {
                // Check if search is still current
                if (searchId !== currentSearchId) {
                    resolve();
                    return;
                }
                
                const itemPromises = batch.map((item, index) => {
                    return new Promise(itemResolve => {
                        // Minimal stagger within batch
                        setTimeout(() => {
                            // Check if search is still current before animating
                            if (searchId !== currentSearchId) {
                                itemResolve();
                                return;
                            }
                            
                            item.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
                            item.style.opacity = '0';
                            item.style.transform = 'translateX(-10px)';
                            
                            setTimeout(() => {
                                item.style.display = 'none';
                                itemResolve();
                            }, INVENTORY_CONFIG.ANIMATION.FADE_DURATION); // Use same duration as products
                        }, index * 5); // Reduced to 5ms stagger for faster response
                    });
                });
                
                await Promise.all(itemPromises);
                resolve();
            }, batchIndex * 8); // Reduced to match optimized fade-out batch delay
        });
    });
    
    await Promise.all(batchPromises);
}

/**
 * Fade in ingredient items with synchronized timing to match products
 * @param {Array<HTMLElement>} items - Items to fade in
 */
async function fadeInIngredientItems(items, searchId = 0) {
    if (items.length === 0) return;
    
    // Use same batch size as products for consistent timing
    const batchSize = 15; // Increased for faster processing
    const batches = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }
    
    // Process all batches concurrently for maximum speed while maintaining timing
    const batchPromises = batches.map((batch, batchIndex) => {
        return new Promise(resolve => {
            // Small delay between batch starts for visual flow
            setTimeout(async () => {
                // Check if search is still current
                if (searchId !== currentSearchId) {
                    resolve();
                    return;
                }
                
                const itemPromises = batch.map((item, index) => {
                    return new Promise(itemResolve => {
                        // Calculate total delay: batch delay + item stagger
                        const totalDelay = index * 5; // Reduced to 5ms stagger for faster response
                        
                        setTimeout(() => {
                            // Check if search is still current before animating
                            if (searchId !== currentSearchId) {
                                itemResolve();
                                return;
                            }
                            
                            item.style.display = '';
                            item.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
                            item.style.opacity = '0';
                            item.style.transform = 'translateX(-10px)';
                            
                            // Force reflow to ensure display change takes effect
                            item.offsetHeight;
                            
                            item.style.opacity = '1';
                            item.style.transform = 'translateX(0)';
                            
                            setTimeout(() => {
                                item.style.transition = '';
                                item.style.transform = '';
                                itemResolve();
                            }, INVENTORY_CONFIG.ANIMATION.FADE_DURATION); // Use same duration as products
                        }, totalDelay);
                    });
                });
                
                await Promise.all(itemPromises);
                resolve();
            }, batchIndex * 10); // Reduced batch delay for faster animation start
        });
    });
    
    // Wait for all batches to complete
    await Promise.all(batchPromises);
}

/**
 * Show no ingredients message
 * @param {HTMLElement} ingredientsList - Ingredients list container
 */
function showNoIngredientsMessage(ingredientsList) {
    removeNoIngredientsMessage();
    
    // No message displayed - just clean the container
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