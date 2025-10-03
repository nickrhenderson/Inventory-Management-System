// Constants and configuration values for the inventory system

const INVENTORY_CONFIG = {
    // API timeout settings
    API_TIMEOUT: {
        MAX_ATTEMPTS: 10,
        DELAY_MS: 500
    },
    
    // Search settings
    SEARCH: {
        DEBOUNCE_DELAY: 150, // Reduced from 300ms for faster response
        BARCODE_PATTERN: /^(978|PRD)/i
    },
    
    // Animation timing
    ANIMATION: {
        ROW_DELAY: 120,
        ROW_FADE_DELAY: 80,
        FADE_DURATION: 200, // Reduced from 400ms for snappier feel
        FADE_IN_DURATION: 250, // Reduced from 500ms for faster fade-in
        ANIMATION_DURATION: 800,
        LOADED_DURATION: 800,
        LOADING_DELAY: 800,
        RENDER_DELAY: 500,
        AUTO_CLOSE_DELAY: 3000,
        BUTTON_RESET_DELAY: 3000
    },
    
    // UPC-A Barcode patterns
    BARCODE: {
        LEFT_PATTERNS: {
            '0': '0001101', '1': '0011001', '2': '0010011', '3': '0111101', '4': '0100011',
            '5': '0110001', '6': '0101111', '7': '0111011', '8': '0110111', '9': '0001011'
        },
        RIGHT_PATTERNS: {
            '0': '1110010', '1': '1100110', '2': '1101100', '3': '1000010', '4': '1011100',
            '5': '1001110', '6': '1010000', '7': '1000100', '8': '1001000', '9': '1110100'
        },
        START_GUARD: '101',
        CENTER_GUARD: '01010',
        END_GUARD: '101',
        BARCODE_LENGTH: 12
    },
    
    // CSS classes
    CSS_CLASSES: {
        INVENTORY_ROW_HIDDEN: 'inventory-row-hidden',
        INVENTORY_ROW_ANIMATE_IN: 'inventory-row-animate-in',
        INVENTORY_ROW_LOADED: 'inventory-row-loaded',
        INVENTORY_ROW_FADE_OUT: 'inventory-row-fade-out',
        INVENTORY_ROW_FADE_IN: 'inventory-row-fade-in',
        SELECTED_PRODUCT: 'selected-product',
        FLAGGED_PRODUCT: 'flagged-product',
        FLAGGED: 'flagged'
    },
    
    // Default values
    DEFAULTS: {
        UNIT: 'grams',
        QUANTITY: 0
    }
};

// Error messages
const ERROR_MESSAGES = {
    API_NOT_AVAILABLE: 'Pywebview API not available after maximum attempts',
    LOAD_PRODUCTS_FAILED: 'Error loading products',
    LOAD_INGREDIENTS_FAILED: 'Error loading ingredients',
    CREATE_PRODUCT_FAILED: 'Failed to create product',
    CREATE_INGREDIENT_FAILED: 'Failed to create ingredient',
    TOGGLE_FLAG_FAILED: 'Failed to update ingredient flag status',
    VALIDATION_QUANTITY: 'Please enter a valid quantity for all selected ingredients',
    VALIDATION_INGREDIENTS: 'Please select at least one ingredient',
    VALIDATION_REQUIRED: 'Please fill in all required fields'
};

// Success messages
const SUCCESS_MESSAGES = {
    PRODUCT_CREATED: 'Product Created Successfully!',
    INGREDIENT_CREATED: '✓ Ingredient Created Successfully!'
};