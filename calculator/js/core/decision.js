/* ---------------- decision summary ---------------- */

(function () {
  'use strict';

  var CalculatorApp = window.App = window.App || {};
  var calculatorEngine = window.Engine;

  var ui = CalculatorApp.mod.ui;
  var formatCurrency = ui.formatCurrency;
  var formatPercent = ui.formatPercent;
  var DSR_DECIMALS = ui.DSR_DECIMALS;
  var escapeHtml = ui.escapeHtml;
  var getElementById = ui.getElementById;
  var verdictClass = ui.verdictClass;
  var verdictLabel = ui.verdictLabel;

  var getApplicantType = CalculatorApp.mod.applicants.applicantType;
  var getPersonalIncome = CalculatorApp.mod.applicants.applicantPersonalIncome;
  var getApplicantList = CalculatorApp.mod.applicants.hfApplicantList;

  function productPassed(verdict) {
    return verdict == null || verdict === '' ||
      verdict === calculatorEngine.VERDICT.OK ||
      verdict === calculatorEngine.VERDICT.ELIGIBLE;
  }

  CalculatorApp.combinedDecisionData = function (mode) {
    if (!CalculatorApp.computed.intakeReady) {
      return null;
    }

    var calculatedValues = CalculatorApp.computed;
    var calculatorState = CalculatorApp.state;

    var hasPersonalFinancing = mode.indexOf('pf') !== -1;
    var hasCreditCard = mode.indexOf('cc') !== -1;

    var personalFinancingTotal = 0;
    var personalFinancingByApplicant = {};
    var personalFinancingPassedByApplicant = {};

    if (hasPersonalFinancing) {
      if (mode === 'pf-hf') {
        CalculatorApp.runSeed('pf');
        (calculatorState.pf.apps || []).forEach(function (application) {
          var result = CalculatorApp.computePFApp(application);
          personalFinancingByApplicant[application.applicant] =
            (personalFinancingByApplicant[application.applicant] || 0) + result.instalment;
          personalFinancingTotal += result.instalment;

          var passed = result.verdict === calculatorEngine.VERDICT.OK ||
            result.verdict === calculatorEngine.VERDICT.ELIGIBLE;
          personalFinancingPassedByApplicant[application.applicant] =
            personalFinancingPassedByApplicant[application.applicant] !== false && passed;
        });
      } else {
        personalFinancingTotal = CalculatorApp.computePF().instalment;
        personalFinancingByApplicant.MAIN = personalFinancingTotal;
      }
    }

    var creditCardTotal = 0;
    var creditCardByApplicant = {};
    var creditCardPassedByApplicant = {};

    if (hasCreditCard) {
      if (mode === 'hf-cc') {
        CalculatorApp.runSeed('cc');
        (calculatorState.cc.cards || []).forEach(function (card) {
          var result = CalculatorApp.computeCCCard(card);
          creditCardByApplicant[card.applicant] =
            (creditCardByApplicant[card.applicant] || 0) + result.active.monthlyInstallment;
          creditCardTotal += result.active.monthlyInstallment;

          var passed = result.verdict === calculatorEngine.VERDICT.ELIGIBLE ||
            result.verdict === calculatorEngine.VERDICT.OK;
          creditCardPassedByApplicant[card.applicant] =
            creditCardPassedByApplicant[card.applicant] !== false && passed;
        });
      } else {
        creditCardTotal = CalculatorApp.computeCC().active.monthlyInstallment;
        creditCardByApplicant.MAIN = creditCardTotal;
      }
    }

    if (mode === 'hf-cc' || mode === 'pf-hf') {
      var homeFinancing = CalculatorApp.computeHF();
      var homeInstalment = homeFinancing.ctf !== 0 ? homeFinancing.ctf : homeFinancing.instalment;
      var applicants = getApplicantList();
      var applicantCount = applicants.length || 1;
      var homeShare = homeInstalment / applicantCount;

      var ownL57 = {};
      homeFinancing.perApplicant.forEach(function (applicantResult) {
        ownL57[applicantResult.key] = applicantResult.l57;
      });

      var applicantRows = applicants.map(function (applicant) {
        var isMain = applicant.key === 'MAIN';
        var personalIncome = getPersonalIncome(applicant.key);
        var existingCommitment = isMain
          ? calculatedValues.grandTotal
          : (ownL57[applicant.key] || 0);

        var personalFinancingShare = personalFinancingByApplicant[applicant.key] || 0;
        var creditCardShare = creditCardByApplicant[applicant.key] || 0;

        var newCommitment = homeShare + existingCommitment +
          personalFinancingShare + creditCardShare;
        var dsr = personalIncome.net > 0 ? newCommitment / personalIncome.net : 0;
        var threshold = calculatorEngine.hfThreshold(
          personalIncome.gross,
          getApplicantType(applicant.key)
        );

        var homePassed = dsr > 0 && dsr <= threshold;
        var personalFinancingPassed = personalFinancingPassedByApplicant[applicant.key] !== false;
        var creditCardPassed = creditCardPassedByApplicant[applicant.key] !== false;
        var allProductsPassed = personalFinancingPassed && creditCardPassed;
        var combinedPassed = homePassed && allProductsPassed;

        var buildParts = [['HF', homeShare]];
        var allProductCodes = ['HF'];
        var passingCodes = homePassed ? ['HF'] : [];

        if (personalFinancingShare) {
          buildParts.push(['PF', personalFinancingShare]);
          allProductCodes.push('PF');
          if (personalFinancingPassed) {
            passingCodes.push('PF');
          }
        }

        if (creditCardShare) {
          buildParts.push(['CC', creditCardShare]);
          allProductCodes.push('CC');
          if (creditCardPassed) {
            passingCodes.push('CC');
          }
        }

        var labelProducts = allProductsPassed
          ? allProductCodes
          : (passingCodes.length ? passingCodes : allProductCodes);
        var labelPassed = allProductsPassed
          ? combinedPassed
          : passingCodes.length > 0;

        return {
          key: applicant.key,
          name: applicant.name,
          build: buildParts,
          prods: allProductCodes,
          labelProds: labelProducts,
          ok: labelPassed,
          existing: existingCommitment,
          commit: newCommitment,
          net: personalIncome.net,
          dsr: dsr
        };
      });

      return {
        kind: 'per-applicant',
        mode: mode,
        hfInst: homeInstalment,
        N: applicantCount,
        rows: applicantRows
      };
    }

    if (mode === 'hf') {
      var homeResult = CalculatorApp.computeHF();
      var homeInstalmentAmount = homeResult.ctf !== 0 ? homeResult.ctf : homeResult.instalment;
      var homeNet = homeResult.income ? homeResult.income.netIncome : calculatedValues.netIncome;

      return {
        kind: 'single',
        mode: mode,
        multi: false,
        parts: [{
          code: 'HF',
          label: 'Home Financing',
          amount: homeInstalmentAmount,
          verdict: homeResult.verdict
        }],
        commitment: homeResult.newCommitment,
        dsr: homeResult.newDSR,
        ndi: homeNet - homeResult.newCommitment,
        verdict: homeResult.verdict,
        prods: ['HF'],
        labelProds: ['HF']
      };
    }

    var parts = [];
    var thresholds = [];
    var lastVerdict = null;

    if (hasPersonalFinancing) {
      var personalFinancing = CalculatorApp.computePF();
      thresholds.push(personalFinancing.threshold);
      parts.push({
        code: 'PF',
        label: 'Personal Financing',
        amount: personalFinancingTotal,
        verdict: personalFinancing.verdict
      });
      lastVerdict = personalFinancing.verdict;
    }

    if (hasCreditCard) {
      var creditCard = CalculatorApp.computeCC();
      thresholds.push(calculatorEngine.ccDsrThreshold(calculatedValues.grossIncome) / 100);
      parts.push({
        code: 'CC',
        label: 'Credit Card',
        amount: creditCardTotal,
        verdict: creditCard.verdict
      });
      lastVerdict = creditCard.verdict;
    }

    var validThresholds = thresholds.filter(function (threshold) {
      return threshold > 0;
    });
    var governingThreshold = validThresholds.length
      ? Math.min.apply(null, validThresholds)
      : 0;

    var isCombo = parts.length > 1;
    var allProductCodes = parts.map(function (part) { return part.code; });
    var allProductsPassed = parts.every(function (part) {
      return productPassed(part.verdict);
    });
    var passingParts = parts.filter(function (part) {
      return productPassed(part.verdict);
    });
    var passingCodes = passingParts.map(function (part) {
      return part.code;
    });

    var resultParts = (isCombo && !allProductsPassed && passingParts.length)
      ? passingParts
      : parts;
    var resultInstalments = resultParts.reduce(function (sum, part) {
      return sum + part.amount;
    }, 0);
    var newCommitment = calculatedValues.grandTotal + resultInstalments;
    var dsr = calculatedValues.netIncome > 0 ? newCommitment / calculatedValues.netIncome : 0;
    var ndi = calculatedValues.netIncome - newCommitment;
    var combinedDsrPassed = governingThreshold > 0 && dsr <= governingThreshold;

    var finalVerdict;
    var labelProducts;

    if (!isCombo) {
      finalVerdict = lastVerdict;
      labelProducts = allProductCodes;
    } else if (allProductsPassed) {

      finalVerdict = combinedDsrPassed
        ? calculatorEngine.VERDICT.OK
        : calculatorEngine.VERDICT.DSR_BURST;
      labelProducts = allProductCodes;
    } else if (passingCodes.length) {

      finalVerdict = calculatorEngine.VERDICT.OK;
      labelProducts = passingCodes;
    } else {
      finalVerdict = calculatorEngine.VERDICT.DSR_BURST;
      labelProducts = allProductCodes;
    }

    return {
      kind: 'single',
      mode: mode,
      multi: isCombo,
      parts: resultParts,
      commitment: newCommitment,
      dsr: dsr,
      ndi: ndi,
      verdict: finalVerdict,
      prods: resultParts.map(function (part) { return part.code; }),
      labelProds: labelProducts
    };
  };

  /* ---------------- banners ---------------- */
function buildPerApplicantBanner(decision) {
    var applicantRows = decision.rows.map(function (row) {
      var buildText = row.build.map(function (buildPart) {
        return buildPart[0] + ' ' + formatCurrency(buildPart[1]);
      });

      if (row.existing) {
        buildText.push('existing ' + formatCurrency(row.existing));
      }

      var labelProducts = row.labelProds || row.prods;
      var verdictText = (row.ok ? 'APPROVED ' : 'REJECTED ') + labelProducts.join(' + ');

      return '<div class="cb-person">' +
        '<div class="cb-who">' +
          '<div class="cb-name">' + escapeHtml(row.name) + '</div>' +
          '<div class="cb-build">' + buildText.join('  +  ') + '</div>' +
        '</div>' +
        '<div class="cb-metric"><span>New commitment</span><b>' + formatCurrency(row.commit) + '</b></div>' +
        '<div class="cb-metric"><span>Personal net</span><b>' + formatCurrency(row.net) + '</b></div>' +
        '<div class="cb-metric"><span>DSR</span><b class="cb-dsr">' + formatPercent(row.dsr, DSR_DECIMALS) + '</b></div>' +
        '<div class="cb-metric"><span class="verdict ' + (row.ok ? 'ok' : 'fail') + '">' + verdictText + '</span></div>' +
      '</div>';
    }).join('');

    return '<div class="combined-banner">' +
      '<div class="cb-title">Combined Application - per applicant &nbsp;&middot;&nbsp; home instalment ' +
      formatCurrency(decision.hfInst) + ' split &divide; ' + decision.N + '</div>' +
      applicantRows + '</div>';
  }

  function buildSingleBanner(decision) {
    var titlePrefix = decision.multi ? 'Combined Application - ' : 'Application Summary - ';
    var title = titlePrefix + decision.prods.join(' + ');

    var partsHtml = decision.parts.map(function (part) {

      var partVerdict = decision.multi ? ' (' + (verdictLabel(part.verdict) || '-') + ')' : '';
      return '<div class="cb-metric"><span>' + escapeHtml(part.label) + partVerdict + '</span>' +
        '<b>' + formatCurrency(part.amount) + '</b></div>';
    }).join('');

    var labelProducts = decision.labelProds || decision.prods;
    var decisionText = (verdictLabel(decision.verdict) || 'PENDING') + ' ' + labelProducts.join(' + ');
    var decisionClass = verdictClass(decision.verdict) || 'warn';

    return '<div class="combined-banner">' +
      '<div class="cb-title">' + escapeHtml(title) + '</div>' +
      '<div class="cb-single">' + partsHtml +
        '<div class="cb-metric"><span>New commitment</span><b>' + formatCurrency(decision.commitment) + '</b></div>' +
        '<div class="cb-metric"><span>New DSR</span><b class="cb-dsr">' + formatPercent(decision.dsr, DSR_DECIMALS) + '</b></div>' +
        '<div class="cb-metric"><span>NDI</span><b>' + formatCurrency(decision.ndi) + '</b></div>' +
        '<div class="cb-metric"><span class="verdict ' + decisionClass + '">' + decisionText + '</span></div>' +
      '</div></div>';
  }

  CalculatorApp.refreshCombined = function (mode) {
    var panel = getElementById('combined-panel');
    if (!panel) {
      return;
    }

    var decision = CalculatorApp.combinedDecisionData(mode);
    if (!decision) {
      panel.innerHTML = '';
      return;
    }

    panel.innerHTML = decision.kind === 'per-applicant'
      ? buildPerApplicantBanner(decision)
      : buildSingleBanner(decision);
  };

  CalculatorApp.mod = CalculatorApp.mod || {};
  CalculatorApp.mod.decision = {
    perApplicantBanner: buildPerApplicantBanner,
    singleBanner: buildSingleBanner
  };
})();
