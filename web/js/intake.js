/* ============================================================
   intake.js - shared first page (mandatory for every mode)
   STEP A Customer details  |  STEP B CCRIS / Experian report
   STEP C Income (Normal manual / EPF statement / Bizman)
   One intake feeds PF, HF and CC alike.
   ============================================================ */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  var E = window.Engine;

  var fmt = E.formatCurrency;
  var fmtPct = E.formatPct;
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, '')); return isFinite(n) ? n : 0; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }

  /** Compare the EPF statement holder to the Experian subject. Returns a
      human-readable reason string when they clearly differ, else ''.
      Only compares fields present on BOTH sides (so it never fires just
      because the statement or the report is missing that field). */
  function identityMismatch(epfName, epfIC, expName, expIC) {
    function normName(v) { return String(v || '').toUpperCase().replace(/[^A-Z]/g, ''); }
    function normIC(v) { return String(v || '').replace(/\D/g, ''); }
    var reasons = [];
    var eIC = normIC(epfIC), xIC = normIC(expIC);
    if (eIC && xIC && eIC !== xIC) {
      reasons.push('IC: statement ' + E.formatIC(epfIC) + '  vs  report ' + E.formatIC(expIC));
    }
    var eN = normName(epfName), xN = normName(expName);
    // names match if one contains the other (handles partial OCR / word order)
    if (eN && xN && eN.indexOf(xN) === -1 && xN.indexOf(eN) === -1) {
      reasons.push('Name: statement "' + epfName + '"  vs  report "' + expName + '"');
    }
    return reasons.join('\n');
  }
  // shared with the HF joint-applicant EPF flow (panels.js)
  App.identityMismatch = identityMismatch;

  /* ---------------- shared computed values ---------------- */
  App.computed = {};

  App.computeShared = function () {
    var s = App.state;
    var age = E.calculateAgeFromIC(s.customer.ic);

    // income
    var income;
    if (s.customer.type === 'BIZMAN') {
      income = E.calcBizman(s.income.bizman);
    } else if (s.income.normalMode === 'EPF') {
      income = E.calcEPFIncome(
        s.income.epf.months.map(function (m) { return m.employee; }),
        s.income.epf.epfRatePct, s.income.epf.deductions);
    } else {
      income = E.calcNormalManual(s.income.manualMonths);
    }

    // Customer class auto-derived from gross income (HF spec P12:
    // TYPE B at/above the configured break, else TYPE A)
    s.customer.cardType = (income.grossIncome || 0) >= E.CONFIG.classBreak ? 'TYPE B' : 'TYPE A';

    // CCRIS commitments (stress factors come from the fixed collateral
    // table List!A28:B32 - not a user input)
    var totals = E.totalCommitments(s.ccris, s.customer.cardType);

    // balance transfer / settlement: D72 = CC balance transfers,
    // H72 = PF settlements; L56 = D72 + H72
    var btCC = 0, btPF = 0;
    (s.bt || []).forEach(function (r) {
      if (r.type === 'BT') btCC += E.btRepayment(r.outstanding);
      else btPF += num(r.repayment);
    });
    var btTotal = btCC + btPF;

    App.computed = {
      age: age,
      income: income,
      grossIncome: income.grossIncome || 0,
      netIncome: income.netIncome || 0,
      totalCommitment: totals.total,            // L55
      stressTotal: totals.stressTotal,          // T-total
      unsecuredTotal: totals.unsecuredTotal,
      btCC: btCC,                               // D72
      btPF: btPF,                               // H72
      btTotal: btTotal,                         // L56
      grandTotal: totals.total - btTotal,       // L57
      intakeReady: !!(s.customer.name && s.customer.ic && (income.grossIncome || 0) > 0)
    };
    return App.computed;
  };

  /* ---------------- collapsible card helper ---------------- */
  function card(id, stepTag, title, bodyHtml, extraHeadHtml) {
    return '<div class="card" id="' + id + '">' +
      '<div class="card-head" data-toggle="' + id + '">' +
      '<span>' + (stepTag ? '<span class="step-tag">' + stepTag + '</span>' : '') + title + '</span>' +
      '<span style="display:flex;align-items:center;gap:10px;">' + (extraHeadHtml || '') +
      '<span class="chev">&#9662;</span></span></div>' +
      '<div class="card-body">' + bodyHtml + '</div></div>';
  }
  document.addEventListener('click', function (ev) {
    var head = ev.target.closest('.card-head');
    if (head && head.dataset.toggle && !ev.target.closest('button,input,select')) {
      el(head.dataset.toggle).classList.toggle('collapsed');
    }
  });

  /* ============================================================
     STEP A - CUSTOMER DETAILS
     ============================================================ */
  App.renderCustomer = function () {
    var c = App.state.customer;
    // Step A's product field(s) are product-specific:
    //   HF pages -> HOME FINANCING / HOME ONE ACCOUNT (Excel Summary C11)
    //   CC pages -> Card Product (moved here from the CC panel)
    //   PF alone -> no extra field (Customer Segment removed; it was unused)
    var mode = String(App.mode || '');
    var isHF = mode.indexOf('hf') !== -1;
    // Card Product lives in Step A for standalone CC and PF+CC. In HF+CC it
    // moves into each per-applicant card application, so hide it here.
    var isCC = mode.indexOf('cc') !== -1 && mode !== 'hf-cc';
    var lastField = '';
    if (isHF) {
      lastField += '<div class="field"><label>Product</label>' +
        '<select class="editable" id="cust-hfproduct">' +
        ['HOME FINANCING', 'HOME ONE ACCOUNT'].map(function (o) {
          return '<option value="' + o + '"' + (App.state.hf.product === o ? ' selected' : '') + '>' + o + '</option>';
        }).join('') + '</select></div>';
    }
    if (isCC) {
      lastField += '<div class="field"><label>Card Product</label>' +
        '<select class="editable" id="cust-ccproduct">' +
        '<option value="VISA_PLATINUM"' + (App.state.cc.product === 'VISA_PLATINUM' ? ' selected' : '') + '>Visa Platinum</option>' +
        '<option value="VISA_SIGNATURE"' + (App.state.cc.product === 'VISA_SIGNATURE' ? ' selected' : '') + '>Visa Signature</option>' +
        '<option value="BOTH"' + (App.state.cc.product === 'BOTH' ? ' selected' : '') + '>Both (Platinum + Signature)</option></select></div>';
    }
    // Once an Experian PDF has populated the identity, lock it against
    // edits (matches the CCRIS table's "extracted rows are locked"
    // convention) - a fully manual intake (no Experian) stays editable.
    var locked = !!c.fromExperian;
    var lockAttr = locked ? ' disabled' : '';
    var lockCls = locked ? 'readonly' : 'editable';
    var body =
      '<div class="grid c4">' +
      // row 1
      '<div class="field"><label>Customer Name</label>' +
      '<input class="' + lockCls + '" id="cust-name"' + lockAttr + ' value="' + esc(c.name) + '"></div>' +
      '<div class="field"><label>IC / Passport Number</label>' +
      '<input class="' + lockCls + '" id="cust-ic" data-fmt="ic"' + lockAttr + ' value="' + esc(E.formatIC(c.ic)) + '"></div>' +
      '<div class="field"><label>Age (derived from IC)</label>' +
      '<span class="readonly-val" id="cust-age">-</span></div>' +
      // Customer Type: on HF pages it is set per applicant in the income
      // section (a joint home can mix NORMAL + BIZMAN), so hide it here.
      (isHF ? '' :
        '<div class="field"><label>Customer Type</label>' +
        '<select class="editable" id="cust-type">' +
        '<option' + (c.type === 'NORMAL' ? ' selected' : '') + '>NORMAL</option>' +
        '<option' + (c.type === 'BIZMAN' ? ' selected' : '') + '>BIZMAN</option></select></div>') +
      '<div class="field"><label>Report Date</label>' +
      '<span class="readonly-val" id="cust-reportdate">' + esc(App.state.reportDate || '-') + '</span></div>' +
      '<div class="field"><label>Experian iScore</label>' +
      '<input class="' + lockCls + '" id="cust-iscore"' + lockAttr + ' type="text" inputmode="numeric" value="' + esc(App.state.iScore) + '"></div>' +
      '<div class="field"><label>Customer Class (derived from gross income)</label>' +
      '<span class="readonly-val" id="cust-cardtype">' + esc(c.cardType) + '</span></div>' +
      lastField +
      '</div>';
    el('intake-customer').innerHTML = card('card-customer', 'STEP A', 'Customer Details', body);

    var nameInp = el('cust-name');
    if (nameInp) nameInp.oninput = function () {
      App.state.customer.name = this.value;
      App.refreshOutputs();
    };
    var icInp = el('cust-ic');
    if (icInp) icInp.oninput = function () {
      App.state.customer.ic = this.value;
      App.refreshOutputs();
    };
    var iscoreInp = el('cust-iscore');
    if (iscoreInp) iscoreInp.oninput = function () {
      App.state.iScore = this.value;
      App.refreshOutputs();
    };
    var ctypeSel = el('cust-type');
    if (ctypeSel) ctypeSel.onchange = function () {
      App.state.customer.type = this.value;
      App.renderIncome();          // swaps Normal/Bizman sub-form
      App.refreshOutputs();
    };
    var prodSel = el('cust-hfproduct');
    if (prodSel) prodSel.onchange = function () {
      App.state.hf.product = this.value;
      App.renderHF();          // swaps HF / Home One Account input grid
      App.refreshOutputs();
    };
    var ccProdSel = el('cust-ccproduct');
    if (ccProdSel) ccProdSel.onchange = function () {
      App.state.cc.product = this.value;
      App.renderCC();          // updates the card image in the CC panel
      App.refreshOutputs();
    };
  };

  /* ============================================================
     STEP B - CCRIS / EXPERIAN REPORT
     ============================================================ */
  var FACILITY_OPTIONS = E.FACILITY_LIST;
  var CAPACITIES = ['OWN', 'JOINT', 'GUARANTOR', 'DIRECTOR'];
  // Collateral names must match the Experian report exactly, because the
  // floating-rate stress factor (List!A28:B32) is keyed on them - e.g. a
  // motor vehicle line is "MOTOR V (JPJ)", never "VEHICLES".
  var COLLATERALS = ['', 'PROPERTIES', 'CLEAN', 'MOTOR V (JPJ)', 'UNIT TRUST', 'SHARES', 'FIN.ASSTS', 'OTHERS'];

  function newCCRISRow() {
    return { no: App.state.ccris.length + 1, date: '', capacity: 'OWN', collateral: '',
             facility: '', outstanding: '', limit: '', legalStatus: '',
             commitmentPerCCRIS: '', override: '', floating: 'NO', sourceSection: 'USER_ADDED' };
  }

  function selectHtml(options, value, cls) {
    return '<select class="' + (cls || '') + '">' + options.map(function (o) {
      return '<option value="' + esc(o) + '"' + (String(o) === String(value) ? ' selected' : '') + '>' +
        (o === '' ? '-' : esc(o)) + '</option>';
    }).join('') + '</select>';
  }

  App.renderCCRIS = function () {
    var s = App.state;
    var pdfOk = E.pdfAvailable();

    // Rows grouped by source: original CCRIS, NLCI, manually added.
    // Extracted rows (CCRIS/NLCI) are LOCKED - only the Override column
    // (and the Floating flag, an officer input for the PF stress test)
    // can be edited. Manually added rows stay fully editable.
    // O/S, Limit and Instalment carry no "RM" - they sit under RM-headed
    // columns and the editable rows show bare numbers too (data-fmt="money").
    function plainMoney(v) {
      var n = num(v);
      return n ? n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
    }
    function lockedCell(v, isNum) {
      return '<td class="locked' + (isNum ? ' num' : '') + '">' +
        (isNum ? plainMoney(v) : (esc(v) || '-')) + '</td>';
    }
    /** n: the item number to print, or '' for a sub-line of the item above. */
    function rowHtml(r, i, n) {
      var src = r.sourceSection || 'USER_ADDED';
      var editable = src === 'USER_ADDED';
      var h = '<tr data-i="' + i + '" class="src-' + src + (n === '' ? ' sub-line' : '') + '">' +
        '<td class="num">' + n + '</td>';
      if (editable) {
        h += '<td class="editable"><input data-f="date" type="date" value="' + esc(r.date) + '" style="min-width:86px"></td>' +
          '<td class="editable">' + selectHtml(CAPACITIES, r.capacity).replace('<select', '<select data-f="capacity"') + '</td>' +
          '<td class="editable">' + selectHtml(COLLATERALS, r.collateral).replace('<select', '<select data-f="collateral"') + '</td>' +
          '<td class="editable"><input data-f="facility" list="facility-list" value="' + esc(r.facility) + '" style="min-width:96px;text-transform:uppercase"></td>' +
          '<td class="editable"><input data-f="outstanding" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.outstanding) + '"></td>' +
          '<td class="editable"><input data-f="limit" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.limit) + '"></td>' +
          '<td class="editable"><input data-f="legalStatus" value="' + esc(r.legalStatus) + '" style="min-width:60px"></td>' +
          '<td class="editable"><input data-f="commitmentPerCCRIS" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.commitmentPerCCRIS) + '"></td>';
      } else {
        h += lockedCell(r.date) + lockedCell(r.capacity) + lockedCell(r.collateral) +
          lockedCell(r.facility) + lockedCell(r.outstanding, true) +
          lockedCell(r.limit, true) + lockedCell(r.legalStatus) +
          lockedCell(r.commitmentPerCCRIS, true);
      }
      h += '<td class="override"><input data-f="override" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.override) + '" class="' + (E.hasOverride(r.override) ? 'has-value' : '') + '"></td>' +
        '<td class="readonly" id="ccris-commit-' + i + '">-</td>' +
        '<td class="editable">' + selectHtml(['NO', 'YES'], r.floating).replace('<select', '<select data-f="floating"') + '</td>' +
        '<td class="readonly" id="ccris-stress-' + i + '">-</td>' +
        '<td>' + esc(src) + '</td>' +
        '<td>' + (editable ? '<button class="row-del" data-del="' + i + '" title="Delete row">&times;</button>' : '') + '</td></tr>';
      return h;
    }
    var GROUPS = [
      ['CCRIS', 'CCRIS Records (Experian report)'],
      ['NLCI', 'NLCI - Non-Bank Lenders'],
      ['USER_ADDED', 'Manually Added / Other Commitments']
    ];
    /** One CCRIS account can list several facility lines under a single item
        (same No + same date, e.g. 2 card lines on 22/10/2019). Those extra
        lines are sub-lines of the account above: they keep their own figures
        but take no number of their own. */
    function isSubLine(r, prev) {
      if (!prev) return false;
      if ((r.sourceSection || 'USER_ADDED') !== (prev.sourceSection || 'USER_ADDED')) return false;
      if (!r.date || r.date !== prev.date) return false;
      return String(r.no) === String(prev.no);
    }
    var rowsHtml = '';
    var itemNo = 0;
    GROUPS.forEach(function (g) {
      var idxs = [];
      s.ccris.forEach(function (r, i) {
        if ((r.sourceSection || 'USER_ADDED') === g[0]) idxs.push(i);
      });
      if (!idxs.length) return;
      var accounts = idxs.filter(function (i, k) {
        return !isSubLine(s.ccris[i], k ? s.ccris[idxs[k - 1]] : null);
      }).length;
      rowsHtml += '<tr class="sec-row"><td colspan="15">' + g[1] + ' (' + accounts +
        (idxs.length > accounts ? ', ' + idxs.length + ' lines' : '') + ')</td></tr>' +
        idxs.map(function (i, k) {
          var sub = isSubLine(s.ccris[i], k ? s.ccris[idxs[k - 1]] : null);
          if (!sub) itemNo++;
          return rowHtml(s.ccris[i], i, sub ? '' : itemNo);
        }).join('');
    });

    var btRows = (s.bt || []).map(function (r, i) {
      return '<tr data-bti="' + i + '">' +
        '<td class="editable">' + selectHtml(['BT', 'SETTLE'], r.type).replace('<select', '<select data-btf="type"')
          .replace('>BT<', '>CC Balance Transfer<').replace('>SETTLE<', '>Facility Settlement<') + '</td>' +
        '<td class="editable"><input data-btf="outstanding" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.outstanding) + '"' + (r.type !== 'BT' ? ' disabled' : '') + '></td>' +
        (r.type === 'BT'
          ? '<td class="readonly" id="bt-rep-' + i + '">-</td>'
          : '<td class="editable"><input data-btf="repayment" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.repayment) + '"></td>') +
        '<td><button class="row-del" data-btdel="' + i + '">&times;</button></td></tr>';
    }).join('');

    var body =
      '<div class="dropzone" id="dz-experian">' +
      '<div class="dz-title">Experian report</div>' +
      '<div class="dz-sub">' + (pdfOk
        ? 'Drop or click the Experian PDF.'
        : 'PDF library missing - key the CCRIS rows in manually below.') +
      '</div><input type="file" id="file-experian" accept=".pdf" style="display:none"></div>' +
      '<div id="dz-experian-msg"></div>' +

      '<div class="subhead">CCRIS Records (existing debts)</div>' +
      '<datalist id="facility-list">' + FACILITY_OPTIONS.map(function (o) {
        return '<option value="' + o + '">'; }).join('') + '</datalist>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>No</th><th>Date</th><th>Capacity</th><th>Collateral</th><th>Facility</th>' +
      '<th>Outstanding (RM)</th><th>Limit (RM)</th><th>Legal Status</th>' +
      '<th>Instalment per<br>CCRIS (RM)</th><th>Override (RM)</th>' +
      '<th>Commitment (RM)</th><th>Floating Rate</th>' +
      '<th>Stress Test Commitment (RM)</th><th>Source</th><th></th></tr></thead>' +
      '<tbody id="ccris-tbody">' + rowsHtml + '</tbody>' +
      '<tfoot><tr class="total-row"><td colspan="10">Total CCRIS Commitment (L55)</td>' +
      '<td class="num" id="ccris-total">-</td><td></td>' +
      '<td class="num" id="ccris-stress-total">-</td><td colspan="2"></td></tr></tfoot></table></div>' +
      '<div style="margin-top:8px"><button class="btn small secondary" id="btn-add-ccris" type="button">+ Add CCRIS / other commitment row</button></div>' +

      '<div class="subhead">Balance Transfer / Facilities To Be Settled</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>Type</th><th>Outstanding (RM)</th><th>Monthly Repayment (RM)</th><th></th>' +
      '</tr></thead><tbody id="bt-tbody">' + btRows + '</tbody>' +
      '<tfoot><tr class="total-row"><td colspan="2">Total To Be Settled (L56)</td>' +
      '<td class="num" id="bt-total">-</td><td></td></tr>' +
      '<tr class="total-row"><td colspan="2">Grand Total Commitment After Settlement (L57 = L55 - L56)</td>' +
      '<td class="num" id="grand-total">-</td><td></td></tr></tfoot></table></div>' +
      '<div style="margin-top:8px"><button class="btn small secondary" id="btn-add-bt" type="button">+ Add settlement row</button></div>';

    // HF pages: each joint applicant gets a full "sub Step B" (own
    // dropzone + CCRIS + BT/settlement) below the main applicant,
    // mirroring the Excel's per-applicant sheets. Added via a button
    // on the Step B card header.
    var isHF = String(App.mode || '').indexOf('hf') !== -1;
    var jointFull = App.state.hfJoint.A.enabled && App.state.hfJoint.B.enabled;
    var headBtn = (isHF && !jointFull)
      ? '<button class="btn small secondary" id="btn-add-joint" type="button">+ Joint Applicant (Sub Step B)</button>'
      : '';
    if (isHF && App.hfJointStepBHtml) {
      body += App.hfJointStepBHtml('A') + App.hfJointStepBHtml('B');
    }

    el('intake-ccris').innerHTML = card('card-ccris', 'STEP B', 'CCRIS / Experian Report', body, headBtn);
    var addJoint = el('btn-add-joint');
    if (addJoint) addJoint.onclick = function () { App.addHFJointApplicant(); };
    if (isHF && App.bindHFJointStepB) {
      App.bindHFJointStepB('A'); App.bindHFJointStepB('B');
    }

    // --- bindings ---
    bindDropzone('dz-experian', 'file-experian', handleExperianFiles, false);

    el('btn-add-ccris').onclick = function () {
      App.state.ccris.push(newCCRISRow()); App.renderCCRIS(); App.refreshOutputs();
    };
    el('btn-add-bt').onclick = function () {
      App.state.bt.push({ type: 'BT', outstanding: '', repayment: '' });
      App.renderCCRIS(); App.refreshOutputs();
    };

    el('ccris-tbody').addEventListener('input', function (ev) {
      var tr = ev.target.closest('tr'); if (!tr) return;
      var i = +tr.dataset.i, f = ev.target.dataset.f;
      if (f == null) return;
      var src = App.state.ccris[i].sourceSection || 'USER_ADDED';
      if (src !== 'USER_ADDED' && f !== 'override' && f !== 'floating') return; // locked
      var v = ev.target.value;
      if (f === 'facility') v = v.toUpperCase();
      App.state.ccris[i][f] = v;
      if (f === 'override') {
        ev.target.classList.toggle('has-value', E.hasOverride(v));
      }
      App.refreshOutputs();
    });
    el('ccris-tbody').addEventListener('click', function (ev) {
      if (ev.target.dataset.del != null) {
        App.state.ccris.splice(+ev.target.dataset.del, 1);
        App.renderCCRIS(); App.refreshOutputs();
      }
    });
    el('bt-tbody').addEventListener('input', function (ev) {
      var tr = ev.target.closest('tr'); if (!tr) return;
      var i = +tr.dataset.bti, f = ev.target.dataset.btf;
      if (f == null) return;
      App.state.bt[i][f] = ev.target.value;
      if (f === 'type') { App.renderCCRIS(); }
      App.refreshOutputs();
    });
    el('bt-tbody').addEventListener('click', function (ev) {
      if (ev.target.dataset.btdel != null) {
        App.state.bt.splice(+ev.target.dataset.btdel, 1);
        App.renderCCRIS(); App.refreshOutputs();
      }
    });
  };

  /* ---------------- dropzone helper (4 visual states) ---------------- */
  function bindDropzone(zoneId, inputId, handler, multi) {
    var zone = el(zoneId), input = el(inputId);
    if (!zone || !input) return;
    zone.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      if (input.files.length) handler(multi ? Array.prototype.slice.call(input.files) : [input.files[0]]);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (evName) {
      zone.addEventListener(evName, function (ev) {
        ev.preventDefault(); zone.classList.add('dragging');
      });
    });
    ['dragleave', 'drop'].forEach(function (evName) {
      zone.addEventListener(evName, function (ev) {
        ev.preventDefault(); zone.classList.remove('dragging');
        if (evName === 'drop' && ev.dataTransfer.files.length) {
          handler(multi ? Array.prototype.slice.call(ev.dataTransfer.files) : [ev.dataTransfer.files[0]]);
        }
      });
    });
  }
  App.bindDropzone = bindDropzone;   // reused by the HF joint-applicant panel
  function dzState(zoneId, cls, msg) {
    var zone = el(zoneId);
    if (!zone) return;
    zone.classList.remove('loading', 'success', 'error');
    if (cls) zone.classList.add(cls);
    var msgEl = el(zoneId + '-msg');
    if (msgEl) msgEl.innerHTML = msg
      ? '<div class="notice ' + (cls === 'error' ? '' : 'info') + '">' + msg + '</div>' : '';
  }
  App.dzState = dzState;

  async function handleExperianFiles(files) {
    var file = files[0];
    if (!file) return;
    dzState('dz-experian', 'loading', 'Reading ' + esc(file.name) + ' ...');
    try {
      var res = await E.extractFromExperian(file);
      var s = App.state;
      var found = res.records.length + res.nlciRecords.length;
      // The PDF had text but no debt table matched. Report it rather than
      // showing a green "extracted 0", and keep whatever rows are already
      // keyed in - wiping them would destroy the officer's work.
      if (!found) {
        dzState('dz-experian', 'error',
          'No CCRIS records found in ' + esc(file.name) + '. The file has text but no ' +
          'CrediTrack debt table - check it is the full Experian report (not a summary, ' +
          'a DSR printout or another document). Existing rows below are untouched, and ' +
          'you can key the records in manually.');
        return;
      }
      if (res.name) s.customer.name = res.name;
      if (res.icNumber) s.customer.ic = res.icNumber;
      if (res.iScore != null) s.iScore = res.iScore;
      if (res.reportDate) s.reportDate = res.reportDate;
      // identity now came from the report - lock Step A against edits
      if (res.name || res.icNumber) s.customer.fromExperian = true;
      s.ccris = res.records.concat(res.nlciRecords);
      App.renderAll();
      dzState('dz-experian', 'success',
        'Extracted ' + res.records.length + ' CCRIS + ' + res.nlciRecords.length +
        ' NLCI records' + (res.iScore != null ? ', iScore ' + res.iScore : ''));
    } catch (e) {
      dzState('dz-experian', 'error', 'Extraction failed: ' + esc(e.message) +
        ' - you can still key in the CCRIS rows manually below.');
      console.error(e);
    }
  }

  /* ============================================================
     STEP C - INCOME
     ============================================================ */
  var MONTH_COLS = [
    ['basic', 'Basic Income'], ['fixedAllowance', 'Fixed Allowance'],
    ['fixedAllowanceDesc', 'Allowance Desc'], ['other', 'Other Income'],
    ['commission', 'Commission'], ['ot', 'OT'],
    ['epf', 'EPF'], ['pcb', 'PCB / Zakat'], ['socso', 'SOCSO']
  ];

  App.renderIncome = function () {
    var s = App.state;
    var isBiz = s.customer.type === 'BIZMAN';
    var isHF = String(App.mode || '').indexOf('hf') !== -1;
    var body = '';

    body += '<div class="dropzone" id="dz-income">' +
      '<div class="dz-title">Income documents</div>' +
      '<div class="dz-sub">Drop or click. Payslip or EPF / KWSP PDF.</div>' +
      '<input type="file" id="file-income" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" multiple style="display:none"></div>' +
      '<div id="dz-income-msg"></div><div id="income-files" style="font-size:12px;color:var(--muted);margin-bottom:10px"></div>';

    // On HF pages the customer type is chosen here (per applicant), so a joint
    // home can mix a NORMAL main with a BIZMAN joint.
    if (isHF) {
      body += '<div class="field narrow" style="margin-bottom:10px"><label>Customer Type (Main)</label>' +
        '<select class="editable" id="income-maintype">' +
        '<option value="NORMAL"' + (s.customer.type === 'NORMAL' ? ' selected' : '') + '>NORMAL</option>' +
        '<option value="BIZMAN"' + (s.customer.type === 'BIZMAN' ? ' selected' : '') + '>BIZMAN</option></select></div>';
    }

    if (isBiz) {
      body += renderBizmanForm();
    } else {
      body += '<div class="tabs" id="income-tabs">' +
        '<button data-tab="MANUAL" class="' + (s.income.normalMode === 'MANUAL' ? 'active' : '') + '">Salary / Payslip (6 months)</button>' +
        '<button data-tab="EPF" class="' + (s.income.normalMode === 'EPF' ? 'active' : '') + '">EPF Statement</button></div>';
      body += s.income.normalMode === 'EPF' ? renderEPFForm() : renderManualForm();
    }

    body += '<div class="subhead">Recognised Income</div><div class="tile-grid" id="income-tiles"></div>';

    // HF pages: joint applicants' income below the main applicant
    if (isHF && App.hfJointStepCHtml) {
      body += App.hfJointStepCHtml('A') + App.hfJointStepCHtml('B');
    }

    el('intake-income').innerHTML = card('card-income', 'STEP C',
      isHF ? 'Income (per applicant)' :
      'Income - ' + (isBiz ? 'Business (BIZMAN)' : 'Individual (NORMAL)'), body);

    bindDropzone('dz-income', 'file-income', handleIncomeFiles, true);
    bindIncomeInputs();
    var mt = el('income-maintype');
    if (mt) mt.onchange = function () {
      App.state.customer.type = this.value; App.renderIncome(); App.refreshOutputs();
    };
    if (isHF && App.bindHFJointStepC) {
      App.bindHFJointStepC('A'); App.bindHFJointStepC('B');
    }
  };

  function renderManualForm() {
    var months = App.state.income.manualMonths;
    var head = '<tr><th>Month</th>' + MONTH_COLS.map(function (c) {
      return '<th>' + c[1] + '</th>'; }).join('') + '</tr>';
    var rows = months.map(function (m, i) {
      return '<tr data-mi="' + i + '"><td class="num">M' + (i + 1) + '</td>' +
        MONTH_COLS.map(function (c) {
          var isText = c[0] === 'fixedAllowanceDesc';
          return '<td class="editable"><input data-mf="' + c[0] + '"' +
            (isText ? '' : ' type="text" inputmode="decimal" data-fmt="money"') + ' value="' + esc(m[c[0]]) + '"></td>';
        }).join('') + '</tr>';
    }).join('');
    return '<div class="tbl-wrap"><table class="tbl"><thead>' + head + '</thead>' +
      '<tbody id="income-manual-tbody">' + rows + '</tbody></table></div>';
  }

  function renderEPFForm() {
    var epf = App.state.income.epf;
    var rows = '';
    for (var i = 0; i < 12; i++) {
      var m = epf.months[i] || { label: '', employee: '' };
      rows += '<tr data-ei="' + i + '"><td class="num">' + (i + 1) + '</td>' +
        '<td class="editable"><input data-ef="label" value="' + esc(m.label) + '" placeholder="e.g. Jan-25"></td>' +
        '<td class="editable"><input data-ef="employee" type="text" inputmode="decimal" data-fmt="money" value="' + esc(m.employee) + '"></td>' +
        '<td class="readonly" id="epf-mi-' + i + '">-</td></tr>';
    }
    var d = epf.deductions;
    return '<div class="field narrow" style="margin-bottom:10px">' +
      '<label>EPF Rate (%)</label><input class="editable" type="text" inputmode="decimal" data-fmt="pct" id="epf-rate" value="' + esc(epf.epfRatePct) + '" min="1" max="30"></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Month</th><th>Caruman Ahli (RM)</th><th>Implied Monthly Income (RM)</th></tr></thead>' +
      '<tbody id="epf-tbody">' + rows + '</tbody></table></div>' +
      '<div class="subhead">Deductions</div>' +
      '<div class="grid c4">' +
      '<div class="field"><label>EPF (RM)</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-edf="epf" value="' + esc(d.epf) + '"></div>' +
      '<div class="field"><label>PCB / Zakat (RM)</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-edf="pcb" value="' + esc(d.pcb) + '"></div>' +
      '<div class="field"><label>SOCSO (RM)</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-edf="socso" value="' + esc(d.socso) + '"></div>' +
      '<div class="field"><label>Other (RM)</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-edf="other" value="' + esc(d.other) + '"></div></div>';
  }

  function renderBizmanForm() {
    var b = App.state.income.bizman;
    var rows = b.months.map(function (m, i) {
      return '<tr data-bi="' + i + '"><td class="num">M' + (i + 1) + '</td>' +
        '<td class="editable"><input data-bf="bank1" type="text" inputmode="decimal" data-fmt="money" value="' + esc(m.bank1) + '"></td>' +
        '<td class="editable"><input data-bf="bank2" type="text" inputmode="decimal" data-fmt="money" value="' + esc(m.bank2) + '"></td>' +
        '<td class="readonly" id="biz-tot-' + i + '">-</td></tr>';
    }).join('');
    return '<div class="grid c2" style="margin-bottom:10px">' +
      '<div class="field"><label>Bank Account I</label><input class="editable" id="biz-bank1" value="' + esc(b.bank1Name) + '" placeholder="Bank name"></div>' +
      '<div class="field"><label>Bank Account II</label><input class="editable" id="biz-bank2" value="' + esc(b.bank2Name) + '" placeholder="Bank name"></div></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th><th>Bank I Total Credit (RM)</th><th>Bank II Total Credit (RM)</th><th>Total (RM)</th></tr></thead>' +
      '<tbody id="biz-tbody">' + rows + '</tbody></table></div>' +
      '<div class="grid c4" style="margin-top:10px">' +
      '<div class="field"><label>Profit Margin (%)</label><input class="editable" type="text" inputmode="decimal" data-fmt="pct" id="biz-pm" value="' + esc(b.profitMarginPct) + '" min="0" max="100" step="0.01"></div>' +
      '<div class="field"><label>Shareholding (%)</label><input class="editable" type="text" inputmode="decimal" data-fmt="pct" id="biz-sh" value="' + esc(b.shareholdingPct) + '" min="0" max="100"></div>' +
      '<div class="field"><label>Avg Latest 2 Years ITR (annual RM)</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" id="biz-itr" value="' + esc(b.avgITRAnnual) + '"></div>' +
      '<div class="field"><label>Tax Deduction LHDN (RM/mth)</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" id="biz-tax" value="' + esc(b.taxDeduction) + '"></div>' +
      '<div class="field"><label>SOCSO (RM/mth)</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" id="biz-socso" value="' + esc(b.socso) + '"></div></div>';
  }

  function bindIncomeInputs() {
    var s = App.state;
    var tabs = el('income-tabs');
    if (tabs) tabs.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      s.income.normalMode = b.dataset.tab;
      App.renderIncome(); App.refreshOutputs();
    });

    var mt = el('income-manual-tbody');
    if (mt) mt.addEventListener('input', function (ev) {
      var tr = ev.target.closest('tr'); if (!tr) return;
      s.income.manualMonths[+tr.dataset.mi][ev.target.dataset.mf] = ev.target.value;
      App.refreshOutputs();
    });

    var et = el('epf-tbody');
    if (et) et.addEventListener('input', function (ev) {
      var tr = ev.target.closest('tr'); if (!tr) return;
      var i = +tr.dataset.ei;
      while (s.income.epf.months.length <= i) s.income.epf.months.push({ label: '', employee: '' });
      s.income.epf.months[i][ev.target.dataset.ef] = ev.target.value;
      App.refreshOutputs();
    });
    var er = el('epf-rate');
    if (er) er.oninput = function () { s.income.epf.epfRatePct = this.value; App.refreshOutputs(); };
    document.querySelectorAll('[data-edf]').forEach(function (inp) {
      inp.oninput = function () { s.income.epf.deductions[this.dataset.edf] = this.value; App.refreshOutputs(); };
    });

    var bt = el('biz-tbody');
    if (bt) bt.addEventListener('input', function (ev) {
      var tr = ev.target.closest('tr'); if (!tr) return;
      s.income.bizman.months[+tr.dataset.bi][ev.target.dataset.bf] = ev.target.value;
      App.refreshOutputs();
    });
    [['biz-bank1', 'bank1Name'], ['biz-bank2', 'bank2Name'], ['biz-sh', 'shareholdingPct'],
     ['biz-itr', 'avgITRAnnual'], ['biz-tax', 'taxDeduction'], ['biz-socso', 'socso'],
     ['biz-pm', 'profitMarginPct']].forEach(function (p) {
      var n = el(p[0]);
      if (n) n.oninput = function () { s.income.bizman[p[1]] = this.value; App.refreshOutputs(); };
    });
  }

  async function handleIncomeFiles(files) {
    var s = App.state;
    var listEl = el('income-files');
    var names = files.map(function (f) { return esc(f.name); }).join(', ');
    if (listEl) listEl.textContent = 'Attached: ' + files.map(function (f) { return f.name; }).join(', ');

    var epfFiles = files.filter(function (f) { return /epf|kwsp/i.test(f.name) && /\.pdf$/i.test(f.name); });
    if (!epfFiles.length) {
      // no EPF statement -> treat any remaining PDFs as payslips
      var payslipFiles = files.filter(function (f) { return /\.pdf$/i.test(f.name); });
      var imageFiles = files.filter(function (f) { return /\.(jpe?g|png)$/i.test(f.name); });
      if (payslipFiles.length && E.pdfAvailable()) {
        await handlePayslipFiles(payslipFiles, imageFiles.length);
        return;
      }
      var imgNote = imageFiles.length
        ? ' Scanned images / photos (' + imageFiles.length + ') are not auto-read yet - key those figures in manually.'
        : '';
      dzState('dz-income', 'success', 'Document(s) attached: ' + names + '.' + imgNote +
        ' (Text PDF payslips and EPF/KWSP statements are auto-parsed; other formats are manual.)');
      return;
    }
    dzState('dz-income', 'loading', 'Parsing ' + epfFiles.length + ' EPF statement(s) ...');
    try {
      var results = [];
      for (var i = 0; i < epfFiles.length; i++) {
        results.push(await E.extractFromEPFStatement(epfFiles[i]));
      }
      // Cross-check the EPF statement holder against the Experian subject
      // (Step B) BEFORE anything reaches the state. A statement belonging to
      // someone else is REJECTED outright: nothing is loaded and the months
      // already attached are left alone, so a wrong file can never contribute
      // income to this customer's DSR.
      var epfName = '', epfIC = '';
      results.forEach(function (r) {
        if (!epfName && r.name) epfName = r.name;
        if (!epfIC && r.ic) epfIC = r.ic;
      });
      var mismatch = identityMismatch(epfName, epfIC, s.customer.name, s.customer.ic);
      if (mismatch) {
        App.modal.alert(
          mismatch + '\n\nNothing was loaded. Attach the EPF/KWSP statement belonging to this customer.',
          { type: 'error', title: 'EPF statement rejected' });
        dzState('dz-income', 'error', 'EPF statement rejected - identity does not match the ' +
          'Experian report: ' + esc(mismatch.replace(/\n/g, '; ')) +
          '. Nothing was loaded' + (s.income.epf.months.length
            ? ' and the ' + s.income.epf.months.length + ' month(s) already attached are unchanged.'
            : '.'));
        return;
      }

      // Merge across files by year+month (e.g. 2025 file + 2024 file), keeping
      // the latest 12 months overall. Statements already parsed in THIS
      // session are merged in too, so attaching 2026 then 2025 one at a time
      // lands on the same 12 months as dropping both together (iPad users can
      // only pick one file at a time). Re-dropping a month overwrites it
      // rather than double-counting.
      var prior = s.income.epf.parsedMonths || [];
      var months = E.mergeEPFMonths([{ months: prior }].concat(results));
      if (!months.length) throw new Error('No contribution rows recognised in the PDF(s).');
      var added = months.length - prior.length;

      s.income.normalMode = 'EPF';
      s.income.epf.parsedMonths = months;
      s.income.epf.months = months.map(function (m) {
        return { label: m.label, employee: m.employee };
      });
      App.renderIncome();
      App.refreshOutputs();
      dzState('dz-income', 'success',
        'EPF statement' + (epfFiles.length > 1 ? 's' : '') +
        ' parsed (' + epfFiles.length + ' file' + (epfFiles.length > 1 ? 's' : '') + '): ' +
        months.length + ' months loaded (' + months[0].label + ' to ' +
        months[months.length - 1].label + ')' +
        (prior.length ? ' - ' + (added > 0 ? added + ' new month' + (added === 1 ? '' : 's') +
          ' merged with the ' + prior.length + ' already attached'
          : 'already-attached months refreshed') + '. Attach another year to extend the timeline.'
          : '. Attach another year to extend the timeline.') +
        ' Switched to EPF Statement mode - review the figures below.');
    } catch (e) {
      dzState('dz-income', 'error', 'EPF parsing failed: ' + esc(e.message) + ' - enter the months manually.');
      console.error(e);
    }
  }

  /** Parse text-PDF payslips into the manual 6-month grid. Best-effort:
      each file becomes one month; figures land editable for review.
      Scanned/image payslips (no embedded text) parse to zeros and are
      reported so the officer keys them in. */
  async function handlePayslipFiles(payslipFiles, imageCount) {
    dzState('dz-income', 'loading', 'Reading ' + payslipFiles.length + ' payslip(s) ...');
    try {
      var parsed = [];
      for (var i = 0; i < payslipFiles.length; i++) {
        parsed.push({ name: payslipFiles[i].name, data: await E.extractPayslip(payslipFiles[i]) });
      }
      // order by detected month/year when every file exposed one, else keep
      // the order dropped
      var allDated = parsed.every(function (p) { return p.data.monthIndex != null && p.data.year != null; });
      if (allDated) {
        parsed.sort(function (a, b) {
          return (a.data.year * 12 + a.data.monthIndex) - (b.data.year * 12 + b.data.monthIndex);
        });
      }
      var recognised = parsed.filter(function (p) { return !E.payslipEmpty(p.data); });
      var scanned = parsed.length - recognised.length;
      if (!recognised.length) {
        dzState('dz-income', 'error', 'No income figures could be read from the payslip PDF(s) - ' +
          'they are likely scanned images. Key the months in manually (OCR is not wired yet).');
        return;
      }
      // keep the latest 6 recognised months and fill the manual grid
      var use = recognised.slice(-6);
      App.state.income.normalMode = 'MANUAL';
      var months = App.state.income.manualMonths;
      while (months.length < 6) months.push({ basic: '', fixedAllowance: '', fixedAllowanceDesc: '',
        other: '', commission: '', ot: '', epf: '', pcb: '', socso: '' });
      function s(v) { return v ? String(v) : ''; }
      use.forEach(function (p, j) {
        var d = p.data;
        months[j] = {
          basic: s(d.basic), fixedAllowance: s(d.fixedAllowance),
          fixedAllowanceDesc: d.monthLabel || '', other: s(d.other),
          commission: s(d.commission), ot: s(d.ot),
          epf: s(d.epf), pcb: s(d.pcb), socso: s(d.socso)
        };
      });
      App.renderIncome();
      App.refreshOutputs();
      var extras = [];
      if (scanned) extras.push(scanned + ' file(s) had no readable text (scanned - enter manually)');
      if (imageCount) extras.push(imageCount + ' image/photo file(s) skipped (OCR not wired yet)');
      if (recognised.length > 6) extras.push('kept the latest 6 of ' + recognised.length + ' months');
      dzState('dz-income', 'success', 'Read ' + use.length + ' payslip(s) into the first ' + use.length +
        ' month column(s). Figures are best-effort - review every cell before deciding.' +
        (extras.length ? ' Note: ' + extras.join('; ') + '.' : ''));
    } catch (e) {
      dzState('dz-income', 'error', 'Payslip parsing failed: ' + esc(e.message) + ' - enter the months manually.');
      console.error(e);
    }
  }

  /* ---------------- output refresh for the intake ---------------- */
  App.refreshIntakeOutputs = function () {
    var c = App.computed, s = App.state;

    var ageEl = el('cust-age');
    if (ageEl) ageEl.textContent = c.age != null ? c.age + ' years' : '-';
    // Name / IC / iScore are directly-editable inputs now (see cust-name
    // etc. bindings below) - never overwritten here, or typing would fight
    // this refresh. Experian extraction re-syncs them via a full
    // App.renderAll(), not this incremental path.
    [['cust-cardtype', s.customer.cardType], ['cust-reportdate', s.reportDate]
    ].forEach(function (p) {
      var n = el(p[0]);
      if (n) n.textContent = (p[1] === '' || p[1] == null) ? '-' : p[1];
    });

    // print / PDF header metadata
    var pm = el('print-meta');
    if (pm) pm.textContent =
      (s.customer.name || '-') + '  |  IC: ' + (E.formatIC(s.customer.ic) || '-') +
      '  |  Printed: ' + new Date().toLocaleDateString('en-MY', { day: '2-digit', month: 'long', year: 'numeric' });

    // CCRIS per-line commitments (L) and stress-test commitments (T)
    s.ccris.forEach(function (row, i) {
      var cell = el('ccris-commit-' + i);
      var r = E.lineCommitment(row, s.customer.cardType);
      if (cell) {
        cell.textContent = fmt(r.commitment);
        cell.classList.toggle('override', r.overridden);
      }
      // Excel T: floating lines take the collateral uplift, others show L
      var sCell = el('ccris-stress-' + i);
      if (sCell) {
        var floating = String(row.floating || '').toUpperCase() === 'YES';
        sCell.textContent = fmt(E.stressCommitment(
          r.commitment, floating, E.stressFactorFor(row)));
        sCell.classList.toggle('stressed', floating);
      }
    });
    var tot = el('ccris-total');
    if (tot) tot.textContent = fmt(c.totalCommitment);
    var stot = el('ccris-stress-total');
    if (stot) stot.textContent = fmt(c.stressTotal);

    (s.bt || []).forEach(function (row, i) {
      var cell = el('bt-rep-' + i);
      if (cell) cell.textContent = fmt(E.btRepayment(row.outstanding));
    });
    var btT = el('bt-total'); if (btT) btT.textContent = fmt(c.btTotal);
    var gt = el('grand-total'); if (gt) gt.textContent = fmt(c.grandTotal);

    // income detail cells
    if (s.customer.type !== 'BIZMAN' && s.income.normalMode === 'EPF') {
      (c.income.monthlyIncomes || []).forEach(function (v, i) {
        var cell = el('epf-mi-' + i);
        if (cell) cell.textContent = fmt(v);
      });
    }
    if (s.customer.type === 'BIZMAN') {
      (c.income.totalsPerMonth || []).forEach(function (v, i) {
        var cell = el('biz-tot-' + i);
        if (cell) cell.textContent = fmt(v);
      });
    }

    // income tiles
    var tiles = el('income-tiles');
    if (tiles) {
      var inc = c.income, t = [];
      if (s.customer.type === 'BIZMAN') {
        t.push(['Avg Monthly Credit', fmt(inc.bizAvgCredit)]);
        t.push(['Monthly Business Income', fmt(inc.monthlyBusinessIncome)]);
        t.push(['Monthly Personal Income (ITR)', fmt(inc.monthlyPersonalIncome)]);
        t.push(['Variance', inc.variance ? inc.variance.toFixed(2) + 'x' : '-']);
      } else if (s.income.normalMode === 'EPF') {
        t.push(['Fixed Income', fmt(inc.fixedIncome)]);
        t.push(['Variable Income', fmt(inc.variableRaw)]);
        t.push(['Income Type', inc.incomeType]);
      } else {
        t.push(['Basic (highest month)', fmt(inc.basicRecog)]);
        t.push(['Other Income (highest month)', fmt(inc.avgOther)]);
        t.push(['Commission @60%', fmt(inc.average60Comm)]);
        t.push(['OT (avg of months paid)', fmt(inc.avgOT)]);
        t.push(['EPF (pro-rated)', fmt(inc.average60EPF)]);
      }
      t.push(['GROSS INCOME', fmt(c.grossIncome)]);
      t.push(['NET INCOME', fmt(c.netIncome)]);
      tiles.innerHTML = t.map(function (x, i) {
        var cls = x[0] === 'NET INCOME' ? ' good' : (x[0] === 'GROSS INCOME' ? ' accent' : '');
        return '<div class="tile' + cls + '"><div class="t-label">' + x[0] +
          '</div><div class="t-value">' + x[1] + '</div></div>';
      }).join('');
    }

    // gate
    var gate = el('intake-gate');
    if (gate) {
      gate.innerHTML = '';
    }
  };
})();
