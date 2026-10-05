# Right-click context menu
- ONE shared #contextMenu div in index.html; reused across all tabs. Not per-tab.
- Tab scoping via toggleContextMenuItemsForTab() in events.js (.inventory-only/.products-only/.events-only classes).
- Core logic in utils.js: showContextMenu(x,y), hideContextMenu(), handleContextMenu(event), initializeContextMenu().
- showContextMenu positions with position:fixed, sets left/top inline. Menu measured with offsetWidth/offsetHeight.
- FIX (2026-09-03): was using hardcoded 180x80 and only clamped to 0. Now: show menu first to measure real size, flips LEFT of cursor if overflowing right edge, flips ABOVE cursor if overflowing bottom edge, with 4px edge padding and clamp to edgePadding.
- Secondary #groupSelectionMenu in groups.js (Add to Group) is orphaned/dead — its trigger element addToGroupMenuItem doesn't exist in index.html.
- NOTE: .context-menu uses visibility:hidden when not .show, so must add .show BEFORE measuring dimensions.
