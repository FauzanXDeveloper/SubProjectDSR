/* ============================================================
   rbac.js - role gate. Replaces app/Rbac.php. Not real security (see
   auth.js header) - just keeps pages showing the same "you shouldn't
   be here" behavior for the wrong role.

   Usage (call after Auth.requireLogin()):
     var user = Auth.requireLogin();
     if (!user) return;
     if (!Rbac.requireRole(user, ['admin'])) return;
   ============================================================ */
(function () {
  'use strict';

  function requireRole(user, roles) {
    var ok = !!user && roles.indexOf(user.role) !== -1;
    if (!ok) {
      document.title = '403 Forbidden';
      document.body.innerHTML =
        '<div style="padding:60px 24px;font:15px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;' +
        'max-width:480px;margin:0 auto;text-align:center;color:#1b2733">' +
        '<h1 style="font-size:20px;margin-bottom:8px">403 &mdash; Forbidden</h1>' +
        '<p>You do not have permission to view this page.</p>' +
        '<p><a href="/dashboard.html">Back to dashboard</a></p>' +
        '</div>';
    }
    return ok;
  }

  window.Rbac = { requireRole: requireRole };
})();
