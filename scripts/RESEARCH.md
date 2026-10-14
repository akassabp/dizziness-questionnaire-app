# Local research workflow

Patient files and private audit outputs must remain outside this repository.

1. Extract with `python scripts/prepare_cohort.py /private/source.xlsx /private/cohort.json --cases-dir /private/patient-cases`.
2. Train with `node scripts/train_model.cjs /private/cohort.json`. This updates only public weights and aggregate results in `dist/trained-model.js`; case-level audit output is stored beside the private cohort.
3. Verify with `node scripts/test_model.cjs /private/cohort.json`.
4. Serve `dist` on localhost:8765. With Playwright and Chrome installed, run `node scripts/test_local_import.cjs /private/patient-cases` and `node scripts/test_research_ui.cjs`. The optional `NEBULA_TEST_URL` on the latter selects a deployed site. Fixtures in UI screenshots are synthetic.
5. Review metrics and `dist/methodology.html`. Do not replace expert defaults automatically or claim clinical superiority from training performance.

The browser uses the exact shared score implementation used in training. Only original rule points vary. Initially Defined Weights and Trained AI Model appear simultaneously in independently sorted columns. The interface is questionnaire-only: configuration and model-analysis tabs have been removed. Default rules remain unchanged. Use test_simple_ui.cjs for browser checks; the previous test entry points forward to it.

Run `node scripts/shuffle_cases.cjs /private/patient-cases-multilabel` to randomize filename prefixes while preserving all file contents and patient IDs. Sort by filename to use the mixed ordering. Subsequent training exports preserve existing shuffled names.

Training now merges identical full-source A/B fingerprints at the user's explicit direction, retains the union of diagnoses, and flags conflicting ages as unknown. It exports 50 new files to `../patient-cases-multilabel` relative to the cohort directory. Use these instead of the old 55 single-label cases. The private multi-label audit retains provenance and folds. Other diagnoses are assumed negatives, not confirmed negative labels. The objective is balanced per-diagnosis squared support error plus proximity regularization, with aggregate positive/other support constraints relative to the integer baseline. See the public methodology for the development history. No classification accuracy or exclusive winning diagnosis is used.

The source workbook contains ambiguous or unsupported entries. Exact-match extraction is conservative; missing answers are not clinical negatives. In the current import, “NeuritisHypofunction” is mapped to “Neuritis” and “ScCD” to “Third Window”; clinician confirmation is required. There are no reliable participant identifiers to exclude all repeated-person leakage. See the public methodology for complete limitations and the exploratory objective revision history.
