"""Exploratory multi-label discovery. All outputs stay outside the public repo.

Never updates deployed weights or clinical rules. Uses only structured answers,
not demographics, narratives, source sheet names, identifiers or future outcomes.
"""
import argparse
import csv
import hashlib
import html
import json
import pathlib
import subprocess
import sys
import warnings
from collections import Counter

import numpy as np
import scipy
import sklearn
from scipy.stats import fisher_exact, false_discovery_control
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.metrics import roc_auc_score, average_precision_score
from sklearn.model_selection import GroupKFold

warnings.filterwarnings('ignore', category=UserWarning)
REPO = pathlib.Path(__file__).resolve().parents[1]
NODE = '/home/akassab/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
SEED = 20261014
# Avoid directly naming the target diagnosis and healthcare-utilization proxies.
EXCLUDED = {'259359', '259386', '259415', '259422', '259424', '259425', '260452'}


def dump(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False))


def metric(y, score):
    auc, ap = [], []
    for j in range(y.shape[1]):
        if len(np.unique(y[:, j])) == 2:
            auc.append(roc_auc_score(y[:, j], score[:, j]))
            ap.append(average_precision_score(y[:, j], score[:, j]))
    order = np.argsort(-score, axis=1, kind='stable')
    rank = np.argsort(order, axis=1)+1
    pair = []
    for truth, s in zip(y, score):
        d = s[truth == 1, None] - s[truth == 0][None, :]
        pair.append(float(np.mean((d > 0)+0.5*(d == 0))))
    return {'macro_auc': float(np.mean(auc)), 'macro_ap': float(np.mean(ap)),
            'pairwise_concordance': float(np.mean(pair)),
            'mean_recorded_rank': float(np.mean((rank*y).sum(axis=1)/y.sum(axis=1))),
            'recall_at_3': float(np.mean(np.take_along_axis(y, order[:, :3], axis=1).sum(axis=1)/y.sum(axis=1))),
            'top1_recorded': float(np.mean(np.take_along_axis(y, order[:, :1], axis=1)))}


def make_splits(y, groups, seed):
    rng = np.random.default_rng(seed)
    unique = np.unique(groups); rng.shuffle(unique)
    rarity = {g: min(y[groups == g].sum(axis=0)[y[groups == g].sum(axis=0)>0] / np.maximum(y.sum(axis=0)[y[groups == g].sum(axis=0)>0], 1)) for g in unique}
    unique = sorted(unique, key=lambda g: (-int((groups == g).sum()), -rarity[g]))
    folds = [[], [], []]; counts = np.zeros((3, y.shape[1]))
    for g in unique:
        ids = np.flatnonzero(groups == g); labels = y[ids].sum(axis=0)
        choices = list(rng.permutation(3))
        k = min(choices, key=lambda k: (float(np.sum(counts[k]*labels/np.maximum(y.sum(axis=0),1))), len(folds[k])))
        folds[k].extend(ids.tolist()); counts[k] += labels
    return folds


def fit_predict(x, y, test, family, parameter, seed):
    # All frequency screening is learned only from this training fold.
    counts = x.sum(axis=0); keep = (counts >= 3) & (counts <= len(x)-3)
    if not keep.any():
        return np.tile((y.sum(axis=0)+1)/(len(y)+2), (len(test),1))
    if family == 'trees':
        model = ExtraTreesClassifier(n_estimators=120, max_depth=3, min_samples_leaf=parameter,
                                    max_features='sqrt', class_weight='balanced', random_state=seed, n_jobs=1)
        model.fit(x[:, keep], y)
        probabilities = model.predict_proba(test[:, keep])
        return np.column_stack([p[:, list(c).index(1)] if 1 in c else np.zeros(len(test)) for p,c in zip(probabilities, model.classes_)])
    result = []
    for j in range(y.shape[1]):
        if len(np.unique(y[:,j]))<2:
            result.append(np.repeat((y[:,j].sum()+1)/(len(y)+2),len(test)));continue
        model = LogisticRegression(C=parameter, penalty='l2', solver='liblinear', class_weight='balanced', max_iter=1000, random_state=seed)
        model.fit(x[:,keep], y[:,j]);result.append(model.predict_proba(test[:,keep])[:,1])
    return np.column_stack(result)


