// Settings management module

// Global variables for update functionality
let updateData = null;
let downloadedFilePath = null;
let hasCheckedForUpdatesOnStartup = false; // Track if we've done the initial check

// Function to toggle settings panel
function toggleSettings() {
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsBackdrop = document.getElementById('settingsBackdrop');
    
    settingsPanel.classList.toggle('open');
    settingsBackdrop.classList.toggle('open');
    
    // Load current version and check for updates when opening settings
    if (settingsPanel.classList.contains('open')) {
        loadCurrentVersion();
        
        // Automatically check for updates on first open
        if (!hasCheckedForUpdatesOnStartup) {
            hasCheckedForUpdatesOnStartup = true;
            setTimeout(() => {
                checkForUpdatesOnStartup();
            }, 500); // Small delay to ensure UI is rendered
        }
    }
}

/**
 * Load and display current app version
 */
async function loadCurrentVersion() {
    try {
        const response = await pywebview.api.get_app_version();
        if (response.success) {
            document.getElementById('currentVersion').textContent = response.version;
        } else {
            document.getElementById('currentVersion').textContent = 'Unknown';
        }
    } catch (error) {
        console.error('Error loading version:', error);
        document.getElementById('currentVersion').textContent = 'Error';
    }
}

/**
 * Check for available updates (manual trigger)
 */
async function checkForUpdates() {
    const checkBtn = document.getElementById('checkUpdateBtn');
    const statusDiv = document.getElementById('updateStatus');
    const actionsDiv = document.getElementById('updateActions');
    
    // Reset UI
    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking...';
    checkBtn.classList.remove('up-to-date'); // Reset any previous up-to-date styling
    checkBtn.className = 'btn btn-primary'; // Reset to primary styling
    statusDiv.className = 'update-status loading';
    statusDiv.textContent = 'Checking for updates...';
    actionsDiv.style.display = 'none';
    
    try {
        const response = await pywebview.api.check_for_updates();
        
        if (response.success) {
            updateData = response;
            
            if (response.update_available) {
                // Reset button state for update available
                checkBtn.classList.remove('up-to-date');
                checkBtn.disabled = false;
                checkBtn.textContent = 'Update Available!';
                checkBtn.className = 'btn btn-warning'; // Make it more noticeable
                
                statusDiv.className = 'update-status warning';
                statusDiv.innerHTML = `
                    <strong>Update Available!</strong><br>
                    Current: v${response.current_version} → Latest: v${response.latest_version}<br>
                    ${response.published_at ? `Released: ${new Date(response.published_at).toLocaleDateString()}` : ''}
                `;
                
                // Show action buttons if we have an exe asset
                if (response.exe_asset) {
                    actionsDiv.style.display = 'flex';
                    document.getElementById('downloadUpdateBtn').disabled = false;
                    document.getElementById('viewReleaseBtn').disabled = false;
                } else {
                    statusDiv.innerHTML += '<br><em>No executable found in latest release.</em>';
                }
            } else {
                statusDiv.className = 'update-status success';
                statusDiv.textContent = `You're up to date! Current version: v${response.current_version}`;
                actionsDiv.style.display = 'none';
                
                // Style the check button to show up-to-date status
                checkBtn.classList.add('up-to-date');
                checkBtn.disabled = true;
                checkBtn.textContent = 'Up to Date';
                checkBtn.className = 'btn btn-primary up-to-date'; // Reset to primary with up-to-date styling
            }
        } else {
            throw new Error(response.error || 'Unknown error occurred');
        }
    } catch (error) {
        console.error('Error checking for updates:', error);
        checkBtn.classList.remove('up-to-date'); // Reset styling on error
        checkBtn.className = 'btn btn-primary'; // Reset to primary styling
        statusDiv.className = 'update-status error';
        statusDiv.textContent = `Failed to check for updates: ${error.message}`;
        actionsDiv.style.display = 'none';
    } finally {
        if (!checkBtn.classList.contains('up-to-date')) {
            checkBtn.disabled = false;
            checkBtn.textContent = 'Check for Updates';
        }
    }
}

/**
 * Download the available update
 */
