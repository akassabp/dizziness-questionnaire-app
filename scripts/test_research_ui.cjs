const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.addInitScript(()=>sessionStorage.setItem('nebula-access','granted'));
 await page.goto(process.env.NEBULA_TEST_URL||'http://localhost:8765');
 const fixture=await page.evaluate(()=>{
   const D=window.NEBULA_DATA;
   for(const q of D.questions.filter(q=>q.kind==='multi'&&!q.showWhen)) for(const c of new Set(D.rules.map(r=>r.category))) {
     const rr=D.rules.filter(r=>r.questionId===q.id&&r.category===c&&q.options.includes(r.answer)&&r.weight!==0);
     if(rr.length>=2)return {category:c,qid:q.id,weights:rr.slice(0,2).map(r=>r.weight),payload:{patient:{anonymous_id:'SYNTHETIC',recorded_label:c},answers:{[q.id]:rr.slice(0,2).map(r=>r.answer)}}};
   }
 });
 assert.ok(fixture);
 await page.setInputFiles('#session-file',{name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.payload))});
 await page.waitForFunction(()=>document.querySelector('#patient-id').value==='SYNTHETIC');
 await page.locator('[data-category]').filter({hasText:fixture.category}).first().click();
 assert.equal(await page.locator('#score-dialog-body > .explanation-question').count(),1);
 assert.equal(await page.locator('#score-dialog-body > .explanation-question .contribution').count(),2);
 const total=fixture.weights.reduce((s,v)=>s+v,0);
 assert.match(await page.locator('.question-total').innerText(),new RegExp(String(Number(total.toFixed(3))).replace('.','\\.')));
 if(process.env.NEBULA_SCREENSHOT_DIR) await page.screenshot({path:process.env.NEBULA_SCREENSHOT_DIR+'/nebula-breakdown.png'});
 await page.locator('#close-score-dialog').click();
 await page.locator('#trained-score-list [data-category]').filter({hasText:fixture.category}).first().click();
 assert.match(await page.locator('#score-dialog-body').innerText(),/Trained multi-label model/);
 assert.ok(!/[+-]\d+\.\d+ pts/.test(await page.locator('#score-dialog-body').innerText()));
 await page.locator('#close-score-dialog').click();
 assert.equal(await page.locator('#score-model').count(),0);
 await page.locator('#questionnaire-view [data-view="model"]').click();
 if(process.env.NEBULA_SCREENSHOT_DIR) await page.screenshot({path:process.env.NEBULA_SCREENSHOT_DIR+'/nebula-model.png'});
 for(const width of [1280,390]) {
   await page.setViewportSize({width,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
   await page.locator('#model-view [data-view="questionnaire"]').click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
   await page.locator('#questionnaire-view [data-view="model"]').click();
 }
 page.on('dialog',d=>d.accept());
 const before=await page.evaluate(()=>window.NebulaApp.snapshot().configuredRules);
 await page.getByRole('button',{name:'Copy trained weights to configuration draft'}).click();
 assert.ok(await page.locator('#configuration-view').isVisible());
 assert.deepEqual(await page.evaluate(()=>window.NebulaApp.snapshot().configuredRules),before);
 await browser.close(); console.log('PASS: grouped multi-choice contributions/subtotal, dialog close, model view, responsive widths.');
})().catch(e=>{console.error(e);process.exit(1);});
