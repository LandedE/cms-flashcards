import json, unittest
from build import parse_deck, deck_path, card_id

class BuildTests(unittest.TestCase):
    def test_deck_path_splits_tag_into_region_and_subregion(self):
        self.assertEqual(deck_path("CMS_Intro France_Bordeaux"), ["France", "Bordeaux"])
        self.assertEqual(deck_path("CMS_Intro Spirits"), ["Spirits"])
        self.assertEqual(deck_path("CMS_Intro Basics_Winemaking"), ["Basics", "Winemaking"])

    def test_deck_path_keeps_compound_names_together(self):
        self.assertEqual(deck_path("CMS_Intro Australia_NZ"), ["Australia & New Zealand"])
        self.assertEqual(deck_path("CMS_Intro South_America"), ["South America"])
        self.assertEqual(deck_path("CMS_Intro South_Africa"), ["South Africa"])
        self.assertEqual(deck_path("CMS_Intro Beer_Sake"), ["Beer & Sake"])
        self.assertEqual(deck_path("CMS_Intro Other_Europe"), ["Other Europe"])
        self.assertEqual(deck_path("CMS_Intro USA_PacNW"), ["USA", "Pacific Northwest"])

    def test_card_id_is_stable_hash_of_question(self):
        self.assertEqual(card_id("What is must?"), card_id("What is must?"))
        self.assertNotEqual(card_id("What is must?"), card_id("What are lees?"))
        self.assertEqual(len(card_id("x")), 10)

    def test_parse_deck_skips_header_and_reads_three_columns(self):
        text = "#separator:tab\n#html:false\nQ1?\tA1\tCMS_Intro Spain\nQ2?\tA2\tCMS_Intro France_Loire\n"
        cards = parse_deck(text)
        self.assertEqual(len(cards), 2)
        self.assertEqual(cards[0]["q"], "Q1?")
        self.assertEqual(cards[0]["a"], "A1")
        self.assertEqual(cards[0]["deck"], ["Spain"])
        self.assertEqual(cards[1]["deck"], ["France", "Loire"])
        self.assertEqual(cards[0]["id"], card_id("Q1?"))

    def test_parse_deck_handles_real_file(self):
        with open("CMS_Intro_Sommelier_Anki_Deck.txt", encoding="utf-8") as f:
            cards = parse_deck(f.read())
        self.assertEqual(len(cards), 215)
        self.assertEqual(len({c["id"] for c in cards}), 215, "duplicate ids")

if __name__ == "__main__":
    unittest.main()
