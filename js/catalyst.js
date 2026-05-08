/* ============================================================
   Lyf — catalyst.js
   Zoho Catalyst DataStore integration.
   Currently mirrors to localStorage (prototype mode).
   When Catalyst Auth is added:
     1. Set PROJECT_ID from Catalyst console
     2. Implement getToken() to return OAuth token
     3. All remote calls will activate automatically

   Load order: must load after profile.js and vitality.js
   ============================================================ */

var LyfCatalyst = (function () {
  'use strict';

  /* ── Config ──────────────────────────────────────────────── */
  /* TODO: set PROJECT_ID from Catalyst Console → Settings     */
  var PROJECT_ID = '27298000000013001'; /* Lyf — Catalyst Project ID */
  var BASE_URL   = PROJECT_ID
    ? 'https://api.catalyst.zoho.com/baas/v1/project/' + PROJECT_ID
    : '';

  /* ── Auth token (from Catalyst Auth — future) ────────────── */
  function getToken() {
    return localStorage.getItem('lyf_catalyst_token') || null;
  }

  /* ── Is remote enabled? ──────────────────────────────────── */
  /* Remote calls only happen when PROJECT_ID and token exist  */
  function isRemoteEnabled() {
    return BASE_URL !== '' && getToken() !== null;
  }

  /* ── Generic DataStore write ─────────────────────────────── */
  function insert(tableName, data, onSuccess, onError) {
    /* Always mirror to localStorage first */
    _localInsert(tableName, data);

    if (!isRemoteEnabled()) {
      if (onSuccess) onSuccess({ status: 'local', data: data });
      return;
    }

    fetch(BASE_URL + '/table/' + tableName + '/row', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Zoho-oauthtoken ' + getToken()
      },
      body: JSON.stringify({ data: [data] })
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (errBody) {
            var msg = errBody && errBody.message ? errBody.message : 'HTTP ' + res.status;
            throw new Error(msg);
          }).catch(function () {
            throw new Error('HTTP ' + res.status);
          });
        }
        return res.json();
      })
      .then(function (resp) {
        if (onSuccess) onSuccess(resp);
      })
      .catch(function (err) {
        console.warn('[LyfCatalyst] insert failed (local mirror retained):', err.message);
        /* Data is already in localStorage — don't call onError to block the UI */
        if (onError) onError(err);
      });
  }

  /* ── Generic DataStore read ──────────────────────────────── */
  function query(tableName, filters, onSuccess, onError) {
    if (!isRemoteEnabled()) {
      var local = _localRead(tableName);
      if (onSuccess) onSuccess({ status: 'local', data: local });
      return;
    }

    var url = BASE_URL + '/table/' + tableName + '/row';
    if (filters) url += '?' + filters;

    fetch(url, {
      headers: { 'Authorization': 'Zoho-oauthtoken ' + getToken() }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (resp) {
        if (onSuccess) onSuccess(resp);
      })
      .catch(function (err) {
        console.warn('[LyfCatalyst] query failed, falling back to local:', err.message);
        var local = _localRead(tableName);
        if (onSuccess) onSuccess({ status: 'local', data: local });
      });
  }

  /* ── Profile-specific helpers ────────────────────────────── */
  function saveProfile(data, onSuccess, onError) {
    LyfProfile.save(data);
    insert('UserProfile', data, onSuccess, onError);
  }

  function saveInBody(data, onSuccess, onError) {
    LyfProfile.saveInBody(data);
    insert('InBodyData', data, onSuccess, onError);
  }

  function saveDailyLog(data, onSuccess, onError) {
    /* Renamed 'log' → 'entry' to avoid shadowing console.log */
    var entry = Object.assign({ log_date: new Date().toISOString() }, data);
    insert('DailyLog', entry, onSuccess, onError);
  }

  function saveVitality(onSuccess, onError) {
    /* Use breakdown() directly — persist() calls it internally
       too, so calling both would duplicate pillar scoring.    */
    var b = LyfVitality.breakdown();
    var total = b.fitness + b.mind + b.joy + b.nature + b.connect;

    /* Still call persist() to save to localStorage */
    LyfVitality.persist();

    insert('VitalityHistory', {
      log_date:    new Date().toISOString(),
      total_score: total,
      fitness_pts: b.fitness,
      mind_pts:    b.mind,
      joy_pts:     b.joy,
      nature_pts:  b.nature,
      connect_pts: b.connect
    }, onSuccess, onError);
  }

  /* ── localStorage mirror ─────────────────────────────────── */
  function _localInsert(table, data) {
    try {
      var existing = JSON.parse(localStorage.getItem('lyf_ds_' + table) || '[]');
      /* Clone to avoid mutating the caller's object */
      var entry = Object.assign({}, data, { _inserted_at: new Date().toISOString() });
      existing.push(entry);
      /* Cap at 100 rows per table to stay within localStorage limits */
      if (existing.length > 100) existing = existing.slice(-100);
      localStorage.setItem('lyf_ds_' + table, JSON.stringify(existing));
    } catch (e) {
      console.warn('[LyfCatalyst] _localInsert failed:', e);
    }
  }

  function _localRead(table) {
    try {
      return JSON.parse(localStorage.getItem('lyf_ds_' + table) || '[]');
    } catch (e) {
      return [];
    }
  }

  /* ── Public API ──────────────────────────────────────────── */
  return {
    insert:       insert,
    query:        query,
    saveProfile:  saveProfile,
    saveInBody:   saveInBody,
    saveDailyLog: saveDailyLog,
    saveVitality: saveVitality,
    isRemoteEnabled: isRemoteEnabled
  };

})();
