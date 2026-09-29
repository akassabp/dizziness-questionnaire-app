# Nebula Questionnaire Web App

Static web version of the configurable Nebula dizziness questionnaire.

Public site access uses an access-code screen. Entering the code and pressing Enter opens the desktop-style questionnaire.

## Included behavior

- Starts with all active questions, classes, and expert guidance from `OTO Dizziness Questionnaire -Nebula cloud 5-9-241_KM2.xlsx`.
- Shows the weather, food, and beverage detail questions only when their corresponding answer is selected.
- Applies the KM2 negative-evidence calibration: low = half an evidence unit, standard = one unit, strong = two units (capped at 100), and explicit rule-out = -100 points.
- Allows experts to add, edit, remove, and reorder questions and answers.
- Supports both single-choice and checklist questions.
- Allows any answer to carry a 0–100 weight for any diagnostic class.
- Allows diagnostic classes to be added or removed.
- Imports and exports the complete configuration as JSON.
- Stores the applied configuration in the current browser; JSON export is the portable backup and sharing format.
- Does not include trained or data-derived machine-learning weights; the defaults are transparent expert-rule weights and are not a clinical diagnosis.

## Refresh questionnaire data

Run `scripts/extract_workbook.py` with the project Python environment after the workbook changes.

## Local preview

Serve the `dist` directory with any static web server. Opening `index.html` directly also works in modern browsers.
