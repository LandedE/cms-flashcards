# CMS Wine Flashcards

Anki-style spaced-repetition flashcards for the Court of Master Sommeliers
Introductory exam, built from `CMS_Intro_Sommelier_Anki_Deck.txt`.

## Use

Hosted at https://landede.github.io/cms-flashcards/ — on a phone, use
"Add to Home Screen" to install it as an app. Or open `index.html` locally. Progress is saved in that browser's
localStorage. Use **Export progress** on the home screen for a backup.

- Click a deck (or **Study all**) to review with spaced repetition.
- **Cram** shuffles a deck for practice without touching your schedule.
- Keys: Space flips the card (and answers Good when flipped), 1–4 rate
  Again / Hard / Good / Easy, Z undoes, Esc returns to decks.

## Edit the deck

Edit the tab-separated txt file (question, answer, tag), then regenerate:

    python3 build.py

Card progress is keyed on the question text, so editing an answer keeps
progress; editing a question starts that card fresh.

## Scheduling

SM-2 with Anki's defaults: learning steps 1 min / 10 min, graduate at 1 day,
Easy at 4 days, starting ease 250%, 20 new cards per day (adjustable).

## Tests

    node --test scheduler.test.js
    python3 -m unittest test_build
