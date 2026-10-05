// Events tab logic
let currentTab = 'inventory';
let eventsCache = [];
let eventSelectedProducts = new Map();
let eventCollapsedStates = new Map();
let eventsSearchTerm = '';
let inventorySearchTerm = '';
let productsSearchTerm = '';

// Batched product-amount edits (products tab): changes are staged locally and
// applied together when the user confirms via the floating bar.
let batchPendingChanges = {};   // { product_name: newValue }
let batchPendingMax = {};       // { product_name: units_created cap }
let batchConfirmBarEl = null;
let batchConfirmCountEl = null;
let batchConfirmApplyBtn = null;
let batchConfirmCancelBtn = null;
let eventGroupObserver = null;
let eventsLoaded = false;
let eventsDirty = false;
let tabTransitionToken = 0;
let displayedTab = 'inventory';

const TAB_CONTENT_FADE_MS = 220;
const TAB_BOX_TRANSITION_MS = 320;

// ===== Event Memo Tooltip Implementation =====
let eventMemoTooltipEl = null;
let memoTooltipShowTimer = null;
const MEMO_TOOLTIP_DELAY_MS = 300;
const MEMO_EXCLUDED_SELECTORS = ['.event-collapse-btn', 'button', 'input'];
let lastMemoMouseEvent = null;
let memoTooltipAnchor = null;

function getEventGroupKey(ev) {
    return `${ev.event_title || 'Inventory event'}|${ev.event_date || ev.created_at || ''}`;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function resetTabTransitionClasses(...views) {
    views.forEach(view => {
        view.classList.remove('tab-content-hidden', 'tab-content-hidden-reverse', 'tab-collapsed');
    });
}

// Mark events as needing a refresh because the DB likely changed.
// If the user is currently on Events, refresh immediately; otherwise reload next time.
window.markEventsDirty = function () {
    eventsDirty = true;
    if (window.currentTab === 'events' && typeof refreshEvents === 'function') {
        refreshEvents();
    }
};

window.setActiveTab = setActiveTab;
window.openEventModal = openEventModal;
window.closeEventModal = closeEventModal;
window.filterEvents = filterEvents;
window.filterProductsList = filterProductsList;
window.refreshEvents = refreshEvents;
window.toggleContextMenuItemsForTab = toggleContextMenuItemsForTab;
window.renderProductsList = renderProductsList;
window.openPhoneConnectModal = openPhoneConnectModal;
window.closePhoneConnectModal = closePhoneConnectModal;
window.refreshPhoneConnectQr = refreshPhoneConnectQr;
window.stopPhoneConnect = stopPhoneConnect;
window.openEventEditModal = openEventEditModal;
window.closeEventEditModal = closeEventEditModal;
window.saveEventEdit = saveEventEdit;
window.openEventEditModalFromContext = openEventEditModalFromContext;
window.openBatchMemoModal = openBatchMemoModal;
window.closeBatchMemoModal = closeBatchMemoModal;
window.applyBatchMemo = applyBatchMemo;

/**
 * Initialize IntersectionObserver for event groups
 */
function initEventGroupObserver() {
    if (eventGroupObserver) {
        return eventGroupObserver;
    }
    
    const observerOptions = {
        root: document.getElementById('eventsList'),
        rootMargin: '50px',
        threshold: 0.01
    };
    
    eventGroupObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const group = entry.target;
                if (group.classList.contains('event-group-hidden')) {
                    animateEventGroupIn(group);
                }
                eventGroupObserver.unobserve(group);
            }
        });
    }, observerOptions);
    
    return eventGroupObserver;
}

/**
 * Cleanup event group observer
 */
function cleanupEventGroupObserver() {
    if (eventGroupObserver) {
        eventGroupObserver.disconnect();
        eventGroupObserver = null;
    }
}

/**
 * Animate event group in
 */
function animateEventGroupIn(group) {
    group.getBoundingClientRect();
    group.classList.remove('event-group-hidden');
    group.classList.add('event-group-animate-in');
    
    setTimeout(() => {
        group.classList.remove('event-group-animate-in');
    }, 500);
}

// Shake whichever product-change confirmation UI is showing: the memo modal,
// a confirmation modal, or the floating batch confirm bar.
function shakePendingConfirmation() {
    const memoBackdrop = document.getElementById('batchMemoModalBackdrop');
    const memoOpen = memoBackdrop && memoBackdrop.classList.contains('open');
    const target = (memoOpen && memoBackdrop.querySelector('.modal-content'))
        || document.querySelector('.confirmation-modal-backdrop .modal-content')
        || (batchConfirmBarEl && batchConfirmBarEl.classList.contains('show') ? batchConfirmBarEl : null);
    if (!target) return;
    target.classList.remove('shake');
    void target.offsetWidth; // restart the animation
    target.classList.add('shake');
    setTimeout(() => target.classList.remove('shake'), 650);
}

function hasPendingProductChanges() {
    if (document.querySelector('.confirmation-modal-backdrop')) return true;
    const memoBackdrop = document.getElementById('batchMemoModalBackdrop');
    if (memoBackdrop && memoBackdrop.classList.contains('open')) return true;
    if (Object.keys(batchPendingChanges).length > 0) return true;
    if (typeof currentEditingProductId !== 'undefined' && currentEditingProductId !== null
        && typeof pendingAmountChanges !== 'undefined' && pendingAmountChanges.has(currentEditingProductId)) {
        const change = pendingAmountChanges.get(currentEditingProductId);
        return change.originalAmount !== change.newAmount;
    }
    return false;
}

function isTabSwitchBlocked() {
    if (!hasPendingProductChanges()) return false;
    // A confirmation modal may still be mounting from the same click.
    setTimeout(shakePendingConfirmation, 50);
    return true;
}

