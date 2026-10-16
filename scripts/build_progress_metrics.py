"""Build public, aggregate-only model progress metrics.

No patient answers, identifiers, ages, or sexes are written to the website.
Historical rule sources and private cohorts remain outside dist/.
"""
from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys


APP = pathlib.Path(__file__).resolve().parents[1]
PROJECT = APP.parent
sys.path.insert(0, str(PROJECT / "archive" / "legacy-desktop-source"))

from scoring_core import build_default_rules, load_questions  # noqa: E402


ORIGINAL_WORKBOOK = PROJECT / "data" / "OTO Dizziness Questionnaire -Nebula cloud 5-9-241.xlsx"
KM2_WORKBOOK = PROJECT / "data" / "reference" / "OTO Dizziness Questionnaire -Nebula cloud 5-9-241_KM2.xlsx"
CURRENT_COHORT = PROJECT / "data" / "processed" / "nebula-private-cohort.json"
OUTPUT = APP / "dist" / "progress-data.js"
OCTOBER_14_COMMIT = "8292d8c"


def js_payload(text: str) -> dict:
    return json.loads(text.split("=", 1)[1].strip().rstrip(";"))


def git_payload(commit: str, path: str) -> dict:
    text = subprocess.check_output(["git", "show", f"{commit}:{path}"], cwd=APP, text=True)
    return js_payload(text)


