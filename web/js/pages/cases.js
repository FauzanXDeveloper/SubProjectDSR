/* ============================================================
   cases.js (page) - full case list/queue. Replaces web/cases.php.
   ============================================================ */
(function () {
  'use strict';

  var user = Auth.requireLogin();
  if (!user) return;

  if (user.role === 'admin') {
    // admins get case oversight via the Admin Dashboard, not a queue
    location.href = '/admin/index.html';
    return;
  }

  var esc = Chrome.esc;
  var params = new URLSearchParams(location.search);
  var statusFilter = params.get('status') || '';

  var STATUS_LABEL = { draft: 'Draft', pending_checker: 'Pending Checker', returned: 'Returned',
    approved: 'Approved', rejected: 'Rejected' };
  function statusLabel(s) { return STATUS_LABEL[s] || s; }

  var title = user.role === 'normal' ? 'My Cases' : 'My Queue';
  Chrome.mount({ user: user, pageTitle: title, activeNav: 'cases' });

  var rows = Cases.listForUser(user);
  if (statusFilter) {
    rows = rows.filter(function (r) { return r.status === statusFilter; });
  }

  function filterLink(status, label) {
    var active = statusFilter === status;
    var href = status ? ('/cases.html?status=' + status) : '/cases.html';
    return '<a class="btn small' + (active ? '' : ' secondary') + '" href="' + href + '">' + esc(label) + '</a>';
  }

  var toolbar = filterLink('', 'All') + filterLink('pending_checker', 'Pending') +
    filterLink('returned', 'Returned') +
    filterLink('approved', 'Approved') + filterLink('rejected', 'Rejected');

  var tableRows = rows.map(function (r) {
    var returnedBadge = (r.return_count || 0) > 0 && r.status !== 'returned'
      ? ' <span class="status-pill returned" title="Sent back to the maker ' + r.return_count +
        ' time' + (r.return_count === 1 ? '' : 's') + '">Returned &times;' + r.return_count + '</span>'
      : '';
    var editedBadge = (r.edit_count || 0) > 0
      ? ' <span class="status-pill pending_checker" title="Edited ' + r.edit_count + ' time' + (r.edit_count === 1 ? '' : 's') + ' since submission">Edited</span>'
      : '';
    return '<tr>' +
      '<td>' + esc(r.reference) + '</td>' +
      '<td>' + esc(r.customer_name || '-') + '</td>' +
      '<td>' + esc(r.customer_ic || '-') + '</td>' +
      '<td>' + esc(r.mode.toUpperCase()) + '</td>' +
      '<td class="num">' + (r.gross_income != null ? Number(r.gross_income).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-') + '</td>' +
      '<td class="num">' + (r.dsr_value != null ? (Number(r.dsr_value) * 100).toFixed(2) + '%' : '-') + '</td>' +
      '<td>' + esc(r.maker_name || '-') + '</td>' +
      '<td>' + esc(r.checker_name || '-') + '</td>' +
      '<td><span class="status-pill ' + esc(r.status) + '"' +
        (r.status === 'returned' && r.return_notes ? ' title="' + esc(r.return_notes) + '"' : '') +
        '>' + esc(statusLabel(r.status)) + '</span>' + returnedBadge + editedBadge + '</td>' +
      '<td>' + esc(r.submitted_at ? Db.date(r.submitted_at) : '-') + '</td>' +
      '<td><a href="/index.html?case=' + r.id + '">Open</a></td>' +
      '</tr>';
  }).join('');

  var tableHtml = !rows.length
    ? '<p class="sub" style="margin:0">No cases found.</p>'
    : '<div class="tbl-wrap"><table class="data">' +
      '<thead><tr><th>Reference</th><th>Customer</th><th>IC</th><th>Mode</th>' +
      '<th class="num">Gross</th><th class="num">DSR</th>' +
      '<th>Maker</th><th>Checker</th><th>Status</th><th>Submitted</th><th></th></tr></thead>' +
      '<tbody>' + tableRows + '</tbody></table></div>';

  document.getElementById('app-content').innerHTML =
    '<div class="sub">' + rows.length + ' case' + (rows.length === 1 ? '' : 's') +
      (statusFilter ? ' - filtered by ' + esc(statusLabel(statusFilter)) : '') + '</div>' +
    '<div class="toolbar">' + toolbar + '</div>' +
    '<div class="card"><div class="card-body">' + tableHtml + '</div></div>';
})();
