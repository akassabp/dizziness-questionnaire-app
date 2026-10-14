// Shuffle local filenames only: case IDs and all patient content remain unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
if(!process.argv[2])throw new Error('Usage: node scripts/shuffle_cases.cjs PRIVATE_CASE_FOLDER');
const dir=fs.realpathSync(process.argv[2]),repo=path.resolve(__dirname,'..');
if(dir===repo||dir.startsWith(repo+path.sep))throw new Error('Patient folders must stay outside the repository.');
const entries=fs.readdirSync(dir).filter(n=>/^(?:\d{3}-)?PATIENT-\d{3}\.json$/.test(n)).map(name=>{
 const content=fs.readFileSync(path.join(dir,name)),data=JSON.parse(content);
 if(!/^PATIENT-\d{3}$/.test(data.patient?.anonymous_id))throw new Error('Invalid case ID');
 return {name,id:data.patient.anonymous_id,hash:crypto.createHash('sha256').update(content).digest('hex')};
});
if(!entries.length||new Set(entries.map(e=>e.id)).size!==entries.length)throw new Error('No cases or duplicate IDs.');
for(let i=entries.length-1;i>0;i--){const j=crypto.randomInt(i+1);[entries[i],entries[j]]=[entries[j],entries[i]];}
const nonce=crypto.randomUUID();
entries.forEach((e,i)=>{e.target=String(i+1).padStart(3,'0')+'-'+e.id+'.json';e.temp='.shuffle-'+nonce+'-'+i; if(fs.existsSync(path.join(dir,e.target))&&!entries.some(x=>x.name===e.target))throw new Error('Target already exists');});
entries.forEach(e=>fs.renameSync(path.join(dir,e.name),path.join(dir,e.temp)));
entries.forEach(e=>fs.renameSync(path.join(dir,e.temp),path.join(dir,e.target)));
entries.forEach(e=>{if(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,e.target))).digest('hex')!==e.hash)throw new Error('Content changed');});
console.log(`Shuffled ${entries.length} filenames; all case contents and IDs verified unchanged.`);
