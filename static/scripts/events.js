// Events tab logic
let currentTab = 'inventory';
let eventsCache = [];
let eventSelectedProducts = new Map();
let eventCollapsedStates = new Map();
let eventsSearchTerm = '';
let inventorySearchTerm = '';
let productsSearchTerm = '';
let eventGroupObserver = null;
let eventsLoaded = false;
let eventsDirty = false;
let tabTransitionToken = 0;
let displayedTab = 'inventory';

const TAB_CONTENT_FADE_MS = 220;
const TAB_BOX_TRANSITION_MS = 320;

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

function setActiveTab(tab) {
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

async function renderProductsList() {
    const list = document.getElementById('productsList');
    if (!list) return;

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
                <div class="product-image-placeholder" aria-label="Product image placeholder">IMG</div>
                <div class="product-card-name"></div>
                <div class="amount-controls product-amount-controls" data-product-index="${index}">
                    <button class="amount-button minus" type="button" title="Decrease amount">
                        <div class="amount-icon">
                            <img src="static/img/svg/minus.svg" alt="Decrease" />
                        </div>
                    </button>
                    <input type="number" class="amount-input" value="${product.amount_on_hand}" min="0" step="1" aria-label="Amount on hand">
                    <button class="amount-button plus" type="button" title="Increase amount">
                        <div class="amount-icon">
                            <img src="static/img/svg/plus.svg" alt="Increase" />
                        </div>
                    </button>
                </div>
            `;
            const productName = card.querySelector('.product-card-name');
            productName.textContent = product.product_name;
            productName.title = product.product_name;
            productList.appendChild(card);
        });

        list.querySelectorAll('.product-amount-controls').forEach(controls => {
            const product = products[Number(controls.dataset.productIndex)];
            const input = controls.querySelector('.amount-input');
            const minusButton = controls.querySelector('.minus');
            const plusButton = controls.querySelector('.plus');

            const saveConfirmedAmount = async amount => {
                input.disabled = true;
                minusButton.disabled = true;
                plusButton.disabled = true;

                try {
                    const result = await pywebview.api.update_product_total(product.product_name, normalizedAmount);
                    if (!result.success) {
                        throw new Error(result.message || 'Failed to update product amount.');
                    }
                    input.value = result.amount_on_hand;
                    product.amount_on_hand = result.amount_on_hand;
                    await loadProductsData();
                    window.markEventsDirty?.();
                } catch (error) {
                    input.value = product.amount_on_hand;
                    window.notifyError?.(error.message || 'Failed to update product amount.');
                } finally {
                    input.disabled = false;
                    minusButton.disabled = false;
                    plusButton.disabled = false;
                }
            };

            const requestAmountChange = requestedAmount => {
                const originalAmount = product.amount_on_hand;
                const normalizedAmount = Math.max(0, parseInt(requestedAmount, 10) || 0);
                const maximumAmount = Number(product.units_created) || 0;

                if (normalizedAmount > maximumAmount) {
                    input.value = originalAmount;
                    window.notifyError?.(`Amount on hand cannot exceed the ${maximumAmount} units created for ${product.product_name}.`);
                    return;
                }

                if (normalizedAmount === originalAmount) {
                    input.value = originalAmount;
                    return;
                }

                input.value = normalizedAmount;
                showConfirmationModal(
                    'Confirm Amount Change',
                    `Confirm your change for "${product.product_name}" amount from ${originalAmount} to ${normalizedAmount}.`,
                    'Confirm',
                    false,
                    () => saveConfirmedAmount(normalizedAmount),
                    () => { input.value = originalAmount; }
                );
            };

            minusButton.addEventListener('click', () => requestAmountChange((parseInt(input.value, 10) || 0) - 1));
            plusButton.addEventListener('click', () => requestAmountChange((parseInt(input.value, 10) || 0) + 1));
            input.addEventListener('change', () => requestAmountChange(input.value));
        });
    } catch (error) {
        console.error('Failed to load product totals', error);
        list.innerHTML = '<div class="empty-state-message">Failed to load products.</div>';
    }
}

function filterProductsList(searchTerm) {
    productsSearchTerm = (searchTerm || '').toLowerCase();
    renderProductsList();
}

function openPhoneConnectModal() {
    const modal = document.getElementById('phoneConnectModalBackdrop');
    const qrContainer = document.getElementById('phoneConnectQr');
    if (!modal || !qrContainer) return;

    qrContainer.replaceChildren();
    const matrixSize = 29;
    const randomBytes = new Uint8Array(matrixSize * matrixSize);
    crypto.getRandomValues(randomBytes);
    const reserved = new Set();

    const markFinder = (row, column) => {
        for (let rowOffset = -1; rowOffset <= 7; rowOffset++) {
            for (let columnOffset = -1; columnOffset <= 7; columnOffset++) {
                const targetRow = row + rowOffset;
                const targetColumn = column + columnOffset;
                if (targetRow < 0 || targetRow >= matrixSize || targetColumn < 0 || targetColumn >= matrixSize) continue;
                reserved.add(`${targetRow}:${targetColumn}`);
            }
        }
    };

    [[0, 0], [0, matrixSize - 7], [matrixSize - 7, 0]].forEach(([row, column]) => markFinder(row, column));
    const isFinderPixel = (row, column, startRow, startColumn) => {
        const rowOffset = row - startRow;
        const columnOffset = column - startColumn;
        return rowOffset >= 0 && rowOffset < 7 && columnOffset >= 0 && columnOffset < 7 &&
            (rowOffset === 0 || rowOffset === 6 || columnOffset === 0 || columnOffset === 6 ||
             (rowOffset >= 2 && rowOffset <= 4 && columnOffset >= 2 && columnOffset <= 4));
    };

    const fragment = document.createDocumentFragment();
    for (let row = 0; row < matrixSize; row++) {
        for (let column = 0; column < matrixSize; column++) {
            const cell = document.createElement('span');
            const finderPixel = isFinderPixel(row, column, 0, 0) ||
                isFinderPixel(row, column, 0, matrixSize - 7) ||
                isFinderPixel(row, column, matrixSize - 7, 0);
            const isReserved = reserved.has(`${row}:${column}`);
            cell.className = finderPixel || (!isReserved && randomBytes[row * matrixSize + column] > 127)
                ? 'qr-cell filled'
                : 'qr-cell';
            fragment.appendChild(cell);
        }
    }
    qrContainer.appendChild(fragment);
    modal.classList.add('open');
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
        const key = `${ev.event_title || 'Inventory event'}|${ev.event_date || ev.created_at || ''}`;
        if (!eventGroups.has(key)) {
            eventGroups.set(key, []);
        }
        eventGroups.get(key).push(ev);
    });
    
    // Render each event group
    let html = '';
    eventGroups.forEach((groupEvents, key) => {
        const [title, dateStr] = key.split('|');
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
        
        const groupClass = animate ? 'event-group event-group-hidden' : 'event-group';
        html += `
            <div class="${groupClass}" data-event-id="${groupId}">
                <div class="event-group-header" onclick="toggleEventCollapse('${groupId}')">
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
            const evKey = `${ev.event_title || 'Inventory event'}|${ev.event_date || ev.created_at || ''}`;
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
            const res = await pywebview.api.add_inventory_events(events, titleVal, dateVal);
            if (!res || !res.success) throw new Error(res?.error || 'Failed to add event');
            closeEventModal();
            await loadProductsData();
            if (typeof window.markEventsDirty === 'function') {
                window.markEventsDirty();
            }
        } catch (err) {
            if (window.notifyError) {
                window.notifyError(err.message || 'Failed to add event');
            } else {
                alert(err.message || 'Failed to add event');
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
    if (e.target.closest('.context-menu-item.events-only')) {
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

// Initialize default tab after scripts load
window.addEventListener('load', () => {
    window.currentTab = currentTab;
    toggleContextMenuItemsForTab('inventory');
});
