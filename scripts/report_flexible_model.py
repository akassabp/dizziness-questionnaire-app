"""Private paired evaluation of the flexible-total experiment."""
import json,pathlib,sys,html
import numpy as np
p=pathlib.Path(sys.argv[1]).resolve();source=pathlib.Path(sys.argv[2]);repo=pathlib.Path(__file__).resolve().parents[1]
if p==repo or repo in p.parents:raise ValueError('Private report outside repository required')
s=json.loads((p/'summary.json').read_text());reps=json.loads((p/'private-predictions.json').read_text());d=json.loads(source.read_text());cases=d['cases']
def rank(scores):return sorted(scores,key=lambda c:(-scores[c]['percent'],-scores[c]['points'],c.casefold()))
def individual(scores,labels):
 order=rank(scores);positive=[order.index(c)+1 for c in labels];others=[c for c in order if c not in labels];pair=[]
 for c in labels:
  for o in others:
   delta=scores[c]['percent']-scores[o]['percent'] or scores[c]['points']-scores[o]['points'];pair.append(1 if delta>0 else .5 if delta==0 else 0)
 return [np.mean(pair),np.mean(positive),float(order[0] in labels),np.mean([r<=3 for r in positive])]
values={m:np.array([[individual(rep['predictions'][m][i],r['labels']) for i,r in enumerate(cases)] for rep in reps]) for m in ['fixed','flexible']}
delta=(values['flexible']-values['fixed']).mean(axis=0);rng=np.random.default_rng(20261015);boot=np.array([delta[rng.integers(0,len(cases),len(cases))].mean(axis=0) for _ in range(10000)])
names=['pairwiseConcordance','meanRecordedRank','top1Recorded','recallAt3'];intervals={k:{'difference':float(delta[:,i].mean()),'conditional95':np.quantile(boot[:,i],[.025,.975]).tolist()} for i,k in enumerate(names)}
for model in values:
 for i,k in enumerate(names):assert abs(values[model][:,:,i].mean()-s['means'][model][k])<1e-10,(model,k)
class_rows=[]
for c in sorted({c for r in cases for c in r['labels']}):
 ids=[i for i,r in enumerate(cases) if c in r['labels']];item={'class':c,'cases':len(ids)}
 for m in ['fixed','flexible']:
  ranks=[rank(rep['predictions'][m][i]).index(c)+1 for rep in reps for i in ids]
  item[m]={'meanRank':float(np.mean(ranks)),'top3':float(np.mean(np.array(ranks)<=3))}
 class_rows.append(item)
