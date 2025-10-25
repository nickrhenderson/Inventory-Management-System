// Search functionality for the inventory system

// Cache for search results to avoid duplicate API calls
const searchCache = new Map();
const CACHE_EXPIRY = 30000; // 30 seconds

/**
 * Clear all cached search results
 */
function clearSearchCache() {
    searchCache.clear();
}

// Make function globally accessible
window.clearSearchCache = clearSearchCache;

// Global search state management
let currentSearchId = 0;
let activeAnimations = new Set();

// Make currentSearchId accessible globally
window.getCurrentSearchId = () => currentSearchId;
window.incrementSearchId = () => ++currentSearchId;

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
 * Helper function to get products table body
 */
function getProductsTableBody() {
    return document.getElementById('productsTableBody');
}

/**
 * Helper function to get ingredients title text element
 */
function getIngredientsTitleText() {
    return document.getElementById('ingredientsTitleText');
}

/**
 * Helper function to get right box content
 */
function getRightBoxContent() {
    return document.getElementById('rightBoxContent');
}

/**
 * Check if the search is still current
 * @param {number} searchId - The search ID to check
 * @returns {boolean} True if search is current
 */
function isSearchCurrent(searchId) {
    return searchId === currentSearchId;
}

/**
 * Get all ingredient items from the ingredients list
 * @returns {Array<HTMLElement>} Array of ingredient items
 */
function getAllIngredientItems() {
    const rightContainer = getRightBoxContent();
    const ingredientsList = rightContainer ? rightContainer.querySelector('.ingredients-list.all-ingredients') : null;
    return ingredientsList ? Array.from(ingredientsList.querySelectorAll('.ingredient-item.all-ingredient')) : [];
}

/**
 * Generic function to fade out items with batching and staggering
 * @param {Array<HTMLElement>} items - Items to fade out
 * @param {number} searchId - Search ID for validation
 * @param {Object} config - Configuration object with animation settings
 */
async function fadeOutItems(items, searchId, config) {
    if (items.length === 0) return;

    const { batchSize = 15, batchDelay = 8, staggerDelay = 10, fadeDuration = INVENTORY_CONFIG.ANIMATION.FADE_DURATION, applyFadeOut } = config;

    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }

    const batchPromises = batches.map((batch, batchIndex) => {
        return new Promise(resolve => {
            const batchTimeout = setTimeout(async () => {
                unregisterAnimation(batchTimeout);
                if (!isSearchCurrent(searchId)) {
                    resolve();
                    return;
                }

                const itemPromises = batch.map((item, index) => {
                    return new Promise(itemResolve => {
                        const itemTimeout = setTimeout(() => {
                            unregisterAnimation(itemTimeout);
                            if (!isSearchCurrent(searchId)) {
                                itemResolve();
                                return;
                            }

                            applyFadeOut(item);

                            const hideTimeout = setTimeout(() => {
                                unregisterAnimation(hideTimeout);
                                item.style.display = 'none';
                                itemResolve();
                            }, fadeDuration);
                            registerAnimation(hideTimeout);
                        }, index * staggerDelay);
                        registerAnimation(itemTimeout);
                    });
                });

                await Promise.all(itemPromises);
                resolve();
            }, batchIndex * batchDelay);
            registerAnimation(batchTimeout);
        });
    });

    await Promise.all(batchPromises);
}

/**
 * Generic function to fade in items with batching and staggering
 * @param {Array<HTMLElement>} items - Items to fade in
 * @param {number} searchId - Search ID for validation
 * @param {Object} config - Configuration object with animation settings
 */
