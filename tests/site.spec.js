import { expect, test } from '@playwright/test';

test('home page has a title and main heading', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Your Site Name/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('navigates to the about page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page).toHaveURL(/about/);
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
});

test('theme toggle switches and remembers dark mode', async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
