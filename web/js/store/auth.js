/* ============================================================
   auth.js - client-side auth. Replaces app/Auth.php.

   IMPORTANT: this is NOT real security. There is no server to keep a
   secret away from the person using the browser - anyone can open
   devtools, read web/js/store/db.js's localStorage blob, and read
   every password hash or forge a session. This module exists to keep
   the same login / lockout / forced-password-change UX the app had
   before, as a convention, not as an enforcement boundary. See the
   README "Security note".

   Password hashing uses Web Crypto (PBKDF2-SHA256, per-user random
   salt) instead of PHP's password_hash()/bcrypt, since there's no
   server-side secret to protect anyway. crypto.subtle requires a
   secure context (HTTPS or localhost) - see README.
   ============================================================ */
(function () {
  'use strict';

  var SESSION_KEY = 'dsr_session_user_id';
  var MAX_ATTEMPTS = 5;
  var LOCK_MINUTES = 15;
  var PBKDF2_ITERATIONS = 100000;

  var cachedUser; // undefined = not looked up yet; null = looked up, not logged in; object = user row

  function bufToHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  function randomHex(numBytes) {
    var arr = new Uint8Array(numBytes);
    crypto.getRandomValues(arr);
    return bufToHex(arr.buffer);
  }

  function requireSubtleCrypto() {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error(
        'This browser context has no crypto.subtle available (it requires HTTPS or localhost). ' +
        'Password login cannot work over a plain http:// static host - see the README.'
      );
    }
  }

  function hashPassword(password, salt) {
    requireSubtleCrypto();
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits'])
      .then(function (keyMaterial) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
          keyMaterial,
          256
        );
      })
      .then(bufToHex);
  }

  function verifyPassword(password, salt, expectedHash) {
    return hashPassword(password, salt).then(function (h) { return h === expectedHash; });
  }

  /** @return Promise<{salt, hash}> - use when setting/changing a password */
  function saltAndHash(password) {
    var salt = randomHex(16);
    return hashPassword(password, salt).then(function (hash) { return { salt: salt, hash: hash }; });
  }

  function currentUser() {
    if (cachedUser !== undefined) return cachedUser;
    var idRaw = sessionStorage.getItem(SESSION_KEY);
    if (!idRaw) { cachedUser = null; return null; }
    var db = Db.load();
    var id = parseInt(idRaw, 10);
    var user = db.users.filter(function (u) { return u.id === id && u.status === 'active'; })[0];
    if (!user) {
      sessionStorage.removeItem(SESSION_KEY);
      cachedUser = null;
      return null;
    }
    cachedUser = user;
    return user;
  }

  function invalidateCache() { cachedUser = undefined; }

  function pageName() {
    return (location.pathname.split('/').pop() || '').toLowerCase();
  }

  /**
   * Mirrors Auth::requireLogin(): redirects to login (or the forced
   * change-password page) and returns null when that happens - callers
   * MUST check for null and stop (the redirect does not halt script
   * execution in a browser the way PHP's exit() does):
   *   var user = Auth.requireLogin();
   *   if (!user) return;
   */
  function requireLogin() {
    var user = currentUser();
    if (!user) {
      location.href = '/login.html';
      return null;
    }
    var here = pageName();
    if (user.must_change_password && here !== 'change_password.html' && here !== 'logout.html') {
      location.href = '/change_password.html';
      return null;
    }
    return user;
  }

  function login(username, password) {
    var db = Db.load();
    username = String(username || '').trim();
    var user = db.users.filter(function (u) { return u.username === username; })[0];

    if (!user) {
      Audit.log(null, 'LOGIN_FAILED', 'user', null, { username: username, reason: 'no_such_user' });
      return Promise.resolve({ ok: false, error: 'Invalid username or password.' });
    }
    if (user.status !== 'active') {
      Audit.log(user.id, 'LOGIN_FAILED', 'user', user.id, { reason: 'disabled' });
      return Promise.resolve({ ok: false, error: 'This account has been disabled. Contact an administrator.' });
    }
    if (user.locked_until && user.locked_until > Db.now()) {
      Audit.log(user.id, 'LOGIN_FAILED', 'user', user.id, { reason: 'locked' });
      return Promise.resolve({ ok: false, error: 'Too many failed attempts. Try again in a few minutes.' });
    }

    return verifyPassword(password, user.password_salt, user.password_hash).then(function (ok) {
      var db2 = Db.load();
      var u2 = db2.users.filter(function (x) { return x.id === user.id; })[0];
      if (!ok) {
        u2.failed_attempts = (u2.failed_attempts || 0) + 1;
        if (u2.failed_attempts >= MAX_ATTEMPTS) {
          u2.locked_until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
          u2.failed_attempts = 0;
        }
        u2.updated_at = Db.now();
        Db.save(db2);
        Audit.log(u2.id, 'LOGIN_FAILED', 'user', u2.id, { reason: 'bad_password' });
        return { ok: false, error: 'Invalid username or password.' };
      }
      u2.failed_attempts = 0;
      u2.locked_until = null;
      u2.last_login_at = Db.now();
      u2.updated_at = Db.now();
      Db.save(db2);
      sessionStorage.setItem(SESSION_KEY, String(u2.id));
      invalidateCache();
      Audit.log(u2.id, 'LOGIN_SUCCESS', 'user', u2.id);
      return { ok: true };
    });
  }

  function logout() {
    var user = currentUser();
    if (user) Audit.log(user.id, 'LOGOUT', 'user', user.id);
    sessionStorage.removeItem(SESSION_KEY);
    invalidateCache();
  }

  function changePassword(userId, newPassword) {
    return saltAndHash(newPassword).then(function (r) {
      var db = Db.load();
      var u = db.users.filter(function (x) { return x.id === userId; })[0];
      if (!u) throw new Error('User not found.');
      u.password_salt = r.salt;
      u.password_hash = r.hash;
      u.must_change_password = 0;
      u.updated_at = Db.now();
      Db.save(db);
      invalidateCache();
      Audit.log(userId, 'PASSWORD_CHANGED', 'user', userId);
    });
  }

  window.Auth = {
    currentUser: currentUser,
    requireLogin: requireLogin,
    login: login,
    logout: logout,
    changePassword: changePassword,
    hashPassword: hashPassword,
    verifyPassword: verifyPassword,
    saltAndHash: saltAndHash,
    randomHex: randomHex,
    invalidateCache: invalidateCache
  };
})();