async function fadeInItems(items, searchId, config) {
    if (items.length === 0) return;

    const { batchSize = 15, batchDelay = 10, staggerDelay = 5, fadeDuration = INVENTORY_CONFIG.ANIMATION.FADE_IN_DURATION, applyFadeIn } = config;

    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }

    const batchPromises = batches.map((batch, batchIndex) => {
        return new Promise(resolve => {
            setTimeout(async () => {
                if (!isSearchCurrent(searchId)) {
                    resolve();
                    return;
                }

                const itemPromises = batch.map((item, index) => {
                    return new Promise(itemResolve => {
                        const totalDelay = index * staggerDelay;

                        setTimeout(() => {
                            if (!isSearchCurrent(searchId)) {
                                itemResolve();
                                return;
                            }

                            applyFadeIn(item);

                            setTimeout(() => {
                                itemResolve();
                            }, fadeDuration);
                        }, totalDelay);
                    });
                });

                await Promise.all(itemPromises);
                resolve();
            }, batchIndex * batchDelay);
        });
    });

    await Promise.all(batchPromises);
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
                
                await performDynamicSearch(searchTerm, searchId);
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
                performDynamicSearch('', searchId);
            }
        });
    }
}

/**
 * Get current search term from the search bar
 * @returns {string} Current search term
 */
function getCurrentSearchTerm() {
    const searchBar = document.querySelector('.search-bar');
    return searchBar ? searchBar.value.trim() : '';
}

// Make function globally accessible
window.getCurrentSearchTerm = getCurrentSearchTerm;

/**
 * Perform dynamic search that checks current search term and filters data
 * This is the main entry point called by the search bar and refresh functions
 * @param {string} searchTerm - The search term (can be empty)
 * @param {number} searchId - Unique search ID for validation
 */
async function performDynamicSearch(searchTerm, searchId = 0) {
    try {
        // First, ensure ingredients are loaded if needed
        const titleTextElement = getIngredientsTitleText();
        const rightContainer = getRightBoxContent();
        const hasIngredientsContent = rightContainer && rightContainer.querySelector('.ingredients-list');
        
        // If there's no ingredient content loaded yet, load it based on state
        if (!hasIngredientsContent) {
            if (window.selectedProductId) {
                // Load selected product's ingredients
                try {
                    await loadProductIngredients(window.selectedProductId);
                } catch (error) {
                    console.error('Error loading product ingredients:', error);
                    // Fall back to all ingredients
                    await displayAllIngredients();
                }
            } else {
                // Load all ingredients
                await displayAllIngredients();
            }
        }
        
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
        
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Search error:', error);
        }
    }
}

// Make function globally accessible
window.performDynamicSearch = performDynamicSearch;

/**
 * Perform comprehensive async search for both products and ingredients (LEGACY)
 * @param {string} searchTerm - The search term
 * @param {AbortSignal} signal - Abort signal for cancelling search
 * @param {number} searchId - Unique search ID for this search operation
 */
async function performAsyncSearch(searchTerm, signal = null, searchId = 0) {
    return performDynamicSearch(searchTerm, searchId);
}

/**
 * Build products table with filtered results (when table is empty)
 * @param {string} searchTerm - The search term to filter by
 * @param {number} searchId - Unique search ID for validation
 */
async function buildFilteredProductsTable(searchTerm, searchId = 0) {
    const tbody = getProductsTableBody();
    if (!tbody || !window.allProductsData) return;
    
    // Run product search and ingredient analysis in parallel
    const [matchingProductIds, ingredientFilterData] = await Promise.all([
        searchProducts(searchTerm),
        prepareIngredientFilterData(searchTerm)
    ]);
    
    // Check if search is still current
    if (searchId !== currentSearchId) {
        return;
    }
    
    // Determine which products should be visible
    const shouldBeVisibleIds = new Set();
    window.allProductsData.forEach(product => {
        const matchesDirectSearch = checkDirectProductMatch(product, searchTerm);
        const matchesIngredientSearch = matchingProductIds.has(product.id);
        if (matchesDirectSearch || matchesIngredientSearch) {
            shouldBeVisibleIds.add(product.id);
        }
    });
    
    // Build table with ALL products (not just matching ones)
    await rebuildProductsTable(window.allProductsData);
    
    // Hide non-matching products immediately (no animation since they just appeared)
    const allRows = Array.from(tbody.querySelectorAll('tr'));
    allRows.forEach(row => {
        const productId = parseInt(row.dataset.productId);
        if (!shouldBeVisibleIds.has(productId)) {
            row.style.display = 'none';
        }
    });
    
    // Handle ingredient filtering only if we have ingredient data
    if (ingredientFilterData && ingredientFilterData.ingredientsList) {
        // Apply ingredient filtering with animations
        await Promise.all([
            fadeOutIngredientItems(ingredientFilterData.nonMatchingItems || [], searchId),
            fadeInIngredientItems(ingredientFilterData.matchingItems || [], searchId)
        ]);
        
        // Handle empty state
        if (ingredientFilterData.matchingItems && ingredientFilterData.matchingItems.length === 0) {
            showNoIngredientsMessage(ingredientFilterData.ingredientsList);
        } else {
            removeNoIngredientsMessage();
        }
    }
}

