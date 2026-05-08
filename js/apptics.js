/* ============================================================
   Lyf — apptics.js
   Zoho Apptics JS SDK wrapper.
   - Persistent device ID (fixes "every refresh = new device")
   - Safe appticsReady guard (SDK may not be loaded yet)
   - trackScreen, track, nonFatal, log, openFeedback
   - JS errors captured immediately (not deferred to SDK ready)
   - API fetch interception (race-condition-free)
   - Scroll depth + time on page
   ============================================================ */

/* ── Step 1: Persistent device ID (run before SDK loads) ──── */
/* Must be an IIFE outside the Apptics wrapper so it runs
   synchronously before anything else in this file.           */
(function () {
  var DK = 'lyf_device_id';
  var VK = 'lyf_device_seen';
  var did = null;
  var isNew = false;

  try {
    did = localStorage.getItem(DK);
    if (!did) {
      did = 'lyf-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem(DK, did);
    }
    isNew = !localStorage.getItem(VK);
    localStorage.setItem(VK, '1');
  } catch (e) {
    /* localStorage blocked (private browsing) — use in-memory ID */
    did = 'lyf-mem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    isNew = true;
  }

  window.__lyfDeviceId    = did;
  window.__lyfIsNewDevice = isNew;
})();

/* ── Apptics wrapper ─────────────────────────────────────── */
var Apptics = (function () {
  'use strict';

  /* ── Safe appticsReady guard ────────────────────────────── */
  /* window.appticsReady may not exist if the SDK script hasn't
     been injected yet. This wrapper queues calls safely.     */
  function ready(fn) {
    if (typeof window.appticsReady !== 'function') {
      /* SDK script not injected yet — wait for load */
      window.addEventListener('load', function () {
        if (typeof window.appticsReady === 'function') {
          window.appticsReady(fn);
        } else {
          fn(); /* SDK unavailable — run with stubs */
        }
      });
      return;
    }
    /* If SDK is already initialised, run immediately to avoid re-entrant queuing */
    if (window.appticsReadyStatus) {
      fn();
    } else {
      window.appticsReady(fn);
    }
  }

  /* ── Init ───────────────────────────────────────────────── */
  function init() {
    ready(function () {
      /* CONFIRMED: enable tracking */
      if (window.apptics && typeof apptics.setTrackingStatus === 'function') {
        apptics.setTrackingStatus(apptics.AP_TRACKING_STATUS.ENABLED);
      }

      /* STUB: tie persistent device ID to session */
      _setUser(window.__lyfDeviceId);

      /* STUB: first vs returning visit event */
      if (window.__lyfIsNewDevice) {
        _addEvent('first_visit', 'acquisition', {});
      } else {
        _addEvent('returning_visit', 'acquisition', {});
      }

      /* STUB: remote log app boot */
      _log('Lyf boot | device=' + window.__lyfDeviceId
           + ' | new=' + window.__lyfIsNewDevice
           + ' | page=' + window.location.pathname);
    });
  }

  /* ── Screen tracking ────────────────────────────────────── */
  function trackScreen(screenName) {
    ready(function () {
      if (window.apptics && typeof apptics.trackPageView === 'function') {
        apptics.trackPageView(screenName);
      } else {
        console.info('[Apptics] stub trackScreen:', screenName);
      }
    });
  }

  /* ── Event tracking ─────────────────────────────────────── */
  /* Renamed from 'event' to 'track' — avoids conflict with
     global DOM Event constructor in some environments.       */
  function track(name, group, props) {
    _addEvent(name, group, props);
  }

  /* ── Non-fatal error ────────────────────────────────────── */
  function nonFatal(name, message, props) {
    ready(function () {
      if (window.apptics && typeof apptics.logNonFatal === 'function') {
        apptics.logNonFatal(name, message, props || {});
      } else {
        console.warn('[Apptics] stub nonFatal:', name, '—', message);
      }
    });
  }

  /* ── Remote log ─────────────────────────────────────────── */
  function log(message) {
    _log(message);
  }

  /* ── In-app feedback ────────────────────────────────────── */
  function openFeedback() {
    ready(function () {
      if (window.apptics && typeof apptics.startFeedback === 'function') {
        apptics.startFeedback();
      } else {
        console.warn('[Apptics] stub openFeedback — method not confirmed for JS SDK yet');
      }
    });
  }

  /* ── API tracking (wraps fetch) ─────────────────────────── */
  /* Race-condition fix: startApiTracking is called synchronously
     inside the wrapped fetch — not inside a ready() callback.
     endApiTracking is best-effort inside ready().             */
  function setupApiTracking() {
    if (!window.fetch) return; /* fetch not available */
    var _fetch = window.fetch;

    window.fetch = function (url, opts) {
      var method = (opts && opts.method) || 'GET';
      var urlStr = url ? url.toString() : '';
      var t0 = Date.now();
      var tracker = null;

      /* Start tracking synchronously if SDK is already ready */
      if (window.apptics && typeof apptics.startApiTracking === 'function') {
        try { tracker = apptics.startApiTracking(urlStr, method); } catch (e) {}
      }

      return _fetch.apply(this, arguments)
        .then(function (res) {
          if (tracker && window.apptics && typeof apptics.endApiTracking === 'function') {
            try { apptics.endApiTracking(tracker, res.status, Date.now() - t0); } catch (e) {}
          }
          return res;
        })
        .catch(function (err) {
          nonFatal('APIError', urlStr + ' — ' + err.message, { method: method });
          throw err;
        });
    };
  }

  /* ── JS error capture ───────────────────────────────────── */
  /* Set up immediately — NOT inside ready() — so errors before
     SDK loads are still captured once SDK becomes available.  */
  function setupErrors() {
    window.addEventListener('error', function (e) {
      nonFatal(
        'JSError',
        (e.message || 'Unknown error') + ' @ ' + (e.filename || 'unknown') + ':' + (e.lineno || 0),
        { stack: e.error ? (e.error.stack || '') : '' }
      );
    });

    window.addEventListener('unhandledrejection', function (e) {
      nonFatal(
        'UnhandledRejection',
        e.reason ? e.reason.toString() : 'Unknown promise rejection',
        {}
      );
    });
  }

  /* ── Scroll depth ───────────────────────────────────────── */
  /* Depth marks defined once — not inside the scroll handler */
  var SCROLL_MARKS = [25, 50, 75, 100];
  function setupScrollDepth() {
    var fired = {};
    window.addEventListener('scroll', function () {
      var scrollable = Math.max(1, document.body.scrollHeight - window.innerHeight);
      var pct = Math.round((window.scrollY / scrollable) * 100);
      for (var i = 0; i < SCROLL_MARKS.length; i++) {
        var d = SCROLL_MARKS[i];
        if (pct >= d && !fired[d]) {
          fired[d] = true;
          track('scroll_depth_' + d, 'engagement', { depth: d });
        }
      }
    }, { passive: true });
  }

  /* ── Time on page ───────────────────────────────────────── */
  function setupTimeOnPage() {
    var t0 = Date.now();
    window.addEventListener('beforeunload', function () {
      var sec = Math.round((Date.now() - t0) / 1000);
      track('page_exit', 'engagement', { seconds: sec });
    });
  }

  /* ── Private stubs ──────────────────────────────────────── */
  function _setUser(deviceId) {
    ready(function () {
      if (window.apptics && typeof apptics.setUser === 'function') {
        apptics.setUser(deviceId);
      } else {
        console.info('[Apptics] stub setUser:', deviceId);
      }
    });
  }

  function _addEvent(name, group, props) {
    ready(function () {
      if (window.apptics && typeof apptics.addEvent === 'function') {
        apptics.addEvent(name, group || 'general', props || {});
      } else {
        console.info('[Apptics] stub event:', name, '/', group || 'general');
      }
    });
  }

  function _log(message) {
    ready(function () {
      if (window.apptics && typeof apptics.log === 'function') {
        apptics.log(message);
      } else {
        console.info('[Apptics] stub log:', message);
      }
    });
  }

  /* ── Boot ───────────────────────────────────────────────── */
  /* Error tracking starts immediately — before SDK is ready  */
  setupErrors();

  document.addEventListener('DOMContentLoaded', function () {
    init();
    setupScrollDepth();
    setupTimeOnPage();
    setupApiTracking();
  });

  /* ── Public API ─────────────────────────────────────────── */
  return {
    init:         init,
    trackScreen:  trackScreen,
    track:        track,
    /* Keep 'event' as alias for backwards compatibility
       with any existing calls in HTML onclick handlers    */
    event:        track,
    nonFatal:     nonFatal,
    log:          log,
    openFeedback: openFeedback
  };

})();
