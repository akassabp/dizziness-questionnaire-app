const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),M=require('../dist/model-core.js'),F=require('./flexible_model.cjs');
const [input,foldfile,output]=process.argv.slice(2),repo=path.resolve(__dirname,'..');
if(!output||path.resolve(output)===repo||path.resolve(output).startsWith(repo+path.sep))throw Error('Private output directory outside repo required');
const D=JSON.parse(fs.readFileSync(input)),folds=JSON.parse(fs.readFileSync(foldfile)),records=D.cases,rules=D.rules;
function check(fit,train){
 fit.rules.forEach((r,i)=>{assert.ok(Number.isInteger(r.weight));assert.equal(Math.sign(r.weight),Math.sign(rules[i].weight));assert.ok(r.weight>=fit.lower[i]&&r.weight<=fit.upper[i]);if(rules[i].weight===-100)assert.equal(r.weight,-100);if(!train.some(p=>p.labels.includes(r.category))||!train.some(p=>M.matched(r,p.answers)))assert.equal(r.weight,fit.baseline[i]);});
 for(const c of new Set(rules.map(r=>r.category))){const sum=rs=>rs.filter(r=>r.category===c&&r.weight>0).reduce((s,r)=>s+r.weight,0),base=sum(rules.map((r,i)=>({...r,weight:fit.baseline[i]})));assert.ok(sum(fit.rules)<=base*(rules.some(r=>r.category===c&&r.weight===-100)?1:1.25)+1e-9);assert.ok(sum(fit.rules)>=base*.75-1e-9);}
}
const repetitions=[];
for(const [n,repeat] of folds.entries()){
 const fixed=[],flex=[],raw=[],ablation=[];
 for(const held of repeat){const test=new Set(held),train=records.filter((_,i)=>!test.has(i)),a=M.fit(rules,train),b=F.fit(rules,train),c=F.fit(rules,train,{fixedBudget:true});check(b,train);check(c,train);
 for(const i of held){fixed[i]=M.score(a.rules,records[i].answers);raw[i]=F.scores(a.rules,records[i].answers);flex[i]=F.scores(b.rules,records[i].answers);ablation[i]=F.scores(c.rules,records[i].answers);}}
 repetitions.push({fixed:M.rankingMetrics(records,fixed),fixedNetPoints:M.rankingMetrics(records,raw),flexible:M.rankingMetrics(records,flex),fixedBudgetRawObjective:M.rankingMetrics(records,ablation),predictions:{fixed,flexible:flex,fixedBudgetRawObjective:ablation}});
 console.log('Completed held-out repetition',n+1);
}
const trained=F.fit(rules,records);check(trained,records);
const categories=[...new Set(rules.map(r=>r.category))],budgets=Object.fromEntries(categories.map(c=>[c,trained.rules.filter(r=>r.category===c&&r.weight>0).reduce((s,r)=>s+r.weight,0)]));
const summary={repetitions:repetitions.map(({predictions,...r})=>r),trained:M.rankingMetrics(records,records.map(r=>F.scores(trained.rules,r.answers))),budgets,fit:{objective:trained.objective,moves:trained.moves,sweeps:trained.sweeps},means:{}};
for(const model of ['fixed','fixedNetPoints','flexible','fixedBudgetRawObjective'])summary.means[model]=Object.fromEntries(Object.keys(repetitions[0][model]).map(k=>[k,repetitions.reduce((s,r)=>s+r[model][k],0)/repetitions.length]));
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(output,'private-predictions.json'),JSON.stringify(repetitions));fs.writeFileSync(path.join(output,'candidate-model.json'),JSON.stringify(trained,null,2));console.log(JSON.stringify(summary,null,2));
