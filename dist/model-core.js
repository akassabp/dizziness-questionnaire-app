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
    const predictions = records.map(r => prediction(score(rules, r.answers)));
    return evaluate(records.map(r => r.label), predictions);
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
    const counts = {}; records.forEach(r => counts[r.label] = (counts[r.label]||0)+1);
    const labels = records.map(r => cats.indexOf(r.label));
    if (labels.some(x=>x<0) || !records.length) throw new Error('Training requires known category labels.');
    const observed = rules.map((r,i)=>hits.some(row=>row[i]) && counts[r.category] > 0 && r.weight !== -100 && r.weight !== 0);
    const radius = baseline.map(w => Math.max(1, Math.round(Math.abs(w)*0.25)));
    const lower = baseline.map((w,i) => w > 0 ? Math.max(1,w-radius[i]) : w < 0 ? w-radius[i] : 0);
    const upper = baseline.map((w,i) => w < 0 ? Math.min(-1,w+radius[i]) : w > 0 ? w+radius[i] : 0);
    const pairs = [];
    for(let i=0;i<rules.length;i++) for(let j=i+1;j<rules.length;j++)
      if(observed[i] && observed[j] && catIndex[i]===catIndex[j] && Math.sign(weights[i])===Math.sign(weights[j])) pairs.push([i,j]);
    const available = cats.map((c)=>rules.reduce((s,r,i)=>s+(r.category===c && weights[i]>0?weights[i]:0),0));
    function objective() {
      let loss=0, error=0;
      records.forEach((p,n) => {
        const points=cats.map(()=>0); weights.forEach((w,i)=>points[catIndex[i]]+=w*hits[n][i]);
        const logits=points.map((v,c)=>Math.max(0,Math.min(100,v/Math.max(available[c],1)*100))/20);
        const max=Math.max(...logits), logZ=max+Math.log(logits.reduce((s,v)=>s+Math.exp(v-max),0));
        loss+=(logZ-logits[labels[n]])/counts[p.label]/Object.keys(counts).length;
        const displayed=points.map((v,c)=>Math.round(Math.max(0,Math.min(100,v/Math.max(available[c],1)*100))*10)/10);
        const top=Math.max(...displayed);
        if(top<=0 || displayed[labels[n]]!==top || displayed.filter(v=>v===top).length!==1) error+=1/counts[p.label]/Object.keys(counts).length;
      });
      return error+0.02*loss+0.002*weights.reduce((s,w,i)=>s+((w-baseline[i])/radius[i])**2,0)/weights.length;
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
  return {norm, values, matched, score, prediction, sanitize, integerBaseline, metrics, evaluate, fit};
});
