import { test, expect } from '@playwright/test';

test.skip(!process.env.AX_TEST_AGENTS, 'Requires the running PostgreSQL Agent services');
for (const [id, name, start] of [
  ['wianews', 'WiaNews', '나의 뉴스레터 시작하기'],
  ['wiacoding', 'WiaCoding', '나의 개발 프롬프트 만들기'],
]) {
  test(`${name}: direct access returns through platform login`, async ({ page }) => {
    await page.goto(`/${id}/agent?source=direct`);
    await expect(page).toHaveURL(/\/login\?next=/);
    expect(new URL(page.url()).searchParams.get('next')).toBe(`/${id}/agent?source=direct`);
    await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
    expect((await page.request.get(`/${id}/api/auth/me`)).status()).toBe(401);
  });
  test(`${name}: shared login, assets, video and canonical service URL`, async ({ page }) => {
    test.skip(!process.env.AX_E2E_PORTAL_EMPLOYEE, 'Requires a dedicated non-admin account');
    const login=await page.request.post('/api/auth/login', {
      headers: {'X-AX-Request':'1'},
      data: {employee_id:process.env.AX_E2E_PORTAL_EMPLOYEE,password:process.env.AX_E2E_PASSWORD},
    });
    expect(login.status()).toBe(200);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`/${id}/`);
    await expect(page.locator('h1')).toContainText(name);
    await expect(page.locator('video source')).toHaveAttribute('src',new RegExp(`^/${id}/media/`));
    await expect.poll(()=>page.locator('video').evaluate(video=>video.readyState),{timeout:20000}).toBeGreaterThanOrEqual(1);
    await page.getByRole('link',{name:start,exact:true}).first().click();
    await expect(page).toHaveURL(new RegExp(`/${id}/agent$`));
    await expect(page.getByRole('button',{name:'로그아웃',exact:true})).toBeVisible();
    await page.reload();
    expect((await page.request.get(`/${id}/api/auth/me`)).status()).toBe(200);
    await page.goto(`/${id}/?source=bookmark#app`);
    await expect(page).toHaveURL(new RegExp(`/${id}/agent\\?source=bookmark$`));
    expect(errors).toEqual([]);
    await page.request.post('/api/auth/logout',{headers:{'X-AX-Request':'1'}});
  });
}
