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
 * @param {number} value - Numeric value to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted currency string
 */
function formatCurrency(value, decimals = 2) {
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
 */
function showConfirmationModal(title, message, confirmText, isUnflag, onConfirm) {
    // Remove existing modal if any
    const existingModal = document.querySelector('.confirmation-modal-backdrop');
    if (existingModal) {
        existingModal.remove();
    }
    
    const confirmButtonClass = isUnflag ? 'unflag' : 'confirm';
    
    const modalHTML = `
        <div class="modal-backdrop confirmation-modal-backdrop" id="confirmationModal" onclick="hideConfirmationModal()">
            <div class="modal-content confirmation-modal" onclick="event.stopPropagation()">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="confirmation-modal-buttons">
                    <button class="confirmation-modal-button cancel" onclick="hideConfirmationModal()">
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
    
    // Store the confirm action
    window.currentConfirmAction = onConfirm;
    
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
        }, 300);
    }
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