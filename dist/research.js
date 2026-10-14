(() => {
  'use strict';
  const M=window.NebulaModel,D=window.NEBULA_DATA,A=window.NebulaApp;
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pts=v=>(v>0?'+':'')+Number(v.toFixed(3))+' pts';
  const dialog=$('score-dialog');let openCategory=null,openModel='default';
  function explain(category,model=openModel){
    openCategory=category;openModel=model;
    const s=A.snapshot(model),score=M.score(s.rules,s.answers)[category],groups=new Map(),cards=[];
    s.rules.filter(r=>r.category===category).forEach(r=>{if(!groups.has(r.questionId))groups.set(r.questionId,[]);groups.get(r.questionId).push(r);});
    for(const[id,rules]of groups){
      const q=D.questions.find(q=>q.id===id),raw=s.answers[id],actual=Array.isArray(raw)?raw:raw==null||raw===''?[]:[raw];
      const expected=new Map();
      rules.forEach(r=>{const key=M.norm(r.answer);if(!expected.has(key))expected.set(key,{answer:r.answer,weight:0});expected.get(key).weight+=r.weight;});
      const rows=[],used=new Set(),remaining=[];
      for(const[key,rule]of expected){
        const index=actual.findIndex((a,i)=>!used.has(i)&&M.norm(a)===key);
        if(index>=0){used.add(index);rows.push({expected:rule.answer,actual:actual[index],weight:rule.weight});}
        else remaining.push(rule);
      }
      const unmatched=actual.filter((_,i)=>!used.has(i));
      for(let i=0;i<Math.max(remaining.length,unmatched.length);i++)rows.push({expected:remaining[i]?.answer||'',actual:unmatched[i]??'',weight:0});
      if(!actual.length&&rows.length)rows[0].missing=true;
      const total=rows.reduce((sum,r)=>sum+r.weight,0),applied=rows.some(r=>r.weight!==0);
      const hidden=q?.showWhen&&!M.values(s.answers[q.showWhen.questionId]).includes(M.norm(q.showWhen.answer));
      const table=rows.map(r=>{
        const status=r.weight>0?'effect-positive':r.weight<0?'effect-negative':r.actual!==''?'effect-neutral':'effect-missing';
        const label=r.weight>0?'Adds support':r.weight<0?'Subtracts support':r.actual!==''?'No effect':'';
        return `<tr><td>${esc(r.expected)}</td><td class="${status}">${r.missing?'Not answered':esc(r.actual)}${label?`<small>${label}</small>`:''}</td><td class="${status}">${r.weight!==0?pts(r.weight):''}</td></tr>`;
      }).join('');
      cards.push(`<article class="explanation-question" data-question-id="${esc(id)}"><p class="eyebrow">Question ${esc(id)}</p><h3>${esc(q?.prompt||'Unknown question')}</h3>${hidden?'<p class="hint">Conditional question not currently shown.</p>':''}<table class="answer-comparison"><thead><tr><th>Expected answer (rule)</th><th>Patient’s answer</th><th>Points applied</th></tr></thead><tbody>${table}</tbody></table>${applied?`<div class="question-total"><b>Question total</b><b>${pts(total)}</b></div>`:''}</article>`);
    }
    $('score-dialog-title').textContent=category;
    $('score-dialog-body').innerHTML=`<p>${esc(s.model)}${s.patient?.recorded_labels?.includes(category)?' · ✓ Recorded source label':''}</p><div class="explanation-totals"><div>Total points<strong>${pts(score.points)}</strong></div><div>Current support<strong>${score.percent.toFixed(1)}%</strong></div></div>${cards.join('')||'<p>No rules for this category.</p>'}`;
    if(!dialog.open)dialog.showModal();
  }
  for(const id of ['score-list','trained-score-list'])$(id).addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b)explain(b.dataset.category,b.dataset.model);});
  $('close-score-dialog').addEventListener('click',()=>{openCategory=null;dialog.close();});
  dialog.addEventListener('cancel',()=>{openCategory=null;});dialog.addEventListener('close',()=>{openCategory=null;});
  document.addEventListener('nebula:change',()=>{if(openCategory&&dialog.open)explain(openCategory);});
})();
