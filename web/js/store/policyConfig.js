/* ============================================================
   policyConfig.js - calculation policy overrides (rates/thresholds
   edited on admin/settings.html). Replaces app/PolicyConfig.php.
   Single record in the JSON blob db.js manages, read by
   js/engine/config.js on every page that loads the calculator.
   ============================================================ */
(function () {
  'use strict';

  function raw() {
    var db = Db.load();
    return db.policyConfig || { config: {}, updated_by: null, updated_at: null };
  }

  function hasOverrides() {
    var c = raw().config;
    return !!(c && Object.keys(c).length);
  }

  /** @return decoded overrides, or null if none saved */
  function overrides() {
    var c = raw().config;
    return (c && Object.keys(c).length) ? c : null;
  }

  function save(overridesObj, userId) {
    var db = Db.load();
    db.policyConfig = {
      config: overridesObj && Object.keys(overridesObj).length ? overridesObj : {},
      updated_by: userId,
      updated_at: Db.now()
    };
    Db.save(db);
    Audit.log(userId, 'CONFIG_UPDATED', 'config', 1);
  }

  window.PolicyConfig = { raw: raw, hasOverrides: hasOverrides, overrides: overrides, save: save };
})();
