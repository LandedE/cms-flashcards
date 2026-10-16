const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./scheduler.js');

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
// A fixed "now": Thu 2026-10-15 10:00 local time.
const NOW = new Date(2026, 9, 15, 10, 0, 0).getTime();

test('new card: Good moves to learning step 2 (10m)', () => {
  const s = S.answer(S.newState(), S.GOOD, NOW);
  assert.equal(s.state, 'learning');
  assert.equal(s.step, 1);
  assert.equal(s.due, NOW + 10 * MIN);
});

test('new card: Again stays at learning step 1 (1m)', () => {
  const s = S.answer(S.newState(), S.AGAIN, NOW);
  assert.equal(s.state, 'learning');
  assert.equal(s.step, 0);
  assert.equal(s.due, NOW + 1 * MIN);
});

test('new card: Easy graduates immediately to 4 days', () => {
  const s = S.answer(S.newState(), S.EASY, NOW);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 4);
  assert.equal(s.due, S.dayStart(NOW) + 4 * DAY);
});

test('learning last step: Good graduates to 1 day review', () => {
  const l = { ...S.newState(), state: 'learning', step: 1 };
  const s = S.answer(l, S.GOOD, NOW);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 1);
  assert.equal(s.ease, 2.5);
  assert.equal(s.due, S.dayStart(NOW) + 1 * DAY);
});

test('learning: Hard repeats current step', () => {
  const l = { ...S.newState(), state: 'learning', step: 1 };
  const s = S.answer(l, S.HARD, NOW);
  assert.equal(s.state, 'learning');
  assert.equal(s.step, 1);
  assert.equal(s.due, NOW + 10 * MIN);
});

function review(interval, ease = 2.5) {
  return { ...S.newState(), state: 'review', interval, ease, due: S.dayStart(NOW) };
}

test('review Good multiplies interval by ease', () => {
  const s = S.answer(review(10), S.GOOD, NOW);
  assert.equal(s.interval, 25);
  assert.equal(s.ease, 2.5);
  assert.equal(s.due, S.dayStart(NOW) + 25 * DAY);
});

test('review Hard: interval x1.2, ease -0.15', () => {
  const s = S.answer(review(10), S.HARD, NOW);
  assert.equal(s.interval, 12);
  assert.equal(s.ease, 2.35);
});

test('review Easy: interval x ease x 1.3, ease +0.15', () => {
  const s = S.answer(review(10), S.EASY, NOW);
  assert.equal(s.interval, 33); // round(10*2.5*1.3) = 32.5 -> 33
  assert.equal(s.ease, 2.65);
});

test('review Again: lapses into relearning, ease -0.2, interval reset to 1', () => {
  const s = S.answer(review(30), S.AGAIN, NOW);
  assert.equal(s.state, 'relearning');
  assert.equal(s.ease, 2.3);
  assert.equal(s.interval, 1);
  assert.equal(s.lapses, 1);
  assert.equal(s.due, NOW + 10 * MIN);
});

test('relearning Good returns to review with interval 1 day', () => {
  const r = { ...review(1, 2.3), state: 'relearning', step: 0 };
  const s = S.answer(r, S.GOOD, NOW);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 1);
  assert.equal(s.due, S.dayStart(NOW) + 1 * DAY);
});

test('ease never drops below 1.3', () => {
  const s = S.answer(review(10, 1.35), S.AGAIN, NOW);
  assert.equal(s.ease, 1.3);
});

test('interval is capped at 365 days', () => {
  const s = S.answer(review(300), S.GOOD, NOW);
  assert.equal(s.interval, 365);
});

test('review interval always grows by at least 1 day', () => {
  const s = S.answer(review(1, 1.3), S.HARD, NOW);
  assert.equal(s.interval, 2);
});

test('dayStart rolls over at 4am local', () => {
  const threeAm = new Date(2026, 9, 15, 3, 0).getTime();
  const fiveAm = new Date(2026, 9, 15, 5, 0).getTime();
  assert.equal(S.dayStart(threeAm), new Date(2026, 9, 14, 4, 0).getTime());
  assert.equal(S.dayStart(fiveAm), new Date(2026, 9, 15, 4, 0).getTime());
});

test('previewIntervals describes each button for a new card', () => {
  const p = S.previewIntervals(S.newState(), NOW);
  assert.deepEqual(p, { again: '1m', hard: '1m', good: '10m', easy: '4d' });
});

test('previewIntervals describes each button for a review card', () => {
  const p = S.previewIntervals(review(10), NOW);
  assert.deepEqual(p, { again: '10m', hard: '12d', good: '25d', easy: '1.1mo' });
});

test('formatInterval renders minutes, days, months, years', () => {
  assert.equal(S.formatInterval(5 * MIN), '5m');
  assert.equal(S.formatInterval(3 * DAY), '3d');
  assert.equal(S.formatInterval(45 * DAY), '1.5mo');
  assert.equal(S.formatInterval(365 * DAY), '1y');
});

// ---- queue building ----
const cards = [
  { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' },
];

test('buildQueue: due learning first, then due reviews, then new up to limit', () => {
  const states = {
    a: { ...S.newState(), state: 'learning', step: 0, due: NOW - MIN },
    b: review(3),                                  // due today
    c: { ...review(3), due: S.dayStart(NOW) + DAY }, // due tomorrow -> excluded
    // d, e are new
  };
  const q = S.buildQueue(cards, states, { newPerDay: 1, newSeenToday: 0 }, NOW);
  assert.deepEqual(q.map(c => c.id), ['a', 'b', 'd']);
});

test('buildQueue: learning cards due later today are still included (after others)', () => {
  const states = {
    a: { ...S.newState(), state: 'learning', step: 0, due: NOW + 5 * MIN },
    b: review(3),
  };
  const q = S.buildQueue(cards.slice(0, 2), states, { newPerDay: 0, newSeenToday: 0 }, NOW);
  assert.deepEqual(q.map(c => c.id), ['b', 'a']);
});

test('buildQueue: new-card limit accounts for new cards already seen today', () => {
  const q = S.buildQueue(cards, {}, { newPerDay: 3, newSeenToday: 2 }, NOW);
  assert.equal(q.length, 1);
});

test('counts: new / learning / due per deck of cards', () => {
  const states = {
    a: { ...S.newState(), state: 'learning', step: 0, due: NOW - MIN },
    b: review(3),
    c: { ...review(3), due: S.dayStart(NOW) + DAY },
  };
  assert.deepEqual(S.counts(cards, states, NOW), { new: 2, learning: 1, due: 1 });
});
