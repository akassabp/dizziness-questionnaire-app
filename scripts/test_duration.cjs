const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage();
 await page.addInitScript(()=>sessionStorage.setItem('nebula-access-20261014-temp','granted'));
 await page.goto(process.env.NEBULA_TEST_URL||'http://localhost:8765');
 const payload={questionnaire_revision:'km2-attack-tinnitus-v1',patient:{anonymous_id:'DURATION-TEST'},answers:{'259416':'Yes, left ear only'},unscored_answers:{'259369':{reason:'multiple_answers_for_single_choice',values:['Hours','Days','Hours']}}};
 await page.setInputFiles('#session-file',{name:'old-duration.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
 await page.waitForFunction(()=>NebulaApp.snapshot().answers['259369']?.length===2);
 assert.deepEqual(await page.evaluate(()=>NebulaApp.snapshot().answers['259369']),['Hours','Days']);
 assert.equal(await page.evaluate(()=>NebulaApp.snapshot().answers['259416']),'Yes, left ear only');
 const i=await page.evaluate(()=>window.NEBULA_DATA.questions.findIndex(q=>q.id==='259369'));
 await page.locator(`[data-index="${i}"]`).click();
 assert.equal(await page.locator('#answer-options input[type=checkbox]:checked').count(),2);
 await page.locator('#answer-options input').first().check();
 assert.equal(await page.locator('#answer-options input:checked').count(),3);
 const promise=page.waitForEvent('download');await page.click('#export-json');const file=await promise;
 const exported=JSON.parse(fs.readFileSync(await file.path(),'utf8'));
 assert.equal(exported.answers['259369'].length,3);assert.equal(exported.unscored_answers['259369'],undefined);
 await page.setInputFiles('#session-file',{name:'new-duration.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
 assert.equal(await page.locator('#answer-options input:checked').count(),3);
 assert.equal(await page.evaluate(()=>{const D=window.NEBULA_DATA,M=window.NebulaModel;return JSON.stringify(M.score(D.rules,{'259369':['Hours','Days','Hours']}))===JSON.stringify(M.score(D.rules,{'259369':['Hours','Days']}));}),true);
 console.log('PASS: legacy recovery, tinnitus compatibility, duration checkboxes, export/import and no duplicate-option points.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
