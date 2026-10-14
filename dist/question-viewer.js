(() => {
  'use strict';
  const $=id=>document.getElementById(id),M=window.NebulaModel;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let page=0,anchor=null;
  function card(q,index,answers){
    const selected=M.values(answers[q.id]);let content;
    if(['single','multi'].includes(q.kind)){
      content=q.options.map(option=>{const checked=selected.includes(M.norm(option));return `<label class="review-option ${checked?'is-selected':''}"><input type="${q.kind==='multi'?'checkbox':'radio'}" disabled ${checked?'checked':''} aria-label="${escape(option)}"><span>${escape(option)}</span></label>`;}).join('');
      if(!selected.length)content+='<p class="review-blank">Not answered</p>';
    }else if(q.kind==='text')content='<p class="review-blank">Text response not collected in this version.</p>';
    else content=`<p class="review-value ${selected.length?'':'review-blank'}">${selected.length?escape(answers[q.id]):'Not answered'}</p>`;
    const el=document.createElement('article');el.className='review-card panel';el.tabIndex=0;el.dataset.questionId=q.id;el.dataset.questionIndex=index;
    el.setAttribute('aria-label',`Question ${index+1}`);
    el.innerHTML=`<p class="review-number">Question ${index+1}</p><h2>${escape(q.prompt)}</h2>${content}`;
    return el;
  }
  function render(preserveAnchor=false){
    if($('question-review').hidden)return;
    const area=$('review-cards'),{answers}=window.NebulaApp.snapshot();
    const questions=window.NEBULA_DATA.questions.filter(q=>!q.showWhen||M.values(answers[q.showWhen.questionId]).includes(M.norm(q.showWhen.answer)));
    const cols=innerWidth>1100?3:innerWidth>720?2:1,gap=10,height=Math.floor(area.clientHeight)-1;
    if(height<1)return;
    const width=(area.clientWidth-gap*(cols-1))/cols;
    // Measure actual wrapped content at the final column width.
    const measure=document.createElement('div');measure.className='review-measure';measure.style.width=width+'px';area.replaceChildren(measure);
    const fragments=[];
    questions.forEach((q,index)=>{
      const whole=card(q,index,answers);measure.replaceChildren(whole);
      if(whole.getBoundingClientRect().height<=height){fragments.push(whole);return;}
      // Oversized choice lists continue in another box, with the heading repeated.
      const items=[...whole.children].slice(2);items.forEach(el=>el.remove());
      let part=whole,partNumber=0;
      const nextPart=()=>{const next=whole.cloneNode(false);next.append(whole.children[0].cloneNode(true),whole.children[1].cloneNode(true));next.dataset.continuation=String(++partNumber);next.querySelector('.review-number').textContent=`Question ${index+1} · continued`;return next;};
      for(const item of items){
        part.append(item);measure.replaceChildren(part);
        if(part.getBoundingClientRect().height>height&&part.children.length>3){
          item.remove();fragments.push(part);part=nextPart();part.append(item);measure.replaceChildren(part);
        }
      }
      fragments.push(part);
    });
    // Stack down each column independently, then advance to a new page.
    const pages=[];let columns=Array.from({length:cols},()=>[]),column=0,used=0;
    for(const fragment of fragments){
      measure.replaceChildren(fragment);const h=Math.ceil(fragment.getBoundingClientRect().height);
      if(used&&used+gap+h>height){column++;used=0;}
      if(column===cols){pages.push(columns);columns=Array.from({length:cols},()=>[]);column=0;}
      columns[column].push(fragment);used+=(used?gap:0)+h;
    }
    if(columns.some(c=>c.length))pages.push(columns);
    if(preserveAnchor&&anchor){const found=pages.findIndex(p=>p.flat().some(el=>el.dataset.questionId===anchor));if(found>=0)page=found;}
    page=Math.max(0,Math.min(page,pages.length-1));
    area.replaceChildren();area.style.gridTemplateColumns=`repeat(${cols},minmax(0,1fr))`;
    const current=pages[page]||[];
    current.forEach(cards=>{const col=document.createElement('div');col.className='review-column';col.append(...cards);area.append(col);});
    const shown=current.flat(),first=shown[0],last=shown.at(-1);anchor=first?.dataset.questionId;
    $('review-page').textContent=first?`Questions ${+first.dataset.questionIndex+1}–${+last.dataset.questionIndex+1} of ${questions.length} · Page ${page+1} of ${pages.length}`:'No questions';
    $('review-previous').disabled=page===0;$('review-next').disabled=page>=pages.length-1;
  }
  function switchView(review){
    if($('score-dialog').open)$('score-dialog').close();
    document.body.classList.toggle('reviewing',review);
    $('scoring-view').hidden=review;$('question-review').hidden=!review;
    $('show-scoring').setAttribute('aria-pressed',String(!review));$('show-review').setAttribute('aria-pressed',String(review));
    if(review)render(true);
  }
  $('show-scoring').addEventListener('click',()=>switchView(false));$('show-review').addEventListener('click',()=>switchView(true));
  $('review-previous').addEventListener('click',()=>{page--;render();});
  $('review-next').addEventListener('click',()=>{page++;render();});
  document.addEventListener('nebula:change',()=>render(true));
  document.addEventListener('nebula:case-reset',()=>{page=0;anchor=null;render();});
  let size='',frame;
  new ResizeObserver(entries=>{const r=entries[0].contentRect,key=`${r.width}:${r.height}`;if(key===size)return;size=key;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>render(true));}).observe($('review-cards'));
  document.fonts.ready.then(()=>render(true));
})();
