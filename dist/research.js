(() => {
  'use strict';
  const M=window.NebulaModel, D=window.NEBULA_DATA, T=window.NEBULA_TRAINED, A=window.NebulaApp;
  const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pts=v=>(v>0?'+':'')+Number(v.toFixed(3))+' pts', pct=v=>(v*100).toFixed(1)+'%';
  const categories=[...new Set(D.rules.map(r=>r.category))].sort();
  const dialog=$('score-dialog'); let openCategory=null, openModel='default';
  function explain(category, model=openModel) {
    openCategory=category;
    openModel=model;
    const s=A.snapshot(model), score=M.score(s.rules,s.answers)[category];
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
    $('score-dialog-body').innerHTML=`<p>${esc(s.model)}${s.patient?.recorded_labels?.includes(category)?' · ✓ Recorded source label':''}</p><div class="explanation-totals"><div>Total points<strong>${pts(score.points)}</strong></div><div>Current support<strong>${score.percent.toFixed(1)}%</strong></div></div><p class="hint">Support = net points ÷ ${Number(score.available.toFixed(3))} available positive points, clipped to 0–100%. Totals are rounded for display.</p>${active.join('')||'<p>No selected answers currently add or subtract points for this class.</p>'}<details class="inactive-rules"><summary>Unanswered / non-contributing options (${inactive.length} questions)</summary><p class="hint">These include both positive and negative rules. Options within a single-choice question are alternatives, not additive.</p>${inactive.join('')||'<p>None.</p>'}</details>`;
    if(!dialog.open) dialog.showModal();
  }
  for(const id of ['score-list','trained-score-list'])$(id).addEventListener('click',e=>{ const b=e.target.closest('[data-category]');if(b)explain(b.dataset.category,b.dataset.model); });
  $('close-score-dialog').addEventListener('click',()=>{openCategory=null;dialog.close();});
  dialog.addEventListener('cancel',()=>{openCategory=null;});
  dialog.addEventListener('close',()=>{openCategory=null;});
  function renderCase() {
    const s=A.snapshot(), models=[D.rules,s.configuredRules,T.rules], scores=models.map(r=>M.score(r,s.answers));
    $('model-case-label').textContent=`Recorded diagnoses: ${s.patient?.recorded_labels?.join(', ')||'not supplied'}. Multiple labels are retained. Other diagnoses are not confirmed absent. Comparisons use the same current answers, including manual edits.`;
    $('model-predictions').textContent='Independent support for every diagnosis. No exclusive winning class is selected.';
    $('model-case-scores').innerHTML=categories.map(c=>`<tr><td>${esc(c)} ${s.patient?.recorded_labels?.includes(c)?'<span class="recorded-badge">✓ Recorded</span>':''}</td>${scores.map(model=>{const score=model[c]||{percent:0,points:0};return `<td><b>${score.percent.toFixed(1)}%</b> · ${pts(score.points)}<div class="comparison-bar"><i style="width:${score.percent}%"></i></div></td>`;}).join('')}</tr>`).join('');
    if(openCategory && dialog.open)explain(openCategory);
  }
  function renderWeights() {
    const category=$('model-category').value, changed=$('changed-only').checked;
    $('model-weights').innerHTML=D.rules.map((r,i)=>({r,t:T.rules[i]})).filter(({r,t})=>(!category||r.category===category)&&(!changed||r.weight!==t.weight)).map(({r,t})=>`<tr><td>${esc(r.category)}</td><td><small>${esc(r.questionId)} · ${esc(D.questions.find(q=>q.id===r.questionId)?.prompt)}</small><br>${esc(r.answer)}</td><td>${pts(r.weight)}</td><td><b>${pts(t.weight)}</b></td><td>${pts(t.weight-r.weight)}</td></tr>`).join('');
  }
  const names={default:'Original workbook defaults',integerBaseline:'Rounded integer baseline (before learning)',trained:'Trained on all cases — training performance',crossValidation:'Exploratory grouped 3-fold — held-out predictions'};
  $('model-metrics').innerHTML='<p>Macro averages across the seven diagnoses with positive cases. Recorded support: higher is better. Other support and balanced squared error: lower is better. Error is not a probability-calibration measure.</p>'+Object.entries(T.metrics).map(([key,m])=>`<div class="metric-line"><span>${names[key]}</span><b>Recorded ${pct(m.positiveSupport)}</b><span>Other ${pct(m.otherSupport)} · Error ${m.balancedSquaredError.toFixed(4)}</span></div>`).join('');
  $('model-class-metrics').innerHTML=`<p>Each cell shows mean support for recorded / other diagnoses. A global constraint does not guarantee improvement for every diagnosis or patient.</p><div class="comparison-scroll"><table><thead><tr><th>Diagnosis</th><th>Recorded / other cases</th><th>Default</th><th>Trained</th><th>3-fold</th></tr></thead><tbody>${categories.map(c=>{const a=T.metrics.default.byClass[c];return `<tr><td>${esc(c)}</td><td>${a?`${a.positiveCount} / ${a.assumedNegativeCount}`:'No positive cases'}</td>${['default','trained','crossValidation'].map(k=>{const v=T.metrics[k].byClass[c];return `<td>${v?`${pct(v.positiveSupport)} / ${pct(v.otherSupport)}`:'Not evaluated'}</td>`;}).join('')}</tr>`;}).join('')}</tbody></table></div>`;
  $('model-method').innerHTML=`<p><b>${esc(T.method)}</b>: independently encourage each recorded diagnosis toward 100% support and other diagnoses toward 0%, balancing positive and assumed-negative cases equally within each diagnosis. Minimize mean balanced squared error + 0.002 × normalized squared weight displacement. No softmax, exclusive class, or top-1 accuracy objective.</p><p>Training-set macro recorded support cannot decrease and macro other support cannot increase relative to the integer baseline (unrounded scores). Existing rules only, unchanged signs, integer weights within ±max(1, round(25% of baseline)). Positive and negative category point budgets stay fixed. Explicit −100 rule-outs and unobserved rules are frozen after rounding. Deterministic pairwise local search, at most 30 sweeps; not a global optimum guarantee.</p><p>${T.training.sourceEntries} blocks merged into ${T.training.mergedPatients} assumed patients, ${T.training.multiLabelPatients} with multiple labels; ${T.training.ageConflicts} conflicting ages left unknown. Fold sizes ${T.training.foldSizes.join(', ')}. The final model uses all merged patients; each validation fold refits on its training subset.</p><ul>${T.limitations.map(l=>`<li>${esc(l)}</li>`).join('')}</ul><p>See <a href="methodology.html" target="_blank" rel="noopener">methodology and publication requirements</a>.</p>`;
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
