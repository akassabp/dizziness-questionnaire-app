const{chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.addInitScript(()=>sessionStorage.setItem('nebula-access','granted'));
await page.goto(process.env.NEBULA_TEST_URL||'http://localhost:8765');
assert.equal(await page.locator('.tab,#configuration-view,#model-view').count(),0);
assert.equal(await page.locator('.score-panel h2').allTextContents().then(a=>a.join('|')),'Initially Defined Weights|Trained AI Model');
const fixture=await page.evaluate(()=>{const r=window.NEBULA_DATA.rules.find(r=>r.weight>0),q=window.NEBULA_DATA.questions.find(q=>q.id===r.questionId);return{patient:{anonymous_id:'SYNTHETIC',recorded_labels:['BPPV','Migraine']},answers:{[q.id]:q.kind==='multi'?[r.answer]:r.answer}};});
await page.evaluate(payload=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(payload)],'synthetic.json'));document.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}));},fixture);
await page.waitForFunction(()=>document.querySelector('#patient-id').value==='SYNTHETIC');
for(const id of ['score-list','trained-score-list']){
 assert.equal(await page.locator('#'+id+' .recorded-badge').count(),2);
 await page.locator('#'+id+' [data-category="BPPV"]').click();
 assert.match(await page.locator('#score-dialog-body').innerText(),id==='score-list'?/Initially Defined Weights/:/Trained AI Model/);
 await page.locator('#close-score-dialog').click();
}
const requests=[];page.on('request',r=>requests.push(r.url()));
if(process.argv[2])for(const f of fs.readdirSync(process.argv[2]).filter(n=>/^\d{3}-PATIENT-\d+\.json$/.test(n))){
 const full=path.resolve(process.argv[2],f),data=JSON.parse(fs.readFileSync(full));
 await page.setInputFiles('#session-file',full);
 await page.waitForFunction(id=>document.querySelector('#patient-id').value===id,data.patient.anonymous_id);
 for(const id of ['score-list','trained-score-list'])assert.equal(await page.locator('#'+id+' .recorded-badge').count(),data.patient.recorded_labels.length);
}
assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
await page.click('#new-questionnaire');
for(const width of [1440,1280,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
await browser.close();console.log('PASS: single page, renamed panels, both explanations, drag/drop, case loading, privacy and responsive layout.');
})().catch(e=>{console.error(e);process.exit(1);});