function setActiveTab(tab) {
    if (tab !== displayedTab && isTabSwitchBlocked()) return;

    const transitionId = ++tabTransitionToken;
    const previousTab = displayedTab;
    currentTab = tab;
    window.currentTab = tab;

    const inventoryView = document.getElementById('inventoryView');
    const productsView = document.getElementById('productsView');
    const eventsView = document.getElementById('eventsView');
    const views = { inventory: inventoryView, products: productsView, events: eventsView };
    const nextView = views[tab];
    const previousView = views[previousTab];
    const tabs = document.querySelectorAll('#mainTabs .tab');
    tabs.forEach(tabButton => tabButton.classList.toggle('active', tabButton.dataset.tab === tab));

    if (!inventoryView || !productsView || !eventsView || !previousView || !nextView) {
        return;
    }

    resetTabTransitionClasses(inventoryView, productsView, eventsView);
    Object.entries(views).forEach(([tabName, view]) => {
        view.style.display = tabName === previousTab ? 'flex' : 'none';
    });

    if (previousTab === tab) {
        updateSearchBar();
        toggleContextMenuItemsForTab(tab);
        return;
    }

    if (previousTab === 'inventory') {
        const searchBar = document.querySelector('.search-bar');
        if (searchBar) inventorySearchTerm = searchBar.value;
    }

    previousView.classList.add(previousTab === 'inventory' ? 'tab-content-hidden' : 'tab-content-hidden-reverse');

    (async () => {
        await wait(TAB_CONTENT_FADE_MS);
        if (transitionId !== tabTransitionToken) return;

        if (previousTab === 'inventory') {
            inventoryView.classList.add('tab-collapsed');
            await wait(TAB_BOX_TRANSITION_MS);
            if (transitionId !== tabTransitionToken) return;
        }

        previousView.style.display = 'none';
        previousView.classList.remove('tab-content-hidden', 'tab-content-hidden-reverse', 'tab-collapsed');

        nextView.style.display = 'flex';
        displayedTab = tab;
        nextView.classList.add(tab === 'inventory' ? 'tab-collapsed' : 'tab-content-hidden');
        if (tab === 'inventory') nextView.classList.add('tab-content-hidden-reverse');
        updateSearchBar();
        toggleContextMenuItemsForTab(tab);

        if (tab === 'products') {
            renderProductsList();
        } else if (tab === 'events' && (!eventsLoaded || eventsDirty)) {
            loadEvents();
        }

        await nextFrame();
        if (transitionId !== tabTransitionToken) return;

        if (tab === 'inventory') {
            await nextFrame();
            nextView.classList.remove('tab-collapsed');
            await wait(TAB_BOX_TRANSITION_MS);
            if (transitionId !== tabTransitionToken) return;
            nextView.classList.remove('tab-content-hidden-reverse');
        } else {
            nextView.classList.remove('tab-content-hidden');
        }
    })();
}

/**
 * Downscale an image data-URL onto a canvas and invoke `done` with a smaller
 * JPEG data URL. Phone camera photos can be multi-MB; shrinking the longest
 * edge to ~1200px keeps the base64 payload small before it goes over the
 * pywebview bridge. Falls back to the original data URL if it can't be drawn.
 */
function downscaleImageData(dataUrl, done) {
    const img = new Image();
    const fallback = () => done(dataUrl);
    img.onload = () => {
        try {
            const MAX = 1200;
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            done(canvas.toDataURL('image/jpeg', 0.82));
        } catch (err) {
            fallback();
        }
    };
    img.onerror = fallback;
    img.src = dataUrl;
}

// Cache the floating confirm-bar DOM references and wire its buttons once.
function initBatchConfirmBar() {
    if (batchConfirmBarEl) return; // already initialized

    batchConfirmBarEl = document.getElementById('batchConfirmBar');
    batchConfirmCountEl = document.getElementById('batchConfirmCount');
    batchConfirmApplyBtn = document.getElementById('batchConfirmApply');
    batchConfirmCancelBtn = document.getElementById('batchConfirmCancel');

    if (!batchConfirmBarEl) return;

    batchConfirmApplyBtn.addEventListener('click', applyBatchPendingChanges);
    batchConfirmCancelBtn.addEventListener('click', discardBatchPendingChanges);
    refreshBatchConfirmBar();
}

