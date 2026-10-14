// Private analysis input only: refuses any destination inside the public repository.
const fs=require('node:fs'),path=require('node:path'),M=require('../dist/model-core.js');
global.window={};require('../dist/questionnaire-data.js');require('../dist/trained-model.js');
const D=window.NEBULA_DATA,T=window.NEBULA_TRAINED,repo=path.resolve(__dirname,'..');
const source=path.resolve(process.argv[2]||''),out=path.resolve(process.argv[3]||'');
if(!process.argv[3]||out===repo||out.startsWith(repo+path.sep))throw new Error('Provide private cohort and output JSON paths outside the repository.');
const cohort=JSON.parse(fs.readFileSync(source)),audit=JSON.parse(fs.readFileSync(path.join(path.dirname(source),'training-audit-ranking.json'))),records=M.mergeRecords(cohort.records,D.questions);
if(cohort.questionnaireRevision!==D.questionnaireRevision)throw new Error('Questionnaire mismatch');
records.forEach((r,i)=>{if(r.id!==audit.records[i].id)throw new Error('Audit order mismatch');});
const cases=records.map((r,i)=>({...r,defaultScores:M.score(D.rules,r.answers),trainedScores:M.score(T.rules,r.answers),heldOutScores:audit.oof[i],contributions:Object.fromEntries(['default','trained'].map(model=>[model,Object.fromEntries(D.categories.map(c=>[c,(model==='default'?D.rules:T.rules).filter(rule=>rule.category===c&&M.matched(rule,r.answers)).map(rule=>({questionId:rule.questionId,answer:rule.answer,weight:rule.weight}))]))]))}));
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify({questionnaireRevision:D.questionnaireRevision,sourceHash:cohort.sourceSha256,sourceEntries:cohort.records.length,sourceAudit:cohort.audit,questions:D.questions,rules:D.rules,trainedRules:T.rules,training:T.training,foldIds:audit.folds,cases},null,2));
console.log(`Exported ${cases.length} private analysis cases; no website changes.`);
