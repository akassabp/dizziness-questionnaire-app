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
    const files = fs.readdirSync(process.argv[2]).filter(f => /^CASE-\d+\.json$/.test(f));
    for (const filename of files) {
      await page.setInputFiles('#session-file', path.resolve(process.argv[2], filename));
      await page.waitForFunction(id => document.querySelector('#patient-id').value === id, filename.replace('.json',''));
      assert.ok(!/^0 of/.test(await page.locator('#answered-count').innerText()));
    }
    assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
    console.log(`PASS: all ${files.length} local case files loaded and scored without network requests.`);
  }
  await browser.close(); console.log('PASS: file import, scoring, invalid-file preservation, drag/drop, reset, zero network requests.');
})().catch(e => { console.error(e); process.exit(1); });