async function renderProductsList() {
    const list = document.getElementById('productsList');
    if (!list) return;

    initBatchConfirmBar();

    try {
        await waitForPywebview();
        const products = (await pywebview.api.get_product_totals()).filter(product =>
            product.product_name.toLowerCase().includes(productsSearchTerm)
        );
        if (products.length === 0) {
            const message = productsSearchTerm ? 'No matching products.' : 'Create a batch to add products.';
            list.innerHTML = `<div class="empty-state-message"><h3>No Products</h3><p>${message}</p></div>`;
            return;
        }

        list.innerHTML = '<div class="product-list"></div>';
        const productList = list.querySelector('.product-list');

        products.forEach((product, index) => {
            const card = document.createElement('article');
            card.className = 'product-card';
            card.innerHTML = `
                <div class="product-image-placeholder product-image-button" data-product-index="${index}" aria-label="Click to upload product image">
                    <span class="image-placeholder-text">IMG</span>
                    <span class="image-overlay">
                        <img src="img/svg/edit.svg" alt="Edit" />
                    </span>
                    <input type="file" accept="image/*" class="product-image-input" style="display:none;" />
                </div>
                <div class="product-card-name"></div>
                <div class="amount-controls product-amount-controls" data-product-index="${index}">
                    <button class="amount-button minus" type="button" title="Decrease amount">
                        <div class="amount-icon">
                            <img src="img/svg/minus.svg" alt="Decrease" />
                        </div>
                    </button>
                    <input type="number" class="amount-input" value="${batchPendingChanges.hasOwnProperty(product.product_name) ? batchPendingChanges[product.product_name] : product.amount_on_hand}" min="0" step="1" aria-label="Amount on hand">
                    <button class="amount-button plus" type="button" title="Increase amount">
                        <div class="amount-icon">
                            <img src="img/svg/plus.svg" alt="Increase" />
                        </div>
                    </button>
                </div>
            `;
            const productName = card.querySelector('.product-card-name');
            productName.textContent = product.product_name;
            productName.title = product.product_name;

            // Wire up the image upload button for this card.
            const imageBox = card.querySelector('.product-image-button');
            const fileInput = imageBox.querySelector('.product-image-input');
            const placeholderText = imageBox.querySelector('.image-placeholder-text');

            // If a stored image exists, display it.
            pywebview.api.get_product_image_path(product.product_name).then((res) => {
                if (res && res.image_path) {
                    // res.image_path is an absolute file path from the backend.
                    // Append a cache-busting query so a replaced image (same
                    // filename) is re-fetched instead of showing a stale copy.
                    const t = Date.now();
                    const fileUrl = 'file:///' + String(res.image_path).replace(/\\/g, '/') + '?t=' + t;
                    // Set the image on the ::before layer (see .product-image-placeholder::before)
                    // so the blur on hover covers the image exactly.
                    imageBox.style.setProperty('--product-image', `url('${fileUrl}')`);
                    imageBox.classList.add('has-image');
                    if (placeholderText) placeholderText.textContent = '';
                }
            }).catch(() => {});

            imageBox.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async () => {
                const file = fileInput.files && fileInput.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    // Downscale large photos (phone camera shots can be multi-MB)
                    // to keep the base64 payload small before sending it over the
                    // pywebview bridge.
                    downscaleImageData(reader.result, saveImageData);
                };
                reader.onerror = () => {
                    window.notifyError?.('Could not read the selected image.');
                };
                reader.readAsDataURL(file);
                setTimeout(() => { fileInput.value = ''; }, 100);
            });

            async function saveImageData(dataUrl) {
                try {
                    const result = await pywebview.api.save_product_image(product.product_name, dataUrl);
                    if (!result.success) {
                        window.notifyError?.(result.message || 'Failed to upload image');
                    } else {
                        await window.renderProductsList();
                    }
                } catch (err) {
                    window.notifyError?.(err.message || 'Failed to upload image');
                }
            }

            productList.appendChild(card);
        });

        list.querySelectorAll('.product-amount-controls').forEach(controls => {
            const product = products[Number(controls.dataset.productIndex)];
            const input = controls.querySelector('.amount-input');
            const minusButton = controls.querySelector('.minus');
            const plusButton = controls.querySelector('.plus');

            // Stage a change locally instead of saving immediately. Reverting a
            // value back to the server value removes it from the pending set.
            const stageAmountChange = requestedAmount => {
                const serverValue = Number(product.amount_on_hand);
                const normalizedAmount = Math.max(0, parseInt(requestedAmount, 10) || 0);
                const maximumAmount = Number(product.units_created) || 0;

                if (normalizedAmount > maximumAmount) {
                    input.value = batchPendingChanges.hasOwnProperty(product.product_name)
                        ? batchPendingChanges[product.product_name]
                        : serverValue;
                    window.notifyError?.(`Amount on hand cannot exceed the ${maximumAmount} units created for ${product.product_name}.`);
                    return;
                }

                if (normalizedAmount === serverValue) {
                    delete batchPendingChanges[product.product_name];
                    delete batchPendingMax[product.product_name];
                } else {
                    batchPendingChanges[product.product_name] = normalizedAmount;
                    batchPendingMax[product.product_name] = maximumAmount;
                }
                input.value = normalizedAmount;
                refreshBatchConfirmBar();
            };

            minusButton.addEventListener('click', () => stageAmountChange((parseInt(input.value, 10) || 0) - 1));
            plusButton.addEventListener('click', () => stageAmountChange((parseInt(input.value, 10) || 0) + 1));
            input.addEventListener('change', () => stageAmountChange(input.value));
        });
    } catch (error) {
        console.error('Failed to load product totals', error);
        list.innerHTML = '<div class="empty-state-message">Failed to load products.</div>';
    }
}

// Show/hide the floating confirm bar and its change count. Uses the .show
// class so CSS can animate the bar growing in/out smoothly.
function refreshBatchConfirmBar() {
    const keys = Object.keys(batchPendingChanges);
    if (!batchConfirmBarEl) return;
    if (keys.length === 0) {
        batchConfirmBarEl.classList.remove('show');
    } else {
        batchConfirmBarEl.classList.add('show');
    }
    if (batchConfirmCountEl) {
        batchConfirmCountEl.textContent = keys.length === 1 ? '1 change' : `${keys.length} changes`;
    }
}

// Confirming the batched edits first asks for an event memo so the adjustment
// is coded as discrete events (one per changed product) carrying that memo
// instead of all being lumped into the same title/memo.
async function applyBatchPendingChanges() {
    const keys = Object.keys(batchPendingChanges);
    if (!keys.length) return;

    openBatchMemoModal();
}

// Open the memo prompt modal before applying the batched product changes.
function openBatchMemoModal() {
    const backdrop = document.getElementById('batchMemoModalBackdrop');
    const input = document.getElementById('batchMemoInput');
    if (!backdrop) return;
    if (input) input.value = '';
    backdrop.style.display = 'flex';
    requestAnimationFrame(() => backdrop.classList.add('open'));
    if (input) {
        requestAnimationFrame(() => input.focus());
    }
}

// Dismiss the memo prompt modal without applying changes.
function closeBatchMemoModal() {
    const backdrop = document.getElementById('batchMemoModalBackdrop');
    if (!backdrop) return;
    backdrop.classList.remove('open');
    setTimeout(() => {
        backdrop.style.display = 'none';
    }, 300);
}

