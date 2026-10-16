/* CMS Wine Flashcards — UI layer. Scheduling lives in scheduler.js. */
(function () {
  'use strict';
  const S = window.Scheduler;
  const CARDS = window.CARDS;
  const STORE_KEY = 'cms-flashcards-v1';
  const DAY = S.DAY;

  // ---------- persistence ----------
  function defaultStore() {
    return { version: 1, cards: {}, log: [], settings: { newPerDay: 20 } };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultStore();
      const data = JSON.parse(raw);
      return { ...defaultStore(), ...data, settings: { ...defaultStore().settings, ...(data.settings || {}) } };
    } catch (e) {
      console.warn('Could not read saved progress', e);
      return defaultStore();
    }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
    catch (e) { console.warn('Could not save progress', e); }
  }
  let store = load();

  function stateOf(id) { return store.cards[id] || S.newState(); }
  function today() { return S.dayStart(Date.now()); }
  function logToday() { const t = today(); return store.log.filter(e => e.at >= t); }
  function newSeenToday() { return logToday().filter(e => e.prev.state === 'new').length; }

  // ---------- deck tree ----------
  function deckKey(path) { return path.join('/'); }
  function cardsIn(path) {
    if (!path.length) return CARDS;
    return CARDS.filter(c => path.every((p, i) => c.deck[i] === p));
  }
  function deckTree() {
    const roots = new Map();
    for (const c of CARDS) {
      const [a, b] = c.deck;
      if (!roots.has(a)) roots.set(a, new Set());
      if (b) roots.get(a).add(b);
    }
    const rows = [];
    for (const a of [...roots.keys()].sort()) {
      rows.push({ path: [a], level: 0 });
      for (const b of [...roots.get(a)].sort()) rows.push({ path: [a, b], level: 1 });
    }
    return rows;
  }

  // ---------- views ----------
  const app = document.getElementById('app');
  let view = { name: 'home' };
  let session = null;

  function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function render() {
    app.innerHTML = '';
    if (view.name === 'home') app.appendChild(renderHome());
    else if (view.name === 'study') app.appendChild(renderStudy());
    else if (view.name === 'cram') app.appendChild(renderCram());
  }

  // ---- home ----
  function renderHome() {
    const now = Date.now();
    const all = S.counts(CARDS, store.cards, now);
    const seen = newSeenToday();
    const newLeft = Math.max(0, store.settings.newPerDay - seen);
    const allNew = Math.min(all.new, newLeft);

    const rowsHtml = deckTree().map(r => {
      const c = S.counts(cardsIn(r.path), store.cards, now);
      const n = Math.min(c.new, newLeft);
      return `<tr class="l${r.level}">
        <td><button class="name" data-study="${esc(deckKey(r.path))}">${esc(r.path[r.path.length - 1])}</button></td>
        <td class="num n-new ${n ? '' : 'zero'}">${n}</td>
        <td class="num n-learn ${c.learning ? '' : 'zero'}">${c.learning}</td>
        <td class="num n-due ${c.due ? '' : 'zero'}">${c.due}</td>
        <td class="cram"><button data-cram="${esc(deckKey(r.path))}">Cram</button></td>
      </tr>`;
    }).join('');

    const frag = h(`
      <div class="wrap">
        <header class="top">
          <h1>CMS Introductory Sommelier<small>${CARDS.length} cards · ${logToday().length} reviews today</small></h1>
          <div class="actions">
            <button class="primary" data-study="" ${allNew + all.learning + all.due ? '' : 'disabled'}>Study all</button>
          </div>
        </header>
        <table class="decks">
          <thead><tr><th>Deck</th><th>New</th><th>Learn</th><th>Due</th><th class="cram"></th></tr></thead>
          <tbody>
            <tr class="root">
              <td><button class="name" data-study="">All decks</button></td>
              <td class="num n-new ${allNew ? '' : 'zero'}">${allNew}</td>
              <td class="num n-learn ${all.learning ? '' : 'zero'}">${all.learning}</td>
              <td class="num n-due ${all.due ? '' : 'zero'}">${all.due}</td>
              <td class="cram"><button data-cram="">Cram</button></td>
            </tr>
            ${rowsHtml}
          </tbody>
        </table>
        <p class="row-help">Click a deck to study it with spaced repetition. Cram shuffles a deck for practice without changing your schedule.</p>
        ${renderStats(now)}
        ${renderSettings()}
      </div>`);

    frag.querySelectorAll('[data-study]').forEach(b => b.addEventListener('click', () => startStudy(b.dataset.study)));
    frag.querySelectorAll('[data-cram]').forEach(b => b.addEventListener('click', () => startCram(b.dataset.cram)));
    frag.querySelector('#newPerDay').addEventListener('change', e => {
      store.settings.newPerDay = Math.max(0, parseInt(e.target.value, 10) || 0); save(); render();
    });
    frag.querySelector('#export').addEventListener('click', exportProgress);
    frag.querySelector('#import').addEventListener('change', importProgress);
    frag.querySelector('#reset').addEventListener('click', () => {
      if (confirm('Erase all study progress? This cannot be undone.')) { store = defaultStore(); save(); render(); }
    });
    return frag;
  }

  function renderStats(now) {
    let young = 0, mature = 0, learning = 0, fresh = 0;
    const forecast = new Array(7).fill(0);
    const t0 = today();
    for (const c of CARDS) {
      const s = stateOf(c.id);
      if (s.state === 'new') fresh++;
      else if (s.state === 'review') {
        if (s.interval < 21) young++; else mature++;
        const d = Math.floor((s.due - t0) / DAY);
        if (d >= 0 && d < 7) forecast[d]++;
        else if (d < 0) forecast[0]++;
      } else learning++;
    }
    const names = ['Today', 'Tomorrow'];
    const fRows = forecast.map((n, i) => {
      const label = names[i] || new Date(t0 + i * DAY).toLocaleDateString(undefined, { weekday: 'long' });
      return `<tr><td>${label}</td><td>${n}</td></tr>`;
    }).join('');
    return `
      <section class="stats">
        <h2>Progress</h2>
        <div class="statgrid">
          <div class="stat"><b>${fresh}</b><span>Not yet seen</span></div>
          <div class="stat"><b>${learning}</b><span>Learning</span></div>
          <div class="stat"><b>${young}</b><span>Young (under 3 weeks)</span></div>
          <div class="stat"><b>${mature}</b><span>Mature</span></div>
        </div>
        <table class="forecast"><tbody>${fRows}</tbody></table>
      </section>`;
  }

  function renderSettings() {
    return `
      <section class="settings">
        <h2>Settings</h2>
        <label>New cards per day <input id="newPerDay" type="number" min="0" max="999" value="${store.settings.newPerDay}"></label>
        <div class="row">
          <button class="ghost" id="export">Export progress</button>
          <label class="ghost" style="display:inline-block">Import progress<input id="import" class="hidden-input" type="file" accept="application/json"></label>
          <button class="ghost danger" id="reset">Erase progress</button>
        </div>
        <p class="row-help">Progress is saved in this browser automatically. Export a backup before clearing browser data or moving to another machine. Keys: Space to flip, 1–4 to rate, Z to undo, Esc for decks.</p>
      </section>`;
  }

  // ---- study (spaced repetition) ----
  function startStudy(key) {
    const path = key ? key.split('/') : [];
    const queue = S.buildQueue(cardsIn(path), store.cards, {
      newPerDay: store.settings.newPerDay, newSeenToday: newSeenToday(),
    }, Date.now());
    session = { path, queue, flipped: false, undo: null, done: 0 };
    view = { name: 'study' };
    render();
  }

  function deckLabel(path) { return path.length ? path.join(' › ') : 'All decks'; }

  function renderStudy() {
    const now = Date.now();
    const card = session.queue[0];
    if (!card) {
      const frag = h(`
        <div class="wrap">
          ${studyHeader(now)}
          <div class="done">
            <h2>Done for now</h2>
            <p>${session.done ? `${session.done} card${session.done === 1 ? '' : 's'} reviewed in ${esc(deckLabel(session.path))}.` : 'Nothing is due in this deck right now.'}</p>
            <button class="primary" id="home">Back to decks</button>
          </div>
          ${session.undo ? '<p class="undo-note">Press Z to undo the last answer.</p>' : ''}
        </div>`);
      frag.querySelector('#home').addEventListener('click', goHome);
      return frag;
    }
    const st = stateOf(card.id);
    const p = S.previewIntervals(st, now);
    const frag = h(`
      <div class="wrap">
        ${studyHeader(now)}
        <article class="label" id="card" tabindex="0" aria-label="Flashcard">
          <div class="path">${esc(card.deck.join(' › '))}</div>
          <h2 class="q">${esc(card.q)}</h2>
          ${session.flipped
            ? `<hr><p class="a">${esc(card.a)}</p>`
            : `<p class="hint">Tap or press Space to reveal the answer</p>`}
        </article>
      </div>
      <div class="ratebar"><div class="inner ${session.flipped ? '' : 'single'}">
        ${session.flipped ? `
          <button class="rate again" data-rate="1">Again<small>${p.again}</small><kbd>1</kbd></button>
          <button class="rate hard" data-rate="2">Hard<small>${p.hard}</small><kbd>2</kbd></button>
          <button class="rate good" data-rate="3">Good<small>${p.good}</small><kbd>3</kbd></button>
          <button class="rate easy" data-rate="4">Easy<small>${p.easy}</small><kbd>4</kbd></button>`
          : `<button class="rate show" id="flip">Show answer<kbd>Space</kbd></button>`}
      </div></div>`);
    frag.querySelector('#card').addEventListener('click', flip);
    const f = frag.querySelector('#flip'); if (f) f.addEventListener('click', flip);
    frag.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => rate(+b.dataset.rate)));
    frag.querySelector('#home').addEventListener('click', goHome);
    return frag;
  }

  function studyHeader(now) {
    const c = S.counts(session.queue, store.cards, now);
    const n = session.queue.filter(x => stateOf(x.id).state === 'new').length;
    return `
      <div class="study-top">
        <div><button class="ghost" id="home">‹ Decks</button> <span class="deckname">${esc(deckLabel(session.path))}</span></div>
        <div class="counts"><span class="n-new">${n}</span><span class="n-learn">${c.learning}</span><span class="n-due">${c.due}</span></div>
      </div>`;
  }

  function flip() {
    if (view.name === 'study' && !session.flipped && session.queue[0]) { session.flipped = true; render(); }
    else if (view.name === 'cram' && !session.flipped && session.queue[session.i]) { session.flipped = true; render(); }
  }

  function rate(r) {
    if (view.name !== 'study' || !session.flipped) return;
    const card = session.queue.shift();
    const now = Date.now();
    const prev = stateOf(card.id);
    const next = S.answer(prev, r, now);
    store.cards[card.id] = next;
    store.log.push({ id: card.id, rating: r, at: now, prev });
    if (store.log.length > 5000) store.log.splice(0, store.log.length - 5000);
    save();
    session.undo = { card, prev };
    session.done++;
    session.flipped = false;
    // Learning cards come back later in this session.
    if ((next.state === 'learning' || next.state === 'relearning') && S.isDueToday(next, now)) {
      session.queue.push(card);
    }
    render();
  }

  function undo() {
    if (view.name !== 'study' || !session.undo) return;
    const { card, prev } = session.undo;
    if (prev.state === 'new') delete store.cards[card.id]; else store.cards[card.id] = prev;
    store.log.pop();
    save();
    session.queue = [card, ...session.queue.filter(c => c.id !== card.id)];
    session.undo = null;
    session.done = Math.max(0, session.done - 1);
    session.flipped = false;
    render();
  }

  // ---- cram ----
  function startCram(key) {
    const path = key ? key.split('/') : [];
    const cards = [...cardsIn(path)];
    for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
    session = { path, queue: cards, i: 0, flipped: false };
    view = { name: 'cram' };
    render();
  }

  function renderCram() {
    const card = session.queue[session.i];
    const header = `
      <div class="study-top">
        <div><button class="ghost" id="home">‹ Decks</button> <span class="deckname">Cram · ${esc(deckLabel(session.path))}</span></div>
        <div class="counts"><span>${Math.min(session.i + 1, session.queue.length)} / ${session.queue.length}</span></div>
      </div>`;
    if (!card) {
      const frag = h(`<div class="wrap">${header}<div class="done"><h2>Deck complete</h2><p>You went through all ${session.queue.length} cards.</p>
        <button class="primary" id="again">Shuffle and go again</button> <button class="ghost" id="home2">Back to decks</button></div></div>`);
      frag.querySelector('#home').addEventListener('click', goHome);
      frag.querySelector('#home2').addEventListener('click', goHome);
      frag.querySelector('#again').addEventListener('click', () => startCram(deckKey(session.path)));
      return frag;
    }
    const frag = h(`
      <div class="wrap">
        ${header}
        <article class="label" id="card" tabindex="0" aria-label="Flashcard">
          <div class="path">${esc(card.deck.join(' › '))}</div>
          <h2 class="q">${esc(card.q)}</h2>
          ${session.flipped ? `<hr><p class="a">${esc(card.a)}</p>` : `<p class="hint">Tap or press Space to reveal the answer</p>`}
        </article>
      </div>
      <div class="ratebar"><div class="inner single">
        ${session.flipped
          ? `<button class="rate show" id="next">Next card<kbd>Space</kbd></button>`
          : `<button class="rate show" id="flip">Show answer<kbd>Space</kbd></button>`}
      </div></div>`);
    frag.querySelector('#card').addEventListener('click', () => session.flipped ? cramNext() : flip());
    const f = frag.querySelector('#flip'); if (f) f.addEventListener('click', flip);
    const n = frag.querySelector('#next'); if (n) n.addEventListener('click', cramNext);
    frag.querySelector('#home').addEventListener('click', goHome);
    return frag;
  }

  function cramNext() { session.i++; session.flipped = false; render(); }

  function goHome() { session = null; view = { name: 'home' }; render(); }

  // ---- export / import ----
  function exportProgress() {
    const blob = new Blob([JSON.stringify(store, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cms-flashcards-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importProgress(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data.cards !== 'object') throw new Error('not a progress file');
        let merged = 0;
        for (const [id, s] of Object.entries(data.cards)) {
          const cur = store.cards[id];
          if (!cur || (s.updated || 0) >= (cur.updated || 0)) { store.cards[id] = s; merged++; }
        }
        if (Array.isArray(data.log)) {
          const seen = new Set(store.log.map(x => x.id + ':' + x.at));
          for (const x of data.log) if (!seen.has(x.id + ':' + x.at)) store.log.push(x);
          store.log.sort((a, b) => a.at - b.at);
        }
        if (data.settings) store.settings = { ...store.settings, ...data.settings };
        save(); render();
        alert(`Imported progress for ${merged} cards.`);
      } catch (err) {
        alert('That file is not a CMS Flashcards progress export.');
      }
    };
    reader.readAsText(file);
  }

  // ---- keyboard ----
  document.addEventListener('keydown', e => {
    if (e.target && e.target.matches && e.target.matches('input, select, textarea')) return;
    if (e.key === 'Escape' && view.name !== 'home') { goHome(); return; }
    if (view.name === 'study') {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (session.flipped) rate(S.GOOD); else flip(); }
      else if (/^[1-4]$/.test(e.key)) rate(+e.key);
      else if (e.key === 'z' || e.key === 'Z') undo();
    } else if (view.name === 'cram') {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (session.flipped) cramNext(); else flip(); }
    }
  });

  render();
})();
