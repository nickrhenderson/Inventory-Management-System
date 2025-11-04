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
    
    // Load and display the current version
    await loadAndDisplayVersion();
    
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

/**
 * Load and display the current application version
 */
async function loadAndDisplayVersion() {
    try {
        const response = await pywebview.api.get_app_version();
        if (response.success) {
            const versionButton = document.getElementById('versionButton');
            if (versionButton) {
                versionButton.textContent = `v${response.version}`;
                versionButton.title = 'Checking for updates...'; // Initial state
                
                // Also check for updates and style the button accordingly
                await checkForUpdatesAndStyleButton();
            }
        }
    } catch (error) {
        console.error('Error loading version:', error);
        // Keep the default version if API call fails
        const versionButton = document.getElementById('versionButton');
        if (versionButton) {
            versionButton.title = 'Version check failed';
        }
    }
}

/**
 * Check for updates and style the version button if updates are available
 */
async function checkForUpdatesAndStyleButton() {
    try {
        const response = await pywebview.api.check_for_updates();
        if (response.success) {
            const versionButton = document.getElementById('versionButton');
            if (versionButton) {
                if (response.update_available) {
                    versionButton.classList.add('update-available');
                    versionButton.title = `Update Available: v${response.latest_version}`;
                    versionButton.style.cursor = 'pointer';
                    
                    // Add click handler for update installation
                    versionButton.onclick = async function() {
                        if (confirm(`A new version (v${response.latest_version}) is available. Would you like to download and install it now?\n\nThe application will restart automatically after installation.`)) {
                            try {
                                const updateResponse = await pywebview.api.download_and_install_update();
                                if (updateResponse.success) {
                                    alert(updateResponse.message);
                                    // Close the application - the batch file will restart it
                                    window.close();
                                } else {
                                    alert(`Update failed: ${updateResponse.message}`);
                                }
                            } catch (error) {
                                console.error('Error during update:', error);
                                alert('Failed to download update. Please try again later.');
                            }
                        }
                    };
                    
                    // Add animation completion handling for hover
                    setupVersionButtonAnimation(versionButton);
                    
                    console.log(`Update available: v${response.latest_version} (current: v${response.current_version})`);
                } else {
                    versionButton.title = 'Up to Date';
                    versionButton.style.cursor = 'default';
                    versionButton.onclick = null; // Remove click handler if no update available
                }
            }
        }
    } catch (error) {
        console.error('Error checking for updates:', error);
        // Don't change styling if update check fails
        const versionButton = document.getElementById('versionButton');
        if (versionButton) {
            versionButton.title = 'Version check failed';
        }
    }
}

/**
 * Setup animation completion handling for version button hover
 */
function setupVersionButtonAnimation(versionButton) {
    let animationPaused = false;
    let waitingForCompletion = false;
    
    versionButton.addEventListener('mouseenter', function() {
        if (animationPaused || waitingForCompletion) return;
        
        // Check if animation is currently running
        const computedStyle = window.getComputedStyle(versionButton);
        const animationPlayState = computedStyle.animationPlayState;
        
        if (animationPlayState === 'running') {
            // Animation is running, wait for current cycle to complete
            waitingForCompletion = true;
            
            // Listen for animation iteration (when one cycle completes)
            const handleIteration = function() {
                versionButton.style.animationPlayState = 'paused';
                animationPaused = true;
                waitingForCompletion = false;
                versionButton.removeEventListener('animationiteration', handleIteration);
            };
            
            versionButton.addEventListener('animationiteration', handleIteration);
            
            // Fallback: if no iteration event fires within 2.5 seconds, pause anyway
            setTimeout(() => {
                if (waitingForCompletion) {
                    versionButton.style.animationPlayState = 'paused';
                    animationPaused = true;
                    waitingForCompletion = false;
                    versionButton.removeEventListener('animationiteration', handleIteration);
                }
            }, 2500);
        } else {
            // Animation is not running, pause immediately
            versionButton.style.animationPlayState = 'paused';
            animationPaused = true;
        }
    });
    
    versionButton.addEventListener('mouseleave', function() {
        if (animationPaused) {
            versionButton.style.animationPlayState = 'running';
            animationPaused = false;
        }
        waitingForCompletion = false;
    });
}