// Apply every staged amount change sequentially, attaching the memo to each
// event created, then refresh the UI.
async function applyBatchMemo() {
    const memo = (document.getElementById('batchMemoInput')?.value || '').trim();
    const keys = Object.keys(batchPendingChanges);
    if (!keys.length) return;

    const applyBtn = document.getElementById('batchMemoApplyBtn');
    const cancelBtn = backdropCancelButton();
    if (applyBtn) {
        applyBtn.disabled = true;
    }
    if (cancelBtn) {
        cancelBtn.disabled = true;
    }

    try {
        for (const name of keys) {
            const result = await pywebview.api.update_product_total(name, batchPendingChanges[name], memo);
            if (!result.success) {
                throw new Error(result.message || `Failed to update ${name}.`);
            }
        }
        batchPendingChanges = {};
        batchPendingMax = {};
        refreshBatchConfirmBar();
        closeBatchMemoModal();
        await loadProductsData();
        window.markEventsDirty?.();
        await window.renderProductsList();
        if (window.notifySuccess) window.notifySuccess(`Saved ${keys.length} change${keys.length > 1 ? 's' : ''}.`);
    } catch (error) {
        window.notifyError?.(error.message || 'Failed to save changes.');
        refreshBatchConfirmBar();
    } finally {
        if (applyBtn) applyBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
    }
}

// Find the cancel button inside the memo prompt modal.
function backdropCancelButton() {
    const backdrop = document.getElementById('batchMemoModalBackdrop');
    return backdrop ? backdrop.querySelector('.modal-button.cancel') : null;
}

// Discard all staged edits and re-render from server values.
function discardBatchPendingChanges() {
    batchPendingChanges = {};
    batchPendingMax = {};
    refreshBatchConfirmBar();
    renderProductsList();
}

function filterProductsList(searchTerm) {
    productsSearchTerm = (searchTerm || '').toLowerCase();
    renderProductsList();
}

function setPhoneConnectStatus(message, type = '') {
    const status = document.getElementById('phoneConnectStatus');
    if (status) {
        status.textContent = message || '';
        status.className = `phone-connect-status ${type || ''}`.trim();
    }
}

async function openPhoneConnectModal() {
    const modal = document.getElementById('phoneConnectModalBackdrop');
    if (!modal) return;

    modal.classList.add('open');
    setPhoneConnectStatus('Starting live server...', 'info');

    try {
        await waitForPywebview();
        const startRes = await pywebview.api.live_server_start();
        if (!startRes || !startRes.success) {
            throw new Error(startRes?.message || 'Failed to start live server');
        }

        // Start watching the DB for phone-driven changes so the desktop UI auto-refreshes
        if (typeof window.startLiveChangeWatching === 'function') {
            window.startLiveChangeWatching();
        }

        const qrRes = await pywebview.api.live_server_qr_svg();
        if (!qrRes || !qrRes.success) {
            throw new Error(qrRes?.message || 'Failed to generate QR code');
        }

        const qrContainer = document.getElementById('phoneConnectQr');
        if (qrContainer) {
            qrContainer.innerHTML = qrRes.svg;
            const svg = qrContainer.querySelector('svg');
            if (svg) svg.setAttribute('width', '320');
            if (svg) svg.setAttribute('height', '320');
        }

        const stopButton = document.getElementById('phoneConnectStop');
        if (stopButton) stopButton.style.display = '';
        setPhoneConnectStatus(
            `Open your phone camera and scan this code, then visit ${qrRes.url}`,
            'info'
        );
    } catch (error) {
        console.error('Failed to open phone connect:', error);
        setPhoneConnectStatus(error.message || 'Failed to open phone connect', 'error');
        const qrContainer = document.getElementById('phoneConnectQr');
        if (qrContainer) qrContainer.innerHTML = '';
    }
}

async function refreshPhoneConnectQr() {
    setPhoneConnectStatus('Generating new code...', 'info');
    try {
        await waitForPywebview();
        const startRes = await pywebview.api.live_server_start();
        if (!startRes || !startRes.success) {
            throw new Error(startRes?.message || 'Failed to restart live server');
        }
        // Keep watching the DB for phone-driven changes
        if (typeof window.startLiveChangeWatching === 'function') {
            window.startLiveChangeWatching();
        }
        const qrRes = await pywebview.api.live_server_qr_svg();
        if (!qrRes || !qrRes.success) {
            throw new Error(qrRes?.message || 'Failed to generate QR code');
        }
        const qrContainer = document.getElementById('phoneConnectQr');
        if (qrContainer) {
            qrContainer.innerHTML = qrRes.svg;
            const svg = qrContainer.querySelector('svg');
            if (svg) svg.setAttribute('width', '320');
            if (svg) svg.setAttribute('height', '320');
        }
        const stopButton = document.getElementById('phoneConnectStop');
        if (stopButton) stopButton.style.display = '';
        setPhoneConnectStatus(`Scan this new code. URL: ${qrRes.url}`, 'info');
    } catch (error) {
        console.error('Failed to refresh phone connect QR:', error);
        setPhoneConnectStatus(error.message || 'Failed to generate a new code', 'error');
    }
}

async function stopPhoneConnect() {
    try {
        await waitForPywebview();
        const res = await pywebview.api.live_server_stop();
        if (!res || !res.success) {
            throw new Error(res?.message || 'Failed to stop live server');
        }
        const qrContainer = document.getElementById('phoneConnectQr');
        if (qrContainer) qrContainer.innerHTML = '';
        const stopButton = document.getElementById('phoneConnectStop');
        if (stopButton) stopButton.style.display = 'none';
        setPhoneConnectStatus('Live server stopped. The code no longer works.', 'info');
    } catch (error) {
        console.error('Failed to stop live server:', error);
        setPhoneConnectStatus(error.message || 'Failed to stop live server', 'error');
    }
}

function closePhoneConnectModal() {
    document.getElementById('phoneConnectModalBackdrop')?.classList.remove('open');
}

