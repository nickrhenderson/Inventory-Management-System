// Google Drive backup controls
let googleDriveStatusCache = null;
let googleDriveMenuBound = false;
let googleDriveClockTimer = null;
const AUTO_BACKUP_STORAGE_KEY = 'inventory_google_drive_auto_backup';
const AUTO_BACKUP_DELAY_MS = 60 * 1000;
const AUTO_BACKUP_CHECK_INTERVAL_MS = 2 * 1000;
let autoBackupCheckTimer = null;
let autoBackupTimer = null;
let lastDatabaseRevision = null;
let autoBackupInProgress = false;
let autoBackupEnabled = false;
let autoBackupCountdownTimer = null;
let autoBackupDueAt = null;
let lastStatusFetchAt = 0;
const MIN_STATUS_REFRESH_INTERVAL_MS = 15 * 1000;

function getGoogleDriveButton() {
    return document.getElementById('googleDriveButton');
}

function getGoogleDriveMenu() {
    return document.getElementById('googleDriveMenu');
}

function getGoogleDriveMetaElement(action) {
    return document.querySelector(`[data-drive-meta="${action}"]`);
}

function getAutoBackupControl() {
    return document.getElementById('googleDriveAutoBackup');
}

function getAutoBackupCountdownElement() {
    return document.getElementById('googleDriveAutoBackupCountdown');
}

function updateAutoBackupCountdownDisplay() {
    const countdownEl = getAutoBackupCountdownElement();
    if (!countdownEl) return;

    if (!autoBackupDueAt || !isAutoBackupEnabled()) {
        countdownEl.textContent = '';
        countdownEl.classList.remove('active');
        return;
    }

    const remainingMs = autoBackupDueAt - Date.now();
    if (remainingMs <= 0) {
        countdownEl.textContent = '';
        countdownEl.classList.remove('active');
        return;
    }

    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    countdownEl.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
    countdownEl.classList.add('active');
}

function startAutoBackupCountdownDisplay() {
    if (autoBackupCountdownTimer) return;
    autoBackupCountdownTimer = window.setInterval(updateAutoBackupCountdownDisplay, 250);
    updateAutoBackupCountdownDisplay();
}

function stopAutoBackupCountdownDisplay() {
    if (autoBackupCountdownTimer) {
        window.clearInterval(autoBackupCountdownTimer);
        autoBackupCountdownTimer = null;
    }
    autoBackupDueAt = null;
    updateAutoBackupCountdownDisplay();
}

function isAutoBackupEnabled() {
    return autoBackupEnabled;
}

function updateAutoBackupControl() {
    const control = getAutoBackupControl();
    if (control) {
        control.checked = isAutoBackupEnabled();
    }
    if (!isAutoBackupEnabled()) {
        stopAutoBackupCountdownDisplay();
    }
}

function formatGoogleDriveTimestamp(timestamp) {
    if (!timestamp) {
        return 'No backup yet';
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return String(timestamp);
    }

    return date.toLocaleString([], {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
    });
}

function updateGoogleDriveMenuMetadata(status) {
    const downloadMeta = getGoogleDriveMetaElement('download');

    const latestBackup = status && status.latest_backup ? status.latest_backup : null;
    // The backup file is overwritten in place on each backup, so createdTime never
    // changes after the first upload; modifiedTime reflects the actual last backup.
    const latestBackupTime = latestBackup
        ? (latestBackup.modified_time || latestBackup.created_time)
        : null;

    if (downloadMeta) {
        downloadMeta.textContent = formatGoogleDriveTimestamp(latestBackupTime);
    }
}

function startGoogleDriveClock() {
    if (googleDriveClockTimer) {
        return;
    }

    googleDriveClockTimer = window.setInterval(() => {
        if (googleDriveMenuBound) {
            updateGoogleDriveMenuMetadata(googleDriveStatusCache || {});
        }
    }, 1000);
}

function showGoogleDriveInfo(title, message, onClose) {
    const isError = /error|fail/i.test(title);
    if (!isError && typeof window.notifySuccess === 'function') {
        window.notifySuccess(message);
        return;
    }
    if (isError && typeof window.notifyError === 'function') {
        window.notifyError(message);
        return;
    }
    if (typeof showInfoModal === 'function') {
        showInfoModal(title, message, 'OK', onClose);
    } else {
        alert(message);
    }
}

