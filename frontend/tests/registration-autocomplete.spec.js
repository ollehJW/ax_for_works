import { test, expect } from '@playwright/test';

test('registration suggestions follow the employee picker interaction', async ({ page }) => {
  await page.route('**/api/auth/registration-options', route=>route.fulfill({json:{organizations:['가상조직 A','가상조직 B'],teams:['검증팀 A','검증팀 B'],roles:['검증매니저','검증책임매니저']}}));
  await page.goto('/login');
  await page.getByRole('button',{name:'계정 생성',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'계정 생성'});
  for(const label of ['조직','팀','직급'])expect(await dialog.getByRole('combobox',{name:label,exact:true}).getAttribute('placeholder')).toBeNull();
  const organization=dialog.getByRole('combobox',{name:'조직',exact:true});
  await organization.fill('가상');
  await expect(dialog.getByRole('listbox',{name:'조직 추천'}).getByRole('option')).toHaveCount(2);
  await organization.press('ArrowDown');await organization.press('Enter');
  await expect(organization).toHaveValue('가상조직 A');
  await expect(organization).toHaveAttribute('aria-expanded','false');
  const team=dialog.getByRole('combobox',{name:'팀',exact:true});
  await team.fill('검증');
  await dialog.getByRole('option',{name:'검증팀 B',exact:true}).click();
  await expect(team).toHaveValue('검증팀 B');
  const role=dialog.getByRole('combobox',{name:'직급',exact:true});
  await role.fill('검증');
  await expect(dialog.getByRole('listbox',{name:'직급 추천'}).getByRole('option')).toHaveCount(2);
  await page.screenshot({path:'/tmp/ax-registration-suggestions-preview.png'});
  await role.press('Escape');
  await expect(dialog).toBeVisible();await expect(role).toHaveAttribute('aria-expanded','false');
  await role.fill('새로운직급');
  await expect(dialog.getByRole('status')).toContainText('입력한 값을 사용할 수 있습니다');
  await role.press('Tab');await expect(role).toHaveValue('새로운직급');
});

test('registration stays usable when suggestions are unavailable',async ({page})=>{
  await page.route('**/api/auth/registration-options',route=>route.fulfill({status:403,json:{detail:'Unavailable'}}));
  await page.goto('/login');await page.getByRole('button',{name:'계정 생성',exact:true}).click();
  const field=page.getByRole('combobox',{name:'팀',exact:true});
  await field.fill('직접 입력한 팀');await expect(field).toHaveValue('직접 입력한 팀');
  await expect(page.getByRole('dialog',{name:'계정 생성'})).toBeVisible();
});
