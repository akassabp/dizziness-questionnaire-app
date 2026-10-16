// Build stable, shuffled private case JSON files from an extracted cohort.
// Patient data must remain outside this public website repository.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const M=require('../dist/model-core.js');
global.window={};require('../dist/questionnaire-data.js');const D=window.NEBULA_DATA;

const [sourceArg,previousArg,outputArg,summaryArg]=process.argv.slice(2);
if(!sourceArg||!previousArg||!outputArg||!summaryArg)throw new Error('Usage: node scripts/export_private_cases.cjs NEW_COHORT PREVIOUS_COHORT OUTPUT_DIR SUMMARY_JSON');
const repo=path.resolve(__dirname,'..'),source=path.resolve(sourceArg),previous=path.resolve(previousArg),output=path.resolve(outputArg),summaryPath=path.resolve(summaryArg);
for(const target of [source,previous,output,summaryPath])if(target===repo||target.startsWith(repo+path.sep))throw new Error('Private cohort artifacts must remain outside the public website repository.');
if(fs.existsSync(output)&&fs.readdirSync(output).length)throw new Error('Output directory must be empty.');
fs.mkdirSync(output,{recursive:true});fs.mkdirSync(path.dirname(summaryPath),{recursive:true});

const cohort=JSON.parse(fs.readFileSync(source)),prior=JSON.parse(fs.readFileSync(previous));
if(cohort.questionnaireRevision!==D.questionnaireRevision)throw new Error('Questionnaire revision mismatch.');
const priorRecords=M.mergeRecords(prior.records,D.questions),records=M.mergeRecords(cohort.records,D.questions);
const priorIds=new Map(priorRecords.map(r=>[r.sourceAnswerFingerprint,r.id]));
let nextId=Math.max(0,...priorRecords.map(r=>Number(r.id.split('-').at(-1))))+1;
for(const record of records)record.id=priorIds.get(record.sourceAnswerFingerprint)||`PATIENT-${String(nextId++).padStart(3,'0')}`;
if(new Set(records.map(r=>r.id)).size!==records.length)throw new Error('Duplicate patient IDs after stable assignment.');

const ordered=[...records].sort((a,b)=>crypto.createHash('sha256').update(`${cohort.sourceSha256}:${a.id}`).digest('hex').localeCompare(crypto.createHash('sha256').update(`${cohort.sourceSha256}:${b.id}`).digest('hex')));
ordered.forEach((r,index)=>{
  const payload={format:'nebula-patient-case',version:1,questionnaire_revision:D.questionnaireRevision,patient:{anonymous_id:r.id,age:r.age,sex:r.sex,recorded_labels:r.labels,age_conflict:r.ageConflict},answers:r.answers,unscored_answers:r.unscoredAnswers,import_warnings:r.issues};
  fs.writeFileSync(path.join(output,`${String(index+1).padStart(3,'0')}-${r.id}.json`),JSON.stringify(payload,null,2)+'\n');
});

const classCounts={},diagnosisGroups={},byFingerprint=new Map();
for(const record of cohort.records){classCounts[record.label]=(classCounts[record.label]||0)+1;if(!byFingerprint.has(record.sourceAnswerFingerprint))byFingerprint.set(record.sourceAnswerFingerprint,[]);byFingerprint.get(record.sourceAnswerFingerprint).push(record);}
for(const record of records){const group=record.labels.join(' + ');diagnosisGroups[group]=(diagnosisGroups[group]||0)+1;}
const duplicateGroups=[...byFingerprint.values()].filter(group=>group.length>1).map(group=>({entries:group.length,labels:[...new Set(group.map(r=>r.label))].sort(),sources:group.map(r=>({sheet:r.sourceSheet,rows:r.sourceRows,age:r.age,sex:r.sex}))}));
const sheetAudit=cohort.audit.map(item=>({...item,difference:item.records-item.tabCount}));
const summary={schemaVersion:1,questionnaireRevision:D.questionnaireRevision,sourceWorkbook:cohort.sourceWorkbook||path.basename(sourceArg),sourceSha256:cohort.sourceSha256,sourceEntries:cohort.records.length,uniquePatients:records.length,recordedDiagnoses:records.reduce((sum,r)=>sum+r.labels.length,0),multiLabelPatients:records.filter(r=>r.labels.length>1).length,ageConflicts:records.filter(r=>r.ageConflict).length,exactDuplicateQuestionnaireGroups:duplicateGroups.length,preservedPatientIds:records.filter(r=>priorIds.has(r.sourceAnswerFingerprint)).length,newPatientIds:records.filter(r=>!priorIds.has(r.sourceAnswerFingerprint)).length,classCounts:Object.fromEntries(Object.entries(classCounts).sort()),diagnosisGroups:Object.fromEntries(Object.entries(diagnosisGroups).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))),sheetAudit,duplicateGroups,mergeRule:'Questionnaires with identical full source question-and-answer fingerprints are treated as the same patient, as requested; linkage is not independently verified.',labelBasis:cohort.labelBasis};
fs.writeFileSync(summaryPath,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({output,summary:summaryPath,...Object.fromEntries(['sourceEntries','uniquePatients','recordedDiagnoses','multiLabelPatients','exactDuplicateQuestionnaireGroups','preservedPatientIds','newPatientIds'].map(k=>[k,summary[k]]))},null,2));