function showGoogleDriveConfirm(message, onConfirm) {
    if (typeof showThemedConfirmationModal === 'function') {
        showThemedConfirmationModal('Google Drive Backup', message, 'Continue', 'Cancel', onConfirm);
    } else if (confirm(message)) {
        onConfirm();
    }
}

function setGoogleDriveButtonState(status) {
    const button = getGoogleDriveButton();
    if (!button) return;

    const connected = Boolean(status && status.connected);
    const configured = Boolean(status && status.configured);

    button.dataset.connected = connected ? 'true' : 'false';
    button.dataset.configured = configured ? 'true' : 'false';
    button.classList.toggle('connected', connected);

    if (connected) {
        button.title = 'Google Drive connected';
    } else if (configured) {
        button.title = 'Connect Google Drive';
    } else {
        button.title = 'Connect Google Drive';
    }
}

function openGoogleDriveMenu() {
    const menu = getGoogleDriveMenu();
    if (!menu) return;
    menu.classList.add('show');
    menu.setAttribute('aria-hidden', 'false');

    // Refresh the latest-backup timestamp when reopening, but throttle so repeated
    // opens don't hammer the Drive API.
    if (Date.now() - lastStatusFetchAt >= MIN_STATUS_REFRESH_INTERVAL_MS) {
        refreshGoogleDriveStatus();
    }
}

function closeGoogleDriveMenu() {
    const menu = getGoogleDriveMenu();
    if (!menu) return;
    menu.classList.remove('show');
    menu.setAttribute('aria-hidden', 'true');
}

function toggleGoogleDriveMenu() {
    const menu = getGoogleDriveMenu();
    if (!menu) return;
    if (menu.classList.contains('show')) {
        closeGoogleDriveMenu();
    } else {
        openGoogleDriveMenu();
    }
}

async function refreshGoogleDriveStatus() {
    try {
        await waitForPywebview();
        const status = await pywebview.api.get_google_drive_status();
        lastStatusFetchAt = Date.now();
        googleDriveStatusCache = status || null;
        setGoogleDriveButtonState(status || {});
        updateGoogleDriveMenuMetadata(status || {});
        return status || {};
    } catch (error) {
        console.error('Failed to refresh Google Drive status:', error);
        googleDriveStatusCache = null;
        setGoogleDriveButtonState({ connected: false, configured: false });
        updateGoogleDriveMenuMetadata({});
        return { connected: false, configured: false };
    }
}

async function connectGoogleDrive() {
    try {
        await waitForPywebview();
        const response = await pywebview.api.connect_google_drive();
        if (response && response.success) {
            await refreshGoogleDriveStatus();
            return response;
        }
        throw new Error((response && response.message) || 'Failed to connect Google Drive');
    } catch (error) {
        console.error('Google Drive connect failed:', error);
        const message = error && error.message ? error.message : 'Failed to connect Google Drive';
        showGoogleDriveInfo('Google Drive Error', message);
        throw error;
    }
}

async function backupDatabaseToGoogleDrive(options = {}) {
    const silent = Boolean(options.silent);
    try {
        await waitForPywebview();
        const response = await pywebview.api.backup_database_to_google_drive();
        if (response && response.success) {
            await refreshGoogleDriveStatus();
            if (!silent) {
                closeGoogleDriveMenu();
                const message = response.message || 'Database backed up to Google Drive';
                showGoogleDriveInfo('Google Drive Backup', message);
            }
            return response;
        }
        throw new Error((response && response.message) || 'Backup failed');
    } catch (error) {
        console.error('Google Drive backup failed:', error);
        const message = error && error.message ? error.message : 'Backup failed';
        showGoogleDriveInfo('Google Drive Backup Error', message);
        throw error;
    }
}

function clearAutoBackupTimer() {
    if (autoBackupTimer) {
        window.clearTimeout(autoBackupTimer);
        autoBackupTimer = null;
    }
    stopAutoBackupCountdownDisplay();
}

