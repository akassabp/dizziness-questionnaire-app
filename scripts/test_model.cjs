const assert=require('node:assert/strict');
const M=require('../dist/model-core.js');
global.window={}; require('../dist/questionnaire-data.js');require('../dist/trained-model.js');
const D=window.NEBULA_DATA,T=window.NEBULA_TRAINED, baseline=M.integerBaseline(D.rules);
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
if(process.argv[2]) {
  const fs=require('node:fs');const cohort=JSON.parse(fs.readFileSync(process.argv[2]));
  const records=cohort.records.map(r=>({...r,answers:M.sanitize(r.answers,D.questions)}));
  assert.deepEqual(M.metrics(T.rules,records),T.metrics.trained);
  assert.deepEqual(M.metrics(D.rules,records),T.metrics.default);
  assert.deepEqual(M.fit(D.rules,records).rules,T.rules);
}
console.log('PASS: integer weights, unchanged rule identities/signs, bounds, frozen rule-outs, fixed budgets, scoring, ties, reproducible fit/metrics.');