function updateSearchBar() {
    const searchBar = document.querySelector('.search-bar');
    if (searchBar) {
        searchBar.placeholder = 'Search...';
        if (currentTab === 'events') {
            searchBar.value = eventsSearchTerm;
        } else if (currentTab === 'products') {
            searchBar.value = productsSearchTerm;
        } else {
            searchBar.value = inventorySearchTerm;
        }
    }
}

function toggleContextMenuItemsForTab(tab) {
    const invOnly = document.querySelectorAll('.context-menu-item.inventory-only');
    const productOnly = document.querySelectorAll('.context-menu-item.products-only');
    const evtOnly = document.querySelectorAll('.context-menu-item.events-only');
    invOnly.forEach(el => el.style.display = tab === 'inventory' ? '' : 'none');
    productOnly.forEach(el => el.style.display = tab === 'products' ? '' : 'none');
    evtOnly.forEach(el => el.style.display = tab === 'events' ? '' : 'none');
}

async function loadEvents() {
    try {
        await waitForPywebview();
        const res = await pywebview.api.get_inventory_events(200);
        eventsCache = res || [];
        // Initial render can animate
        filterEvents(eventsSearchTerm, { animate: true });

        eventsLoaded = true;
        eventsDirty = false;
    } catch (e) {
        console.error('Failed to load events', e);
        const list = document.getElementById('eventsList');
        if (list) list.innerHTML = '<div class="empty-state-message">Failed to load events.</div>';
    }
}

/**
 * Refresh events data (called by refresh button)
 */
async function refreshEvents() {
    console.log('Refreshing events data...');
    
    try {
        await waitForPywebview();
        const res = await pywebview.api.get_inventory_events(200);
        eventsCache = res || [];
        
        // Refresh render can animate
        filterEvents(eventsSearchTerm, { animate: true });

        eventsDirty = false;
    } catch (e) {
        console.error('Failed to refresh events', e);
        const list = document.getElementById('eventsList');
        if (list) list.innerHTML = '<div class="empty-state-message">Failed to refresh events.</div>';
    }
}

function filterEvents(searchTerm, options = {}) {
    const { animate = false } = options;
    eventsSearchTerm = (searchTerm || '').toLowerCase();
    
    if (!eventsSearchTerm) {
        renderEventsList(eventsCache, animate);
        return;
    }
    
    // Filter events by event title, product name, or date
    const filtered = eventsCache.filter(ev => {
        const titleMatch = (ev.event_title || '').toLowerCase().includes(eventsSearchTerm);
        const productMatch = (ev.product_name || '').toLowerCase().includes(eventsSearchTerm);
        
        // Format date as MM/DD/YYYY for searching
        let dateMatch = false;
        const dateStr = ev.event_date || ev.created_at || '';
        if (dateStr) {
            // Check original format
            if (dateStr.toLowerCase().includes(eventsSearchTerm)) {
                dateMatch = true;
            }
            // Check MM/DD/YYYY format
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
                const [year, month, day] = dateStr.split('-');
                const formattedDate = `${month}/${day}/${year}`;
                if (formattedDate.includes(eventsSearchTerm)) {
                    dateMatch = true;
                }
            }
        }
        
        return titleMatch || productMatch || dateMatch;
    });
    
    // While searching, do not animate each re-render (prevents fade on every keystroke)
    renderEventsList(filtered, animate);
}

function renderEventsList(events, animate = true) {
    const list = document.getElementById('eventsList');
    if (!list) return;

    // Cleanup previous observer (only used for animated entrance)
    cleanupEventGroupObserver();
    
    if (!events || events.length === 0) {
        list.innerHTML = `
            <div class="empty-state-message">
                <h3>No Events</h3>
                <div class="empty-state-divider"></div>
                <p>Open Events and select "Add Event" to create one.</p>
            </div>
        `;
        return;
    }
    
    // Group events by title and date
    const eventGroups = new Map();
    events.forEach(ev => {
        const key = getEventGroupKey(ev);
        if (!eventGroups.has(key)) {
            eventGroups.set(key, []);
        }
        eventGroups.get(key).push(ev);
    });
    
    // Render each event group
    let html = '';
    eventGroups.forEach((groupEvents, key) => {
        const title = groupEvents[0].event_title || 'Inventory event';
        const dateStr = groupEvents[0].event_date || groupEvents[0].created_at || '';
        const groupId = key;
        const isCollapsed = eventCollapsedStates.get(groupId) || false;
        
        // Format date as MM/DD/YYYY
        let formattedDate = dateStr;
        if (dateStr && dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
            const [year, month, day] = dateStr.split('-');
            formattedDate = `${month}/${day}/${year}`;
        }
        
        // Calculate totals
        let totalAdded = 0;
        let totalRemoved = 0;
        groupEvents.forEach(ev => {
            if (ev.delta > 0) totalAdded += ev.delta;
            else totalRemoved += Math.abs(ev.delta);
        });
        
        // Memo: prefer the most recently created event's memo within the group
        const memo = groupEvents.find(ev => ev.memo)?.memo || '';
        const memoAttr = memo ? ` data-memo="${escapeHtml(memo).replace(/"/g, '&quot;')}"` : '';

        const groupClass = animate ? 'event-group event-group-hidden' : 'event-group';
        html += `
            <div class="${groupClass}" data-event-id="${groupId}">
                <div class="event-group-header" onclick="toggleEventCollapse('${groupId}')"${memoAttr}>
                    <button class="event-collapse-btn" type="button">
                        <svg class="event-arrow ${isCollapsed ? 'collapsed' : ''}" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <div class="event-group-info">
                        <div class="event-group-title">${title}</div>
                        <div class="event-group-meta">${formattedDate} • ${groupEvents.length} product${groupEvents.length > 1 ? 's' : ''}</div>
                    </div>
                    <div class="event-group-summary">
                        ${totalAdded > 0 ? `<span class="event-summary-add">+${totalAdded}</span>` : ''}
                        ${totalRemoved > 0 ? `<span class="event-summary-remove">-${totalRemoved}</span>` : ''}
                    </div>
                </div>
        `;
        
        if (!isCollapsed) {
            html += '<div class="event-group-content">';
            groupEvents.forEach(ev => {
                const isAdd = ev.delta > 0;
                const cls = isAdd ? 'event-product-row add' : 'event-product-row remove';
                const deltaText = (isAdd ? '+' : '') + ev.delta;
                const batchText = ev.batch_number ? ` <span class="event-batch-id">${ev.batch_number}</span>` : '';
                html += `
                    <div class="${cls}">
                        <div class="event-product-name">${ev.product_name || 'Unknown product'}${batchText}</div>
                        <div class="event-product-delta">${deltaText}</div>
                    </div>
                `;
            });
            html += '</div>';
        }
        
        html += '</div>';
    });
    
    list.innerHTML = html;

    // Attach memo tooltip event listeners
    attachMemoTooltipListeners();

    // Animate event groups in (only when explicitly requested, e.g. initial load/refresh)
    if (animate) {
        setTimeout(() => {
            const observer = initEventGroupObserver();
            const groups = document.querySelectorAll('.event-group');
            groups.forEach(group => {
                observer.observe(group);
            });
        }, 0);
    }
}

