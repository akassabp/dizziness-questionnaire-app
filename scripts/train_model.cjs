// Source cases stay local. Public output contains only weights and aggregate metrics.
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const M=require('../dist/model-core.js');
global.window={}; require('../dist/questionnaire-data.js');
const definitions=window.NEBULA_DATA, rules=definitions.rules;
if(!process.argv[2]) throw new Error('Usage: node scripts/train_model.cjs LOCAL_COHORT.json');
const repo=path.resolve(__dirname,'..'), source=path.resolve(process.argv[2]);
if(source===repo || source.startsWith(repo+path.sep)) throw new Error('Keep the cohort and private audit outside the public repository.');
const input=fs.readFileSync(process.argv[2]);
const cohort=JSON.parse(input);
const records=cohort.records.map(r=>({...r,answers:M.sanitize(r.answers,definitions.questions)}));
// Keep identical structured-answer profiles in the same fold (including cross-label duplicates).
const groups=new Map();
records.forEach((r,i)=>{const key=JSON.stringify(Object.entries(r.answers).sort().map(([q,v])=>[q,Array.isArray(v)?[...v].sort():v]));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});
const folds=[[],[],[]], counts=[{},{},{}];
for(const ids of [...groups.values()].sort((a,b)=>b.length-a.length||a[0]-b[0])) {
  const rank=folds.map((f,i)=>({i,load:ids.reduce((s,id)=>s+(counts[i][records[id].label]||0),0),total:f.length})).sort((a,b)=>a.load-b.load||a.total-b.total||a.i-b.i);
  const k=rank[0].i; folds[k].push(...ids); ids.forEach(i=>counts[k][records[i].label]=(counts[k][records[i].label]||0)+1);
}
const predictions=records.map(()=>null);
for(const fold of folds) {
  const held=new Set(fold), fitted=M.fit(rules,records.filter((_,i)=>!held.has(i)));
  fold.forEach(i=>predictions[i]=M.prediction(M.score(fitted.rules,records[i].answers)));
}
const fitted=M.fit(rules,records);
const rounded=rules.map((r,i)=>({...r,weight:fitted.baseline[i]}));
const report={version:1,method:'Expert-constrained integer scorecard calibration',trainedAt:new Date().toISOString(),
  sourceHash:crypto.createHash('sha256').update(input).digest('hex'),
  rules:fitted.rules,metrics:{default:M.metrics(rules,records),integerBaseline:M.metrics(rounded,records),trained:M.metrics(fitted.rules,records),crossValidation:M.evaluate(records.map(r=>r.label),predictions)},
  constraints:{radiusFraction:0.25,minimumRadius:1,integerOnly:true,signsPreserved:true,categoryPositiveAndNegativeBudgets:'Preserved at rounded original totals',ruleOutMinus100:'Frozen',unobservedRules:'Frozen at integer baseline',temperature:20,lossWeight:0.02,regularization:0.002,maxSweeps:30},
  training:{objective:fitted.objective,sweeps:fitted.sweeps,moves:fitted.moves,foldSizes:folds.map(f=>f.length),uniqueAnswerProfiles:groups.size},
  limitations:['Recorded labels are worksheet memberships, not verified exclusive diagnoses.','All-data fit is resubstitution, not validation. Three-fold grouped results are exploratory.','Patient identities are unavailable; identical profiles are grouped but repeated-person leakage cannot be excluded.','Unmapped, conflicting and Excel-coerced answers are omitted; reconcile the source before clinical claims.','Concussion and Neurological Other have no labeled cases.','Local optimization is not guaranteed globally optimal; novelty and publication acceptance are not established.']};
fs.writeFileSync(path.join(__dirname,'../dist/trained-model.js'),'window.NEBULA_TRAINED = '+JSON.stringify(report,null,2)+';\n');
// Private reproducibility artifact: do not place in repository.
fs.writeFileSync(path.join(path.dirname(process.argv[2]),'training-audit.json'),JSON.stringify({folds:folds.map(f=>f.map(i=>records[i].id)),predictions:records.map((r,i)=>({id:r.id,label:r.label,oof:predictions[i],fitted:M.prediction(M.score(fitted.rules,r.answers))})),bounds:{lower:fitted.lower,upper:fitted.upper}},null,2));
console.log(JSON.stringify({metrics:report.metrics,training:report.training},null,2));