function scheduleAutoBackup() {
    if (!isAutoBackupEnabled()) {
        return;
    }

    clearAutoBackupTimer();
    autoBackupDueAt = Date.now() + AUTO_BACKUP_DELAY_MS;
    startAutoBackupCountdownDisplay();
    autoBackupTimer = window.setTimeout(async () => {
        autoBackupTimer = null;
        stopAutoBackupCountdownDisplay();
        if (autoBackupInProgress || !isAutoBackupEnabled()) {
            return;
        }

        const status = googleDriveStatusCache || await refreshGoogleDriveStatus();
        if (!status.connected) {
            return;
        }

        autoBackupInProgress = true;
        try {
            await backupDatabaseToGoogleDrive({ silent: true });
        } catch (error) {
            console.error('Automatic Google Drive backup failed:', error);
        } finally {
            autoBackupInProgress = false;
        }
    }, AUTO_BACKUP_DELAY_MS);
}

async function checkForDatabaseChanges() {
    if (!isAutoBackupEnabled()) {
        return;
    }

    try {
        await waitForPywebview();
        const response = await pywebview.api.get_database_revision();
        const revision = response && response.success ? response.revision : null;
        if (!revision) {
            return;
        }

        if (lastDatabaseRevision === null) {
            lastDatabaseRevision = revision;
            return;
        }

        if (revision !== lastDatabaseRevision) {
            lastDatabaseRevision = revision;
            scheduleAutoBackup();
        }
    } catch (error) {
        console.error('Failed to check database changes for auto backup:', error);
    }
}

/**
 * Notify the auto-backup system that a database write just completed.
 * Called directly by mutation code paths (product/ingredient/group changes) so the
 * backup countdown starts immediately instead of waiting on the periodic revision poll.
 */
async function notifyDatabaseChanged() {
    if (!isAutoBackupEnabled()) {
        return;
    }

    try {
        await waitForPywebview();
        const response = await pywebview.api.get_database_revision();
        if (response && response.success && response.revision) {
            lastDatabaseRevision = response.revision;
        }
    } catch (error) {
        console.error('Failed to refresh database revision after change:', error);
    }

    scheduleAutoBackup();
}
window.notifyDatabaseChanged = notifyDatabaseChanged;

async function saveAutoBackupSetting(enabled) {
    try {
        await waitForPywebview();
        const response = await pywebview.api.set_google_drive_auto_backup_setting(enabled);
        if (!response || !response.success) {
            throw new Error((response && response.message) || 'Failed to save auto-backup setting');
        }
    } catch (error) {
        console.error('Failed to save auto-backup setting:', error);
    }
}

async function loadAutoBackupSetting() {
    try {
        await waitForPywebview();
        const response = await pywebview.api.get_google_drive_auto_backup_setting();
        if (response && response.success && typeof response.enabled === 'boolean') {
            autoBackupEnabled = response.enabled;
        } else {
            const legacyEnabled = window.localStorage && window.localStorage.getItem(AUTO_BACKUP_STORAGE_KEY) === 'true';
            autoBackupEnabled = Boolean(legacyEnabled);
            await saveAutoBackupSetting(autoBackupEnabled);
        }

        window.localStorage && window.localStorage.removeItem(AUTO_BACKUP_STORAGE_KEY);
    } catch (error) {
        console.error('Failed to load auto-backup setting:', error);
    }
}

async function initializeAutoBackup() {
    const control = getAutoBackupControl();
    await loadAutoBackupSetting();
    updateAutoBackupControl();

    if (control) {
        control.addEventListener('change', async () => {
            autoBackupEnabled = control.checked;
            await saveAutoBackupSetting(autoBackupEnabled);

            clearAutoBackupTimer();
            lastDatabaseRevision = null;
            if (control.checked) {
                checkForDatabaseChanges();
            }
        });
    }

    if (!autoBackupCheckTimer) {
        autoBackupCheckTimer = window.setInterval(checkForDatabaseChanges, AUTO_BACKUP_CHECK_INTERVAL_MS);
    }

    checkForDatabaseChanges();
}

