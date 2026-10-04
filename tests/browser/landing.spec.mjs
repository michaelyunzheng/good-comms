import { test, expect } from '@playwright/test';

test('preview tabs support keyboard navigation and update their panel', async ({ page }) => {
  await page.goto('/');
  const speak = page.getByRole('tab', { name: /Speak/ });
  await expect(speak).toHaveAttribute('aria-selected', 'true');
  await speak.press('ArrowRight');
  const review = page.getByRole('tab', { name: /Review/ });
  await expect(review).toBeFocused();
  await expect(review).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('Hear what worked.');
  await review.press('Home');
  await expect(page.getByRole('tab', { name: /Think/ })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toContainText('Find your point.');
});

test('access dialog focuses the password, traps focus, and restores it on Escape', async ({ page }) => {
  await page.goto('/');
  const login = page.getByRole('button', { name: 'Log in' });
  await login.click();
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Close', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  // Empty-password submit is disabled, so the password is the final focusable control.
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(login).toBeFocused();
});

test('mobile landing fits the viewport and keeps the entry point usable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Start practising' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
});
