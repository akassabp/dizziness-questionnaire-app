window.NEBULA_PROGRESS = {
  "schemaVersion": 1,
  "updated": "October 16, 2026",
  "definitions": {
    "top1": "Patients with at least one recorded diagnosis ranked first.",
    "top3": "Patient-balanced share of recorded diagnoses appearing among the three highest-ranked classes.",
    "nonpositive": "Patients with at least one recorded diagnosis scoring zero or below.",
    "scope": "Aggregate development-set results only; these are not validation or clinical-performance claims."
  },
  "milestones": [
    {
      "date": "June 2, 2026",
      "shortDate": "Jun 2",
      "name": "Original workbook scorecard",
      "source": "OTO Dizziness Questionnaire -Nebula cloud 5-9-241.xlsx",
      "questionnaireEntries": 50,
      "scoredQuestions": 29,
      "rules": 103,
      "patients": 0,
      "recordedDiagnoses": 0,
      "metrics": null,
      "note": "First scoring design. No labeled patient outputs were available for evaluation."
    },
    {
      "date": "June 26, 2026",
      "shortDate": "Jun 26",
      "name": "Expanded baseline scorecard",
      "source": "OTO Dizziness Questionnaire -Nebula cloud 5-9-241_KM2.xlsx",
      "questionnaireEntries": 50,
      "scoredQuestions": 30,
      "rules": 120,
      "patients": 0,
      "recordedDiagnoses": 0,
      "metrics": null,
      "note": "Expanded questionnaire and baseline weights. No labeled patient outputs were available for evaluation."
    },
    {
      "date": "October 14, 2026",
      "shortDate": "Oct 14",
      "name": "First labeled calibration",
      "source": "First labeled data pull and historical deployed model",
      "questionnaireEntries": 50,
      "scoredQuestions": 30,
      "rules": 120,
      "patients": 50,
      "recordedDiagnoses": 55,
      "top1PatientPercent": 36.0,
      "top3DiagnosisPercent": 70.0,
      "nonpositivePatients": 6,
      "nonpositivePatientPercent": 12.0,
      "meanRecordedRank": 2.97,
      "metrics": {
        "patients": 50,
        "recordedDiagnoses": 55,
        "top1PatientPercent": 36.0,
        "top3DiagnosisPercent": 70.0,
        "nonpositivePatients": 6,
        "nonpositivePatientPercent": 12.0,
        "meanRecordedRank": 2.97
      },
      "note": "Training-set fit on the first 50 merged patients; five patients had two recorded diagnoses."
    },
    {
      "date": "October 16, 2026",
      "shortDate": "Oct 16",
      "name": "Expanded cohort check",
      "source": "AI data pull.xlsx and current deployed model",
      "questionnaireEntries": 50,
      "scoredQuestions": 30,
      "rules": 120,
      "patients": 65,
      "recordedDiagnoses": 71,
      "top1PatientPercent": 32.3,
      "top3DiagnosisPercent": 70.8,
      "nonpositivePatients": 5,
      "nonpositivePatientPercent": 7.7,
      "meanRecordedRank": 2.96,
      "metrics": {
        "patients": 65,
        "recordedDiagnoses": 71,
        "top1PatientPercent": 32.3,
        "top3DiagnosisPercent": 70.8,
        "nonpositivePatients": 5,
        "nonpositivePatientPercent": 7.7,
        "meanRecordedRank": 2.96
      },
      "note": "Current scorecard evaluated on 65 merged patients; six patients have two recorded diagnoses. The new cases have not yet been used for a new calibration."
    }
  ]
};
