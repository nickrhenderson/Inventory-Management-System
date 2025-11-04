// Group management functionality for the inventory system
// Groups are persisted in the database

// Cache for groups (loaded from database)
let productGroups = [];

// Initialize groups storage
window.productGroups = productGroups;

/**
 * Load all groups from the database
 * @returns {Promise<void>}
 */
async function loadGroupsFromDatabase() {
    try {
        const groups = await pywebview.api.get_all_groups();
        
        // Transform database format to our format
        productGroups.length = 0; // Clear array
        groups.forEach(dbGroup => {
            productGroups.push({
                id: dbGroup.id,
                name: dbGroup.name,
                isCollapsed: dbGroup.is_collapsed === 1,
                productIds: dbGroup.product_ids || [],
                order: dbGroup.display_order
            });
        });
        
        console.log(`Loaded ${productGroups.length} groups from database`);
    } catch (error) {
        console.error('Failed to load groups from database:', error);
        productGroups.length = 0;
    }
}

/**
 * Create a new group
 * @param {string} groupName - Name of the group
 * @returns {Promise<Object>} The created group object
 */
async function createGroup(groupName) {
    try {
        const response = await pywebview.api.create_group(groupName);
        
        if (response.success) {
            const newGroup = {
                id: response.group_id,
                name: groupName,
                isCollapsed: false,
                productIds: [],
                order: response.display_order
            };
            
            productGroups.push(newGroup);
            return newGroup;
        } else {
            throw new Error(response.message);
        }
    } catch (error) {
        console.error('Failed to create group:', error);
        throw error;
    }
}

/**
 * Delete a group
 * @param {number} groupId - ID of the group to delete
 * @returns {Promise<void>}
 */
async function deleteGroup(groupId) {
    try {
        const response = await pywebview.api.delete_group(groupId);
        
        if (response.success) {
            const index = productGroups.findIndex(g => g.id === groupId);
            if (index !== -1) {
                productGroups.splice(index, 1);
            }
        } else {
            throw new Error(response.message);
        }
    } catch (error) {
        console.error('Failed to delete group:', error);
        throw error;
    }
}

/**
 * Toggle group collapsed state
 * @param {number} groupId - ID of the group to toggle
 * @returns {Promise<void>}
 */
async function toggleGroupCollapse(groupId) {
    const group = productGroups.find(g => g.id === groupId);
    if (group) {
        const newCollapsedState = !group.isCollapsed;
        group.isCollapsed = newCollapsedState;
        
        // Save to database (don't wait for it to avoid UI lag)
        pywebview.api.update_group_collapsed_state(groupId, newCollapsedState)
            .catch(error => console.error('Failed to update group collapsed state:', error));
        
        renderGroups(false); // Don't animate on collapse/expand
    }
}

/**
 * Add product to group
 * @param {number} groupId - ID of the group
 * @param {number} productId - ID of the product to add
 * @returns {Promise<void>}
 */
async function addProductToGroup(groupId, productId) {
    try {
        const response = await pywebview.api.add_product_to_group(groupId, productId);
        
        if (response.success) {
            // Remove from any existing group first
            productGroups.forEach(g => {
                g.productIds = g.productIds.filter(id => id !== productId);
            });
            
            // Add to new group
            const group = productGroups.find(g => g.id === groupId);
            if (group && !group.productIds.includes(productId)) {
                group.productIds.push(productId);
            }
            
            renderGroups(true); // Animate when adding products
        } else {
            throw new Error(response.message);
        }
    } catch (error) {
        console.error('Failed to add product to group:', error);
        throw error;
    }
}

/**
 * Remove product from group
 * @param {number} groupId - ID of the group  
 * @param {number} productId - ID of the product to remove
 * @returns {Promise<void>}
 */
async function removeProductFromGroup(groupId, productId) {
    try {
        const response = await pywebview.api.remove_product_from_group(productId);
        
        if (response.success) {
            const group = productGroups.find(g => g.id === groupId);
            if (group) {
                group.productIds = group.productIds.filter(id => id !== productId);
                renderGroups(true); // Animate when removing products
            }
        } else {
            throw new Error(response.message);
        }
    } catch (error) {
        console.error('Failed to remove product from group:', error);
        throw error;
    }
}

/**
 * Get group by ID
 * @param {number} groupId - ID of the group
 * @returns {Object|null} The group object or null if not found
 */
