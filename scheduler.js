// SM-2 scheduler with Anki's default settings. Pure functions; `now` is always
// passed in (ms since epoch) so everything is deterministic and testable.
(function (root) {
  'use strict';

  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;

  const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;

  const LEARNING_STEPS = [1 * MIN, 10 * MIN];
  const RELEARNING_STEPS = [10 * MIN];
  const GRADUATING_INTERVAL = 1;   // days
  const EASY_INTERVAL = 4;         // days
  const START_EASE = 2.5;
  const MIN_EASE = 1.3;
  const MAX_INTERVAL = 365;        // days
  const HARD_MULTIPLIER = 1.2;
  const EASY_BONUS = 1.3;
  const DAY_ROLLOVER_HOUR = 4;

  function newState() {
    return { state: 'new', step: 0, interval: 0, ease: START_EASE, due: 0, reps: 0, lapses: 0 };
  }

  // Start of the "study day" containing `now`: 4am local, like Anki.
  function dayStart(now) {
    const d = new Date(now);
    d.setHours(DAY_ROLLOVER_HOUR, 0, 0, 0);
    if (d.getTime() > now) d.setDate(d.getDate() - 1);
    return d.getTime();
  }

  function round2(x) { return Math.round(x * 100) / 100; }
  function clampEase(e) { return round2(Math.max(MIN_EASE, e)); }
  function clampInterval(days) { return Math.min(MAX_INTERVAL, Math.max(1, Math.round(days))); }

  function graduate(s, interval, now) {
    return { ...s, state: 'review', step: 0, interval, due: dayStart(now) + interval * DAY };
  }

  function answer(prev, rating, now) {
    const s = { ...prev, reps: prev.reps + 1, updated: now };

    if (s.state === 'new' || s.state === 'learning') {
      if (rating === EASY) return graduate(s, EASY_INTERVAL, now);
      let step = s.state === 'new' ? 0 : s.step;
      if (rating === AGAIN) step = 0;
      else if (rating === GOOD) step += 1;
      // HARD repeats the current step
      if (step >= LEARNING_STEPS.length) return graduate(s, GRADUATING_INTERVAL, now);
      return { ...s, state: 'learning', step, due: now + LEARNING_STEPS[step] };
    }

    if (s.state === 'relearning') {
      if (rating === EASY) return graduate(s, Math.max(s.interval, GRADUATING_INTERVAL), now);
      let step = rating === AGAIN ? 0 : rating === GOOD ? s.step + 1 : s.step;
      if (step >= RELEARNING_STEPS.length) return graduate(s, s.interval, now);
      return { ...s, step, due: now + RELEARNING_STEPS[step] };
    }

    // review
    if (rating === AGAIN) {
      return {
        ...s, state: 'relearning', step: 0, lapses: s.lapses + 1,
        ease: clampEase(s.ease - 0.2), interval: 1, due: now + RELEARNING_STEPS[0],
      };
    }
    let interval, ease = s.ease;
    if (rating === HARD) {
      interval = clampInterval(Math.max(s.interval + 1, s.interval * HARD_MULTIPLIER));
      ease = clampEase(ease - 0.15);
    } else if (rating === GOOD) {
      interval = clampInterval(Math.max(s.interval + 1, s.interval * ease));
    } else {
      interval = clampInterval(Math.max(s.interval + 1, s.interval * ease * EASY_BONUS));
      ease = clampEase(ease + 0.15);
    }
    return { ...s, ease, interval, due: dayStart(now) + interval * DAY };
  }

  function formatInterval(ms) {
    if (ms < DAY) return Math.max(1, Math.round(ms / MIN)) + 'm';
    const days = ms / DAY;
    if (days < 30) return Math.round(days) + 'd';
    if (days < 365) return (Math.round(days / 3) / 10).toString().replace(/\.0$/, '') + 'mo';
    return (Math.round(days / 36.5) / 10).toString().replace(/\.0$/, '') + 'y';
  }

  function previewIntervals(state, now) {
    const out = {};
    for (const [name, r] of [['again', AGAIN], ['hard', HARD], ['good', GOOD], ['easy', EASY]]) {
      const next = answer(state, r, now);
      const ms = next.state === 'review' ? next.interval * DAY : next.due - now;
      out[name] = formatInterval(ms);
    }
    return out;
  }

  function isDueToday(s, now) {
    return s.due < dayStart(now) + DAY;
  }

  // Order: learning cards already due, due reviews, new cards (up to the daily
  // limit), then learning cards that come due later today.
  function buildQueue(cards, states, opts, now) {
    const learningNow = [], learningLater = [], due = [], fresh = [];
    for (const c of cards) {
      const s = states[c.id] || newState();
      if (s.state === 'new') fresh.push(c);
      else if (s.state === 'learning' || s.state === 'relearning') {
        if (s.due <= now) learningNow.push(c);
        else if (isDueToday(s, now)) learningLater.push(c);
      } else if (isDueToday(s, now)) due.push(c);
    }
    const bySt = (a, b) => (states[a.id] || newState()).due - (states[b.id] || newState()).due;
    learningNow.sort(bySt); learningLater.sort(bySt); due.sort(bySt);
    const newAllowed = Math.max(0, (opts.newPerDay || 0) - (opts.newSeenToday || 0));
    return [...learningNow, ...due, ...fresh.slice(0, newAllowed), ...learningLater];
  }

  function counts(cards, states, now) {
    const out = { new: 0, learning: 0, due: 0 };
    for (const c of cards) {
      const s = states[c.id] || newState();
      if (s.state === 'new') out.new++;
      else if (s.state === 'learning' || s.state === 'relearning') {
        if (isDueToday(s, now)) out.learning++;
      } else if (isDueToday(s, now)) out.due++;
    }
    return out;
  }

  const api = {
    AGAIN, HARD, GOOD, EASY, MIN, DAY,
    newState, dayStart, answer, formatInterval, previewIntervals,
    buildQueue, counts, isDueToday,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Scheduler = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
