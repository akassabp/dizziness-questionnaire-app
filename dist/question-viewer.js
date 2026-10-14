(() => {
  'use strict';
  const $=id=>document.getElementById(id),M=window.NebulaModel;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let page=0;
  function render(){
    const {answers}=window.NebulaApp.snapshot();
    const questions=window.NEBULA_DATA.questions.filter(q=>!q.showWhen||M.values(answers[q.showWhen.questionId]).includes(M.norm(q.showWhen.answer)));
    const pages=Math.max(1,Math.ceil(questions.length/12));page=Math.min(page,pages-1);
    const start=page*12;
    $('review-cards').innerHTML=questions.slice(start,start+12).map((q,i)=>{
      const selected=M.values(answers[q.id]);let content;
      if(['single','multi'].includes(q.kind)){
        content=q.options.map(option=>{const checked=selected.includes(M.norm(option));return `<label class="review-option ${checked?'is-selected':''}"><input type="${q.kind==='multi'?'checkbox':'radio'}" disabled ${checked?'checked':''} aria-label="${escape(option)}"><span>${escape(option)}</span></label>`;}).join('');
        if(!selected.length)content+='<p class="review-blank">Not answered</p>';
      }else if(q.kind==='text')content='<p class="review-blank">Text response not collected in this version.</p>';
      else content=`<p class="review-value ${selected.length?'':'review-blank'}">${selected.length?escape(answers[q.id]):'Not answered'}</p>`;
      return `<article class="review-card panel" tabindex="0" data-question-id="${escape(q.id)}" aria-label="Question ${start+i+1}"><p class="review-number">Question ${start+i+1}</p><h2>${escape(q.prompt)}</h2>${content}</article>`;
    }).join('');
    $('review-page').textContent=`Questions ${start+1}–${Math.min(start+12,questions.length)} of ${questions.length} · Page ${page+1} of ${pages}`;
    $('review-previous').disabled=page===0;$('review-next').disabled=page===pages-1;
    $('review-cards').scrollTop=0;
  }
  function switchView(review){
    if($('score-dialog').open)$('score-dialog').close();
    $('scoring-view').hidden=review;$('question-review').hidden=!review;
    $('show-scoring').setAttribute('aria-pressed',String(!review));$('show-review').setAttribute('aria-pressed',String(review));
    if(review)render();
  }
  $('show-scoring').addEventListener('click',()=>switchView(false));$('show-review').addEventListener('click',()=>switchView(true));
  $('review-previous').addEventListener('click',()=>{page=Math.max(0,page-1);render();});
  $('review-next').addEventListener('click',()=>{page++;render();});
  document.addEventListener('nebula:change',()=>{if(!$('question-review').hidden)render();});
  document.addEventListener('nebula:case-reset',()=>{page=0;if(!$('question-review').hidden)render();});
})();