function getGroupById(groupId) {
    return productGroups.find(g => g.id === groupId) || null;
}

/**
 * Render all groups in the products panel
 * @param {boolean} animate - Whether to animate product rows
 */
function renderGroups(animate = true) {
    const container = document.getElementById('inventoryTable');
    if (!container) return;
    
    // Clear existing content
    container.innerHTML = '';
    
    // If no groups exist, show regular table
    if (productGroups.length === 0) {
        renderUngroupedProducts(container);
        return;
    }
    
    // Sort groups by order
    const sortedGroups = [...productGroups].sort((a, b) => a.order - b.order);
    
    // Render each group
    sortedGroups.forEach(group => {
        const groupElement = createGroupElement(group, animate);
        container.appendChild(groupElement);
    });
    
    // Render ungrouped products
    renderUngroupedProducts(container, animate);
    
    // Add container-level drag handlers to catch drops anywhere
    setupContainerDragHandlers(container);
    
    // Animate all product rows after rendering (only if animate is true)
    if (animate) {
        animateGroupProductRows();
    }
}

/**
 * Setup drag handlers on the container
 * @param {HTMLElement} container - The container element
 */
function setupContainerDragHandlers(container) {
    // Remove any existing handlers
    container.removeEventListener('dragover', containerDragOver);
    container.removeEventListener('drop', containerDrop);
    
    // Add new handlers
    container.addEventListener('dragover', containerDragOver);
    container.addEventListener('drop', containerDrop);
}

/**
 * Handle dragover on container
 * @param {DragEvent} e - Drag event
 */
function containerDragOver(e) {
    e.preventDefault(); // CRITICAL for drop to work
    e.dataTransfer.dropEffect = 'move';
    return false;
}

/**
 * Handle drop on container
 * @param {DragEvent} e - Drag event
 */
function containerDrop(e) {
    console.log('Container drop event');
    // Let the group element handle it if it was the target
    // This is a fallback
    return false;
}

/**
 * Initialize groups system - call this when products are loaded
 */
function initializeGroupsSystem() {
    // Check if we should render groups or regular table
    if (productGroups.length > 0) {
        renderGroups(true); // Animate on initial load
    }
}

/**
 * Animate all product rows in groups
 */
function animateGroupProductRows() {
    // Get all product rows from groups and ungrouped section
    const allRows = document.querySelectorAll('.product-group tbody tr, .ungrouped-products tbody tr');
    
    allRows.forEach((row, index) => {
        setTimeout(() => {
            if (window.animateProductRowIn) {
                window.animateProductRowIn(row);
            } else {
                // Fallback animation if animateProductRowIn is not available
                row.getBoundingClientRect();
                row.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_HIDDEN);
                row.classList.add(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_ANIMATE_IN);
                
                setTimeout(() => {
                    row.classList.remove(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_ANIMATE_IN);
                }, INVENTORY_CONFIG.ANIMATION.ANIMATION_DURATION);
            }
        }, index * INVENTORY_CONFIG.ANIMATION.ROW_DELAY);
    });
}

// Make function globally accessible
window.initializeGroupsSystem = initializeGroupsSystem;

/**
 * Create a group element
 * @param {Object} group - Group object
 * @param {boolean} animate - Whether to add animation class to rows
 * @returns {HTMLElement} Group element
 */
