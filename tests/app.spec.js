import { expect, test } from '@playwright/test';

async function finishOne(page) {
  await page.locator('[data-start]').first().click();
  await page.locator('[data-action="finish-now"]').click();
}

test('starts at level 1 with three quests', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.workout')).toHaveCount(3);
  await expect(page.locator('.eyebrow').first()).toContainText('Level 1');
});

test('finishing a workout earns XP', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.xpnums')).toHaveText('0 / 120 XP');
  await finishOne(page);
  await expect(page.locator('.workout.done')).toHaveCount(1);
  await expect(page.locator('.xpnums')).not.toHaveText('0 / 120 XP');
});

test('finishing all three starts a streak', async ({ page }) => {
  await page.goto('/');
  for (let i = 0; i < 3; i++) await finishOne(page);
  await expect(page.locator('#header-chips')).toContainText('🔥 1');
});

test('missing a day adds a penalty workout', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-view="settings"]').click();
  await page.locator('summary').click();
  await page.locator('[data-action="skip-day"]').click();
  await expect(page.locator('#notice')).toContainText('missed');
  await page.locator('#notice [data-close]').click();
  await page.locator('[data-view="today"]').click();
  await expect(page.locator('.workout')).toHaveCount(4);
  await expect(page.locator('.workout.penalty')).toHaveCount(1);
});

test('gym mode is remembered', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-view="settings"]').click();
  await page.locator('label.mode-opt', { hasText: 'Gym' }).click();
  await page.reload();
  await page.locator('[data-view="settings"]').click();
  await expect(page.locator('input[value="gym"]')).toBeChecked();
});

test('ranks page shows all 120 badges', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-view="ranks"]').click();
  await expect(page.locator('.rank')).toHaveCount(120);
});