def normalize(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def answer_values(value: object) -> set[str]:
    values = value if isinstance(value, list) else ([] if value is None else [value])
    return {normalize(value) for value in values}


def merged_records(cohort: dict, questions: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = {}
    for record in cohort["records"]:
        groups.setdefault(record["sourceAnswerFingerprint"], []).append(record)
    records = [
        {
            "labels": sorted({record["label"] for record in records}),
            "answers": records[0]["answers"],
        }
        for records in groups.values()
    ]
    by_id = {question["id"]: question for question in questions}
    for record in records:
        clean_answers = {}
        for question_id, value in record["answers"].items():
            question = by_id.get(question_id)
            if not question or question["kind"] not in ("single", "multi"):
                continue
            values = value if isinstance(value, list) else [value]
            if any(item not in question["options"] for item in values):
                continue
            if question["kind"] == "single" and len(values) != 1:
                continue
            if len(values) > 1 and any(normalize(item) == "none of the above" for item in values):
                continue
            clean_answers[question_id] = values if question["kind"] == "multi" else values[0]
        for question in questions:
            condition = question.get("showWhen")
            if condition and normalize(condition["answer"]) not in answer_values(clean_answers.get(condition["questionId"])):
                clean_answers.pop(question["id"], None)
        record["answers"] = clean_answers
    return records


def score(rules: list[dict], answers: dict) -> dict[str, dict[str, float]]:
    results: dict[str, dict[str, float]] = {}
    normalized_answers = {key: answer_values(value) for key, value in answers.items()}
    for rule in rules:
        category = rule["category"]
        item = results.setdefault(category, {"points": 0.0, "available": 0.0})
        weight = float(rule["weight"])
        if weight > 0:
            item["available"] += weight
        if normalize(rule["answer"]) in normalized_answers.get(str(rule["questionId"]), set()):
            item["points"] += weight
    for item in results.values():
        item["percent"] = max(0.0, min(100.0, item["points"] / max(item["available"], 1.0) * 100.0))
    return results


def evaluate(rules: list[dict], cohort: dict, questions: list[dict], ranking: str) -> dict:
    records = merged_records(cohort, questions)
    top_one = 0
    top_three_recall = 0.0
    total_labels = 0
    nonpositive_patients = 0
    ranks: list[int] = []
    for record in records:
        scores = score(rules, record["answers"])
        if ranking == "support_then_points":
            ordered = sorted(scores, key=lambda category: (-scores[category]["percent"], -scores[category]["points"], category.casefold()))
        else:
            ordered = sorted(scores, key=lambda category: (-scores[category]["points"], category.casefold()))
        top_one += int(bool(ordered) and ordered[0] in record["labels"])
        top_three = set(ordered[:3])
        top_three_recall += sum(label in top_three for label in record["labels"]) / len(record["labels"])
        total_labels += len(record["labels"])
        nonpositive_patients += int(any(scores[label]["points"] <= 0 for label in record["labels"]))
        ranks.extend(ordered.index(label) + 1 for label in record["labels"])
    return {
        "patients": len(records),
        "recordedDiagnoses": total_labels,
        "top1PatientPercent": round(top_one / len(records) * 100, 1),
        "top3DiagnosisPercent": round(top_three_recall / len(records) * 100, 1),
        "nonpositivePatients": nonpositive_patients,
        "nonpositivePatientPercent": round(nonpositive_patients / len(records) * 100, 1),
        "meanRecordedRank": round(sum(ranks) / len(ranks), 2),
    }


def workbook_summary(path: pathlib.Path) -> dict:
    questions = load_questions(path)
    rules = build_default_rules(path, questions)
    return {
        "questionnaireEntries": len(questions),
        "scoredQuestions": len({rule.question_id for rule in rules}),
        "rules": len(rules),
    }


def workbook_rules(path: pathlib.Path) -> list[dict]:
    questions = load_questions(path)
    return [
        {
            "category": rule.category,
            "questionId": rule.question_id,
            "answer": rule.answer,
            "weight": rule.weight,
        }
        for rule in build_default_rules(path, questions)
    ]


def main() -> None:
    original = workbook_summary(ORIGINAL_WORKBOOK)
    km2 = workbook_summary(KM2_WORKBOOK)
    october_14 = git_payload(OCTOBER_14_COMMIT, "dist/trained-model.js")
    current_definitions = js_payload((APP / "dist" / "questionnaire-data.js").read_text())
    current = js_payload((APP / "dist" / "trained-model.js").read_text())
    current_cohort = json.loads(CURRENT_COHORT.read_text())
    # One common evaluation cohort is used for all four scorecards. This isolates
    # model changes from cohort-size changes and makes the historical comparison
    # directly interpretable.
    june_2_metrics = evaluate(workbook_rules(ORIGINAL_WORKBOOK), current_cohort, current_definitions["questions"], "support_then_points")
    june_26_metrics = evaluate(current_definitions["rules"], current_cohort, current_definitions["questions"], "support_then_points")
    first_metrics = evaluate(october_14["rules"], current_cohort, current_definitions["questions"], "support_then_points")
    current_metrics = evaluate(current["rules"], current_cohort, current_definitions["questions"], "points")
    payload = {
        "schemaVersion": 1,
        "updated": "October 16, 2026",
        "definitions": {
            "top1": "Patients with at least one recorded diagnosis ranked first.",
            "top3": "Patient-balanced share of recorded diagnoses appearing among the three highest-ranked classes.",
            "nonpositive": "Patients with at least one recorded diagnosis scoring zero or below.",
            "scope": "Every model is evaluated retrospectively on the same current cohort of 65 merged patients and 71 recorded diagnoses. These are aggregate development-set results, not validation or clinical-performance claims.",
        },
        "milestones": [
            {
                "date": "June 2, 2026",
                "shortDate": "Jun 2",
                "name": "Original workbook scorecard",
                "source": ORIGINAL_WORKBOOK.name,
                **original,
                "availablePatients": 0,
                **june_2_metrics,
                "metrics": june_2_metrics,
                "note": "First scoring design. It had no labeled outputs at the time; today it is evaluated retrospectively on all 65 current patients.",
            },
            {
                "date": "June 26, 2026",
                "shortDate": "Jun 26",
                "name": "Expanded baseline scorecard",
                "source": KM2_WORKBOOK.name,
                **km2,
                "availablePatients": 0,
                **june_26_metrics,
                "metrics": june_26_metrics,
                "note": "Expanded baseline question links and weights. It is evaluated retrospectively on all 65 current patients.",
            },
            {
                "date": "October 14, 2026",
                "shortDate": "Oct 14",
                "name": "First labeled calibration",
                "source": "First labeled data pull and historical deployed model",
                **km2,
                "availablePatients": 50,
                **first_metrics,
                "metrics": first_metrics,
                "note": "First labeled calibration, now re-evaluated on all 65 current patients using its historical scorecard.",
            },
            {
                "date": "October 16, 2026",
                "shortDate": "Oct 16",
                "name": "Expanded cohort check",
                "source": "AI data pull.xlsx and current deployed model",
                **km2,
                "availablePatients": 65,
                **current_metrics,
                "metrics": current_metrics,
                "note": "Current scorecard evaluated on all 65 merged patients; six patients have two recorded diagnoses. The new cases have not yet been used for a new calibration.",
            },
        ],
    }
    OUTPUT.write_text("window.NEBULA_PROGRESS = " + json.dumps(payload, indent=2) + ";\n")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
