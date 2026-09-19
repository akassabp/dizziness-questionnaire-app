# Nebula Questionnaire Web App

Static web version of the configurable Nebula dizziness questionnaire.

Public site access uses a lightweight browser-side access-code screen. This is a convenience gate and is not equivalent to server-side authentication.

## Included behavior

- Starts with the questions, classes, and expert weights derived from `data/OTO Dizziness Questionnaire -Nebula cloud 5-9-241.xlsx`.
- Allows experts to add, edit, remove, and reorder questions and answers.
- Supports both single-choice and checklist questions.
- Allows any answer to carry a 0–100 weight for any diagnostic class.
- Allows diagnostic classes to be added or removed.
- Imports and exports the complete configuration as JSON.
- Stores the applied configuration in the current browser; JSON export is the portable backup and sharing format.
- Does not include trained or data-derived machine-learning weights.

## Refresh questionnaire data

Run `scripts/extract_workbook.py` with the project Python environment after the workbook changes.

## Local preview

Serve the `dist` directory with any static web server. Opening `index.html` directly also works in modern browsers.