function toggleEventCollapse(eventId) {
    const currentState = eventCollapsedStates.get(eventId) || false;
    const newState = !currentState;
    eventCollapsedStates.set(eventId, newState);
    
    // Update the DOM directly without re-rendering
    const group = document.querySelector(`.event-group[data-event-id="${eventId}"]`);
    if (!group) return;
    
    const arrow = group.querySelector('.event-arrow');
    const content = group.querySelector('.event-group-content');
    
    if (newState) {
        // Collapse
        if (arrow) arrow.classList.add('collapsed');
        if (content) content.remove();
    } else {
        // Expand
        if (arrow) arrow.classList.remove('collapsed');
        
        // Rebuild content from cache
        const key = eventId;
        const groupEvents = eventsCache.filter(ev => {
            const evKey = getEventGroupKey(ev);
            return evKey === key;
        });
        
        let contentHtml = '<div class="event-group-content">';
        groupEvents.forEach(ev => {
            const isAdd = ev.delta > 0;
            const cls = isAdd ? 'event-product-row add' : 'event-product-row remove';
            const deltaText = (isAdd ? '+' : '') + ev.delta;
            const batchText = ev.batch_number ? ` <span class="event-batch-id">${ev.batch_number}</span>` : '';
            contentHtml += `
                <div class="${cls}">
                    <div class="event-product-name">${ev.product_name || 'Unknown product'}${batchText}</div>
                    <div class="event-product-delta">${deltaText}</div>
                </div>
            `;
        });
        contentHtml += '</div>';
        
        group.querySelector('.event-group-header').insertAdjacentHTML('afterend', contentHtml);
    }
}

function openEventModal() {
    const backdrop = document.getElementById('eventModalBackdrop');
    if (!backdrop) return;
    // Show backdrop with same open class behavior as other modals
    backdrop.style.display = 'flex';
    requestAnimationFrame(() => backdrop.classList.add('open'));
    const dateInput = document.getElementById('eventDate');
    if (dateInput) {
        const today = new Date().toISOString().slice(0,10);
        dateInput.value = today;
    }
    initializeEventProductSelector();
    backdrop.style.display = 'flex';
}

function closeEventModal() {
    const backdrop = document.getElementById('eventModalBackdrop');
    if (backdrop) {
        backdrop.classList.remove('open');
        setTimeout(() => { backdrop.style.display = 'none'; }, 250);
    }
}

async function initializeEventProductSelector() {
    if (!window.allProductsData || window.allProductsData.length === 0) {
        await loadProductsData();
    }
    const selector = document.getElementById('eventProductSelector');
    const selectedContainer = document.getElementById('selectedEventProducts');
    if (!selector || !selectedContainer) return;
    // reset state and UI
    eventSelectedProducts = new Map();
    selectedContainer.innerHTML = '';
    displayEventProductSelector(window.allProductsData || []);
}

function displayEventProductSelector(products) {
    const selector = document.getElementById('eventProductSelector');
    if (!selector || products.length === 0) {
        if (selector) selector.innerHTML = '';
        return;
    }
    
    let selectorHTML = '';
    products.forEach(product => {
        selectorHTML += `
            <div class="event-product-option" onclick="toggleEventProductSelection(${product.id})">
                <input type="checkbox" id="event-product-${product.id}" onchange="handleEventProductChange(${product.id})">
                <div>
                    <strong>${product.product_name}</strong>
                    <div style="font-size: 0.9em; color: var(--text-gray);">Stock: ${product.amount || 0}</div>
                </div>
            </div>
        `;
    });
    
    selector.innerHTML = selectorHTML;
}

function toggleEventProductSelection(productId) {
    const checkbox = document.getElementById(`event-product-${productId}`);
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        handleEventProductChange(productId);
    }
}

function handleEventProductChange(productId) {
    const checkbox = document.getElementById(`event-product-${productId}`);
    
    if (checkbox.checked) {
        const product = (window.allProductsData || []).find(p => p.id === productId);
        if (product) {
            addSelectedEventProduct(product);
        }
    } else {
        const existingItem = document.getElementById(`selected-event-${productId}`);
        if (existingItem) {
            existingItem.remove();
        }
        eventSelectedProducts.delete(String(productId));
    }
}

