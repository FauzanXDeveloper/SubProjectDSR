/* ---------------- customer details v2 (application form) ---------------- */

/*
  Additive extension of STEP A. Mounted by renderCustomer() in intake.js.

  Responsibilities:
    1. Drag-and-drop / click dropzone for the Personal Financing-i
       application form PDF.
    2. Three policy fields: Nature of Employment, Number of Household,
       Workplace Location.
    3. Auto-capture of those fields when a form is loaded; manual
       dropdowns when only the Experian report is used.
    4. Identity guard: once a form is loaded, any Experian report whose
       name / IC differs is rejected before it touches the case.

  It never writes to iScore, reportDate, CCRIS, income, HF or CC state.
*/

(function () {
  'use strict';
  var App = window.App = window.App || {};
  var E = window.Engine;

  var esc = App.mod.ui.esc;
  var el = App.mod.ui.el;

  var NATURE = [
    ['SALARIED_PERMANENT', 'Salaried Permanent'],
    ['SALARIED_CONTRACTUAL', 'Salaried Contractual'],
    ['VARIABLE_INCOME', 'Variable Income Earner'],
    ['SELF_EMPLOYED', 'Self-Employed'],
    ['OTHERS', 'Others']
  ];

  var HOUSEHOLD = [
    ['1', '1'],
    ['2', '2'],
    ['3', '3'],
    ['4', '4 and above']
  ];

  function norm(value) {
    return String(value == null ? '' : value).toUpperCase().replace(/\s+/g, ' ').trim();
  }

  function selected(options, value) {
    return options.map(function (option) {
      return '<option value="' + esc(option[0]) + '"' +
        (String(option[0]) === String(value) ? ' selected' : '') + '>' +
        esc(option[1]) + '</option>';
    }).join('');
  }

  function labelOf(options, value) {
    for (var i = 0; i < options.length; i++) {
      if (options[i][0] === value) return options[i][1];
    }
    return '';
  }

  /* ---------------- mapping rules ---------------- */

  function natureFromForm(fields) {
    var status = norm(fields.employmentStatus);
    var type = norm(fields.employmentType);
    var both = status + ' ' + type;

    if (/SELF[\s-]?EMPLOYED|BUSINESS\s*OWNER|OWN\s*BUSINESS|ENTERPRISE|SOLE\s*PROPRIETOR/.test(both)) {
      return 'SELF_EMPLOYED';
    }
    if (/VARIABLE|COMMISSION/.test(both)) return 'VARIABLE_INCOME';

    if (/SALARIED|EMPLOYED|STAFF|PERMANENT|CONTRACT/.test(status)) {
      if (/PERMANENT|CONFIRM|TETAP/.test(type)) return 'SALARIED_PERMANENT';
      if (/CONTRACT|TEMPORARY|KONTRAK/.test(type)) return 'SALARIED_CONTRACTUAL';
      return '';
    }
    if (/SALARIED|EMPLOYED/.test(type)) return 'SALARIED_PERMANENT';
    return '';
  }

  function householdFromDependants(dependants) {
    var n = parseInt(dependants, 10);
    if (!isFinite(n) || n < 0) return '';
    if (n <= 1) return '1';
    if (n === 2) return '2';
    if (n === 3) return '3';
    return '4';
  }

  function workplaceFromForm(fields) {
    var address = [fields.companyAddress, fields.companyTown, fields.companyState]
      .filter(Boolean).join(' ');
    return E.geo.resolveWorkplace({
      postcode: fields.companyPostcode,
      address: address,
      country: fields.country
    });
  }

  /* ---------------- html ---------------- */

  function otherField(id, value, visible, placeholder) {
    return '<input class="editable appform-other" id="' + id + '" value="' + esc(value) + '"' +
      ' placeholder="' + esc(placeholder) + '" autocomplete="off"' +
      (visible ? '' : ' hidden') + '>';
  }

  function html() {
    var c = App.state.customer;
    var natureOther = c.natureOfEmployment === 'OTHERS';
    var placeOther = c.workplaceLocation === 'OTHERS';

    var bucketOptions = E.GEO_BUCKET_ORDER.map(function (key) {
      return [key, E.GEO_BUCKETS[key].label];
    });

    return '<div class="subhead appform-sub">Application Form (optional)</div>' +
      '<div class="dropzone" id="dz-appform">' +
      '<div class="dz-title">Personal Financing-i application form</div>' +
      '<div class="dz-sub">Drop or click &middot; PDF &middot; fills this step automatically</div>' +
      '<input type="file" id="file-appform" accept=".pdf" style="display:none"></div>' +
      '<div id="dz-appform-msg"></div>' +
      '<div id="appform-summary" class="appform-summary">' + summaryHtml() + '</div>' +

      '<div class="subhead appform-sub">Policy Fields</div>' +
      '<div class="grid c3">' +
      '<div class="field"><label>Nature of Employment</label>' +
      '<select class="editable" id="cust-nature">' +
      '<option value="">Select</option>' + selected(NATURE, c.natureOfEmployment) +
      '</select>' + otherField('cust-nature-other', c.natureOfEmploymentOther, natureOther, 'Describe') +
      '</div>' +
      '<div class="field"><label>Number of Household Including Applicant</label>' +
      '<select class="editable" id="cust-household">' +
      '<option value="">Select</option>' + selected(HOUSEHOLD, c.householdSize) +
      '</select></div>' +
      '<div class="field"><label>Workplace Location</label>' +
      '<select class="editable" id="cust-workplace">' +
      '<option value="">Select</option>' + selected(bucketOptions, c.workplaceLocation) +
      '</select>' + otherField('cust-workplace-other', c.workplaceLocationOther, placeOther, 'City / area') +
      '</div>' +
      '</div>' +
      '<div class="hint" id="cust-policy-hint">' + hintText() + '</div>';
  }

  function summaryHtml() {
    var form = App.state.customer.appForm;
    if (!form) return '';
    var f = form.fields || {};
    var bits = [];
    if (f.name) bits.push('Name: ' + f.name);
    if (f.ic) bits.push('IC: ' + E.formatIC(f.ic));
    if (f.employmentStatus || f.employmentType) {
      bits.push('Employment: ' + [f.employmentStatus, f.employmentType].filter(Boolean).join(' / '));
    }
    if (f.dependants != null) bits.push('Dependants: ' + f.dependants);
    if (f.companyPostcode) bits.push('Postcode: ' + f.companyPostcode);
    if (f.financingAmount != null) bits.push('Financing: ' + E.formatAmount(f.financingAmount));
    if (f.tenureMonths != null) bits.push('Tenure: ' + f.tenureMonths + ' months');

    var warnings = (form.warnings || []).length
      ? '<div class="notice">' + form.warnings.map(esc).join('<br>') + '</div>' : '';

    return '<div class="appform-line"><b>Loaded:</b> ' + esc(form.fileName || 'application form') +
      '<button class="link-btn" id="appform-clear" type="button">clear</button></div>' +
      '<div class="appform-fields">' + esc(bits.join(' \u00b7 ')) + '</div>' +
      warnings;
  }

  function hintText() {
    var c = App.state.customer;
    if (!c.natureOfEmployment && !c.householdSize && !c.workplaceLocation) {
      return c.fromAppForm
        ? 'Captured from the application form where available - confirm each field.'
        : 'Manual entry. Load an application form above to capture these automatically.';
    }
    var bits = [];
    bits.push(c.fromAppForm ? 'Captured from application form' : 'Manual entry');
    if (c.geoPostcode || c.workplaceLocation) {
      var method = c.geoMethod ? ' (' + c.geoMethod + (c.geoConfidence ? ' \u00b7 ' + c.geoConfidence : '') + ')' : '';
      bits.push('workplace resolved from postcode ' + (c.geoPostcode || '-') + method);
    }
    return bits.join(' \u00b7 ');
  }

  /* ---------------- apply the parsed form ---------------- */

  function applyParsedForm(parsed) {
    var c = App.state.customer;
    var f = parsed.fields || {};

    if (f.name) c.name = f.name;
    if (f.ic) c.ic = f.ic;
    c.fromAppForm = true;
    c.appForm = {
      fileName: parsed.fileName || '',
      fields: f,
      found: parsed.found || {},
      warnings: parsed.warnings || []
    };

    c.companyAddress = f.companyAddress || '';
    c.companyPostcode = f.companyPostcode || '';
    c.companyTown = f.companyTown || '';
    c.companyState = f.companyState || '';

    var nature = natureFromForm(f);
    if (nature) {
      c.natureOfEmployment = nature;
      c.natureOfEmploymentOther = nature === 'OTHERS'
        ? [f.employmentStatus, f.employmentType].filter(Boolean).join(' / ') : '';
    }

    var household = householdFromDependants(f.dependants);
    if (household) c.householdSize = household;

    var geo = workplaceFromForm(f);
    c.workplaceLocation = geo.bucket;
    c.workplaceLocationOther = geo.bucket === 'OTHERS' ? geo.freeText : '';
    c.geoPostcode = geo.postcode || f.companyPostcode || '';
    c.geoMethod = geo.method;
    c.geoConfidence = geo.confidence;

    prefillFinancing(f);
  }

  /*
    Financing Amount and Tenure only. Monthly Income from the form is never
    written to the income engine.
  */
  function prefillFinancing(f) {
    var pf = App.state.pf;
    if (!pf) return;
    var previous = (App.state.customer.appForm && App.state.customer.appForm.previousFields) || {};

    if (f.financingAmount != null && f.financingAmount > 0) {
      var currentAmount = String(pf.amount == null ? '' : pf.amount).replace(/[,\s]/g, '');
      var lastAmount = String(previous.financingAmount == null ? '' : previous.financingAmount);
      if (!currentAmount || currentAmount === lastAmount) pf.amount = String(f.financingAmount);
    }
    if (f.tenureMonths != null && f.tenureMonths > 0) {
      var currentTenure = String(pf.tenureMonths == null ? '' : pf.tenureMonths).trim();
      var lastTenure = String(previous.tenureMonths == null ? '' : previous.tenureMonths);
      if (!currentTenure || currentTenure === lastTenure) pf.tenureMonths = String(f.tenureMonths);
    }

    /* Remember what this form proposed so a re-upload can update safely. */
    if (App.state.customer.appForm) {
      App.state.customer.appForm.previousFields = {
        financingAmount: f.financingAmount,
        tenureMonths: f.tenureMonths
      };
    }
  }

  function clearForm() {
    var c = App.state.customer;
    c.fromAppForm = false;
    c.appForm = null;
    c.companyAddress = '';
    c.companyPostcode = '';
    c.companyTown = '';
    c.companyState = '';
    c.natureOfEmployment = '';
    c.natureOfEmploymentOther = '';
    c.householdSize = '';
    c.workplaceLocation = '';
    c.workplaceLocationOther = '';
    c.geoPostcode = '';
    c.geoMethod = '';
    c.geoConfidence = '';
  }

  /* ---------------- dropzone ---------------- */

  async function handleFiles(files) {
    var file = files && files[0];
    if (!file) return;

    App.dzState('dz-appform', 'loading', 'Reading ' + esc(file.name) + ' ...');
    try {
      var parsed = await E.appForm.extract(file);
      if (!parsed.ok) {
        App.dzState('dz-appform', 'error', parsed.warnings.join(' ') || 'Could not read this form.');
        return;
      }

      applyParsedForm(parsed);
      App.renderCustomer();
      App.renderPF();
      App.refreshOutputs();

      var read = Object.keys(parsed.found).filter(function (k) { return parsed.found[k]; }).length;
      var total = Object.keys(parsed.found).length;
      App.dzState('dz-appform', parsed.warnings.length ? 'error' : 'success',
        'Read ' + read + ' of ' + total + ' fields from ' + esc(file.name) + '.' +
        (parsed.warnings.length ? ' ' + parsed.warnings.join(' ') : '') +
        ' Financing amount and tenure were prefilled; monthly income was not used.');
    } catch (error) {
      App.dzState('dz-appform', 'error', 'Extraction failed: ' + esc(error.message) +
        ' - set the policy fields manually below.');
      console.error(error);
    }
  }

  function bind() {
    if (App.bindDropzone) {
      App.bindDropzone('dz-appform', 'file-appform', handleFiles, false);
    }

    var clearBtn = el('appform-clear');
    if (clearBtn) {
      clearBtn.onclick = function () {
        clearForm();
        App.renderCustomer();
        App.refreshOutputs();
      };
    }

    var nature = el('cust-nature');
    if (nature) {
      nature.onchange = function () {
        App.state.customer.natureOfEmployment = this.value;
        toggleOther('cust-nature-other', this.value === 'OTHERS');
        App.refreshOutputs();
      };
    }

    var natureOther = el('cust-nature-other');
    if (natureOther) {
      natureOther.oninput = function () {
        App.state.customer.natureOfEmploymentOther = this.value;
        App.refreshOutputs();
      };
    }

    var household = el('cust-household');
    if (household) {
      household.onchange = function () {
        App.state.customer.householdSize = this.value;
        App.refreshOutputs();
      };
    }

    var workplace = el('cust-workplace');
    if (workplace) {
      workplace.onchange = function () {
        App.state.customer.workplaceLocation = this.value;
        toggleOther('cust-workplace-other', this.value === 'OTHERS');
        App.refreshOutputs();
      };
    }

    var workplaceOther = el('cust-workplace-other');
    if (workplaceOther) {
      workplaceOther.oninput = function () {
        App.state.customer.workplaceLocationOther = this.value;
        App.refreshOutputs();
      };
    }
  }

  function toggleOther(id, visible) {
    var input = el(id);
    if (!input) return;
    if (visible) input.removeAttribute('hidden');
    else input.setAttribute('hidden', '');
  }

  /* ---------------- Experian identity guard ---------------- */

  /* Returns a mismatch description when the report is not the same person. */
  function validateExperian(result) {
    var c = App.state.customer;
    if (!c.fromAppForm || !c.appForm) return '';
    if (!App.identityMismatch) return '';
    return App.identityMismatch(result.name, result.icNumber, c.name, c.ic);
  }

  App.customerDetailsV2 = {
    html: html,
    bind: bind,
    handleFiles: handleFiles,
    validateExperian: validateExperian,
    natureFromForm: natureFromForm,
    householdFromDependants: householdFromDependants,
    workplaceFromForm: workplaceFromForm,
    natureLabel: function (value) { return labelOf(NATURE, value); },
    householdLabel: function (value) { return labelOf(HOUSEHOLD, value); },
    workplaceLabel: function (value) {
      return E.GEO_BUCKETS[value] ? E.GEO_BUCKETS[value].label : '';
    }
  };

  App.mod = App.mod || {};
  App.mod.customerDetailsV2 = App.customerDetailsV2;
})();
