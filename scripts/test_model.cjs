const assert=require('node:assert/strict');
const M=require('../dist/model-core.js');
global.window={}; require('../dist/questionnaire-data.js');require('../dist/trained-model.js');
const D=window.NEBULA_DATA,T=window.NEBULA_TRAINED, baseline=M.integerBaseline(D.rules);
if(T.scoringMode==='net-points'){require('./test_deployed_flexible.cjs');return;}
assert.equal(T.rules.length,D.rules.length);
T.rules.forEach((r,i)=>{
  const base=D.rules[i];
  for(const k of ['category','questionId','answer']) assert.equal(r[k],base[k]);
  assert.ok(Number.isInteger(r.weight)); assert.equal(Math.sign(r.weight),Math.sign(base.weight));
  assert.ok(Math.abs(r.weight-baseline[i])<=Math.max(1,Math.round(Math.abs(baseline[i])*0.25)));
  if(base.weight===-100) assert.equal(r.weight,-100);
});
for(const c of new Set(D.rules.map(r=>r.category))) for(const sign of [-1,1]) {
  const total=rules=>rules.filter(r=>r.category===c&&Math.sign(r.weight)===sign).reduce((s,r)=>s+Math.abs(r.weight),0);
  assert.equal(total(T.rules),Math.round(total(D.rules)));
}
assert.equal(M.prediction({A:{percent:0},B:{percent:0}}),'Uncertain / tied');
assert.equal(M.prediction({A:{percent:10},B:{percent:10}}),'Uncertain / tied');
const fixture=[{category:'A',questionId:'1',answer:'x',weight:10},{category:'A',questionId:'1',answer:'y',weight:-2}];
assert.deepEqual(M.score(fixture,{'1':['x','y']}),{A:{points:8,available:10,percent:80}});
const rankScores={A:{points:20,percent:20},B:{points:10,percent:10},C:{points:0,percent:0}};
assert.deepEqual(M.rankingMetrics([{labels:['A','B']}],[rankScores]),{pairwiseConcordance:1,meanRecordedRank:1.5,top1Recorded:1,recallAt3:1});
assert.equal(M.rankingMetrics([{labels:['C']}],[rankScores]).pairwiseConcordance,0);
assert.equal(M.rankingMetrics([{labels:['A']}],[{A:{points:0,percent:0},B:{points:0,percent:0}}]).pairwiseConcordance,0.5);
if(process.argv[2]) {
  const fs=require('node:fs');const cohort=JSON.parse(fs.readFileSync(process.argv[2]));
  const records=M.mergeRecords(cohort.records,D.questions);
  assert.equal(records.length,50);
  assert.equal(records.filter(r=>r.labels.length>1).length,5);
  assert.equal(records.filter(r=>r.ageConflict&&r.age===null).length,3);
  assert.deepEqual(M.metrics(T.rules,records),T.metrics.trained);
  assert.deepEqual(M.metrics(D.rules,records),T.metrics.default);
  assert.deepEqual(M.fit(D.rules,records).rules,T.rules);
  assert.ok(T.metrics.trained.positiveSupport>=T.metrics.integerBaseline.positiveSupport);
  assert.ok(T.metrics.trained.otherSupport<=T.metrics.integerBaseline.otherSupport+0.0005);
  assert.equal(T.training.objectiveName,'pairwise-ranking');
  assert.deepEqual(M.metrics(M.fit(D.rules,records,{objective:'support'}).rules,records),T.metrics.previousSupportModel);
  assert.ok(T.metrics.trained.ranking.pairwiseConcordance>T.metrics.previousSupportModel.ranking.pairwiseConcordance);
  assert.ok(T.metrics.trained.ranking.meanRecordedRank<T.metrics.previousSupportModel.ranking.meanRecordedRank);
  D.rules.forEach((r,i)=>{if(!records.some(p=>M.matched(r,p.answers))||!records.some(p=>p.labels.includes(r.category)))assert.equal(T.rules[i].weight,baseline[i]);});
}
console.log('PASS: integer weights, unchanged rule identities/signs, bounds, frozen rule-outs, fixed budgets, scoring, ties, reproducible fit/metrics.');