def nested_oof(x, y, groups, repeats, family):
    parameters = [0.03, 0.1, 0.3, 1.0] if family == 'logistic' else [3,5]
    results=[];choices=[]
    for r,folds in enumerate(repeats):
        oof = np.zeros_like(y,dtype=float)
        for held in folds:
            train=np.setdiff1d(np.arange(len(y)),held);best=-np.inf;chosen=parameters[0]
            inner=list(GroupKFold(n_splits=3).split(x[train],y[train],groups[train]))
            for p in parameters:
                pred=np.zeros_like(y[train],dtype=float)
                for a,b in inner:
                    pred[b]=fit_predict(x[train[a]],y[train[a]],x[train[b]],family,p,SEED+r)
                val=metric(y[train],pred)['macro_ap']
                if val>best+1e-12:best=val;chosen=p
            choices.append(chosen)
            oof[held]=fit_predict(x[train],y[train],x[held],family,chosen,SEED+r)
        results.append(oof)
        print(f'{family}: repeat {r+1}/{len(repeats)} complete',flush=True)
    return np.array(results),choices


def csv_write(path, rows):
    if not rows:return
    with path.open('w',newline='') as stream:
        writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('input',type=pathlib.Path);parser.add_argument('--repeats',type=int,default=8);parser.add_argument('--permutations',type=int,default=199)
    args=parser.parse_args();out=args.input.resolve().parent
    if out==REPO or REPO in out.parents:raise ValueError('All analysis outputs must remain private, outside the repository')
    data=json.loads(args.input.read_text());cases=data['cases'];n=len(cases)
    classes=sorted({c for r in cases for c in r['labels']});y=np.array([[int(c in r['labels']) for c in classes] for r in cases])
    questions={q['id']:q for q in data['questions'] if q['kind'] in ['single','multi']}
    # Fixed questionnaire vocabulary, not outcome-selected features.
    features=[{'qid':qid,'answer':answer,'prompt':q['prompt'],'symptom_only':qid not in EXCLUDED} for qid,q in questions.items() for answer in q['options']]
    x=np.array([[int(f['answer'] in (r['answers'].get(f['qid'],[]) if isinstance(r['answers'].get(f['qid']),list) else [r['answers'].get(f['qid'])])) for f in features] for r in cases])
    observed=np.array([[int(f['qid'] in r['answers']) for f in features] for r in cases])
    symptom=np.array([f['symptom_only'] for f in features]);xs=x[:,symptom]
    group_keys=[json.dumps(r['answers'],sort_keys=True) for r in cases];groups=np.array([sorted(set(group_keys)).index(s) for s in group_keys])
    repeats=[make_splits(y,groups,SEED+i) for i in range(args.repeats)]
    for folds in repeats:
        assert sorted(sum(folds,[]))==list(range(n))
        assert all(not(set(groups[a])&set(groups[b])) for i,a in enumerate(folds) for b in folds[i+1:])
    dump(out/'folds.json',repeats)
    dump(out/'feature-dictionary.json',features)
    print(f'{n} cases; {len(features)} answer features; {symptom.sum()} symptom-focused features; {len(set(groups))} answer-profile groups',flush=True)
    # Fisher tests use answered-question denominators: missing is not a No.
    associations=[]
    for j,c in enumerate(classes):
        for k,f in enumerate(features):
            mask=observed[:,k].astype(bool);pos=mask&(y[:,j]==1);neg=mask&(y[:,j]==0)
            a=int(x[pos,k].sum());b=int(pos.sum()-a);cc=int(x[neg,k].sum());d=int(neg.sum()-cc)
            p=float(fisher_exact([[a,b],[cc,d]])[1]) if pos.any() and neg.any() else 1.0
            existing=[r['weight'] for r in data['rules'] if r['category']==c and r['questionId']==f['qid'] and r['answer'].lower()==f['answer'].lower()]
            associations.append({'class':c,**f,'feature_index':k,'selected_positive':a,'answered_positive':int(pos.sum()),'selected_other':cc,'answered_other':int(neg.sum()),'positive_rate':a/max(int(pos.sum()),1),'other_rate':cc/max(int(neg.sum()),1),'risk_difference':a/max(int(pos.sum()),1)-cc/max(int(neg.sum()),1),'odds_ratio_smoothed':(a+.5)*(d+.5)/((b+.5)*(cc+.5)),'p':p,'current_rule_weight':sum(existing),'already_scored':bool(existing),'missing_positive':int(((1-observed[:,k])*y[:,j]).sum())})
    adjusted=false_discovery_control([r['p'] for r in associations],method='bh')
    for r,q in zip(associations,adjusted):r['q_global']=float(q)
    csv_write(out/'all-answer-associations.csv',associations)
    # Bootstrap multivariable coefficient direction on the symptom-only features.
    rng=np.random.default_rng(SEED);coefs=[]
    for b in range(250):
        ids=rng.integers(0,n,n);coef=np.zeros((len(classes),xs.shape[1]))
        for j in range(len(classes)):
            if len(np.unique(y[ids,j]))<2:continue
            m=LogisticRegression(C=.1,solver='liblinear',penalty='l2',class_weight='balanced',max_iter=1000,random_state=SEED)
            m.fit(xs[ids],y[ids,j]);coef[j]=m.coef_[0]
        coefs.append(coef)
    coefs=np.array(coefs);mapping={k:i for i,k in enumerate(np.flatnonzero(symptom))}
    for r in associations:
        if r['symptom_only']:
            coef=coefs[:,classes.index(r['class']),mapping[r['feature_index']]]
            r['bootstrap_positive_fraction']=float(np.mean(coef>0));r['bootstrap_negative_fraction']=float(np.mean(coef<0));r['median_logistic_coefficient']=float(np.median(coef))
        else:r['bootstrap_positive_fraction']=r['bootstrap_negative_fraction']=r['median_logistic_coefficient']=None
    candidates=[r for r in associations if r['symptom_only'] and not r['already_scored'] and r['answered_positive']>=3 and r['answered_other']>=10 and r['selected_positive']>=2 and r['risk_difference']>=.2]
    candidates.sort(key=lambda r:(r['q_global'],-r['bootstrap_positive_fraction'],-r['risk_difference']))
    csv_write(out/'candidate-unweighted-answers.csv',candidates)
    csv_write(out/'all-answer-associations.csv',associations)
    # Existing deployed models and held-out current model: all 9 displayed classes.
    nine=sorted(cases[0]['defaultScores']);ynine=np.array([[int(c in r['labels']) for c in nine] for r in cases])
    current={};per_class=[];case_rows=[]
    for name,key in [('Initial','defaultScores'),('Trained','trainedScores'),('Trained held-out','heldOutScores')]:
        scores=np.array([[r[key][c]['percent']/100 for c in nine] for r in cases]);stats=metric(ynine,scores)
        # UI tie-breaks by points then alphabetical label.
        ranks=[]
        for r in cases:
            order=sorted(nine,key=lambda c:(-r[key][c]['percent'],-r[key][c]['points'],c));ranks.append([order.index(c)+1 for c in nine])
        ranks=np.array(ranks);stats['mean_recorded_rank']=float(np.mean((ranks*ynine).sum(axis=1)/ynine.sum(axis=1)))
        stats['top1_recorded']=float(np.mean(((ranks==1)*ynine).sum(axis=1)))
        stats['recall_at_3']=float(np.mean(((ranks<=3)*ynine).sum(axis=1)/ynine.sum(axis=1)))
        stats['zero_recorded']=int(((scores==0)*ynine).sum());current[name]=stats
        for c in classes:
            j=nine.index(c);positive=ynine[:,j]==1
            per_class.append({'model':name,'class':c,'recorded_cases':int(positive.sum()),'zero_support':int((scores[positive,j]==0).sum()),'mean_recorded_support':float(scores[positive,j].mean()),'mean_other_support':float(scores[~positive,j].mean()),'mean_rank':float(ranks[positive,j].mean()),'in_top3':int((ranks[positive,j]<=3).sum()),'in_top1':int((ranks[positive,j]==1).sum()),'auc':float(roc_auc_score(ynine[:,j],scores[:,j])),'average_precision':float(average_precision_score(ynine[:,j],scores[:,j]))})
        for i,r in enumerate(cases):
            for c in r['labels']:
                hits=r.get('contributions',{}).get('default' if name=='Initial' else 'trained',{}).get(c,[]) if name!='Trained held-out' else []
                case_rows.append({'case_id':r['id'],'class':c,'model':name,'support':r[key][c]['percent'],'points':r[key][c]['points'],'rank':int(ranks[i,nine.index(c)]),'answered_questions':len(r['answers']),'positive_points':sum(h['weight'] for h in hits if h['weight']>0) if hits else None,'negative_points':sum(h['weight'] for h in hits if h['weight']<0) if hits else None})
    csv_write(out/'current-model-by-class.csv',per_class);csv_write(out/'case-review.csv',case_rows)
    # Nested selection: outer folds are never used to choose hyperparameters.
    logistic,logchoices=nested_oof(xs,y,groups,repeats,'logistic')
    trees,treechoices=nested_oof(xs,y,groups,repeats,'trees')
    all_logistic,allchoices=nested_oof(x,y,groups,repeats,'logistic')
    # Same folds for constrained refits and discovery models, compared on 7 labeled categories.
    subprocess.run([NODE,str(REPO/'scripts/evaluate_discovery_folds.cjs'),str(args.input.resolve()),str(out/'folds.json'),str(out/'constrained-repeat-predictions.json')],check=True)
    constrained_raw=json.loads((out/'constrained-repeat-predictions.json').read_text());constrained=np.array([[[r[c]['percent']/100 for c in classes] for r in rep] for rep in constrained_raw])
    priors=[]
    for folds in repeats:
        pred=np.zeros_like(y,dtype=float)
        for held in folds:
            train=np.setdiff1d(np.arange(n),held);pred[held]=(y[train].sum(axis=0)+1)/(len(train)+2)
        priors.append(pred)
    predsets={'Prevalence reference':np.array(priors),'Constrained refit':constrained,'Symptom logistic':logistic,'Symptom trees':trees,'All-questions logistic (leakage sensitivity)':all_logistic}
    repeated={}
    for name,pred in predsets.items():
        metrics=[metric(y,s) for s in pred];repeated[name]={k:{'mean':float(np.mean([m[k] for m in metrics])),'min':float(min(m[k] for m in metrics)),'max':float(max(m[k] for m in metrics))} for k in metrics[0]}
    # Fixed low-complexity pipeline permutation test; no outcome-selected features.
    # Patient-profile groups are indivisible. Permute whole label vectors between
    # groups of the same size, preserving within-profile structure and co-labels.
    def permute_labels(rng):
        result=y.copy();sizes={}
        for g in np.unique(groups):sizes.setdefault(int((groups==g).sum()),[]).append(g)
        for size,gs in sizes.items():
            shuffled=rng.permutation(gs)
            for target,source in zip(gs,shuffled):result[np.flatnonzero(groups==target)]=y[np.flatnonzero(groups==source)]
        return result
    # Label-independent split avoids conditioning a permutation test on true-label stratification.
    pfolds=[test.tolist() for _,test in GroupKFold(n_splits=3,shuffle=True,random_state=SEED).split(xs,y,groups)]
    def fixed_oof(labels):
        pred=np.zeros_like(labels,dtype=float)
        for held in pfolds:
            train=np.setdiff1d(np.arange(n),held);pred[held]=fit_predict(xs[train],labels[train],xs[held],'logistic',.1,SEED)
        return metric(labels,pred)['macro_auc']
    observed_stat=fixed_oof(y);null=[];rng=np.random.default_rng(SEED+1)
    for i in range(args.permutations):
        null.append(fixed_oof(permute_labels(rng)))
        if(i+1)%50==0:print(f'Permutation {i+1}/{args.permutations}',flush=True)
    permutation={'statistic':'macro AUROC of fixed C=0.1 symptom logistic on label-independent grouped folds','observed':observed_stat,'null_mean':float(np.mean(null)),'p':float((1+sum(v>=observed_stat for v in null))/(len(null)+1)),'permutations':len(null)}
    # Paired patient bootstrap of OOF average scores: conditional uncertainty,
    # not full retraining or external-validation confidence intervals.
    rng=np.random.default_rng(SEED+2);deltas=[]
    unique=np.unique(groups)
    for b in range(1500):
        ids=np.concatenate([np.flatnonzero(groups==g) for g in rng.choice(unique,len(unique),replace=True)])
        delta=metric(y[ids],logistic.mean(axis=0)[ids])['macro_auc']-metric(y[ids],constrained.mean(axis=0)[ids])['macro_auc'];deltas.append(delta)
    bootstrap={'contrast':'Symptom logistic minus constrained refit macro AUROC','delta':metric(y,logistic.mean(axis=0))['macro_auc']-metric(y,constrained.mean(axis=0))['macro_auc'],'conditional_95_interval':[float(v) for v in np.quantile(deltas,[.025,.975])],'note':'Paired answer-profile bootstrap of averaged OOF scores; does not retrain models or establish external validity.'}
    # Recurring answer pairs: descriptive only, not p-value tested or validated.
    pairs=[]
    for j,c in enumerate(classes):
        eligible=[r for r in associations if r['class']==c and r['symptom_only'] and r['selected_positive']>=2 and r['risk_difference']>0]
        eligible=sorted(eligible,key=lambda r:r['risk_difference'],reverse=True)[:15]
        for ia,a in enumerate(eligible):
            for b in eligible[ia+1:]:
                if a['qid']==b['qid']:continue
                k,l=a['feature_index'],b['feature_index'];obs=(observed[:,k]&observed[:,l]).astype(bool);selected=(x[:,k]&x[:,l]).astype(bool)
                pos=obs&(y[:,j]==1);neg=obs&(y[:,j]==0);pc=int((selected&pos).sum());nc=int((selected&neg).sum())
                if pc>=3 and pos.sum()>=3 and neg.sum()>=10:pairs.append({'class':c,'first':a['qid']+' = '+a['answer'],'second':b['qid']+' = '+b['answer'],'selected_positive':pc,'answered_positive':int(pos.sum()),'selected_other':nc,'answered_other':int(neg.sum()),'difference':pc/pos.sum()-nc/neg.sum()})
    pairs.sort(key=lambda r:-r['difference']);csv_write(out/'descriptive-answer-pairs.csv',pairs)
    summary={'source_hash':data['sourceHash'],'input_hash':hashlib.sha256(args.input.read_bytes()).hexdigest(),'n':n,'recorded_diagnoses':int(y.sum()),'class_counts':dict(zip(classes,map(int,y.sum(axis=0)))),'features':len(features),'symptom_features':int(symptom.sum()),'profile_groups':len(unique),'association_tests':len(associations),'global_fdr_below_005':sum(r['q_global']<.05 for r in associations),'candidate_count':len(candidates),'current_models_nine_classes':current,'repeated_nested_cv_seven_classes':repeated,'hyperparameter_choices':{'symptom_logistic':logchoices,'symptom_trees':treechoices,'all_logistic':allchoices},'permutation':permutation,'bootstrap':bootstrap,'versions':{'python':sys.version,'numpy':np.__version__,'scipy':scipy.__version__,'sklearn':sklearn.__version__},'seed':SEED}
    dump(out/'summary.json',summary)
    dump(out/'exploratory-predictions.json',{'classes':classes,'patient_ids':[r['id'] for r in cases],'labels':y.tolist(),'predictions':{name:pred.tolist() for name,pred in predsets.items()}})
    print(json.dumps(summary,indent=2),flush=True)


if __name__=='__main__':main()
