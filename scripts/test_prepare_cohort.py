"""Read-only extraction regression tests; never modify source workbooks."""
import json
import pathlib
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from prepare_cohort import extract, LABELS

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFINITIONS = json.loads((ROOT / "dist/questionnaire-data.js").read_text().split("=", 1)[1].strip().rstrip(";"))


def fixture_extract(rows):
    cells = [[SimpleNamespace(value=v, row=i+1) for v in [*row, None, None]] for i, row in enumerate(rows)]
    sheet = SimpleNamespace(title="BPPV (1)", iter_rows=lambda **kwargs: iter(cells))
    class Workbook(list):
        def close(self): pass
    with patch("prepare_cohort.openpyxl.load_workbook", return_value=Workbook([sheet])), patch("prepare_cohort.pathlib.Path.read_bytes", return_value=b"synthetic"):
        return extract("synthetic.xlsx", DEFINITIONS)[0]["records"][0]


class ExtractionTests(unittest.TestCase):
    def test_grouped_aliases_are_deduplicated(self):
        q = next(q for q in DEFINITIONS["questions"] if q["id"] == "259372")
        r = fixture_extract([(q["prompt"], "supermarket aisles"), (None, "malls"), (None, "tunnels"), (None, "stress"), (None, "nerves or anxiety"), (None, "sneezing or blowing your nose")])
        self.assertEqual(r["answers"][q["id"]], ["supermarket aisles, malls, or tunnels", "stress, nerves, or anxiety"])
        self.assertEqual(len(r["mappingAudit"]), 5)
        self.assertEqual(r["issues"]["unmatched_option"], 1)

    def test_tinnitus_semantics(self):
        r = fixture_extract([("I have a roaring or ringing in one ear only before or during a dizziness attack", "Yes. Left ear only")])
        self.assertEqual(r["answers"]["259416"], "Yes, left ear only")
        old = fixture_extract([("Do you have ringing, buzzing, or other noise in your ears that is there all the time?", "Yes. Left ear only")])
        self.assertNotIn("259416", old["answers"])

    def test_duration_conflicts_preserved_but_not_scored(self):
        q = next(q for q in DEFINITIONS["questions"] if q["id"] == "259369")
        r = fixture_extract([(q["prompt"], "Minutes"), (None, "Hours"), (None, "Days")])
        self.assertNotIn(q["id"], r["answers"])
        self.assertEqual(r["unscoredAnswers"][q["id"]]["values"], ["Minutes", "Hours", "Days"])

    def test_panic_alias_and_explicit_diagnosis_mapping(self):
        q = next(q for q in DEFINITIONS["questions"] if q["id"] == "259381")
        r = fixture_extract([(q["prompt"], "Panic feeling or a sudden need to leave a place")])
        self.assertEqual(r["answers"][q["id"]], ["panic feeling or sudden need to leave a place"])
        self.assertEqual(LABELS["NeuritisHypofunction"], "Neuritis")


if __name__ == "__main__":
    unittest.main()
