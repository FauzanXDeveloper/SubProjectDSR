/* ============================================================
   cases.js - repository helpers for the "cases" collection. Replaces
   app/Cases.php, ported method-for-method from SQL to array filtering
   over the JSON blob db.js manages.
   ============================================================ */
(function () {
  'use strict';

  function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }
  function round4(n) { return Math.round(Number(n || 0) * 10000) / 10000; }
  function pad6(n) { return ('000000' + n).slice(-6); }

  /**
   * One entry in a case's comment thread. The author's name/role are
   * copied in at write time (not looked up on render) so the thread still
   * reads correctly after a user is renamed or deactivated - the same
   * reason the audit log stores its own details blob.
   */
  function pushComment(row, user, type, text) {
    if (!Array.isArray(row.comments)) row.comments = [];
    row.comments.push({
      type: type,                 // RETURNED | RESUBMITTED | APPROVED | REJECTED
      by: user ? user.id : null,
      by_name: (user && user.name) || null,
      by_role: (user && user.role) || null,
      text: text || '',
      at: Db.now()
    });
  }

  function userById(db, id) {
    return db.users.filter(function (u) { return u.id === id; })[0] || null;
  }

  function nextReference() {
    var db = Db.load();
    var year = String(new Date().getUTCFullYear());
    var prefix = 'DSR-' + year + '-';
    var n = db.cases.filter(function (c) { return c.reference.indexOf(prefix) === 0; }).length + 1;
    return prefix + pad6(n);
  }

  /** Create a submitted case directly (maker -> chosen checker). */
  function submit(makerId, checkerId, mode, snapshot) {
    var db = Db.load();
    var state = (snapshot && snapshot.state) || {};
    var results = (snapshot && snapshot.results) || {};
    var computed = (snapshot && snapshot.computed) || {};
    var customer = state.customer || {};
    var now = Db.now();
    var reference = nextReference();
    var id = Db.nextId(db, 'cases');

    var row = {
      id: id,
      reference: reference,
      created_by: makerId,
      assigned_checker_id: checkerId,
      mode: mode,
      status: 'pending_checker',
      customer_name: customer.name || null,
      customer_ic: customer.ic || null,
      customer_type: customer.type || null,
      customer_class: customer.cardType || null,
      iscore: (state.iScore !== undefined && state.iScore !== '') ? state.iScore : null,
      report_date: state.reportDate || null,
      gross_income: round2(computed.grossIncome || 0),
      net_income: round2(computed.netIncome || 0),
      verdict: results.verdict || null,
      dsr_value: (results.dsr !== undefined) ? round4(results.dsr) : null,
      ndi_value: (results.ndi !== undefined) ? round2(results.ndi) : null,
      payload: snapshot,
      submitted_at: now,
      decided_at: null,
      decision_notes: null,
      edit_count: 0,
      edited_at: null,
      // maker <-> checker "send back for amendment" loop
      return_count: 0,
      returned_at: null,
      return_notes: null,
      resubmitted_at: null,
      comments: [],
      created_at: now,
      updated_at: now
    };
    db.cases.push(row);
    Db.save(db);
    Audit.log(makerId, 'CASE_SUBMITTED', 'case', id, { reference: reference, checker_id: checkerId });
    return id;
  }

  function find(id) {
    var db = Db.load();
    return db.cases.filter(function (c) { return c.id === id; })[0] || null;
  }

  /** Read access: the maker who created it, the assigned checker, or any admin. */
  function canView(caseRow, user) {
    return user.role === 'admin'
      || caseRow.created_by === user.id
      || caseRow.assigned_checker_id === user.id;
  }

  /** @param checkerSignoff optional {checkerName,checkerId,checkerDate,checkerSignature} merged into the stored payload */
  function decide(id, checkerId, status, notes, checkerSignoff) {
    if (['approved', 'rejected'].indexOf(status) === -1) {
      throw new Error('bad status');
    }
    var db = Db.load();
    var row = db.cases.filter(function (c) {
      return c.id === id && c.assigned_checker_id === checkerId && c.status === 'pending_checker';
    })[0];
    if (!row) {
      throw new Error('Case not found, not assigned to you, or already decided.');
    }

    var payload = row.payload || {};
    if (checkerSignoff && payload.state && typeof payload.state === 'object') {
      payload.state.signoff = Object.assign({}, payload.state.signoff || {}, checkerSignoff);
    }

    var now = Db.now();
    row.status = status;
    row.decided_at = now;
    row.decision_notes = notes || null;
    row.payload = payload;
    row.updated_at = now;
    pushComment(row, userById(db, checkerId), status === 'approved' ? 'APPROVED' : 'REJECTED', notes || '');
    Db.save(db);

    Audit.log(checkerId, status === 'approved' ? 'CASE_APPROVED' : 'CASE_REJECTED', 'case', id, {
      reference: row.reference,
      notes: notes || null
    });
  }

  /**
   * Checker sends the case BACK to the maker for amendment instead of
   * approving/rejecting it - e.g. a typo in the IC, a missing CCRIS line,
   * the wrong financing amount. This is deliberately NOT a decision:
   * decided_at / decision_notes stay untouched so "decided" reporting
   * keeps meaning "approved or rejected", and the case simply moves back
   * into the maker's court as 'returned'.
   *
   * A comment is mandatory - a case handed back without a reason just
   * bounces around the queue.
   *
   * @param comment why it is being sent back (required, non-empty)
   */
  function returnToMaker(id, checkerId, comment) {
    var text = String(comment == null ? '' : comment).trim();
    if (!text) {
      throw new Error('A comment is required when returning a case to the maker.');
    }
    var db = Db.load();
    var row = db.cases.filter(function (c) {
      return c.id === id && c.assigned_checker_id === checkerId && c.status === 'pending_checker';
    })[0];
    if (!row) {
      throw new Error('Case not found, not assigned to you, or already decided.');
    }

    var now = Db.now();
    row.status = 'returned';
    row.returned_at = now;
    row.return_notes = text;
    row.return_count = (row.return_count || 0) + 1;
    row.updated_at = now;
    pushComment(row, userById(db, checkerId), 'RETURNED', text);
    Db.save(db);

    Audit.log(checkerId, 'CASE_RETURNED', 'case', id, {
      reference: row.reference,
      notes: text,
      return_count: row.return_count
    });
  }

  /**
   * Maker sends an amended case back to the checker. Only valid from
   * 'returned' - a case still sitting in the checker's queue is edited
   * in place with update() and never needs re-routing.
   *
   * The checker assignment is kept as-is so the person who raised the
   * query is the one who sees the answer.
   *
   * @param comment optional note back to the checker ("fixed the IC")
   */
  function resubmit(id, makerId, snapshot, comment) {
    var db = Db.load();
    var row = db.cases.filter(function (c) {
      return c.id === id && c.created_by === makerId && c.status === 'returned';
    })[0];
    if (!row) {
      throw new Error('Case not found, not yours, or not currently returned to you.');
    }

    var now = Db.now();
    if (snapshot) applySnapshot(row, snapshot, now);
    row.status = 'pending_checker';
    row.submitted_at = now;
    row.resubmitted_at = now;
    row.updated_at = now;
    pushComment(row, userById(db, makerId), 'RESUBMITTED', String(comment == null ? '' : comment).trim());
    Db.save(db);

    Audit.log(makerId, 'CASE_RESUBMITTED', 'case', id, {
      reference: row.reference,
      checker_id: row.assigned_checker_id,
      notes: String(comment == null ? '' : comment).trim() || null
    });
  }

  /**
   * Copy a fresh calculator snapshot onto an existing case row and count
   * it as an edit. Shared by update() (maker fixing a still-pending case)
   * and resubmit() (maker answering a checker's return), so the derived
   * columns can never drift apart between the two paths.
   */
  function applySnapshot(row, snapshot, now) {
    var state = (snapshot && snapshot.state) || {};
    var results = (snapshot && snapshot.results) || {};
    var computed = (snapshot && snapshot.computed) || {};
    var customer = state.customer || {};

    row.customer_name = customer.name || null;
    row.customer_ic = customer.ic || null;
    row.customer_type = customer.type || null;
    row.customer_class = customer.cardType || null;
    row.iscore = (state.iScore !== undefined && state.iScore !== '') ? state.iScore : null;
    row.report_date = state.reportDate || null;
    row.gross_income = round2(computed.grossIncome || 0);
    row.net_income = round2(computed.netIncome || 0);
    row.verdict = results.verdict || null;
    row.dsr_value = (results.dsr !== undefined) ? round4(results.dsr) : null;
    row.ndi_value = (results.ndi !== undefined) ? round2(results.ndi) : null;
    row.payload = snapshot;
    row.edit_count = (row.edit_count || 0) + 1;
    row.edited_at = now;
    row.updated_at = now;
  }

  /**
   * Maker correcting their own submission - while it is still sitting in
   * the checker's queue (pending_checker) OR after the checker sent it
   * back for amendment (returned). Once approved/rejected the record is a
   * closed audit trail and can never be touched again.
   *
   * Saving a returned case leaves it 'returned'; it only goes back into
   * the checker's queue via resubmit().
   */
  function update(id, makerId, snapshot) {
    var db = Db.load();
    var row = db.cases.filter(function (c) {
      return c.id === id && c.created_by === makerId
        && (c.status === 'pending_checker' || c.status === 'returned');
    })[0];
    if (!row) {
      throw new Error('Case not found, not yours, or no longer editable (already decided).');
    }

    applySnapshot(row, snapshot, Db.now());
    Db.save(db);

    Audit.log(makerId, 'CASE_EDITED', 'case', id, { reference: row.reference, status: row.status });
  }

  function listForUser(user) {
    var db = Db.load();
    var rows;
    if (user.role === 'admin') {
      rows = db.cases.slice();
    } else if (user.role === 'checker') {
      rows = db.cases.filter(function (c) { return c.assigned_checker_id === user.id; });
    } else {
      rows = db.cases.filter(function (c) { return c.created_by === user.id; });
    }
    rows.sort(function (a, b) { return b.id - a.id; });
    return rows.map(function (c) {
      var maker = db.users.filter(function (u) { return u.id === c.created_by; })[0];
      var checker = db.users.filter(function (u) { return u.id === c.assigned_checker_id; })[0];
      var out = {};
      Object.keys(c).forEach(function (k) { out[k] = c[k]; });
      out.maker_name = maker ? maker.name : null;
      out.checker_name = checker ? checker.name : null;
      return out;
    });
  }

  /** @return {string: number} status => count */
  function statusCounts() {
    var db = Db.load();
    var out = { draft: 0, pending_checker: 0, returned: 0, approved: 0, rejected: 0 };
    db.cases.forEach(function (c) {
      if (out[c.status] !== undefined) out[c.status]++;
    });
    return out;
  }

  /** @return active checkers, for the maker's "submit to" picker */
  function activeCheckers() {
    var db = Db.load();
    return db.users
      .filter(function (u) { return u.role === 'checker' && u.status === 'active'; })
      .map(function (u) { return { id: u.id, name: u.name, username: u.username }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  window.Cases = {
    nextReference: nextReference,
    submit: submit,
    find: find,
    canView: canView,
    decide: decide,
    returnToMaker: returnToMaker,
    resubmit: resubmit,
    update: update,
    listForUser: listForUser,
    statusCounts: statusCounts,
    activeCheckers: activeCheckers
  };
})();
