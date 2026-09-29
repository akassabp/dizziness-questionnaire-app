from __future__ import annotations

import json
import sys
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = APP_DIR.parent
sys.path.insert(0, str(PROJECT_DIR))

from scoring_core import build_default_rules, load_questions, normalized  # noqa: E402


WORKBOOK_PATH = PROJECT_DIR / "OTO Dizziness Questionnaire -Nebula cloud 5-9-241_KM2.xlsx"
OUTPUT_PATH = APP_DIR / "dist" / "questionnaire-data.js"

BRANCHING_QUESTIONS = {
    "260605": {"questionId": "260450", "answer": "changes in the weather"},
    "260606": {"questionId": "260450", "answer": "certain foods"},
    "260607": {"questionId": "260450", "answer": "certain beverages"},
}


def main() -> None:
    questions = load_questions(WORKBOOK_PATH)
    workbook_rules = build_default_rules(WORKBOOK_PATH, questions)
    rules = [
        {
            "category": rule.category,
            "questionId": rule.question_id,
            "answer": rule.answer,
            "weight": rule.weight,
            "editable": True,
            "source": rule.source,
        }
        for rule in workbook_rules
    ]

    all_questions = []
    for question in questions:
        item = {
            "id": question.question_id,
            "prompt": question.prompt,
            "kind": question.kind,
            "options": question.options,
        }
        if question.question_id in BRANCHING_QUESTIONS:
            item["showWhen"] = BRANCHING_QUESTIONS[question.question_id]
        all_questions.append(item)

    payload = {
        "version": 2,
        "sourceWorkbook": WORKBOOK_PATH.name,
        "questions": all_questions,
        "rules": rules,
        "categories": sorted({rule["category"] for rule in rules}, key=str.casefold),
        "policy": {
            "defaultWeightsOnly": True,
            "machineLearningWeightsIncluded": False,
            "includesAllActiveQuestions": True,
            "negativeEvidenceCalibration": {
                "low": "0.5 positive evidence units",
                "standard": "1 positive evidence unit",
                "strong": "2 positive evidence units, capped at 100 points",
                "ruleOut": "-100 points",
            },
            "multiSelectWeightsEditable": True,
        },
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        "window.NEBULA_DATA = " + json.dumps(payload, indent=2, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "questions": len(all_questions),
                "rules": len(rules),
                "editableRules": sum(bool(rule["editable"]) for rule in rules),
                "fixedRules": sum(not bool(rule["editable"]) for rule in rules),
                "noAnswerRules": sum(normalized(rule["answer"]) == "no" for rule in rules),
                "output": str(OUTPUT_PATH),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