async function downloadUpdate() {
    if (!updateData || !updateData.exe_asset) {
        showUpdateStatus('error', 'No update available to download');
        return;
    }
    
    const downloadBtn = document.getElementById('downloadUpdateBtn');
    const progressDiv = document.getElementById('downloadProgress');
    const statusDiv = document.getElementById('updateStatus');
    
    // Update UI for download
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading...';
    progressDiv.style.display = 'flex';
    statusDiv.className = 'update-status loading';
    statusDiv.textContent = `Downloading ${updateData.exe_asset.name}...`;
    
    try {
        const response = await pywebview.api.download_update(updateData.exe_asset.download_url);
        
        if (response.success) {
            downloadedFilePath = response.file_path;
            
            // Update UI for successful download
            progressDiv.style.display = 'none';
            statusDiv.className = 'update-status success';
            statusDiv.innerHTML = `
                <strong>Download Complete!</strong><br>
                File: ${response.filename} (${formatFileSize(response.file_size)})<br>
                Ready to install update.
            `;
            
            // Change download button to install button
            downloadBtn.textContent = 'Install Update';
            downloadBtn.className = 'btn btn-warning';
            downloadBtn.onclick = installUpdate;
            downloadBtn.disabled = false;
            
        } else {
            throw new Error(response.error || 'Download failed');
        }
    } catch (error) {
        console.error('Error downloading update:', error);
        progressDiv.style.display = 'none';
        statusDiv.className = 'update-status error';
        statusDiv.textContent = `Download failed: ${error.message}`;
        
        // Reset download button
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download Update';
    }
}

/**
 * Install the downloaded update
 */
async function installUpdate() {
    if (!downloadedFilePath) {
        showUpdateStatus('error', 'No update file to install');
        return;
    }
    
    const installBtn = document.getElementById('downloadUpdateBtn');
    const statusDiv = document.getElementById('updateStatus');
    
    // Confirm installation
    const confirmed = confirm(
        'This will restart the application to install the update. ' +
        'Make sure you have saved any important work. Continue?'
    );
    
    if (!confirmed) {
        return;
    }
    
    installBtn.disabled = true;
    installBtn.textContent = 'Installing...';
    statusDiv.className = 'update-status loading';
    statusDiv.textContent = 'Installing update and restarting application...';
    
    try {
        const response = await pywebview.api.install_update(downloadedFilePath);
        
        if (response.success) {
            statusDiv.className = 'update-status success';
            statusDiv.innerHTML = `
                <strong>Update Installed Successfully!</strong><br>
                Application is restarting with fresh styling...
            `;
            
            // Show final message briefly, then the app should close
            setTimeout(() => {
                statusDiv.innerHTML = `
                    <strong>Restarting...</strong><br>
                    The application will restart automatically with updated styling.
                `;
            }, 2000);
            
            // If for some reason the app doesn't close, show fallback message
            setTimeout(() => {
                if (document.body) {  // Check if we're still running
                    statusDiv.innerHTML = `
                        <strong>Please restart manually</strong><br>
                        If the application doesn't restart automatically, 
                        please close it and restart to see the updates.
                    `;
                }
            }, 8000);
            
        } else {
            throw new Error(response.error || 'Installation failed');
        }
    } catch (error) {
        console.error('Error installing update:', error);
        statusDiv.className = 'update-status error';
        statusDiv.textContent = `Installation failed: ${error.message}`;
        
        installBtn.disabled = false;
        installBtn.textContent = 'Install Update';
    }
}

/**
 * View release notes in browser
 */
async function viewRelease() {
    if (!updateData || !updateData.release_url) {
        showUpdateStatus('error', 'No release information available');
        return;
    }
    
    try {
        await pywebview.api.open_release_page(updateData.release_url);
    } catch (error) {
        console.error('Error opening release page:', error);
        showUpdateStatus('error', 'Failed to open release page');
    }
}

/**
 * Helper function to show update status
 */
function showUpdateStatus(type, message) {
    const statusDiv = document.getElementById('updateStatus');
    statusDiv.className = `update-status ${type}`;
    statusDiv.textContent = message;
}

