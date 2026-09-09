/* ============================================================
   audit.js - append-only audit trail. Replaces app/Audit.php.
   Writes into the same JSON blob db.js manages (db.auditLog).
   ============================================================ */
(function () {
  'use strict';

  function log(actorUserId, action, targetType, targetId, details) {
    var db = Db.load();
    var entry = {
      id: Db.nextId(db, 'auditLog'),
      actor_user_id: actorUserId == null ? null : actorUserId,
      action: action,
      target_type: targetType || null,
      target_id: targetId == null ? null : targetId,
      details: (details && Object.keys(details).length) ? details : null,
      created_at: Db.now()
    };
    db.auditLog.push(entry);
    Db.save(db);
    return entry;
  }

  /** @return {rows: array, total: number} */
  function search(filters, page, perPage) {
    filters = filters || {};
    perPage = perPage || 50;
    var db = Db.load();
    var rows = db.auditLog.slice().sort(function (a, b) { return b.id - a.id; });

    if (filters.actor_user_id) {
      var actorId = parseInt(filters.actor_user_id, 10);
      rows = rows.filter(function (r) { return r.actor_user_id === actorId; });
    }
    if (filters.action) {
      rows = rows.filter(function (r) { return r.action === filters.action; });
    }
    if (filters.from) {
      rows = rows.filter(function (r) { return r.created_at >= filters.from; });
    }
    if (filters.to) {
      rows = rows.filter(function (r) { return r.created_at <= filters.to; });
    }

    var total = rows.length;
    var offset = Math.max(0, (page - 1) * perPage);
    var pageRows = rows.slice(offset, offset + perPage).map(function (r) {
      var u = db.users.filter(function (x) { return x.id === r.actor_user_id; })[0];
      var out = {};
      Object.keys(r).forEach(function (k) { out[k] = r[k]; });
      out.actor_username = u ? u.username : null;
      out.actor_name = u ? u.name : null;
      return out;
    });

    return { rows: pageRows, total: total };
  }

  window.Audit = { log: log, search: search };
})();
