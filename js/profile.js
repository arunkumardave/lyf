/* ============================================================
   Lyf — profile.js
   All localStorage read/write for user profile + InBody data
   ============================================================ */

var LyfProfile = (function () {
  'use strict';

  var PROFILE_KEY = 'lyf_profile';
  var INBODY_KEY  = 'lyf_inbody';

  var GOAL_LABELS = {
    lose_fat:     'Lose fat',
    build_muscle: 'Build muscle',
    more_energy:  'More energy',
    feel_healthy: 'Feel healthier'
  };

  var GENDER_LABELS = {
    male:       'Male',
    female:     'Female',
    prefer_not: 'Prefer not to say'
  };

  /* ── Profile ─────────────────────────────────────────────── */
  function get() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function save(data) {
    try {
      var existing = get();
      var merged = Object.assign({}, existing, data);
      merged.updated_at = new Date().toISOString();
      localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
      return true;
    } catch (e) {
      console.warn('[LyfProfile] save failed:', e);
      return false;
    }
  }

  /* Soft reset — removes profile + onboarding flag only.
     Leaves theme, device ID, AI provider intact.          */
  function clear() {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(INBODY_KEY);
    localStorage.removeItem('lyf_onboarded');
  }

  /* Full reset — removes every key with the lyf_ prefix.
     Use on sign out or "delete all my data".              */
  function clearAll() {
    var keysToRemove = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf('lyf_') === 0) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(function (key) {
        localStorage.removeItem(key);
      });
    } catch (e) {
      console.warn('[LyfProfile] clearAll failed:', e);
    }
  }

  /* ── InBody data ─────────────────────────────────────────── */
  function getInBody() {
    try {
      return JSON.parse(localStorage.getItem(INBODY_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveInBody(data) {
    try {
      /* Clone to avoid mutating caller's object */
      var toSave = Object.assign({}, data);
      toSave.updated_at = new Date().toISOString();
      localStorage.setItem(INBODY_KEY, JSON.stringify(toSave));
      return true;
    } catch (e) {
      console.warn('[LyfProfile] saveInBody failed:', e);
      return false;
    }
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function goalLabel(key) {
    return GOAL_LABELS[key] || 'Feel healthier';
  }

  function genderLabel(key) {
    return GENDER_LABELS[key] || '';
  }

  function getInitials() {
    var name = (get().name || '').trim();
    return name.length > 0 ? name.charAt(0).toUpperCase() : 'A';
  }

  /* ── Daily log ───────────────────────────────────────────── */
  function getDailyKey(prefix) {
    return prefix + '_' + new Date().toDateString();
  }

  function getDailyLog(prefix) {
    try {
      return JSON.parse(localStorage.getItem(getDailyKey(prefix)) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveDailyLog(prefix, data) {
    try {
      localStorage.setItem(getDailyKey(prefix), JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ── Water ───────────────────────────────────────────────── */
  function getWater() {
    /* Explicit radix 10 to avoid octal parsing edge cases */
    return parseInt(localStorage.getItem('lyf_w_' + new Date().toDateString()) || '0', 10);
  }

  function saveWater(count) {
    localStorage.setItem('lyf_w_' + new Date().toDateString(), String(count));
  }

  /* ── Public API ──────────────────────────────────────────── */
  return {
    get:          get,
    save:         save,
    clear:        clear,
    clearAll:     clearAll,
    getInBody:    getInBody,
    saveInBody:   saveInBody,
    goalLabel:    goalLabel,
    genderLabel:  genderLabel,
    getInitials:  getInitials,
    getDailyLog:  getDailyLog,
    saveDailyLog: saveDailyLog,
    getWater:     getWater,
    saveWater:    saveWater
  };

})();
