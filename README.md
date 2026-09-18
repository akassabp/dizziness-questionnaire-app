# Nebula Questionnaire Web App

Local static web version of the restricted Nebula dizziness questionnaire.

## Included behavior

- Uses only questions referenced by the diagnosis sheets in `data/OTO Dizziness Questionnaire -Nebula cloud 5-9-241.xlsx`.
- Uses workbook-derived default expert weights only.
- Excludes `No` from weighted configuration rules.
- Keeps checklist/multi-select scoring at the workbook defaults without showing those entries in the configuration screen.
- Allows experts to edit single-select weights and apply them to scoring.
- Stores the applied configuration only in the current browser.
- Does not include trained or data-derived machine-learning weights.

## Refresh questionnaire data

Run `scripts/extract_workbook.py` with the project Python environment after the workbook changes.

## Local preview

Serve the `dist` directory with any static web server. Opening `index.html` directly also works in modern browsers.