function createGroupElement(group, animate = true) {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'product-group';
    groupContainer.dataset.groupId = group.id;
    groupContainer.draggable = true;
    
    // Create group header
    const groupHeader = document.createElement('div');
    groupHeader.className = 'product-group-header';
    groupHeader.onclick = (e) => {
        // Don't toggle if clicking on action buttons
        if (!e.target.closest('.group-actions') && !e.target.closest('.group-drag-handle')) {
            toggleGroupCollapse(group.id);
        }
    };
    
    groupHeader.innerHTML = `
        <div class="group-drag-handle" title="Drag to reorder">
            <div class="drag-dots"></div>
        </div>
        <button class="group-collapse-btn">
            <svg class="group-arrow ${group.isCollapsed ? 'collapsed' : ''}" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button>
        <span class="group-name">${escapeHtml(group.name)}</span>
        <span class="group-count">(${group.productIds.length})</span>
        <div class="group-actions">
            <button class="group-action-btn" onclick="event.stopPropagation(); confirmDeleteGroup(${group.id}, '${escapeHtml(group.name)}')" title="Delete Group">
                <img src="static/img/svg/trash.svg" alt="Delete" />
            </button>
        </div>
    `;
    
    // Add drag event listeners
    groupContainer.addEventListener('dragstart', handleDragStart);
    groupContainer.addEventListener('dragover', handleDragOver);
    groupContainer.addEventListener('dragenter', handleDragEnter);
    groupContainer.addEventListener('dragleave', handleDragLeave);
    groupContainer.addEventListener('drop', handleDrop);
    groupContainer.addEventListener('dragend', handleDragEnd);
    
    groupContainer.appendChild(groupHeader);
    
    // Create group content (product list)
    if (!group.isCollapsed) {
        const groupContent = document.createElement('div');
        groupContent.className = 'product-group-content';
        
        // Get products in this group
        const groupProducts = window.allProductsData ? 
            window.allProductsData.filter(p => group.productIds.includes(p.id)) : [];
        
        if (groupProducts.length > 0) {
            const tableHTML = `
                <table class="inventory-table">
                    <thead>
                        <tr>
                            <th>Product Name</th>
                            <th>Batch</th>
                            <th>Date Mixed</th>
                            <th>Total Cost</th>
                            <th>Quantity</th>
                            <th>Amount</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody class="group-products-body"></tbody>
                </table>
            `;
            groupContent.innerHTML = tableHTML;
            
            const tbody = groupContent.querySelector('.group-products-body');
            groupProducts.forEach((product, index) => {
                const row = createProductRowSync(product, index, animate);
                tbody.appendChild(row);
            });
        } else {
            groupContent.innerHTML = `
                <div class="empty-group-message">
                    <p>No products in this group</p>
                </div>
            `;
        }
        
        groupContainer.appendChild(groupContent);
    }
    
    return groupContainer;
}

/**
 * Create a product row synchronously (simplified version for groups)
 * @param {Object} product - Product data
 * @param {number} index - Row index
 * @param {boolean} animate - Whether to add animation class
 * @returns {HTMLElement} Table row element
 */
function createProductRowSync(product, index, animate = true) {
    const row = document.createElement('tr');
    if (animate) {
        row.classList.add(INVENTORY_CONFIG.CSS_CLASSES.INVENTORY_ROW_HIDDEN);
    }
    row.style.cursor = 'pointer';
    row.dataset.productId = product.id;
    
    const dateMixed = formatDate(product.date_mixed);
    const totalCost = formatCurrency(product.total_cost);
    const totalQuantity = formatQuantity(product.total_quantity);
    const amount = product.amount || 0;
    
    row.innerHTML = `
        <td><strong>${product.product_name}</strong></td>
        <td>${product.batch_number}</td>
        <td>${dateMixed}</td>
        <td class="price">${totalCost}</td>
        <td class="quantity">${totalQuantity}</td>
        <td class="amount">
            <div class="amount-controls">
                <button class="amount-button minus" 
                        onclick="event.stopPropagation(); adjustProductAmountLocal(${product.id}, -1)"
                        title="Decrease amount">
                    <div class="amount-icon">
                        <img src="static/img/svg/minus.svg" alt="Decrease" />
                    </div>
                </button>
                <input type="number" 
                       class="amount-input" 
                       value="${amount}" 
                       min="0" 
                       step="1"
                       data-product-id="${product.id}"
                       data-product-name="${product.product_name.replace(/"/g, '&quot;')}"
                       data-original-amount="${amount}"
                       onclick="event.stopPropagation()"
                       onchange="handleAmountInputChange(this)"
                       onblur="handleAmountInputBlur(this)"
                       onfocus="handleAmountInputFocus(this)">
                <button class="amount-button plus" 
                        onclick="event.stopPropagation(); adjustProductAmountLocal(${product.id}, 1)"
                        title="Increase amount">
                    <div class="amount-icon">
                        <img src="static/img/svg/plus.svg" alt="Increase" />
                    </div>
                </button>
            </div>
        </td>
        <td>
            <div class="product-actions">
                <button class="product-edit-button" 
                        onclick="event.stopPropagation(); editProduct(${product.id})"
                        title="Edit Product">
                    <div class="edit-icon">
                        <img src="static/img/svg/edit.svg" alt="Edit" />
                    </div>
                </button>
                <button class="product-delete-button" 
                        onclick="event.stopPropagation(); confirmDeleteProduct(${product.id}, '${product.product_name}')"
                        title="Delete Product">
                    <div class="delete-icon">
                        <img src="static/img/svg/trash.svg" alt="Delete" />
                    </div>
                </button>
            </div>
        </td>
    `;
    
    // Add click handler for row selection
    row.addEventListener('click', () => selectProduct(product.id));
    
    return row;
}

