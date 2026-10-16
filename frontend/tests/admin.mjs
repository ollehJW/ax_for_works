// Tests deployed assets with browser-only identities and mutable API fixtures.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const origin=process.env.AX_TEST_URL||'https://axforwork.wia.co.kr';
const agents=JSON.parse(fs.readFileSync(process.env.AX_TEST_CATALOG||'../config/agents.json')).map(a=>({...a,enabled:true,admin_url:`/api/admin/agents/${a.id}/launch`,launch_url:`/api/agents/${a.id}/launch`}));
const fid='00000000-0000-4000-8000-000000000001';
const feedback={feedback_id:fid,feedback_type:'agent_bug',agent_id:'wianews',agent_name:'WiaNews',status:'received',content:'뉴스레터 생성 중 결과 확인 화면에서 오류가 발생합니다.\n다시 실행해도 같은 화면이 표시됩니다.',images:[],author_name:'화면 검증',author_employee_id:'fixture-user',created_at:'2026-10-16T00:00:00Z',updated_at:'2026-10-16T00:00:00Z',revision:0,reply:'',admin_note:''};
let admin=true;
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
try{
const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
await context.route('**/api/auth/me',r=>r.fulfill({json:{user_id:'admin-fixture',employee_id:'admin-fixture',full_name:'관리자 검증',organization:'검증 조직',team_name:'검증 팀',role_name:'매니저',email:'admin@example.invalid',is_admin:admin,must_change_password:false}}));
await context.route('**/api/agents',r=>r.fulfill({json:{agents:agents.filter(a=>a.enabled)}}));
await context.route('**/api/admin/agents',r=>r.fulfill({json:{agents}}));
await context.route('**/api/admin/agents/*',async r=>{
 const a=agents.find(a=>r.request().url().endsWith('/'+a.id));assert.ok(a);const body=r.request().postDataJSON();assert.equal(r.request().headers()['x-ax-request'],'1');a.enabled=body.enabled;return r.fulfill({json:{agent_id:a.id,enabled:a.enabled,updated_at:new Date().toISOString()}});
});
await context.route('**/api/feedbacks?*',r=>r.fulfill({json:{feedbacks:[],total:0,page:1,page_size:10}}));
await context.route('**/api/admin/feedbacks?*',r=>{
 const params=new URL(r.request().url()).searchParams;let rows=[feedback];if(params.get('status'))rows=rows.filter(f=>f.status===params.get('status'));if(params.get('q'))rows=rows.filter(f=>f.content.includes(params.get('q')));
 return r.fulfill({json:{feedbacks:rows.map(f=>({...f,preview:f.content,image_count:0})),total:rows.length,counts:{[feedback.status]:1},agents:[{agent_id:'wianews',agent_name:'WiaNews'}],page:1,page_size:10}});
});
await context.route('**/api/admin/feedbacks/'+fid,r=>{
 if(r.request().method()==='PATCH'){const body=r.request().postDataJSON();assert.equal(body.revision,feedback.revision);Object.assign(feedback,body,{revision:feedback.revision+1,updated_at:new Date().toISOString()});}
 return r.fulfill({json:feedback});
});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.getByRole('heading',{name:'Agent 관리',exact:true}).waitFor();await page.getByRole('switch').last().waitFor();assert.equal(await page.getByRole('switch').count(),5);assert.equal(await page.getByRole('link',{name:'사용자 화면',exact:true}).count(),0);assert.equal(await page.locator('.admin-panel-note').count(),0);
for(const width of [1280,1440,1920]){await page.setViewportSize({width,height:1100});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
await page.getByRole('switch',{name:'WiaMeet 활성화',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[role=switch]').getAttribute('aria-checked')==='false');
assert.equal(await page.locator('.admin-success').count(),0);assert.equal(await page.getByRole('link',{name:'WiaMeet 운영 화면 열기'}).getAttribute('href'),'/api/admin/agents/wiameet/launch');
await page.evaluate(()=>{location.hash='agents';});await page.locator('.card').nth(3).waitFor();
assert.equal(await page.locator('.card').count(),4);assert.deepEqual(await page.locator('.tab-number').allTextContents(),['01','02','03','04']);assert.equal(await page.locator('.card h3').first().innerText(),'WiaReport');
await page.getByRole('link',{name:'Guides',exact:true}).click();await page.locator('.ai-tabs button').nth(3).waitFor();assert.equal(await page.locator('.ai-tabs button').count(),4);const ys=await page.locator('.ai-tabs button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().y));assert.ok(ys.every(y=>y===ys[0]));assert.equal(await page.locator('#intro-tab-wiameet').count(),0);
await page.getByRole('link',{name:'Feedbacks',exact:true}).click();await page.locator('input[value=agent_bug]').check();assert.equal(await page.locator('#feedback-agent option[value=wiameet]').count(),0);
await page.getByRole('link',{name:'관리 화면으로 돌아가기 →'}).click();await page.getByRole('switch').last().waitFor();
for(const a of agents.filter(a=>a.enabled)){await page.getByRole('switch',{name:a.name+' 활성화',exact:true}).click();await page.getByRole('switch',{name:a.name+' 활성화',exact:true,checked:false}).waitFor();}
await page.evaluate(()=>{location.hash='agents';});await page.getByRole('heading',{name:'준비 중인 AI 파트너'}).waitFor();assert.equal(await page.locator('.card').count(),0);
await page.getByRole('link',{name:'Guides',exact:true}).click();await page.getByText('서비스 소개를 준비하고 있습니다.',{exact:true}).waitFor();
for(const a of agents)a.enabled=true;await page.getByRole('link',{name:'관리 화면으로 돌아가기 →'}).click();await page.getByRole('switch').last().waitFor();await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:'/tmp/ax-admin-agents.png',fullPage:true});
await page.getByRole('link',{name:'피드백 관리',exact:true}).click();await page.locator('.admin-feedback-item').click();await page.getByLabel(/관리자 메모/).waitFor();
await page.locator('.admin-feedback-editor select').selectOption('resolved');await page.getByLabel(/작성자에게 답변/).fill('확인 후 수정했습니다. 다시 이용해 주세요.');await page.getByLabel(/관리자 메모/).fill('내부 검토 기록');await page.getByRole('button',{name:'처리 내용 저장'}).click();await page.getByRole('status').filter({hasText:'처리 내용을 저장했습니다.'}).waitFor();assert.equal(feedback.status,'resolved');assert.equal(feedback.revision,1);
await page.locator('.admin-status-filters').getByRole('button',{name:/^완료/}).click();await page.locator('.admin-feedback-item').waitFor();await page.screenshot({path:'/tmp/ax-admin-feedback.png',fullPage:true});
await page.locator('.admin-status-filters').getByRole('button',{name:/^접수/}).click();await page.getByText('조건에 맞는 피드백이 없습니다.',{exact:true}).waitFor();
admin=false;await page.reload();await page.getByRole('alert').filter({hasText:'관리자만 이용할 수 있는 화면입니다.'}).waitFor();assert.deepEqual(errors,[]);
console.log('PASS: admin navigation; visibility toggles; contiguous 01-04 numbering after first disabled; Guides 4 columns; feedback selector filtering; zero Agents; service links; feedback status/reply/note save; filters; non-admin denial. Browser fixtures only.');
}finally{await browser.close();}
