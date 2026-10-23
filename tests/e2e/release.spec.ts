import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('site identity is consistent on desktop and mobile', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const expectedName = process.env.SITE_NAME || 'DND Battle Room';
    await expect(page).toHaveTitle(expectedName);
    await expect(page.getByRole('heading', { name: expectedName, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Join by Code/ })).toBeVisible();
    mkdirSync('test-results/screenshots', { recursive: true });
    await page.screenshot({ path: `test-results/screenshots/identity-${viewport.width}.png`, fullPage: true });
    for (const path of ['/dm/login', '/join']) {
      await page.goto(path);
      await expect(page).toHaveTitle(expectedName);
    }
  }
});


test('a separate player browser receives live DM token and dice updates', async ({ page, browser }) => {
  const username = `sync-${Date.now().toString(36)}`;
  const signup = await page.request.post('/api/dm/signup', {
    data: { username, password: 'testpass', name: 'Sync DM', color: '#b7394b' }
  });
  expect(signup.ok()).toBeTruthy();
  await page.goto('/dm/dashboard');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z0-9]+$/);
  const code = page.url().split('/').pop();
  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage();
    const origin = new URL(page.url()).origin;
    await guest.goto(`${origin}/join/${code}`);
    await guest.getByLabel('Player name').fill('Sync Player');
    await guest.getByRole('button', { name: 'Enter lobby' }).click();
    await expect(guest).toHaveURL(/\/room\/[A-Z0-9]+$/);
    await expect(page.locator('.sync-badge.online')).toHaveText('Realtime sync');
    await expect(guest.locator('.sync-badge.online')).toHaveText('Realtime sync');
    await page.getByRole('button', { name: 'Add token' }).click();
    await expect(guest.locator('.token')).toHaveCount(1);
    await page.getByRole('button', { name: 'd20', exact: true }).click();
    await expect(guest.locator('.roll-log article').first()).toContainText('d20');
  } finally { await guestContext.close(); }
});
