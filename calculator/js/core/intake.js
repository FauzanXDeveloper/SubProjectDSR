/* ---------------- intake ---------------- */

(function () {
  'use strict';
  var App = window.App = window.App || {};
  var E = window.Engine;

  var fmt = E.formatCurrency;
  var amt = E.formatAmount;
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, '')); return isFinite(n) ? n : 0; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }

  function identityMismatch(epfName, epfIC, expName, expIC) {
    function normName(v) { return String(v || '').toUpperCase().replace(/[^A-Z]/g, ''); }
    function normIC(v) { return String(v || '').replace(/\D/g, ''); }
    var reasons = [];
    var eIC = normIC(epfIC), xIC = normIC(expIC);
    if (eIC && xIC && eIC !== xIC) {
      reasons.push('IC: statement ' + E.formatIC(epfIC) + '  vs  report ' + E.formatIC(expIC));
    }
    var eN = normName(epfName), xN = normName(expName);

    if (eN && xN && eN.indexOf(xN) === -1 && xN.indexOf(eN) === -1) {
      reasons.push('Name: statement "' + epfName + '"  vs  report "' + expName + '"');
    }
    return reasons.join('\n');
  }

  App.identityMismatch = identityMismatch;

  function rememberEpfHolder(epf, results) {
    (results || []).forEach(function (r) {
      if (!epf.holderName && r.name) epf.holderName = r.name;
      if (!epf.holderIC && r.ic) epf.holderIC = r.ic;
    });
  }
  App.rememberEpfHolder = rememberEpfHolder;

  function loadedIncomeMismatch(state, expName, expIC) {
    var reasons = [];
    var epf = state.income.epf || {};
    if (epf.holderName || epf.holderIC) {
      var m = identityMismatch(epf.holderName, epf.holderIC, expName, expIC);
      if (m) reasons.push('EPF statement: ' + m.replace(/\n/g, '; '));
    }
    var ph = state.income.payslipHolder;
    if (ph && (ph.name || ph.ic)) {
      var m2 = identityMismatch(ph.name, ph.ic, expName, expIC);
      if (m2) reasons.push('Payslip: ' + m2.replace(/\n/g, '; '));
    }
    return reasons.join('\n');
  }
  App.loadedIncomeMismatch = loadedIncomeMismatch;

  App.jointIncomeMismatch = function (a, expName, expIC) {
    var epf = (a && a.epf) || {};
    if (!(epf.holderName || epf.holderIC)) return '';
    return identityMismatch(epf.holderName, epf.holderIC, expName, expIC);
  };

  /* ---------------- shared computed values ---------------- */
  App.computed = {};

  App.ccrisEditIdx = null;
  App.ccrisEditSnapshot = null;
  App.incomeEditMode = false;

  App.computeShared = function () {
    var s = App.state;
    var age = E.calculateAgeFromIC(s.customer.ic);

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

    s.customer.cardType = (income.grossIncome || 0) >= E.CONFIG.classBreak ? 'TYPE B' : 'TYPE A';

    var totals = E.totalCommitments(s.ccris, s.customer.cardType);

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
      totalCommitment: totals.total,
      stressTotal: totals.stressTotal,
      unsecuredTotal: totals.unsecuredTotal,
      btCC: btCC,
      btPF: btPF,
      btTotal: btTotal,
      grandTotal: totals.total - btTotal,
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

  /* ---------------- customer details ---------------- */
App.renderCustomer = function () {
    var c = App.state.customer;

    var mode = String(App.mode || '');
    var isHF = mode.indexOf('hf') !== -1;

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

    var locked = !!c.fromExperian;
    var lockAttr = locked ? ' disabled' : '';
    var lockCls = locked ? 'readonly' : 'editable';
    var body =
      '<div class="grid c4">' +

      '<div class="field"><label>Customer Name</label>' +
      '<input class="' + lockCls + '" id="cust-name"' + lockAttr + ' value="' + esc(c.name) + '"></div>' +
      '<div class="field"><label>IC / Passport Number</label>' +
      '<input class="' + lockCls + '" id="cust-ic" data-fmt="ic"' + lockAttr + ' value="' + esc(E.formatIC(c.ic)) + '"></div>' +
      '<div class="field"><label>Age (derived from IC)</label>' +
      '<span class="readonly-val" id="cust-age">-</span></div>' +

      (isHF ? '' :
        '<div class="field"><label>Customer Type</label>' +
        '<select class="editable" id="cust-type">' +
        '<option' + (c.type === 'NORMAL' ? ' selected' : '') + '>NORMAL</option>' +
        '<option' + (c.type === 'BIZMAN' ? ' selected' : '') + '>BIZMAN</option></select></div>') +
      '<div class="field"><label>Report Date</label>' +
      '<span class="readonly-val" id="cust-reportdate">' + esc(App.state.reportDate || '-') + '</span></div>' +
      '<div class="field"><label>Experian iScore</label>' +

      '<input class="editable" id="cust-iscore" type="text" inputmode="numeric" value="' +
        esc(App.state.iScore) + '"></div>' +
      '<div class="field"><label>Customer Class</label>' +
      '<span class="readonly-val" id="cust-cardtype">' + esc(c.cardType) + '</span></div>' +
      lastField +
      '</div>' +
      (App.customerDetailsV2 ? App.customerDetailsV2.html() : '');
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
      App.renderIncome();
      App.refreshOutputs();
    };
    var prodSel = el('cust-hfproduct');
    if (prodSel) prodSel.onchange = function () {
      App.state.hf.product = this.value;
      App.renderHF();
      App.refreshOutputs();
    };
    var ccProdSel = el('cust-ccproduct');
    if (ccProdSel) ccProdSel.onchange = function () {
      App.state.cc.product = this.value;
      App.renderCC();
      App.refreshOutputs();
    };

    if (App.customerDetailsV2) App.customerDetailsV2.bind();
  };

  var CAPACITIES = ['OWN', 'JOINT', 'GUARANTOR', 'DIRECTOR'];

  var COLLATERALS = ['', 'PROPERTIES', 'CLEAN', 'MOTOR V (JPJ)', 'UNIT TRUST', 'SHARES', 'FIN.ASSTS', 'OTHERS'];

  function newCCRISRow() {
    return { no: App.state.ccris.length + 1, date: '', capacity: 'OWN', collateral: '',
      facility: '', outstanding: '', limit: '', legalStatus: '',
      commitmentPerCCRIS: '', override: '', floating: 'NO', sourceSection: 'USER',
      confirmed: false };
  }

  function selectHtml(options, value, cls) {
    return '<select class="' + (cls || '') + '">' + options.map(function (o) {
      return '<option value="' + esc(o) + '"' + (String(o) === String(value) ? ' selected' : '') + '>' +
        (o === '' ? '-' : esc(o)) + '</option>';
    }).join('') + '</select>';
  }

  App.btLinkResolve = function (ccris, bt) {
    if (!bt || !bt.link || bt.link.i == null) return -1;
    var r = (ccris || [])[bt.link.i];
    if (!r) return -1;
    if (String(r.facility || '').toUpperCase().trim() !==
        String(bt.link.facility || '').toUpperCase().trim()) return -1;
    if (String(r.date || '') !== String(bt.link.date || '')) return -1;
    return bt.link.i;
  };

  App.btEligibleOptions = function (ccris, btList, selfIdx, type) {
    var wantCard = type !== 'SETTLE';
    var taken = {};
    (btList || []).forEach(function (b2, j) {
      if (j === selfIdx) return;
      var li = App.btLinkResolve(ccris, b2);
      if (li >= 0) taken[li] = true;
    });
    var out = [];
    (ccris || []).forEach(function (r, i) {
      if (taken[i] || !E.isBtEligibleLine(r)) return;
      var isCard = String(r.facility || '').toUpperCase().trim() === 'CRDTCARD';
      if (wantCard !== isCard) return;
      if (!(Math.abs(num(r.outstanding)) > 0)) return;
      out.push({ i: i, label: '#' + (r.no || (i + 1)) + ' ' + (r.facility || '?') +
        ' \u2014 ' + E.formatAmount(num(r.outstanding)) });
    });
    return out;
  };

  App.btRepaymentOf = function (bt, variant) {
    if (!bt) return 0;
    if (bt.type === 'BT') {
      var o = Math.abs(num(bt.outstanding));
      if (variant === 'HF') return o * (E.CONFIG.ccris.btRatePct / 100);
      return E.btRepayment(o);
    }
    return num(bt.repayment);
  };

  App.cardOverrideFor = function (outstanding) {
    var value = Math.abs(num(outstanding)) * (E.CONFIG.ccris.cardRatePct / 100);
    if (!(value > 0)) return '';
    if (value < E.CONFIG.ccris.cardFloor) value = E.CONFIG.ccris.cardFloor;
    return String(Math.round(value * 100) / 100);
  };

  App.fillCardOverrides = function (rows) {
    (rows || []).forEach(function (row) {
      if (String(row.facility || '').toUpperCase().trim() !== 'CRDTCARD') return;
      if (E.hasOverride(row.override)) return;
      var value = App.cardOverrideFor(row.outstanding);
      if (value !== '') row.override = value;
    });
  };

  App.btLinkOfList = function (ccris, btList, ccrisIdx) {
    var found = null;
    (btList || []).forEach(function (b, j) {
      if (found == null && App.btLinkResolve(ccris, b) === ccrisIdx) found = j;
    });
    return found;
  };

  App.btDetach = function (ccris, bt) {
    if (!bt || !bt.link) return;
    var li = App.btLinkResolve(ccris, bt);
    if (li >= 0) {
      var row = ccris[li];
      if (row && bt.link.mirrored != null &&
          String(row.override) === String(bt.link.mirrored)) {
        row.override = bt.link.prevOverride == null ? '' : bt.link.prevOverride;
      }
    }
    bt.link = null;
  };

  App.applyBtLink = function (ccris, btList, bIdx, targetVal, cardType, variant) {
    var bt = (btList || [])[bIdx];
    if (!bt) return;
    App.btDetach(ccris, bt);
    if (targetVal == null || targetVal === '' || targetVal === 'manual') {
      bt.link = null; return;
    }
    var i = parseInt(targetVal, 10);
    var row = (ccris || [])[i];
    if (!row || !E.isBtEligibleLine(row)) return;
    bt.link = { i: i, facility: String(row.facility || '').toUpperCase().trim(),
      date: row.date || '', prevOverride: row.override == null ? '' : row.override,
      mirrored: null };
    bt.outstanding = row.outstanding;
    bt.type = String(row.facility || '').toUpperCase().trim() === 'CRDTCARD' ? 'BT' : 'SETTLE';
    if (bt.type !== 'BT' && (bt.repayment == null || String(bt.repayment).trim() === '')) {
      bt.repayment = String(Math.round(
        E.lineCommitment(row, cardType, variant).commitment * 100) / 100);
    }
  };

  App.fixBtLinksOnDelete = function (btList, delIdx) {
    (btList || []).forEach(function (bt) {
      if (!bt || !bt.link || bt.link.i == null) return;
      if (bt.link.i === delIdx) bt.link = null;
      else if (bt.link.i > delIdx) bt.link.i--;
    });
  };

  App.relinkBtList = function (ccris, btList) {
    var used = {};
    (btList || []).forEach(function (bt) {
      if (!bt || !bt.link) return;
      var found = -1;
      (ccris || []).forEach(function (r, i) {
        if (found >= 0 || used[i]) return;
        if (String(r.facility || '').toUpperCase().trim() !==
            String(bt.link.facility || '').toUpperCase().trim()) return;
        if (String(r.date || '') !== String(bt.link.date || '')) return;
        if (Math.abs(num(r.outstanding) - num(bt.outstanding)) > 0.005) return;
        found = i;
      });
      if (found >= 0) {
        used[found] = true;
        bt.link.i = found;
        bt.link.prevOverride = ccris[found].override == null ? '' : ccris[found].override;
      } else {
        bt.link = null;
      }
    });
  };

  App.syncBtLinksFor = function (ccris, btList, variant) {
    (btList || []).forEach(function (bt) {
      if (!bt || !bt.link) return;
      var li = App.btLinkResolve(ccris, bt);
      if (li < 0) { bt.link = null; return; }
      var row = ccris[li];
      bt.outstanding = row.outstanding;
      var pristine = bt.link.mirrored == null ||
        String(row.override) === String(bt.link.mirrored);
      if (!pristine) return;
      var blankSettle = bt.type !== 'BT' &&
        String(bt.repayment == null ? '' : bt.repayment).trim() === '';
      var repStr = blankSettle ? '' :
        String(Math.round(App.btRepaymentOf(bt, variant) * 100) / 100);
      bt.link.mirrored = repStr;
      row.override = repStr;
    });
  };

  App.syncBtLinks = function () {
    var s = App.state;
    if (!s) return;
    App.syncBtLinksFor(s.ccris, s.bt);
    ['A', 'B'].forEach(function (k) {
      var a = s.hfJoint && s.hfJoint[k];
      if (a && a.enabled) App.syncBtLinksFor(a.ccris, a.bt, 'HF');
    });
  };

  App.btLinkSelectHtml = function (ccris, btList, bIdx) {
    var b = (btList || [])[bIdx] || {};
    var live = App.btLinkResolve(ccris, b) >= 0 && b.link;
    var h = '<select data-btf="link" title="Pick the CCRIS line being transferred/settled, or type the amount manually">';
    h += '<option value="manual"' + (b.link ? '' : ' selected') + '>Manual amount\u2026</option>';
    App.btEligibleOptions(ccris, btList, bIdx, b.type).forEach(function (o) {
      h += '<option value="' + o.i + '"' + (live && b.link.i === o.i ? ' selected' : '') +
        '>' + esc(o.label) + '</option>';
    });
    h += '</select>';
    return h;
  };

  /* ---------------- CCRIS facility picker (custom, no scrollbar) ---------------- */
  function facilityCodes(value) {
    var v = String(value || '').toUpperCase().trim();
    var list = E.FACILITY_LIST.slice();
    if (v && list.indexOf(v) === -1) list.unshift(v);
    return list;
  }
  App.facilityDropdownHtml = function (value, extraCls) {
    var v = String(value || '').toUpperCase().trim();
    return '<div class="dd' + (extraCls ? ' ' + extraCls : '') + '">' +
      '<button class="dd-btn" type="button" data-dd-open aria-haspopup="listbox">' +
      '<span class="dd-val">' + esc(v || '-') + '</span><span class="dd-arrow"></span></button>' +
      '<input type="hidden" data-f="facility" value="' + esc(v) + '"></div>';
  };
  App._dd = null;
  App.closeFacilityMenu = function () {
    if (!App._dd) return;
    if (App._dd.menu.parentNode) App._dd.menu.parentNode.removeChild(App._dd.menu);
    App._dd.wrap.classList.remove('dd-open');
    App._dd = null;
  };
  App.openFacilityMenu = function (btn) {
    App.closeFacilityMenu();
    App.closeIncomeMenu();
    var wrap = btn.closest('.dd');
    var hidden = wrap && wrap.querySelector('input[data-f="facility"]');
    if (!hidden) return;
    var cur = String(hidden.value || '').toUpperCase().trim();
    var menu = document.createElement('div');
    menu.className = 'dd-menu';
    menu.setAttribute('role', 'listbox');
    [''].concat(facilityCodes(cur)).forEach(function (code) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dd-item' + (code === cur ? ' sel' : '');
      b.textContent = code || '-';
      b.dataset.val = code;
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    wrap.classList.add('dd-open');
    var r = btn.getBoundingClientRect();
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - mw - 8));
    var below = r.bottom + 2;
    var top = (below + mh <= window.innerHeight - 8)
      ? below : Math.max(8, r.top - mh - 2);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    App._dd = { menu: menu, wrap: wrap, hidden: hidden, btn: btn };
  };
  document.addEventListener('click', function (ev) {
    var item = ev.target.closest ? ev.target.closest('.dd-item') : null;
    if (item && App._dd) {
      var d = App._dd;
      var val = item.dataset.val || '';
      d.hidden.value = val;
      var shown = d.wrap.querySelector('.dd-val');
      if (shown) shown.textContent = val || '-';
      App.closeFacilityMenu();
      d.hidden.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    var openBtn = ev.target.closest ? ev.target.closest('[data-dd-open]') : null;
    if (openBtn) {
      ev.preventDefault();
      App.openFacilityMenu(openBtn);
      return;
    }
    if (App._dd && !(ev.target.closest && ev.target.closest('.dd-menu'))) {
      App.closeFacilityMenu();
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') App.closeFacilityMenu();
  });
  window.addEventListener('resize', function () { App.closeFacilityMenu(); });
  window.addEventListener('scroll', function () { App.closeFacilityMenu(); }, true);

  /* ---------------- income suggestion picker (same .dd look as CCRIS) ---------------- */
  App._incomeDd = null;
  App.closeIncomeMenu = function () {
    if (!App._incomeDd) return;
    if (App._incomeDd.menu.parentNode) App._incomeDd.menu.parentNode.removeChild(App._incomeDd.menu);
    if (App._incomeDd.wrap) App._incomeDd.wrap.classList.remove('dd-open');
    App._incomeDd = null;
  };
  App.openIncomeMenu = function (input) {
    if (App._incomeDd && App._incomeDd.input === input) {
      App.closeIncomeMenu();
      return;
    }
    App.closeIncomeMenu();
    App.closeFacilityMenu();
    if (!input || input.disabled) return;

    var listId = input.getAttribute('data-copy-list');
    var list = listId && document.getElementById(listId);
    if (!list) return;
    var values = Array.prototype.slice.call(list.options).map(function (o) {
      return o.value;
    }).filter(function (v) {
      return String(v).trim() !== '';
    });
    if (!values.length) return;

    var menu = document.createElement('div');
    menu.className = 'dd-menu income-dd-menu';
    menu.setAttribute('role', 'listbox');
    values.forEach(function (value) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'dd-item';
      item.textContent = value;
      item.dataset.val = value;
      menu.appendChild(item);
    });
    document.body.appendChild(menu);

    var wrap = input.closest('.income-dd');
    if (wrap) wrap.classList.add('dd-open');
    var rect = input.getBoundingClientRect();
    var menuWidth = menu.offsetWidth;
    var menuHeight = menu.offsetHeight;
    var left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
    var below = rect.bottom + 2;
    var top = (below + menuHeight <= window.innerHeight - 8)
      ? below : Math.max(8, rect.top - menuHeight - 2);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    App._incomeDd = { menu: menu, wrap: wrap, input: input };
  };

  document.addEventListener('click', function (ev) {
    var incomeItem = ev.target.closest ? ev.target.closest('.income-dd-menu .dd-item') : null;
    if (incomeItem && App._incomeDd) {
      var target = App._incomeDd.input;
      target.value = incomeItem.dataset.val || '';
      App.closeIncomeMenu();
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      target.focus();
      return;
    }

    var incomeBtn = ev.target.closest ? ev.target.closest('[data-dd-income]') : null;
    if (incomeBtn) {
      ev.preventDefault();
      var picker = incomeBtn.closest('.income-dd');
      var field = picker && picker.querySelector('input');
      if (field) App.openIncomeMenu(field);
      return;
    }

    if (App._incomeDd &&
        !(ev.target.closest && (ev.target.closest('.income-dd-menu') || ev.target.closest('.income-dd')))) {
      App.closeIncomeMenu();
    }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') App.closeIncomeMenu();
  });
  window.addEventListener('resize', function () { App.closeIncomeMenu(); });
  window.addEventListener('scroll', function () { App.closeIncomeMenu(); }, true);

  /* ---------------- ccris records ---------------- */
App.renderCCRIS = function () {
    var s = App.state;
    var pdfOk = E.pdfAvailable();

    function plainMoney(v) {
      var n = num(v);
      return n ? n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
    }

    function isEditedField(r, f) { return !!(r.editedFields && r.editedFields[f]); }
    function editCls(r, f) { return isEditedField(r, f) ? ' edited' : ''; }
    function lockedCell(r, f, isNum) {
      var v = r[f];
      return '<td class="locked' + (isNum ? ' num' : '') +
        (isEditedField(r, f) ? ' edited-cell' : '') + '">' +
        (isNum ? plainMoney(v) : (esc(v) || '-')) + '</td>';
    }

    var ICON_EDIT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="M13 6l4 4"/></svg>';
    var ICON_DONE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>';
    function rowHtml(r, i, n) {
      var src = r.sourceSection || 'USER';
      var editing = App.ccrisEditIdx === i;

      var editable = src === 'USER' ? (!r.confirmed || editing) : editing;
      var h = '<tr data-i="' + i + '" class="src-' + src + (n === '' ? ' sub-line' : '') + '">' +
        '<td class="num">' + n + '</td>';
      if (editable) {
        h += '<td class="editable"><input class="editable' + editCls(r, 'date') + '" data-f="date" type="date" value="' + esc(r.date) + '" style="min-width:86px"></td>' +
          '<td class="editable">' + selectHtml(CAPACITIES, r.capacity, editCls(r, 'capacity').trim())
            .replace('<select', '<select data-f="capacity"') + '</td>' +
          '<td class="editable">' + selectHtml(COLLATERALS, r.collateral, editCls(r, 'collateral').trim())
            .replace('<select', '<select data-f="collateral"') + '</td>' +
          '<td class="editable">' + App.facilityDropdownHtml(r.facility, editCls(r, 'facility').trim()) + '</td>' +
          '<td class="editable"><input class="editable' + editCls(r, 'outstanding') + '" data-f="outstanding" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.outstanding) + '"></td>' +
          '<td class="editable"><input class="editable' + editCls(r, 'limit') + '" data-f="limit" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.limit) + '"></td>' +
          '<td class="editable"><input class="editable' + editCls(r, 'legalStatus') + '" data-f="legalStatus" value="' + esc(r.legalStatus) + '" style="min-width:60px"></td>' +
          '<td class="editable"><input class="editable' + editCls(r, 'commitmentPerCCRIS') + '" data-f="commitmentPerCCRIS" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.commitmentPerCCRIS) + '"></td>';
      } else {
        h += lockedCell(r, 'date') + lockedCell(r, 'capacity') + lockedCell(r, 'collateral') +
          lockedCell(r, 'facility') + lockedCell(r, 'outstanding', true) +
          lockedCell(r, 'limit', true) + lockedCell(r, 'legalStatus') +
          lockedCell(r, 'commitmentPerCCRIS', true);
      }
      h += '<td class="override"><input class="' + (E.hasOverride(r.override) ? 'has-value' : '') + editCls(r, 'override') +
        '" data-f="override" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.override) + '"></td>' +
        '<td class="readonly" id="ccris-commit-' + i + '">-</td>' +
        '<td class="editable">' + selectHtml(['NO', 'YES'], r.floating, editCls(r, 'floating').trim())
          .replace('<select', '<select data-f="floating"') + '</td>' +
        '<td class="readonly" id="ccris-stress-' + i + '">-</td>' +
        '<td class="src-cell">' + esc(src) + '</td>' +
        '<td class="row-actions">' +
        (src === 'USER'
          ? (editable
            ? '<button class="row-edit done" data-editdone="' + i + '" title="Done - lock this row">' + ICON_DONE + '</button>'
            : '<button class="row-edit" data-edit="' + i + '" title="Edit this row">' + ICON_EDIT + '</button>') +
            '<button class="row-del" data-del="' + i + '" title="Delete row">&times;</button>'
          : (editing
            ? '<button class="row-edit done" data-editdone="' + i + '" title="Done - lock this row">' + ICON_DONE + '</button>'
            : '<button class="row-edit' + (r.edited ? ' is-edited' : '') + '" data-edit="' + i +
              '" title="' + (r.edited ? 'Edited - click to edit again' : 'Edit this extracted row') + '">' + ICON_EDIT + '</button>')) +
        '</td></tr>';
      return h;
    }
    var GROUPS = [
      ['CCRIS', 'CCRIS Records (Experian report)'],
      ['NLCI', 'NLCI - Non-Bank Lenders'],
      ['USER', 'Manually Added / Other Commitments']
    ];

    function isSubLine(r, prev) {
      if (!prev) return false;
      if ((r.sourceSection || 'USER') !== (prev.sourceSection || 'USER')) return false;
      if (!r.date || r.date !== prev.date) return false;
      return String(r.no) === String(prev.no);
    }
    var rowsHtml = '';
    var itemNo = 0;
    GROUPS.forEach(function (g) {
      var idxs = [];
      s.ccris.forEach(function (r, i) {
        if ((r.sourceSection || 'USER') === g[0]) idxs.push(i);
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

      var linked = App.btLinkResolve(s.ccris, r) >= 0;
      var amtDis = (linked || r.type !== 'BT') ? ' disabled' : '';
      return '<tr data-bti="' + i + '">' +
        '<td class="editable">' + selectHtml(['BT', 'SETTLE'], r.type).replace('<select', '<select data-btf="type"')
          .replace('>BT<', '>CC Balance Transfer<').replace('>SETTLE<', '>Facility Settlement<') + '</td>' +
        '<td class="editable">' + App.btLinkSelectHtml(s.ccris, s.bt, i) +
        '<input data-btf="outstanding" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.outstanding) + '"' + amtDis + '></td>' +
        (r.type === 'BT' || linked
          ? '<td class="readonly" id="bt-rep-' + i + '">-</td>'
          : '<td class="editable"><input data-btf="repayment" type="text" inputmode="decimal" data-fmt="money" value="' + esc(r.repayment) + '"></td>') +
        '<td><button class="row-del" data-btdel="' + i + '">&times;</button></td></tr>';
    }).join('');

    var body =
      '<div class="dropzone" id="dz-experian">' +
      '<div class="dz-title">Experian / CCRIS report</div>' +
      '<div class="dz-sub">' + (pdfOk
        ? 'Drop or click &middot; Experian CrediTrack or bank CCRIS PDF'
        : 'PDF library missing - key the CCRIS rows in manually below.') +
      '</div><input type="file" id="file-experian" accept=".pdf" style="display:none"></div>' +
      '<div id="dz-experian-msg"></div>' +

      '<div class="subhead">CCRIS Records (existing debts)</div>' +
      '<div class="tbl-wrap ccris-wrap"><table class="tbl ccris-tbl">' +
      '<colgroup><col class="c-no"><col class="c-date"><col class="c-cap"><col class="c-coll">' +
      '<col class="c-fac"><col class="c-money"><col class="c-money"><col class="c-legal">' +
      '<col class="c-money"><col class="c-money"><col class="c-money"><col class="c-float">' +
      '<col class="c-money"><col class="c-src"><col class="c-del"></colgroup>' +
      '<thead><tr>' +
      '<th>No</th><th>Date</th><th>Capacity</th><th>Collateral</th><th>Facility</th>' +
      '<th class="num">Outstanding</th><th class="num">Limit</th><th>Legal Status</th>' +
      '<th class="num">Instalment per<br>CCRIS</th><th class="num">Override</th>' +
      '<th class="num">Commitment</th><th>Floating Rate</th>' +
      '<th class="num">Stress Test<br>Commitment</th><th>Source</th><th></th></tr></thead>' +
      '<tbody id="ccris-tbody">' + rowsHtml + '</tbody>' +
      '<tfoot><tr class="total-row"><td colspan="10">Total CCRIS Commitment</td>' +
      '<td class="num" id="ccris-total">-</td><td></td>' +
      '<td class="num" id="ccris-stress-total">-</td><td colspan="2"></td></tr></tfoot></table></div>' +
      '<div style="margin-top:8px"><button class="btn small secondary" id="btn-add-ccris" type="button">+ Add CCRIS / other commitment row</button></div>' +

      '<div class="subhead" style="margin-top:26px">Balance Transfer / Facilities To Be Settled</div>' +
      ((s.bt || []).length
        ? '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
          '<th>Type</th><th class="num">Outstanding</th><th class="num">Monthly Repayment</th><th></th>' +
          '</tr></thead><tbody id="bt-tbody">' + btRows + '</tbody>' +
          '<tfoot><tr class="total-row"><td colspan="2">Total To Be Settled</td>' +
          '<td class="num" id="bt-total">-</td><td></td></tr>' +
          '<tr class="total-row"><td colspan="2">Grand Total Commitment After Settlement</td>' +
          '<td class="num" id="grand-total">-</td><td></td></tr></tfoot></table></div>'
        : '') +
      '<div style="margin-top:8px"><button class="btn small secondary" id="btn-add-bt" type="button">+ Add settlement row</button></div>';

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

    bindDropzone('dz-experian', 'file-experian', handleExperianFiles, false);

    el('btn-add-ccris').onclick = function () {
      App.state.ccris.push(newCCRISRow()); App.renderCCRIS(); App.refreshOutputs();
    };
    el('btn-add-bt').onclick = function () {
      App.state.bt.push({ type: 'BT', outstanding: '', repayment: '', link: null });
      App.renderCCRIS(); App.refreshOutputs();
    };

    function mainBtLinkOf(ccrisIdx) {
      return App.btLinkOfList(App.state.ccris, App.state.bt, ccrisIdx);
    }
    el('ccris-tbody').addEventListener('input', function (ev) {
      var tr = ev.target.closest('tr'); if (!tr) return;
      var i = +tr.dataset.i, f = ev.target.dataset.f;
      if (f == null) return;
      var src = App.state.ccris[i].sourceSection || 'USER';
      var editing = App.ccrisEditIdx === i;

      if (src !== 'USER' && !editing && f !== 'override' && f !== 'floating') return;
      var v = ev.target.value;
      if (f === 'facility') v = v.toUpperCase();
      var previousValue = App.state.ccris[i][f];
      App.state.ccris[i][f] = v;
      if (f === 'override') {
        ev.target.classList.toggle('has-value', E.hasOverride(v));
      }

      var cardRow = App.state.ccris[i];
      if (src === 'USER' && (f === 'facility' || f === 'outstanding') &&
          String(cardRow.facility || '').toUpperCase().trim() === 'CRDTCARD') {
        var previousAuto = App.cardOverrideFor(previousValue);
        if (!E.hasOverride(cardRow.override) || cardRow.override === previousAuto) {
          var cardValue = App.cardOverrideFor(cardRow.outstanding);
          cardRow.override = cardValue;
          var cardInput = tr.querySelector('input[data-f="override"]');
          if (cardInput && document.activeElement !== cardInput) {
            cardInput.value = cardValue;
            cardInput.classList.toggle('has-value', E.hasOverride(cardValue));
          }
        }
      }

      if ((f === 'facility' || f === 'date') && mainBtLinkOf(i) != null) {
        App.btDetach(App.state.ccris, App.state.bt[mainBtLinkOf(i)]);
        App.renderCCRIS();
      }
      App.refreshOutputs();
    });
    el('ccris-tbody').addEventListener('click', function (ev) {
      var editBtn = ev.target.closest ? ev.target.closest('[data-edit]') : null;
      if (editBtn) {
        var ei = +editBtn.dataset.edit;
        App.ccrisEditIdx = ei;
        App.ccrisEditSnapshot = JSON.stringify(App.state.ccris[ei]);

        var erow = App.state.ccris[ei];
        if (erow && !erow.orig) {
          erow.orig = {};
          ['date', 'capacity', 'collateral', 'facility', 'outstanding', 'limit',
            'legalStatus', 'commitmentPerCCRIS', 'override', 'floating'].forEach(function (f) {
            erow.orig[f] = erow[f];
          });
        }
        App.renderCCRIS(); App.refreshOutputs();
        return;
      }
      var doneBtn = ev.target.closest ? ev.target.closest('[data-editdone]') : null;
      if (doneBtn) {
        var di2 = +doneBtn.dataset.editdone;
        var row = App.state.ccris[di2];
        if (row && row.orig) {
          var numeric = { outstanding: 1, limit: 1, commitmentPerCCRIS: 1 };
          var ef = {};
          Object.keys(row.orig).forEach(function (f) {
            var a = numeric[f] ? num(row[f]).toFixed(2) : String(row[f] == null ? '' : row[f]).trim();
            var b = numeric[f] ? num(row.orig[f]).toFixed(2) : String(row.orig[f] == null ? '' : row.orig[f]).trim();
            if (a !== b) ef[f] = true;
          });
          row.editedFields = ef;
          row.edited = Object.keys(ef).length > 0;
        } else if (row && App.ccrisEditSnapshot != null &&
            JSON.stringify(row) !== App.ccrisEditSnapshot) {
          row.edited = true;
        }
        if (row && (row.sourceSection || 'USER') === 'USER') {
          row.confirmed = true;
        }
        App.ccrisEditIdx = null;
        App.ccrisEditSnapshot = null;
        App.renderCCRIS(); App.refreshOutputs();
        return;
      }
      var del = ev.target.closest ? ev.target.closest('[data-del]') : null;
      if (del) {
        var di = +del.dataset.del;
        App.fixBtLinksOnDelete(App.state.bt, di);
        App.state.ccris.splice(di, 1);
        App.renderCCRIS(); App.refreshOutputs();
      }
    });

    var btBody = el('bt-tbody');
    if (btBody) btBody.addEventListener('input', function (ev) {
      var tr = ev.target.closest('tr'); if (!tr) return;
      var i = +tr.dataset.bti, f = ev.target.dataset.btf;
      if (f == null || f === 'link') return;
      App.state.bt[i][f] = ev.target.value;
      if (f === 'type') {
        var b = App.state.bt[i];

        if (b.link) {
          var lrow = App.state.ccris[App.btLinkResolve(App.state.ccris, b)];
          var isCard = lrow && String(lrow.facility || '').toUpperCase().trim() === 'CRDTCARD';
          if (lrow && (b.type === 'BT') !== isCard) App.btDetach(App.state.ccris, b);
        }

        if (b.type !== 'BT' && b.link &&
            (b.repayment == null || String(b.repayment).trim() === '')) {
          var li = App.btLinkResolve(App.state.ccris, b);
          if (li >= 0) {
            b.repayment = String(Math.round(E.lineCommitment(
              App.state.ccris[li], App.state.customer.cardType).commitment * 100) / 100);
          }
        }
        App.renderCCRIS();
      }
      App.refreshOutputs();
    });
    if (btBody) btBody.addEventListener('change', function (ev) {
      var tr = ev.target.closest('tr'); if (!tr) return;
      if (ev.target.dataset.btf !== 'link') return;
      App.applyBtLink(App.state.ccris, App.state.bt, +tr.dataset.bti,
        ev.target.value, App.state.customer.cardType);
      App.renderCCRIS(); App.refreshOutputs();
    });
    if (btBody) btBody.addEventListener('click', function (ev) {
      if (ev.target.dataset.btdel != null) {
        var bi = +ev.target.dataset.btdel;
        App.btDetach(App.state.ccris, App.state.bt[bi]);
        App.state.bt.splice(bi, 1);
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
  App.bindDropzone = bindDropzone;
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

      /* Once an application form is loaded it is the identity reference. */
      var appFormMismatch = App.customerDetailsV2
        ? App.customerDetailsV2.validateExperian(res) : '';
      if (appFormMismatch) {
        App.modal.alert(
          'The application form on file belongs to a different person:\n\n' +
          appFormMismatch + '\n\nNothing was loaded. Upload the Experian report for ' +
          'the applicant named on the form, or clear the form first.',
          { type: 'error', title: 'Experian report rejected' });
        dzState('dz-experian', 'error', 'Report rejected - identity does not match the ' +
          'application form: ' + esc(appFormMismatch.replace(/\n/g, ' | ')) +
          '. Nothing was loaded; existing rows are unchanged.');
        return;
      }

      var preMismatch = loadedIncomeMismatch(s, res.name, res.icNumber);
      if (preMismatch) {
        App.modal.alert(
          'The income documents already attached belong to a different person:\n\n' +
          preMismatch + '\n\nNothing was loaded. Clear the income (Reset inputs) or ' +
          'attach the report matching those documents.',
          { type: 'error', title: 'Experian report rejected' });
        dzState('dz-experian', 'error', 'Report rejected - it does not match the income ' +
          'documents already attached: ' + esc(preMismatch.replace(/\n/g, ' | ')) +
          '. Nothing was loaded; existing rows and income are unchanged.');
        return;
      }

      var found = res.records.length + res.nlciRecords.length;

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

      if (res.name || res.icNumber) s.customer.fromExperian = true;
      s.ccris = res.records.concat(res.nlciRecords);
      App.fillCardOverrides(s.ccris);

      App.relinkBtList(s.ccris, s.bt);
      App.renderAll();
      dzState('dz-experian', 'success',
        'Extracted ' + res.records.length + ' CCRIS + ' + res.nlciRecords.length +
        ' NLCI records' + (res.iScore != null ? ', iScore ' + res.iScore
          : ' - this report has no iScore, key it in above'));
    } catch (e) {
      dzState('dz-experian', 'error', 'Extraction failed: ' + esc(e.message) +
        ' - you can still key in the CCRIS rows manually below.');
      console.error(e);
    }
  }

  var MONTH_COLS = [
    ['basic', 'Basic Income'], ['fixedAllowance', 'Fixed Allowance'],
    ['fixedAllowanceDesc', 'Allowance Desc'], ['other', 'Other Income'],
    ['commission', 'Commission'], ['ot', 'OT'],
    ['epf', 'EPF'], ['pcb', 'PCB / Zakat'], ['socso', 'SOCSO + EIS'],
    ['otherDeduction', 'Other Deductions']
  ];

  /* ---------------- income ---------------- */
  App.renderIncome = function () {
    var s = App.state;
    var isBiz = s.customer.type === 'BIZMAN';
    var isHF = String(App.mode || '').indexOf('hf') !== -1;
    var body = '';

    body += '<div class="dropzone" id="dz-income">' +
      '<div class="dz-title">Income documents</div>' +
      '<div class="dz-sub">Drop or click &middot; payslip or EPF statement</div>' +
      '<input type="file" id="file-income" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" multiple style="display:none"></div>' +
      '<div id="dz-income-msg"></div><div id="income-files" style="font-size:12px;color:var(--muted);margin-bottom:10px"></div>';

    if (isHF) {
      body += '<div class="field narrow" style="margin-bottom:10px"><label>Customer Type (Main)</label>' +
        '<select class="editable" id="income-maintype">' +
        '<option value="NORMAL"' + (s.customer.type === 'NORMAL' ? ' selected' : '') + '>NORMAL</option>' +
        '<option value="BIZMAN"' + (s.customer.type === 'BIZMAN' ? ' selected' : '') + '>BIZMAN</option></select></div>';
    }

    if (isBiz) {
      body += renderBizmanForm();
    } else {

      var docMode = s.income.source === 'DOC' && s.income.sourceMode === s.income.normalMode;
      var locked = docMode && !App.incomeEditMode;
      if (docMode) {
        body += '<div class="income-toolbar">' +
          '<span class="income-src-note">Imported from ' +
          (s.income.normalMode === 'EPF' ? 'EPF statement' : 'payslip') +
          (locked ? ' - locked' : ' - editing') + '</span>' +
          '<button class="btn small secondary" id="income-edit" type="button">' +
          (locked ? 'Edit income' : 'Done editing') + '</button></div>';
      }
      body += '<div class="tabs" id="income-tabs">' +
        '<button data-tab="MANUAL" class="' + (s.income.normalMode === 'MANUAL' ? 'active' : '') + '">Salary / Payslip (6 months)</button>' +
        '<button data-tab="EPF" class="' + (s.income.normalMode === 'EPF' ? 'active' : '') + '">EPF Statement</button></div>';
      body += s.income.normalMode === 'EPF' ? renderEPFForm(locked) : renderManualForm(locked);
    }

    body += '<div class="subhead">Recognised Income</div><div class="tile-grid" id="income-tiles"></div>';

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

  var INCOME_MONEY_FIELDS = {
    basic: 1, fixedAllowance: 1, other: 1, commission: 1, ot: 1,
    epf: 1, pcb: 1, socso: 1, otherDeduction: 1
  };
  function incomeCellChanged(m, f) {
    if (!m || !m.orig) return false;
    if (INCOME_MONEY_FIELDS[f]) {
      return num(m[f]).toFixed(2) !== num(m.orig[f]).toFixed(2);
    }
    return String(m[f] == null ? '' : m[f]) !== String(m.orig[f] == null ? '' : m.orig[f]);
  }

  function copyDatalistOptionsHtml(rowList, rowIndex, fieldName, kind) {
    var alreadyShown = {};
    var optionsHtml = '';

    for (var earlierIndex = 0; earlierIndex < rowIndex; earlierIndex++) {
      var earlierRow = rowList[earlierIndex] || {};
      var rawValue = earlierRow[fieldName] == null ? '' : earlierRow[fieldName];
      if (String(rawValue).trim() === '') {
        continue;
      }

      var shownValue = (kind === 'epf' || INCOME_MONEY_FIELDS[fieldName])
        ? App.fmtInput(rawValue, 'money')
        : String(rawValue);

      if (alreadyShown[shownValue]) {
        continue;
      }
      alreadyShown[shownValue] = true;
      optionsHtml += '<option value="' + esc(shownValue) + '"></option>';
    }

    return optionsHtml;
  }

  function refreshCopyListsIn(tbodySelector, rowList, kind, rowAttr, fieldAttr) {
    var tableBody = document.querySelector(tbodySelector);
    if (!tableBody) {
      return;
    }

    var rowAttribute = rowAttr || (kind === 'epf' ? 'data-ei' : 'data-mi');
    var fieldAttribute = fieldAttr || (kind === 'epf' ? 'data-ef' : 'data-mf');

    tableBody.querySelectorAll('tr[' + rowAttribute + ']').forEach(function (row) {
      var rowIndex = parseInt(row.getAttribute(rowAttribute), 10);

      row.querySelectorAll('input[' + fieldAttribute + ']').forEach(function (input) {
        var listId = input.getAttribute('data-copy-list');
        if (!listId) {
          return;
        }

        var datalist = document.getElementById(listId);
        if (!datalist) {
          return;
        }

        var fieldName = input.getAttribute(fieldAttribute);
        if (kind === 'epf' && fieldName !== 'employee') {
          return;
        }

        datalist.innerHTML = copyDatalistOptionsHtml(rowList, rowIndex, fieldName, kind);
      });
    });
  }

  App.copyDatalistOptionsHtml = copyDatalistOptionsHtml;
  App.refreshCopyListsIn = refreshCopyListsIn;

  /* ---------------- EPF month sequence ---------------- */
  var EPF_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function parseEpfMonthLabel(label) {
    var text = String(label == null ? '' : label).trim();
    if (!text) return null;

    var named = text.match(/^([A-Za-z]{3,9})[\s\-/.]*(\d{2,4})$/);
    if (named) {
      var month = EPF_MONTH_NAMES.indexOf(
        named[1].slice(0, 3).charAt(0).toUpperCase() +
        named[1].slice(1, 3).toLowerCase());
      if (month < 0) return null;
      var year = parseInt(named[2], 10);
      if (year < 100) year += 2000;
      return { month: month, year: year };
    }

    var numeric = text.match(/^(\d{1,2})[\s\-/.]*(\d{2,4})$/);
    if (numeric) {
      var n = parseInt(numeric[1], 10);
      if (n < 1 || n > 12) return null;
      var y = parseInt(numeric[2], 10);
      if (y < 100) y += 2000;
      return { month: n - 1, year: y };
    }
    return null;
  }

  function autofillEpfLabels(months, startIndex, tbodySelector, rowAttr, fieldAttr) {
    if (!months || startIndex == null || startIndex < 0) return;
    while (months.length < 12) months.push({ label: '', employee: '' });
    var start = parseEpfMonthLabel(months[startIndex].label);
    months[startIndex].labelAuto = false;
    if (!start) return;

    for (var i = startIndex + 1; i < 12; i++) {
      if (months[i].labelAuto) {
        months[i].label = '';
        months[i].labelAuto = false;
      }
    }

    var cursor = start.month;
    for (var r = startIndex + 1; r < 12; r++) {
      if (String(months[r].label || '').trim() !== '') break;
      cursor++;
      if (cursor > 11) break;
      months[r].label = EPF_MONTH_NAMES[cursor] + '-' +
        String(start.year).slice(-2);
      months[r].labelAuto = true;
    }

    var tbody = document.querySelector(tbodySelector);
    if (!tbody) return;
    for (var u = startIndex + 1; u < 12; u++) {
      var row = tbody.querySelector('tr[' + rowAttr + '="' + u + '"]');
      var input = row && row.querySelector('input[' + fieldAttr + '="label"]');
      if (input) input.value = months[u].label || '';
    }
  }
  App.autofillEpfLabels = autofillEpfLabels;

  function renderManualForm(locked) {
    var months = App.state.income.manualMonths;
    var head = '<tr><th>Month</th>' + MONTH_COLS.map(function (c) {
      return '<th>' + c[1] + '</th>'; }).join('') + '</tr>';
    var rows = months.map(function (m, i) {

      var rowLocked = locked && !!m.orig;
      var rowDisabled = rowLocked ? ' disabled' : '';

      return '<tr data-mi="' + i + '"><td class="num">' +
        esc(m.monthLabel || ('M' + (i + 1))) + '</td>' +
        MONTH_COLS.map(function (c) {
          var isText = c[0] === 'fixedAllowanceDesc';

          var cls = 'editable' + (incomeCellChanged(m, c[0]) ? ' edited' : '');
          var listId = 'income-copy-manual-' + i + '-' + c[0];
          var listHtml = isText ? '' :
            '<datalist id="' + listId + '">' +
            copyDatalistOptionsHtml(months, i, c[0], 'manual') + '</datalist>';
          var inputHtml = '<input class="' + cls + '" data-mf="' + c[0] + '"' +
            (isText ? '' : ' data-copy-list="' + listId + '"') +
            (isText ? '' : ' type="text" inputmode="decimal" data-fmt="money"') +
            ' autocomplete="off"' + rowDisabled +
            (rowLocked ? ' title="Imported value - click Edit income to change"' : '') +
            ' value="' + esc(m[c[0]]) + '">';
          if (!isText) {
            inputHtml = '<div class="income-dd">' + inputHtml +
              '<button type="button" class="income-dd-toggle" data-dd-income' +
              ' aria-haspopup="listbox" aria-label="Previous amounts"' + rowDisabled +
              '><span class="dd-arrow"></span></button></div>';
          }

          return '<td class="editable">' + inputHtml + listHtml + '</td>';
        }).join('') + '</tr>';
    }).join('');
    return '<div class="tbl-wrap"><table class="tbl"><thead>' + head + '</thead>' +
      '<tbody id="income-manual-tbody">' + rows + '</tbody></table></div>';
  }

  function renderEPFForm(locked) {
    var epf = App.state.income.epf;
    var rows = '';
    for (var i = 0; i < 12; i++) {
      var m = epf.months[i] || { label: '', employee: '' };

      var rowLocked = locked && !!m.orig;
      var rowDisabled = rowLocked ? ' disabled' : '';
      var cls = 'editable' + (incomeCellChanged(m, 'label') || incomeCellChanged(m, 'employee') ? ' edited' : '');
      var listId = 'income-copy-epf-' + i;
      var listHtml = '<datalist id="' + listId + '">' +
        copyDatalistOptionsHtml(epf.months, i, 'employee', 'epf') + '</datalist>';
      var employeeHtml = '<div class="income-dd"><input class="' + cls + '" data-ef="employee"' +
        ' data-copy-list="' + listId + '" type="text" inputmode="decimal" data-fmt="money"' +
        ' autocomplete="off"' + rowDisabled + ' value="' + esc(m.employee) + '">' +
        '<button type="button" class="income-dd-toggle" data-dd-income' +
        ' aria-haspopup="listbox" aria-label="Previous amounts"' + rowDisabled +
        '><span class="dd-arrow"></span></button></div>';

      rows += '<tr data-ei="' + i + '"><td class="num">' + (i + 1) + '</td>' +
        '<td class="editable"><input class="' + cls + '" data-ef="label"' + rowDisabled +
        (rowLocked ? ' title="Imported value - click Edit income to change"' : '') +
        ' value="' + esc(m.label) + '" placeholder="e.g. Jan-25"></td>' +
        '<td class="editable">' + employeeHtml + listHtml + '</td>' +
        '<td class="readonly" id="epf-mi-' + i + '">-</td></tr>';
    }
    var d = epf.deductions;

    var rate = num(epf.epfRatePct) || 11;
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Month</th><th>Caruman Ahli</th><th>Implied Monthly Income (@' + esc(rate) + '%)</th></tr></thead>' +
      '<tbody id="epf-tbody">' + rows + '</tbody></table></div>' +
      '<div class="subhead">Deductions</div>' +
      '<div class="grid c4">' +
      '<div class="field"><label>EPF</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-edf="epf" value="' + esc(d.epf) + '"></div>' +
      '<div class="field"><label>PCB / Zakat</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-edf="pcb" value="' + esc(d.pcb) + '"></div>' +
      '<div class="field"><label>SOCSO</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-edf="socso" value="' + esc(d.socso) + '"></div>' +
      '<div class="field"><label>Other deductions</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" data-edf="other" value="' + esc(d.other) + '"></div></div>';
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
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th><th>Bank I Total Credit</th><th>Bank II Total Credit</th><th>Total</th></tr></thead>' +
      '<tbody id="biz-tbody">' + rows + '</tbody></table></div>' +
      '<div class="grid c4" style="margin-top:10px">' +
      '<div class="field"><label>Profit Margin (%)</label><input class="editable" type="text" inputmode="decimal" data-fmt="pct" id="biz-pm" value="' + esc(b.profitMarginPct) + '" min="0" max="100" step="0.01"></div>' +
      '<div class="field"><label>Shareholding (%)</label><input class="editable" type="text" inputmode="decimal" data-fmt="pct" id="biz-sh" value="' + esc(b.shareholdingPct) + '" min="0" max="100"></div>' +
      '<div class="field"><label>Avg Latest 2 Years ITR (annual)</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" id="biz-itr" value="' + esc(b.avgITRAnnual) + '"></div>' +
      '<div class="field"><label>Tax Deduction LHDN (monthly)</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" id="biz-tax" value="' + esc(b.taxDeduction) + '"></div>' +
      '<div class="field"><label>SOCSO (monthly)</label><input class="editable" type="text" inputmode="decimal" data-fmt="money" id="biz-socso" value="' + esc(b.socso) + '"></div></div>';
  }

  function bindIncomeInputs() {
    var s = App.state;
    var tabs = el('income-tabs');
    if (tabs) tabs.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      s.income.normalMode = b.dataset.tab;
      App.incomeEditMode = false;
      App.renderIncome(); App.refreshOutputs();
    });

    var editBtn = el('income-edit');
    if (editBtn) editBtn.onclick = function () {
      App.incomeEditMode = !App.incomeEditMode;
      App.renderIncome(); App.refreshOutputs();
    };

    var mt = el('income-manual-tbody');
    if (mt) mt.addEventListener('input', function (ev) {
      if (ev.target.dataset.mf == null) return;
      var tr = ev.target.closest('tr'); if (!tr) return;
      var i = +tr.dataset.mi;
      s.income.manualMonths[i][ev.target.dataset.mf] = ev.target.value;

      if (s.income.source === 'DOC' && s.income.sourceMode === 'MANUAL' && App.incomeEditMode) {
        s.income.manualMonths[i].edited = true;
      }

      refreshCopyListsIn('#income-manual-tbody', s.income.manualMonths, 'manual');
      App.refreshOutputs();
    });
    if (mt) mt.addEventListener('change', function (ev) {
      if (ev.target.dataset.mf == null) return;
      refreshCopyListsIn('#income-manual-tbody', s.income.manualMonths, 'manual');
    });

    var et = el('epf-tbody');
    if (et) et.addEventListener('input', function (ev) {
      if (ev.target.dataset.ef == null) return;
      var tr = ev.target.closest('tr'); if (!tr) return;
      var i = +tr.dataset.ei;
      while (s.income.epf.months.length <= i) s.income.epf.months.push({ label: '', employee: '' });
      s.income.epf.months[i][ev.target.dataset.ef] = ev.target.value;
      if (ev.target.dataset.ef === 'label') s.income.epf.months[i].labelAuto = false;
      if (s.income.source === 'DOC' && s.income.sourceMode === 'EPF' && App.incomeEditMode) {
        s.income.epf.months[i].edited = true;

        var parsed = s.income.epf.parsedMonths || (s.income.epf.parsedMonths = []);
        var mm = s.income.epf.months[i];
        if (!parsed[i]) parsed[i] = { label: mm.label, monthIndex: null, year: null, employee: mm.employee };
        parsed[i].label = mm.label;
        parsed[i].employee = mm.employee;
      }

      refreshCopyListsIn('#epf-tbody', s.income.epf.months, 'epf');
      App.refreshOutputs();
    });
    if (et) et.addEventListener('change', function (ev) {
      if (ev.target.dataset.ef == null) return;
      if (ev.target.dataset.ef === 'label') {
        var ltr = ev.target.closest('tr');
        if (ltr) autofillEpfLabels(s.income.epf.months, +ltr.dataset.ei,
          '#epf-tbody', 'data-ei', 'data-ef');
      }
      refreshCopyListsIn('#epf-tbody', s.income.epf.months, 'epf');
    });
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

    var pdfFiles = files.filter(function (f) { return /\.pdf$/i.test(f.name); });
    var epfFiles = [];
    for (var fi = 0; fi < pdfFiles.length; fi++) {
      var candidate = pdfFiles[fi];
      var looksEPF = /epf|kwsp/i.test(candidate.name);

      if (!looksEPF && E.pdfAvailable()) {
        try {
          looksEPF = E.isEPFStatementRows(await E.extractTextRows(candidate));
        } catch (ignore) {  }
      }
      if (looksEPF) epfFiles.push(candidate);
    }
    if (!epfFiles.length) {

      var payslipFiles = pdfFiles;
      var imageFiles = files.filter(function (f) { return /\.(jpe?g|png)$/i.test(f.name); });
      if (payslipFiles.length && E.pdfAvailable()) {
        await handlePayslipFiles(payslipFiles, imageFiles.length);
        return;
      }
      var imgNote = imageFiles.length
        ? ' Image/photo OCR is not available in this double-click offline build (' + imageFiles.length + ' file(s)); key those figures in manually.'
        : '';
      dzState('dz-income', 'success', 'Document(s) attached: ' + names + '.' + imgNote +
        ' (Text-based PDF payslips and EPF/KWSP statements are parsed locally; other formats are manual.)');
      return;
    }
    dzState('dz-income', 'loading', 'Parsing ' + epfFiles.length + ' EPF statement(s) ...');
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

      var mismatch = identityMismatch(epfName, epfIC, s.customer.name, s.customer.ic);
      if (!mismatch && (s.income.epf.holderName || s.income.epf.holderIC)) {
        mismatch = identityMismatch(epfName, epfIC,
          s.income.epf.holderName, s.income.epf.holderIC);
      }
      if (mismatch) {
        App.modal.alert(
          mismatch + '\n\nNothing was loaded. Attach the EPF/KWSP statement belonging to this customer.',
          { type: 'error', title: 'EPF statement rejected' });
        dzState('dz-income', 'error', 'EPF statement rejected - identity does not match the ' +
          'customer / statement already attached: ' + esc(mismatch.replace(/\n/g, '; ')) +
          '. Nothing was loaded' + (s.income.epf.months.length
            ? ' and the ' + s.income.epf.months.length + ' month(s) already attached are unchanged.'
            : '.'));
        return;
      }

      rememberEpfHolder(s.income.epf, results);

      var prior = s.income.epf.parsedMonths || [];
      var months = E.mergeEPFMonths([{ months: prior }].concat(results));
      if (!months.length) throw new Error('No contribution rows recognised in the PDF(s).');
      var added = months.length - prior.length;

      s.income.normalMode = 'EPF';

      s.income.source = 'DOC';
      s.income.sourceMode = 'EPF';
      s.income.epf.editedDeductions = {};
      App.incomeEditMode = false;
      s.income.epf.parsedMonths = months;
      s.income.epf.months = months.map(function (m) {
        return {
          label: m.label, employee: m.employee, edited: false,

          orig: {
            label: m.label == null ? '' : m.label,
            employee: m.employee == null ? '' : m.employee
          }
        };
      });

      while (s.income.epf.months.length < 12) {
        s.income.epf.months.push({ label: '', employee: '', edited: false });
      }
      App.renderIncome();
      App.refreshOutputs();
      var otherPDFs = pdfFiles.filter(function (f) { return epfFiles.indexOf(f) === -1; });
      dzState('dz-income', 'success',
        'EPF statement' + (epfFiles.length > 1 ? 's' : '') +
        ' parsed (' + epfFiles.length + ' file' + (epfFiles.length > 1 ? 's' : '') + '): ' +
        months.length + ' months loaded (' + months[0].label + ' to ' +
        months[months.length - 1].label + ')' +
        (prior.length ? ' - ' + (added > 0 ? added + ' new month' + (added === 1 ? '' : 's') +
          ' merged with the ' + prior.length + ' already attached'
          : 'already-attached months refreshed') + '. Attach another year to extend the timeline.'
          : '. Attach another year to extend the timeline.') +
        ' Switched to EPF Statement mode - review the figures below.' +
        (otherPDFs.length ? ' Other PDF(s) were not processed in this batch; upload payslips separately.' : ''));
    } catch (e) {
      dzState('dz-income', 'error', 'EPF parsing failed: ' + esc(e.message) + ' - enter the months manually.');
      console.error(e);
    }
  }

  async function handlePayslipFiles(payslipFiles, imageCount) {
    dzState('dz-income', 'loading', 'Reading ' + payslipFiles.length + ' payslip(s) ...');
    try {
      var parsed = [];
      for (var i = 0; i < payslipFiles.length; i++) {
        parsed.push({ name: payslipFiles[i].name, data: await E.extractPayslip(payslipFiles[i]) });
      }

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
          'they may be scanned or use an unsupported layout. This double-click offline build does not OCR scans; key the months in manually.');
        return;
      }

      var identityErrors = [];
      var prevHolder = App.state.income.payslipHolder;
      recognised.forEach(function (p) {
        var mismatch = identityMismatch(p.data.employeeName, p.data.ic,
          App.state.customer.name, App.state.customer.ic);
        if (!mismatch && prevHolder && (prevHolder.name || prevHolder.ic)) {
          mismatch = identityMismatch(p.data.employeeName, p.data.ic,
            prevHolder.name, prevHolder.ic);
        }
        if (mismatch) identityErrors.push(p.name + ': ' + mismatch.replace(/\n/g, '; '));
      });
      if (identityErrors.length) {
        App.modal.alert(identityErrors.join('\n') +
          '\n\nNothing was loaded. Attach payslips belonging to this applicant.',
          { type: 'error', title: 'Payslip rejected' });
        dzState('dz-income', 'error', 'Payslip rejected - identity mismatch: ' +
          esc(identityErrors.join(' | ')) + '. Nothing was loaded.');
        return;
      }

      var ph = App.state.income.payslipHolder ||
        (App.state.income.payslipHolder = { name: '', ic: '' });
      recognised.forEach(function (p) {
        if (!ph.name && p.data.employeeName) ph.name = p.data.employeeName;
        if (!ph.ic && p.data.ic) ph.ic = p.data.ic;
      });

      var use = recognised.slice(-6);
      App.state.income.normalMode = 'MANUAL';

      App.state.income.source = 'DOC';
      App.state.income.sourceMode = 'MANUAL';
      App.incomeEditMode = false;
      var months = App.state.income.manualMonths;
      while (months.length < 6) months.push({ monthLabel: '', basic: '', fixedAllowance: '', fixedAllowanceDesc: '',
        other: '', commission: '', ot: '', epf: '', pcb: '', socso: '', otherDeduction: '', edited: false });
      function strVal(v) { return v ? String(v) : ''; }
      var imported = [];
      use.forEach(function (p, j) {
        var d = p.data;
        months[j] = {
          monthLabel: d.monthLabel || '',
          basic: strVal(d.basic), fixedAllowance: strVal(d.fixedAllowance),
          fixedAllowanceDesc: '', other: strVal(d.other),
          commission: strVal(d.commission), ot: strVal(d.ot),
          epf: strVal(d.epf), pcb: strVal(d.pcb), socso: strVal(num(d.socso) + num(d.eis)),
          otherDeduction: strVal(d.otherDeduction), edited: false
        };

        months[j].orig = {};
        Object.keys(INCOME_MONEY_FIELDS).concat(['fixedAllowanceDesc']).forEach(function (field) {
          months[j].orig[field] = months[j][field] == null ? '' : months[j][field];
        });
        var rec = d.reconciliation || E.payslipReconciliation(d);
        imported.push({
          file: p.name, monthLabel: d.monthLabel || '', employeeName: d.employeeName || '',
          gross: rec.gross, printedGross: rec.printedGross, grossDifference: rec.grossDifference,
          deductions: rec.employeeDeductions, printedDeductionTotal: rec.printedDeductionTotal,
          expectedNet: rec.expectedNet, printedNet: rec.printedNet,
          netDifference: rec.netDifference, deductionDifference: rec.deductionDifference,
          reconciles: rec.reconciles,
          fields: { epf: num(d.epf), pcb: num(d.pcb), socso: num(d.socso), eis: num(d.eis),
            otherDeduction: num(d.otherDeduction) }
        });
      });
      App.state.income.payslipAudit = imported;
      App.renderIncome();
      App.refreshOutputs();
      var extras = [];
      var mismatches = imported.filter(function (a) { return !a.reconciles; });
      if (mismatches.length) extras.push('printed gross/net or deduction totals do not reconcile; check the editable income fields');
      if (scanned) extras.push(scanned + ' file(s) had no readable text (scanned/unsupported - enter manually)');
      if (imageCount) extras.push(imageCount + ' image/photo file(s) skipped (OCR unavailable in offline file mode)');
      if (recognised.length > 6) extras.push('kept the latest 6 of ' + recognised.length + ' months');
      dzState('dz-income', mismatches.length ? 'error' : 'success', 'Read ' + use.length +
        ' payslip(s) into the income grid. Figures are editable; review them before deciding.' +
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

    [['cust-cardtype', s.customer.cardType], ['cust-reportdate', s.reportDate]
    ].forEach(function (p) {
      var n = el(p[0]);
      if (n) n.textContent = (p[1] === '' || p[1] == null) ? '-' : p[1];
    });

    s.ccris.forEach(function (row, i) {
      var cell = el('ccris-commit-' + i);
      var r = E.lineCommitment(row, s.customer.cardType);

      var ov = document.querySelector('#ccris-tbody tr[data-i="' + i + '"] input[data-f="override"]');
      if (ov && document.activeElement !== ov) {
        var want = row.override == null ? '' : String(row.override);
        if (ov.value !== want) ov.value = want;
        ov.classList.toggle('has-value', E.hasOverride(want));
      }
      if (cell) {
        cell.textContent = amt(r.commitment);
        cell.classList.toggle('override', r.overridden);
      }

      var sCell = el('ccris-stress-' + i);
      if (sCell) {
        var floating = String(row.floating || '').toUpperCase() === 'YES';
        sCell.textContent = amt(E.stressCommitment(
          r.commitment, floating, E.stressFactorFor(row)));
        sCell.classList.toggle('stressed', floating);
      }
    });
    var tot = el('ccris-total');
    if (tot) tot.textContent = amt(c.totalCommitment);
    var stot = el('ccris-stress-total');
    if (stot) stot.textContent = amt(c.stressTotal);

    (s.bt || []).forEach(function (row, i) {
      var cell = el('bt-rep-' + i);
      if (cell) cell.textContent = amt(App.btRepaymentOf(row));

      if (App.btLinkResolve(s.ccris, row) >= 0) {
        var tr = document.querySelector('#bt-tbody tr[data-bti="' + i + '"]');
        var oi = tr && tr.querySelector('input[data-btf="outstanding"]');
        if (oi && oi.value !== String(row.outstanding == null ? '' : row.outstanding)) {
          oi.value = String(row.outstanding == null ? '' : row.outstanding);
        }
      }
    });
    var btT = el('bt-total'); if (btT) btT.textContent = amt(c.btTotal);
    var gt = el('grand-total'); if (gt) gt.textContent = amt(c.grandTotal);

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

    var gate = el('intake-gate');
    if (gate) {
      gate.innerHTML = '';
    }
  };
})();
