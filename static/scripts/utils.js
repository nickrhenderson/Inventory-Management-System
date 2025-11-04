// Utility functions for the inventory system

/**
 * Wait for pywebview to be ready
 * @param {number} maxAttempts - Maximum number of attempts
 * @param {number} delay - Delay between attempts in milliseconds
 * @returns {Promise} Resolves when pywebview is ready
 */
function waitForPywebview(maxAttempts = INVENTORY_CONFIG.API_TIMEOUT.MAX_ATTEMPTS, delay = INVENTORY_CONFIG.API_TIMEOUT.DELAY_MS) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        
        const checkPywebview = () => {
            attempts++;
            
            if (typeof pywebview !== 'undefined' && pywebview.api) {
                resolve();
            } else if (attempts >= maxAttempts) {
                reject(new Error(ERROR_MESSAGES.API_NOT_AVAILABLE));
            } else {
                setTimeout(checkPywebview, delay);
            }
        };
        
        checkPywebview();
    });
}

/**
 * Generate UPC-A compliant barcode display HTML
 * @param {string} barcodeId - The barcode ID to generate
 * @returns {string} HTML string for barcode display
 */
function generateBarcodeDisplay(barcodeId) {
    console.log('Generating UPC-A compliant barcode for:', barcodeId);
    
    // Ensure we have exactly 12 digits
    const paddedId = barcodeId.padStart(INVENTORY_CONFIG.BARCODE.BARCODE_LENGTH, '0')
                             .substring(0, INVENTORY_CONFIG.BARCODE.BARCODE_LENGTH);
    
    const { LEFT_PATTERNS, RIGHT_PATTERNS } = INVENTORY_CONFIG.BARCODE;
    
    let barcodeHTML = '';
    
    // Start guard pattern (101)
    barcodeHTML += generateGuardPattern(INVENTORY_CONFIG.BARCODE.START_GUARD);
    
    // Left-hand digits (first 6 digits)
    for (let i = 0; i < 6; i++) {
        const digit = paddedId[i];
        const pattern = LEFT_PATTERNS[digit];
        barcodeHTML += generateBarcodePattern(pattern);
    }
    
    // Center guard pattern (01010)
    barcodeHTML += generateGuardPattern(INVENTORY_CONFIG.BARCODE.CENTER_GUARD);
    
    // Right-hand digits (last 6 digits)
    for (let i = 6; i < 12; i++) {
        const digit = paddedId[i];
        const pattern = RIGHT_PATTERNS[digit];
        barcodeHTML += generateBarcodePattern(pattern);
    }
    
    // End guard pattern (101)
    barcodeHTML += generateGuardPattern(INVENTORY_CONFIG.BARCODE.END_GUARD);
    
    console.log('Generated UPC-A compliant barcode with', barcodeHTML.split('upc-').length - 1, 'elements');
    return barcodeHTML;
}

/**
 * Generate HTML for guard pattern
 * @param {string} pattern - Binary pattern string
 * @returns {string} HTML for guard pattern
 */
function generateGuardPattern(pattern) {
    let html = '';
    for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] === '1') {
            html += '<div class="upc-bar" data-width="1"></div>';
        } else {
            html += '<div class="upc-space" data-width="1"></div>';
        }
    }
    return html;
}

/**
 * Generate HTML for barcode pattern
 * @param {string} pattern - Binary pattern string
 * @returns {string} HTML for barcode pattern
 */
function generateBarcodePattern(pattern) {
    let html = '';
    for (let j = 0; j < pattern.length; j++) {
        if (pattern[j] === '1') {
            html += '<div class="upc-bar" data-width="1"></div>';
        } else {
            html += '<div class="upc-space" data-width="1"></div>';
        }
    }
    return html;
}

/**
 * Format currency value
 * @param {number} value - Currency value
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted currency string
 */
function formatCurrency(value, decimals = 3) {
    return `$${parseFloat(value).toFixed(decimals)}`;
}

/**
 * Format quantity with unit
 * @param {number} quantity - Quantity value
 * @param {string} unit - Unit of measurement
 * @returns {string} Formatted quantity string
 */
function formatQuantity(quantity, unit = INVENTORY_CONFIG.DEFAULTS.UNIT) {
    return `${parseFloat(quantity).toFixed(1)}${unit.charAt(0)}`;
}

/**
 * Format date for display
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
    if (!date) return '';
    
    // Handle date string without timezone conversion to avoid "day after" bug
    const dateStr = String(date).split('T')[0]; // Remove time part if present
    const dateParts = dateStr.split('-');
    
    if (dateParts.length === 3) {
        const year = dateParts[0];
        const month = dateParts[1];
        const day = dateParts[2];
        
        // Create date using local timezone to avoid shifts
        const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        return localDate.toLocaleDateString();
    }
    
    // Fallback for unexpected formats
    return String(date);
}

/**
 * Show confirmation modal
 * @param {string} title - Modal title
 * @param {string} message - Modal message
 * @param {string} confirmText - Confirm button text
 * @param {boolean} isUnflag - Whether this is an unflag action
 * @param {Function} onConfirm - Callback function on confirmation
 * @param {Function} onCancel - Callback function on cancellation (optional)
 */
