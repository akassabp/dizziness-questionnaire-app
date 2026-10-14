(() => {
  'use strict';
  const M=window.NebulaModel, D=window.NEBULA_DATA, T=window.NEBULA_TRAINED, A=window.NebulaApp;
  const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pts=v=>(v>0?'+':'')+Number(v.toFixed(3))+' pts', pct=v=>(v*100).toFixed(1)+'%';
  const categories=[...new Set(D.rules.map(r=>r.category))].sort();
  const dialog=$('score-dialog'); let openCategory=null;
  function explain(category) {
    openCategory=category;
    const s=A.snapshot(), score=M.score(s.rules,s.answers)[category];
    $('score-dialog-title').textContent=category;
    const groups=new Map();
    s.rules.filter(r=>r.category===category).forEach(r=>{ if(!groups.has(r.questionId)) groups.set(r.questionId,[]);groups.get(r.questionId).push(r); });
    const active=[], inactive=[];
    for(const [id,rules] of groups) {
      const q=D.questions.find(q=>q.id===id), selected=rules.filter(r=>M.matched(r,s.answers)&&r.weight!==0), remaining=rules.filter(r=>!M.matched(r,s.answers)||r.weight===0);
      const header=`<p class="eyebrow">Question ${esc(id)}</p><h3>${esc(q?.prompt||'Unknown question')}</h3>`;
      // Aggregate duplicate rule rows for the same option, while retaining each option separately.
      const rows=list=>{
        const options=new Map(); list.forEach(r=>options.set(r.answer,(options.get(r.answer)||0)+r.weight));
        return [...options].map(([answer,w])=>`<div class="contribution"><span>${esc(answer)}</span><strong class="${w<0?'penalty':'support'}">${pts(w)}</strong></div>`).join('');
      };
      if(selected.length) active.push(`<article class="explanation-question">${header}${rows(selected)}<div class="question-total"><b>Question total</b><b>${pts(selected.reduce((sum,r)=>sum+r.weight,0))}</b></div></article>`);
      if(remaining.length) {
        const hidden=q?.showWhen&&!M.values(s.answers[q.showWhen.questionId]).includes(M.norm(q.showWhen.answer));
        inactive.push(`<article class="explanation-question">${header}<p class="hint">${hidden?'Conditional question not currently shown':M.values(s.answers[id]).length?'Other options / rules not contributing':'Unanswered question'} — potential rule points only; not included in the current score.</p>${rows(remaining)}</article>`);
      }
    }
    $('score-dialog-body').innerHTML=`<p>${esc(s.model)}${s.patient?.recorded_label===category?' · ✓ Recorded source label':''}</p><div class="explanation-totals"><div>Total points<strong>${pts(score.points)}</strong></div><div>Current support<strong>${score.percent.toFixed(1)}%</strong></div></div><p class="hint">Support = net points ÷ ${Number(score.available.toFixed(3))} available positive points, clipped to 0–100%. Totals are rounded for display.</p>${active.join('')||'<p>No selected answers currently add or subtract points for this class.</p>'}<details class="inactive-rules"><summary>Unanswered / non-contributing options (${inactive.length} questions)</summary><p class="hint">These include both positive and negative rules. Options within a single-choice question are alternatives, not additive.</p>${inactive.join('')||'<p>None.</p>'}</details>`;
    if(!dialog.open) dialog.showModal();
  }
  $('score-list').addEventListener('click',e=>{ const b=e.target.closest('[data-category]');if(b)explain(b.dataset.category); });
  $('close-score-dialog').addEventListener('click',()=>{openCategory=null;dialog.close();});
  dialog.addEventListener('cancel',()=>{openCategory=null;});
  dialog.addEventListener('close',()=>{openCategory=null;});
  function renderCase() {
    const s=A.snapshot(), models=[D.rules,s.configuredRules,T.rules], scores=models.map(r=>M.score(r,s.answers));
    $('model-case-label').textContent=`Recorded source label: ${s.patient?.recorded_label||'not supplied'}. Unmarked categories are not known negatives. Comparisons use the same current answers, including any manual edits.`;
    $('model-predictions').innerHTML=['Default','Current configuration','Trained (experimental)'].map((name,i)=>`<div class="prediction-card"><span>${name}</span><strong>${esc(M.prediction(scores[i]))}</strong><small>Highest support; not a diagnosis</small></div>`).join('');
    $('model-case-scores').innerHTML=categories.map(c=>`<tr><td>${esc(c)} ${s.patient?.recorded_label===c?'<span class="recorded-badge">✓ Recorded</span>':''}</td>${scores.map(model=>{const score=model[c]||{percent:0,points:0};return `<td><b>${score.percent.toFixed(1)}%</b> · ${pts(score.points)}<div class="comparison-bar"><i style="width:${score.percent}%"></i></div></td>`;}).join('')}</tr>`).join('');
    if(openCategory && dialog.open)explain(openCategory);
  }
  function renderWeights() {
    const category=$('model-category').value, changed=$('changed-only').checked;
    $('model-weights').innerHTML=D.rules.map((r,i)=>({r,t:T.rules[i]})).filter(({r,t})=>(!category||r.category===category)&&(!changed||r.weight!==t.weight)).map(({r,t})=>`<tr><td>${esc(r.category)}</td><td><small>${esc(r.questionId)} · ${esc(D.questions.find(q=>q.id===r.questionId)?.prompt)}</small><br>${esc(r.answer)}</td><td>${pts(r.weight)}</td><td><b>${pts(t.weight)}</b></td><td>${pts(t.weight-r.weight)}</td></tr>`).join('');
  }
  const names={default:'Original workbook defaults',integerBaseline:'Rounded integer baseline (before learning)',trained:'Trained on all cases — training performance',crossValidation:'Exploratory grouped 3-fold — held-out predictions'};
  $('model-metrics').innerHTML=Object.entries(T.metrics).map(([key,m])=>`<div class="metric-line"><span>${names[key]}</span><b>${m.correct}/${m.n} (${pct(m.accuracy)}) label agreement</b><span>Macro recall ${pct(m.macroRecall)}</span></div>`).join('');
  $('model-class-metrics').innerHTML=`<div class="comparison-scroll"><table><thead><tr><th>Recorded class</th><th>Cases</th><th>Default matches</th><th>Trained matches</th><th>3-fold matches</th></tr></thead><tbody>${categories.map(c=>{const a=T.metrics.default.byClass[c],b=T.metrics.trained.byClass[c],v=T.metrics.crossValidation.byClass[c];return `<tr><td>${esc(c)}</td><td>${a?.total??0}</td><td>${a?`${a.correct}/${a.total}`:'Not evaluated'}</td><td>${b?`${b.correct}/${b.total}`:'Not evaluated'}</td><td>${v?`${v.correct}/${v.total}`:'Not evaluated'}</td></tr>`;}).join('')}</tbody></table></div><h3>3-fold confusion matrix</h3><p>Rows: recorded labels. Columns: highest-support class. Ties and zero support count as uncertain, not correct.</p><div class="comparison-scroll"><table><thead><tr><th>Recorded / predicted</th>${[...categories,'Uncertain / tied'].map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${Object.entries(T.metrics.crossValidation.confusion).map(([label,row])=>`<tr><th>${esc(label)}</th>${[...categories,'Uncertain / tied'].map(c=>`<td>${row[c]||0}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  $('model-method').innerHTML=`<p><b>${esc(T.method)}</b>: deterministic pairwise integer coordinate descent. Objective: class-balanced top-category error + 0.02 × class-balanced softmax loss + 0.002 × squared deviation from the integer baseline. The softmax temperature is fixed at 20 support-percentage units; softmax values are not displayed as probabilities.</p><p>Existing rules only. Signs preserved. Each weight stays within ±max(1, round(25% of its integer baseline)). Positive and negative category budgets are fixed. −100 rules are frozen. Rules without training matches and categories without labels are frozen after rounding. At most 30 sweeps; no guarantee of a global optimum.</p><p>Three folds group identical answer profiles together, then the deployed candidate is refitted on all cases. ${T.training.uniqueAnswerProfiles} distinct answer profiles; fold sizes ${T.training.foldSizes.join(', ')}. The objective was revised after an initial run reduced training label agreement; this is development, not a preregistered validation study.</p><ul>${T.limitations.map(l=>`<li>${esc(l)}</li>`).join('')}</ul><p>See <a href="methodology.html" target="_blank" rel="noopener">methodology and publication requirements</a>.</p>`;
  const budgets=rules=>Object.fromEntries(categories.map(c=>[c,[rules.filter(r=>r.category===c&&r.weight>0).reduce((s,r)=>s+r.weight,0),rules.filter(r=>r.category===c&&r.weight<0).reduce((s,r)=>s+r.weight,0)]]));
  const base=budgets(D.rules), trained=budgets(T.rules);
  $('model-budgets').innerHTML=categories.map(c=>`<tr><td>${esc(c)}</td><td>${base[c].map(pts).join(' / ')}</td><td>${trained[c].map(pts).join(' / ')}</td></tr>`).join('');
  $('model-category').innerHTML='<option value="">All categories</option>'+categories.map(c=>`<option>${esc(c)}</option>`).join('');
  $('model-category').addEventListener('change',renderWeights);$('changed-only').addEventListener('change',renderWeights);
  $('export-model').addEventListener('click',()=>A.downloadJson(T,'nebula-experimental-model.json'));
  const stage=document.createElement('button');stage.textContent='Copy trained weights to configuration draft';stage.addEventListener('click',A.stageTrained);$('export-model').after(stage);
  document.addEventListener('nebula:change',renderCase);
  renderCase();renderWeights();
})();