/**
 * Render ungrouped products
 * @param {HTMLElement} container - Container element
 * @param {boolean} animate - Whether to add animation class to rows
 */
function renderUngroupedProducts(container, animate = true) {
    if (!window.allProductsData) return;
    
    // Get all product IDs that are in groups
    const groupedProductIds = new Set();
    productGroups.forEach(group => {
        group.productIds.forEach(id => groupedProductIds.add(id));
    });
    
    // Filter ungrouped products
    const ungroupedProducts = window.allProductsData.filter(p => !groupedProductIds.has(p.id));
    
    if (ungroupedProducts.length > 0) {
        const ungroupedSection = document.createElement('div');
        ungroupedSection.className = 'ungrouped-products';
        
        const tableHTML = `
            <table class="inventory-table">
                <thead>
                    <tr>
                        <th>Product Name</th>
                        <th>Batch</th>
                        <th>Date Mixed</th>
                        <th>Total Cost</th>
                        <th>Quantity</th>
                        <th>Amount</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="productsTableBody"></tbody>
            </table>
        `;
        ungroupedSection.innerHTML = tableHTML;
        
        const tbody = ungroupedSection.querySelector('#productsTableBody');
        ungroupedProducts.forEach((product, index) => {
            const row = createProductRowSync(product, index, animate);
            tbody.appendChild(row);
        });
        
        container.appendChild(ungroupedSection);
    }
}

/**
 * Show confirmation modal for deleting a group
 * @param {number} groupId - ID of the group to delete
 * @param {string} groupName - Name of the group
 */
