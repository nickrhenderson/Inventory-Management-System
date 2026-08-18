(function () {
  const STORAGE_KEY = 'inventory_theme';

  function getPreferredTheme() {
    const saved = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;

    return 'light';
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
      saveThemeSetting(next);
      applyTheme(next);
      setButtonUI(next);

      // Some views create content dynamically; this helps ensure CSS-based colors are applied.
      window.dispatchEvent(new CustomEvent('theme:changed', { detail: { theme: next } }));
    });
  }

  async function saveThemeSetting(theme) {
    try {
      if (window.pywebview && window.pywebview.api) {
        await window.pywebview.api.set_theme_setting(theme);
      }
    } catch (error) {
      console.error('Failed to save theme setting:', error);
    }
  }

  async function syncThemeSetting() {
    try {
      if (!window.pywebview || !window.pywebview.api) return;

      const response = await window.pywebview.api.get_theme_setting();
      const savedTheme = response && response.success ? response.theme : null;
      if (savedTheme === 'light' || savedTheme === 'dark') {
        window.localStorage && window.localStorage.setItem(STORAGE_KEY, savedTheme);
        applyTheme(savedTheme);
        setButtonUI(savedTheme);
      } else {
        await saveThemeSetting(getPreferredTheme());
      }
    } catch (error) {
      console.error('Failed to load theme setting:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const initial = getPreferredTheme();
    applyTheme(initial);
    setButtonUI(initial);
    initThemeToggle();
  });

  window.addEventListener('app:initialized', syncThemeSetting);
})();

