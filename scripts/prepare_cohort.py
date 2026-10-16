"""Extract a private browser-import cohort. Never put its output in dist/ or Git.

Only existing structured questionnaire options are retained. Labels come from
sheet membership; they are recorded labels, not independently verified outcomes.
"""
import argparse
import collections
import datetime
import hashlib
import json
import pathlib
import re
import openpyxl


def norm(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value).lower()).strip()


LABELS = {"BPPV": "BPPV", "VMigraine": "Migraine",
          "NeuritisHypofunction": "Neuritis", "Menieres": "Meniere's",
          "PPPD": "PPPD", "ScCD": "Third Window", "Bilateral wkns": "Bilateral"}

# Explicit semantic equivalences only; OR answers such as "sneezing or blowing
# your nose" are not safely equivalent to "blowing your nose" alone.
OPTION_ALIASES = {
    "259372": {
        "stress": "stress, nerves, or anxiety",
        "nerves or anxiety": "stress, nerves, or anxiety",
        "supermarket aisles": "supermarket aisles, malls, or tunnels",
        "malls": "supermarket aisles, malls, or tunnels",
        "tunnels": "supermarket aisles, malls, or tunnels",
    },
    "259381": {"panic feeling or a sudden need to leave a place": "panic feeling or sudden need to leave a place"},
}


def extract(source, definitions):
    wb = openpyxl.load_workbook(source, read_only=True, data_only=True)
    questions = {norm(q["prompt"]): q for q in definitions["questions"]}
    records, audit, unknown = [], [], collections.Counter()
    for sheet in wb:
        label = LABELS[sheet.title.split("(")[0].strip()]
        blocks, block = [], []
        for rownum, row in enumerate(sheet.iter_rows(min_col=1, max_col=4), start=1):
            values = [c.value for c in row]
            if any(v is not None and v != "" for v in values):
                # A formatted separator row can yield read-only EmptyCell objects,
                # which do not expose a row attribute. The enumerated worksheet row
                # is stable for both ordinary and formatted-empty rows.
                block.append((rownum, values))
            elif block:
                blocks.append(block)
                block = []
        if block:
            blocks.append(block)
        expected = int(sheet.title.split("(")[1].rstrip(")"))
        audit.append({"sheet": sheet.title, "tabCount": expected, "records": len(blocks)})
        for block in blocks:
            answers, issues, current = {}, collections.Counter(), None
            unscored, mapping_audit = {}, []
            conflicts = set()
            age = next((r[3] for _, r in block if isinstance(r[3], (int, float)) and 0 <= r[3] <= 120), None)
            sex = next((r[2] for _, r in block if r[2] in ("Male", "Female")), None)
            for rownum, (prompt, answer, _, _) in block:
                if prompt is not None and str(prompt).strip():
                    current = questions.get(norm(prompt))
                    if not current and norm(prompt) not in ("question", "uestion", "estion"):
                        issues["question_not_in_app"] += 1
                if current is None or answer is None or answer == "":
                    continue
                if current["kind"] not in ("single", "multi"):
                    issues["text_date_or_numeric_excluded"] += 1
                    continue
                if isinstance(answer, (datetime.date, datetime.datetime)):
                    # Excel can coerce a range such as 1-2 into a date; do not guess.
                    issues["excel_date_in_choice_field"] += 1
                    continue
                options = {norm(o): o for o in current["options"]}
                mapped = options.get(norm(answer))
                alias = OPTION_ALIASES.get(current["id"], {}).get(norm(answer))
                if mapped is None and alias in current["options"]:
                    mapped = alias
                    issues["equivalent_option_mapped"] += 1
                    mapping_audit.append({"questionId": current["id"], "cell": f"B{rownum}", "sourceAnswer": str(answer), "mappedAnswer": mapped})
                if mapped is None:
                    issues["unmatched_option"] += 1
                    # Preserve structured choices that are absent from the current
                    # questionnaire without guessing a scoring equivalence. Free-text
                    # narratives never reach this choice-only branch.
                    unmatched = unscored.setdefault(current["id"], {"reason": "source_answer_not_in_current_questionnaire", "values": []})
                    if str(answer) not in unmatched["values"]:
                        unmatched["values"].append(str(answer))
                    unknown[(current["id"], str(answer))] += 1
                    continue
                qid = current["id"]
                if qid in conflicts:
                    if mapped not in unscored[qid]["values"]:
                        unscored[qid]["values"].append(mapped)
                    continue
                if current["kind"] == "multi":
                    answers.setdefault(qid, [])
                    if mapped not in answers[qid]:
                        answers[qid].append(mapped)
                elif qid in answers and answers[qid] != mapped:
                    issues["conflicting_single_answer"] += 1
                    unscored[qid] = {"reason": "multiple_answers_for_single_choice", "values": [answers[qid], mapped]}
                    del answers[qid]
                    conflicts.add(qid)
                else:
                    answers[qid] = mapped
            records.append({"id": f"CASE-{len(records)+1:03d}", "label": label,
                            "sourceAnswerFingerprint": hashlib.sha256(json.dumps([(r[0], r[1]) for _, r in block], default=str, ensure_ascii=False).encode()).hexdigest(),
                            "age": age, "sex": sex, "answers": answers,
                            "unscoredAnswers": unscored, "mappingAudit": mapping_audit,
                            "issues": dict(issues), "sourceSheet": sheet.title,
                            "sourceRows": [block[0][0], block[-1][0]]})
    wb.close()
    return {"schemaVersion": 2, "questionnaireRevision": definitions.get("questionnaireRevision"), "sourceWorkbook": pathlib.Path(source).name, "labelBasis": "Worksheet membership; other diagnoses not recorded",
            "sourceSha256": hashlib.sha256(pathlib.Path(source).read_bytes()).hexdigest(),
            "records": records, "audit": audit}, unknown


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    parser.add_argument("--cases-dir", type=pathlib.Path)
    args = parser.parse_args()
    repo = pathlib.Path(__file__).resolve().parents[1]
    if repo == args.output.resolve() or repo in args.output.resolve().parents:
        parser.error("Store patient output outside the public website repository.")
    if args.cases_dir and (repo == args.cases_dir.resolve() or repo in args.cases_dir.resolve().parents):
        parser.error("Store patient cases outside the public website repository.")
    definitions = json.loads((repo / "dist/questionnaire-data.js").read_text().split("=", 1)[1].strip().rstrip(";"))
    cohort, unknown = extract(args.workbook, definitions)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(cohort, indent=2))
    if args.cases_dir:
        args.cases_dir.mkdir(parents=True, exist_ok=True)
        for record in cohort["records"]:
            payload = {"format": "nebula-patient-case", "version": 1,
                       "questionnaire_revision": definitions.get("questionnaireRevision"),
                       "patient": {"anonymous_id": record["id"], "age": record["age"],
                                   "sex": record["sex"], "recorded_label": record["label"]},
                       "answers": record["answers"], "unscored_answers": record["unscoredAnswers"], "import_warnings": record["issues"]}
            (args.cases_dir / (record["id"] + ".json")).write_text(json.dumps(payload, indent=2))
    print(json.dumps({"records": len(cohort["records"]), "audit": cohort["audit"],
                      "issues": dict(sum((collections.Counter(r["issues"]) for r in cohort["records"]), collections.Counter())),
                      "unmatched_choice_counts": [{"questionId": k[0], "answer": k[1], "count": v} for k,v in unknown.items()]}, indent=2))
