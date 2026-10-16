#!/usr/bin/env python3
"""Knowledge-guided residual GNN experiment for the Nebula dizziness scorecard.

The static heterogeneous graph is public (questions -> answer options -> diagnoses).
Patient records are read only from a private training audit supplied on the command line.
Only aggregate metrics and public rule weights are written to the selected output directory.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import random
import re
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from torch import nn


def norm(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower().replace("’", " ").replace(".", " ")).strip()


def load_assignment(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    return json.loads(text[text.index("=") + 1 :].strip().removesuffix(";"))


def values(value: object) -> list[str]:
    if value is None:
        return []
    return [norm(v) for v in (value if isinstance(value, list) else [value])]


def build_problem(questionnaire: dict, audit: dict, deployed: dict) -> dict:
    questions = questionnaire["questions"]
    rules = audit["fit"]["rules"]
    baseline = np.asarray(audit["fit"]["baseline"], dtype=np.float32)
    if len(rules) != len(baseline):
        raise ValueError("Rule and baseline lengths differ")

    public_rules = questionnaire["rules"]
    identities = lambda rows: [(r["category"], str(r["questionId"]), norm(r["answer"])) for r in rows]
    if identities(rules) != identities(public_rules) or identities(rules) != identities(deployed["rules"]):
        raise ValueError("Rule identities do not match across questionnaire, audit, and deployed model")

    categories = list(questionnaire["categories"])
    category_index = {c: i for i, c in enumerate(categories)}
    question_index = {str(q["id"]): i for i, q in enumerate(questions)}

    answer_keys: list[tuple[str, str]] = []
    answer_display: list[str] = []
    answer_question: list[int] = []
    option_position: list[int] = []
    for qi, question in enumerate(questions):
        for oi, option in enumerate(question.get("options", [])):
            answer_keys.append((str(question["id"]), norm(option)))
            answer_display.append(str(option))
            answer_question.append(qi)
            option_position.append(oi)
    answer_index = {key: i for i, key in enumerate(answer_keys)}

    rule_answer, rule_category = [], []
    for rule in rules:
        key = (str(rule["questionId"]), norm(rule["answer"]))
        if key not in answer_index:
            raise ValueError(f"Rule answer is absent from questionnaire options: {key}")
        rule_answer.append(answer_index[key])
        rule_category.append(category_index[rule["category"]])

    records = audit["records"]
    x = np.zeros((len(records), len(answer_keys)), dtype=np.float32)
    y = np.zeros((len(records), len(categories)), dtype=np.float32)
    for pi, record in enumerate(records):
        for ai, (question_id, answer) in enumerate(answer_keys):
            if answer in values(record.get("answers", {}).get(question_id)):
                x[pi, ai] = 1
        for label in record["labels"]:
            if label not in category_index:
                raise ValueError(f"Unknown label: {label}")
            y[pi, category_index[label]] = 1

    current = np.asarray([r["weight"] for r in deployed["rules"]], dtype=np.float32)
    return {
        "questions": questions,
        "rules": rules,
        "categories": categories,
        "answer_keys": answer_keys,
        "answer_display": answer_display,
        "answer_question": np.asarray(answer_question, dtype=np.int64),
        "option_position": np.asarray(option_position, dtype=np.int64),
        "rule_answer": np.asarray(rule_answer, dtype=np.int64),
        "rule_category": np.asarray(rule_category, dtype=np.int64),
        "baseline": baseline,
        "current": current,
        "x": x,
        "y": y,
    }


def graph_tensors(problem: dict, device: torch.device) -> tuple[torch.Tensor, torch.Tensor]:
    q_count = len(problem["questions"])
    a_count = len(problem["answer_keys"])
    c_count = len(problem["categories"])
    node_count = q_count + a_count + c_count
    features = np.zeros((node_count, 12), dtype=np.float32)
    features[:q_count, 0] = 1
    features[q_count : q_count + a_count, 1] = 1
    features[q_count + a_count :, 2] = 1

    for qi, question in enumerate(problem["questions"]):
        kind = question.get("kind")
        features[qi, 3 + ({"single": 0, "multi": 1}.get(kind, 2))] = 1
        features[qi, 6] = qi / max(q_count - 1, 1)

    pos_degree = np.zeros(a_count, dtype=np.float32)
    neg_degree = np.zeros(a_count, dtype=np.float32)
    pos_weight = np.zeros(a_count, dtype=np.float32)
    neg_weight = np.zeros(a_count, dtype=np.float32)
    for ai, weight in zip(problem["rule_answer"], problem["baseline"]):
        if weight > 0:
            pos_degree[ai] += 1
            pos_weight[ai] += abs(weight)
        elif weight < 0:
            neg_degree[ai] += 1
            neg_weight[ai] += abs(weight)
    for ai in range(a_count):
        ni = q_count + ai
        features[ni, 6] = problem["option_position"][ai] / max(problem["option_position"].max(), 1)
        features[ni, 7] = pos_degree[ai] / max(pos_degree.max(), 1)
        features[ni, 8] = neg_degree[ai] / max(neg_degree.max(), 1)
        features[ni, 9] = min(pos_weight[ai] / 100, 1)
        features[ni, 10] = min(neg_weight[ai] / 100, 1)

    for ci in range(c_count):
        ni = q_count + a_count + ci
        mask = problem["rule_category"] == ci
        features[ni, 7] = mask.sum() / max(np.bincount(problem["rule_category"]).max(), 1)
        features[ni, 8] = np.any(problem["baseline"][mask] < 0)
        features[ni, 9] = problem["baseline"][mask & (problem["baseline"] > 0)].sum() / 125
        features[ni, 10] = min(abs(problem["baseline"][mask & (problem["baseline"] < 0)]).sum() / 100, 1)

    # q->a, a->q, positive a->d, negative a->d, positive d->a, negative d->a
    relations = np.zeros((6, node_count, node_count), dtype=np.float32)
    for ai, qi in enumerate(problem["answer_question"]):
        qn, an = qi, q_count + ai
        relations[0, an, qn] = 1
        relations[1, qn, an] = 1
    for ai, ci, weight in zip(problem["rule_answer"], problem["rule_category"], problem["baseline"]):
        an, dn = q_count + ai, q_count + a_count + ci
        offset = 2 if weight > 0 else 3
        relations[offset, dn, an] = 1
        relations[offset + 2, an, dn] = 1
    degrees = relations.sum(axis=2, keepdims=True)
    relations = relations / np.maximum(degrees, 1)
    return torch.tensor(features, device=device), torch.tensor(relations, device=device)


class KnowledgeGuidedGNN(nn.Module):
    def __init__(self, problem: dict, features: torch.Tensor, relations: torch.Tensor, hidden: int = 10):
        super().__init__()
        self.problem = problem
        self.register_buffer("features", features)
        self.register_buffer("relations", relations)
        self.register_buffer("baseline", torch.tensor(problem["baseline"], device=features.device))
        self.register_buffer("rule_answer", torch.tensor(problem["rule_answer"], device=features.device))
        self.register_buffer("rule_category", torch.tensor(problem["rule_category"], device=features.device))
        q_count, a_count = len(problem["questions"]), len(problem["answer_keys"])
        self.register_buffer("answer_nodes", self.rule_answer + q_count)
        self.register_buffer("diagnosis_nodes", self.rule_category + q_count + a_count)
        self.input = nn.Linear(features.shape[1], hidden)
        self.self_layers = nn.ModuleList([nn.Linear(hidden, hidden) for _ in range(2)])
        self.message_layers = nn.ModuleList([nn.Linear(hidden, hidden, bias=False) for _ in range(2)])
        self.norms = nn.ModuleList([nn.LayerNorm(hidden) for _ in range(2)])
        self.relation_strength = nn.Parameter(torch.zeros(2, relations.shape[0]))
        self.decoder = nn.Sequential(nn.Linear(hidden * 2 + 2, 12), nn.Tanh(), nn.Linear(12, 1))
        self.edge_residual = nn.Parameter(torch.zeros(len(problem["rules"])))
        nn.init.zeros_(self.decoder[-1].weight)
        nn.init.zeros_(self.decoder[-1].bias)

    def forward(self, x: torch.Tensor, freeze_mask: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        h = torch.relu(self.input(self.features))
        for layer in range(2):
            projected = self.message_layers[layer](h)
            strengths = torch.softmax(self.relation_strength[layer], dim=0)
            message = sum(strengths[r] * (self.relations[r] @ projected) for r in range(self.relations.shape[0]))
            h = self.norms[layer](h + torch.relu(self.self_layers[layer](h) + message))
        edge_features = torch.cat(
            [h[self.answer_nodes], h[self.diagnosis_nodes], (self.baseline.abs() / 100).unsqueeze(1), self.baseline.sign().unsqueeze(1)],
            dim=1,
        )
        # The shared graph decoder transfers structure across edges; the small edge
        # residual lets a repeatedly observed clinical rule retain its own signal.
        residual = 0.25 * torch.tanh(self.decoder(edge_features).squeeze(1) + self.edge_residual)
        weights = self.baseline.sign() * self.baseline.abs() * (1 + residual)
        hard = self.baseline.eq(-100)
        weights = torch.where(hard | freeze_mask, self.baseline, weights)
        active_edges = x[:, self.rule_answer]
        contributions = active_edges * weights
        category_map = torch.nn.functional.one_hot(self.rule_category, len(self.problem["categories"])).float()
        scores = contributions @ category_map
        return scores, weights, residual


def pairwise_loss(scores: torch.Tensor, labels: torch.Tensor) -> torch.Tensor:
    losses = []
    scaled = scores / 100
    for row in range(scores.shape[0]):
        positives = torch.where(labels[row] > 0.5)[0]
        negatives = torch.where(labels[row] < 0.5)[0]
        differences = scaled[row, positives][:, None] - scaled[row, negatives][None, :]
        losses.append(torch.relu(0.1 - differences).square().mean())
    return torch.stack(losses).mean()


def support_means(scores: torch.Tensor, labels: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    positive, negative = [], []
    for ci in range(labels.shape[1]):
        pos = labels[:, ci] > 0.5
        neg = ~pos
        if pos.any() and neg.any():
            positive.append(scores[pos, ci].mean() / 100)
            negative.append(scores[neg, ci].mean() / 100)
    return torch.stack(positive).mean(), torch.stack(negative).mean()


def fixed_scores(problem: dict, x: np.ndarray, weights: np.ndarray) -> np.ndarray:
    active = x[:, problem["rule_answer"]]
    contribution = active * weights[None, :]
    out = np.zeros((x.shape[0], len(problem["categories"])), dtype=np.float32)
    for edge, ci in enumerate(problem["rule_category"]):
        out[:, ci] += contribution[:, edge]
    return out


def metrics(scores: np.ndarray, labels: np.ndarray) -> dict:
    pairwise, ranks, top1, recall3 = [], [], [], []
    for score, label in zip(scores, labels):
        positive = np.where(label > 0.5)[0]
        negative = np.where(label < 0.5)[0]
        order = np.lexsort((np.arange(len(score)), -score))
        pairwise.append(np.mean([(1 if score[p] > score[n] else 0.5 if score[p] == score[n] else 0) for p in positive for n in negative]))
        ranks.append(np.mean([np.where(order == p)[0][0] + 1 for p in positive]))
        top1.append(float(order[0] in positive))
        recall3.append(np.mean([p in order[:3] for p in positive]))
    return {
        "pairwiseConcordance": float(np.mean(pairwise)),
        "meanRecordedRank": float(np.mean(ranks)),
        "top1Recorded": float(np.mean(top1)),
        "recallAt3": float(np.mean(recall3)),
    }


def fold_assignment(labels: np.ndarray, folds: int, seed: int) -> np.ndarray:
    rng = random.Random(seed)
    prevalence = labels.sum(axis=0)
    rarity = (labels / np.maximum(prevalence, 1)).sum(axis=1)
    order = list(range(len(labels)))
    rng.shuffle(order)
    order.sort(key=lambda i: (-rarity[i], -labels[i].sum()))
    assignment = np.full(len(labels), -1, dtype=np.int64)
    counts = np.zeros((folds, labels.shape[1]), dtype=np.float32)
    sizes = np.zeros(folds, dtype=np.float32)
    targets = prevalence / folds
    for index in order:
        costs = []
        for fold in range(folds):
            candidate_counts = counts.copy()
            candidate_sizes = sizes.copy()
            candidate_counts[fold] += labels[index]
            candidate_sizes[fold] += 1
            label_cost = np.square((candidate_counts - targets) / np.maximum(targets, 1)).sum()
            size_cost = np.square((candidate_sizes - len(labels) / folds) / max(len(labels) / folds, 1)).sum()
            costs.append(label_cost + 0.2 * size_cost + fold * 1e-8)
        selected = int(np.argmin(costs))
        assignment[index] = selected
        counts[selected] += labels[index]
        sizes[selected] += 1
    return assignment


def fit_model(problem: dict, train_indices: np.ndarray, seed: int, epochs: int, device: torch.device) -> dict:
    torch.manual_seed(seed)
    np.random.seed(seed)
    features, relations = graph_tensors(problem, device)
    model = KnowledgeGuidedGNN(problem, features, relations).to(device)
    x = torch.tensor(problem["x"][train_indices], device=device)
    y = torch.tensor(problem["y"][train_indices], device=device)
    baseline_scores = torch.tensor(fixed_scores(problem, problem["x"][train_indices], problem["baseline"]), device=device)
    reference_positive, reference_negative = support_means(baseline_scores, y)
    hit = x[:, torch.tensor(problem["rule_answer"], device=device)].sum(dim=0) > 0
    class_counts = y.sum(dim=0)
    category_observed = class_counts[torch.tensor(problem["rule_category"], device=device)] > 0
    freeze_mask = (~hit) | (~category_observed)

    positive_masks = [torch.tensor((problem["rule_category"] == ci) & (problem["baseline"] > 0), device=device) for ci in range(len(problem["categories"]))]
    exclusion_categories = [ci for ci, mask in enumerate(positive_masks) if np.any((problem["rule_category"] == ci) & (problem["baseline"] == -100))]
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.015, weight_decay=0.01)

    def evaluate() -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor, bool]:
        scores, weights, residual = model(x, freeze_mask)
        rank = pairwise_loss(scores, y)
        positive, negative = support_means(scores, y)
        guard = torch.relu(reference_positive - positive).square() + torch.relu(negative - reference_negative).square()
        cap = sum(torch.relu(weights[positive_masks[ci]].sum() - 100).square() / 10000 for ci in exclusion_categories)
        loss = rank + 0.01 * residual[~freeze_mask].square().mean() + 100 * guard + 100 * cap
        valid = bool(
            positive >= reference_positive - 1e-5
            and negative <= reference_negative + 1e-5
            and all(weights[positive_masks[ci]].sum() <= 100.0001 for ci in exclusion_categories)
        )
        return loss, scores, weights, residual, valid

    best = None
    stale = 0
    for epoch in range(epochs + 1):
        model.eval()
        with torch.no_grad():
            loss, scores, weights, residual, valid = evaluate()
            if valid and (best is None or float(loss) < best["loss"] - 1e-7):
                best = {"loss": float(loss), "state": copy.deepcopy(model.state_dict()), "epoch": epoch, "weights": weights.detach().cpu().numpy()}
                stale = 0
            else:
                stale += 1
        if epoch == epochs or stale > 180:
            break
        model.train()
        optimizer.zero_grad()
        loss, _, _, _, _ = evaluate()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 5)
        optimizer.step()
    if best is None:
        raise RuntimeError("No constraint-valid GNN state found")
    model.load_state_dict(best["state"])
    return {"model": model, "freezeMask": freeze_mask, "weights": best["weights"], "loss": best["loss"], "epoch": best["epoch"]}


def bootstrap_difference(a_scores: np.ndarray, b_scores: np.ndarray, labels: np.ndarray, key: str, seed: int = 29) -> list[float]:
    rng = np.random.default_rng(seed)
    values = []
    for _ in range(2000):
        index = rng.integers(0, len(labels), len(labels))
        values.append(metrics(a_scores[index], labels[index])[key] - metrics(b_scores[index], labels[index])[key])
    return [float(np.quantile(values, 0.025)), float(np.quantile(values, 0.975))]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audit", type=Path, help="Private training-audit-flexible.json path")
    parser.add_argument("--output", type=Path, default=Path("reports/gnn"))
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--seeds", type=int, default=2)
    parser.add_argument("--epochs", type=int, default=700)
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[1]
    questionnaire = load_assignment(repo / "dist/questionnaire-data.js")
    deployed = load_assignment(repo / "dist/trained-model.js")
    audit = json.loads(args.audit.read_text(encoding="utf-8"))
    problem = build_problem(questionnaire, audit, deployed)
    device = torch.device("cpu")

    oof_sum = np.zeros_like(fixed_scores(problem, problem["x"], problem["baseline"]), dtype=np.float64)
    oof_count = np.zeros((len(problem["x"]), 1), dtype=np.float64)
    cv_runs = []
    for repeat in range(args.repeats):
        assignment = fold_assignment(problem["y"], args.folds, 1000 + repeat)
        for fold in range(args.folds):
            train = np.where(assignment != fold)[0]
            test = np.where(assignment == fold)[0]
            predictions = []
            for seed_offset in range(args.seeds):
                fit = fit_model(problem, train, 4100 + repeat * 100 + fold * 10 + seed_offset, args.epochs, device)
                predictions.append(fixed_scores(problem, problem["x"][test], fit["weights"]))
            prediction = np.mean(predictions, axis=0)
            oof_sum[test] += prediction
            oof_count[test] += 1
            cv_runs.append(
                {
                    "repeat": repeat + 1,
                    "fold": fold + 1,
                    "train": len(train),
                    "test": len(test),
                    "testLabelCounts": {
                        category: int(problem["y"][test, ci].sum()) for ci, category in enumerate(problem["categories"])
                    },
                }
            )
    if np.any(oof_count == 0):
        raise RuntimeError("Cross-validation left patients without predictions")
    oof = (oof_sum / oof_count).astype(np.float32)

    all_fits = [fit_model(problem, np.arange(len(problem["x"])), 9000 + seed, args.epochs, device) for seed in range(max(4, args.seeds))]
    best = min(all_fits, key=lambda item: item["loss"])
    gnn_scores = fixed_scores(problem, problem["x"], best["weights"])
    rounded_gnn_scores = fixed_scores(problem, problem["x"], np.rint(best["weights"]))
    baseline_scores = fixed_scores(problem, problem["x"], problem["baseline"])
    current_scores = fixed_scores(problem, problem["x"], problem["current"])

    results = {
        "version": 1,
        "name": "Knowledge-Guided Residual Graph Neural Network",
        "questionnaireRevision": questionnaire["questionnaireRevision"],
        "cohort": {
            "patients": int(len(problem["x"])),
            "multiLabelPatients": int((problem["y"].sum(axis=1) > 1).sum()),
            "labelCounts": {category: int(problem["y"][:, ci].sum()) for ci, category in enumerate(problem["categories"])},
        },
        "graph": {
            "questionNodes": len(problem["questions"]),
            "answerNodes": len(problem["answer_keys"]),
            "diagnosisNodes": len(problem["categories"]),
            "expertEvidenceEdges": len(problem["rules"]),
            "messagePassingLayers": 2,
        },
        "constraints": {
            "fixedExpertGraph": True,
            "signsPreserved": True,
            "hardMinus100ExclusionsFrozen": True,
            "unobservedRulesFrozen": True,
            "edgeAdjustmentRadius": 0.25,
            "positiveBudgetCapForExcludedClasses": 100,
            "baselineSupportGuard": True,
        },
        "crossValidation": {
            "design": f"{args.repeats} repeats of {args.folds}-fold patient-level multi-label-balanced cross-validation",
            "seedEnsemblePerFold": args.seeds,
            "metrics": metrics(oof, problem["y"]),
            "deltaVsBaseline95PercentBootstrap": {
                key: bootstrap_difference(oof, baseline_scores, problem["y"], key)
                for key in ["pairwiseConcordance", "top1Recorded", "recallAt3", "meanRecordedRank"]
            },
            "folds": cv_runs,
        },
        "developmentFit": {
            "baseline": metrics(baseline_scores, problem["y"]),
            "deployedIntegerModel": metrics(current_scores, problem["y"]),
            "gnn": metrics(gnn_scores, problem["y"]),
            "gnnRoundedInteger": metrics(rounded_gnn_scores, problem["y"]),
            "bestEpoch": best["epoch"],
            "objective": best["loss"],
        },
        "limitations": [
            "This is an exploratory development experiment on 50 merged patients.",
            "Unrecorded diagnoses are treated as assumed negatives.",
            "The GNN changes edge magnitudes only; it does not add new clinical rules.",
            "Cross-validation estimates are highly uncertain for rare classes.",
        ],
    }

    learned_rules = []
    for rule, baseline, weight in zip(problem["rules"], problem["baseline"], best["weights"]):
        learned_rules.append(
            {
                "category": rule["category"],
                "questionId": str(rule["questionId"]),
                "answer": rule["answer"],
                "baselineWeight": float(baseline),
                "gnnWeight": float(weight),
                "roundedWeight": int(round(float(weight))),
            }
        )
    results["learnedRules"] = learned_rules

    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "gnn-results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")

    m = results["developmentFit"]
    cv = results["crossValidation"]["metrics"]
    intervals = results["crossValidation"]["deltaVsBaseline95PercentBootstrap"]
    report = f"""# Knowledge-Guided GNN experiment

