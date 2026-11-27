/* ---------------- home financing ---------------- */

(function () {
  'use strict';
  var App = window.App = window.App || {};
  var E = window.Engine;
  var fmt = App.mod.ui.fmt, amt = App.mod.ui.amt, fmtPct = App.mod.ui.fmtPct, DSR_DP = App.mod.ui.DSR_DP, num = App.mod.ui.num, esc = App.mod.ui.esc, el = App.mod.ui.el, vClass = App.mod.ui.vClass, vLabel = App.mod.ui.vLabel, tile = App.mod.ui.tile, gauge = App.mod.ui.gauge, field = App.mod.ui.field, bindNum = App.mod.ui.bindNum, cardShell = App.mod.ui.cardShell;
  var HF_CAPACITIES = App.mod.applicants.HF_CAPACITIES, HF_COLLATERALS = App.mod.applicants.HF_COLLATERALS, HF_MONTH_COLS = App.mod.applicants.HF_MONTH_COLS, applicantPersonalIncome = App.mod.applicants.applicantPersonalIncome, hfApplicants = App.mod.applicants.hfApplicants, hfSelect = App.mod.applicants.hfSelect;

  App.hfJointEditIdx = App.hfJointEditIdx || { A: null, B: null };
  App.hfJointEditSnapshot = App.hfJointEditSnapshot || { A: null, B: null };
  App.hfJointIncomeEdit = App.hfJointIncomeEdit || { A: false, B: false };
  var ICON_EDIT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="M13 6l4 4"/></svg>';
  var ICON_DONE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>';

  function epfCellChanged(m, f) {
    if (!m || !m.orig) return false;
    if (f === 'employee') {
      return (parseFloat(String(m[f] == null ? '' : m[f]).replace(/[,\s%]/g, '')) || 0) !==
        (parseFloat(String(m.orig[f] == null ? '' : m.orig[f]).replace(/[,\s%]/g, '')) || 0);
    }
    return String(m[f] == null ? '' : m[f]) !== String(m.orig[f] == null ? '' : m.orig[f]);
  }

  /* ---------------- HF tenure dropdown (1-35 years) ---------------- */
  function hfTenureOptions(value) {
    var selectedYears = num(value);
    var yearList = [];

    for (var year = 1; year <= 35; year++) {
      yearList.push(year);
    }

    if (selectedYears > 0 && yearList.indexOf(selectedYears) === -1) {
      yearList.push(selectedYears);
    }

    yearList.sort(function (first, second) { return first - second; });

    return '<option value="">Select tenure</option>' + yearList.map(function (year) {
      var isSelected = String(year) === String(selectedYears);
      return '<option value="' + year + '"' + (isSelected ? ' selected' : '') + '>' +
        year + (year === 1 ? ' year' : ' years') + '</option>';
    }).join('');
  }

  function hfTenureField(label, inputId, value) {
    return '<div class="field"><label>' + label + '</label>' +
      '<select class="editable" id="' + inputId + '">' +
      hfTenureOptions(value) + '</select></div>';
  }

  function bindTenureSelect(inputId, targetObject, propertyName) {
    var select = el(inputId);
    if (!select) return;
    select.onchange = function () {
      targetObject[propertyName] = this.value;
      App.refreshOutputs();
    };
  }

  /* ---------------- joint applicant ---------------- */
function hfJointCCRISRows(a, k) {
    function isEditedField(r, f) { return !!(r.editedFields && r.editedFields[f]); }
    function editCls(r, f) { return isEditedField(r, f) ? ' edited' : ''; }
    return a.ccris.map(function (r, i) {
      var src = r.sourceSection || 'USER_ADDED';
      var editing = App.hfJointEditIdx[k] === i;
      var editable = src === 'USER_ADDED' || editing;
      var h = '<tr data-i="' + i + '" class="src-' + src + '">' +
        '<td class="num">' + (i + 1) + '</td>';
      if (editable) {
        h += '<td class="editable"><input class="editable' + editCls(r, 'date') + '" data-f="date" type="date" value="' + esc(r.date) + '" style="min-width:86px"></td>' +
          '<td class="editable">' + hfSelect(HF_CAPACITIES, r.capacity, 'data-f="capacity" class="editable' + editCls(r, 'capacity') + '"') + '</td>' +
          '<td class="editable">' + hfSelect(HF_COLLATERALS, r.collateral, 'data-f="collateral" class="editable' + editCls(r, 'collateral') + '"') + '</td>' +
          '<td class="editable">' + App.facilityDropdownHtml(r.facility, editCls(r, 'facility').trim()) + '</td>' +
          '<td class="editable"><input class="editable' + editCls(r, 'outstanding') + '" data-f="outstanding" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.outstanding) + '"></td>' +
          '<td class="editable"><input class="editable' + editCls(r, 'limit') + '" data-f="limit" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.limit) + '"></td>' +
          '<td class="editable"><input class="editable' + editCls(r, 'legalStatus') + '" data-f="legalStatus" value="' + esc(r.legalStatus) + '" style="min-width:60px"></td>' +
          '<td class="editable"><input class="editable' + editCls(r, 'commitmentPerCCRIS') + '" data-f="commitmentPerCCRIS" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.commitmentPerCCRIS) + '"></td>';
      } else {
        var lock = function (f, isNum) {
          var v = r[f];
          return '<td class="locked' + (isNum ? ' num' : '') +
            (isEditedField(r, f) ? ' edited-cell' : '') + '">' +
            (isNum ? (num(v) ? fmt(v) : '-') : (esc(v) || '-')) + '</td>';
        };
        h += lock('date') + lock('capacity') + lock('collateral') + lock('facility') +
          lock('outstanding', true) + lock('limit', true) + lock('legalStatus') +
          lock('commitmentPerCCRIS', true);
      }
      h += '<td class="override"><input data-f="override" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.override) +
        '" class="' + (E.hasOverride(r.override) ? 'has-value' : '') + editCls(r, 'override') + '"></td>' +
        '<td class="readonly" id="hfj-commit-' + k + '-' + i + '">-</td>' +
        '<td class="src-cell">' + esc(src) + '</td>' +
        '<td class="row-actions">' +
        (src === 'USER_ADDED'
          ? '<button class="row-del" data-del="' + i + '" title="Delete row">&times;</button>'
          : (editing
            ? '<button class="row-edit done" data-editdone="' + i + '" title="Done - lock this row">' + ICON_DONE + '</button>'
            : '<button class="row-edit' + (r.edited ? ' is-edited' : '') + '" data-edit="' + i +
              '" title="' + (r.edited ? 'Edited - click to edit again' : 'Edit this extracted row') + '">' + ICON_EDIT + '</button>')) +
        '</td></tr>';
      return h;
    }).join('');
  }

  App.hfJointStepBHtml = function (k) {
    var a = App.state.hfJoint[k];
    if (!a.enabled) return '';
    var sub = k === 'A' ? 'B1' : 'B2';

    var btRows = (a.bt || []).map(function (r, i) {

      var linked = App.btLinkResolve(a.ccris, r) >= 0;
      var amtDis = (linked || r.type !== 'BT') ? ' disabled' : '';
      return '<tr data-bti="' + i + '">' +
        '<td class="editable">' + hfSelect(['BT', 'SETTLE'], r.type, 'data-btf="type"')
          .replace('>BT<', '>CC Balance Transfer<').replace('>SETTLE<', '>Facility Settlement<') + '</td>' +
        '<td class="editable">' + App.btLinkSelectHtml(a.ccris, a.bt, i) +
        '<input data-btf="outstanding" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.outstanding) + '"' + amtDis + '></td>' +
        (r.type === 'BT' || linked
          ? '<td class="readonly" id="hfj-btrep-' + k + '-' + i + '">-</td>'
          : '<td class="editable"><input data-btf="repayment" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.repayment) + '"></td>') +
        '<td><button class="row-del" data-btdel="' + i + '">&times;</button></td></tr>';
    }).join('');

    return '<div class="card" id="hfj-box-' + k + '" style="margin-top:10px">' +
      '<div class="card-head" data-toggle="hfj-box-' + k + '">' +
      '<span><span class="step-tag">STEP ' + sub + '</span>Joint Applicant ' + k +
      (a.name ? ' - ' + esc(a.name) : '') + '</span>' +
      '<button class="row-del" data-hfj-del="' + k + '" title="Remove applicant" type="button">&times;</button></div>' +
      '<div class="card-body">' +

      '<div class="grid c4" style="margin-bottom:8px">' +
      '<div class="field"><label>Customer Name</label><span class="readonly-val" id="hfj-name-' + k + '">' + (esc(a.name) || '-') + '</span></div>' +
      '<div class="field"><label>IC / Passport Number</label><span class="readonly-val" id="hfj-ic-' + k + '">' + (esc(E.formatIC(a.ic)) || '-') + '</span></div>' +
      '<div class="field"><label>Age (derived from IC)</label><span class="readonly-val" id="hfj-age-' + k + '">-</span></div>' +
      '<div class="field"><label>Experian iScore</label><span class="readonly-val" id="hfj-iscore-' + k + '">' + (esc(a.iScore) || '-') + '</span></div>' +
      '</div>' +
      '<div class="dropzone" id="dz-hfj-' + k + '">' +
      '<div class="dz-title">Experian report</div>' +
      '<div class="dz-sub">Drop or click.</div>' +
      '<input type="file" id="file-hfj-' + k + '" accept=".pdf" style="display:none"></div>' +
      '<div id="dz-hfj-' + k + '-msg"></div>' +
      '<div class="subhead">CCRIS Records - Joint Applicant ' + k + '</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>No</th><th>Date</th><th>Capacity</th><th>Collateral</th><th>Facility</th>' +
      '<th>Outstanding</th><th>Limit</th><th>Legal Status</th>' +
      '<th>Instalment per<br>CCRIS</th><th>Override</th><th>Commitment</th><th>Source</th><th></th></tr></thead>' +
      '<tbody data-hfjccris="' + k + '">' + hfJointCCRISRows(a, k) + '</tbody>' +
      '<tfoot><tr class="total-row"><td colspan="10">Total CCRIS Commitment</td>' +
      '<td class="num" id="hfj-total-' + k + '">-</td><td colspan="2"></td></tr></tfoot></table></div>' +
      '<div style="margin-top:8px"><button class="btn small secondary" data-hfj-addrow="' + k + '" type="button">+ Add CCRIS / other commitment row</button></div>' +

      '<div class="subhead" style="margin-top:26px">Balance Transfer / Facilities To Be Settled - Joint Applicant ' + k + '</div>' +
      ((a.bt || []).length
        ? '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
          '<th>Type</th><th>Outstanding</th><th>Monthly Repayment</th><th></th>' +
          '</tr></thead><tbody data-hfjbt="' + k + '">' + btRows + '</tbody>' +
          '<tfoot><tr class="total-row"><td colspan="2">Total To Be Settled</td>' +
          '<td class="num" id="hfj-bt-total-' + k + '">-</td><td></td></tr>' +
          '<tr class="total-row"><td colspan="2">Grand Total Commitment After Settlement</td>' +
          '<td class="num" id="hfj-grand-' + k + '">-</td><td></td></tr></tfoot></table></div>'
        : '') +
      '<div style="margin-top:8px"><button class="btn small secondary" data-hfj-addbt="' + k + '" type="button">+ Add settlement row</button></div>' +
      '</div></div>';
  };

  function hfJointEPFForm(a, k, locked) {
    var epf = a.epf;
    var rows = '';
    for (var i = 0; i < 12; i++) {
      var m = epf.months[i] || { label: '', employee: '' };

      var rowLocked = locked && !!m.orig;
      var rowDisabled = rowLocked ? ' disabled' : '';
      var cls = 'editable' + (epfCellChanged(m, 'label') || epfCellChanged(m, 'employee') ? ' edited' : '');
      var listId = 'income-copy-joint-epf-' + k + '-' + i;
      var listHtml = '<datalist id="' + listId + '">' +
        App.copyDatalistOptionsHtml(epf.months, i, 'employee', 'epf') + '</datalist>';
      var employeeHtml = '<div class="income-dd"><input class="' + cls + '" data-jef="employee"' +
        ' data-copy-list="' + listId + '" type="text" inputmode="decimal" data-fmt="money"' +
        ' autocomplete="off"' + rowDisabled + ' value="' + esc(m.employee) + '">' +
        '<button type="button" class="income-dd-toggle" data-dd-income' +
        ' aria-haspopup="listbox" aria-label="Previous amounts"' + rowDisabled +
        '><span class="dd-arrow"></span></button></div>';

      rows += '<tr data-jei="' + i + '"><td class="num">' + (i + 1) + '</td>' +
        '<td class="editable"><input class="' + cls + '" data-jef="label"' + rowDisabled +
        (rowLocked ? ' title="Imported value - click Edit income to change"' : '') +
        ' value="' + esc(m.label) + '" placeholder="e.g. Jan-25"></td>' +
        '<td class="editable">' + employeeHtml + listHtml + '</td>' +
        '<td class="readonly" id="hfj-epf-mi-' + k + '-' + i + '">-</td></tr>';
    }
    var d = epf.deductions;

    var rate = num(epf.epfRatePct) || 11;
    return '<div class="dropzone" id="dz-hfjinc-' + k + '">' +
      '<div class="dz-title">EPF / KWSP statement</div>' +
      '<div class="dz-sub">Drop or click &middot; one or more EPF statements</div>' +
      '<input type="file" id="file-hfjinc-' + k + '" accept=".pdf" multiple style="display:none"></div>' +
      '<div id="dz-hfjinc-' + k + '-msg"></div>' +
      '<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>#</th><th>Month</th><th>Caruman Ahli</th><th>Implied Income (@' + esc(rate) + '%)</th></tr></thead>' +
      '<tbody data-hfjepf="' + k + '">' + rows + '</tbody></table></div>' +
      '<div class="subhead">Deductions</div>' +
      '<div class="grid c4">' +
      '<div class="field"><label>EPF</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-jedf="epf" value="' + esc(d.epf) + '"></div>' +
      '<div class="field"><label>PCB / Zakat</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-jedf="pcb" value="' + esc(d.pcb) + '"></div>' +
      '<div class="field"><label>SOCSO</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-jedf="socso" value="' + esc(d.socso) + '"></div>' +
      '<div class="field"><label>Other</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-jedf="other" value="' + esc(d.other) + '"></div></div>';
  }

  function jointRecognisedHtml(k, type, mode) {
    function t(label, id, cls) {
      return '<div class="tile' + (cls ? ' ' + cls : '') + '"><div class="t-label">' + label +
        '</div><div class="t-value" id="hfj-inc-' + id + '-' + k + '">-</div></div>';
    }
    var detail = type === 'BIZMAN'
      ? t('Avg Monthly Credit', 'bizcredit') + t('Monthly Business Income', 'bizbus') + t('Monthly Personal Income', 'bizpers')
      : mode === 'EPF'
        ? t('Fixed Income', 'fixed') + t('Variable Income', 'var') + t('Income Type', 'itype')
        : t('Basic Income', 'basic') + t('Other Income', 'other') + t('Total Deductions', 'ded');
    return '<div class="subhead">Recognised Income</div><div class="tile-grid">' +
      detail + t('Gross Income', 'gross', 'accent') + t('Net Income', 'net', 'good') + '</div>';
  }

  App.hfJointStepCHtml = function (k) {
    var a = App.state.hfJoint[k];
    if (!a.enabled) return '';
    var isBiz = a.type === 'BIZMAN';

    var manualTable =
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th>' +
      HF_MONTH_COLS.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') +
      '</tr></thead><tbody data-hfjinc="' + k + '">' +
      a.months.map(function (m, i) {
        return '<tr data-mi="' + i + '"><td class="num">M' + (i + 1) + '</td>' +
          HF_MONTH_COLS.map(function (c) {
            var isText = c[0] === 'fixedAllowanceDesc';
            var listId = 'income-copy-joint-' + k + '-' + i + '-' + c[0];
            var listHtml = isText ? '' :
              '<datalist id="' + listId + '">' +
              App.copyDatalistOptionsHtml(a.months, i, c[0], 'manual') + '</datalist>';
            var inputHtml = '<input data-mf="' + c[0] + '"' +
              (isText ? '' : ' data-copy-list="' + listId + '" type="text" inputmode="decimal" data-fmt="money"') +
              ' autocomplete="off" value="' + esc(m[c[0]]) + '">';
            if (!isText) {
              inputHtml = '<div class="income-dd">' + inputHtml +
                '<button type="button" class="income-dd-toggle" data-dd-income' +
                ' aria-haspopup="listbox" aria-label="Previous amounts">' +
                '<span class="dd-arrow"></span></button></div>';
            }
            return '<td class="editable">' + inputHtml + listHtml + '</td>';
          }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';

    var bizHtml = '';
    if (isBiz) {
      var b = a.bizman;
      var bizRows = b.months.map(function (m, i) {
        return '<tr data-bi="' + i + '"><td class="num">M' + (i + 1) + '</td>' +
          '<td class="editable"><input data-bf="bank1" type="text" inputmode="decimal" data-fmt="money" value="' + esc(m.bank1) + '"></td>' +
          '<td class="editable"><input data-bf="bank2" type="text" inputmode="decimal" data-fmt="money" value="' + esc(m.bank2) + '"></td></tr>';
      }).join('');
      bizHtml = '<div class="subhead">Income for Bizman - ' + esc('Joint Applicant ' + k) + '</div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th><th>Bank I Total Credit</th><th>Bank II Total Credit</th></tr></thead>' +
        '<tbody data-hfjbiz="' + k + '">' + bizRows + '</tbody></table></div>' +
        '<div class="grid c4" style="margin-top:8px">' +
        '<div class="field"><label>Profit Margin (%)</label><input class="editable" type="text" inputmode="decimal" data-fmt="pct" data-bs="profitMarginPct" value="' + esc(b.profitMarginPct) + '" step="0.01"></div>' +
        '<div class="field"><label>Shareholding (%)</label><input class="editable" type="text" inputmode="decimal" data-fmt="pct" data-bs="shareholdingPct" value="' + esc(b.shareholdingPct) + '"></div>' +
        '<div class="field"><label>Avg Latest 2 Years ITR (annual)</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-bs="avgITRAnnual" value="' + esc(b.avgITRAnnual) + '"></div>' +
        '<div class="field"><label>Tax Deduction LHDN (monthly)</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-bs="taxDeduction" value="' + esc(b.taxDeduction) + '"></div></div>';
    }

    var typeSel = '<div class="field narrow" style="margin-bottom:10px"><label>Customer Type</label>' +
      '<select class="editable" data-jtype="' + k + '">' +
      '<option value="NORMAL"' + (!isBiz ? ' selected' : '') + '>NORMAL</option>' +
      '<option value="BIZMAN"' + (isBiz ? ' selected' : '') + '>BIZMAN</option></select></div>';

    var incomeBody;
    if (isBiz) {
      incomeBody = bizHtml;
    } else {

      var mode = a.incomeMode === 'EPF' ? 'EPF' : 'MANUAL';
      var editOn = !!App.hfJointIncomeEdit[k];
      var docMode = a.incomeSource === 'DOC' && mode === 'EPF';
      var locked = docMode && !editOn;
      incomeBody =
        (docMode
          ? '<div class="income-toolbar"><span class="income-src-note">Imported from EPF statement' +
            (locked ? ' - locked' : ' - editing') + '</span>' +
            '<button class="btn small secondary" data-hfj-edit="' + k + '" type="button">' +
            (locked ? 'Edit income' : 'Done editing') + '</button></div>'
          : '') +
        '<div class="tabs" data-hfjinctab="' + k + '">' +
        '<button data-tab="MANUAL" class="' + (mode === 'MANUAL' ? 'active' : '') + '">Salary / Payslip (6 months)</button>' +
        '<button data-tab="EPF" class="' + (mode === 'EPF' ? 'active' : '') + '">EPF Statement</button></div>' +
        (mode === 'EPF' ? hfJointEPFForm(a, k, locked) : manualTable);
    }

    return '<div class="card" id="hfj-inc-box-' + k + '" style="margin-top:10px">' +
      '<div class="card-head"><span>Income - Joint Applicant ' + k + (a.name ? ' (' + esc(a.name) + ')' : '') + '</span></div>' +
      '<div class="card-body">' + typeSel + incomeBody +
      jointRecognisedHtml(k, a.type, a.incomeMode) + '</div></div>';
  };

  function rerenderHFJoint() {
    App.renderCCRIS();
    App.renderIncome();
    App.renderHF();
    App.renderPF();
    App.renderCC();
    App.refreshOutputs();
  }

  function rerenderHFJointCCRIS() {
    App.renderCCRIS();
    App.renderPF();
    App.renderCC();
    App.refreshOutputs();
  }

  App.addHFJointApplicant = function () {
    var j = App.state.hfJoint;
    var k = !j.A.enabled ? 'A' : (!j.B.enabled ? 'B' : null);
    if (!k) return;
    j[k].enabled = true;
    rerenderHFJoint();
  };

  App.bindHFJointStepB = function (k) {
    var a = App.state.hfJoint[k];
    if (!a.enabled) return;
    var box = el('hfj-box-' + k);
    if (!box) return;

    box.addEventListener('input', function (ev) {
      var t = ev.target;

      var tr = t.closest('tr'); if (!tr) return;
      if (t.dataset.f != null && tr.dataset.i != null) {
        var i = +tr.dataset.i;
        var src = a.ccris[i].sourceSection || 'USER_ADDED';
        var editing = App.hfJointEditIdx[k] === i;
        if (src !== 'USER_ADDED' && !editing && t.dataset.f !== 'override') return;
        var v = t.value;
        if (t.dataset.f === 'facility') v = v.toUpperCase();
        a.ccris[i][t.dataset.f] = v;
        if (t.dataset.f === 'override') t.classList.toggle('has-value', E.hasOverride(v));

        if (t.dataset.f === 'facility' || t.dataset.f === 'date') {
          var jl = App.btLinkOfList(a.ccris, a.bt, i);
          if (jl != null) { App.btDetach(a.ccris, a.bt[jl]); rerenderHFJointCCRIS(); return; }
        }
        App.refreshOutputs();
      } else if (t.dataset.btf != null && tr.dataset.bti != null) {
        if (t.dataset.btf === 'link') return;
        a.bt[+tr.dataset.bti][t.dataset.btf] = t.value;
        if (t.dataset.btf === 'type') {
          var b = a.bt[+tr.dataset.bti];

          if (b.link) {
            var lrow = a.ccris[App.btLinkResolve(a.ccris, b)];
            var isCard = lrow && String(lrow.facility || '').toUpperCase().trim() === 'CRDTCARD';
            if (lrow && (b.type === 'BT') !== isCard) App.btDetach(a.ccris, b);
          }

          if (b.type !== 'BT' && b.link &&
              (b.repayment == null || String(b.repayment).trim() === '')) {
            var li = App.btLinkResolve(a.ccris, b);
            if (li >= 0) {
              b.repayment = String(Math.round(E.lineCommitment(
                a.ccris[li], (App.computeHF() || {}).hfType, 'HF').commitment * 100) / 100);
            }
          }
          rerenderHFJointCCRIS(); return;
        }
        App.refreshOutputs();
      }
    });

    box.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.dataset.btf !== 'link') return;
      var tr = t.closest('tr'); if (!tr || tr.dataset.bti == null) return;
      App.applyBtLink(a.ccris, a.bt, +tr.dataset.bti, t.value,
        (App.computeHF() || {}).hfType, 'HF');
      rerenderHFJointCCRIS();
    });

    box.addEventListener('click', function (ev) {
      var t = ev.target;
      var editBtn = t.closest ? t.closest('[data-edit]') : null;
      if (editBtn && editBtn.closest('[data-hfjccris]')) {
        var ei = +editBtn.dataset.edit;
        App.hfJointEditIdx[k] = ei;
        App.hfJointEditSnapshot[k] = JSON.stringify(a.ccris[ei]);

        var erow = a.ccris[ei];
        if (erow && !erow.orig) {
          erow.orig = {};
          ['date', 'capacity', 'collateral', 'facility', 'outstanding', 'limit',
            'legalStatus', 'commitmentPerCCRIS', 'override'].forEach(function (f) {
            erow.orig[f] = erow[f];
          });
        }
        rerenderHFJointCCRIS();
        return;
      }
      var doneBtn = t.closest ? t.closest('[data-editdone]') : null;
      if (doneBtn && doneBtn.closest('[data-hfjccris]')) {
        var di0 = +doneBtn.dataset.editdone;
        var row0 = a.ccris[di0];
        if (row0 && row0.orig) {
          var numeric = { outstanding: 1, limit: 1, commitmentPerCCRIS: 1 };
          var ef = {};
          Object.keys(row0.orig).forEach(function (f) {
            var av = numeric[f] ? num(row0[f]).toFixed(2) : String(row0[f] == null ? '' : row0[f]).trim();
            var bv = numeric[f] ? num(row0.orig[f]).toFixed(2) : String(row0.orig[f] == null ? '' : row0.orig[f]).trim();
            if (av !== bv) ef[f] = true;
          });
          row0.editedFields = ef;
          row0.edited = Object.keys(ef).length > 0;
        } else if (row0 && App.hfJointEditSnapshot[k] != null &&
            JSON.stringify(row0) !== App.hfJointEditSnapshot[k]) {
          row0.edited = true;
        }
        App.hfJointEditIdx[k] = null;
        App.hfJointEditSnapshot[k] = null;
        rerenderHFJointCCRIS();
        return;
      }
      if (t.dataset.hfjDel != null) {
        App.modal.confirm('This removes Joint Applicant ' + k + ' and all of their data.',
          { title: 'Remove Joint Applicant ' + k + '?', okLabel: 'Remove', danger: true })
          .then(function (ok) {
            if (ok) {
              App.state.hfJoint[k] = App.defaultState().hfJoint[k];
              App.hfJointEditIdx[k] = null;
              App.hfJointEditSnapshot[k] = null;
              App.hfJointIncomeEdit[k] = false;
              rerenderHFJoint();
            }
          });
        return;
      }
      if (t.dataset.hfjAddrow != null) {
        a.ccris.push({ no: a.ccris.length + 1, date: '', capacity: 'OWN', collateral: '',
          facility: '', outstanding: '', limit: '', legalStatus: '',
          commitmentPerCCRIS: '', override: '', floating: 'NO', sourceSection: 'USER_ADDED' });
        rerenderHFJointCCRIS();
        return;
      }
      if (t.dataset.hfjAddbt != null) {
        a.bt.push({ type: 'BT', outstanding: '', repayment: '', link: null });
        rerenderHFJointCCRIS();
        return;
      }
      if (t.dataset.btdel != null && t.closest('[data-hfjbt]')) {
        var bi = +t.dataset.btdel;
        App.btDetach(a.ccris, a.bt[bi]);
        a.bt.splice(bi, 1);
        rerenderHFJointCCRIS();
        return;
      }
      if (t.dataset.del != null && t.closest('[data-hfjccris]')) {
        var di = +t.dataset.del;
        App.fixBtLinksOnDelete(a.bt, di);
        a.ccris.splice(di, 1);
        rerenderHFJointCCRIS();
      }
    });

    App.bindDropzone('dz-hfj-' + k, 'file-hfj-' + k, function (files) {
      handleHFJointPDF(k, files);
    }, false);
  };

  App.bindHFJointStepC = function (k) {
    var a = App.state.hfJoint[k];
    if (!a.enabled) return;
    var box = el('hfj-inc-box-' + k);
    if (!box) return;

    var tabs = box.querySelector('[data-hfjinctab="' + k + '"]');
    if (tabs) tabs.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      a.incomeMode = b.dataset.tab;
      App.hfJointIncomeEdit[k] = false;
      rerenderHFJoint();
    });

    box.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-hfj-edit]') : null;
      if (!b) return;
      App.hfJointIncomeEdit[k] = !App.hfJointIncomeEdit[k];
      rerenderHFJoint();
    });

    box.addEventListener('input', function (ev) {
      var t = ev.target;
      if (t.dataset.jtype != null) { a.type = t.value; rerenderHFJoint(); return; }
      if (t.dataset.bs) { a.bizman[t.dataset.bs] = t.value; App.refreshOutputs(); return; }
      if (t.dataset.jedf) { a.epf.deductions[t.dataset.jedf] = t.value; App.refreshOutputs(); return; }
      var tr = t.closest('tr'); if (!tr) return;
      if (t.dataset.jef != null && tr.dataset.jei != null) {
        var ji = +tr.dataset.jei;
        while (a.epf.months.length <= ji) a.epf.months.push({ label: '', employee: '' });
        a.epf.months[ji][t.dataset.jef] = t.value;
        if (t.dataset.jef === 'label') a.epf.months[ji].labelAuto = false;
        if (a.incomeSource === 'DOC' && App.hfJointIncomeEdit[k]) {
          a.epf.months[ji].edited = true;

          var parsed = a.epf.parsedMonths || (a.epf.parsedMonths = []);
          var jm = a.epf.months[ji];
          if (!parsed[ji]) parsed[ji] = { label: jm.label, monthIndex: null, year: null, employee: jm.employee };
          parsed[ji].label = jm.label;
          parsed[ji].employee = jm.employee;
        }
      } else if (t.dataset.mf != null && tr.dataset.mi != null) {
        a.months[+tr.dataset.mi][t.dataset.mf] = t.value;
      } else if (t.dataset.bf != null && tr.dataset.bi != null) {
        a.bizman.months[+tr.dataset.bi][t.dataset.bf] = t.value;
      } else { return; }
      App.refreshCopyListsIn('[data-hfjinc="' + k + '"]', a.months, 'manual');
      App.refreshCopyListsIn('[data-hfjepf="' + k + '"]', a.epf.months, 'epf', 'data-jei', 'data-jef');
      App.refreshOutputs();
    });

    box.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.dataset.jef != null) {
        if (t.dataset.jef === 'label') {
          var labelRow = t.closest('tr');
          if (labelRow && labelRow.dataset.jei != null) {
            App.autofillEpfLabels(a.epf.months, +labelRow.dataset.jei,
              '[data-hfjepf="' + k + '"]', 'data-jei', 'data-jef');
          }
        }
        App.refreshCopyListsIn('[data-hfjepf="' + k + '"]', a.epf.months, 'epf', 'data-jei', 'data-jef');
      } else if (t.dataset.mf != null) {
        App.refreshCopyListsIn('[data-hfjinc="' + k + '"]', a.months, 'manual');
      }
    });

    App.bindDropzone('dz-hfjinc-' + k, 'file-hfjinc-' + k, function (files) {
      handleHFJointEPF(k, files);
    }, true);
  };

  async function handleHFJointEPF(k, files) {
    var a = App.state.hfJoint[k];
    var epfFiles = (files || []).filter(function (f) { return /\.pdf$/i.test(f.name); });
    if (!epfFiles.length) return;
    App.dzState('dz-hfjinc-' + k, 'loading', 'Parsing ' + epfFiles.length + ' EPF statement(s) ...');
    try {
      var results = [];
      for (var i = 0; i < epfFiles.length; i++) {
        results.push(await E.extractFromEPFStatement(epfFiles[i]));
      }
      var epfName = '', epfIC = '';
      results.forEach(function (r) {
        if (!epfName && r.name) epfName = r.name;
        if (!epfIC && r.ic) epfIC = r.ic;
      });

      var mismatch = App.identityMismatch(epfName, epfIC, a.name, a.ic);
      if (!mismatch && (a.epf.holderName || a.epf.holderIC)) {
        mismatch = App.identityMismatch(epfName, epfIC, a.epf.holderName, a.epf.holderIC);
      }
      if (mismatch) {
        App.modal.alert(mismatch + '\n\nNothing was loaded. Attach the EPF/KWSP statement ' +
          'belonging to Joint Applicant ' + k + '.',
          { type: 'error', title: 'EPF statement rejected' });
        App.dzState('dz-hfjinc-' + k, 'error', 'EPF statement rejected - identity does not match ' +
          'Joint Applicant ' + k + ': ' + esc(mismatch.replace(/\n/g, '; ')) + '. Nothing was loaded' +
          (a.epf.months.length ? ' and the ' + a.epf.months.length + ' month(s) already attached are unchanged.' : '.'));
        return;
      }

      if (App.rememberEpfHolder) App.rememberEpfHolder(a.epf, results);
      var prior = a.epf.parsedMonths || [];
      var months = E.mergeEPFMonths([{ months: prior }].concat(results));
      if (!months.length) throw new Error('No contribution rows recognised in the PDF(s).');
      var added = months.length - prior.length;

      a.incomeMode = 'EPF';

      a.incomeSource = 'DOC';
      App.hfJointIncomeEdit[k] = false;
      a.epf.parsedMonths = months;
      a.epf.months = months.map(function (m) {
        return {
          label: m.label, employee: m.employee, edited: false,

          orig: {
            label: m.label == null ? '' : m.label,
            employee: m.employee == null ? '' : m.employee
          }
        };
      });

      while (a.epf.months.length < 12) a.epf.months.push({ label: '', employee: '', edited: false });
      rerenderHFJoint();
      App.dzState('dz-hfjinc-' + k, 'success',
        'EPF statement' + (epfFiles.length > 1 ? 's' : '') + ' parsed (' + epfFiles.length +
        ' file' + (epfFiles.length > 1 ? 's' : '') + '): ' + months.length + ' months loaded (' +
        months[0].label + ' to ' + months[months.length - 1].label + ')' +
        (prior.length ? ' - ' + (added > 0 ? added + ' new month' + (added === 1 ? '' : 's') +
          ' merged with the ' + prior.length + ' already attached' : 'already-attached months refreshed') : '') +
        '. Attach another year to extend the timeline.');
    } catch (e) {
      App.dzState('dz-hfjinc-' + k, 'error', 'EPF parsing failed: ' + esc(e.message) + ' - enter the months manually.');
      console.error(e);
    }
  }

  async function handleHFJointPDF(k, files) {
    var file = files[0];
    if (!file) return;
    var a = App.state.hfJoint[k];
    App.dzState('dz-hfj-' + k, 'loading', 'Reading ' + esc(file.name) + ' ...');
    try {
      var res = await E.extractFromExperian(file);

      var preMismatch = App.jointIncomeMismatch
        ? App.jointIncomeMismatch(a, res.name, res.icNumber) : '';
      if (preMismatch) {
        App.modal.alert(
          'The EPF statement already attached for Joint Applicant ' + k +
          ' belongs to a different person:\n\n' + preMismatch +
          '\n\nNothing was loaded. Clear that applicant or attach their correct report.',
          { type: 'error', title: 'Experian report rejected' });
        App.dzState('dz-hfj-' + k, 'error', 'Report rejected - it does not match the EPF ' +
          'already attached for Joint Applicant ' + k + ': ' +
          esc(preMismatch.replace(/\n/g, ' | ')) + '. Nothing was loaded.');
        return;
      }
      if (res.name) a.name = res.name;
      if (res.icNumber) a.ic = res.icNumber;
      if (res.iScore != null) a.iScore = res.iScore;
      if (res.reportDate) a.reportDate = res.reportDate;
      a.ccris = res.records.concat(res.nlciRecords);
      App.fillCardOverrides(a.ccris);

      App.relinkBtList(a.ccris, a.bt);
      rerenderHFJointCCRIS();
      App.dzState('dz-hfj-' + k, 'success',
        'Extracted ' + res.records.length + ' CCRIS + ' + res.nlciRecords.length +
        ' NLCI records for Joint Applicant ' + k + '.');
    } catch (e) {
      App.dzState('dz-hfj-' + k, 'error', 'Extraction failed: ' + esc(e.message) +
        ' - you can still key in the CCRIS rows manually.');
      console.error(e);
    }
  }

  /* ---------------- hf form ---------------- */
