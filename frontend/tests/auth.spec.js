import { test, expect } from '@playwright/test';

test('login page matches the reference layout and handles errors, login and logout', async ({ page }) => {
  test.skip(!process.env.AX_E2E_EMPLOYEE, 'Requires a dedicated test account');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
  await expect(page.locator('.login-intro')).toContainText('AX for Works');
  await expect(page.locator('.card')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '/tmp/ax-platform-login.png', fullPage: true });
  await page.getByLabel('사번', { exact: true }).fill(process.env.AX_E2E_EMPLOYEE);
  await page.getByLabel('비밀번호', { exact: true }).fill('incorrect');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('사번 또는 비밀번호를 확인해 주세요.');
  await page.getByLabel('비밀번호', { exact: true }).fill(process.env.AX_E2E_PASSWORD);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.locator('.card')).toHaveCount(4);
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page.locator('.card')).toHaveCount(4);
  await page.getByRole('button', { name: '내 계정', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(process.env.AX_E2E_EMPLOYEE);
  await page.getByRole('button', { name: '확인', exact: true }).click();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
});

test('initial password must be changed before entering the portal', async ({ page }) => {
  test.skip(!process.env.AX_E2E_INITIAL_EMPLOYEE, 'Requires an initial-password test account');
  await page.goto('/login');
  await page.getByLabel('사번', { exact: true }).fill(process.env.AX_E2E_INITIAL_EMPLOYEE);
  await page.getByLabel('비밀번호', { exact: true }).fill(process.env.AX_E2E_PASSWORD);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '비밀번호를 변경해 주세요' })).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(0);
  await page.getByLabel('현재 비밀번호', { exact: true }).fill(process.env.AX_E2E_PASSWORD);
  await page.getByLabel('새 비밀번호', { exact: false }).first().fill('ChangedBrowserPassword456!');
  await page.getByLabel('새 비밀번호 확인', { exact: true }).fill('ChangedBrowserPassword456!');
  await page.getByRole('button', { name: '비밀번호 변경 후 시작' }).click();
  await expect(page.locator('.card')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('.card')).toHaveCount(4);
});