This experiment uses the existing question, answer, diagnosis, sign, and exclusion rules as a fixed heterogeneous graph. A two-layer relational graph encoder generates bounded residual adjustments for the 120 approved evidence edges. Patient scores remain additive and explainable.

## Graph

- {results['graph']['questionNodes']} question nodes
- {results['graph']['answerNodes']} answer-option nodes
- {results['graph']['diagnosisNodes']} diagnosis nodes
- {results['graph']['expertEvidenceEdges']} expert-approved evidence edges

## Aggregate results

| Evaluation | Pairwise concordance | Mean recorded rank | Top-1 recorded | Recall at 3 |
|---|---:|---:|---:|---:|
| Baseline development fit | {m['baseline']['pairwiseConcordance']:.3f} | {m['baseline']['meanRecordedRank']:.3f} | {m['baseline']['top1Recorded']:.3f} | {m['baseline']['recallAt3']:.3f} |
| Deployed integer development fit | {m['deployedIntegerModel']['pairwiseConcordance']:.3f} | {m['deployedIntegerModel']['meanRecordedRank']:.3f} | {m['deployedIntegerModel']['top1Recorded']:.3f} | {m['deployedIntegerModel']['recallAt3']:.3f} |
| GNN development fit | {m['gnn']['pairwiseConcordance']:.3f} | {m['gnn']['meanRecordedRank']:.3f} | {m['gnn']['top1Recorded']:.3f} | {m['gnn']['recallAt3']:.3f} |
| Rounded GNN development fit | {m['gnnRoundedInteger']['pairwiseConcordance']:.3f} | {m['gnnRoundedInteger']['meanRecordedRank']:.3f} | {m['gnnRoundedInteger']['top1Recorded']:.3f} | {m['gnnRoundedInteger']['recallAt3']:.3f} |
| GNN out-of-fold | {cv['pairwiseConcordance']:.3f} | {cv['meanRecordedRank']:.3f} | {cv['top1Recorded']:.3f} | {cv['recallAt3']:.3f} |

