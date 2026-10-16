#!/usr/bin/env python3
"""Create an interactive Plotly architecture diagram for the dizziness GNN."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import plotly.graph_objects as go
from plotly.subplots import make_subplots


def load_assignment(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    return json.loads(text[text.index("=") + 1 :].strip().removesuffix(";"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("reports/gnn"))
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    data = load_assignment(repo / "dist/questionnaire-data.js")
    questions, rules, diagnoses = data["questions"], data["rules"], data["categories"]

    answer_nodes = []
    for qi, question in enumerate(questions):
        for oi, answer in enumerate(question.get("options", [])):
            answer_nodes.append({"question": qi, "questionId": str(question["id"]), "answer": answer, "option": oi})
    answer_lookup = {(a["questionId"], a["answer"].strip().lower()): i for i, a in enumerate(answer_nodes)}
    diagnosis_lookup = {name: i for i, name in enumerate(diagnoses)}

    question_positions = [(0, 0, 1 - 2 * i / max(len(questions) - 1, 1)) for i in range(len(questions))]
    answer_positions = []
    for answer in answer_nodes:
        qz = question_positions[answer["question"]][2]
        answer_positions.append((1, ((answer["option"] % 5) - 2) * 0.08, qz + ((answer["option"] % 7) - 3) * 0.008))
    diagnosis_positions = [(3, 0, 1 - 2 * i / max(len(diagnoses) - 1, 1)) for i in range(len(diagnoses))]

    def edge_trace(edges, color, name, width=1):
        xs, ys, zs = [], [], []
        for start, end in edges:
            xs.extend([start[0], end[0], None])
            ys.extend([start[1], end[1], None])
            zs.extend([start[2], end[2], None])
        return go.Scatter3d(x=xs, y=ys, z=zs, mode="lines", line={"color": color, "width": width}, name=name, hoverinfo="skip")

    qa_edges = [(question_positions[a["question"]], answer_positions[i]) for i, a in enumerate(answer_nodes)]
    positive, negative, exclusion = [], [], []
    for rule in rules:
        ai = answer_lookup.get((str(rule["questionId"]), rule["answer"].strip().lower()))
        if ai is None:
            continue
        pair = (answer_positions[ai], diagnosis_positions[diagnosis_lookup[rule["category"]]])
        if rule["weight"] == -100:
            exclusion.append(pair)
        elif rule["weight"] < 0:
            negative.append(pair)
        else:
            positive.append(pair)

    fig = make_subplots(
        rows=2,
        cols=1,
        specs=[[{"type": "scene"}], [{"type": "table"}]],
        row_heights=[0.78, 0.22],
        vertical_spacing=0.03,
    )
    fig.add_trace(edge_trace(qa_edges, "rgba(120,130,140,.18)", "Question → answer", 1), row=1, col=1)
    fig.add_trace(edge_trace(positive, "rgba(7,148,71,.42)", "Positive evidence", 2), row=1, col=1)
    fig.add_trace(edge_trace(negative, "rgba(210,31,38,.42)", "Negative evidence", 2), row=1, col=1)
    fig.add_trace(edge_trace(exclusion, "rgba(20,20,20,.72)", "Fixed exclusion", 4), row=1, col=1)

    fig.add_trace(
        go.Scatter3d(
            x=[p[0] for p in question_positions], y=[p[1] for p in question_positions], z=[p[2] for p in question_positions],
            mode="markers", marker={"size": 5, "color": "#00274c"}, name=f"Questions ({len(questions)})",
            text=[f"Q {q['id']}<br>{q['prompt']}" for q in questions], hovertemplate="%{text}<extra></extra>",
        ), row=1, col=1,
    )
    fig.add_trace(
        go.Scatter3d(
            x=[p[0] for p in answer_positions], y=[p[1] for p in answer_positions], z=[p[2] for p in answer_positions],
            mode="markers", marker={"size": 3, "color": "#ffcb05"}, name=f"Answer options ({len(answer_nodes)})",
            text=[f"Q {a['questionId']}<br>{a['answer']}" for a in answer_nodes], hovertemplate="%{text}<extra></extra>",
        ), row=1, col=1,
    )
    fig.add_trace(
        go.Scatter3d(
            x=[p[0] for p in diagnosis_positions], y=[p[1] for p in diagnosis_positions], z=[p[2] for p in diagnosis_positions],
            mode="markers+text", marker={"size": 9, "color": "#5b2a86"}, text=diagnoses, textposition="middle right",
            name=f"Diagnosis outputs ({len(diagnoses)})", hovertemplate="%{text}<extra></extra>",
        ), row=1, col=1,
    )

    fig.add_trace(
        go.Table(
            header={"values": ["Stage", "Learned operation", "Expert safeguard"], "fill_color": "#00274c", "font": {"color": "white", "size": 13}, "align": "left"},
            cells={
                "values": [
                    ["Patient activation", "Relational graph encoder", "Residual edge decoder", "Multi-label ranking"],
                    ["Selected answers activate option nodes", "Two message-passing layers share information across the fixed graph", "A neural decoder adjusts approved edge magnitudes within ±25%", "Recorded diagnoses are encouraged to rank above unrecorded classes"],
                    ["No free-text or new features", "Only existing question-answer-diagnosis topology", "Signs preserved; −100 exclusions and unobserved rules frozen", "Scores remain additive and answer-level explainable"],
                ],
                "fill_color": [["#f5f7f8", "white", "#f5f7f8", "white"]] * 3,
                "align": "left",
                "font": {"color": "#172b3a", "size": 12},
                "height": 30,
            },
            columnwidth=[0.8, 1.8, 1.7],
        ), row=2, col=1,
    )

    fig.update_layout(
        title={"text": "Knowledge-Guided Dizziness Graph Neural Network<br><sup>50 question nodes · 160 answer nodes · 9 diagnosis nodes · 120 expert evidence edges</sup>", "x": 0.5},
        height=960,
        margin={"l": 20, "r": 20, "t": 95, "b": 15},
        legend={"orientation": "h", "y": 0.995, "x": 0.5, "xanchor": "center"},
        paper_bgcolor="white",
        scene={
            "xaxis": {"tickvals": [0, 1, 2, 3], "ticktext": ["Questions", "Answers", "GNN messages", "Diagnoses"], "title": "Architecture flow", "showgrid": False},
            "yaxis": {"visible": False},
            "zaxis": {"visible": False},
            "camera": {"eye": {"x": 1.45, "y": 1.25, "z": 0.8}},
            "bgcolor": "#f7f9fb",
        },
    )
    args.output.mkdir(parents=True, exist_ok=True)
    html = args.output / "dizziness-gnn-architecture.html"
    png = args.output / "dizziness-gnn-architecture.png"
    fig.write_html(html, include_plotlyjs="cdn", full_html=True, config={"responsive": True, "displaylogo": False})
    try:
        fig.write_image(png, width=1600, height=1100, scale=1.5)
    except Exception as error:
        print(f"PNG export skipped: {error}")
    print(json.dumps({"html": str(html), "png": str(png) if png.exists() else None}, indent=2))


if __name__ == "__main__":
    main()
