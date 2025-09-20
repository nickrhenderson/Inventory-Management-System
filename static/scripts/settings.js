// Settings management module

// Function to toggle settings panel
function toggleSettings() {
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsBackdrop = document.getElementById('settingsBackdrop');
    
    settingsPanel.classList.toggle('open');
    settingsBackdrop.classList.toggle('open');
}

/**
 * Initialize settings when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Settings initialization can be added here
    console.log('Settings module loaded');
});