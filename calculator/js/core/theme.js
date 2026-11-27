/* ---------------- theme ---------------- */

(function () {
  'use strict';

  var DEFAULT_THEME = 'dark';
  var memoryTheme = null;

  var MOON_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';

  var SUN_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<circle cx="12" cy="12" r="4"/>' +
    '<path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';

  function getCurrentTheme() {
    if (memoryTheme === 'light' || memoryTheme === 'dark') {
      return memoryTheme;
    }
    return DEFAULT_THEME;
  }

  function isDarkTheme() {
    return getCurrentTheme() === 'dark';
  }

  function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
  }

  function setTheme(themeName) {
    memoryTheme = themeName;
    applyTheme(themeName);
    bindThemeButton();

    if (typeof ApexCharts !== 'undefined') {
      location.reload();
    }
  }

  function toggleTheme() {
    setTheme(isDarkTheme() ? 'light' : 'dark');
  }

  function themeButtonHtml() {
    var dark = isDarkTheme();
    return '<button id="btn-theme" type="button" title="Switch to ' +
      (dark ? 'light' : 'dark') + ' mode">' +
      (dark ? SUN_ICON : MOON_ICON) +
      '<span class="nav-txt">' + (dark ? 'Light mode' : 'Dark mode') + '</span></button>';
  }

  function bindThemeButton() {
    var button = document.getElementById('btn-theme');
    if (!button) {
      return;
    }

    var dark = isDarkTheme();
    button.innerHTML = (dark ? SUN_ICON : MOON_ICON) +
      '<span class="nav-txt">' + (dark ? 'Light mode' : 'Dark mode') + '</span>';
    button.title = 'Switch to ' + (dark ? 'light' : 'dark') + ' mode';

    if (!button.dataset.themeBound) {
      button.dataset.themeBound = 'yes';
      button.addEventListener('click', toggleTheme);
    }
  }

  applyTheme(getCurrentTheme());
  document.addEventListener('DOMContentLoaded', bindThemeButton);

  window.Theme = {
    current: getCurrentTheme,
    isDark: isDarkTheme,
    set: setTheme,
    toggle: toggleTheme,
    button: themeButtonHtml,
    bind: bindThemeButton
  };
})();
