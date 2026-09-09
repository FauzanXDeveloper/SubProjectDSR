/* ============================================================
   theme.js - light / dark switch for the whole app.

   Loaded in <head> on every page and applied SYNCHRONOUSLY before
   first paint, so a dark user never sees a white flash on the way in.

     dark  = the analytics look (css/theme-dark.css)
     light = the normal banking-ledger look (the base stylesheets)

   The choice lives in localStorage, so it follows the person around
   this browser rather than being per-page. Theme.button() renders the
   sidebar control; every sidebar (chrome.js, the calculator, the
   settings page) drops it into its own foot.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'dsr_theme';
  var DEFAULT = 'dark';

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function current() {
    var t = stored();
    return (t === 'light' || t === 'dark') ? t : DEFAULT;
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function set(theme) {
    try { localStorage.setItem(KEY, theme); } catch (e) { /* private mode */ }
    apply(theme);
    bind();   // refresh this page's toggle label/icon in place
    // Everything else is driven by CSS custom properties, so flipping
    // data-theme above already restyled the page - EXCEPT charts, which bake
    // their colours in at render time (js/charts.js reads the CSS tokens
    // once). Only the two dashboards load ApexCharts, and neither holds
    // anything the user has keyed in, so a reload is safe there.
    //
    // It is NOT safe anywhere else. The calculator keeps an in-progress case
    // in memory only, on purpose (js/state.js, and the README "no browser
    // storage of in-progress case data") - reloading mid-entry threw away
    // everything the officer had typed. Switching theme must never cost them
    // their work, so outside the dashboards we repaint in place.
    if (typeof ApexCharts !== 'undefined') location.reload();
  }

  function toggle() { set(current() === 'dark' ? 'light' : 'dark'); }

  var ICON_MOON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
  var ICON_SUN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';

  /** Sidebar control. Same markup shape as the other .foot buttons. */
  function button() {
    var dark = current() === 'dark';
    return '<button id="btn-theme" type="button" title="Switch to ' +
      (dark ? 'light' : 'dark') + ' mode">' +
      (dark ? ICON_SUN : ICON_MOON) +
      '<span class="nav-txt">' + (dark ? 'Light mode' : 'Dark mode') + '</span></button>';
  }

  /** Wire whatever #btn-theme is on the page (call after rendering it).
      Also fills in the label/icon, so a page can ship the button as static
      markup (the calculator does) without knowing the current theme. */
  function bind() {
    var el = document.getElementById('btn-theme');
    if (!el) return;
    var dark = current() === 'dark';
    el.innerHTML = (dark ? ICON_SUN : ICON_MOON) +
      '<span class="nav-txt">' + (dark ? 'Light mode' : 'Dark mode') + '</span>';
    el.title = 'Switch to ' + (dark ? 'light' : 'dark') + ' mode';
    if (!el.__themeBound) {
      el.__themeBound = true;
      el.addEventListener('click', toggle);
    }
  }

  apply(current());
  document.addEventListener('DOMContentLoaded', bind);

  window.Theme = {
    current: current,
    isDark: function () { return current() === 'dark'; },
    set: set,
    toggle: toggle,
    button: button,
    bind: bind
  };
})();
