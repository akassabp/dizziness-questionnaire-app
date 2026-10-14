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
  document.addEventListener('nebula:change',()=>{if(openCategory && dialog.open)explain(openCategory);});
})();
