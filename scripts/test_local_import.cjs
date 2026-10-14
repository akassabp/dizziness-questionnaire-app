// Run with NODE_PATH pointing to a Playwright installation and a server on :8765.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors = [], outbound = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => sessionStorage.setItem('nebula-access', 'granted'));
  await page.goto('http://localhost:8765');
  page.on('request', r => outbound.push(r.url()));
  page.on('dialog', d => d.accept());
  const fixture = await page.evaluate(() => {
    const rule = window.NEBULA_DATA.rules.find(r => r.weight > 0 && window.NEBULA_DATA.questions.some(q => q.id === r.questionId && !q.showWhen && q.options?.includes(r.answer)));
    const q = window.NEBULA_DATA.questions.find(q => q.id === rule.questionId);
    return {patient:{anonymous_id:'TEST-001',age:40,sex:'Female',recorded_label:'BPPV'},answers:{[q.id]:q.kind === 'multi' ? [rule.answer] : rule.answer}};
  });
  await page.setInputFiles('#session-file', {name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await page.waitForFunction(() => document.querySelector('#patient-id').value === 'TEST-001');
  assert.match(await page.locator('#case-summary').innerText(), /Age: 40/);
  assert.match(await page.locator('#answered-count').innerText(), /^1 of/);
  assert.ok((await page.locator('#score-list').innerText()).match(/\+[1-9]/));
  assert.equal(await page.locator('#score-list .recorded-badge').count(), 1);
  await page.locator('#score-list [data-category="BPPV"]').click();
  assert.ok(await page.locator('#score-dialog').isVisible());
  assert.ok(await page.locator('#score-dialog .question-total').count() > 0);
  assert.equal(await page.locator('#score-dialog details').getAttribute('open'), null);
  await page.locator('#score-dialog summary').click();
  assert.ok(await page.locator('#score-dialog details article').count()>0);
  await page.keyboard.press('Escape');
  const scoreText=await page.locator('#trained-score-list').innerText();
  assert.ok(!/[+-]\d+\.\d+ pts/.test(scoreText));
  await page.locator('#questionnaire-view [data-view="model"]').click();
  assert.ok(await page.locator('#model-view').isVisible());
  assert.equal(await page.locator('#model-weights tr').count(),120);
  await page.check('#changed-only');
  assert.ok(await page.locator('#model-weights tr').count() < 120);
  await page.locator('#model-view [data-view="questionnaire"]').click();
  // Synthetic fixture only; never put real cases into screenshots.
  if(process.env.NEBULA_SCREENSHOT) await page.screenshot({path:process.env.NEBULA_SCREENSHOT,fullPage:true});
  await page.setInputFiles('#session-file', {name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Invalid JSON'));
  assert.equal(await page.inputValue('#patient-id'), 'TEST-001');
  await page.evaluate(payload => {
    const data = new DataTransfer(); data.items.add(new File([JSON.stringify({...payload,patient:{anonymous_id:'DROP-002'}})], 'drop.json', {type:'application/json'}));
    document.querySelector('#patient-drop').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}));
  }, fixture);
  await page.waitForFunction(() => document.querySelector('#patient-id').value === 'DROP-002');
  assert.deepEqual(outbound, []);
  await page.click('#new-questionnaire');
  assert.equal(await page.locator('#case-summary').innerText(), '');
  assert.match(await page.locator('#answered-count').innerText(), /^0 of/);
  assert.deepEqual(errors, []);
  if (process.argv[2]) {
    const fs = require('node:fs'), path = require('node:path');
    const files = fs.readdirSync(process.argv[2]).filter(f => /^(CASE|PATIENT)-\d+\.json$/.test(f));
    for (const filename of files) {
      await page.setInputFiles('#session-file', path.resolve(process.argv[2], filename));
      await page.waitForFunction(id => document.querySelector('#patient-id').value === id, filename.replace('.json',''));
      assert.ok(!/^0 of/.test(await page.locator('#answered-count').innerText()));
      const checks=await page.evaluate(()=>{
        const s=window.NebulaApp.snapshot(),M=window.NebulaModel;
        return ['default','trained'].map(model=>{
          const id=model==='default'?'score-list':'trained-score-list',rules=model==='default'?window.NEBULA_DATA.rules:window.NEBULA_TRAINED.rules;
          const scores=M.score(rules,s.answers),expected=Object.entries(scores).sort(([a,x],[b,y])=>y.percent-x.percent||y.points-x.points||a.localeCompare(b,undefined,{sensitivity:'base'})).map(([c])=>c);
          return {expected,actual:[...document.querySelectorAll('#'+id+' [data-category]')].map(b=>b.dataset.category),badges:document.querySelectorAll('#'+id+' .recorded-badge').length,labels:s.patient.recorded_labels.length};
        });
      });
      for(const check of checks){assert.deepEqual(check.actual,check.expected);assert.equal(check.badges,check.labels);}
    }
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    console.log(`PASS: all ${files.length} local case files loaded and scored without network requests.`);
  }
  await browser.close(); console.log('PASS: file import, scoring, invalid-file preservation, drag/drop, reset, zero network requests.');
})().catch(e => { console.error(e); process.exit(1); });
