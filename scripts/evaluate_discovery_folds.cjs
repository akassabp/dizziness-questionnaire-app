const fs=require('node:fs'),path=require('node:path'),M=require('../dist/model-core.js');
const [input,foldFile,output]=process.argv.slice(2),repo=path.resolve(__dirname,'..');
if(!output||path.resolve(output).startsWith(repo+path.sep))throw new Error('Private output outside repository required');
const D=JSON.parse(fs.readFileSync(input)),splits=JSON.parse(fs.readFileSync(foldFile));
const results=splits.map(repeat=>{const predictions=[];for(const held of repeat){const set=new Set(held),fit=M.fit(D.rules,D.cases.filter((_,i)=>!set.has(i)));for(const i of held)predictions[i]=M.score(fit.rules,D.cases[i].answers);}return predictions;});
fs.writeFileSync(output,JSON.stringify(results));console.log(`Evaluated constrained refits on ${results.length} repeated grouped splits.`);
