document.addEventListener('DOMContentLoaded', function () {
    const scripts = [
        { src: "scripts/constants.js", isModule: false },
        { src: "scripts/utils.js", isModule: false },
        { src: "scripts/google_drive.js", isModule: false },
        { src: "scripts/groups.js", isModule: false },
        { src: "scripts/search.js", isModule: false },
        { src: "scripts/ingredients.js", isModule: false },
        { src: "scripts/products.js", isModule: false },
        { src: "scripts/modals.js", isModule: false },
        { src: "scripts/events.js", isModule: false },
        { src: "scripts/inventory.js", isModule: false }
    ];

    function loadScript({ src, isModule }) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            // Cache-bust so WebView2's disk cache can't serve a stale copy of app logic
            script.src = src + '?v=' + Date.now();
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
            setTimeout(async () => {
                try {
                    await initializeApp();
                    window.dispatchEvent(new CustomEvent('app:initialized'));
                } catch (initErr) {
                    console.error('Error initializing app:', initErr);
                    window.dispatchEvent(new CustomEvent('app:failed', { detail: initErr }));
                }
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
    
    // Use unified refresh function to reload data with search persistence
    if (typeof refreshInventoryData === 'function') {
        refreshInventoryData();
    }
    
    console.log('Files refreshed!');
}