/* ============================================================
   auth.js - login against the hard-coded list in data/users.js.
   The session lives in memory only: closing or refreshing the page
   signs the user out, and nothing is written to the browser.
   ============================================================ */
(function () {
  'use strict';
  var App = window.App = window.App || {};

  function el(id) { return document.getElementById(id); }

  var current = null;

  function findUser(username, password) {
    var name = String(username || '').trim().toLowerCase();
    var list = window.DSR_USERS || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].username.toLowerCase() === name && list[i].password === password) return list[i];
    }
    return null;
  }

  var Auth = window.Auth = {
    current: function () { return current; },
    login: function (username, password) {
      var u = findUser(username, password);
      if (!u) return null;
      current = { username: u.username, name: u.name, staffId: u.staffId || '' };
      return current;
    },
    logout: function () { current = null; },
    showGate: function () {
      var gate = el('login-gate');
      if (!gate) return;
      gate.hidden = false;
      el('login-pass').value = '';
      el('login-msg').textContent = '';
      el('login-user').focus();
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    var form = el('login-form');
    if (!form) return;
    // data/users.js is gitignored in the public repo, so a fresh clone has no
    // accounts until it is copied from the example file.
    if (!window.DSR_USERS || !window.DSR_USERS.length) {
      var msg = el('login-msg');
      if (msg) {
        msg.textContent = 'No user list found. Copy data/users.example.js to data/users.js and add your users.';
        msg.style.color = '#b45309';
      }
      var submit = form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      return;
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var user = Auth.login(el('login-user').value, el('login-pass').value);
      if (!user) {
        el('login-msg').textContent = 'Wrong username or password.';
        el('login-pass').value = '';
        return;
      }
      el('login-msg').textContent = '';
      el('login-gate').hidden = true;
    });
    el('login-user').focus();
  });
})();
