/* ---------------- application form extraction ---------------- */

/*
  Reads the Personal Financing-i Application Form PDF and returns the
  customer-detail fields the calculator needs.

  The form is a two-column table: the label and its value sit on the same
  visual line (label left, value right). pdf.js groups them into one row,
  so a row can hold several field/value pairs. We therefore take everything
  after the label on that row, then cut it at the next known label.

  Fallback: when the value is not on the same row, the next usable line is
  used instead (older template revisions).

  Extraction is best-effort: every field reports whether it was found and
  the caller asks the underwriter to confirm.
*/

(function () {
  'use strict';
  window.Engine = window.Engine || {};
  var Engine = window.Engine;

  /* Longest phrases first so "Town / City" wins over "Town city". */
  var LABEL_PHRASES = [
    'Application Date & Time', 'Purpose of Financing', 'Tenure of Financing',
    'Nature of Business', 'Employer Type', 'Employment Status', 'Type of Employment',
    'Company Address', 'Company Name', 'Company Code', 'Employed Since',
    'Identification Type', 'New NRIC Number', 'Old NRIC Number', 'Date of Birth',
    'Place of Birth', 'Marital Status', 'No. of Dependants', 'Residential Status',
    'Highest Education', 'Residential Address', 'Ownership Status', 'Residence Since',
    'Monthly Income', 'Financing Amount', 'Contact Number', 'Sales Person Information',
    'Sales Name', 'Sales Email', 'Full Name', 'IC Number', 'Title', 'Gender',
    'Nationality', 'Bumiputera', 'Occupation', 'Post code', 'Postcode', 'Town / City',
    'Town city', 'State', 'Country', 'Mobile No.', 'Position', 'Website',
    'Email Addess', 'Email Address', 'Ext.', 'Signature', 'Information'
  ].sort(function (a, b) { return b.length - a.length; });

  function escapeRe(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  var LABEL_GROUP = '(' + LABEL_PHRASES.map(escapeRe).join('|') + ')';
  var NEXT_LABEL = new RegExp('\\b' + LABEL_GROUP + '\\s*:?', 'i');
  var KNOWN_LABEL = new RegExp('^' + LABEL_GROUP + '\\s*:?\\s*$', 'i');
  var NOISE_BOUNDARY = new RegExp(
    '\\b(' +
    'Agree|Personal Data Protection Notice|Letter of Consent|Shariah Compliant Transaction|' +
    'Charges|Marketing & Promotions|Document Review and Acceptance|For Office Use Only|' +
    'Personal Financing-i Declaration|Product Disclosure Sheet|Terms and Conditions|' +
    'Sales Person Information|Signature' +
    ')\\b', 'i');
  var DATE_TOKEN = /\b\d{2}\/\d{2}\/\d{4}\b/;
  var PAGE_HEADER = /^(Personal Financing-i Application|Page \d+ of \d+|For Office Use Only|Document Review and Acceptance|Shariah Compliant Transaction|Charges|Agree)$/i;
  var SECTION_LINE = /^\s*\d+(\.\d+)?\.\s+[A-Z]/;

  function clean(value) {
    return String(value == null ? '' : value)
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function rowText(row) {
    return clean(row && row.text);
  }

  function isBlankValue(value) {
    var text = clean(value);
    return text === '' || text === '-' || text === '\u2013' || text === '\u2014';
  }

  function stripLabel(text, labelRe) {
    var match = text.match(labelRe);
    if (!match) return '';
    return clean(text.slice(match.index + match[0].length).replace(/^[:\-\u2013]\s*/, ''));
  }

  /* Everything up to the next field label belongs to this field. */
  function cutAtNextLabel(text) {
    var value = clean(text);
    if (!value) return '';

    var cut = value.length;
    [NEXT_LABEL, NOISE_BOUNDARY, DATE_TOKEN].forEach(function (re) {
      var match = value.match(re);
      if (match && match.index < cut) cut = match.index;
    });

    value = clean(value.slice(0, cut));
    return value;
  }

  function isLabelText(value) {
    var text = clean(value);
    if (!text) return true;
    return KNOWN_LABEL.test(text) || /^[:\-\u2013\u2014]+$/.test(text);
  }

  /* Labels can sit anywhere in a row, not only at the start. */
  function unanchored(labelRe) {
    var source = String(labelRe.source).replace(/^\^/, '');
    return new RegExp('\\b' + source, labelRe.flags || 'i');
  }

  function valueFromItems(row, labelRe) {
    if (!row || !row.items || row.items.length < 2) return '';

    var labelEnd = null;
    row.items.forEach(function (item) {
      var str = clean(item.str);
      if (!str) return;
      if (labelRe.test(str)) {
        var width = String(item.str || '').length * 6;
        labelEnd = item.x + width;
      }
    });
    if (labelEnd === null) return '';

    var parts = [];
    row.items.forEach(function (item) {
      var str = clean(item.str);
      if (!str) return;
      if (item.x <= labelEnd) return;
      if (KNOWN_LABEL.test(str) || NEXT_LABEL.test(str)) return;
      parts.push(str);
    });
    return cutAtNextLabel(parts.join(' '));
  }

  function sameRowValue(row, labelRe) {
    var text = rowText(row);
    var inline = stripLabel(text, labelRe);
    if (inline) {
      var cut = cutAtNextLabel(inline);
      if (cut && !isLabelText(cut)) return cut;
    }
    return valueFromItems(row, labelRe);
  }

  /* Extra lines belonging to a multi-line value (company address, purpose). */
  function continuation(rows, index, options, wanted) {
    var out = [];
    var stopRe = options.stopRe || null;
    for (var i = index + 1; i < rows.length && out.length < wanted; i++) {
      var text = rowText(rows[i]);
      if (!text) continue;
      if (PAGE_HEADER.test(text)) continue;
      if (SECTION_LINE.test(text)) break;
      if (stopRe && stopRe.test(text)) break;
      if (KNOWN_LABEL.test(text) || NEXT_LABEL.test(text)) break;

      var piece = cutAtNextLabel(text);
      if (!piece) break;
      out.push(piece);
    }
    return clean(out.join(' '));
  }

  function field(rows, labelRe, options) {
    options = options || {};
    var re = unanchored(labelRe);
    for (var i = 0; i < rows.length; i++) {
      var text = rowText(rows[i]);
      if (!re.test(text)) continue;

      var value = sameRowValue(rows[i], re);

      if (value && options.maxLines > 1) {
        var extra = continuation(rows, i, options, options.maxLines - 1);
        if (extra) value = clean(value + ' ' + extra);
      }

      if (!value) {
        var next = continuation(rows, i, options, options.maxLines || 1);
        if (next) value = next;
      }

      if (value) return { value: value, index: i };
    }
    return { value: '', index: -1 };
  }

  /* Rows between two section headers. */
  function section(rows, startRe, endRe) {
    var start = -1;
    var end = rows.length;
    for (var i = 0; i < rows.length; i++) {
      var text = rowText(rows[i]);
      if (start < 0) {
        if (startRe.test(text)) start = i;
      } else if (endRe && endRe.test(text)) {
        end = i;
        break;
      }
    }
    return start < 0 ? [] : rows.slice(start, end);
  }

  function digits(value) {
    return String(value == null ? '' : value).replace(/\D/g, '');
  }

  function money(value) {
    if (isBlankValue(value)) return null;
    var text = String(value).replace(/RM|MYR/gi, '').replace(/[,\s]/g, '');
    var match = text.match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  }

  function integer(value) {
    if (isBlankValue(value)) return null;
    var match = String(value).match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }

  function titleCase(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); });
  }

  function parseRows(rows) {
    rows = rows || [];
    var result = {
      ok: false,
      fields: {},
      found: {},
      warnings: [],
      pages: 0,
      rowCount: rows.length
    };

    if (!rows.length) {
      result.warnings.push('The PDF has no readable text - it may be a scan.');
      return result;
    }

    var all = rows.map(rowText).join('\n');
    if (!/Personal Financing-i Application|Financing Details/i.test(all)) {
      result.warnings.push('This PDF does not look like a Personal Financing-i application form.');
      return result;
    }

    result.pages = rows.reduce(function (max, row) {
      return Math.max(max, row.page || 1);
    }, 1);

    var applicant = section(rows, /^\s*1\.\s*Applicant/i, /^\s*2\.\s*/);
    var employment = section(rows, /^\s*4\.\s*Applicant/i, /^\s*5\.\s*/);
    var financing = section(rows, /Financing Details/i, /For Office Use Only|Sales Person Information/i);

    function put(key, spec) {
      var value = spec && spec.value ? clean(spec.value) : '';
      if (isBlankValue(value)) value = '';
      result.fields[key] = value;
      result.found[key] = !!value;
    }

    /* Identity - the page header carries name and IC on every page. */
    put('name', field(rows, /^Full Name\s*:?/i));
    put('ic', field(rows, /^IC Number\s*:?/i));

    /* Section 1 - applicant */
    put('dependants', field(applicant, /^No\. of Dependants\s*:?/i));
    put('maritalStatus', field(applicant, /^Marital Status\s*:?/i));
    put('nationality', field(applicant, /^Nationality\s*:?/i));

    /* Section 4 - current employment (source of the three policy fields) */
    put('employmentStatus', field(employment, /^Employment Status\s*:?/i));
    put('employmentType', field(employment, /^Type of Employment\s*:?/i));
    put('companyName', field(employment, /^Company Name\s*:?/i));
    put('companyAddress', field(employment, /^Company Address\s*:?/i, {
      maxLines: 3, stopRe: /^Post ?code\s*:?/i
    }));
    put('companyPostcode', field(employment, /^Post ?code\s*:?/i));
    put('companyTown', field(employment, /^Town ?\/ ?City\s*:?/i));
    put('companyState', field(employment, /^State\s*:?/i));
    put('country', field(employment, /^Country\s*:?/i));

    /* Financing details */
    put('financingAmount', field(financing, /^Financing Amount\s*:?/i));
    put('tenureMonths', field(financing, /^Tenure of Financing\s*:?/i));
    put('monthlyIncome', field(financing, /^Monthly Income\s*:?/i));
    put('purpose', field(financing, /^Purpose of Financing\s*:?/i, {
      maxLines: 2, stopRe: /^For Office Use Only/i
    }));

    var f = result.fields;

    f.name = clean(f.name);
    f.ic = digits(f.ic);
    if (f.ic.length !== 12) {
      var icMatch = all.match(/\b\d{6}-\d{2}-\d{4}\b/);
      if (icMatch) f.ic = digits(icMatch[0]);
    }

    f.dependants = integer(f.dependants);
    f.financingAmount = money(f.financingAmount);
    f.tenureMonths = integer(f.tenureMonths);
    f.monthlyIncome = money(f.monthlyIncome);
    f.companyPostcode = digits(f.companyPostcode);
    if (f.companyPostcode.length > 5) f.companyPostcode = f.companyPostcode.slice(0, 5);
    f.companyState = titleCase(f.companyState);
    f.companyTown = titleCase(f.companyTown);
    f.country = titleCase(f.country);

    Object.keys(f).forEach(function (key) {
      if (f[key] === null || f[key] === '') result.found[key] = false;
    });

    if (!f.name) result.warnings.push('Name not found.');
    if (!f.ic) result.warnings.push('IC number not found.');
    if (!f.employmentStatus && !f.employmentType) {
      result.warnings.push('Employment status / type not found - set Nature of Employment manually.');
    }
    if (f.dependants == null) {
      result.warnings.push('No. of Dependants not found - set Number of Household manually.');
    }
    if (!f.companyPostcode && !f.companyTown) {
      result.warnings.push('Company address / postcode not found - set Workplace Location manually.');
    }

    result.ok = true;
    return result;
  }

  async function extract(file) {
    if (!window.Engine.extractTextRows) {
      throw new Error('PDF library not available.');
    }
    var rows = await window.Engine.extractTextRows(file);
    var parsed = parseRows(rows);
    parsed.fileName = file && file.name ? file.name : '';
    return parsed;
  }

  Engine.appForm = {
    parseRows: parseRows,
    extract: extract
  };
})();
