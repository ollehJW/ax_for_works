import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!process.env.AX_E2E_PORTAL_EMPLOYEE, 'Requires a dedicated portal test account');
  const response = await page.request.post('/api/auth/login', {
    data: { employee_id: process.env.AX_E2E_PORTAL_EMPLOYEE, password: process.env.AX_E2E_PASSWORD },
    headers: { 'X-AX-Request': '1', Origin: new URL(baseURL).origin },
  });
  expect(response.status()).toBe(200);
});

test('desktop catalog, carousel controls, dialogs and destinations', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page).toHaveTitle('AX for Works');
  await expect(page.locator('.card')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: '회의에만 집중하세요. 기록은 AI가 할게요.' })).toBeVisible();
  await page.getByRole('tab', { name: /WiaNews/ }).click();
  await expect(page.getByRole('tabpanel')).toContainText('기술의 흐름을 읽는');
  await page.getByRole('tab', { name: /WiaNews/ }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: /WiaCoding/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '다음 슬라이드' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('회의에만 집중하세요.');
  await page.getByRole('button', { name: '이용 가이드' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').locator('a')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '이용 가이드' })).toBeFocused();
  await page.getByRole('button', { name: '공지사항' }).click();
  await expect(page.getByRole('dialog')).toContainText('등록된 공지사항이 없습니다.');
  await page.getByRole('button', { name: '확인', exact: true }).click();
  for (const id of ['wiameet', 'wiareport', 'wianews', 'wiacoding']) {
    const response = await page.request.get(`/api/agents/${id}/launch`, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe({ wiameet: 'https://dev-axforwork.wia.co.kr:9702/', wiareport: 'https://dev-axforwork.wia.co.kr:9602/', wianews: 'https://dev-axforwork.wia.co.kr/wianews/', wiacoding: 'https://dev-axforwork.wia.co.kr/wiacoding/' }[id]);
  }
  await page.screenshot({ path: '/tmp/ax-for-works-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('small screens retain the desktop layout', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.locator('.card')).toHaveCount(4);
  expect(await page.evaluate(() => document.body.getBoundingClientRect().width)).toBe(1280);
  const boxes = await page.locator('.card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().top));
  expect(new Set(boxes).size).toBe(1);
});

test('API errors can be retried and empty configuration is supported', async ({ page }) => {
  let failure = true;
  await page.route('**/api/agents', route => failure ? route.fulfill({ status: 503 }) : route.fulfill({ json: { agents: [] } }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Agent 목록을 불러오지 못했습니다.');
  failure = false;
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByText('현재 이용 가능한 Agent가 없습니다.')).toBeVisible();
});

test('auto rotation can be paused', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('.card')).toHaveCount(4);
  await page.clock.fastForward(6100);
  await expect(page.getByRole('tab', { name: /WiaReport/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '자동 재생 일시 정지' }).click();
  await page.locator('h1').click();
  await page.clock.fastForward(12000);
  await expect(page.getByRole('tab', { name: /WiaReport/ })).toHaveAttribute('aria-selected', 'true');
});
