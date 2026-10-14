const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),M=require('../dist/model-core.js');
global.window={};require('../dist/questionnaire-data.js');
const D=window.NEBULA_DATA;
if(!process.argv[2])throw new Error('Usage: node scripts/train_model.cjs PRIVATE_COHORT.json');
const source=path.resolve(process.argv[2]),repo=path.resolve(__dirname,'..');
if(source.startsWith(repo+path.sep))throw new Error('Keep patient data outside the public repository.');
const input=fs.readFileSync(source),cohort=JSON.parse(input),records=M.mergeRecords(cohort.records,D.questions);
// Keep identical modeled profiles together even when omitted source answers differ.
const groups=new Map();records.forEach((r,i)=>{const key=JSON.stringify(Object.entries(r.answers).sort().map(([k,v])=>[k,Array.isArray(v)?[...v].sort():v]));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);});
const folds=[[],[],[]],counts=[{},{},{}];
for(const ids of [...groups.values()].sort((a,b)=>b.length-a.length||a[0]-b[0])) {
 const k=folds.map((f,i)=>({i,n:f.length,load:ids.reduce((s,j)=>s+records[j].labels.reduce((sum,c)=>sum+(counts[i][c]||0),0),0)})).sort((a,b)=>a.load-b.load||a.n-b.n||a.i-b.i)[0].i;
 folds[k].push(...ids);ids.forEach(j=>records[j].labels.forEach(c=>counts[k][c]=(counts[k][c]||0)+1));
}
const oof=[];
for(const fold of folds){const held=new Set(fold),model=M.fit(D.rules,records.filter((_,i)=>!held.has(i)));fold.forEach(i=>oof[i]=M.score(model.rules,records[i].answers));}
const fit=M.fit(D.rules,records),rounded=D.rules.map((r,i)=>({...r,weight:fit.baseline[i]}));
const report={version:2,method:'Expert-constrained multi-label integer scorecard tuning',trainedAt:new Date().toISOString(),sourceHash:crypto.createHash('sha256').update(input).digest('hex'),rules:fit.rules,
 metrics:{default:M.metrics(D.rules,records),integerBaseline:M.metrics(rounded,records),trained:M.metrics(fit.rules,records),crossValidation:M.multiMetrics(records,oof)},
 constraints:{radiusFraction:0.25,minimumRadius:1,integerOnly:true,signsPreserved:true,categoryPositiveAndNegativeBudgets:'Fixed at rounded original totals',ruleOutMinus100:'Frozen',unobservedRules:'Frozen at integer baseline',regularization:0.002,maxSweeps:30},
 training:{sourceEntries:cohort.records.length,mergedPatients:records.length,multiLabelPatients:records.filter(r=>r.labels.length>1).length,ageConflicts:records.filter(r=>r.ageConflict).length,foldSizes:folds.map(f=>f.length),objective:fit.objective,sweeps:fit.sweeps,moves:fit.moves},
 limitations:['Identical full-source answer blocks are assumed to be the same patient at user direction; this is not independently verified.','All source sheet diagnoses are retained for each merged patient. Conflicting ages are left unknown.','Other diagnoses are treated as assumed negatives for tuning, not confirmed absent diagnoses.','Categories without positive cases are not learned or evaluated.','Percentages are normalized support, not calibrated probabilities.','All-data results are training performance; three-fold evaluation is exploratory, with no independent test set.','Unmapped and ambiguous source answers were omitted. Prior development used this cohort; validation is not untouched.','No claim of clinical validity, methodological novelty, or journal acceptance is established.']};
report.constraints.trainingMacroSupport='Recorded support cannot decrease; other support cannot increase versus integer baseline, using unrounded scores';
report.constraints.negativeLabels='Assumed from absence among merged source labels; not confirmed negatives';
fs.writeFileSync(path.join(repo,'dist/trained-model.js'),'window.NEBULA_TRAINED = '+JSON.stringify(report,null,2)+';\n');
fs.writeFileSync(path.join(path.dirname(source),'training-audit-multilabel.json'),JSON.stringify({records,folds:folds.map(f=>f.map(i=>records[i].id)),oof},null,2));
const caseDir=path.resolve(path.dirname(source),'../patient-cases-multilabel');fs.mkdirSync(caseDir,{recursive:true});
for(const r of records){const existing=fs.readdirSync(caseDir).filter(n=>n===r.id+'.json'||new RegExp('^\\d{3}-'+r.id+'\\.json$').test(n));if(existing.length>1)throw new Error('Duplicate case filenames; review local folder.');fs.writeFileSync(path.join(caseDir,existing[0]||r.id+'.json'),JSON.stringify({format:'nebula-patient-case',version:1,patient:{anonymous_id:r.id,age:r.age,sex:r.sex,recorded_labels:r.labels,age_conflict:r.ageConflict},answers:r.answers,import_warnings:r.issues},null,2));}
console.log(JSON.stringify({training:report.training,metrics:Object.fromEntries(Object.entries(report.metrics).map(([k,v])=>[k,{positiveSupport:v.positiveSupport,otherSupport:v.otherSupport,error:v.balancedSquaredError}]))},null,2));