(p/'paired-comparison.json').write_text(json.dumps({'bootstrap':intervals,'classes':class_rows},indent=2))
e=html.escape
def table(head,rows):return '<div style="overflow:auto"><table><tr>'+''.join('<th>'+e(x)+'</th>' for x in head)+'</tr>'+''.join('<tr>'+''.join('<td>'+str(x)+'</td>' for x in row)+'</tr>' for row in rows)+'</table></div>'
def pct(x):return f'{x*100:.2f}%'
out=['''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flexible point totals experiment</title><style>body{font:16px/1.6 system-ui;background:#f5f7fa;color:#213549;max-width:1100px;margin:35px auto;padding:0 24px 60px}h1{line-height:1.2}h2{margin-top:36px}table{border-collapse:collapse;width:100%;background:white}th,td{padding:12px;text-align:left;border:1px solid #d2dee8}th{background:#e4edf5}.notice{background:#fff0d7;padding:20px;border-left:5px solid #b68120}a{color:#2465a4}</style><p>Private research • 15 October 2026</p><h1>Flexible integer point totals: tested, not promoted</h1><div class="notice">The experiment helps Meniere’s and Neuritis top-three placement, but does not improve overall held-out ranking. The existing website model remains deployed. Candidate weights are saved privately for further review.</div>
<h2>What changed</h2><p>Same questions and original rule identities. Whole-number weights, original signs, fixed −100 rules, and unobserved-rule/category freezing are preserved. Each adjustable weight stays within ±25% of its integer baseline (minimum radius one point). Positive category budgets can vary between 75% and 125% of their original totals; categories containing a −100 rule cannot exceed their original positive total, so a larger budget cannot overwhelm that rule.</p><p>Ranking uses net points directly, not points divided by each category’s maximum. The objective is a patient-balanced pairwise squared hinge with a ten-point margin and proximity penalty 0.002. Aggregate recorded-class raw points cannot decrease and other-class raw points cannot increase relative to the integer baseline on training data. Unlike the deployed model, this objective and guard use raw net points, including negative values. A fixed-budget raw-objective control isolates that difference. Deterministic coordinate descent tries individual one-point changes and same-sign within-category transfers, up to 30 sweeps; this is a local search, not a proof of a global optimum.</p>
<h2>Held-out results on identical splits</h2><p>Eight repeated three-fold evaluations of all 50 cases. Each fold refits both models without its held-out cases. No hyperparameter search or selection was performed on these results. All nine website categories participate. The repeats reuse patients and are not eight independent studies.</p>''']
rows=[]
labels={'fixed':'Current constrained model','fixedNetPoints':'Current model, rank raw points only','flexible':'Flexible totals + raw-point objective','fixedBudgetRawObjective':'Fixed totals + raw-point objective (control)'}
for m,v in s['means'].items():rows.append([labels[m],pct(v['pairwiseConcordance']),f'{v["meanRecordedRank"]:.3f}',pct(v['top1Recorded']),pct(v['recallAt3'])])
out.append(table(['Model','Pairwise ranking ↑','Mean recorded rank ↓','Top-one agreement ↑','Top-three recall ↑'],rows))
out.append('<p>Changing the display/ranking of the current equal-budget model to net points alone produces identical rankings. Learning different budgets is the substantive change. Flexible totals improve top-three recall slightly but worsen the primary pairwise ranking metric, average rank, and top-one agreement.</p><h2>Which classes benefit?</h2>')
out.append(table(['Class','Cases','Mean rank: current → flexible','Top-three recall: current → flexible'],[[e(r['class']),r['cases'],f'{r["fixed"]["meanRank"]:.3f} → {r["flexible"]["meanRank"]:.3f}',pct(r['fixed']['top3'])+' → '+pct(r['flexible']['top3'])] for r in class_rows]))
out.append('<p>These percentages average the same cases across eight held-out repetitions. They are not counts of additional unique patients. Meniere’s improves, but BPPV, Migraine and PPPD top-three placement worsens. Bilateral’s average rank also worsens.</p><h2>Uncertainty</h2>')
out.append(table(['Metric','Flexible minus current','Conditional 95% bootstrap interval'],[[k,f'{v["difference"]:.4f}',f'[{v["conditional95"][0]:.4f}, {v["conditional95"][1]:.4f}]'] for k,v in intervals.items()]))
out.append('<p>The paired bootstrap resamples 50 merged cases after averaging each case’s held-out metrics across repetitions. It does not refit models; intervals are conditional on the predictions and do not establish external validity. Patient linkage by identical source answers remains an unverified assumption.</p><h2>Candidate model fitted on all cases</h2>')
out.append(table(['Class','Available positive points'],[[e(c),n] for c,n in s['budgets'].items()]))
out.append('<p>All-data candidate results: '+', '.join(e(k)+' = '+f'{v:.4f}' for k,v in s['trained'].items())+'. These are training results, not the held-out comparison. Integer points are transparent but are not diagnostic probabilities. No candidate weights were deployed.</p>')
out.append('''<h2>Conclusion</h2><p>Different category budgets can improve the specific Meniere’s ranking problem, but the tested model trades away performance elsewhere. It is not a clear overall replacement. Preserve the current deployed model; retain this candidate for clinician review. Choosing a new primary objective such as top-three recall instead of pairwise ranking would be a separate decision, and further tuning on these same data would need fresh validation.</p><p>Limitations: only 50 cases, only five Meniere’s cases, incomplete negative labels, no external test set, and earlier development on this cohort. Absence of a recorded diagnosis is treated as an assumed negative, not confirmed absence. This experiment does not justify medical claims.</p><h2>Private files</h2><ul><li><a href="summary.json">Metrics and repeat results</a></li><li><a href="paired-comparison.json">Class comparisons and uncertainty</a></li><li><a href="candidate-model.json">Candidate integer weights</a></li><li><a href="private-predictions.json">Held-out predictions</a></li></ul></html>''')
(p/'research-report.html').write_text('\n'.join(out));print(json.dumps({'intervals':intervals,'classes':class_rows},indent=2))
