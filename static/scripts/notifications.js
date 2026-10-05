// Universal notification system
// Toasts slide in from the bottom-right, stack upward, and auto-dismiss.

const NotificationSystem = {
    container: null,
    notifications: [],   // { id, el, timer }
    counter: 0,
    MAX_VISIBLE: 5,
    AUTO_DISMISS_MS: 15000,

    /** Initialise the container element (called once on DOMContentLoaded). */
    init() {
        if (this.container) return;
        const existing = document.getElementById('notificationContainer');
        if (existing) {
            this.container = existing;
        } else {
            this.container = document.createElement('div');
            this.container.id = 'notificationContainer';
            this.container.className = 'notification-container';
            document.body.appendChild(this.container);
        }
    },

    /**
     * Show a toast notification.
     * @param {string} message  - Text to display.
     * @param {'success'|'error'} [type='success']  - Visual style.
     * @returns {number} Internal id so the caller can programmatically dismiss.
     */
    show(message, type = 'success') {
        this.init();
        const id = ++this.counter;

        // If we're at capacity, dismiss the oldest notification immediately
        while (this.notifications.length >= this.MAX_VISIBLE) {
            this._dismiss(this.notifications[0].id, true);
        }

        const el = document.createElement('div');
        el.className = `notification-item notification-${type}`;
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.innerHTML = `
            <div class="notification-accent"></div>
            <div class="notification-body">
                <span class="notification-message">${this._escapeHtml(message)}</span>
            </div>
            <button class="notification-close" title="Dismiss" aria-label="Dismiss notification">&times;</button>
        `;

        // Close button
        el.querySelector('.notification-close').addEventListener('click', () => {
            this._dismiss(id);
        });

        this.container.appendChild(el);

        // Trigger enter animation on next frame
        requestAnimationFrame(() => {
            el.classList.add('notification-enter');
        });

        const timer = setTimeout(() => {
            this._dismiss(id);
        }, this.AUTO_DISMISS_MS);

        this.notifications.push({ id, el, timer });

        return id;
    },

    /** Convenience: show a success toast. */
    success(message) {
        return this.show(message, 'success');
    },

    /** Convenience: show an error toast. */
    error(message) {
        return this.show(message, 'error');
    },

    /** Dismiss a specific notification by id. */
    dismiss(id) {
        this._dismiss(id);
    },

    /** Dismiss all visible notifications. */
    dismissAll() {
        [...this.notifications].forEach(n => this._dismiss(n.id, true));
    },

    // ---- internals ----

    _dismiss(id, immediate = false) {
        const idx = this.notifications.findIndex(n => n.id === id);
        if (idx === -1) return;

        const { el, timer } = this.notifications[idx];
        clearTimeout(timer);

        if (immediate) {
            el.remove();
            this.notifications.splice(idx, 1);
            return;
        }

        // Start exit animation
        el.classList.remove('notification-enter');
        el.classList.add('notification-exit');

        el.addEventListener('animationend', () => {
            el.remove();
            const i = this.notifications.findIndex(n => n.id === id);
            if (i !== -1) this.notifications.splice(i, 1);
        }, { once: true });

        // Safety fallback if animationend doesn't fire
        setTimeout(() => {
            if (el.parentNode) el.remove();
            const i = this.notifications.findIndex(n => n.id === id);
            if (i !== -1) this.notifications.splice(i, 1);
        }, 400);
    },

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

// Make globally accessible
window.NotificationSystem = NotificationSystem;
window.notifySuccess = (msg) => NotificationSystem.success(msg);
window.notifyError = (msg) => NotificationSystem.error(msg);
