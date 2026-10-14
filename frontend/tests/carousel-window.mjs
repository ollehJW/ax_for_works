// Browser-only regression: mocks identity/catalog responses; never creates DB sessions.
// AX_TEST_URL and AX_TEST_CATALOG select a deployed build and its catalog JSON.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const origin=process.env.AX_TEST_URL||'https://axforwork.wia.co.kr';
const catalog=JSON.parse(fs.readFileSync(process.env.AX_TEST_CATALOG||'../config/agents.json','utf8'));
const agents=catalog.filter(a=>a.enabled).map(a=>({...a,launch_url:`/api/agents/${a.id}/launch`}));
assert.equal(agents.length,5);
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
try {
const context=await browser.newContext({viewport:{width:1440,height:1200},reducedMotion:'reduce'});
await context.route('**/api/auth/me',r=>r.fulfill({json:{user_id:'ui-fixture',employee_id:'ui-fixture',full_name:'화면 검증',organization:'검증 조직',team_name:'검증 팀',role_name:'매니저',email:'ui@example.invalid',is_admin:false,must_change_password:false}}));
await context.route('**/api/agents',r=>r.fulfill({json:{agents}}));
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(origin);await page.locator('.card').nth(4).waitFor();
const tabs=()=>page.locator('.hero [role=tab]').evaluateAll(els=>els.map(el=>el.id));
const first=agents.slice(0,4).map(a=>'tab-'+a.id),last=agents.slice(1,5).map(a=>'tab-'+a.id);
assert.deepEqual(await tabs(),first);
const boxes=await page.locator('.card').evaluateAll(els=>els.map(el=>({x:el.offsetLeft,y:el.offsetTop})));
assert.ok(boxes.slice(0,4).every(b=>b.y===boxes[0].y));assert.ok(boxes[4].y>boxes[0].y);assert.equal(boxes[4].x,boxes[0].x);
for(let i=1;i<=4;i++){await page.getByRole('button',{name:'다음 슬라이드'}).click();assert.equal(await page.locator('[role=tab][aria-selected=true]').getAttribute('id'),'tab-'+agents[i].id);assert.deepEqual(await tabs(),i===4?last:first);}
assert.ok(await page.getByRole('group',{name:'WiaVoice 예시 화면'}).isVisible());
await page.screenshot({path:process.env.AX_TEST_SCREENSHOT||'/tmp/ax-voice-carousel.png',fullPage:true});
await page.getByRole('button',{name:'다음 슬라이드'}).click();assert.deepEqual(await tabs(),first);
await page.getByRole('tab',{name:/WiaMeet/}).focus();await page.keyboard.press('End');await page.waitForFunction(()=>document.activeElement.id==='tab-wiavoice');assert.deepEqual(await tabs(),last);
await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.activeElement.id==='tab-wiameet');assert.deepEqual(await tabs(),first);
await page.getByRole('button',{name:'이전 슬라이드'}).click();assert.deepEqual(await tabs(),last);
for(const width of [1280,1440,1920]){await page.setViewportSize({width,height:1200});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('.hero [role=tab]').count(),4);}
await page.clock.install();await page.emulateMedia({reducedMotion:'no-preference'});await page.reload();await page.locator('.card').nth(4).waitFor();await page.mouse.move(0,0);await page.evaluate(()=>document.activeElement.blur());
for(let i=1;i<=5;i++){await page.clock.runFor(6100);assert.equal(await page.locator('[role=tab][aria-selected=true]').getAttribute('id'),'tab-'+agents[i%5].id);assert.deepEqual(await tabs(),i===4?last:first);}
assert.deepEqual(errors,[]);console.log('PASS: 4+1 cards; four visible tabs; manual/automatic wrap; keyboard focus; three desktop widths; WiaVoice preview');
await context.close();
} finally {await browser.close();}
