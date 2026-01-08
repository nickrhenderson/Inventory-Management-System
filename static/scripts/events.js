// Events tab logic
let currentTab = 'inventory';
let eventsCache = [];
let eventSelectedProducts = new Map();
let eventCollapsedStates = new Map();
let eventsSearchTerm = '';
let inventorySearchTerm = '';
let eventGroupObserver = null;
let eventsLoaded = false;
let eventsDirty = false;

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
window.refreshEvents = refreshEvents;

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
    currentTab = tab;
    window.currentTab = tab;
    const inventoryView = document.getElementById('inventoryView');
    const eventsView = document.getElementById('eventsView');
    const tabs = document.querySelectorAll('#mainTabs .tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    if (inventoryView && eventsView) {
        if (tab === 'events') {
            // Save current inventory search term before switching
            const searchBar = document.querySelector('.search-bar');
            if (searchBar) inventorySearchTerm = searchBar.value;
            
            inventoryView.style.display = 'none';
            eventsView.style.display = 'flex';
            updateSearchBar();
            toggleContextMenuItemsForTab('events');
            
            // Only load events if not already loaded
            if (!eventsLoaded || eventsDirty) {
                loadEvents();
            }
        } else {
            eventsView.style.display = 'none';
            inventoryView.style.display = 'flex';
            updateSearchBar();
            toggleContextMenuItemsForTab('inventory');
        }
    }
}

function updateSearchBar() {
    const searchBar = document.querySelector('.search-bar');
    if (searchBar) {
        searchBar.placeholder = 'Search...';
        if (currentTab === 'events') {
            searchBar.value = eventsSearchTerm;
        } else {
            searchBar.value = inventorySearchTerm;
        }
    }
}

function toggleContextMenuItemsForTab(tab) {
    const invOnly = document.querySelectorAll('.context-menu-item.inventory-only');
    const evtOnly = document.querySelectorAll('.context-menu-item.events-only');
    invOnly.forEach(el => el.style.display = tab === 'inventory' ? '' : 'none');
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
                    <div style="font-size: 0.9em; color: #666;">Stock: ${product.amount || 0}</div>
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
                <div style="font-size: 0.9em; color: #666;">Stock: ${product.amount || 0}</div>
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
