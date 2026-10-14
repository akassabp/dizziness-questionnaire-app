/* Shared scoring and deterministic expert-constrained integer optimization. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NebulaModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const norm = v => String(v ?? '').trim().toLowerCase().replace(/[.’]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  const values = v => (Array.isArray(v) ? v : v == null ? [] : [v]).map(norm);
  const matched = (r, a) => values(a[r.questionId]).includes(norm(r.answer));
  function score(rules, answers) {
    const out = {};
    for (const r of rules) {
      const s = out[r.category] ||= {points:0, available:0, percent:0};
      if (r.weight > 0) s.available += r.weight;
      if (matched(r, answers)) s.points += r.weight;
    }
    for (const s of Object.values(out)) {
      s.points = Math.round(s.points * 100) / 100;
      s.available = Math.round(s.available * 100) / 100;
      s.percent = Math.round(Math.max(0, Math.min(100, s.points / Math.max(s.available, 1) * 100)) * 10) / 10;
    }
    return out;
  }
  function prediction(scores) {
    const entries = Object.entries(scores);
    const max = Math.max(...entries.map(([,s]) => s.percent));
    const winners = entries.filter(([,s]) => s.percent === max).map(([c]) => c);
    return max > 0 && winners.length === 1 ? winners[0] : 'Uncertain / tied';
  }
  function sanitize(answers, questions) {
    const result = {};
    for (const q of questions) {
      const v = answers[q.id], vv = Array.isArray(v) ? v : [v];
      if (!['single','multi'].includes(q.kind) || !vv.length || vv.some(x => !q.options.includes(x))) continue;
      if ((q.kind === 'single' && vv.length !== 1) || (vv.length > 1 && vv.some(x => norm(x) === 'none of the above'))) continue;
      result[q.id] = q.kind === 'multi' ? [...new Set(vv)] : vv[0];
    }
    for (const q of questions) if (q.showWhen && !values(result[q.showWhen.questionId]).includes(norm(q.showWhen.answer))) delete result[q.id];
    return result;
  }
  function integerBaseline(rules) {
    const weights = rules.map(r => Math.sign(r.weight) * Math.round(Math.abs(r.weight)));
    const groups = {};
    rules.forEach((r,i) => { if (r.weight) (groups[r.category + ':' + Math.sign(r.weight)] ||= []).push(i); });
    for (const ids of Object.values(groups)) {
      const target = Math.round(ids.reduce((s,i) => s + Math.abs(rules[i].weight), 0));
      ids.forEach(i => { weights[i] = Math.sign(rules[i].weight) * Math.max(1, Math.floor(Math.abs(rules[i].weight))); });
      let delta = target - ids.reduce((s,i) => s + Math.abs(weights[i]), 0);
      const order = [...ids].sort((a,b) => (Math.abs(rules[b].weight)%1) - (Math.abs(rules[a].weight)%1) || a-b);
      if (delta < 0) throw new Error('Integer sign-preserving budget is infeasible.');
      for (let j=0; delta > 0; j++,delta--) weights[order[j % order.length]] += Math.sign(weights[order[j % order.length]]);
    }
    return weights;
  }
  function metrics(rules, records) {
    return multiMetrics(records, records.map(r => score(rules, r.answers)));
  }
  function multiMetrics(records, scores) {
    const categories=[...new Set(records.flatMap(r=>r.labels))].sort(), byClass={};
    for(const c of categories) {
      const pos=[],neg=[];
      records.forEach((r,i)=>(r.labels.includes(c)?pos:neg).push(scores[i][c].percent/100));
      const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
      byClass[c]={positiveCount:pos.length,assumedNegativeCount:neg.length,positiveSupport:mean(pos),otherSupport:mean(neg),balancedSquaredError:(mean(pos.map(v=>(1-v)**2))+mean(neg.map(v=>v*v)))/2};
    }
    const avg=key=>categories.reduce((s,c)=>s+byClass[c][key],0)/categories.length;
    return {n:records.length,byClass,positiveSupport:avg('positiveSupport'),otherSupport:avg('otherSupport'),balancedSquaredError:avg('balancedSquaredError')};
  }
  function mergeRecords(records, questions) {
    const groups=new Map();
    for(const r of records) {
      if(!r.sourceAnswerFingerprint) throw new Error('Re-extract the workbook: full-source answer fingerprint is required.');
      if(!groups.has(r.sourceAnswerFingerprint))groups.set(r.sourceAnswerFingerprint,[]);
      groups.get(r.sourceAnswerFingerprint).push(r);
    }
    return [...groups.values()].map((rs,i)=>{
      const ages=[...new Set(rs.map(r=>r.age).filter(v=>v!=null))], sexes=[...new Set(rs.map(r=>r.sex).filter(Boolean))];
      return {id:`PATIENT-${String(i+1).padStart(3,'0')}`,labels:[...new Set(rs.map(r=>r.label))].sort(),answers:sanitize(rs[0].answers,questions),age:ages.length===1?ages[0]:null,sex:sexes.length===1?sexes[0]:null,ageConflict:ages.length>1,sourceCaseIds:rs.map(r=>r.id),sourceAnswerFingerprint:rs[0].sourceAnswerFingerprint,issues:rs[0].issues};
    });
  }
  function evaluate(labels, predictions) {
    const byClass = {}, confusion = {};
    let correct = 0;
    labels.forEach((label,i) => {
      const item = byClass[label] ||= {total:0, correct:0}; item.total++;
      if (label === predictions[i]) { item.correct++; correct++; }
      const row = confusion[label] ||= {}; row[predictions[i]] = (row[predictions[i]] || 0) + 1;
    });
    return {n:labels.length, correct, accuracy:correct / labels.length,
      macroRecall:Object.values(byClass).reduce((s,c) => s+c.correct/c.total,0)/Object.keys(byClass).length, byClass, confusion};
  }
  function fit(rules, records) {
    const baseline = integerBaseline(rules), weights = [...baseline];
    const cats = [...new Set(rules.map(r=>r.category))];
    const catIndex = rules.map(r=>cats.indexOf(r.category));
    const hits = records.map(p => rules.map(r=>matched(r,p.answers)?1:0));
    const counts = {}; records.forEach(r => r.labels.forEach(c=>counts[c]=(counts[c]||0)+1));
    if (!records.length || records.some(r=>!r.labels.length || r.labels.some(c=>!cats.includes(c)))) throw new Error('Training requires known category labels.');
    const evaluated=cats.filter(c=>counts[c]>0 && counts[c]<records.length);
    const observed = rules.map((r,i)=>hits.some(row=>row[i]) && counts[r.category] > 0 && r.weight !== -100 && r.weight !== 0);
    const radius = baseline.map(w => Math.max(1, Math.round(Math.abs(w)*0.25)));
    const lower = baseline.map((w,i) => w > 0 ? Math.max(1,w-radius[i]) : w < 0 ? w-radius[i] : 0);
    const upper = baseline.map((w,i) => w < 0 ? Math.min(-1,w+radius[i]) : w > 0 ? w+radius[i] : 0);
    const pairs = [];
    for(let i=0;i<rules.length;i++) for(let j=i+1;j<rules.length;j++)
      if(observed[i] && observed[j] && catIndex[i]===catIndex[j] && Math.sign(weights[i])===Math.sign(weights[j])) pairs.push([i,j]);
    const available = cats.map((c)=>rules.reduce((s,r,i)=>s+(r.category===c && weights[i]>0?weights[i]:0),0));
    let referenceSupport=null;
    function objective() {
      let loss=0, positiveMean=0, otherMean=0;
      records.forEach((p,n) => {
        const points=cats.map(()=>0); weights.forEach((w,i)=>points[catIndex[i]]+=w*hits[n][i]);
        for(const c of evaluated) {
          const support=Math.max(0,Math.min(1,points[cats.indexOf(c)]/Math.max(available[cats.indexOf(c)],1)));
          const positive=p.labels.includes(c);
          loss+=(support-(positive?1:0))**2 / (positive?counts[c]:records.length-counts[c]) / 2 / evaluated.length;
          if(positive)positiveMean+=support/counts[c]/evaluated.length;
          else otherMean+=support/(records.length-counts[c])/evaluated.length;
        }
      });
      if(referenceSupport && (positiveMean<referenceSupport.positiveMean-1e-10 || otherMean>referenceSupport.otherMean+1e-10))return Infinity;
      if(!referenceSupport)referenceSupport={positiveMean,otherMean};
      return loss+0.002*weights.reduce((s,w,i)=>s+((w-baseline[i])/radius[i])**2,0)/weights.length;
    }
    let best=objective(), sweeps=0, moves=0;
    for(;sweeps<30;sweeps++) {
      let changed=false;
      for(const [i,j] of pairs) for(const direction of [-1,1]) {
        if(weights[i]+direction<lower[i] || weights[i]+direction>upper[i] || weights[j]-direction<lower[j] || weights[j]-direction>upper[j]) continue;
        weights[i]+=direction; weights[j]-=direction;
        const candidate=objective();
        if(candidate<best-1e-10) { best=candidate; changed=true; moves++; }
        else { weights[i]-=direction; weights[j]+=direction; }
      }
      if(!changed) break;
    }
    return {rules:rules.map((r,i)=>({...r,weight:weights[i],source:'Experimental integer calibration'})), objective:best, sweeps, moves, baseline, lower, upper};
  }
  return {norm, values, matched, score, prediction, sanitize, integerBaseline, metrics, multiMetrics, mergeRecords, evaluate, fit};
});
