// Browser UI fixtures only; no real account/session or feedback writes.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const origin=process.env.AX_TEST_URL||'https://axforwork.wia.co.kr';
const catalog=process.env.AX_TEST_CATALOG||'../config/agents.json';
const fixture=process.env.AX_TEST_IMAGE||'src/assets/hyundai-wia-logo.png';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
try{
const context=await browser.newContext({viewport:{width:1440,height:1100}});
await context.route('**/api/auth/me',r=>r.fulfill({json:{user_id:'ui-fixture',employee_id:'ui-fixture',full_name:'화면 검증',organization:'검증 조직',team_name:'검증 팀',role_name:'매니저',email:'ui@example.invalid',is_admin:false,must_change_password:false}}));
await context.route('**/api/agents',r=>r.fulfill({json:{agents:JSON.parse(fs.readFileSync(catalog))}}));
const saved=[];let failNext=false;
await context.route('**/api/feedbacks*',async r=>{
 if(r.request().method()==='POST'){
  if(failNext){failNext=false;return r.fulfill({status:503,json:{detail:'테스트 저장 오류'}});}
  const body=r.request().postDataJSON();assert.equal(r.request().headers()['x-ax-request'],'1');saved.push(body);
  return r.fulfill({status:201,json:{feedback_id:'00000000-0000-4000-8000-000000000001'}});
 }
 return r.fulfill({json:{feedbacks:saved.map((body,i)=>({...body,feedback_id:String(i),agent_name:body.agent_id,images:[],created_at:'2026-10-16T03:00:00Z'})),total:saved.length,page:1,page_size:10}});
});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/#feedbacks');
await page.getByRole('heading',{name:'Feedbacks',exact:true}).waitFor();assert.equal(await page.locator('.platform-nav .active').innerText(),'Feedbacks');assert.equal(await page.locator('.platform-nav a').count(),4);
for(const width of [1280,1440,1920]){
 await page.setViewportSize({width,height:1100});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await page.evaluate(()=>{const nav=document.querySelector('.platform-nav').getBoundingClientRect(),brand=document.querySelector('.brand').getBoundingClientRect(),account=document.querySelector('.header-inner').lastElementChild.getBoundingClientRect();return nav.left<brand.right||nav.right>account.left;}),false);
}
await page.setViewportSize({width:1440,height:1100});
for(const kind of ['agent_bug','agent_improvement','agent_usage','new_agent','platform_inquiry','other']){
 await page.locator(`input[value="${kind}"]`).check();assert.equal(await page.locator('#feedback-agent').count(),kind.startsWith('agent_')?1:0);
}
await page.locator('input[value="agent_usage"]').check();await page.locator('#feedback-agent').selectOption('wiavoice');await page.locator('#feedback-content').fill('음성 생성 화면에서 확인한 개선 의견입니다.\n재현 방법과 예상 결과를 확인해 주세요.');
await page.locator('input[type=file]').setInputFiles(fixture);await page.locator('.feedback-previews img').waitFor();assert.equal(await page.locator('.feedback-previews img').count(),1);
await page.getByRole('button',{name:/첨부 삭제/}).click();assert.equal(await page.locator('.feedback-previews img').count(),0);
await page.locator('input[type=file]').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await page.getByRole('alert').filter({hasText:'PNG, JPG, WebP'}).waitFor();
await page.locator('input[type=file]').setInputFiles(fixture);await page.locator('.feedback-previews img').waitFor();
await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});await page.screenshot({path:process.env.AX_TEST_SCREENSHOT||'/tmp/ax-feedbacks.png',fullPage:true});
failNext=true;await page.getByRole('button',{name:'피드백 보내기'}).click();await page.getByRole('alert').filter({hasText:'테스트 저장 오류'}).waitFor();assert.ok((await page.locator('#feedback-content').inputValue()).length>0);assert.equal(await page.locator('.feedback-previews img').count(),1);
await page.getByRole('button',{name:'피드백 보내기'}).click();await page.getByRole('heading',{name:'의견을 보내주셔서 감사합니다.'}).waitFor();assert.equal(saved.length,1);assert.equal(saved[0].agent_id,'wiavoice');assert.equal(saved[0].images.length,1);assert.ok(saved[0].images[0].data.length>0);
await page.locator('.feedback-item summary').click();assert.ok(await page.locator('.feedback-detail').isVisible());
await page.getByRole('button',{name:'새 피드백 작성'}).click();await page.locator('input[value="platform_inquiry"]').check();await page.locator('#feedback-content').fill('플랫폼 이용 문의');await page.getByRole('button',{name:'피드백 보내기'}).click();await page.getByRole('heading',{name:'의견을 보내주셔서 감사합니다.'}).waitFor();assert.equal(saved[1].agent_id,null);assert.equal(saved[1].images.length,0);
await context.route('**/api/auth/me',r=>r.fulfill({json:{user_id:'ui-admin',employee_id:'ui-admin',full_name:'관리자 검증',organization:'검증 조직',team_name:'검증 팀',role_name:'매니저',email:'admin@example.invalid',is_admin:true,must_change_password:false}}));await page.reload();await page.getByRole('heading',{name:'접수된 피드백',exact:true}).waitFor();assert.deepEqual(errors,[]);console.log('PASS: four menu layout; conditional Agent selection; image preview/removal/rejection; failed submit retains draft; submit/reset/history; no JS errors. UI fixtures only; no live account/session writes.');
const publicContext=await browser.newContext();const health=await publicContext.request.get(origin+'/api/health');assert.equal(health.status(),200);const privateAPI=await publicContext.request.get(origin+'/api/feedbacks');assert.equal(privateAPI.status(),401);await publicContext.close();
}finally{await browser.close();}
