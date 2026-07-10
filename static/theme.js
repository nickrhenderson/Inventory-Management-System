(function () {
  const STORAGE_KEY = 'inventory_theme';

  function getPreferredTheme() {
    const saved = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;

    // Fall back to OS preference.
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
  }

  function setButtonUI(theme) {
    const btn = document.getElementById('themeToggleButton');
    if (!btn) return;

    const isDark = theme === 'dark';
    btn.dataset.theme = theme;
    btn.setAttribute('aria-pressed', String(isDark));

    // Keep the animated icon markup and only update accessible text/state.
    btn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }

  function initThemeToggle() {
    const btn = document.getElementById('themeToggleButton');
    if (!btn) return;

    btn.addEventListener('click', function () {
      const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';

      window.localStorage && window.localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
      setButtonUI(next);

      // Some views create content dynamically; this helps ensure CSS-based colors are applied.
      window.dispatchEvent(new CustomEvent('theme:changed', { detail: { theme: next } }));
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    const initial = getPreferredTheme();
    applyTheme(initial);
    setButtonUI(initial);
    initThemeToggle();
  });
})();

