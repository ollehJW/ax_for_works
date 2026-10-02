import { test } from '@playwright/test';
test('shared platform login, return URL and logout across both services',async ({browser,baseURL})=>{
test.skip(!process.env.AX_TEST_SSO || !process.env.AX_E2E_EMPLOYEE,'Requires running services and a dedicated account');
const base=baseURL;

const context=await browser.newContext({ignoreHTTPSErrors:base.includes('127.0.0.1'),viewport:{width:1440,height:1000}});
const page=await context.newPage();page.on('dialog',dialog=>dialog.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function login(){await page.getByLabel('사번',{exact:true}).fill(process.env.AX_E2E_EMPLOYEE);await page.getByLabel('비밀번호',{exact:true}).fill(process.env.AX_E2E_PASSWORD);await page.getByRole('button',{name:'로그인',exact:true}).click();}
async function me(service,status){const r=await page.request.get(base+'/'+service+'/api/auth/me');if(r.status()!==status)throw Error(service+' auth '+r.status());}
try {
 await page.goto(base+'/');await page.waitForURL('**/login');console.log('Portal canonical /login: PASS');
 await page.goto(base+'/wianews/agent?from=sso');await page.waitForURL('**/login?next=*');await login();await page.waitForURL('**/wianews/agent?from=sso');await me('wianews',200);
 await page.getByRole('button',{name:'로그아웃',exact:true}).waitFor();console.log('WiaNews login and return path: PASS');
 await page.goto(base+'/wiacoding/agent');await page.getByRole('button',{name:'로그아웃',exact:true}).waitFor();await me('wiacoding',200);
 if(page.url().includes('/login'))throw Error('Second login appeared');console.log('WiaCoding without another login: PASS');
 await page.getByRole('button',{name:'로그아웃',exact:true}).click();await page.waitForURL('**/login?next=*');await me('wianews',401);await me('wiacoding',401);console.log('Cross-service logout revokes shared session: PASS');
 await login();await page.waitForURL('**/wiacoding/agent');await page.getByRole('button',{name:'로그아웃',exact:true}).waitFor();console.log('WiaCoding login return path: PASS');
 await page.goto(base+'/login?next=https%3A%2F%2Fevil.example');await page.waitForURL(base+'/');console.log('Open redirect blocked: PASS');
 const cookies=await context.cookies();const session=cookies.find(c=>c.name==='ax_platform_session');if(!session?.secure||!session?.httpOnly||session.path!=='/')throw Error('Shared cookie scope');
 if(errors.length)throw Error(errors.join(';'));console.log('Browser SSO: PASS');
} finally {await context.close();}

});