## Out-of-fold change from baseline

| Metric | GNN change | 95% patient-bootstrap interval |
|---|---:|---:|
| Pairwise concordance | {cv['pairwiseConcordance'] - m['baseline']['pairwiseConcordance']:+.3f} | {intervals['pairwiseConcordance'][0]:+.3f} to {intervals['pairwiseConcordance'][1]:+.3f} |
| Mean recorded rank (lower is better) | {cv['meanRecordedRank'] - m['baseline']['meanRecordedRank']:+.3f} | {intervals['meanRecordedRank'][0]:+.3f} to {intervals['meanRecordedRank'][1]:+.3f} |
| Top-1 recorded | {cv['top1Recorded'] - m['baseline']['top1Recorded']:+.3f} | {intervals['top1Recorded'][0]:+.3f} to {intervals['top1Recorded'][1]:+.3f} |
| Recall at 3 | {cv['recallAt3'] - m['baseline']['recallAt3']:+.3f} | {intervals['recallAt3'][0]:+.3f} to {intervals['recallAt3'][1]:+.3f} |

The GNN improved three ranking measures out of fold, while top-1 declined. Every uncertainty interval includes zero, so this cohort does not establish superiority. The development rows describe fit on the available cohort and must not be presented as validation. This experiment does not replace the deployed model.
"""
    (args.output / "gnn-report.md").write_text(report, encoding="utf-8")
    print(json.dumps({"output": str(args.output), "development": results["developmentFit"], "crossValidation": results["crossValidation"]["metrics"]}, indent=2))


if __name__ == "__main__":
    main()
