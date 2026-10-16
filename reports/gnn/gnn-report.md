# Knowledge-Guided GNN experiment

This experiment uses the existing question, answer, diagnosis, sign, and exclusion rules as a fixed heterogeneous graph. A two-layer relational graph encoder generates bounded residual adjustments for the 120 approved evidence edges. Patient scores remain additive and explainable.

## Graph

- 50 question nodes
- 160 answer-option nodes
- 9 diagnosis nodes
- 120 expert-approved evidence edges

## Aggregate results

| Evaluation | Pairwise concordance | Mean recorded rank | Top-1 recorded | Recall at 3 |
|---|---:|---:|---:|---:|
| Baseline development fit | 0.731 | 3.190 | 0.360 | 0.600 |
| Deployed integer development fit | 0.766 | 2.910 | 0.320 | 0.720 |
| GNN development fit | 0.765 | 2.910 | 0.300 | 0.700 |
| Rounded GNN development fit | 0.761 | 2.960 | 0.300 | 0.690 |
| GNN out-of-fold | 0.741 | 3.100 | 0.320 | 0.650 |

## Out-of-fold change from baseline

| Metric | GNN change | 95% patient-bootstrap interval |
|---|---:|---:|
| Pairwise concordance | +0.011 | -0.012 to +0.034 |
| Mean recorded rank (lower is better) | -0.090 | -0.280 to +0.090 |
| Top-1 recorded | -0.040 | -0.120 to +0.040 |
| Recall at 3 | +0.050 | -0.020 to +0.130 |

The GNN improved three ranking measures out of fold, while top-1 declined. Every uncertainty interval includes zero, so this cohort does not establish superiority. The development rows describe fit on the available cohort and must not be presented as validation. This experiment does not replace the deployed model.
