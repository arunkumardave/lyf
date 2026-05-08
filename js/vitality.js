/* ============================================================
   Lyf — vitality.js
   Vitality Score (0–100) across 5 pillars with time decay.

   Each pillar max: 20 pts
   Decay: today × 0.6 + yesterday × 0.3 + 2 days ago × 0.1
   Baseline for new users: 30
   ============================================================ */

var LyfVitality = (function () {
  'use strict';

  var BASELINE = 30;

  /* ── Safe Object.values polyfill ─────────────────────────── */
  /* Object.values() is ES2017 — not safe on older mobile browsers */
  function objValues(obj) {
    return Object.keys(obj).map(function (k) { return obj[k]; });
  }

  /* ── Date helpers ────────────────────────────────────────── */
  function dateStr(daysAgo) {
    var d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toDateString();
  }

  function getLog(prefix, daysAgo) {
    try {
      return JSON.parse(localStorage.getItem(prefix + '_' + dateStr(daysAgo)) || '{}');
    } catch (e) {
      return {};
    }
  }

  function getStr(key, daysAgo) {
    return localStorage.getItem(key + '_' + dateStr(daysAgo)) || '';
  }

  /* ── Per-pillar scoring ──────────────────────────────────── */

  function scoreFitness(daysAgo) {
    var pts = 0;
    var ex    = getLog('lyf_ex',    daysAgo);
    var meals = getLog('lyf_meals', daysAgo);
    var water = parseInt(getStr('lyf_w', daysAgo) || '0', 10);

    /* Workout: 1pt per exercise completed, max 6 */
    var exDone = objValues(ex).filter(Boolean).length;
    pts += Math.min(6, exDone);

    /* Water: proportional up to 4pts (12 glasses = full) */
    pts += Math.min(4, Math.floor((water / 12) * 4));

    /* Meals logged: 1pt per meal, max 6 */
    var mealsDone = objValues(meals).filter(Boolean).length;
    pts += Math.min(6, mealsDone);

    /* Note: checklist item 0 removed — water tracked above,
       no double-counting. Remaining 4pts available via full
       water goal (already rewarded proportionally).         */

    return Math.min(20, pts);
  }

  function scoreMind(daysAgo) {
    var pts = 0;
    var mood    = getStr('lyf_mood',    daysAgo);
    var sleep   = getLog('lyf_sleep',   daysAgo);
    var journal = getStr('lyf_journal', daysAgo);
    var breath  = getStr('lyf_breath',  daysAgo);

    /* Mood logged */
    if (mood) pts += 4;

    /* Sleep: 6pts for 7h+, partial 3pts for any logged sleep */
    if (sleep.duration && parseFloat(sleep.duration) >= 7) pts += 6;
    else if (sleep.duration)                                pts += 3;

    /* Journal entry (min 10 chars to avoid trivial saves) */
    if (journal && journal.length > 10) pts += 5;

    /* Breathing exercise completed */
    if (breath) pts += 5;

    return Math.min(20, pts);
  }

  function scoreJoy(daysAgo) {
    var pts = 0;
    var gratitude = getStr('lyf_gratitude', daysAgo);
    var joy       = getLog('lyf_joy',       daysAgo);
    var detox     = getStr('lyf_detox',     daysAgo);
    var plan      = getStr('lyf_plan',      daysAgo);

    /* Gratitude entry (min 3 chars) */
    if (gratitude && gratitude.length > 2) pts += 6;

    /* At least one joy activity selected */
    if (objValues(joy).filter(Boolean).length > 0) pts += 4;

    /* Detox challenge completed */
    if (detox) pts += 6;

    /* Future plan added */
    if (plan) pts += 4;

    return Math.min(20, pts);
  }

  function scoreNature(daysAgo) {
    var pts = 0;
    var sunwalk   = getStr('lyf_sunwalk',   daysAgo);
    var outdoor   = getStr('lyf_outdoor',   daysAgo);
    var circadian = getStr('lyf_circadian', daysAgo);

    if (sunwalk)   pts += 8;
    if (outdoor)   pts += 6;
    if (circadian) pts += 6;

    return Math.min(20, pts);
  }

  function scoreConnect(daysAgo) {
    var pts = 0;
    var social    = getStr('lyf_social',     daysAgo);
    var nudge     = getStr('lyf_nudge',      daysAgo);
    var mealSocial = getStr('lyf_mealsocial', daysAgo);

    if (social)     pts += 8;
    if (nudge)      pts += 6;
    if (mealSocial) pts += 6;

    return Math.min(20, pts);
  }

  /* ── Breakdown for today only ────────────────────────────── */
  /* Returns per-pillar pts — used by sidebar bars and persist */
  function breakdown() {
    return {
      fitness: scoreFitness(0),
      mind:    scoreMind(0),
      joy:     scoreJoy(0),
      nature:  scoreNature(0),
      connect: scoreConnect(0)
    };
  }

  /* ── Total score for a given day offset ─────────────────── */
  function scoreDay(daysAgo) {
    return scoreFitness(daysAgo)
         + scoreMind(daysAgo)
         + scoreJoy(daysAgo)
         + scoreNature(daysAgo)
         + scoreConnect(daysAgo);
  }

  /* ── Compute with decay ──────────────────────────────────── */
  /* Avoids redundant pillar calls: breakdown() is computed
     once for today; yesterday and 2-days-ago use scoreDay()  */
  function compute() {
    var todayBreakdown = breakdown();
    var todayTotal = todayBreakdown.fitness + todayBreakdown.mind
                   + todayBreakdown.joy + todayBreakdown.nature
                   + todayBreakdown.connect;

    var yesterday = scoreDay(1);
    var twoDays   = scoreDay(2);

    var raw = (todayTotal * 0.6) + (yesterday * 0.3) + (twoDays * 0.1);

    /* Baseline for users who haven't done anything yet */
    var hasAnyActivity = todayTotal > 0 || yesterday > 0 || twoDays > 0;
    var score = hasAnyActivity ? Math.round(raw) : BASELINE;

    return Math.max(0, Math.min(100, score));
  }

  /* ── Save today's computed score to localStorage ─────────── */
  function persist() {
    /* compute() uses breakdown() internally — call breakdown()
       directly here to avoid computing it twice              */
    var b = breakdown();
    var total = b.fitness + b.mind + b.joy + b.nature + b.connect;
    var yesterday = scoreDay(1);
    var twoDays   = scoreDay(2);
    var raw = (total * 0.6) + (yesterday * 0.3) + (twoDays * 0.1);
    var hasAnyActivity = total > 0 || yesterday > 0 || twoDays > 0;
    var score = Math.max(0, Math.min(100,
      hasAnyActivity ? Math.round(raw) : BASELINE
    ));

    try {
      localStorage.setItem('lyf_vitality_' + new Date().toDateString(), JSON.stringify({
        date:    new Date().toISOString(),
        total:   score,
        fitness: b.fitness,
        mind:    b.mind,
        joy:     b.joy,
        nature:  b.nature,
        connect: b.connect
      }));
    } catch (e) {
      console.warn('[LyfVitality] persist failed:', e);
    }

    return score;
  }

  /* ── Public API ──────────────────────────────────────────── */
  return {
    compute:   compute,
    breakdown: breakdown,
    persist:   persist
  };

})();
