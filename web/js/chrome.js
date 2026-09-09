/* ============================================================
   chrome.js - shared page-to-page navigation shell (sidebar + topbar)
   for every authenticated page except the calculator (index.html has
   its own product-switching sidebar). Replaces
   web/partials/header.php + web/partials/footer.php.

   Usage, at the top of a page's own script:
     var user = Auth.requireLogin();
     if (!user) return;
     Chrome.mount({ user: user, pageTitle: 'Dashboard', activeNav: 'dashboard' });
     var content = document.getElementById('app-content');
     content.innerHTML = '...';
   ============================================================ */
(function () {
  'use strict';

  var ICONS = {
    dashboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
    pf: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
    hf: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><rect x="10" y="14" width="4" height="5.5"/></svg>',
    cc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h5"/></svg>',
    pfcc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="3.5"/><rect x="12" y="12" width="10" height="8" rx="1.5"/><path d="M12 15.5h10"/><path d="M2 20c0-3 2.6-5 6-5"/></svg>',
    hfcc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 9.5 9 4l6.5 5.5"/><path d="M4.5 8.5V16h9V8.5"/><rect x="12" y="13" width="10" height="7.5" rx="1.5"/><path d="M12 16h10"/></svg>',
    pfhf: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="7" r="3.5"/><path d="M1.5 19c0-3.4 2.7-5.5 6-5.5"/><path d="M11 15.5 16.5 11l5.5 4.5"/><path d="M13 14.7V21h7v-6.3"/></svg>',
    cases: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
    admin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 3 6v6c0 5 3.8 8.7 9 10 5.2-1.3 9-5 9-10V6l-9-4Z"/></svg>',
    users: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><path d="M16 8.5a3 3 0 1 0 0-6"/><path d="M18.5 14.3c2 .7 3.5 2.7 3.5 5.2"/></svg>',
    audit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/></svg>',
    settingsClass: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
    settingsPf: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    settingsHf: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><rect x="10" y="14" width="4" height="5.5"/></svg>',
    settingsUnsecured: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0"/></svg>',
    settingsCc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h5"/></svg>',
    settingsCcris: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/></svg>',
    settingsIncome: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l5-5 4 4 8-8"/><path d="M14 8h6v6"/></svg>',
    settingsMatrix: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
    changePassword: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>',
    logout: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
    hamburger: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function navActive(key, active) { return key === active ? ' active' : ''; }

  function link(href, iconKey, label, activeClass) {
    return '<a class="nav-item' + activeClass + '" href="' + href + '">' + ICONS[iconKey] +
      '<span class="nav-txt">' + esc(label) + '</span></a>';
  }

  function settingsLink(sec, iconKey, label, active) {
    return link('/admin/settings.html?sec=' + sec, iconKey, label, navActive('settings', active));
  }

  function navHtml(user, active) {
    var html = '<div class="group-label">' + (user.role === 'admin' ? 'Navigation' : 'Menu') + '</div>';
    // an admin's landing page IS the Admin Dashboard - a second "Dashboard"
    // entry above it just asks which one you meant
    if (user.role !== 'admin') {
      html += link('/dashboard.html', 'dashboard', 'Dashboard', navActive('dashboard', active));
    }

    if (user.role === 'normal') {
      html += '<div class="group-label">Standalone</div>';
      html += link('/index.html#/pf', 'pf', 'Personal Financing (PF)', '');
      html += link('/index.html#/hf', 'hf', 'Home Financing (HF)', '');
      html += link('/index.html#/cc', 'cc', 'Credit Card (CC)', '');
      html += '<div class="group-label">Combo (shared CCRIS + income)</div>';
      html += link('/index.html#/pf-cc', 'pfcc', 'PF + CC', '');
      html += link('/index.html#/hf-cc', 'hfcc', 'HF + CC', '');
      html += link('/index.html#/pf-hf', 'pfhf', 'PF + HF', '');
    } else if (user.role === 'checker') {
      html += link('/cases.html', 'cases', 'My Queue', navActive('cases', active));
    } else if (user.role === 'admin') {
      html += link('/admin/index.html', 'admin', 'Admin Dashboard', navActive('admin', active));
      html += link('/admin/users.html', 'users', 'Users', navActive('users', active));
      html += link('/admin/audit.html', 'audit', 'Audit Log', navActive('audit', active));
      html += '<div class="group-label">Policy Settings</div>';
      html += settingsLink(0, 'settingsClass', 'Customer Class (A / B)', active);
      html += settingsLink(1, 'settingsPf', 'Personal Financing', active);
      html += settingsLink(2, 'settingsHf', 'Home Financing', active);
      html += settingsLink(3, 'settingsUnsecured', 'Unsecured Exposure', active);
      html += settingsLink(4, 'settingsCc', 'Credit Card', active);
      html += settingsLink(5, 'settingsCcris', 'CCRIS Commitments', active);
      html += settingsLink(6, 'settingsIncome', 'Income Recognition', active);
      html += settingsLink(7, 'settingsMatrix', 'PF Pricing Matrices', active);
    }
    return html;
  }

  function mount(opts) {
    var user = opts.user;
    var pageTitle = opts.pageTitle || 'ARBM DSR Calculator';
    var active = opts.activeNav || '';

    document.title = pageTitle + ' | ARBM DSR Calculator';

    document.body.innerHTML =
      '<div class="layout" id="layout">' +
        '<nav class="sidebar no-print" id="sidebar">' +
          '<div class="brand" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
            '<span class="brand-logo">' +
              '<img class="logo-full" src="/public/white_logo_alrajhi.png" alt="Al Rajhi Bank">' +
              '<img class="logo-mark" src="/public/favicon.png" alt="Al Rajhi Bank">' +
            '</span>' +
            '<div class="t2">Financing &amp; DSR Calculator</div>' +
          '</div>' +
          '<div class="sidebar-scroll">' + navHtml(user, active) + '</div>' +
          '<div class="foot">' +
            '<div class="user-chip">' + esc(user.name) + ' &middot; ' + esc(user.role) + '</div>' +
            '<a href="/change_password.html" title="Change password">' + ICONS.changePassword +
              '<span class="nav-txt">Change password</span></a>' +
            (window.Theme ? Theme.button() : '') +
            '<a href="#" id="chrome-logout" title="Logout">' + ICONS.logout +
              '<span class="nav-txt">Logout</span></a>' +
          '</div>' +
        '</nav>' +
        '<main class="main">' +
          '<div class="topbar">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<button class="hamburger no-print" id="btn-menu" type="button" aria-label="Menu">' + ICONS.hamburger + '</button>' +
              '<h1 id="page-title">' + esc(pageTitle) + '</h1>' +
            '</div>' +
          '</div>' +
          '<div class="app-shell" id="app-content"></div>' +
        '</main>' +
      '</div>';

    document.getElementById('chrome-logout').addEventListener('click', function (e) {
      e.preventDefault();
      Auth.logout();
      location.href = '/login.html';
    });
    if (window.Theme) Theme.bind();
    document.getElementById('btn-menu').addEventListener('click', function () {
      document.getElementById('sidebar').classList.toggle('open');
    });
  }

  window.Chrome = { mount: mount, esc: esc };
})();
