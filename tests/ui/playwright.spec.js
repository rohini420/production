import { test, expect } from '@playwright/test';
const base = process.env.STAGING_URL || 'http://localhost';
test('homepage shows Employee Directory', async ({ page }) => {
  await page.goto(base + '/');
  await expect(page.locator('h1')).toHaveText(/Employee Directory/i);
});
