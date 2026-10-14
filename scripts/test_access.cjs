const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 if(!process.env.NEBULA_ACCESS_CODE)throw new Error('Set NEBULA_ACCESS_CODE');
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
 await page.addInitScript(()=>sessionStorage.setItem('nebula-access','granted'));
 await page.goto(process.env.NEBULA_TEST_URL||'http://localhost:8765');
 assert.equal(await page.locator('#access-gate').isVisible(),true);
 await page.fill('#access-code',process.env.NEBULA_OLD_ACCESS_CODE||'incorrect-code');
 await page.locator('#access-form').evaluate(f=>f.requestSubmit());
 await page.waitForFunction(()=>document.querySelector('#access-error').textContent.length);
 assert.equal(await page.locator('#access-gate').isVisible(),true);
 await page.fill('#access-code',process.env.NEBULA_ACCESS_CODE);
 await page.locator('#access-form').evaluate(f=>f.requestSubmit());
 await page.waitForSelector('#access-gate',{state:'hidden'});
 await page.reload();assert.equal(await page.locator('#access-gate').isVisible(),false);
 await browser.close();console.log('PASS: prior session and incorrect code rejected; new code accepted and retained.');
})().catch(e=>{console.error(e);process.exit(1);});
