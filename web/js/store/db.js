/* ============================================================
   db.js - the "database". Replaces app/Db.php + migrations/schema.sql +
   storage/dsr.sqlite. Everything (users, cases, audit log, policy
   config) lives as one JSON blob in localStorage, keyed by STORAGE_KEY.

   There is no server, so there is no real access control here - any
   script running on this origin can read/write this blob via devtools.
   See README "Security note".

   Export/Import let an admin download the whole database as a .json
   file (and re-upload it later, e.g. to move data between browsers or
   to seed a fresh deployment before publishing a static snapshot).
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'dsr_db_v1';
  var cache = null;

  function nowIso() {
    return new Date().toISOString().replace(/(\.\d{3})\d*Z$/, '$1Z');
  }

  /* ---- display time ----------------------------------------------------
     Timestamps are STORED as UTC ISO strings (nowIso above) so they sort
     lexicographically and survive an export/import between machines in
     different zones. They are DISPLAYED in Malaysia time, which is what
     every user of this tool is actually on.

     MYT is a flat UTC+8 with no daylight saving (and none since 1982), so
     a fixed offset is exact - no need to drag in a timezone library. Shift
     the instant by +8h and read the UTC fields back out, which avoids
     depending on whatever zone the browser happens to be set to.
     -------------------------------------------------------------------- */
  var TZ_OFFSET_MIN = 8 * 60;    // Malaysia Time (MYT), UTC+8, no DST
  var TZ_LABEL = 'MYT';

  function shifted(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getTime() + TZ_OFFSET_MIN * 60000);
  }

  /** "2026-08-28 14:32:05" in MYT, or '' for a missing/unparseable value. */
  function localDateTime(iso) {
    var d = shifted(iso);
    if (!d) return iso ? String(iso) : '';
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  /** "2026-08-28" in MYT - the calendar day a record belongs to locally. */
  function localDate(iso) {
    var d = shifted(iso);
    if (!d) return iso ? String(iso).slice(0, 10) : '';
    return d.toISOString().slice(0, 10);
  }

  /** Today's date in MYT, for "last 14 days" style ranges. */
  function today() {
    return localDate(new Date().toISOString());
  }

  function emptyDb() {
    return {
      meta: { schemaVersion: 1 },
      users: [],
      cases: [],
      auditLog: [],
      policyConfig: { config: {}, updated_by: null, updated_at: null },
      seq: { users: 0, cases: 0, auditLog: 0 }
    };
  }

  function normalize(db) {
    db = db && typeof db === 'object' ? db : emptyDb();
    db.meta = db.meta || { schemaVersion: 1 };
    db.users = Array.isArray(db.users) ? db.users : [];
    db.cases = Array.isArray(db.cases) ? db.cases : [];
    db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : [];
    db.policyConfig = db.policyConfig || { config: {}, updated_by: null, updated_at: null };
    db.seq = db.seq || { users: 0, cases: 0, auditLog: 0 };
    return db;
  }

  function load() {
    if (cache) return cache;
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* storage unavailable */ }
    if (!raw) {
      cache = emptyDb();
      save(cache);
      return cache;
    }
    try {
      cache = normalize(JSON.parse(raw));
    } catch (e) {
      cache = emptyDb();
    }
    return cache;
  }

  function save(db) {
    cache = db;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('Could not save to browser storage: ' + (e && e.message ? e.message : e));
    }
  }

  function nextId(db, table) {
    db.seq[table] = (db.seq[table] || 0) + 1;
    return db.seq[table];
  }

  function exportJSON() {
    return JSON.stringify(load(), null, 2);
  }

  function importJSON(jsonText) {
    var parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      throw new Error('That file is not valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.users)) {
      throw new Error('That file does not look like a DSR database export.');
    }
    save(normalize(parsed));
    return cache;
  }

  function downloadExport() {
    var json = exportJSON();
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    var a = document.createElement('a');
    a.href = url;
    a.download = 'dsr-database-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.Db = {
    load: load,
    save: save,
    nextId: nextId,
    now: nowIso,
    dateTime: localDateTime,
    date: localDate,
    today: today,
    TZ_LABEL: TZ_LABEL,
    exportJSON: exportJSON,
    importJSON: importJSON,
    downloadExport: downloadExport
  };
})();