// Submit event form
 document.addEventListener('submit', async (e) => {
    if (e.target && e.target.id === 'eventForm') {
        e.preventDefault();
        try {
            const dateVal = document.getElementById('eventDate')?.value;
            const titleVal = document.getElementById('eventTitle')?.value || 'Inventory event';
            const memoVal = document.getElementById('eventMemo')?.value || '';
            if (!window.allProductsData || window.allProductsData.length === 0) {
                await loadProductsData();
            }
            const productMap = new Map((window.allProductsData || []).map(p => [String(p.id), p]));
            const amountInputs = Array.from(document.querySelectorAll('.event-selected-amount'));
            const events = [];
            for (const input of amountInputs) {
                const productId = input.dataset.productId;
                const raw = input.value || '0';
                const amt = parseInt(raw, 10);
                if (!productId || amt === 0 || Number.isNaN(amt)) continue;
                const product = productMap.get(productId);
                const currentStock = product ? (product.amount || 0) : 0;
                const delta = amt; // positive adds, negative removes
                if (delta < 0 && currentStock + delta < 0) {
                    throw new Error(`Cannot remove ${Math.abs(delta)}; only ${currentStock} in stock for ${product?.product_name || 'product'}`);
                }
                events.push({ product_id: Number(productId), delta });
            }
            if (events.length === 0) throw new Error('No valid product entries.');
            await waitForPywebview();
            const res = await pywebview.api.add_inventory_events(events, titleVal, dateVal, memoVal);
            if (!res || !res.success) throw new Error(res?.error || 'Failed to add event');
            closeEventModal();
            await loadProductsData();
            if (typeof window.markEventsDirty === 'function') {
                window.markEventsDirty();
            }
            if (window.notifySuccess) window.notifySuccess('Event added successfully.');
        } catch (err) {
            if (window.notifyError) {
                window.notifyError(err.message || 'Failed to add event');
            } else {
                alert(err.message || 'Failed to add event');
            }
        }
    }
});

// Submit edit event form
 document.addEventListener('submit', async (e) => {
    if (e.target && e.target.id === 'eventEditForm') {
        e.preventDefault();
        try {
            await saveEventEdit();
        } catch (err) {
            if (window.notifyError) {
                window.notifyError(err.message || 'Failed to update event');
            } else {
                alert(err.message || 'Failed to update event');
            }
        }
    }
});

// Tab click handling
 document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('#mainTabs .tab');
    if (tabBtn) {
        setActiveTab(tabBtn.dataset.tab);
    }

    // Ensure the events-only context menu item reliably opens the modal
    if (e.target.closest('.context-menu-item.events-only') && !e.target.closest('#editEventMenuItem')) {
        openEventModal();
        hideContextMenu();
    }
});

function addSelectedEventProduct(product) {
    const selectedContainer = document.getElementById('selectedEventProducts');
    if (!selectedContainer) return;
    const productId = String(product.id);
    
    // Check if already exists
    if (document.getElementById(`selected-event-${productId}`)) {
        return;
    }
    
    eventSelectedProducts.set(productId, { product, amount: 0 });
    
    const itemHTML = `
        <div class="selected-event-product-item" id="selected-event-${productId}">
            <div class="selected-event-product-info">
                <strong>${product.product_name}</strong>
                <div style="font-size: 0.9em; color: var(--text-gray);">Stock: ${product.amount || 0}</div>
            </div>
            <div class="selected-event-product-quantity">
                <input type="number" 
                       step="1" 
                       placeholder="0" 
                       id="event-quantity-${productId}"
                       class="event-selected-amount"
                       data-product-id="${productId}"
                       required>
                <span>units (+ or -)</span>
            </div>
        </div>
    `;
    
    selectedContainer.insertAdjacentHTML('beforeend', itemHTML);
}

/**
 * Escape HTML entities so user-provided memo text cannot break the DOM.
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/**
 * Ensure the memo tooltip DOM element exists
 */
function ensureMemoTooltipElement() {
    if (!eventMemoTooltipEl) {
        eventMemoTooltipEl = document.createElement('div');
        eventMemoTooltipEl.className = 'event-memo-tooltip';
        document.body.appendChild(eventMemoTooltipEl);
    }
    return eventMemoTooltipEl;
}

/**
 * Handle mouse enter on event group header with memo
 */
function handleEventHeaderMouseEnter(e) {
    const header = e.currentTarget;
    const memo = header.dataset.memo;
    if (!memo) return;

    lastMemoMouseEvent = e;
    clearTimeout(memoTooltipShowTimer);
    memoTooltipShowTimer = setTimeout(async () => {
        const ev = lastMemoMouseEvent || e;
        await maybeShowMemoTooltip(header, memo, ev);
    }, MEMO_TOOLTIP_DELAY_MS);
}

/**
 * Handle mouse move on event group header
 */
function handleEventHeaderMouseMove(e) {
    lastMemoMouseEvent = e;
    if (!eventMemoTooltipEl || !eventMemoTooltipEl.classList.contains('visible')) return;
    if (shouldSuppressMemoTooltip(e)) {
        hideMemoTooltip();
        return;
    }
    positionMemoTooltip(e.clientX, e.clientY);
}

/**
 * Handle mouse leave on event group header
 */
function handleEventHeaderMouseLeave() {
    clearTimeout(memoTooltipShowTimer);
    hideMemoTooltip();
}

/**
 * Check if tooltip should be suppressed at current mouse position
 */
function shouldSuppressMemoTooltip(event) {
    return MEMO_EXCLUDED_SELECTORS.some(sel => event.target.closest(sel));
}

/**
 * Show the memo tooltip if memo exists
 */
async function maybeShowMemoTooltip(header, memo, event) {
    if (!memo || shouldSuppressMemoTooltip(event)) return;

    const tooltip = ensureMemoTooltipElement();
    tooltip.innerHTML = `<span class="popup-tooltip-label">Memo</span><div class="event-memo-tooltip-text">${escapeHtml(memo)}</div>`;
    tooltip.classList.add('visible');
    
    const pos = computeInitialMemoTooltipPosition(event.clientX, event.clientY);
    tooltip.style.left = pos.left + 'px';
    tooltip.style.top = pos.top + 'px';
    memoTooltipAnchor = { dx: pos.left - event.clientX, dy: pos.top - event.clientY };
}

