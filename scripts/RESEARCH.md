# Local research workflow

Patient files and private audit outputs must remain outside this repository.

1. Extract with `python scripts/prepare_cohort.py /private/source.xlsx /private/cohort.json --cases-dir /private/patient-cases`.
2. Train with `node scripts/train_model.cjs /private/cohort.json`. This updates only public weights and aggregate results in `dist/trained-model.js`; case-level audit output is stored beside the private cohort.
3. Verify with `node scripts/test_model.cjs /private/cohort.json`.
4. Serve `dist` on localhost:8765. With Playwright and Chrome installed, run `node scripts/test_local_import.cjs /private/patient-cases` and `node scripts/test_research_ui.cjs`. The optional `NEBULA_TEST_URL` on the latter selects a deployed site. Fixtures in UI screenshots are synthetic.
5. Review metrics and `dist/methodology.html`. Do not replace expert defaults automatically or claim clinical superiority from training performance.

The browser uses the exact shared score implementation used in training. Only original rule points vary. The trained candidate is opt-in and can be staged for manual configuration review. Default rules remain unchanged.

The source workbook contains ambiguous or unsupported entries. Exact-match extraction is conservative; missing answers are not clinical negatives. In the current import, “NeuritisHypofunction” is mapped to “Neuritis” and “ScCD” to “Third Window”; clinician confirmation is required. There are no reliable participant identifiers to exclude all repeated-person leakage. See the public methodology for complete limitations and the exploratory objective revision history.
