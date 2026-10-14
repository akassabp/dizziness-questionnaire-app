const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>sessionStorage.setItem('nebula-access','granted'));
 await page.goto(process.env.NEBULA_TEST_URL||'http://localhost:8765');
 const fixture=await page.evaluate(()=>{const q=NEBULA_DATA.questions.find(q=>q.kind==='multi'&&!q.showWhen);return {patient:{anonymous_id:'VIEWER-TEST',age:42,sex:'Female',recorded_labels:['BPPV']},answers:{[q.id]:q.options.slice(0,2)}};});
 const load=async data=>{await page.setInputFiles('#session-file',{name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.waitForFunction(id=>document.querySelector('#patient-id').value===id,data.patient.anonymous_id);};
 await load(fixture);await page.click('#show-review');
 assert.equal(await page.locator('#scoring-view').isVisible(),false);
 assert.equal(await page.locator('.review-card').count(),12);
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
 for(const width of [1280,900,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await page.locator('.review-card').evaluateAll(nodes=>nodes.every(n=>n.scrollHeight<=n.clientHeight+1)));await page.locator('#review-next').scrollIntoViewIfNeeded();await page.click('#review-next');assert.ok(await page.locator('.review-card').evaluateAll(nodes=>nodes.every(n=>n.scrollHeight<=n.clientHeight+1)));}
 await page.click('#new-questionnaire');assert.equal(await page.locator('#review-previous').isDisabled(),true);assert.equal(await page.locator('.review-option input:checked').count(),0);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: question viewer pagination, multi-select responses, shared case state, hidden results, reset and responsive layout.');
})().catch(e=>{console.error(e);process.exit(1);});