function confirmDeleteGroup(groupId, groupName) {
    showConfirmationModal(
        'Delete Group',
        `Are you sure you want to delete the group "${groupName}"? Products in this group will become ungrouped.`,
        'Delete Group',
        true,
        () => {
            deleteGroup(groupId);
            renderGroups();
        }
    );
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show group selection menu for a product
 * @param {number} productId - ID of the product
 * @param {number} x - X position for menu
 * @param {number} y - Y position for menu
 */
function showGroupSelectionMenu(productId, x, y) {
    // Create or get existing group menu
    let groupMenu = document.getElementById('groupSelectionMenu');
    
    if (!groupMenu) {
        groupMenu = document.createElement('div');
        groupMenu.id = 'groupSelectionMenu';
        groupMenu.className = 'context-menu';
        document.body.appendChild(groupMenu);
    }
    
    // Build menu content
    let menuHTML = '';
    
    if (productGroups.length === 0) {
        menuHTML = '<div class="context-menu-item" style="color: #999; cursor: default;">No groups available</div>';
    } else {
        productGroups.forEach(group => {
            const isInGroup = group.productIds.includes(productId);
            menuHTML += `
                <div class="context-menu-item" onclick="toggleProductInGroup(${group.id}, ${productId})">
                    <span>${isInGroup ? '✓' : '&nbsp;&nbsp;'}</span>
                    <span>${escapeHtml(group.name)}</span>
                </div>
            `;
        });
    }
    
    groupMenu.innerHTML = menuHTML;
    
    // Position and show menu
    groupMenu.style.left = x + 'px';
    groupMenu.style.top = y + 'px';
    groupMenu.classList.add('show');
    
    // Close menu when clicking outside
    const closeMenu = (e) => {
        if (!groupMenu.contains(e.target)) {
            groupMenu.classList.remove('show');
            document.removeEventListener('click', closeMenu);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 10);
}

/**
 * Toggle product membership in a group
 * @param {number} groupId - ID of the group
 * @param {number} productId - ID of the product
 */
function toggleProductInGroup(groupId, productId) {
    const group = productGroups.find(g => g.id === groupId);
    if (!group) return;
    
    if (group.productIds.includes(productId)) {
        removeProductFromGroup(groupId, productId);
    } else {
        addProductToGroup(groupId, productId);
    }
}

// Make functions globally accessible
window.showGroupSelectionMenu = showGroupSelectionMenu;
window.toggleProductInGroup = toggleProductInGroup;

// Drag and drop variables
let draggedGroupId = null;
let draggedElement = null;
let placeholder = null;
let orderUpdated = false;

/**
 * Handle drag start event
 * @param {DragEvent} e - Drag event
 */
function handleDragStart(e) {
    draggedGroupId = parseInt(e.currentTarget.dataset.groupId);
    draggedElement = e.currentTarget;
    orderUpdated = false;
    
    console.log('Drag start - Group ID:', draggedGroupId);
    
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
    
    // Create placeholder element
    placeholder = document.createElement('div');
    placeholder.className = 'group-placeholder';
    placeholder.style.height = e.currentTarget.offsetHeight + 'px';
    
    // Small delay to allow the drag image to be created
    setTimeout(() => {
        if (draggedElement && draggedElement.parentNode) {
            draggedElement.style.display = 'none';
            draggedElement.parentNode.insertBefore(placeholder, draggedElement);
        }
    }, 0);
}

/**
 * Handle drag over event
 * @param {DragEvent} e - Drag event
 */
function handleDragOver(e) {
    e.preventDefault(); // CRITICAL: Must prevent default for drop to fire
    e.stopPropagation();
    
    e.dataTransfer.dropEffect = 'move';
    
    const targetGroup = e.currentTarget;
    const targetGroupId = parseInt(targetGroup.dataset.groupId);
    
    // Only log occasionally to avoid spam
    if (Math.random() < 0.01) {
        console.log('Dragover on group:', targetGroupId);
    }
    
    if (draggedGroupId !== targetGroupId && placeholder && targetGroup.classList.contains('product-group')) {
        const container = targetGroup.parentNode;
        const targetRect = targetGroup.getBoundingClientRect();
        const mouseY = e.clientY;
        const targetMiddle = targetRect.top + targetRect.height / 2;
        
        // Determine if we should insert before or after the target
        if (mouseY < targetMiddle) {
            // Insert before target
            if (targetGroup !== placeholder.nextSibling) {
                container.insertBefore(placeholder, targetGroup);
            }
        } else {
            // Insert after target
            if (targetGroup.nextSibling !== placeholder) {
                container.insertBefore(placeholder, targetGroup.nextSibling);
            }
        }
    }
    
    return false;
}

/**
 * Handle drop event
 * @param {DragEvent} e - Drag event
 */
function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    
    console.log('Drop event fired - target:', e.currentTarget.dataset.groupId);
    
    // Update order immediately based on placeholder position
    if (placeholder && draggedElement) {
        console.log('Updating order from DOM (in drop handler)');
        updateGroupOrderFromDOM();
        orderUpdated = true;
        console.log('Order updated flag set to true');
    } else {
        console.log('Drop ignored - placeholder:', !!placeholder, 'draggedElement:', !!draggedElement);
    }
    
    return false;
}

/**
 * Handle drag end event
 * @param {DragEvent} e - Drag event
 */
function handleDragEnd(e) {
    console.log('Drag end - orderUpdated:', orderUpdated);
    
    // If drop didn't fire, update order based on placeholder position in dragend
    if (!orderUpdated && placeholder && draggedElement) {
        console.log('Drop did not fire - updating order in dragend');
        updateGroupOrderFromDOM();
        orderUpdated = true;
    }
    
    // Remove dragging class and restore display
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
        draggedElement.style.display = '';
    }
    
    // Remove placeholder
    if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.removeChild(placeholder);
    }
    
    // Only re-render if the order was actually updated
    const shouldRerender = orderUpdated;
    
    // Clean up
    const wasUpdated = orderUpdated;
    draggedGroupId = null;
    draggedElement = null;
    placeholder = null;
    orderUpdated = false;
    
    // Re-render to ensure consistency (only if order changed)
    if (shouldRerender) {
        console.log('Re-rendering groups with new order');
        // Use setTimeout to ensure DOM is clean before re-rendering
        setTimeout(() => {
            renderGroups(false);
        }, 10);
    } else {
        console.log('Skipping re-render - order not changed');
    }
}

/**
 * Update group order based on current DOM position
 */
