# CMS Wine Flashcards — Design

Date: 2026-10-15

## Goal
An Anki-style spaced-repetition flashcard app for the 215-card
`CMS_Intro_Sommelier_Anki_Deck.txt` export, runnable by double-clicking a file.

## Delivery
- `index.html` + `app.js` + `styles.css` + `scheduler.js` + `cards.js`, opened via `file://`.
  No server, no npm, works offline.
- `build.py` (stdlib only) parses the Anki tab-separated export and writes `cards.js`
  (`window.CARDS = [...]`). Card `id` = first 10 hex chars of SHA-1 of the question text,
  so answer edits preserve progress.
- Tags like `CMS_Intro France_Bordeaux` become a deck path `["France", "Bordeaux"]`.

## Scheduling (SM-2, Anki defaults)
- States: `new`, `learning`, `review`, `relearning`.
- Learning steps: 1 min, 10 min. Graduating interval 1 day. Easy interval 4 days.
- Review: Again -> relearning (10 min step), interval reset to max(1d, interval*0.2)? No —
  Anki default new interval = 0%, min 1 day; ease -20%.
  Hard -> interval*1.2, ease -15%. Good -> interval*ease. Easy -> interval*ease*1.3, ease +15%.
- Ease starts 2.5, floor 1.3. Max interval 365 days. Small fuzz skipped (deterministic, testable).
- Day boundary: 4am local, as in Anki.
- Daily new-card limit, default 20, adjustable in settings.

## Study session
- Queue order: learning cards whose due time has passed, then due reviews, then new cards
  (up to the daily limit). Interleaved like Anki: learning first when due.
- Front shows question; Space / click flips; 1-4 rate Again/Hard/Good/Easy; Z undoes last answer.
- Buttons show the resulting interval ("10m", "1d", "4d").
- Cram mode: pick a deck, cards shuffled, flip-only (shows "Next"), no scheduling writes.

## Decks
- Home screen lists deck tree with New / Learning / Due counts per node.
- Click a node to study it and its children; "All" studies everything.

## Persistence
- `localStorage` key `cms-flashcards-v1`: `{ cards: {id: state}, log: [...], settings, version }`.
- Export downloads JSON; import merges by card id (newer `updated` wins).

## Stats
- Counts: new / learning / young (<21d) / mature.
- Reviews done today, due per day for the next 7 days.

## Testing
- `scheduler.js` is pure (takes `now` as a parameter). `node --test scheduler.test.js`
  covers each transition, ease floor, max interval, day-boundary, queue building.
- UI verified manually in the browser.

## Out of scope
Cloze cards, images, audio, sync between devices beyond export/import, FSRS.