async function downloadLatestGoogleDriveBackup() {
    showGoogleDriveConfirm('This will replace your current local database with the latest Google Drive backup. Continue?', async () => {
        try {
            await waitForPywebview();
            const response = await pywebview.api.download_latest_google_drive_backup();
            if (response && response.success) {
                closeGoogleDriveMenu();
                const message = response.message || 'Latest Google Drive backup downloaded and restored';
                if (typeof window.notifySuccess === 'function') {
                    window.notifySuccess(message);
                } else if (typeof showInfoModal === 'function') {
                    showInfoModal('Google Drive Backup', message, 'OK', () => {
                        window.location.reload();
                    });
                    return response;
                }
                // Reload after a short delay so the toast is visible
                setTimeout(() => window.location.reload(), 1200);
                return response;
            }
            throw new Error((response && response.message) || 'Restore failed');
        } catch (error) {
            console.error('Google Drive restore failed:', error);
            const message = error && error.message ? error.message : 'Restore failed';
            showGoogleDriveInfo('Google Drive Restore Error', message);
        }
    });
}

async function disconnectGoogleDrive() {
    try {
        await waitForPywebview();
        const response = await pywebview.api.disconnect_google_drive();
        if (response && response.success) {
            await refreshGoogleDriveStatus();
            closeGoogleDriveMenu();
            showGoogleDriveInfo('Google Drive', response.message || 'Signed out of Google Drive');
            return response;
        }
        throw new Error((response && response.message) || 'Failed to sign out of Google Drive');
    } catch (error) {
        console.error('Google Drive sign-out failed:', error);
        const message = error && error.message ? error.message : 'Failed to sign out of Google Drive';
        showGoogleDriveInfo('Google Drive Error', message);
        throw error;
    }
}

async function handleGoogleDriveButtonClick() {
    const status = googleDriveStatusCache || await refreshGoogleDriveStatus();
    if (!status.connected) {
        showGoogleDriveConfirm('Google Drive is not connected. Would you like to link your Google account now?', async () => {
            const response = await connectGoogleDrive();
            if (response && response.success) {
                openGoogleDriveMenu();
            }
        });
        return;
    }

    toggleGoogleDriveMenu();
}

function bindGoogleDriveMenuActions() {
    if (googleDriveMenuBound) return;
    googleDriveMenuBound = true;

    document.addEventListener('click', async function (event) {
        const button = event.target.closest('#googleDriveButton');
        const menuAction = event.target.closest('[data-drive-action]');
        const menu = getGoogleDriveMenu();

        try {
            if (menuAction) {
                const action = menuAction.dataset.driveAction;
                if (action === 'backup') {
                    await backupDatabaseToGoogleDrive();
                } else if (action === 'download') {
                    await downloadLatestGoogleDriveBackup();
                } else if (action === 'sign-out') {
                    showGoogleDriveConfirm('Sign out of Google Drive on this device? Your backups will remain in Google Drive.', async () => {
                        await disconnectGoogleDrive();
                    });
                }
                return;
            }

            if (button) {
                await handleGoogleDriveButtonClick();
                return;
            }

            if (menu && menu.classList.contains('show') && !event.target.closest('#googleDriveMenu')) {
                closeGoogleDriveMenu();
            }
        } catch (error) {
            console.error('Google Drive menu action failed:', error);
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeGoogleDriveMenu();
        }
    });
}

function initializeGoogleDriveControls() {
    bindGoogleDriveMenuActions();
    refreshGoogleDriveStatus();
    startGoogleDriveClock();
    initializeAutoBackup();
}

window.initializeGoogleDriveControls = initializeGoogleDriveControls;
window.refreshGoogleDriveStatus = refreshGoogleDriveStatus;
window.closeGoogleDriveMenu = closeGoogleDriveMenu;
window.openGoogleDriveMenu = openGoogleDriveMenu;
window.toggleGoogleDriveMenu = toggleGoogleDriveMenu;
window.handleGoogleDriveButtonClick = handleGoogleDriveButtonClick;
window.backupDatabaseToGoogleDrive = backupDatabaseToGoogleDrive;
window.downloadLatestGoogleDriveBackup = downloadLatestGoogleDriveBackup;
window.disconnectGoogleDrive = disconnectGoogleDrive;