/**
 * Helper function to format file size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Force refresh application cache
 */
async function refreshApplicationCache() {
    const refreshBtn = document.getElementById('refreshCacheBtn');
    
    const confirmed = confirm(
        'This will restart the application to refresh the cache. ' +
        'Make sure you have saved any important work. Continue?'
    );
    
    if (!confirmed) {
        return;
    }
    
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing...';
    
    try {
        const response = await pywebview.api.force_refresh_cache();
        
        if (response.success) {
            // Show success message briefly before restart
            refreshBtn.textContent = 'Restarting...';
            // The app should close and restart automatically
        } else {
            throw new Error(response.error || 'Failed to refresh cache');
        }
    } catch (error) {
        console.error('Error refreshing cache:', error);
        alert(`Failed to refresh cache: ${error.message}`);
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh Cache';
    }
}

/**
 * Initialize settings when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('Settings module loaded');
    
    // Load current version immediately (for any early access)
    // Note: Automatic update check now happens when settings panel is first opened
});

/**
 * Check for updates on startup (silent version)
 */
async function checkForUpdatesOnStartup() {
    const checkBtn = document.getElementById('checkUpdateBtn');
    const statusDiv = document.getElementById('updateStatus');
    const actionsDiv = document.getElementById('updateActions');
    
    if (!checkBtn || !statusDiv || !actionsDiv) {
        // UI elements not ready yet, skip startup check
        console.log('Settings UI not ready for automatic update check');
        return;
    }
    
    console.log('Automatically checking for updates...');
    
    try {
        // Show subtle loading state
        checkBtn.disabled = true;
        checkBtn.textContent = 'Checking...';
        checkBtn.classList.remove('up-to-date');
        statusDiv.className = 'update-status loading';
        statusDiv.textContent = 'Automatically checking for updates...';
        
        const response = await pywebview.api.check_for_updates();
        
        if (response.success) {
            updateData = response;
            
            if (response.update_available) {
                // Update available - make button prominent
                checkBtn.classList.remove('up-to-date');
                checkBtn.disabled = false;
                checkBtn.textContent = 'Update Available!';
                checkBtn.className = 'btn btn-warning'; // Make it more noticeable
                
                statusDiv.className = 'update-status warning';
                statusDiv.innerHTML = `
                    <strong>Update Available!</strong><br>
                    Current: v${response.current_version} → Latest: v${response.latest_version}<br>
                    ${response.published_at ? `Released: ${new Date(response.published_at).toLocaleDateString()}` : ''}
                `;
                
                // Show action buttons if we have an exe asset
                if (response.exe_asset) {
                    actionsDiv.style.display = 'flex';
                    document.getElementById('downloadUpdateBtn').disabled = false;
                    document.getElementById('viewReleaseBtn').disabled = false;
                } else {
                    statusDiv.innerHTML += '<br><em>No executable found in latest release.</em>';
                }
                
                console.log('Update available:', response.latest_version);
            } else {
                // Up to date - show disabled state
                statusDiv.className = 'update-status success';
                statusDiv.textContent = `You're up to date! Current version: v${response.current_version}`;
                actionsDiv.style.display = 'none';
                
                // Style the check button to show up-to-date status
                checkBtn.classList.add('up-to-date');
                checkBtn.disabled = true;
                checkBtn.textContent = 'Up to Date';
                checkBtn.className = 'btn btn-primary up-to-date'; // Reset to primary with up-to-date styling
                
                console.log('App is up to date:', response.current_version);
            }
        } else {
            throw new Error(response.error || 'Unknown error occurred');
        }
    } catch (error) {
        console.error('Error checking for updates on startup:', error);
        
        // Reset to default state on error
        checkBtn.classList.remove('up-to-date');
        checkBtn.disabled = false;
        checkBtn.textContent = 'Check for Updates';
        checkBtn.className = 'btn btn-primary';
        
        statusDiv.className = 'update-status error';
        statusDiv.textContent = 'Failed to check for updates automatically. Click to retry.';
        actionsDiv.style.display = 'none';
    }
}