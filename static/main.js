document.addEventListener('DOMContentLoaded', function () {
    const scripts = [
        { src: "static/scripts/constants.js", isModule: false },
        { src: "static/scripts/utils.js", isModule: false },
        { src: "static/scripts/search.js", isModule: false },
        { src: "static/scripts/ingredients.js", isModule: false },
        { src: "static/scripts/products.js", isModule: false },
        { src: "static/scripts/modals.js", isModule: false },
        { src: "static/scripts/settings.js", isModule: false },
        { src: "static/scripts/inventory.js", isModule: false }
    ];

    function loadScript({ src, isModule }) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            if (isModule) script.type = 'module';
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    }

    // Load scripts *sequentially* to preserve order and dependencies
    (async () => {
        try {
            for (const script of scripts) {
                await loadScript(script);
                console.log(`Loaded: ${script.src}`);
            }
            
            console.log('All modules loaded successfully');
            
            // Wait a bit longer for pywebview to initialize, then load app
            setTimeout(() => {
                initializeApp();
            }, 1000); // 1 second delay

        } catch (err) {
            console.error('Error loading modules:', err);
        }
    })();
});

// Function to refresh files without full page reload
function refreshFiles() {
    // Refresh CSS
    const cssLinks = document.querySelectorAll('link[rel="stylesheet"]');
    cssLinks.forEach(link => {
        const href = link.href;
        link.href = href + '?v=' + new Date().getTime();
    });
    
    // Refresh JavaScript files
    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach(script => {
        if (script.src.includes('main.js')) {
            const newScript = document.createElement('script');
            newScript.src = script.src + '?v=' + new Date().getTime();
            newScript.defer = script.defer;
            script.parentNode.replaceChild(newScript, script);
        }
    });
    
    // Reset ingredients panel to initial state with loading
    if (typeof showIngredientsLoading === 'function') {
        showIngredientsLoading('Refreshing ingredients...');
    }
    
    // Reset ingredients panel to initial state
    if (typeof resetIngredientsPanel === 'function') {
        resetIngredientsPanel();
    }
    
    // Clear any selected product
    if (typeof clearProductSelection === 'function') {
        clearProductSelection();
    }
    
    // Reload products data
    if (typeof loadProductsData === 'function') {
        loadProductsData();
    }
    
    console.log('Files refreshed!');
}