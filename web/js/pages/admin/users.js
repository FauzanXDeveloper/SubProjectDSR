/* ============================================================
   admin/users.js - user management (admin only). Replaces
   web/admin/users.php. Plain POST-to-self forms become direct calls
   into store/db.js + store/auth.js, then a full re-render.
   ============================================================ */
(function () {
  'use strict';

  var admin = Auth.requireLogin();
  if (!admin) return;
  if (!Rbac.requireRole(admin, ['admin'])) return;

  var esc = Chrome.esc;
  Chrome.mount({ user: admin, pageTitle: 'Users', activeNav: 'users' });

  var notice = '';
  var error = '';
  var revealPassword = null; // [username, password] shown once after create/reset

  var USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
  var STAFFID_RE = /^[a-zA-Z0-9._-]{1,32}$/;

  function randomPassword() { return Auth.randomHex(9); }

  function doCreate(fields) {
    var username = fields.username.trim();
    var name = fields.name.trim().toUpperCase();
    var staffId = fields.staff_id.trim();
    var email = fields.email.trim() || null;
    var role = fields.role;

    if (['normal', 'checker', 'admin'].indexOf(role) === -1) {
      error = 'Invalid role.';
      return Promise.resolve();
    }
    if (!username || !name || !staffId) {
      error = 'Username, name and staff ID are required.';
      return Promise.resolve();
    }
    if (!USERNAME_RE.test(username)) {
      error = 'Username must be 3-32 characters: letters, numbers, dot, underscore, hyphen.';
      return Promise.resolve();
    }
    if (!STAFFID_RE.test(staffId)) {
      error = 'Staff ID must be 1-32 characters: letters, numbers, dot, underscore, hyphen.';
      return Promise.resolve();
    }
    var db = Db.load();
    if (db.users.some(function (u) { return u.username === username; })) {
      error = 'That username is already taken.';
      return Promise.resolve();
    }

    var password = randomPassword();
    return Auth.saltAndHash(password).then(function (r) {
      var db2 = Db.load();
      var now = Db.now();
      var id = Db.nextId(db2, 'users');
      db2.users.push({
        id: id, username: username, name: name, staff_id: staffId, email: email,
        password_hash: r.hash, password_salt: r.salt,
        role: role, status: 'active', must_change_password: 1,
        failed_attempts: 0, locked_until: null, created_by: admin.id,
        created_at: now, updated_at: now, last_login_at: null
      });
      Db.save(db2);
      Audit.log(admin.id, 'USER_CREATED', 'user', id, { username: username, role: role });
      revealPassword = [username, password];
      notice = 'User "' + username + '" created.';
    });
  }

  function doSetRole(id, role) {
    if (!id || ['normal', 'checker', 'admin'].indexOf(role) === -1) return;
    if (id === admin.id) { error = 'You cannot change your own role.'; return; }
    var db = Db.load();
    var u = db.users.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    u.role = role;
    u.updated_at = Db.now();
    Db.save(db);
    Audit.log(admin.id, 'USER_ROLE_CHANGED', 'user', id, { role: role });
    notice = 'Role updated.';
  }

  function doSetStatus(id, status) {
    if (!id || ['active', 'disabled'].indexOf(status) === -1) return;
    if (id === admin.id) { error = 'You cannot disable your own account.'; return; }
    var db = Db.load();
    var u = db.users.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    u.status = status;
    u.updated_at = Db.now();
    Db.save(db);
    Audit.log(admin.id, 'USER_DISABLED', 'user', id, { status: status });
    notice = 'Status updated.';
  }

  function doSetStaffId(id, staffId) {
    staffId = (staffId || '').trim();
    if (!id || !staffId) { error = 'Staff ID is required.'; return; }
    if (!STAFFID_RE.test(staffId)) {
      error = 'Staff ID must be 1-32 characters: letters, numbers, dot, underscore, hyphen.';
      return;
    }
    var db = Db.load();
    var u = db.users.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    u.staff_id = staffId;
    u.updated_at = Db.now();
    Db.save(db);
    Audit.log(admin.id, 'USER_STAFF_ID_CHANGED', 'user', id, { staff_id: staffId });
    notice = 'Staff ID updated.';
  }

  function doResetPassword(id) {
    var db = Db.load();
    var u = db.users.filter(function (x) { return x.id === id; })[0];
    if (!u) return Promise.resolve();
    var password = randomPassword();
    return Auth.saltAndHash(password).then(function (r) {
      var db2 = Db.load();
      var u2 = db2.users.filter(function (x) { return x.id === id; })[0];
      u2.password_hash = r.hash;
      u2.password_salt = r.salt;
      u2.must_change_password = 1;
      u2.updated_at = Db.now();
      Db.save(db2);
      Audit.log(admin.id, 'PASSWORD_RESET_BY_ADMIN', 'user', id);
      revealPassword = [u2.username, password];
      notice = 'Password reset.';
    });
  }

  function render() {
    var db = Db.load();
    var users = db.users.slice().sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });

    var noticeHtml = notice ? '<div class="notice info">' + esc(notice) + '</div>' : '';
    var errorHtml = error ? '<div class="auth-err" style="margin-bottom:14px">' + esc(error) + '</div>' : '';
    var revealHtml = revealPassword
      ? '<div class="notice">Temporary password for <b>' + esc(revealPassword[0]) + '</b>: ' +
        '<code style="font-size:14px">' + esc(revealPassword[1]) + '</code>' +
        ' &mdash; shown once, note it down. The user must change it on first login.</div>'
      : '';

    var rows = users.map(function (u) {
      var isSelf = u.id === admin.id;
      var roleCell = isSelf
        ? esc(u.role)
        : '<form class="f-role" data-id="' + u.id + '" style="display:inline-flex;gap:6px;align-items:center">' +
          '<select name="role">' +
            ['normal', 'checker', 'admin'].map(function (r) {
              return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + r.charAt(0).toUpperCase() + r.slice(1) + '</option>';
            }).join('') +
          '</select></form>';
      var statusCell = isSelf
        ? '<span class="status-pill approved">active (you)</span>'
        : '<form class="f-status" data-id="' + u.id + '" data-next="' + (u.status === 'active' ? 'disabled' : 'active') + '" style="display:inline">' +
          '<button class="btn small secondary" type="submit">' + (u.status === 'active' ? 'Disable' : 'Enable') + '</button></form>' +
          ' <span class="status-pill ' + (u.status === 'active' ? 'approved' : 'rejected') + '">' + esc(u.status) + '</span>';

      return '<tr>' +
        '<td>' + esc(u.username) + '</td>' +
        '<td>' + esc(u.name) + '</td>' +
        '<td><form class="f-staffid" data-id="' + u.id + '" style="display:inline-flex;gap:6px;align-items:center">' +
          '<input type="text" name="staff_id" value="' + esc(u.staff_id || '') + '" placeholder="-" style="width:90px"></form></td>' +
        '<td>' + esc(u.email || '-') + '</td>' +
        '<td>' + roleCell + '</td>' +
        '<td>' + statusCell + '</td>' +
        '<td>' + esc(u.last_login_at ? Db.dateTime(u.last_login_at) : 'never') + '</td>' +
        '<td><form class="f-reset" data-id="' + u.id + '" style="display:inline">' +
          '<button class="btn small secondary" type="submit">Reset password</button></form></td>' +
        '</tr>';
    }).join('');

    document.getElementById('app-content').innerHTML =
      noticeHtml + errorHtml + revealHtml +
      '<div class="card"><div class="card-head"><span>New user</span></div><div class="card-body">' +
        '<form id="f-create" autocomplete="off">' +
        '<div class="grid c4">' +
          '<div class="field"><label>Username</label><input type="text" name="username" required autocomplete="off"></div>' +
          '<div class="field"><label>Full name</label><input type="text" name="name" required autocomplete="off" style="text-transform:uppercase"></div>' +
          '<div class="field"><label>Staff ID</label><input type="text" name="staff_id" required autocomplete="off"></div>' +
          '<div class="field"><label>Email (optional)</label><input type="text" name="email" autocomplete="off"></div>' +
          '<div class="field"><label>Role</label><select name="role">' +
            '<option value="normal">Normal (maker)</option><option value="checker">Checker</option><option value="admin">Admin</option>' +
          '</select></div>' +
        '</div>' +
        '<button class="btn" type="submit" style="margin-top:10px">Create user</button>' +
        '</form>' +
      '</div></div>' +
      '<div class="card"><div class="card-head"><span>All users (' + users.length + ')</span></div><div class="card-body">' +
        '<div class="tbl-wrap"><table class="data"><thead><tr><th>Username</th><th>Name</th><th>Staff ID</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
      '</div></div>';

    wireEvents();
  }

  function wireEvents() {
    var content = document.getElementById('app-content');

    content.querySelector('#f-create').addEventListener('submit', function (e) {
      e.preventDefault();
      error = ''; notice = ''; revealPassword = null;
      var f = e.target;
      doCreate({
        username: f.username.value, name: f.name.value, staff_id: f.staff_id.value,
        email: f.email.value, role: f.role.value
      }).then(render);
    });

    content.querySelectorAll('.f-role').forEach(function (f) {
      f.querySelector('select').addEventListener('change', function () {
        error = ''; notice = ''; revealPassword = null;
        doSetRole(parseInt(f.dataset.id, 10), f.querySelector('select').value);
        render();
      });
    });

    content.querySelectorAll('.f-status').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        error = ''; notice = ''; revealPassword = null;
        doSetStatus(parseInt(f.dataset.id, 10), f.dataset.next);
        render();
      });
    });

    content.querySelectorAll('.f-staffid').forEach(function (f) {
      var input = f.querySelector('input[name="staff_id"]');
      var original = input.value;
      input.addEventListener('blur', function () {
        if (input.value.trim() && input.value !== original) {
          error = ''; notice = ''; revealPassword = null;
          doSetStaffId(parseInt(f.dataset.id, 10), input.value);
          render();
        }
      });
      f.addEventListener('submit', function (e) { e.preventDefault(); });
    });

    content.querySelectorAll('.f-reset').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var db = Db.load();
        var u = db.users.filter(function (x) { return x.id === parseInt(f.dataset.id, 10); })[0];
        if (!u || !confirm('Reset password for ' + u.username + '?')) return;
        error = ''; notice = ''; revealPassword = null;
        doResetPassword(parseInt(f.dataset.id, 10)).then(render);
      });
    });
  }

  render();
})();