function showConfirmationModal(title, message, confirmText, isUnflag, onConfirm, onCancel) {
    // Remove existing modal if any
    const existingModal = document.querySelector('.confirmation-modal-backdrop');
    if (existingModal) {
        existingModal.remove();
    }
    
    const confirmButtonClass = isUnflag ? 'unflag' : 'confirm';
    
    const modalHTML = `
        <div class="modal-backdrop confirmation-modal-backdrop" id="confirmationModal" onclick="cancelAction()">
            <div class="modal-content confirmation-modal" onclick="event.stopPropagation()">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="confirmation-modal-buttons">
                    <button class="confirmation-modal-button cancel" onclick="cancelAction()">
                        Cancel
                    </button>
                    <button class="confirmation-modal-button ${confirmButtonClass}" onclick="confirmAction()">
                        ${confirmText}
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Store the confirm and cancel actions
    window.currentConfirmAction = onConfirm;
    window.currentCancelAction = onCancel;
    
    // Show modal with animation
    setTimeout(() => {
        const modal = document.getElementById('confirmationModal');
        if (modal) {
            modal.classList.add('open');
        }
    }, 10);
}

/**
 * Hide confirmation modal
 */
function hideConfirmationModal() {
    const modal = document.getElementById('confirmationModal');
    if (modal) {
        modal.classList.remove('open');
        setTimeout(() => {
            modal.remove();
            window.currentConfirmAction = null;
            window.currentCancelAction = null;
        }, 300);
    }
}

/**
 * Handle cancel action in modal
 */
function cancelAction() {
    if (window.currentCancelAction) {
        window.currentCancelAction();
    }
    hideConfirmationModal();
}

/**
 * Confirm action in modal
 */
async function confirmAction() {
    const confirmButton = document.querySelector('.confirmation-modal-button.confirm, .confirmation-modal-button.unflag');
    const cancelButton = document.querySelector('.confirmation-modal-button.cancel');
    
    if (confirmButton) {
        // Disable confirm button immediately
        confirmButton.disabled = true;
        confirmButton.style.pointerEvents = 'none';
        confirmButton.style.opacity = '0.6';
        confirmButton.style.cursor = 'not-allowed';
        confirmButton.textContent = 'Processing...';
    }
    
    if (cancelButton) {
        // Also disable cancel button to prevent interruption
        cancelButton.disabled = true;
        cancelButton.style.pointerEvents = 'none';
        cancelButton.style.opacity = '0.6';
        cancelButton.style.cursor = 'not-allowed';
    }
    
    if (window.currentConfirmAction) {
        await window.currentConfirmAction();
        window.currentConfirmAction = null;
        window.currentCancelAction = null;
        
        // Auto-close modal faster after action completes
        setTimeout(() => {
            hideConfirmationModal();
        }, 500); // Reduced from AUTO_CLOSE_DELAY to 500ms
    } else {
        hideConfirmationModal();
    }
}

/**
 * Create loading spinner HTML
 * @param {string} text - Loading text to display
 * @returns {string} HTML for loading spinner
 */
function createLoadingHTML(text) {
    return `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <p class="loading-text">${text}</p>
            <div class="loading-progress">
                <div class="loading-bar"></div>
            </div>
        </div>
    `;
}

/**
 * Create error display HTML
 * @param {string} message - Error message
 * @param {string} retryFunction - Optional retry function name
 * @returns {string} HTML for error display
 */
function createErrorHTML(message, retryFunction = null) {
    const retryButton = retryFunction ? `
        <button onclick="${retryFunction}()" style="
            padding: 10px 20px; 
            background: #be1d2b; 
            color: white; 
            border: none; 
            border-radius: 5px; 
            cursor: pointer;
            margin-top: 10px;
        ">Retry</button>
    ` : '';
    
    return `
        <div style="text-align: center; padding: 20px;">
            <p><strong>Error</strong></p>
            <p>${message}</p>
            ${retryButton}
        </div>
    `;
}

/**
 * Print barcode by generating a PDF
 * @param {string} barcodeId - Barcode ID to print
 */
async function printBarcode(barcodeId) {
    console.log('Print barcode requested for:', barcodeId);
    
    try {
        // Call backend to generate PDF - no visual feedback needed
        const result = await pywebview.api.generate_barcode_pdf(barcodeId);
        
        if (result.success) {
            console.log('Barcode PDF generated successfully:', result.pdf_path);
            // PDF should automatically open in default browser/application
        } else {
            throw new Error(result.error || 'Failed to generate PDF');
        }
        
    } catch (error) {
        console.error('Error generating barcode PDF:', error);
        // Silent error handling - no visual feedback to the barcode display
    }
}

// Context menu functionality
let contextMenuVisible = false;
let contextMenuPosition = { x: 0, y: 0 };

/**
 * Show the context menu at the specified position
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function showContextMenu(x, y) {
    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) {
        console.error('Context menu element not found!');
        return;
    }
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Get menu dimensions (approximate)
    const menuWidth = 180;
    const menuHeight = 80; // Approximate height for 2 items
    
    // Adjust position to keep menu on screen
    let adjustedX = x;
    let adjustedY = y;
    
    if (x + menuWidth > viewportWidth) {
        adjustedX = x - menuWidth;
    }
    
    if (y + menuHeight > viewportHeight) {
        adjustedY = y - menuHeight;
    }
    
    // Ensure menu doesn't go off the left or top edges
    adjustedX = Math.max(0, adjustedX);
    adjustedY = Math.max(0, adjustedY);
    
    // Position the menu
    contextMenu.style.left = adjustedX + 'px';
    contextMenu.style.top = adjustedY + 'px';
    
    // Store the menu position for distance calculation
    contextMenuPosition = { x: adjustedX, y: adjustedY };
    
    // Show the menu
    contextMenu.classList.add('show');
    contextMenuVisible = true;
    
    console.log('Context menu shown at:', adjustedX, adjustedY);
}

/**
 * Hide the context menu
 */
function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) return;
    
    // Remove the show class to trigger the scale-down animation
    contextMenu.classList.remove('show');
    contextMenuVisible = false;
}

// Make hideContextMenu globally accessible
window.hideContextMenu = hideContextMenu;

/**
 * Handle right-click events on the main content area
 * @param {MouseEvent} event - The right-click event
 */
function handleContextMenu(event) {
    console.log('Context menu event triggered', event.target, event.clientX, event.clientY);
    
    // Don't show context menu if clicking on interactive elements
    if (event.target.closest('.ingredient-menu, .context-menu, button, input, select, textarea, .modal-content')) {
        console.log('Context menu blocked - on interactive element');
        return;
    }
    
    // Check if right-clicking on a product row
    const productRow = event.target.closest('tr[data-product-id]');
    if (productRow) {
        window.contextMenuProductId = parseInt(productRow.dataset.productId);
        // Show "Add to Group" menu item if groups exist
        const addToGroupItem = document.getElementById('addToGroupMenuItem');
        if (addToGroupItem && window.productGroups && window.productGroups.length > 0) {
            addToGroupItem.style.display = '';
        }
    } else {
        window.contextMenuProductId = null;
        // Hide "Add to Group" menu item
        const addToGroupItem = document.getElementById('addToGroupMenuItem');
        if (addToGroupItem) {
            addToGroupItem.style.display = 'none';
        }
    }
    
    // Prevent default context menu
    event.preventDefault();
    console.log('Default prevented, showing context menu');
    
    // Show context menu at mouse position
    showContextMenu(event.clientX, event.clientY);
}

/**
 * Initialize context menu functionality
 */
function initializeContextMenu() {
    const mainElement = document.querySelector('main');
    if (mainElement) {
        // Add right-click event listener to the main element
        mainElement.addEventListener('contextmenu', handleContextMenu);
        console.log('Context menu listener attached to main element');
    } else {
        console.error('Main element not found for context menu');
    }
    
    // Add click event listener to hide context menu when clicking elsewhere
    document.addEventListener('click', function(event) {
        if (contextMenuVisible && !event.target.closest('.context-menu')) {
            hideContextMenu();
        }
    });
    
    // Add escape key listener to hide context menu
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && contextMenuVisible) {
            hideContextMenu();
        }
    });
    
    // Add mousemove listener to hide context menu when mouse moves far away
    document.addEventListener('mousemove', function(event) {
        if (!contextMenuVisible) return;
        
        const contextMenu = document.getElementById('contextMenu');
        if (!contextMenu) return;
        
        // Get the menu dimensions
        const menuRect = contextMenu.getBoundingClientRect();
        
        // Calculate distance from mouse to the menu (including some padding)
        const padding = 20; // pixels of padding around the menu
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        
        // Check if mouse is within the expanded menu bounds
        const isNearMenu = (
            mouseX >= menuRect.left - padding &&
            mouseX <= menuRect.right + padding &&
            mouseY >= menuRect.top - padding &&
            mouseY <= menuRect.bottom + padding
        );
        
        // Hide menu if mouse is far away
        if (!isNearMenu) {
            hideContextMenu();
        }
    });
}

/**
 * Show group selection menu from context menu
 * @param {Event} event - Click event
 */
function showGroupMenuFromContext(event) {
    if (window.contextMenuProductId && window.showGroupSelectionMenu) {
        // Get the position of the context menu
        const contextMenu = document.getElementById('contextMenu');
        if (contextMenu) {
            const rect = contextMenu.getBoundingClientRect();
            window.showGroupSelectionMenu(window.contextMenuProductId, rect.right + 5, rect.top);
        }
    }
}

// Make function globally accessible
window.showGroupMenuFromContext = showGroupMenuFromContext;
