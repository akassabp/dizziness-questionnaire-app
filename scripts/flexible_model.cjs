// Experimental integer point-ranking model. Does not modify deployed weights.
const M=require('../dist/model-core.js');
function fit(rules,records,options={}){
 const base=M.integerBaseline(rules),w=[...base],cats=[...new Set(rules.map(r=>r.category))],ci=rules.map(r=>cats.indexOf(r.category));
 const counts=cats.map(c=>records.filter(r=>r.labels.includes(c)).length),hit=records.map(p=>rules.map(r=>+M.matched(r,p.answers)));
 const radius=base.map(v=>Math.max(1,Math.round(Math.abs(v)*.25))),lo=base.map((v,i)=>v>0?Math.max(1,v-radius[i]):v<0?v-radius[i]:0),hi=base.map((v,i)=>v<0?Math.min(-1,v+radius[i]):v>0?v+radius[i]:0);
 if(options.relaxExclusions)rules.forEach((r,i)=>{if(r.weight===-100){lo[i]=-100;hi[i]=-1;radius[i]=99;}});
 const free=rules.map((r,i)=>r.weight!==0&&(r.weight!==-100||options.relaxExclusions)&&counts[ci[i]]>0&&hit.some(h=>h[i]));
 const ruledOut=cats.map(c=>!options.relaxExclusions&&rules.some(r=>r.category===c&&r.weight===-100));
 const totals=cats.map((c,j)=>base.reduce((s,v,i)=>s+(ci[i]===j&&v>0?v:0),0));
 let reference;
 function objective(){
  const budgets=cats.map((c,j)=>w.reduce((s,v,i)=>s+(ci[i]===j&&v>0?v:0),0));
  // Fixed -100 exclusions must not be defeated by a larger positive budget.
  if(budgets.some((v,j)=>v>totals[j]*(ruledOut[j]?1:1.25)+1e-9||v<totals[j]*.75-1e-9))return Infinity;
  let loss=0,pos=0,neg=0;const evaluated=counts.filter(n=>n>0&&n<records.length).length;
  records.forEach((p,n)=>{
   const points=cats.map(()=>0);w.forEach((v,i)=>points[ci[i]]+=v*hit[n][i]);
   const positives=cats.map((c,j)=>p.labels.includes(c)?j:-1).filter(j=>j>=0),others=cats.map((c,j)=>!p.labels.includes(c)?j:-1).filter(j=>j>=0);
   for(const a of positives)for(const b of others)loss+=Math.max(0,.1-(points[a]-points[b])/100)**2/(records.length*positives.length*others.length);
   cats.forEach((c,j)=>{if(counts[j]>0&&counts[j]<records.length){if(p.labels.includes(c))pos+=points[j]/100/counts[j]/evaluated;else neg+=points[j]/100/(records.length-counts[j])/evaluated;}});
  });
  if(reference&&(pos<reference.pos-1e-10||neg>reference.neg+1e-10))return Infinity;
  if(!reference)reference={pos,neg};
  return loss+.002*w.reduce((s,v,i)=>s+((v-base[i])/radius[i])**2,0)/w.length;
 }
 let best=objective(),moves=0,sweeps=0;
 const movesets=options.fixedBudget?[]:free.flatMap((f,i)=>f?[[[i,1]],[[i,-1]]]:[]);
 for(let i=0;i<w.length;i++)for(let j=i+1;j<w.length;j++)if(free[i]&&free[j]&&ci[i]===ci[j]&&Math.sign(w[i])===Math.sign(w[j]))for(const sign of [-1,1])movesets.push([[i,sign],[j,-sign]]);
 for(;sweeps<(options.relaxExclusions?150:30);sweeps++){
  let changed=false;
  for(const delta of movesets){
   if(delta.some(([i,v])=>w[i]+v<lo[i]||w[i]+v>hi[i]))continue;
   delta.forEach(([i,v])=>w[i]+=v);const candidate=objective();
   if(candidate<best-1e-10){best=candidate;moves++;changed=true;}else delta.forEach(([i,v])=>w[i]-=v);
  }
  if(!changed)break;
 }
 return {rules:rules.map((r,i)=>({...r,weight:w[i]})),objective:best,moves,sweeps,baseline:base,lower:lo,upper:hi};
}
function scores(rules,answers){const s=M.score(rules,answers);return Object.fromEntries(Object.entries(s).map(([c,v])=>[c,{...v,percent:v.points}]));}
module.exports={fit,scores};