function updateGroupOrderFromDOM() {
    const container = document.getElementById('inventoryTable');
    if (!container) {
        console.log('Container not found');
        return;
    }
    
    // Get all children including the placeholder
    const allChildren = Array.from(container.children);
    
    console.log('All children count:', allChildren.length);
    
    // Find the placeholder position
    let placeholderIndex = -1;
    const groupElements = [];
    
    allChildren.forEach((child, index) => {
        if (child.classList.contains('group-placeholder')) {
            placeholderIndex = index;
            console.log('Placeholder found at index:', index);
        } else if (child.classList.contains('product-group')) {
            groupElements.push({
                element: child,
                originalIndex: index
            });
        }
    });
    
    // If no placeholder found, just use current positions
    if (placeholderIndex === -1) {
        console.log('No placeholder, using current positions');
        groupElements.forEach((item, newIndex) => {
            const groupId = parseInt(item.element.dataset.groupId);
            const group = productGroups.find(g => g.id === groupId);
            if (group && group.order !== newIndex) {
                console.log(`Group ${groupId}: order ${group.order} -> ${newIndex}`);
                group.order = newIndex;
                // Save to database
                pywebview.api.update_group_order(groupId, newIndex)
                    .catch(error => console.error('Failed to update group order:', error));
            }
        });
        return;
    }
    
    // Build the new order array considering the placeholder position
    const newOrder = [];
    
    allChildren.forEach((child, index) => {
        if (child.classList.contains('group-placeholder')) {
            // This is where the dragged element should go
            if (draggedElement) {
                const draggedId = parseInt(draggedElement.dataset.groupId);
                newOrder.push(draggedId);
                console.log(`Placeholder at ${index} - inserting group ${draggedId}`);
            }
        } else if (child.classList.contains('product-group')) {
            const groupId = parseInt(child.dataset.groupId);
            // Don't add the dragged element twice
            if (!draggedElement || groupId !== parseInt(draggedElement.dataset.groupId)) {
                newOrder.push(groupId);
            }
        }
    });
    
    console.log('New order array:', newOrder);
    
    // Apply the new order and save to database
    newOrder.forEach((groupId, newIndex) => {
        const group = productGroups.find(g => g.id === groupId);
        if (group && group.order !== newIndex) {
            console.log(`Group ${groupId}: order ${group.order} -> ${newIndex}`);
            group.order = newIndex;
            // Save to database
            pywebview.api.update_group_order(groupId, newIndex)
                .catch(error => console.error('Failed to update group order:', error));
        }
    });
    
    console.log('Updated group orders:', productGroups.map(g => `${g.id}:${g.order}`).join(', '));
}

/**
 * Handle drag enter event
 * @param {DragEvent} e - Drag event
 */
function handleDragEnter(e) {
    e.preventDefault(); // Required for drop to work
    return false;
}

/**
 * Handle drag leave event  
 * @param {DragEvent} e - Drag event
 */
function handleDragLeave(e) {
    // Clean up any stray states if needed
}

/**
 * Reorder groups based on drag and drop (deprecated - now using DOM-based ordering)
 * @param {number} draggedId - ID of dragged group
 * @param {number} targetId - ID of target group
 */
function reorderGroups(draggedId, targetId) {
    const draggedGroup = productGroups.find(g => g.id === draggedId);
    const targetGroup = productGroups.find(g => g.id === targetId);
    
    if (!draggedGroup || !targetGroup) return;
    
    const draggedOrder = draggedGroup.order;
    const targetOrder = targetGroup.order;
    
    // Swap orders
    if (draggedOrder < targetOrder) {
        // Moving down: shift items up
        productGroups.forEach(group => {
            if (group.order > draggedOrder && group.order <= targetOrder) {
                group.order--;
            }
        });
        draggedGroup.order = targetOrder;
    } else {
        // Moving up: shift items down
        productGroups.forEach(group => {
            if (group.order >= targetOrder && group.order < draggedOrder) {
                group.order++;
            }
        });
        draggedGroup.order = targetOrder;
    }
    
    // Re-render groups without animation
    renderGroups(false);
}

/**
 * Filter groups based on search term
 * Shows/hides groups based on whether they contain products matching the search
 * @param {string} searchTerm - The search term to filter by
 * @param {Set} visibleProductIds - Set of product IDs that match the search
 */
