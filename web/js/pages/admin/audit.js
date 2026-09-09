/* ============================================================
   admin/audit.js - full audit log (admin only). Replaces
   web/admin/audit.php.
   ============================================================ */
(function () {
  'use strict';

  var admin = Auth.requireLogin();
  if (!admin) return;
  if (!Rbac.requireRole(admin, ['admin'])) return;

  var esc = Chrome.esc;
  Chrome.mount({ user: admin, pageTitle: 'Audit Log', activeNav: 'audit' });

  var params = new URLSearchParams(location.search);
  var page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  var filters = {
    actor_user_id: params.get('actor') || '',
    action: params.get('action') || '',
    from: params.get('from') || '',
    to: params.get('to') || ''
  };

  var result = Audit.search(filters, page, 50);
  var totalPages = Math.max(1, Math.ceil(result.total / 50));

  var db = Db.load();
  var users = db.users.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  var actions = Array.from(new Set(db.auditLog.map(function (a) { return a.action; }))).sort();

  function qs(overrides) {
    var merged = {};
    params.forEach(function (v, k) { merged[k] = v; });
    Object.keys(overrides).forEach(function (k) { merged[k] = overrides[k]; });
    var usp = new URLSearchParams();
    Object.keys(merged).forEach(function (k) { if (merged[k] !== '') usp.set(k, merged[k]); });
    var s = usp.toString();
    return s ? '?' + s : '';
  }

  var actorOptions = '<option value="">All users</option>' + users.map(function (u) {
    return '<option value="' + u.id + '"' + (String(u.id) === String(filters.actor_user_id) ? ' selected' : '') + '>' + esc(u.name) + '</option>';
  }).join('');
  var actionOptions = '<option value="">All actions</option>' + actions.map(function (a) {
    return '<option value="' + esc(a) + '"' + (a === filters.action ? ' selected' : '') + '>' + esc(a) + '</option>';
  }).join('');

  var rows = result.rows.map(function (a) {
    return '<tr>' +
      '<td>' + esc(Db.dateTime(a.created_at)) + '</td>' +
      '<td>' + esc(a.actor_name || a.actor_username || 'system') + '</td>' +
      '<td>' + esc(a.action) + '</td>' +
      '<td>' + esc(a.target_type ? a.target_type + ' #' + a.target_id : '-') + '</td>' +
      '<td style="max-width:340px;white-space:normal;word-break:break-word;font-size:12px;color:var(--muted)">' +
        esc(a.details ? JSON.stringify(a.details) : '') + '</td>' +
      '<td>-</td>' +
      '</tr>';
  }).join('');

  var pagination = '';
  for (var p = 1; p <= totalPages; p++) {
    pagination += (p === page)
      ? '<span class="cur">' + p + '</span>'
      : '<a href="/admin/audit.html' + qs({ page: String(p) }) + '">' + p + '</a>';
  }

  document.getElementById('app-content').innerHTML =
    '<div class="sub">' + result.total + ' event' + (result.total === 1 ? '' : 's') + '</div>' +
    '<form id="filter-form" class="toolbar">' +
      '<select name="actor">' + actorOptions + '</select>' +
      '<select name="action">' + actionOptions + '</select>' +
      '<input type="text" name="from" placeholder="From (YYYY-MM-DD)" value="' + esc(filters.from) + '" style="width:160px">' +
      '<input type="text" name="to" placeholder="To (YYYY-MM-DD)" value="' + esc(filters.to) + '" style="width:160px">' +
      '<button class="btn small" type="submit">Filter</button>' +
      '<a class="btn small secondary" href="/admin/audit.html">Reset</a>' +
    '</form>' +
    '<div class="card"><div class="card-body">' +
      '<div class="tbl-wrap"><table class="data"><thead><tr><th>When (' + Db.TZ_LABEL + ')</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th><th>IP</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="pagination">' + pagination + '</div>' +
    '</div></div>';

  document.getElementById('filter-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    location.href = '/admin/audit.html' + qs({
      actor: f.actor.value, action: f.action.value, from: f.from.value, to: f.to.value, page: ''
    });
  });
})();
