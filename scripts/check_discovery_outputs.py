"""Sanity checks for private discovery artifacts, without logging patient answers."""
import csv
import hashlib
import json
import pathlib
import sys
import numpy as np

p=pathlib.Path(sys.argv[1])
d=json.loads((p/'analysis-inputs.json').read_text())
s=json.loads((p/'summary.json').read_text())
f=json.loads((p/'folds.json').read_text())
pred=json.loads((p/'exploratory-predictions.json').read_text())
n=len(d['cases'])
assert s['input_hash']==hashlib.sha256((p/'analysis-inputs.json').read_bytes()).hexdigest()
assert n==s['n']==len(pred['patient_ids'])
assert len(set(pred['patient_ids']))==n
assert np.array(pred['labels']).sum()==s['recorded_diagnoses']
assert all(sorted(sum(repeat,[]))==list(range(n)) for repeat in f)
for name, values in pred['predictions'].items():
    a=np.array(values)
    assert a.shape==(len(f),n,len(pred['classes'])),(name,a.shape)
    assert np.isfinite(a).all() and (a>=0).all() and (a<=1).all()
for r in d['cases']:
    for name,key in [('default','defaultScores'),('trained','trainedScores')]:
        for category,score in r[key].items():
            total=sum(h['weight'] for h in r['contributions'][name][category])
            assert abs(total-score['points'])<0.02,(r['id'],category,total,score['points'])
with (p/'all-answer-associations.csv').open() as stream:
    rows=list(csv.DictReader(stream))
assert len(rows)==s['association_tests']
for row in rows:
    for group in ['positive','other']:
        assert 0<=int(row['selected_'+group])<=int(row['answered_'+group])<=n
    assert 0<=float(row['p'])<=float(row['q_global'])+1e-12<=1+1e-12
assert (p/'research-report.html').exists()
print(f'PASS: {n} cases, {len(rows)} tests, {len(f)} fold repetitions, bounded predictions, contribution totals, input hash and report.')
