/* ---------------- pdf extraction ---------------- */

(function () {
  'use strict';
  window.Engine = window.Engine || {};

  function pdfAvailable() { return typeof window.pdfjsLib !== 'undefined'; }

  async function getTextRows(file) {
    if (!pdfAvailable()) {
      throw new Error('PDF library not found. Place pdf.min.js and pdf.worker.min.js in the /vendor folder.');
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    var buf = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    var rows = [];
    for (var p = 1; p <= pdf.numPages; p++) {
      var page = await pdf.getPage(p);
      var content = await page.getTextContent();
      var pageRows = [];
      content.items.forEach(function (item) {
        var str = (item.str || '').trim();
        if (!str) return;
        var x = item.transform[4], y = item.transform[5];
        var row = null;
        for (var i = 0; i < pageRows.length; i++) {
          if (Math.abs(pageRows[i].y - y) <= 5) { row = pageRows[i]; break; }
        }
        if (!row) { row = { page: p, y: y, items: [] }; pageRows.push(row); }
        row.items.push({ str: str, x: x });
      });
      pageRows.sort(function (a, b) { return b.y - a.y; });
      pageRows.forEach(function (r) {
        r.items.sort(function (a, b) { return a.x - b.x; });
        r.text = r.items.map(function (it) { return it.str; }).join(' ');
      });
      rows = rows.concat(pageRows);
    }
    return rows;
  }

  function squash(s) { return String(s == null ? '' : s).toUpperCase().replace(/\s+/g, ''); }
  function normTok(s) { return String(s == null ? '' : s).replace(/\s+/g, ''); }

  function parseMoney(tok) {
    var t = String(tok).replace(/[\s,]/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    return parseFloat(t);
  }
  function moneyTokens(row) {
    var out = [];
    row.items.forEach(function (it) {
      var v = parseMoney(it.str);
      if (v !== null) out.push({ v: Math.abs(v), x: it.x, raw: it.str });
    });
    return out;
  }

  function strictMoney(tok) {
    var t = String(tok).replace(/\s+/g, '');
    if (!/^-?(\d{1,3}(,\d{3})+(\.\d{1,2})?|\d+\.\d{1,2})$/.test(t)) return null;
    return Math.abs(parseFloat(t.replace(/,/g, '')));
  }
  function strictMoneyTokens(row) {
    var out = [];
    row.items.forEach(function (it) {
      var v = strictMoney(it.str);
      if (v !== null) out.push({ v: v, x: it.x, raw: it.str });
    });
    return out;
  }

  var NON_FACILITY = [
    'OUTSTANDING', 'CREDIT', 'APPLICATION', 'SPECIAL', 'ATTENTION', 'ACCOUNT',
    'APPROVED', 'PENDING', 'TOTAL', 'LIMIT', 'BALANCE', 'DATE', 'CAPACITY',
    'LEGAL', 'STATUS', 'INSTALMENT', 'COLLATERAL', 'BRANCH', 'PAYMENT',
    'FACILITY', 'CCRIS', 'EXPERIAN', 'REPORT', 'SUBJECT', 'MONTH', 'ARREARS',
    'OWN', 'JOINT', 'GUARANTOR', 'DIRECTOR', 'CLEAN', 'PROPERTIES', 'VEHICLES',
    'SHARES', 'OTHERS', 'MOTOR', 'UNIT', 'TRUST',

    'MOTORV', 'UNITTRUST', 'FINASSTS'
  ];
  function looksLikeFacility(tok) {
    if (!/^[A-Z]{4,15}$/.test(tok)) return false;
    return NON_FACILITY.indexOf(tok) === -1;
  }

  function findCapacity(sq) {
    var m = sq.match(/OWN|JOINT|GUARANTOR|DIRECTOR/);
    return m ? m[0] : '';
  }

  function findCollateral(sq) {
    if (/MOTORV/.test(sq)) return 'MOTOR V (JPJ)';
    if (/UNITTRUST/.test(sq)) return 'UNIT TRUST';
    if (/PROPERT/.test(sq)) return 'PROPERTIES';
    if (/CLEAN/.test(sq)) return 'CLEAN';
    if (/SHARES/.test(sq)) return 'SHARES';
    if (/FIN\.?ASST|FINANCIALASSET/.test(sq)) return 'FIN.ASSTS';
    if (/OTHERS?/.test(sq)) return 'OTHERS';
    return '';
  }

  function assertHasText(rows, what) {
    if (rows && rows.length) return;
    throw new Error('this PDF has no text in it - it looks like a scan or an ' +
      'image saved with "Print to PDF", so there is nothing to extract (we do ' +
      'not OCR yet). Save the ' + what + ' as a normal text PDF and try again');
  }

  async function extractFromExperian(file) {
    var rows = await getTextRows(file);
    assertHasText(rows, 'credit report');

    if (looksLikeBankCCRIS(rows)) return parseBankCCRISRows(rows);
    return parseExperianRows(rows);
  }

  function looksLikeBankCCRIS(rows) {
    var t = rows.map(function (r) { return r.text || ''; }).join('\n');
    return /Report request made for/i.test(t) && /Outstanding Credit/i.test(t);
  }

  function parseBankCCRISRows(rows) {
    var result = {
      iScore: null, name: '', icNumber: '', reportDate: '',
      records: [], nlciRecords: [], debug: []
    };
    var parent = null;
    var inApplications = false;

    function itemNear(row, x, tol) {
      var best = null, bestD = 1e9;
      (row.items || []).forEach(function (it) {
        var d = Math.abs(it.x - x);
        if (d <= (tol || 6) && d < bestD) { best = it; bestD = d; }
      });
      return best ? best.str : '';
    }
    function itemsNear(row, x, tol) {
      return (row.items || []).filter(function (it) {
        return Math.abs(it.x - x) <= (tol || 8);
      }).map(function (it) { return it.str; });
    }
    function money(s) {
      var v = parseMoney(String(s == null ? '' : s).replace(/\s/g, ''));
      return v == null ? null : v;
    }

    rows.forEach(function (row) {
      var text = row.text || '';

      if (!result.name && /Applicant/i.test(text)) {
        var ic = text.match(/\b\d{12}\b/);
        var name = itemNear(row, 35, 8);
        if (ic && name && /[A-Za-z]/.test(name) && !/^Name$/i.test(name)) {
          result.name = name;
          result.icNumber = ic[0];
        }
      }
      var md = text.match(/Report Date:\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (md) result.reportDate = md[1];

      if (/Application for Credit/i.test(text)) { inApplications = true; return; }
      if (inApplications) return;

      var noStr = itemNear(row, 35, 4);
      var sts = itemNear(row, 72, 4);

      if (/^\d+$/.test(noStr) && !sts) {
        var colType = String(itemNear(row, 397, 6) || '').toUpperCase().trim();
        parent = {
          no: parseInt(noStr, 10),
          date: itemsNear(row, 50, 8).join('').replace(/\s/g, ''),
          capacity: itemNear(row, 88, 6).toUpperCase(),
          limit: money(itemNear(row, 286, 6)) || 0,

          collateral: colType === '00' ? 'CLEAN' : colType,
          limitUsed: false
        };
        return;
      }

      var facility = String(itemNear(row, 168, 10) || '').toUpperCase().trim();
      if (sts && facility && parent) {

        var subCol = String(itemNear(row, 397, 6) || '').toUpperCase().trim();
        if (!parent.collateral && subCol) {
          parent.collateral = subCol === '00' ? 'CLEAN' : subCol;
        }
        var out = money(itemNear(row, 207, 8)) || 0;
        var inst = money(itemNear(row, 286, 8)) || 0;
        var limit = parent.limitUsed ? 0 : parent.limit;
        parent.limitUsed = true;
        result.records.push({
          no: parent.no, date: parent.date, capacity: parent.capacity,
          collateral: parent.collateral, facility: facility,
          outstanding: out, limit: limit, legalStatus: '',
          commitmentPerCCRIS: inst, override: '', floating: 'NO',
          sourceSection: 'CCRIS'
        });
        result.debug.push('ccris ' + facility + ' out=' + out + ' lim=' + limit +
          ' inst=' + inst + ' (item ' + parent.no + ')');
      }
    });
    return result;
  }

  function parseExperianRows(rows) {
    var debug = [];
    var result = {
      iScore: null, name: '', icNumber: '', reportDate: '',
      records: [], nlciRecords: [], debug: debug
    };

    rows.forEach(function (row, idx) {
      var text = row.text;
      if (result.iScore === null && /I[\s-]?SCORE/i.test(text)) {
        for (var k = idx; k < Math.min(idx + 4, rows.length); k++) {
          var m = rows[k].text.match(/\b([3-8]\d{2})\b/);
          if (m) { result.iScore = parseInt(m[1], 10); debug.push('iScore@row' + k + '=' + m[1]); break; }
        }
      }
      if (!result.name && /Name\s+Of\s+Subject/i.test(text)) {
        var after = text.replace(/.*Name\s+Of\s+Subject\s*:?\s*/i, '').trim();
        if (after.length > 2) result.name = after;
        else if (rows[idx + 1]) result.name = rows[idx + 1].text.trim();
      }
      if (!result.icNumber) {
        if (/New\s+IC\s+No|IC\/?PP\s+No/i.test(text)) {
          var mic = text.match(/(\d{6}-?\d{2}-?\d{4})/);
          if (mic) result.icNumber = mic[1].replace(/-/g, '');
        } else {
          var mic2 = text.match(/^\s*(\d{6}-\d{2}-\d{4})\s*$/);
          if (mic2) result.icNumber = mic2[1].replace(/-/g, '');
        }
      }
      if (!result.reportDate && /(Report|Order)\s+Date/i.test(text)) {
        var md = text.match(/(\d{2}\/\d{2}\/\d{4})/) || text.match(/(\d{4}-\d{2}-\d{2})/);
        if (md) result.reportDate = md[1];
      }
    });

    /* ---------------- CCRIS + NLCI table sections ---------------- */
    var section = null;
    var inDetail = false;
    var currentParent = null;

    function pushCCRISRecord(rec) {
      result.records.push(rec);
      debug.push('rec ' + rec.facility + ' out=' + rec.outstanding +
        ' lim=' + rec.limit + ' inst=' + rec.commitmentPerCCRIS +
        ' (item ' + rec.no + ' line ' + ((currentParent ? currentParent.subCount : 0) + 1) + ')');
    }

    rows.forEach(function (row) {
      var sq = squash(row.text);

      if (/DETAILEDCREDITREPORT/.test(sq)) { inDetail = true; section = null; return; }
      if (/NLCI|NON-?BANKLENDER/.test(sq)) { inDetail = true; section = 'NLCI'; currentParent = null; return; }
      if (/REMARKLEGEND/.test(sq) || /^SECTION\d/.test(sq)) { inDetail = false; section = null; return; }
      if (/WRITTEN-?OFF/.test(sq)) { section = null; return; }
      if (/CREDITAPPLICATION/.test(sq)) { section = null; return; }
      if (/OUTSTANDINGCREDIT|SPECIALATTENTION/.test(sq)) {
        if (inDetail && section !== 'NLCI') section = 'CCRIS';
        return;
      }
      if (!inDetail || !section) return;
      if (/TOTAL/.test(sq)) return;

      var toks = row.items.map(function (it) { return normTok(it.str); });
      var dateMatch = toks.join(' ').match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
      var isNumbered = /^\d{1,3}$/.test(toks[0] || '') && !!dateMatch;
      var nums = strictMoneyTokens(row);

      if (section === 'NLCI') {
        if (!isNumbered || !nums.length) return;

        var fac = '';
        for (var q = 0; q < row.items.length; q++) {
          var it = row.items[q];
          if (it.x >= nums[0].x) break;
          var tok = normTok(it.str);
          if (/^[A-Z]{2,15}$/.test(tok) &&
              ['OWN', 'JOINT', 'GUARANTOR', 'DIRECTOR', 'O', 'A', 'MTH', 'CLEAN'].indexOf(tok) === -1) {
            fac = tok;
          }
        }
        var nl = { limit: 0, inst: 0, out: 0 };
        if (nums.length >= 3) { nl.limit = nums[0].v; nl.inst = nums[1].v; nl.out = nums[nums.length - 1].v; }
        else if (nums.length === 2) { nl.limit = nums[0].v; nl.inst = nums[1].v; nl.out = nums[1].v; }
        else { nl.out = nums[0].v; }
        result.nlciRecords.push({
          no: parseInt(toks[0], 10),
          date: dateMatch[1],
          capacity: findCapacity(sq) || 'OWN',
          collateral: findCollateral(sq) || '',
          facility: fac || 'NLCI',
          outstanding: nl.out,
          limit: nl.limit,
          legalStatus: '',
          commitmentPerCCRIS: nl.inst,
          override: '',
          floating: 'NO',
          sourceSection: 'NLCI'
        });
        debug.push('nlci ' + (fac || 'NLCI') + ' lim=' + nl.limit + ' inst=' + nl.inst + ' out=' + nl.out);
        return;
      }

      var facility = null;
      for (var t = 0; t < toks.length; t++) {
        if (looksLikeFacility(toks[t])) { facility = toks[t]; break; }
      }

      if (isNumbered && !facility) {

        currentParent = {
          no: parseInt(toks[0], 10),
          date: dateMatch[1],
          capacity: findCapacity(sq) || 'OWN',
          collateral: findCollateral(sq),
          limit: nums.length ? nums[nums.length - 1].v : 0,
          subCount: 0
        };
        return;
      }
      if (!facility) return;
      if (!nums.length) return;

      var outstanding = 0, limit = 0, instalment = 0;
      if (isNumbered) {

        currentParent = {
          no: parseInt(toks[0], 10), date: dateMatch[1],
          capacity: findCapacity(sq) || 'OWN',
          collateral: findCollateral(sq), limit: 0, subCount: 0
        };
        if (nums.length >= 3) { outstanding = nums[0].v; limit = nums[1].v; instalment = nums[nums.length - 1].v; }
        else if (nums.length === 2) { outstanding = nums[0].v; instalment = nums[1].v; }
        else if (nums.length === 1) { outstanding = nums[0].v; }
      } else {

        if (nums.length >= 2) { outstanding = nums[0].v; instalment = nums[1].v; }
        else if (nums.length === 1) { outstanding = nums[0].v; }
        if (currentParent && currentParent.subCount === 0) limit = currentParent.limit;
      }

      pushCCRISRecord({
        no: currentParent ? currentParent.no : (result.records.length + 1),
        date: currentParent ? currentParent.date : '',
        capacity: (findCapacity(sq) || (currentParent && currentParent.capacity)) || 'OWN',
        collateral: (findCollateral(sq) || (currentParent && currentParent.collateral)) || '',
        facility: facility,
        outstanding: outstanding,
        limit: limit,
        legalStatus: '',
        commitmentPerCCRIS: instalment,
        override: '',
        floating: 'NO',
        sourceSection: 'CCRIS'
      });
      if (currentParent) currentParent.subCount++;
    });

    console.log('[extractFromExperian]', result);
    return result;
  }

  var MALAY_MONTHS = {
    JAN: 0, FEB: 1, MAC: 2, MAR: 2, APR: 3, MEI: 4, MAY: 4, JUN: 5,
    JUL: 6, OGS: 7, OGO: 7, AUG: 7, SEP: 8, OKT: 9, OCT: 9, NOV: 10,
    DIS: 11, DEC: 11
  };

  var EPF_NOT_NAME = /^(SULIT|PENYATA|RINGKASAN|CARUMAN|PENGELUARAN|JUMLAH|PELARASAN|PERHATIAN|NOTA|BULAN|TRANSAKSI|JENIS|BAKI|CETAKAN|MENARA)\b/i;

  function isEPFStatementRows(rows) {
    var text = (rows || []).map(function (r) { return r.text || ''; }).join(' ').toUpperCase();

    return /\b(KWSP|EPF)\b/.test(text) &&
      /\b(CARUMAN|CONTRIBUTION|PENYATA\s+AHLI|MEMBER\s+STATEMENT)\b/.test(text);
  }

  function parseEPFRows(rows) {
    var debug = [];
    var found = [];

    var epfName = '', epfIC = '';
    rows.forEach(function (row) {
      var text = row.text || '';
      if (!epfIC) {
        var m = /(?:KAD\s+PENGENALAN|PENGENALAN|IC|MYKAD)\D{0,6}(\d{6}-?\d{2}-?\d{4}|\d{12})/i.exec(text);
        if (m) epfIC = m[1].replace(/\D/g, '');
        else {
          var m2 = /(^|\s)(\d{6}-\d{2}-\d{4})(\s|$)/.exec(text);
          if (m2) epfIC = m2[2].replace(/\D/g, '');
        }
      }
    });

    for (var ri = 0; ri < rows.length; ri++) {
      var t = (rows[ri].text || '').trim();
      if (/PENGENALAN|KWSP|MAJIKAN/i.test(t)) break;
      if (EPF_NOT_NAME.test(t)) continue;
      if (/^[A-Z][A-Z\s@\/'.-]{5,}$/.test(t) && !/\d/.test(t)) {
        if (/\b(BINTI|BIN|A\/L|A\/P|D\/O|S\/O)\b/i.test(t)) { epfName = t; break; }
        if (!epfName) epfName = t;
      }
    }
    if (epfName) debug.push('epf name=' + epfName);
    if (epfIC) debug.push('epf ic=' + epfIC);

    rows.forEach(function (row) {
      var m = row.text.match(/\b([A-Za-z]{3})[-\s]?(\d{2})\b/);
      if (!m) return;
      var key = m[1].toUpperCase();
      if (!(key in MALAY_MONTHS)) return;
      var nums = moneyTokens(row);
      if (nums.length < 2) return;
      var year = 2000 + parseInt(m[2], 10);
      var entry = {
        label: m[1] + '-' + m[2],
        monthIndex: MALAY_MONTHS[key],
        year: year,
        employer: nums[0].v,
        employee: nums.length >= 2 ? nums[1].v : 0,
        total: nums.length >= 3 ? nums[2].v : 0
      };
      found.push(entry);
      debug.push('month ' + entry.label + ' ahli=' + entry.employee);
    });

    var byKey = {};
    found.forEach(function (e) {
      var k = e.year * 12 + e.monthIndex;
      if (byKey[k]) {
        byKey[k].employer += e.employer;
        byKey[k].employee += e.employee;
        byKey[k].total += e.total;
        debug.push('summed duplicate rows for ' + e.label + ' ahli=' + byKey[k].employee);
      } else {
        byKey[k] = e;
      }
    });
    var months = Object.keys(byKey).map(Number).sort(function (a, b) { return a - b; })
      .map(function (k) { return byKey[k]; });
    return { months: months, name: epfName, ic: epfIC, debug: debug };
  }

  async function extractFromEPFStatement(file, suppliedRows) {
    var rows = suppliedRows || await getTextRows(file);
    assertHasText(rows, 'EPF/KWSP statement');
    var res = parseEPFRows(rows);
    console.log('[extractFromEPFStatement]', res.months, res.name, res.ic, res.debug);
    return res;
  }

  function mergeEPFMonths(results) {
    var byKey = {};
    results.forEach(function (res) {
      (res.months || []).forEach(function (e) {
        var k = e.year * 12 + e.monthIndex;
        if (!byKey[k] || e.employee > byKey[k].employee) byKey[k] = e;
      });
    });
    return Object.keys(byKey).map(Number).sort(function (a, b) { return a - b; })
      .map(function (k) { return byKey[k]; })
      .slice(-12);
  }

  var PAYSLIP_SKIP = /\b(EMPLOYER|MAJIKAN|CARRY|Y-?T-?D|YEAR\s+TO\s+DATE|SEHINGGA)\b/i;
  var PAYSLIP_SUMMARY = /\b(NET\s*(PAY|SALARY)|TAKE\s?HOME|GROSS\s*(EARNINGS?|SALARY|PAY)|TOTAL\s*(DEDUCTIONS?|POTONGAN)|JUMLAH\s*(POTONGAN|PENDAPATAN)|GAJI\s*BERSIH)\b/i;

  var PAYSLIP_FIELDS = [
    { key: 'basic', add: false, side: 'earning', anchor: /\b(BASIC|SALARY|GAJI|POKOK|ASAS)\b/i,
      re: /\b(BASIC(\s+(SALARY|PAY|WAGE))?|GAJI\s+(POKOK|ASAS))\b/i },
    { key: 'ot', add: true, side: 'earning', anchor: /\b(OVERTIME|OT|LEBIH|MASA)\b/i,
      re: /\b(OVER\s?TIME|\bOT\b|(KERJA\s+)?LEBIH\s+MASA)\b/i },
    { key: 'commission', add: true, side: 'earning', anchor: /\b(COMMISSION|KOMISEN|KOMISYEN)\b/i,
      re: /\b(COMMISSIONS?|KOMIS[EY]N)\b/i },
    { key: 'fixedAllowance', add: true, side: 'earning', anchor: /\b(FIXED|ALLOWANCE|ELAUN|TUNJANGAN|COLA|TETAP)\b/i,
      re: /\b(FIXED\s+ALLOWANCE|ELAUN\s+TETAP|ALLOWANCE|ELAUN|TUNJANGAN|\bCOLA\b)\b/i },
    { key: 'other', add: true, side: 'earning', anchor: /\b(OTHER|BONUS|CLAIM|TUNTUTAN|INCENTIVE|INSENTIF|PENDAPATAN)\b/i,
      re: /\b(OTHER\s+INCOME|LAIN[-\s]?LAIN\s+PENDAPATAN|BONUS|CLAIMS?|TUNTUTAN|INCENTIVES?|INSENTIF)\b/i },
    { key: 'epf', add: false, side: 'deduction', anchor: /\b(EPF|KWSP|PROVIDENT)\b/i,
      re: /\b(EMPLOYEE\s+EPF|EPF|KWSP|EMPLOYEES?\s+PROVIDENT)\b/i },
    { key: 'pcb', add: false, side: 'deduction', anchor: /\b(PCB|MTD|TAX|CUKAI|ZAKAT)\b/i,
      re: /\b(PCB|MTD|POTONGAN\s+CUKAI|INCOME\s+TAX|\bTAX\b|ZAKAT|CUKAI)\b/i },
    { key: 'socso', add: false, side: 'deduction', anchor: /\b(SOCSO|PERKESO)\b/i,
      re: /\b(EMPLOYEE\s+SOCSO|SOCSO|PERKESO)\b/i },
    { key: 'eis', add: false, side: 'deduction', anchor: /\b(EIS|SIP|INSURANCE)\b/i,
      re: /\b(EIS|SIP|EMPLOYMENT\s+INSURANCE)\b/i }
  ];

  function payMoney(tok) {
    var t = String(tok).trim();
    if (!/^-?(\d{1,3}(,\d{3})+(\.\d{1,2})?|\d+(\.\d{1,2})?)$/.test(t)) return null;
    var v = parseFloat(t.replace(/,/g, ''));
    return isFinite(v) ? Math.abs(v) : null;
  }
  function payMoneyTokens(row) {
    var out = [];
    (row.items || []).forEach(function (it, i) {
      var v = payMoney(it.str);
      if (v !== null) out.push({ v: v, x: it.x, i: i, raw: it.str });
    });
    return out;
  }
  function fieldX(row, fld) {
    if (!fld.re.test(row.text || '')) return null;
    var x = null;
    (row.items || []).forEach(function (it) {
      if (fld.anchor.test(it.str)) x = x === null ? it.x : Math.max(x, it.x);
    });
    return x;
  }
  function pickFieldAmount(row, toks, fld, layout, consumed) {
    var lx = fieldX(row, fld);
    if (lx === null) return null;
    var endX = fld.side === 'earning' && layout.sideBySide && layout.deductionX !== null
      ? layout.deductionX : Infinity;

    (row.items || []).forEach(function (it) {
      if (it.x > lx && payMoney(it.str) === null && it.x < endX) endX = it.x;
    });
    var candidates = toks.filter(function (t) {
      if (consumed[t.i] || t.x <= lx || t.x >= endX) return false;
      if (fld.side === 'deduction' && layout.ytdX !== null && t.x >= layout.ytdX) return false;
      return true;
    });
    if (!candidates.length) return null;

    candidates.sort(function (a, b) { return a.x - b.x; });
    return fld.side === 'earning' ? candidates[candidates.length - 1] : candidates[0];
  }

  var PAY_MONTHS = { JAN:0, FEB:1, MAR:2, MAC:2, APR:3, MAY:4, MEI:4, JUN:5,
                     JUL:6, AUG:7, OGO:7, OGS:7, OGOS:7, SEP:8, SEPT:8, OCT:9, OKT:9,
                     NOV:10, DEC:11, DIS:11, DISEMBER:11 };
  function detectPayMonth(rows) {
    for (var i = 0; i < rows.length; i++) {
      var text = rows[i].text || '';
      var m = text.match(/\b([A-Za-z]{3,9})[-\s\/]?(\d{4}|\d{2})\b/);
      if (m && (m[1].toUpperCase() in PAY_MONTHS)) {
        var yr = m[2].length === 2 ? 2000 + parseInt(m[2], 10) : parseInt(m[2], 10);
        return { label: m[1].toUpperCase() + '-' + String(yr).slice(-2),
                 monthIndex: PAY_MONTHS[m[1].toUpperCase()], year: yr };
      }
      m = text.match(/\b(\d{1,2})[\/\-.](\d{4})\b/);
      if (m && +m[1] >= 1 && +m[1] <= 12) {
        return { label: String(m[1]).padStart(2, '0') + '-' + m[2].slice(-2),
                 monthIndex: +m[1] - 1, year: +m[2] };
      }
    }
    return null;
  }
  function payslipLayout(rows) {
    var byPage = {};
    rows.forEach(function (row) {
      var page = row.page || 1;
      byPage[page] = byPage[page] || { deductionX: null, deductionY: null,
        earningY: null, sideBySide: false, ytdX: null, statutoryY: null, summaryY: null };
      var l = byPage[page];
      (row.items || []).forEach(function (it) {
        var t = String(it.str || '').toUpperCase();
        var head = t.replace(/[^A-Z]/g, '');
        if (head === 'DEDUCTION' || head === 'DEDUCTIONS') {
          l.deductionX = l.deductionX === null ? it.x : Math.min(l.deductionX, it.x);
          l.deductionY = row.y;
        }
        if (head === 'EARNING' || head === 'EARNINGS') l.earningY = row.y;
        if (/\bSTATUTORY\b/.test(t)) l.statutoryY = row.y;
      });
      if (PAYSLIP_SUMMARY.test(row.text || '')) {
        l.summaryY = l.summaryY === null ? row.y : Math.max(l.summaryY, row.y);
      }
    });
    Object.keys(byPage).forEach(function (page) {
      var l = byPage[page];
      l.sideBySide = l.earningY !== null && l.deductionY !== null &&
        Math.abs(l.earningY - l.deductionY) <= 5;

      rows.forEach(function (row) {
        if ((row.page || 1) !== +page) return;
        if (l.statutoryY !== null && row.y <= l.statutoryY) return;
        (row.items || []).forEach(function (it) {
          if (/\b(YTD|YEAR\s+TO\s+DATE)\b/i.test(it.str)) {
            l.ytdX = l.ytdX === null ? it.x : Math.min(l.ytdX, it.x);
          }
        });
      });
    });
    return byPage;
  }
  function isDeductionRow(row, layout) {
    if (layout.sideBySide) return true;
    if (layout.deductionY === null || row.y == null) return false;
    return row.y < layout.deductionY && (layout.summaryY === null || row.y > layout.summaryY);
  }
  function isEarningRow(row, layout) {
    if (row.y == null || layout.earningY === null) return false;
    if (layout.sideBySide) return row.y < layout.earningY &&
      (layout.summaryY === null || row.y > layout.summaryY);
    if (layout.deductionY !== null) return row.y < layout.earningY && row.y > layout.deductionY;
    return false;
  }
  function summaryAmount(row, labelRe, nextLabelRe) {
    var items = row.items || [], start = null, end = Infinity;
    for (var i = 0; i < items.length; i++) {
      if (labelRe.test(items[i].str)) start = items[i].x;
      else if (start !== null && nextLabelRe && nextLabelRe.test(items[i].str)) { end = items[i].x; break; }
    }
    if (start === null) return null;
    var vals = items.filter(function (it) {
      return it.x > start && it.x < end && payMoney(it.str) !== null;
    }).map(function (it) { return payMoney(it.str); });
    return vals.length ? vals[0] : null;
  }

  function parsePayslipRows(rows) {
    rows = rows || [];
    var debug = [], lineItems = [];
    var r = { basic: 0, fixedAllowance: 0, other: 0, commission: 0, ot: 0,
      epf: 0, pcb: 0, socso: 0, eis: 0, otherDeduction: 0,
      grossPay: null, totalDeduction: null, netPay: null,
      employeeName: '', ic: '', monthLabel: '', monthIndex: null, year: null,
      debug: debug, lineItems: lineItems };
    var layouts = payslipLayout(rows), seen = {};
    var summaryRows = [];
    rows.forEach(function (row) {
      var text = String(row.text || '');
      var page = row.page || 1, layout = layouts[page] || { deductionX: null,
        deductionY: null, earningY: null, sideBySide: false, ytdX: null,
        statutoryY: null, summaryY: null };

      var name = text.match(/\bEMPLOYEE\s+NAME\s*:?\s*(.+?)(?=\s{2,}|\s+(?:DEPARTMENT|POSITION|I\/?C\s+NO)\b|$)/i);
      if (name && !r.employeeName) r.employeeName = name[1].trim();
      var ic = text.match(/\bI\/?C\s+NO\.?\s*:?\s*([\d-]{6,})/i);
      if (ic && !r.ic) r.ic = ic[1].replace(/\D/g, '');
      if (/\b(GROSS\s*(EARNINGS?|PAY)|TOTAL\s*DEDUCTIONS?|NET\s*PAY|GAJI\s*BERSIH)\b/i.test(text)) summaryRows.push(row);

      if (layout.statutoryY !== null && row.y <= layout.statutoryY) return;
      if (PAYSLIP_SKIP.test(text)) return;
      var toks = payMoneyTokens(row);
      if (!toks.length) return;
      var consumed = {};
      var knownEarning = false, knownDeduction = false;
      PAYSLIP_FIELDS.forEach(function (fld) {
        if (!fld.re.test(text)) return;
        if (fld.side === 'earning') knownEarning = true;
        else knownDeduction = true;
        var pick = pickFieldAmount(row, toks, fld, layout, consumed);
        if (!pick || pick.v === 0) return;
        consumed[pick.i] = true;
        if (fld.add) r[fld.key] += pick.v;
        else if (!seen[fld.key]) { r[fld.key] = pick.v; seen[fld.key] = true; }
        lineItems.push({ key: fld.key, value: pick.v, label: text.slice(0, 100), confidence: 1 });
        debug.push(fld.key + (fld.add ? ' +=' : ' =') + pick.v + ' [' + text.slice(0, 42) + ']');
      });

      if (!knownEarning && isEarningRow(row, layout) && !PAYSLIP_SUMMARY.test(text)) {
        var earnings = toks.filter(function (t) {
          if (consumed[t.i] || (layout.ytdX !== null && t.x >= layout.ytdX)) return false;
          return !layout.sideBySide || layout.deductionX === null || t.x < layout.deductionX;
        });
        if (earnings.length) {
          var earning = earnings[earnings.length - 1];
          r.other += earning.v;
          consumed[earning.i] = true;
          lineItems.push({ key: 'other', value: earning.v, label: text.slice(0, 100), confidence: 1 });
          debug.push('other += ' + earning.v + ' [' + text.slice(0, 42) + ']');
        }
      }

      if (!knownDeduction && isDeductionRow(row, layout) && !PAYSLIP_SUMMARY.test(text)) {
        var remaining = toks.filter(function (t) {
          if (consumed[t.i] || (layout.ytdX !== null && t.x >= layout.ytdX)) return false;
          return !layout.sideBySide || layout.deductionX === null || t.x >= layout.deductionX;
        });
        if (remaining.length) {
          var extra = remaining[remaining.length - 1];
          r.otherDeduction += extra.v;
          consumed[extra.i] = true;
          lineItems.push({ key: 'otherDeduction', value: extra.v, label: text.slice(0, 100), confidence: 1 });
          debug.push('otherDeduction +=' + extra.v + ' [' + text.slice(0, 42) + ']');
        }
      }
    });

    summaryRows.forEach(function (row) {
      var g = summaryAmount(row, /GROSS\s*(EARNINGS?|PAY)/i, /TOTAL\s*DEDUCTIONS?/i);
      var d = summaryAmount(row, /TOTAL\s*DEDUCTIONS?/i, /NET\s*PAY/i);
      var n = summaryAmount(row, /NET\s*PAY/i, null);
      if (g !== null) r.grossPay = g;
      if (d !== null) r.totalDeduction = d;
      if (n !== null) r.netPay = n;
    });

    summaryRows.forEach(function (row) {
      var toks = payMoneyTokens(row), text = row.text || '';
      if (r.grossPay === null && /GROSS\s*(EARNINGS?|PAY)/i.test(text) && toks.length) r.grossPay = toks[toks.length - 1].v;
      if (r.totalDeduction === null && /TOTAL\s*DEDUCTIONS?/i.test(text) && toks.length) r.totalDeduction = toks[toks.length - 1].v;
      if (r.netPay === null && /NET\s*PAY/i.test(text) && toks.length) r.netPay = toks[toks.length - 1].v;
    });
    var mo = detectPayMonth(rows);
    if (mo) { r.monthLabel = mo.label; r.monthIndex = mo.monthIndex; r.year = mo.year; }
    return r;
  }

  function payslipReconciliation(r) {
    var deductions = (r.epf || 0) + (r.pcb || 0) + (r.socso || 0) +
      (r.eis || 0) + (r.otherDeduction || 0);

    var extractedGross = (r.basic || 0) + (r.fixedAllowance || 0) +
      (r.other || 0) + (r.commission || 0) + (r.ot || 0);
    var expectedNet = extractedGross - deductions;
    var delta = r.netPay == null ? null : Math.round((expectedNet - r.netPay) * 100) / 100;
    var grossDelta = r.grossPay == null ? null : Math.round((extractedGross - r.grossPay) * 100) / 100;
    var totalDelta = r.totalDeduction == null
      ? null : Math.round((deductions - r.totalDeduction) * 100) / 100;
    return { gross: extractedGross, printedGross: r.grossPay, employeeDeductions: deductions,
      expectedNet: expectedNet, printedNet: r.netPay, netDifference: delta,
      grossDifference: grossDelta, printedDeductionTotal: r.totalDeduction,
      deductionDifference: totalDelta, reconciles: delta !== null && Math.abs(delta) < 0.01 &&
        (grossDelta === null || Math.abs(grossDelta) < 0.01) &&
        (totalDelta === null || Math.abs(totalDelta) < 0.01) };
  }

  function payslipEmpty(r) {
    return !(r.basic || r.fixedAllowance || r.other || r.commission || r.ot ||
      r.epf || r.pcb || r.socso || r.eis || r.otherDeduction);
  }

  async function extractPayslip(file, suppliedRows) {
    var rows = suppliedRows || await getTextRows(file);
    var r = parsePayslipRows(rows);
    r.reconciliation = payslipReconciliation(r);
    return r;
  }

  Engine.pdfAvailable = pdfAvailable;
  Engine.extractFromExperian = extractFromExperian;
  Engine.parseExperianRows = parseExperianRows;
  Engine.parseBankCCRISRows = parseBankCCRISRows;
  Engine.extractTextRows = getTextRows;
  Engine.extractFromEPFStatement = extractFromEPFStatement;
  Engine.isEPFStatementRows = isEPFStatementRows;
  Engine.parseEPFRows = parseEPFRows;
  Engine.mergeEPFMonths = mergeEPFMonths;
  Engine.parsePayslipRows = parsePayslipRows;
  Engine.payslipReconciliation = payslipReconciliation;
  Engine.extractPayslip = extractPayslip;
  Engine.payslipEmpty = payslipEmpty;
})();
