import { test, expect } from '@playwright/test';

test('loads app and toggles settings panel', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Studio Video Editor' })).toBeVisible();

  await page.getByRole('button', { name: 'Toggle Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Square' }).click();
  await page.getByRole('button', { name: 'High' }).first().click();

  await expect(page.getByRole('button', { name: 'Process Videos' })).toBeDisabled();
});
