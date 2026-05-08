/* ============================================================
   Lyf — ai.js
   Gemini API integration (frontend, prototype mode).
   Switch to Catalyst Serverless Function later to secure key.

   Load order: must load after profile.js (uses LyfProfile)
   ============================================================ */

var LyfAI = (function () {
  'use strict';

  var GEMINI_KEY   = 'AIzaSyA5OrK205hzLWT2mAJ1JLMvPeIo980owN0';
  var GEMINI_MODEL = 'gemini-1.5-flash';
  var GEMINI_URL   = 'https://generativelanguage.googleapis.com/v1beta/models/'
                   + GEMINI_MODEL + ':generateContent?key=' + GEMINI_KEY;

  /* ── Core Gemini call ────────────────────────────────────── */
  function ask(prompt, onSuccess, onError) {
    var provider = localStorage.getItem('lyf_ai_provider') || 'gemini';

    if (provider !== 'gemini') {
      if (onError) onError('Claude is not wired yet — switch to Gemini in Settings.');
      return;
    }

    /* Track query sent before fetch — always fires if we got here */
    if (window.Apptics) Apptics.track('ai_query_sent', 'ai', { provider: 'gemini' });

    var body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.7 }
    };

    fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        /* Check HTTP status before parsing body */
        if (!res.ok) {
          return res.json().then(function (errBody) {
            var apiMsg = errBody && errBody.error && errBody.error.message
                       ? errBody.error.message
                       : 'HTTP ' + res.status;
            throw new Error(apiMsg);
          }).catch(function () {
            throw new Error('HTTP ' + res.status);
          });
        }
        return res.json();
      })
      .then(function (data) {
        var text = data.candidates
                && data.candidates[0]
                && data.candidates[0].content
                && data.candidates[0].content.parts
                && data.candidates[0].content.parts[0].text;

        if (text) {
          if (window.Apptics) Apptics.track('ai_response_received', 'ai', { provider: 'gemini' });
          onSuccess(text.trim());
        } else {
          /* Gemini returned candidates but no text — e.g. safety block */
          var reason = data.candidates
                    && data.candidates[0]
                    && data.candidates[0].finishReason;
          if (onError) onError('No response from Gemini' + (reason ? ' (' + reason + ')' : '') + '.');
        }
      })
      .catch(function (err) {
        console.error('[LyfAI] Gemini error:', err.message);
        if (window.Apptics) Apptics.nonFatal('GeminiError', err.message, { provider: 'gemini' });
        if (onError) onError('AI unavailable: ' + err.message + '. Try again shortly.');
      });
  }

  /* ── Personalised prompts ────────────────────────────────── */

  function getDailyInsight(profile, onSuccess, onError) {
    var goalLabel = LyfProfile.goalLabel(profile.goal);
    var prompt = 'You are a health and wellness coach inspired by ancestral village living philosophy. '
      + 'Give a single short, powerful insight (2–3 sentences max) about living healthily for someone named '
      + (profile.name || 'the user')
      + ' who lives in ' + (profile.city || 'India')
      + ' and wants to ' + goalLabel
      + '. Make it poetic and grounded in village/nature wisdom. No bullet points, no hashtags.';
    ask(prompt, onSuccess, onError);
  }

  function getMealSuggestion(profile, onSuccess, onError) {
    var hour = new Date().getHours();
    var mealTime = hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : 'dinner';
    var goalLabel = LyfProfile.goalLabel(profile.goal);
    var prompt = 'Suggest one simple, healthy vegetarian Indian meal for ' + mealTime
      + ' for someone who wants to ' + goalLabel
      + '. List only: meal name, 3–4 ingredients, approximate calories. Be concise. No intro.';
    ask(prompt, onSuccess, onError);
  }

  function getMotivation(profile, mood, onSuccess, onError) {
    var goalLabel = LyfProfile.goalLabel(profile.goal);
    var prompt = 'Give a one-sentence motivational message for someone who is feeling '
      + (mood || 'okay')
      + ' today. Their name is ' + (profile.name || 'friend')
      + ' and their goal is to ' + goalLabel
      + '. Be warm, specific, and grounded. No emojis, no hashtags.';
    ask(prompt, onSuccess, onError);
  }

  /* onError intentionally unused — purely local, never fails */
  function getJournalPrompt(onSuccess) {
    var prompts = [
      'What drained your energy most this week — and what would life look like without it?',
      'Describe one moment today where you felt fully present. What made it possible?',
      'What is one small thing you did today that your future self will thank you for?',
      'What does your body need most right now — and are you giving it that?',
      'Who in your life makes you feel the most like yourself? When did you last tell them?'
    ];
    var idx = new Date().getDate() % prompts.length;
    onSuccess(prompts[idx]);
  }

  /* ── Public API ──────────────────────────────────────────── */
  return {
    ask:              ask,
    getDailyInsight:  getDailyInsight,
    getMealSuggestion: getMealSuggestion,
    getMotivation:    getMotivation,
    getJournalPrompt: getJournalPrompt
  };

})();