function filterGroupsBySearch(searchTerm, visibleProductIds) {
    if (!searchTerm || !visibleProductIds || visibleProductIds.size === 0) {
        // Show all groups when no search
        showAllGroups();
        return;
    }
    
    const allGroupElements = document.querySelectorAll('.product-group');
    let anyGroupVisible = false;
    
    allGroupElements.forEach(groupElement => {
        const groupId = parseInt(groupElement.dataset.groupId);
        const group = productGroups.find(g => g.id === groupId);
        
        if (!group) {
            groupElement.style.display = 'none';
            return;
        }
        
        // Check if any products in this group match the search
        const hasVisibleProducts = group.productIds.some(productId => visibleProductIds.has(productId));
        
        if (hasVisibleProducts) {
            // Show the group - it has at least one matching product
            groupElement.style.display = '';
            anyGroupVisible = true;
            
            // Ensure the group is not collapsed so users can see the matching products
            if (group.isCollapsed) {
                group.isCollapsed = false;
                // Re-render this specific group to show products
                const newGroupElement = createGroupElement(group, false);
                groupElement.replaceWith(newGroupElement);
                // Re-attach event listeners
                newGroupElement.addEventListener('dragstart', handleDragStart);
                newGroupElement.addEventListener('dragover', handleDragOver);
                newGroupElement.addEventListener('dragenter', handleDragEnter);
                newGroupElement.addEventListener('dragleave', handleDragLeave);
                newGroupElement.addEventListener('drop', handleDrop);
                newGroupElement.addEventListener('dragend', handleDragEnd);
            }
            
            // Filter rows within the group - only show matching products
            const groupRows = groupElement.querySelectorAll('.group-products-body tr');
            let visibleInGroup = 0;
            groupRows.forEach(row => {
                const productId = parseInt(row.dataset.productId);
                if (visibleProductIds.has(productId)) {
                    row.style.display = '';
                    visibleInGroup++;
                } else {
                    row.style.display = 'none';
                }
            });
            
            // Update group count to show only visible products
            const countElement = groupElement.querySelector('.group-count');
            if (countElement) {
                countElement.textContent = `(${visibleInGroup})`;
            }
        } else {
            // Hide the entire group if no products match
            groupElement.style.display = 'none';
        }
    });
    
    // Also filter ungrouped products
    const ungroupedSection = document.querySelector('.ungrouped-products');
    if (ungroupedSection) {
        const ungroupedRows = ungroupedSection.querySelectorAll('tbody tr');
        let visibleUngrouped = 0;
        
        ungroupedRows.forEach(row => {
            const productId = parseInt(row.dataset.productId);
            if (visibleProductIds.has(productId)) {
                row.style.display = '';
                visibleUngrouped++;
            } else {
                row.style.display = 'none';
            }
        });
        
        // Hide ungrouped section if no products are visible in it
        if (visibleUngrouped === 0) {
            ungroupedSection.style.display = 'none';
        } else {
            ungroupedSection.style.display = '';
        }
    }
}

/**
 * Show all groups and their products
 */
function showAllGroups() {
    // Show all group elements
    const allGroupElements = document.querySelectorAll('.product-group');
    allGroupElements.forEach(groupElement => {
        groupElement.style.display = '';
        
        // Show all rows within the group
        const groupRows = groupElement.querySelectorAll('.group-products-body tr');
        groupRows.forEach(row => {
            row.style.display = '';
        });
        
        // Reset group count
        const groupId = parseInt(groupElement.dataset.groupId);
        const group = productGroups.find(g => g.id === groupId);
        if (group) {
            const countElement = groupElement.querySelector('.group-count');
            if (countElement) {
                countElement.textContent = `(${group.productIds.length})`;
            }
        }
    });
    
    // Show all ungrouped products and the ungrouped section
    const ungroupedSection = document.querySelector('.ungrouped-products');
    if (ungroupedSection) {
        ungroupedSection.style.display = '';
        const ungroupedRows = ungroupedSection.querySelectorAll('tbody tr');
        ungroupedRows.forEach(row => {
            row.style.display = '';
        });
    }
}

// Make functions globally accessible
window.loadGroupsFromDatabase = loadGroupsFromDatabase;
window.filterGroupsBySearch = filterGroupsBySearch;
window.showAllGroups = showAllGroups;
