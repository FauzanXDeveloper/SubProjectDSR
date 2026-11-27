/* ---------------- sign-in ---------------- */

(function () {
  'use strict';

  window.App = window.App || {};
  var signedInUser = null;

  function findUser(username, password) {
    var usernameToFind = String(username || '').trim().toLowerCase();
    var userList = window.DSR_USERS || [];
    var hasher = window.DSRPasswordHash;

    for (var index = 0; index < userList.length; index++) {
      var user = userList[index];
      if (!user || typeof user.username !== 'string') {
        continue;
      }
      if (user.username.toLowerCase() !== usernameToFind) {
        continue;
      }

      /* Hashed entry (preferred) */
      if (user.hash && user.salt && hasher) {
        if (hasher.verify(password, user.salt, user.hash, user.iterations)) {
          return user;
        }
        continue;
      }

      /* Legacy plaintext entry — still works, but insecure. Convert it. */
      if (typeof user.password === 'string' && user.password === password) {
        if (window.console && console.warn) {
          console.warn('[auth] Plaintext password detected for "' + user.username +
            '". Convert it with tools/hash-generator.html.');
        }
        return user;
      }
    }

    return null;
  }

  var Auth = window.Auth = {

    current: function () {
      return signedInUser;
    },

    login: function (username, password) {
      var matchedUser = findUser(username, password);
      if (!matchedUser) {
        return null;
      }

      signedInUser = {
        username: matchedUser.username,
        name: matchedUser.name,
        staffId: matchedUser.staffId || ''
      };

      return signedInUser;
    },

    logout: function () {
      signedInUser = null;
    },

    showGate: function () {

      document.body.classList.add('auth-locked');

      var gate = document.getElementById('login-gate');
      if (!gate) {
        return;
      }

      gate.hidden = false;
      document.getElementById('login-pass').value = '';
      document.getElementById('login-msg').textContent = '';
      document.getElementById('login-user').focus();
    }
  };

  /* ---------------- login form ---------------- */
document.addEventListener('DOMContentLoaded', function () {
    var loginForm = document.getElementById('login-form');
    if (!loginForm) {
      return;
    }

    if (!signedInUser) {
      document.body.classList.add('auth-locked');
      var lockGuard = new MutationObserver(function () {
        if (!signedInUser && !document.body.classList.contains('auth-locked')) {
          document.body.classList.add('auth-locked');
        }
      });
      lockGuard.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    if (!window.DSR_USERS || !window.DSR_USERS.length) {
      var messageElement = document.getElementById('login-msg');
      if (messageElement) {
        messageElement.textContent =
          'No user list found. Copy data/users.example.js to data/users.js and add your users.';
        messageElement.style.color = '#b45309';
      }

      var submitButton = loginForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = true;
      }
      return;
    }

    loginForm.addEventListener('submit', function (event) {
      event.preventDefault();

      var user = Auth.login(
        document.getElementById('login-user').value,
        document.getElementById('login-pass').value
      );

      if (!user) {
        document.getElementById('login-msg').textContent = 'Wrong username or password.';
        document.getElementById('login-pass').value = '';
        return;
      }

      document.getElementById('login-msg').textContent = '';
      document.body.classList.remove('auth-locked');
      document.getElementById('login-gate').hidden = true;
    });

    document.getElementById('login-user').focus();
  });
})();