/**
 * Compute initial tooltip position with viewport bounds checking
 */
function computeInitialMemoTooltipPosition(x, y) {
    const tooltip = ensureMemoTooltipElement();
    const offset = 14;
    let left = x + offset;
    let top = y + offset;
    
    const rect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    
    if (left + rect.width + 16 > vw) left = x - rect.width - offset;
    if (top + rect.height + 16 > vh) top = y - rect.height - offset;
    
    return { left, top };
}

/**
 * Position memo tooltip relative to mouse
 */
function positionMemoTooltip(x, y) {
    const tooltip = ensureMemoTooltipElement();
    if (memoTooltipAnchor) {
        tooltip.style.left = (x + memoTooltipAnchor.dx) + 'px';
        tooltip.style.top = (y + memoTooltipAnchor.dy) + 'px';
        return;
    }
    
    const pos = computeInitialMemoTooltipPosition(x, y);
    tooltip.style.left = pos.left + 'px';
    tooltip.style.top = pos.top + 'px';
}

/**
 * Hide the memo tooltip
 */
function hideMemoTooltip() {
    if (eventMemoTooltipEl) eventMemoTooltipEl.classList.remove('visible');
    memoTooltipAnchor = null;
}

/**
 * Attach memo tooltip listeners to all event group headers
 */
function attachMemoTooltipListeners() {
    document.querySelectorAll('.event-group-header[data-memo]').forEach(header => {
        header.addEventListener('mouseenter', handleEventHeaderMouseEnter);
        header.addEventListener('mousemove', handleEventHeaderMouseMove);
        header.addEventListener('mouseleave', handleEventHeaderMouseLeave);
    });
}

// Hide memo tooltip on scroll and resize
['scroll', 'resize'].forEach(evt => window.addEventListener(evt, hideMemoTooltip, { passive: true }));

let currentEventEditGroupId = null;

/**
 * Return the rows in the events cache that belong to a given event group.
 */
function getEventGroupRows(groupId) {
    return eventsCache.filter(ev => {
        const evKey = getEventGroupKey(ev);
        return evKey === groupId;
    });
}

/**
 * Open the Edit Event modal for the event group that was right-clicked.
 */
async function openEventEditModalFromContext() {
    const groupId = window.contextMenuEventGroupId;
    if (!groupId) return;
    openEventEditModal(groupId);
}

/**
 * Open the Edit Event modal for a given event group.
 * The memo shown in the modal is the most recently created memo in the group.
 */
async function openEventEditModal(groupId) {
    if (!groupId) return;
    const groupEvents = getEventGroupRows(groupId);
    if (groupEvents.length === 0) return;

    const backdrop = document.getElementById('eventEditModalBackdrop');
    if (!backdrop) return;

    const titleInput = document.getElementById('eventEditTitle');
    const dateInput = document.getElementById('eventEditDate');
    const memoInput = document.getElementById('eventEditMemo');
    if (titleInput) titleInput.value = groupEvents[0].event_title || 'Inventory event';
    if (dateInput) dateInput.value = groupEvents[0].event_date || '';
    if (memoInput) memoInput.value = groupEvents.find(ev => ev.memo)?.memo || '';

    currentEventEditGroupId = groupId;

    backdrop.style.display = 'flex';
    requestAnimationFrame(() => backdrop.classList.add('open'));
}

/**
 * Close the Edit Event modal.
 */
function closeEventEditModal() {
    const backdrop = document.getElementById('eventEditModalBackdrop');
    if (backdrop) {
        backdrop.classList.remove('open');
        setTimeout(() => { backdrop.style.display = 'none'; }, 250);
    }
    currentEventEditGroupId = null;
}

/**
 * Save title, date and memo for the event group being edited.
 * The title/date/memo are persisted to every event row in the group so the
 * group header (and memo) stay in sync.
 */
async function saveEventEdit() {
    const groupId = currentEventEditGroupId;
    if (!groupId) return;

    const groupEvents = getEventGroupRows(groupId);
    if (groupEvents.length === 0) return;

    const titleVal = document.getElementById('eventEditTitle')?.value?.trim() || 'Inventory event';
    const dateVal = document.getElementById('eventEditDate')?.value || '';
    const memoVal = document.getElementById('eventEditMemo')?.value || '';

    const saveButton = document.querySelector('#eventEditModalBackdrop .modal-button.submit');
    const cancelButton = document.querySelector('#eventEditModalBackdrop .modal-button.cancel');
    if (saveButton) saveButton.disabled = true;
    if (cancelButton) cancelButton.disabled = true;

    const ids = groupEvents.map(ev => ev.id);

    try {
        await waitForPywebview();
        const res = await pywebview.api.update_inventory_event(ids, titleVal, dateVal, memoVal);
        if (!res || !res.success) {
            throw new Error(res?.error || 'Failed to update event');
        }
        // Update the cache so the UI reflects the change immediately
        const trimmedMemo = memoVal.trim();
        eventsCache.forEach(ev => {
            if (ids.includes(ev.id)) {
                ev.event_title = titleVal;
                ev.event_date = dateVal;
                ev.memo = trimmedMemo || null;
            }
        });
        closeEventEditModal();
        filterEvents(eventsSearchTerm, { animate: false });
        if (window.notifySuccess) window.notifySuccess('Event updated successfully.');
    } catch (error) {
        if (window.notifyError) {
            window.notifyError(error.message || 'Failed to update event');
        } else {
            alert(error.message || 'Failed to update event');
        }
    } finally {
        if (saveButton) saveButton.disabled = false;
        if (cancelButton) cancelButton.disabled = false;
    }
}

// Initialize default tab after scripts load
window.addEventListener('load', () => {
    window.currentTab = currentTab;
    toggleContextMenuItemsForTab('inventory');
});
