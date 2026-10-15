const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),M=require('../dist/model-core.js'),F=require('./flexible_model.cjs');
const [input,foldfile,previous,output]=process.argv.slice(2),repo=path.resolve(__dirname,'..');
if(!output||path.resolve(output)===repo||path.resolve(output).startsWith(repo+path.sep))throw Error('Private output directory required');
const D=JSON.parse(fs.readFileSync(input)),folds=JSON.parse(fs.readFileSync(foldfile)),prior=JSON.parse(fs.readFileSync(previous)),records=D.cases,rules=D.rules;
function checked(train){const f=F.fit(rules,train,{relaxExclusions:true});f.rules.forEach((r,i)=>{assert.ok(Number.isInteger(r.weight));assert.equal(Math.sign(r.weight),Math.sign(rules[i].weight));assert.ok(r.weight>=f.lower[i]&&r.weight<=f.upper[i]);if(!train.some(p=>p.labels.includes(r.category))||!train.some(p=>M.matched(r,p.answers)))assert.equal(r.weight,f.baseline[i]);});return f;}
const predictions=[],metrics=[];
for(const [n,repeat] of folds.entries()){
 const pred=[];
 assert.deepEqual(repeat.flat().sort((a,b)=>a-b),records.map((_,i)=>i));
 for(const held of repeat){const set=new Set(held),train=records.filter((_,i)=>!set.has(i)),f=checked(train);for(const i of held)pred[i]=F.scores(f.rules,records[i].answers);}
 predictions.push(pred);metrics.push(M.rankingMetrics(records,pred));console.log('Completed relaxed held-out repeat',n+1);
}
const candidate=checked(records),all=records.map(r=>F.scores(candidate.rules,r.answers)),mean=ms=>Object.fromEntries(Object.keys(ms[0]).map(k=>[k,ms.reduce((s,m)=>s+m[k],0)/ms.length]));
const classes=[...new Set(records.flatMap(r=>r.labels))],perClass=[];
function rank(scores,c){return Object.keys(scores).sort((a,b)=>scores[b].percent-scores[a].percent||scores[b].points-scores[a].points||a.localeCompare(b)).indexOf(c)+1;}
for(const c of classes){const ids=records.map((r,i)=>r.labels.includes(c)?i:-1).filter(i=>i>=0),row={category:c,count:ids.length};for(const model of ['fixed','flexible','relaxed']){const ranks=predictions.flatMap((pred,n)=>ids.map(i=>rank(model==='relaxed'?pred[i]:prior[n].predictions[model][i],c)));row[model]={meanRank:ranks.reduce((s,r)=>s+r,0)/ranks.length,top3:ranks.filter(r=>r<=3).length/ranks.length};}perClass.push(row);}
const summary={inputHash:crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex'),foldHash:crypto.createHash('sha256').update(fs.readFileSync(foldfile)).digest('hex'),heldOut:{fixed:mean(prior.map(r=>r.fixed)),flexible:mean(prior.map(r=>r.flexible)),relaxed:mean(metrics)},training:M.rankingMetrics(records,all),perClass,penalties:rules.flatMap((r,i)=>r.weight===-100?[{category:r.category,question:r.questionId,answer:r.answer,before:-100,after:candidate.rules[i].weight}]:[]),fit:{moves:candidate.moves,sweeps:candidate.sweeps},nonpositiveRecorded:records.flatMap((r,i)=>r.labels.filter(c=>all[i][c].points<=0).map(c=>({id:r.id,category:c,points:all[i][c].points}))),note:'Experimental relaxation; no deployment. Other-class raw-point guard retained. Negatives are assumed from missing labels. Training metrics are resubstitution, not independent accuracy.'};
fs.mkdirSync(output,{recursive:true});for(const [name,data] of Object.entries({'summary.json':summary,'candidate-model.json':candidate,'private-predictions.json':predictions}))fs.writeFileSync(path.join(output,name),JSON.stringify(data,null,2));console.log(JSON.stringify(summary,null,2));