App.renderHF = function () {
    var h = App.state.hf;

    var finGrid;
    if (h.product === 'HOME ONE ACCOUNT') {
      var ho = h.hoa;
      var termGrid = function (t, p) {
        return field('Original Financing Amount', p + '-fin', t.financing) +
          field('MRTT Contribution', p + '-mrtt', t.mrtt) +
          field('Valuation Cost', p + '-val', t.valuation) +
          field('Legal &amp; Stamping Cost', p + '-legal', t.legal) +
          hfTenureField('Financing Tenure (Years)', p + '-tenure', t.tenureYears) +
          field('SBR (%)', p + '-sbr', t.sbrPct, { step: '0.01' }) +
          field('Spread on SBR (%)', p + '-spread', t.spreadPct, { step: '0.01' });
      };
      finGrid =
        '<div class="grid c3">' +
        field('Property Value', 'hoa-prop', ho.propertyValue) +
        field('Monthly CTF Installment', 'hf-ctf', h.ctf) +
        '</div>' +
        '<div class="subhead">Term Financing 1</div><div class="grid c4">' + termGrid(ho.t1, 'hoa1') + '</div>' +
        '<div class="subhead">Term Financing 2</div><div class="grid c4">' + termGrid(ho.t2, 'hoa2') + '</div>';
    } else {
      finGrid =
        '<div class="grid c3">' +
        field('Property Value', 'hf-prop', h.propertyValue) +
        field('Original Financing Amount', 'hf-fin', h.financing) +
        field('MRTT Contribution', 'hf-mrtt', h.mrtt) +
        field('Valuation Cost', 'hf-val', h.valuation) +
        field('Legal &amp; Stamping Cost', 'hf-legal', h.legal) +
        hfTenureField('Financing Tenure (Years)', 'hf-tenure', h.tenureYears) +
        field('SBR (%)', 'hf-sbr', h.sbrPct, { step: '0.01' }) +
        field('Spread on SBR (%)', 'hf-spread', h.spreadPct, { step: '0.01' }) +
        field('Monthly CTF Installment', 'hf-ctf', h.ctf) +
        '</div>';
    }

    var dsrBody =
      '<div class="subhead">' + esc(h.product) + '</div>' +
      finGrid +
      '<div id="hf-out"></div>';

    var tabs = ['dsr', 'homeone', 'structured', 'fixed', 'puc'];
    var tabLabels = ['DSR Decision', 'Home One Account (Pricing)', 'Property Fin (Structured)', 'Property Fin (Fixed)', 'Property Fin (PUC)'];
    App.hfTab = App.hfTab || 'dsr';

    var body = '<div class="tabs" id="hf-tabs">' + tabs.map(function (t, i) {
      return '<button data-tab="' + t + '" class="' + (App.hfTab === t ? 'active' : '') + '">' + tabLabels[i] + '</button>';
    }).join('') + '</div><div id="hf-tab-body"></div>';

    el('panel-hf').innerHTML = cardShell('card-hf', 'Home Financing', body);
    el('hf-tabs').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      App.hfTab = b.dataset.tab;
      App.renderHF(); App.refreshOutputs();
    });

    var tb = el('hf-tab-body');
    if (App.hfTab === 'dsr') {
      tb.innerHTML = dsrBody;
      if (h.product === 'HOME ONE ACCOUNT') {
        bindNum('hoa-prop', h.hoa, 'propertyValue'); bindNum('hf-ctf', h, 'ctf');
        [['hoa1', h.hoa.t1], ['hoa2', h.hoa.t2]].forEach(function (p) {
          bindNum(p[0] + '-fin', p[1], 'financing'); bindNum(p[0] + '-mrtt', p[1], 'mrtt');
          bindNum(p[0] + '-val', p[1], 'valuation'); bindNum(p[0] + '-legal', p[1], 'legal');
          bindTenureSelect(p[0] + '-tenure', p[1], 'tenureYears'); bindNum(p[0] + '-sbr', p[1], 'sbrPct');
          bindNum(p[0] + '-spread', p[1], 'spreadPct');
        });
      } else {
        bindNum('hf-prop', h, 'propertyValue'); bindNum('hf-fin', h, 'financing');
        bindNum('hf-mrtt', h, 'mrtt'); bindNum('hf-val', h, 'valuation');
        bindNum('hf-legal', h, 'legal'); bindTenureSelect('hf-tenure', h, 'tenureYears');
        bindNum('hf-sbr', h, 'sbrPct'); bindNum('hf-spread', h, 'spreadPct');
        bindNum('hf-ctf', h, 'ctf');
      }
    } else {
      renderHFPricingTab(tb, App.hfTab);
    }
  };

  /* ---------------- hf calculation ---------------- */
