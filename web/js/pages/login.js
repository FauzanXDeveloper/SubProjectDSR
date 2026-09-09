/* ============================================================
   login.js - sign-in screen. Replaces web/login.php.

   Two states:
   - No users exist yet in the browser's database: show a one-time
     "set up the first admin account" form (replaces bin/seed_admin.php -
     there's no CLI/out-of-band channel in a static app, so the first
     admin just picks their own username/password directly instead of
     being handed a temporary one to change on first login).
   - Otherwise: the normal sign-in form.
   ============================================================ */
(function () {
  'use strict';

  /** Where a signed-in user belongs. Admins land on the admin dashboard -
      their sidebar has no plain "Dashboard" entry to get back to. */
  function landing() {
    var u = Auth.currentUser();
    return (u && u.role === 'admin') ? '/admin/index.html' : '/dashboard.html';
  }


  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var box = document.getElementById('auth-box');

  function brandHtml(subtitle) {
    return '<div class="abrand">' +
      '<img src="/public/alrajhi_logo.png" alt="Al Rajhi Bank">' +
      '<div class="t">Financing &amp; DSR Calculator<br>Internal Credit Evaluation System</div>' +
      '</div>' +
      '<h1 class="auth-title">' + esc(subtitle.title) + '</h1>' +
      '<p class="auth-sub">' + esc(subtitle.sub) + '</p>';
  }

  function renderFirstRun() {
    box.innerHTML = brandHtml({
      title: 'Set up the first admin account',
      sub: 'No accounts exist yet in this browser. Create the first administrator to get started.'
    }) +
      '<div id="auth-err-slot"></div>' +
      '<form id="setup-form" autocomplete="off">' +
      '<label for="su-username">Username</label>' +
      '<div class="auth-field"><input type="text" id="su-username" required autofocus autocomplete="off"></div>' +
      '<label for="su-name">Full name</label>' +
      '<div class="auth-field"><input type="text" id="su-name" required autocomplete="off" style="text-transform:uppercase"></div>' +
      '<label for="su-password">Password (min. 8 characters)</label>' +
      '<div class="auth-field"><input type="password" id="su-password" minlength="8" required autocomplete="new-password"></div>' +
      '<label for="su-confirm">Confirm password</label>' +
      '<div class="auth-field"><input type="password" id="su-confirm" minlength="8" required autocomplete="new-password"></div>' +
      '<button class="btn" type="submit">Create admin account &amp; sign in</button>' +
      '</form>';

    document.getElementById('setup-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var username = document.getElementById('su-username').value.trim();
      var name = document.getElementById('su-name').value.trim().toUpperCase();
      var password = document.getElementById('su-password').value;
      var confirm = document.getElementById('su-confirm').value;
      var errSlot = document.getElementById('auth-err-slot');
      errSlot.innerHTML = '';

      if (!username || !name) {
        errSlot.innerHTML = '<div class="auth-err">Username and name are required.</div>';
        return;
      }
      if (password.length < 8) {
        errSlot.innerHTML = '<div class="auth-err">Password must be at least 8 characters.</div>';
        return;
      }
      if (password !== confirm) {
        errSlot.innerHTML = '<div class="auth-err">Password and confirmation do not match.</div>';
        return;
      }

      Auth.saltAndHash(password).then(function (r) {
        var db = Db.load();
        var now = Db.now();
        var id = Db.nextId(db, 'users');
        db.users.push({
          id: id, username: username, name: name, staff_id: null, email: null,
          password_hash: r.hash, password_salt: r.salt,
          role: 'admin', status: 'active', must_change_password: 0,
          failed_attempts: 0, locked_until: null, created_by: null,
          created_at: now, updated_at: now, last_login_at: null
        });
        Db.save(db);
        Audit.log(id, 'USER_CREATED', 'user', id, { username: username, role: 'admin', via: 'first_run_setup' });
        return Auth.login(username, password);
      }).then(function (result) {
        if (result.ok) {
          location.href = landing();
        } else {
          document.getElementById('auth-err-slot').innerHTML = '<div class="auth-err">' + esc(result.error) + '</div>';
        }
      }).catch(function (err) {
        document.getElementById('auth-err-slot').innerHTML = '<div class="auth-err">' + esc(err.message || String(err)) + '</div>';
      });
    });
  }

  function renderLogin() {
    box.innerHTML = brandHtml({ title: 'Sign in', sub: 'Enter the credentials your administrator gave you.' }) +
      '<div id="auth-err-slot"></div>' +
      '<form id="login-form" autocomplete="off">' +
      '<label for="username">Username</label>' +
      '<div class="auth-field">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>' +
        '<input type="text" id="username" autocomplete="username" required autofocus>' +
      '</div>' +
      '<label for="password">Password</label>' +
      '<div class="auth-field">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>' +
        '<input type="password" id="password" autocomplete="current-password" required>' +
      '</div>' +
      '<button class="btn" type="submit">Sign in</button>' +
      '</form>' +
      '<p class="auth-foot">Need an account or a password reset? Contact your system administrator.</p>';

    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var username = document.getElementById('username').value;
      var password = document.getElementById('password').value;
      var errSlot = document.getElementById('auth-err-slot');
      errSlot.innerHTML = '';
      if (!username.trim() || !password) {
        errSlot.innerHTML = '<div class="auth-err">Enter your username and password.</div>';
        return;
      }
      Auth.login(username, password).then(function (result) {
        if (result.ok) {
          location.href = landing();
        } else {
          errSlot.innerHTML = '<div class="auth-err">' + esc(result.error) + '</div>';
        }
      }).catch(function (err) {
        errSlot.innerHTML = '<div class="auth-err">' + esc(err.message || String(err)) + '</div>';
      });
    });
  }

  // already logged in -> straight to wherever this role belongs
  if (Auth.currentUser()) {
    location.href = landing();
  } else if (Db.load().users.length === 0) {
    renderFirstRun();
  } else {
    renderLogin();
  }
})();
