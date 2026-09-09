/* ============================================================
   changePassword.js - "change my password" screen. Replaces
   web/change_password.php.
   ============================================================ */
(function () {
  'use strict';

  var user = Auth.requireLogin();
  if (!user) return;

  var box = document.getElementById('auth-box');
  var forced = !!user.must_change_password;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderForm() {
    box.innerHTML =
      '<div class="abrand">' +
        '<img src="/public/alrajhi_logo.png" alt="Al Rajhi Bank">' +
        '<div class="t">Financing &amp; DSR Calculator<br>Internal Credit Evaluation System</div>' +
      '</div>' +
      '<h1 class="auth-title">Change password</h1>' +
      '<p class="auth-sub">' + (forced ? 'You must set a new password before continuing.' : 'Update the password for your account.') + '</p>' +
      '<div id="cp-err-slot"></div>' +
      '<form id="cp-form" autocomplete="off">' +
      '<label for="current_password">Current password</label>' +
      '<div class="auth-field"><input type="password" id="current_password" autocomplete="current-password" required autofocus></div>' +
      '<label for="new_password">New password (min. 8 characters)</label>' +
      '<div class="auth-field"><input type="password" id="new_password" autocomplete="new-password" minlength="8" required></div>' +
      '<label for="confirm_password">Confirm new password</label>' +
      '<div class="auth-field"><input type="password" id="confirm_password" autocomplete="new-password" minlength="8" required></div>' +
      '<button class="btn" type="submit">Update password</button>' +
      '</form>' +
      (forced ? '' : '<p class="auth-foot"><a href="/dashboard.html">&larr; Back to dashboard</a></p>');

    document.getElementById('cp-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var current = document.getElementById('current_password').value;
      var next = document.getElementById('new_password').value;
      var confirm = document.getElementById('confirm_password').value;
      var errSlot = document.getElementById('cp-err-slot');
      errSlot.innerHTML = '';

      Auth.verifyPassword(current, user.password_salt, user.password_hash).then(function (currentOk) {
        if (!currentOk) {
          errSlot.innerHTML = '<div class="auth-err">Current password is incorrect.</div>';
          return;
        }
        if (next.length < 8) {
          errSlot.innerHTML = '<div class="auth-err">New password must be at least 8 characters.</div>';
          return;
        }
        if (next !== confirm) {
          errSlot.innerHTML = '<div class="auth-err">New password and confirmation do not match.</div>';
          return;
        }
        return Auth.verifyPassword(next, user.password_salt, user.password_hash).then(function (sameAsOld) {
          if (sameAsOld) {
            errSlot.innerHTML = '<div class="auth-err">New password must be different from the current one.</div>';
            return;
          }
          return Auth.changePassword(user.id, next).then(function () {
            renderDone();
          });
        });
      }).catch(function (err) {
        errSlot.innerHTML = '<div class="auth-err">' + esc(err.message || String(err)) + '</div>';
      });
    });
  }

  function renderDone() {
    box.innerHTML =
      '<div class="abrand">' +
        '<img src="/public/alrajhi_logo.png" alt="Al Rajhi Bank">' +
        '<div class="t">Financing &amp; DSR Calculator<br>Internal Credit Evaluation System</div>' +
      '</div>' +
      '<h1 class="auth-title">Change password</h1>' +
      '<div class="notice info">Password updated. <a href="/dashboard.html">Continue to dashboard &rarr;</a></div>';
  }

  renderForm();
})();