App.computeHF = function () {
    var s = App.state, h = s.hf;

    return E.computeHFSummary({
      applicants: hfApplicants(),
      customerType: s.customer.type,
      product: h.product,
      hf: h, hoa: h.hoa, ctf: h.ctf
    });
  };

  function hoaFinTable(r, s) {
    var t1 = s.hf.hoa.t1, t2 = s.hf.hoa.t2;
    var pv = num(s.hf.hoa.propertyValue);
    var mof1 = pv > 0 ? r.term1.totalFinancing / pv : 0;
    var mof2 = pv > 0 ? r.term2.totalFinancing / pv : 0;
    function pctRaw(v) { return fmtPct(num(v) / 100, 2); }
    function yrs(v) { return num(v) ? String(num(v)) : ''; }

    var rows = [
      ['Property Value', '', '', fmt(pv)],
      ['Original Financing Amount', fmt(t1.financing), fmt(t2.financing), fmt(num(t1.financing) + num(t2.financing))],
      ['MRTT Contribution', fmt(t1.mrtt), fmt(t2.mrtt), fmt(num(t1.mrtt) + num(t2.mrtt))],
      ['Valuation Cost', fmt(t1.valuation), fmt(t2.valuation), fmt(num(t1.valuation) + num(t2.valuation))],
      ['Legal &amp; Stamping Cost', fmt(t1.legal), fmt(t2.legal), fmt(num(t1.legal) + num(t2.legal))],
      ['FEC (Entry Cost)', fmt(r.term1.fec), fmt(r.term2.fec), fmt(r.fec)],
      ['Financing Tenure (Years)', yrs(t1.tenureYears), yrs(t2.tenureYears), ''],
      ['Total Financing Amount', fmt(r.term1.totalFinancing), fmt(r.term2.totalFinancing), fmt(r.totalFinancing), true],
      ['Total Margin of Financing', fmtPct(mof1, 2), fmtPct(mof2, 2), fmtPct(r.totalMOF, 2)],
      ['Standardised Base Rate (SBR)', pctRaw(t1.sbrPct), pctRaw(t2.sbrPct), ''],
      ['Spread on SBR ( + or - )', pctRaw(t1.spreadPct), pctRaw(t2.spreadPct), ''],
      ['Effective Rate', fmtPct(r.term1.effectiveRate, 2), fmtPct(r.term2.effectiveRate, 2), ''],
      ['Instalment Based on Effective Rate', fmt(r.term1.instalment), fmt(r.term2.instalment), fmt(r.instalment), true],
      ['Instalment Based on Full Tenure', fmt(r.fullTenure1), fmt(r.fullTenure2), fmt(r.fullTenure1 + r.fullTenure2), true]
    ];
    var body = rows.map(function (rw) {
      var cls = rw[4] ? ' class="hoa-emph"' : '';
      return '<tr' + cls + '><td class="hoa-lbl">' + rw[0] + '</td>' +
        '<td class="num">' + (rw[1] === '' ? '-' : rw[1]) + '</td>' +
        '<td class="num">' + (rw[2] === '' ? '-' : rw[2]) + '</td>' +
        '<td class="num hoa-total">' + (rw[3] === '' ? '-' : rw[3]) + '</td></tr>';
    }).join('');
    return '<div class="tbl-wrap"><table class="tbl hoa-tbl">' +
      '<thead><tr><th>Facility</th><th class="num">Term Financing 1</th>' +
      '<th class="num">Term Financing 2</th><th class="num">Total</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  App.refreshHFJointBlocks = function () {
    var s = App.state;
    if (!(s.hfJoint.A.enabled || s.hfJoint.B.enabled)) return;
    var r = App.computeHF();
    ['A', 'B'].forEach(function (k) {
      var a = s.hfJoint[k];
      if (!a || !a.enabled) return;
      a.ccris.forEach(function (row, i) {
        var cell = el('hfj-commit-' + k + '-' + i);
        if (!cell) return;
        var lc = E.lineCommitment(row, r.hfType, 'HF');
        cell.textContent = amt(lc.commitment);
        cell.classList.toggle('override', lc.overridden);

        var box0 = el('hfj-box-' + k);
        var ov = box0 && box0.querySelector('[data-hfjccris="' + k + '"] tr[data-i="' + i + '"] input[data-f="override"]');
        if (ov && document.activeElement !== ov) {
          var want = row.override == null ? '' : String(row.override);
          if (ov.value !== want) ov.value = want;
          ov.classList.toggle('has-value', E.hasOverride(want));
        }
      });
      (a.bt || []).forEach(function (row, i) {
        var cell = el('hfj-btrep-' + k + '-' + i);

        if (cell) cell.textContent = amt(App.btRepaymentOf(row, 'HF'));

        if (App.btLinkResolve(a.ccris, row) >= 0) {
          var box = el('hfj-box-' + k);
          var tr = box && box.querySelector('[data-hfjbt="' + k + '"] tr[data-bti="' + i + '"]');
          var oi = tr && tr.querySelector('input[data-btf="outstanding"]');
          if (oi && oi.value !== String(row.outstanding == null ? '' : row.outstanding)) {
            oi.value = String(row.outstanding == null ? '' : row.outstanding);
          }
        }
      });
      var totals = null;
      r.perApplicant.forEach(function (p) { if (p.key === k) totals = p; });
      if (totals) {
        var t55 = el('hfj-total-' + k); if (t55) t55.textContent = amt(totals.l55);
        var t56 = el('hfj-bt-total-' + k); if (t56) t56.textContent = amt(totals.l56);
        var t57 = el('hfj-grand-' + k); if (t57) t57.textContent = amt(totals.l57);
      }
      var nameEl = el('hfj-name-' + k); if (nameEl) nameEl.textContent = a.name || '-';
      var icEl = el('hfj-ic-' + k); if (icEl) icEl.textContent = E.formatIC(a.ic) || '-';
      var isEl = el('hfj-iscore-' + k); if (isEl) isEl.textContent = (a.iScore || a.iScore === 0) ? a.iScore : '-';
      var ageCell = el('hfj-age-' + k);
      if (ageCell) {
        var age = E.calculateAgeFromIC(a.ic);
        ageCell.textContent = age != null ? age + ' years' : '-';
      }

      var set = function (id, v) { var cc = el(id); if (cc) cc.textContent = fmt(v); };
      var setText = function (id, v) { var cc = el(id); if (cc) cc.textContent = v; };
      var pers = applicantPersonalIncome(k);
      if (a.type === 'BIZMAN') {
        var bz = E.calcBizmanHF(a.bizman);
        set('hfj-inc-bizcredit-' + k, bz.bizAvgCredit);
        set('hfj-inc-bizbus-' + k, bz.monthlyBusinessIncome);
        set('hfj-inc-bizpers-' + k, bz.monthlyPersonalIncome);
      } else if (a.incomeMode === 'EPF') {
        var ei = E.calcEPFIncome((a.epf.months || []).map(function (m) { return m.employee; }),
          a.epf.epfRatePct, a.epf.deductions);
        (ei.monthlyIncomes || []).forEach(function (v, i) {
          var cell = el('hfj-epf-mi-' + k + '-' + i);
          if (cell) cell.textContent = fmt(v);
        });
        set('hfj-inc-fixed-' + k, ei.fixedIncome);
        set('hfj-inc-var-' + k, ei.variableRaw);
        setText('hfj-inc-itype-' + k, ei.incomeType);
      } else {
        var mi = E.calcNormalManual(a.months || []);
        set('hfj-inc-basic-' + k, mi.basicRecog);
        set('hfj-inc-other-' + k, mi.avgOther);
        set('hfj-inc-ded-' + k, mi.average60EPF + mi.avgPCB + mi.avgSocso);
      }
      set('hfj-inc-gross-' + k, pers.gross);
      set('hfj-inc-net-' + k, pers.net);
    });
  };

  App.refreshHF = function () {
    var r = App.computeHF();
    var s = App.state;

    App.refreshHFJointBlocks();

    var out = el('hf-out');
    if (out) {
      var finBlock;
      if (r.isHOA) {
        finBlock = hoaFinTable(r, s);
      } else {
        finBlock = '<div class="tile-grid">' +
          tile('FEC (Entry Cost)', fmt(r.fec)) +
          tile('Total Financing Amount', fmt(r.totalFinancing)) +
          tile('Total Margin of Financing', fmtPct(r.totalMOF)) +
          tile('Effective Rate (SBR + Spread)', fmtPct(r.effectiveRate, 2)) +
          tile('Instalment Based on Effective Rate', fmt(r.instalment), 'accent') +
          '</div>';
      }

      var inc = r.income;
      out.innerHTML =
        '<div class="result-card">' +
        '<div class="rc-head"><span class="rc-title">Income (' + (r.perApplicant.length > 1 ? 'combined, ' + r.perApplicant.length + ' applicants' : 'single applicant') + ')</span></div>' +
        '<div class="tile-grid">' +
        tile('Basic Income', fmt(inc.basic)) +
        tile('Fixed Allowance', fmt(inc.fixedAllowance)) +
        tile('Other Income', fmt(inc.otherIncome)) +
        tile('Commission', fmt(inc.commission)) +
        tile('OT', fmt(inc.ot)) +
        tile('Gross Income', fmt(inc.grossIncome), 'accent') +
        tile('EPF', fmt(inc.epf)) +
        tile('PCB/Zakat/Tax Deduction', fmt(inc.pcb)) +
        tile('Socso', fmt(inc.socso)) +
        tile('Net Income', fmt(inc.netIncome), 'good') +
        '</div></div>' +
        '<div class="result-card">' +
        '<div class="rc-head"><span class="rc-title">Commitments</span></div>' +
        '<div class="tile-grid">' +
        r.perApplicant.map(function (p) {
          return tile(p.label + ' (L57)', fmt(p.l57));
        }).join('') +
        tile('Total CCRIS (L55)', fmt(r.totalCommitment)) +
        tile('Deduct BT &amp; PF Settlement (L56)', fmt(r.btTotal)) +
        tile('Grand Total Commitment (L57)', fmt(r.grandTotal), 'accent') +
        '</div></div>' +
        '<div class="result-card">' +
        '<div class="rc-head"><span class="rc-title">' + esc(s.hf.product) + '</span></div>' +
        finBlock + '</div>' +
        '<div class="result-card">' +
        '<div class="rc-head"><span class="rc-title">DSR After Balance Transfer</span>' +
        (r.verdict && App.mode !== 'hf' ? '<span class="verdict ' + vClass(r.verdict) + '">' + vLabel(r.verdict) + '</span>' : '') +
        '</div>' +
        '<p><span class="verdict ' + (r.newDSR > 0 && r.threshold > 0 && r.newDSR <= r.threshold ? 'ok' : 'fail') +
        '">DSR ' + fmtPct(r.newDSR, DSR_DP) + '</span></p>' +
        gauge(r.newDSR, r.threshold || 0.0001) +
        '<div class="tile-grid" style="margin-top:10px">' +
        tile('Monthly Installment', fmt(r.instalment)) +
        tile('Monthly CTF Installment', fmt(r.ctf)) +
        tile('New Commitment', fmt(r.newCommitment)) +
        tile('New DSR', fmtPct(r.newDSR, DSR_DP)) +
        '</div></div>';
    }
    refreshHFPricing();
  };

  /* ---------------- B2 pricing sub-calculators (quotation only) ---------------- */
  function renderHFPricingTab(container, tab) {
    var hp = App.state.hfPricing;
    var html = '';

    if (tab === 'structured' || tab === 'puc') {
      var o = tab === 'puc' ? hp.puc : hp.structured;
      html += '<div class="grid c3">' +
        field('Property Value', 'hpx-prop', o.propertyValue) +
        field('Original Financing Amount', 'hpx-fin', o.financing) +
        field('MRTT Contribution', 'hpx-mrtt', o.mrtt) +
        field('Valuation Cost', 'hpx-val', o.valuation) +
        field('Legal &amp; Stamping', 'hpx-legal', o.legal) +
        hfTenureField('Tenure (years)', 'hpx-tenure', o.tenureYears) +
        (tab === 'puc' ? field('Grace Period (years)', 'hpx-grace', o.graceYears) : '') +
        field('Ceiling Rate (%)', 'hpx-ceil', o.ceilingPct, { step: '0.01' }) +
        field('Base / SBR (%)', 'hpx-base', o.basePct, { step: '0.01' }) +
        field('Spread (%)', 'hpx-spread', o.spreadPct, { step: '0.01' }) +
        '</div><div id="hfp-out"></div>';
      container.innerHTML = html;
      bindNum('hpx-prop', o, 'propertyValue'); bindNum('hpx-fin', o, 'financing');
      bindNum('hpx-mrtt', o, 'mrtt'); bindNum('hpx-val', o, 'valuation');
      bindNum('hpx-legal', o, 'legal'); bindTenureSelect('hpx-tenure', o, 'tenureYears');
      bindNum('hpx-ceil', o, 'ceilingPct'); bindNum('hpx-base', o, 'basePct');
      bindNum('hpx-spread', o, 'spreadPct');
      if (tab === 'puc') bindNum('hpx-grace', o, 'graceYears');
    } else if (tab === 'fixed') {
      var f = hp.fixed;
      html += '<div class="grid c3">' +
        field('Property Value', 'hpf-prop', f.propertyValue) +
        field('Financing Amount', 'hpf-fin', f.financing) +
        field('MRTT', 'hpf-mrtt', f.mrtt) +
        field('Valuation Cost', 'hpf-val', f.valuation) +
        field('Legal &amp; Stamping', 'hpf-legal', f.legal) +
        hfTenureField('Tenure (years)', 'hpf-tenure', f.tenureYears) +
        field('Fixed Rate (%)', 'hpf-rate', f.ratePct, { step: '0.01' }) +
        '</div><div id="hfp-out"></div>';
      container.innerHTML = html;
      bindNum('hpf-prop', f, 'propertyValue'); bindNum('hpf-fin', f, 'financing');
      bindNum('hpf-mrtt', f, 'mrtt'); bindNum('hpf-val', f, 'valuation');
      bindNum('hpf-legal', f, 'legal'); bindTenureSelect('hpf-tenure', f, 'tenureYears');
      bindNum('hpf-rate', f, 'ratePct');
    } else if (tab === 'homeone') {
      var ho = hp.homeOne;
      function hoTermInputs(t, p) {
        return field('Original Financing Amount', p + '-fin', t.financing) +
          field('Renovation + Education', p + '-ren', t.renovation) +
          field('MRTT Contribution', p + '-mrtt', t.mrtt) +
          field('Valuation Cost', p + '-val', t.valuation) +
          field('Legal &amp; Stamping', p + '-legal', t.legal) +
          hfTenureField('Financing Tenure (Years)', p + '-tenure', t.tenureYears) +
          field('Spread on SBR (%)', p + '-spread', t.spreadPct, { step: '0.01' });
      }
      html += '<div class="grid c3">' +
        field('Property Value', 'hph-prop', ho.propertyValue) +
        field('Standardised Base Rate SBR (%)', 'hph-sbr', ho.sbrPct, { step: '0.01' }) +
        field('Ceiling Rate (%)', 'hph-ceil', ho.ceilingPct, { step: '0.01' }) +
        '</div>' +
        '<div class="subhead">Term Financing 1</div><div class="grid c4">' + hoTermInputs(ho.t1, 'hph1') + '</div>' +
        '<div class="subhead">Term Financing 2</div><div class="grid c4">' + hoTermInputs(ho.t2, 'hph2') + '</div>' +
        '<div id="hfp-out"></div>';
      container.innerHTML = html;
      bindNum('hph-prop', ho, 'propertyValue');
      bindNum('hph-sbr', ho, 'sbrPct'); bindNum('hph-ceil', ho, 'ceilingPct');
      [['hph1', ho.t1], ['hph2', ho.t2]].forEach(function (pr) {
        bindNum(pr[0] + '-fin', pr[1], 'financing'); bindNum(pr[0] + '-ren', pr[1], 'renovation');
        bindNum(pr[0] + '-mrtt', pr[1], 'mrtt'); bindNum(pr[0] + '-val', pr[1], 'valuation');
        bindNum(pr[0] + '-legal', pr[1], 'legal'); bindTenureSelect(pr[0] + '-tenure', pr[1], 'tenureYears');
        bindNum(pr[0] + '-spread', pr[1], 'spreadPct');
      });
    }
  }

  function refreshHFPricing() {
    var out = el('hfp-out');
    if (!out) return;
    var hp = App.state.hfPricing, tab = App.hfTab, html = '';

    function pct(v) { return num(v) / 100; }

    if (tab === 'structured') {
      var o = hp.structured;
      var r = E.hfStructured({
        propertyValue: o.propertyValue, financing: o.financing, mrtt: o.mrtt,
        valuation: o.valuation, legal: o.legal, tenureYears: o.tenureYears,
        ceilingRate: pct(o.ceilingPct), baseRate: pct(o.basePct), spread: pct(o.spreadPct)
      });
      html = '<div class="tile-grid" style="margin-top:12px">' +
        tile('FEC (Entry Cost)', fmt(r.fec)) +
        tile('Total Financing', fmt(r.totalFinancing)) +
        tile('Original HF MOF', fmtPct(r.origMOF)) +
        tile('Total MOF', fmtPct(r.totalMOF)) +
        tile('Effective Rate', fmtPct(r.effectiveRate, 2)) +
        tile('Selling Price @ Ceiling', fmt(r.sellingPrice), 'accent') +
        tile('Instalment @ Ceiling', fmt(r.instalmentCeiling)) +
        tile('Instalment @ Effective', fmt(r.instalmentEffective), 'good') +
        '</div><p><span class="verdict ' + (r.mrttFecRatio <= 0.05 ? 'ok' : 'fail') + '">' + r.note + '</span></p>';
    } else if (tab === 'fixed') {
      var f = hp.fixed;
      var rf = E.hfFixed({
        propertyValue: f.propertyValue, financing: f.financing, mrtt: f.mrtt,
        valuation: f.valuation, legal: f.legal, tenureYears: f.tenureYears,
        rate: pct(f.ratePct)
      });
      html = '<div class="tile-grid" style="margin-top:12px">' +
        tile('Entry Costs', fmt(rf.entryCosts)) +
        tile('3% Entry Guide', fmt(rf.entryGuide3pct)) +
        tile('Total Financing', fmt(rf.totalFinancing)) +
        tile('HF MOF', fmtPct(rf.hfMOF)) +
        tile('Total MOF', fmtPct(rf.totalMOF)) +
        tile('Selling Price', fmt(rf.sellingPrice), 'accent') +
        tile('Monthly Instalment', fmt(rf.instalment), 'good') +
        '</div><p><span class="verdict ' + (rf.entryRatio <= 0.05 ? 'ok' : 'fail') + '">' + rf.note + '</span></p>';
    } else if (tab === 'puc') {
      var pz = hp.puc;
      var rp = E.hfPUC({
        propertyValue: pz.propertyValue, financing: pz.financing, mrtt: pz.mrtt,
        valuation: pz.valuation, legal: pz.legal, tenureYears: pz.tenureYears,
        graceYears: pz.graceYears, ceilingRate: pct(pz.ceilingPct),
        baseRate: pct(pz.basePct), spread: pct(pz.spreadPct)
      });
      html = '<div class="tile-grid" style="margin-top:12px">' +
        tile('FEC (Entry Cost)', fmt(rp.fec)) +
        tile('Total Financing', fmt(rp.totalFinancing)) +
        tile('Total MOF', fmtPct(rp.totalMOF)) +
        tile('Effective Rate', fmtPct(rp.effectiveRate, 2)) +
        tile('Selling Price incl Grace @ Ceiling', fmt(rp.sellingPriceWithGrace), 'accent') +
        tile('Grace Monthly Profit @ Ceiling', fmt(rp.graceMonthlyCeiling)) +
        tile('Grace Monthly Profit @ Effective', fmt(rp.graceMonthlyEffective)) +
        tile('Instalment @ Ceiling (after grace)', fmt(rp.instalmentCeiling)) +
        tile('Instalment @ Effective (after grace)', fmt(rp.instalmentEffective), 'good') +
        '</div><p><span class="verdict ' + (rp.mrttFecRatio <= 0.05 ? 'ok' : 'fail') + '">' + rp.note + '</span></p>';
    } else if (tab === 'homeone') {
      var ho = hp.homeOne;
      var rh = E.hfHomeOne({
        propertyValue: ho.propertyValue, sbr: pct(ho.sbrPct), ceiling: pct(ho.ceilingPct),
        t1: { financing: ho.t1.financing, renovation: ho.t1.renovation, mrtt: ho.t1.mrtt,
              valuation: ho.t1.valuation, legal: ho.t1.legal, tenureYears: ho.t1.tenureYears, spread: pct(ho.t1.spreadPct) },
        t2: { financing: ho.t2.financing, renovation: ho.t2.renovation, mrtt: ho.t2.mrtt,
              valuation: ho.t2.valuation, legal: ho.t2.legal, tenureYears: ho.t2.tenureYears, spread: pct(ho.t2.spreadPct) }
      });
      var t1 = rh.t1, t2 = rh.t2, tt = rh.totals;
      function yrs(v) { return num(v) ? String(num(v)) : ''; }

      var rows = [
        ['Property Value', '', '', fmt(rh.property)],
        ['Original Financing Amount', fmt(t1.financing), fmt(t2.financing), fmt(tt.financing)],
        ['Renovation + Education', fmt(t1.renovation), fmt(t2.renovation), fmt(tt.renovation)],
        ['MRTT Contribution', fmt(t1.mrtt), fmt(t2.mrtt), fmt(tt.mrtt)],
        ['Valuation Cost', fmt(t1.valuation), fmt(t2.valuation), fmt(tt.valuation)],
        ['Legal &amp; Stamping Cost', fmt(t1.legal), fmt(t2.legal), fmt(tt.legal)],
        ['FEC (Entry Costs) [ e + f ]', fmt(t1.fec), fmt(t2.fec), fmt(tt.fec)],
        ['Financing Tenure (Years)', yrs(t1.tenure), yrs(t2.tenure), ''],
        ['Total Financing Amount [ c + c1 + d + g ]', fmt(t1.totalFinancing), fmt(t2.totalFinancing), fmt(tt.totalFinancing), true],
        ['Original HF MOF [ (c + c1) / b ]', fmtPct(t1.origMOF, 2), fmtPct(t2.origMOF, 2), fmtPct(tt.origMOF, 2)],
        ['FEC MOF [ g / b ]', fmtPct(t1.fecMOF, 2), fmtPct(t2.fecMOF, 2), fmtPct(tt.fecMOF, 2)],
        ['MRTT MOF (Inclusive FEC) [ (d + g) / b ]', fmtPct(t1.mrttMOF, 2), fmtPct(t2.mrttMOF, 2), fmtPct(tt.mrttMOF, 2)],
        ['Total Margin of Financing (MOF) [ i / b ]', fmtPct(t1.totalMOF, 2), fmtPct(t2.totalMOF, 2), fmtPct(tt.totalMOF, 2)],
        ['Ceiling Rate', fmtPct(rh.ceiling, 2), fmtPct(rh.ceiling, 2), fmtPct(rh.ceiling, 2)],
        ['Selling Price (Based on Ceiling Rate)', fmt(t1.sellingPriceCeiling), fmt(t2.sellingPriceCeiling), fmt(tt.sellingPriceCeiling)],
        ['Instalment Based on Ceiling Rate', fmt(t1.instalmentCeiling), fmt(t2.instalmentCeiling), fmt(tt.instalmentCeiling)],
        ['Standardised Base Rate (SBR)', fmtPct(rh.sbr, 2), fmtPct(rh.sbr, 2), ''],
        ['Spread on SBR ( + or - )', fmtPct(t1.spread, 2), fmtPct(t2.spread, 2), ''],
        ['Effective Rate', fmtPct(t1.effectiveRate, 2), fmtPct(t2.effectiveRate, 2), ''],
        ['Instalment Based on Effective Rate', fmt(t1.instalmentEffective), fmt(t2.instalmentEffective), fmt(tt.instalmentEffective), true]
      ];
      var bodyRows = rows.map(function (rw) {
        var cls = rw[4] ? ' class="hoa-emph"' : '';
        return '<tr' + cls + '><td class="hoa-lbl">' + rw[0] + '</td>' +
          '<td class="num">' + (rw[1] === '' ? '-' : rw[1]) + '</td>' +
          '<td class="num">' + (rw[2] === '' ? '-' : rw[2]) + '</td>' +
          '<td class="num hoa-total">' + (rw[3] === '' ? '-' : rw[3]) + '</td></tr>';
      }).join('');
      html = '<div class="tbl-wrap" style="margin-top:12px"><table class="tbl hoa-tbl">' +
        '<thead><tr><th>Facility</th><th class="num">Term Financing 1</th>' +
        '<th class="num">Term Financing 2</th><th class="num">Total</th></tr></thead>' +
        '<tbody>' + bodyRows + '</tbody></table></div>' +
        '<div class="tile-grid" style="margin-top:10px">' +
        tile('Blended Effective Rate', fmtPct(rh.blendedRate, 3), 'accent') +
        tile('Total Monthly Instalment (Effective)', fmt(tt.instalmentEffective), 'good') +
        '</div>' +
        '<p><span class="verdict ' + (rh.mrttFecRatio <= 0.05 ? 'ok' : 'fail') + '">' + rh.note + '</span></p>';
    }
    out.innerHTML = html;
  }

  App.registerProduct({
    id: 'hf', label: 'Home Financing (HF)', name: 'Home Financing', short: 'HF',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><rect x="10" y="14" width="4" height="5.5"/></svg>',
    panel: 'panel-hf', render: 'renderHF', refresh: 'refreshHF',
    preRefresh: 'refreshHFJointBlocks'
  });
  App.mod = App.mod || {};
  App.mod.hf = { hfJointCCRISRows: hfJointCCRISRows, hfJointEPFForm: hfJointEPFForm, jointRecognisedHtml: jointRecognisedHtml, rerenderHFJoint: rerenderHFJoint, rerenderHFJointCCRIS: rerenderHFJointCCRIS, hoaFinTable: hoaFinTable, renderHFPricingTab: renderHFPricingTab, refreshHFPricing: refreshHFPricing };
})();