/**
 * Filter products data based on search term
 * @param {string} searchTerm - The search term to filter by
 * @param {number} searchId - Unique search ID for validation
 */
async function filterProductsData(searchTerm, searchId = 0) {
    const tbody = getProductsTableBody();
    if (!tbody || !window.allProductsData || !window.allProductsData.length) return;
    
    if (!searchTerm) {
        // Show all products and ingredients if search is empty - run in parallel for sync
        await Promise.all([
            showAllProducts(),
            showAllIngredientsIfApplicable()
        ]);
        return;
    }
    
    // Get existing rows to check if we need to rebuild
    const allRows = Array.from(tbody.querySelectorAll('tr'));
    
    // Check if table is empty - if so, we need to build it first with filtered products
    if (allRows.length === 0) {
        // Table is empty, build it with filtered products directly
        await buildFilteredProductsTable(searchTerm, searchId);
        return;
    }
    
    // Run both product search and ingredient analysis in parallel, collecting results
    const [matchingProductIds, ingredientFilterData] = await Promise.all([
        searchProducts(searchTerm),
        prepareIngredientFilterData(searchTerm) // Returns data instead of applying changes
    ]);
    
    // Determine which products should be visible based on search
    const productsToShow = window.allProductsData.filter(product => {
        const matchesDirectSearch = checkDirectProductMatch(product, searchTerm);
        const matchesIngredientSearch = matchingProductIds.has(product.id);
        return matchesDirectSearch || matchesIngredientSearch;
    });
    
    // Build a set of product IDs currently in the table
    const existingProductIds = new Set();
    allRows.forEach(row => {
        const productId = parseInt(row.dataset.productId);
        if (productId) {
            existingProductIds.add(productId);
        }
    });
    
    // Build a set of product IDs that should be visible
    const shouldBeVisibleIds = new Set(productsToShow.map(p => p.id));
    
    // Check if the table structure matches what we need
    // If products need to be added (not just hidden), rebuild the table with ALL products
    const needsRebuild = productsToShow.some(product => !existingProductIds.has(product.id));
    
    if (needsRebuild) {
        // Rebuild the entire table with ALL products (not just filtered ones)
        // This ensures future searches have access to all data
        await rebuildProductsTable(window.allProductsData);
        
        // Now get the newly created rows and filter them
        const allNewRows = Array.from(tbody.querySelectorAll('tr'));
        const matchingRows = [];
        const nonMatchingRows = [];
        
        allNewRows.forEach(row => {
            const productId = parseInt(row.dataset.productId);
            if (shouldBeVisibleIds.has(productId)) {
                matchingRows.push(row);
            } else {
                nonMatchingRows.push(row);
            }
        });
        
        // Check if search is still current
        if (searchId !== currentSearchId) {
            return;
        }
        
        // Hide non-matching rows immediately (no fade-out animation since they just appeared)
        nonMatchingRows.forEach(row => {
            row.style.display = 'none';
        });
        
        // The matching rows will already be animated by rebuildProductsTable
        
        // Handle ingredient filtering
        if (ingredientFilterData && ingredientFilterData.ingredientsList) {
            await Promise.all([
                fadeOutIngredientItems(ingredientFilterData.nonMatchingItems || [], searchId),
                fadeInIngredientItems(ingredientFilterData.matchingItems || [], searchId)
            ]);
            
            if (ingredientFilterData.matchingItems && ingredientFilterData.matchingItems.length === 0) {
                showNoIngredientsMessage(ingredientFilterData.ingredientsList);
            } else {
                removeNoIngredientsMessage();
            }
        }
        return;
    }
    
    // If no rebuild needed, just hide/show existing rows
    const matchingRows = [];
    const nonMatchingRows = [];
    
    allRows.forEach(row => {
        const productId = parseInt(row.dataset.productId);
        
        if (shouldBeVisibleIds.has(productId)) {
            matchingRows.push(row);
        } else {
            nonMatchingRows.push(row);
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
    const tbody = getProductsTableBody();
    if (!tbody) return;
    
    // Remove any empty message
    removeNoResultsMessage(tbody);
    
    // Check if we have product data
    if (!window.allProductsData || window.allProductsData.length === 0) {
        console.warn('No product data available in showAllProducts');
        showNoResultsMessage(tbody);
        return;
    }
    
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
    await fadeOutItems(rows, searchId, {
        applyFadeOut: (row) => {
            row.classList.add(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_FADE_OUT);
            row.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_FADE_IN);
        }
    });
}

/**
 * Fade in specified rows with optimized batching
 * @param {Array<HTMLElement>} rows - Rows to fade in
 * @param {number} searchId - Search ID for validation
 */
async function fadeInRows(rows, searchId = 0) {
    await fadeInItems(rows, searchId, {
        applyFadeIn: (row) => {
            // Show the row first
            row.style.display = '';

            // Force reflow to ensure display change takes effect
            row.offsetHeight;

            row.classList.add(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_FADE_IN);
            row.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_FADE_OUT);
        }
    });
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
    const tbody = getProductsTableBody();
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
    const titleTextElement = getIngredientsTitleText();
    if (!titleTextElement || titleTextElement.textContent !== 'All Ingredients') {
        return null; // Not showing all ingredients, skip filtering
    }
    
    const rightContainer = getRightBoxContent();
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

// Make function globally accessible
window.prepareIngredientFilterData = prepareIngredientFilterData;

/**
 * Apply ingredient filter results to the UI (simplified for coordinated timing)
 * @param {Object|null} filterData - Filter data from prepareIngredientFilterData
 * @param {number} searchId - Search ID for validation (default 0 for refresh operations)
 */
async function applyIngredientFilterResults(filterData, searchId = 0) {
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

// Make function globally accessible
window.applyIngredientFilterResults = applyIngredientFilterResults;

async function filterIngredientsIfApplicable(searchTerm, searchId = 0) {
    const filterData = await prepareIngredientFilterData(searchTerm);
    await applyIngredientFilterResults(filterData, searchId);
}

// Make function globally accessible
window.filterIngredientsIfApplicable = filterIngredientsIfApplicable;

/**
 * Show all ingredients if applicable (when clearing search)
 */
async function showAllIngredientsIfApplicable() {
    // Check if we're showing "All Ingredients"
    const titleTextElement = getIngredientsTitleText();
    if (!titleTextElement || titleTextElement.textContent !== 'All Ingredients') {
        return; // Not showing all ingredients, skip
    }
    
    const rightContainer = getRightBoxContent();
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
    await fadeOutItems(items, searchId, {
        staggerDelay: 5,
        batchDelay: 8,
        applyFadeOut: (item) => {
            item.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
            item.style.opacity = '0';
            item.style.transform = 'translateX(-10px)';
        }
    });
}

/**
 * Fade in ingredient items with synchronized timing to match products
 * @param {Array<HTMLElement>} items - Items to fade in
 */
async function fadeInIngredientItems(items, searchId = 0) {
    await fadeInItems(items, searchId, {
        staggerDelay: 5,
        batchDelay: 10,
        applyFadeIn: (item) => {
            item.style.display = '';
            item.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
            item.style.opacity = '0';
            item.style.transform = 'translateX(-10px)';

            // Force reflow to ensure display change takes effect
            item.offsetHeight;

            item.style.opacity = '1';
            item.style.transform = 'translateX(0)';

            // Clean up transition after animation
            setTimeout(() => {
                item.style.transition = '';
                item.style.transform = '';
            }, INVENTORY_CONFIG.ANIMATION.FADE_DURATION);
        }
    });
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