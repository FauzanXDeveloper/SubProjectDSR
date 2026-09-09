/* ============================================================
   admin/settings.js - builds the Calculation Settings page shell,
   then loads engine/config.js + data/ndiPricing.js + js/admin.js
   (which renders the actual settings form and calls
   PolicyConfig.save() - see web/js/admin.js). Replaces the static
   markup that used to live directly in web/admin/settings.php.

   admin.js's renderAll() runs synchronously as soon as it loads and
   expects every element below (adm-status, adm-sections, btn-save,
   ...) to already exist - so this script must finish building the
   shell BEFORE admin.js is injected.
   ============================================================ */
(function () {
  'use strict';

  var admin = Auth.requireLogin();
  if (!admin) return;
  if (!Rbac.requireRole(admin, ['admin'])) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var SETTINGS_SECTIONS = [
    ['Customer Class (A / B)', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>'],
    ['Personal Financing', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'],
    ['Home Financing', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><rect x="10" y="14" width="4" height="5.5"/></svg>'],
    ['Unsecured Exposure', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0"/></svg>'],
    ['Credit Card', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h5"/></svg>'],
    ['CCRIS Commitments', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/></svg>'],
    ['Income Recognition', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l5-5 4 4 8-8"/><path d="M14 8h6v6"/></svg>'],
    ['PF Pricing Matrices', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>']
  ];

  var settingsNavHtml = SETTINGS_SECTIONS.map(function (s, i) {
    return '<button class="nav-item" data-sec="' + i + '" title="' + esc(s[0]) + '">' + s[1] +
      '<span class="nav-txt">' + esc(s[0]) + '</span></button>';
  }).join('');

  document.title = 'Admin - Calculation Settings | ARBM DSR Calculator';
  document.body.innerHTML =
    '<div class="layout">' +
      '<nav class="sidebar no-print" id="sidebar">' +
        '<div class="brand" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
          '<span class="brand-logo">' +
            '<img class="logo-full" src="/public/white_logo_alrajhi.png" alt="Al Rajhi Bank">' +
            '<img class="logo-mark" src="/public/favicon.png" alt="Al Rajhi Bank">' +
          '</span>' +
          '<div class="t2">Calculation Settings (Admin)</div>' +
        '</div>' +
        '<div class="sidebar-scroll">' +
          '<div class="group-label">Navigation</div>' +
          '<a class="nav-item" href="/admin/index.html"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 3 6v6c0 5 3.8 8.7 9 10 5.2-1.3 9-5 9-10V6l-9-4Z"/></svg><span class="nav-txt">Admin Dashboard</span></a>' +
          '<a class="nav-item" href="/admin/users.html"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><path d="M16 8.5a3 3 0 1 0 0-6"/><path d="M18.5 14.3c2 .7 3.5 2.7 3.5 5.2"/></svg><span class="nav-txt">Users</span></a>' +
          '<a class="nav-item" href="/admin/audit.html"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/></svg><span class="nav-txt">Audit Log</span></a>' +
          '<div class="group-label">Policy Settings</div>' +
          settingsNavHtml +
        '</div>' +
        '<div class="foot">' +
          '<div class="user-chip">' + esc(admin.name) + ' &middot; admin</div>' +
          '<a href="/change_password.html" title="Change password"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg><span class="nav-txt">Change password</span></a>' +
          (window.Theme ? Theme.button() : '') +
          '<a href="#" id="chrome-logout" title="Logout"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg><span class="nav-txt">Logout</span></a>' +
          '<button id="btn-export" type="button" title="Export settings (JSON)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/></svg><span class="nav-txt">Export settings (JSON)</span></button>' +
          '<button id="btn-import" type="button" title="Import settings (JSON)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 21h16"/></svg><span class="nav-txt">Import settings (JSON)</span></button>' +
          '<input type="file" id="file-import" accept=".json" style="display:none">' +
          '<button id="btn-reset" type="button" title="Reset to Excel defaults"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg><span class="nav-txt">Reset to Excel defaults</span></button>' +
        '</div>' +
      '</nav>' +
      '<main class="main">' +
        '<div class="topbar">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<button class="hamburger no-print" id="btn-menu" type="button" aria-label="Menu"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>' +
            '<h1 id="page-title">Customer Class (A / B)</h1>' +
          '</div>' +
          '<div class="adm-status" id="adm-status"></div>' +
        '</div>' +
        '<div id="adm-sections"></div>' +
        '<div class="savebar no-print">' +
          '<button class="btn" id="btn-save" type="button">Save all settings</button>' +
          '<span style="font-size:12px;color:var(--muted)">Saves every section, not just the one on screen.</span>' +
          '<span class="msg" id="save-msg"></span>' +
        '</div>' +
      '</main>' +
    '</div>';

  if (window.Theme) Theme.bind();
  document.getElementById('chrome-logout').addEventListener('click', function (e) {
    e.preventDefault();
    Auth.logout();
    location.href = '/login.html';
  });
  // admin.js's renderAll() runs synchronously on load and needs the shell
  // above to already exist, so load these in strict sequence.
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.body.appendChild(s);
    });
  }

  loadScript('/js/engine/config.js?v=20260815d')
    .then(function () { return loadScript('/data/ndiPricing.js?v=20260815d'); })
    .then(function () { return loadScript('/js/admin.js?v=20260815d'); })
    .catch(function (err) {
      document.getElementById('adm-sections').innerHTML =
        '<div class="auth-err">Failed to load the settings editor: ' + esc(err.message || String(err)) + '</div>';
    });
})();
