/* ============================================================
   Lyf — app.js
   Runs on every page. Boot sequence:
   1. Theme applied immediately (prevents flash)
   2. Auth guard on DOMContentLoaded
   3. Set nav avatar + greeting
   4. Vitality badge + streak dots
   5. Daily insight
   6. Credits easter egg (long press logo)

   Load order required in every HTML page:
     1. apptics.js   (Zoho Apptics + device ID)
     2. profile.js   (LyfProfile)
     3. vitality.js  (LyfVitality)
     4. app.js       (this file — depends on above three)
   ============================================================ */

(function () {
  'use strict';

  /* ── Pages that don't need the auth guard ── */
  var PUBLIC_PAGES = ['index.html', 'onboarding.html', ''];

  /* ── 1. Apply theme immediately (before DOM ready)
         Prevents flash of wrong theme on load            ── */
  (function applyThemeNow() {
    var saved = localStorage.getItem('lyf_theme') || 'light';
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  })();

  /* ── Full theme apply (updates UI elements too) ─────── */
  function applyTheme() {
    var saved = localStorage.getItem('lyf_theme') || 'light';
    var isDark = saved === 'dark';

    /* documentElement already set above — just sync UI */
    var btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';

    var toggle = document.getElementById('themeToggle');
    if (toggle) toggle.classList.toggle('on', isDark);

    var lbl = document.getElementById('themeLabel');
    if (lbl) lbl.textContent = 'Currently: ' + (isDark ? 'Dark' : 'Light');
  }

  window.toggleTheme = function () {
    var current = localStorage.getItem('lyf_theme') || 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('lyf_theme', next);
    /* Apply to documentElement immediately */
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    applyTheme();
    if (window.Apptics) Apptics.event('theme_toggle', 'settings', { theme: next });
  };

  /* ── Auth guard ─────────────────────────────────────── */
  function authGuard() {
    var page = window.location.pathname.split('/').pop();
    var isPublic = PUBLIC_PAGES.indexOf(page) !== -1;
    if (!isPublic && !localStorage.getItem('lyf_onboarded')) {
      window.location.href = '/onboarding.html';
    }
  }

  /* ── Greeting ───────────────────────────────────────── */
  function setGreeting() {
    var el = document.getElementById('greeting');
    if (!el) return;
    var name = (LyfProfile.get().name) || 'there';
    var h = new Date().getHours();
    var word = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    /* Use a class instead of inline style for theme compatibility */
    el.innerHTML = word + ', <span class="c-accent">' + name + '</span> 👋';
  }

  /* ── Nav avatar + subline ───────────────────────────── */
  function setNavProfile() {
    var profile = LyfProfile.get();
    var initial = (profile.name || 'A').charAt(0).toUpperCase();

    var navAvatar = document.getElementById('navAvatar');
    if (navAvatar) navAvatar.textContent = initial;

    var sbAv = document.getElementById('sbAvatar');
    if (sbAv) sbAv.textContent = initial;

    var sbName = document.getElementById('sbName');
    if (sbName) sbName.textContent = profile.name || '';

    var sbCity = document.getElementById('sbCity');
    if (sbCity) sbCity.textContent = '📍 ' + (profile.city || 'Bangalore');

    var sbGoal = document.getElementById('sbGoal');
    if (sbGoal) {
      var goalLabels = {
        lose_fat: 'Lose fat', build_muscle: 'Build muscle',
        more_energy: 'More energy', feel_healthy: 'Feel healthier'
      };
      /* Use textContent on the label span — dot is static HTML */
      var goalLabel = sbGoal.querySelector('.sb-goal-label');
      if (goalLabel) {
        goalLabel.textContent = 'Goal: ' + (goalLabels[profile.goal] || 'Feel healthier');
      } else {
        sbGoal.innerHTML = '<div class="sb-goal-dot"></div>'
          + '<span class="sb-goal-label">Goal: ' + (goalLabels[profile.goal] || 'Feel healthier') + '</span>';
      }
    }

    var subline = document.getElementById('subline');
    if (subline) {
      var now = new Date();
      var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      var months = ['January','February','March','April','May','June','July',
                    'August','September','October','November','December'];
      /* Use class for city colour instead of inline style */
      subline.innerHTML = days[now.getDay()] + ', ' + now.getDate() + ' '
        + months[now.getMonth()] + ' ' + now.getFullYear()
        + ' &nbsp;·&nbsp; <span class="c-accent fw-600">' + (profile.city || 'Bangalore') + '</span>';
    }
  }

  /* ── Streak dots ────────────────────────────────────── */
  function renderStreakDots() {
    var containers = document.querySelectorAll('.streak-dots-container');
    containers.forEach(function (c) {
      c.innerHTML = '';
      for (var i = 0; i < 7; i++) {
        var d = document.createElement('div');
        d.className = 's-dot' + (i < 4 ? ' done' : i === 4 ? ' today' : '');
        c.appendChild(d);
      }
    });
  }

  /* ── Vitality badge + ring ──────────────────────────── */
  function updateVitalityBadge() {
    var score = LyfVitality.compute();

    var badge = document.getElementById('vitalityBadge');
    if (badge) badge.textContent = score;

    var sbScore = document.getElementById('sbScore');
    if (sbScore) sbScore.textContent = score;

    var ring = document.getElementById('vitalityRingFill');
    if (ring) {
      var circ = 125.6;
      var offset = (circ - (score / 100) * circ).toFixed(1);
      ring.setAttribute('stroke-dashoffset', offset);
    }

    var ringPct = document.getElementById('vitalityRingPct');
    if (ringPct) ringPct.textContent = score + '%';

    /* Update pillar bars in sidebar */
    var breakdown = LyfVitality.breakdown();
    var pillarMap = {
      fitness: { barId: 'sbBarFitness', ptsId: 'sbPtsFitness' },
      mind:    { barId: 'sbBarMind',    ptsId: 'sbPtsMind' },
      joy:     { barId: 'sbBarJoy',     ptsId: 'sbPtsJoy' },
      nature:  { barId: 'sbBarNature',  ptsId: 'sbPtsNature' },
      connect: { barId: 'sbBarConnect', ptsId: 'sbPtsConnect' }
    };
    Object.keys(pillarMap).forEach(function (key) {
      var ids = pillarMap[key];
      var pts = breakdown[key] || 0;
      var bar = document.getElementById(ids.barId);
      if (bar) bar.style.width = Math.round((pts / 20) * 100) + '%';
      var ptsEl = document.getElementById(ids.ptsId);
      if (ptsEl) ptsEl.textContent = pts;
    });
  }

  /* ── Credits easter egg ─────────────────────────────── */
  function setupCredits() {
    var logo = document.getElementById('lyfLogo');
    if (!logo) return;

    var lpTimer = null; /* scoped inside setupCredits — no leak */

    function startLP() {
      lpTimer = setTimeout(function () {
        var modal = document.getElementById('creditsModal');
        if (modal) modal.classList.add('open');
        if (window.Apptics) Apptics.event('credits_opened', 'easter_egg', {});
      }, 1500);
    }
    function cancelLP() { clearTimeout(lpTimer); }

    logo.addEventListener('mousedown', startLP);
    logo.addEventListener('mouseup', cancelLP);
    logo.addEventListener('mouseleave', cancelLP);
    logo.addEventListener('touchstart', startLP, { passive: true });
    logo.addEventListener('touchend', cancelLP);
    logo.addEventListener('touchcancel', cancelLP);
  }

  window.closeCredits = function () {
    var modal = document.getElementById('creditsModal');
    if (modal) modal.classList.remove('open');
  };

  /* ── Daily insight ──────────────────────────────────── */
  var INSIGHTS = [
    '"Village people walk 8–12km naturally every day — not in a gym, but through living. Your body was designed for movement."',
    '"The healthiest people in the world don\'t count calories. They eat real food, move naturally, and sleep when it\'s dark."',
    '"Stress is not caused by work — it\'s caused by the gap between where you are and where you think you should be."',
    '"In every traditional culture, the evening meal was the smallest. Your liver processes food 40% more efficiently before 2pm."',
    '"Belonging to a community adds years to your life. Loneliness is as harmful as smoking 15 cigarettes a day."',
    '"Walk barefoot on grass for 10 minutes each morning. It reduces inflammation and resets your nervous system."',
    '"Sleep is not a luxury — it is when your brain consolidates memory, repairs muscle, and resets hormones."'
  ];

  function setDailyInsight() {
    var el = document.getElementById('dailyInsight');
    if (!el) return;
    var idx = new Date().getDate() % INSIGHTS.length;
    el.textContent = INSIGHTS[idx];
  }

  /* ── Boot ───────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    authGuard();
    applyTheme();
    setNavProfile();
    setGreeting();
    renderStreakDots();
    updateVitalityBadge();
    setDailyInsight();
    setupCredits();

    /* Page enter animation */
    var main = document.querySelector('.main-content')
            || document.querySelector('.centered-wrap')
            || document.querySelector('.intro-hero');
    if (main) main.classList.add('page-enter');

    /* Track screen in Apptics */
    var page = window.location.pathname.split('/').pop().replace('.html', '') || 'intro';
    if (window.Apptics) Apptics.trackScreen(page);
  });

})();
