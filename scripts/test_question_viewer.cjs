const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>sessionStorage.setItem('nebula-access-20261014-temp','granted'));
 await page.goto(process.env.NEBULA_TEST_URL||'http://localhost:8765');
 const fixture=await page.evaluate(()=>{const q=NEBULA_DATA.questions.find(q=>q.kind==='multi'&&!q.showWhen);return {patient:{anonymous_id:'VIEWER-TEST',age:42,sex:'Female',recorded_labels:['BPPV']},answers:{[q.id]:q.options.slice(0,2)}};});
 const load=async data=>{await page.setInputFiles('#session-file',{name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.waitForFunction(id=>document.querySelector('#patient-id').value===id,data.patient.anonymous_id);};
 await load(fixture);await page.click('#show-review');
 assert.equal(await page.locator('#scoring-view').isVisible(),false);
 assert.ok(await page.locator('.review-card').count()>0);
 assert.equal(await page.locator('#review-previous').isDisabled(),true);
 const ids=[],checked=[];
 do {
  ids.push(...await page.locator('.review-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.questionId)));
  checked.push(...await page.locator('.review-option input:checked').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label'))));
  assert.ok(await page.locator('.review-option input').evaluateAll(nodes=>nodes.every(n=>n.disabled)));
  assert.ok(await page.locator('.review-card').evaluateAll(nodes=>nodes.every(n=>n.scrollHeight<=n.clientHeight+1)),'All choices fit without scrolling inside cards');
  if(await page.locator('#review-next').isDisabled())break;
  await page.click('#review-next');
 }while(true);
 assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual(checked,Object.values(fixture.answers)[0]);
 const count=await page.evaluate(()=>{const a=NebulaApp.snapshot().answers,M=NebulaModel;return NEBULA_DATA.questions.filter(q=>!q.showWhen||M.values(a[q.showWhen.questionId]).includes(M.norm(q.showWhen.answer))).length;});
 assert.equal(ids.length,count);
 await page.click('#show-scoring');assert.equal(await page.inputValue('#patient-id'),'VIEWER-TEST');
 assert.deepEqual(await page.evaluate(()=>NebulaApp.snapshot().answers),fixture.answers);
 await page.click('#show-review');await load({...fixture,patient:{...fixture.patient,anonymous_id:'SECOND'}});
 assert.equal(await page.locator('#review-previous').isDisabled(),true);
 assert.equal(await page.locator('#question-review').isVisible(),true);
 assert.equal(await page.locator('.recorded-badge:visible').count(),0);
 await page.screenshot({path:'/tmp/nebula-question-viewer.png'});
 for(const [width,height] of [[1280,720],[900,700],[390,844],[390,600],[844,390]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await load({...fixture,patient:{anonymous_id:`SIZE-${width}-${height}`}});
  const options={};let pages=0;
  do {
   assert.ok(++pages<100,'Pagination must terminate');
   const layout=await page.evaluate(()=>{
    const area=document.querySelector('#review-cards').getBoundingClientRect();
    return {width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,cards:[...document.querySelectorAll('.review-card')].map(n=>({id:n.dataset.questionId,bottom:n.getBoundingClientRect().bottom,areaBottom:area.bottom,overflow:n.scrollHeight-n.clientHeight})),footer:document.querySelector('.review-navigation').getBoundingClientRect().bottom};
   });
   assert.ok(layout.width<=width+1&&layout.height<=height+1,JSON.stringify(layout));
   assert.ok(layout.footer<=height,JSON.stringify(layout));
   assert.ok(layout.cards.every(c=>c.bottom<=c.areaBottom+1&&c.overflow<=1),JSON.stringify(layout));
   assert.ok(await page.locator('.review-column').evaluateAll(cols=>cols.every(col=>[...col.children].every((el,i)=>!i||Math.abs(el.getBoundingClientRect().top-col.children[i-1].getBoundingClientRect().bottom-10)<1))),'Cards stack immediately below each other');
   const visible=await page.locator('.review-card').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.questionId,options:[...n.querySelectorAll('input')].map(i=>i.getAttribute('aria-label'))})));
   for(const card of visible)(options[card.id]||=[]).push(...card.options);
   if(await page.locator('#review-next').isDisabled())break;
   await page.click('#review-next');
  }while(true);
  const expected=await page.evaluate(()=>{const M=NebulaModel,a=NebulaApp.snapshot().answers;return Object.fromEntries(NEBULA_DATA.questions.filter(q=>!q.showWhen||M.values(a[q.showWhen.questionId]).includes(M.norm(q.showWhen.answer))).map(q=>[q.id,['multi','single'].includes(q.kind)?q.options:[]]));});
  assert.deepEqual(options,expected,'Every question and option appears once, including continuations');
 }
 await page.click('#new-questionnaire');assert.equal(await page.locator('#review-previous').isDisabled(),true);assert.equal(await page.locator('.review-option input:checked').count(),0);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: question viewer pagination, multi-select responses, shared case state, hidden results, reset and responsive layout.');
})().catch(e=>{console.error(e);process.exit(1);});
