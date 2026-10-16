import { expect, test } from '@playwright/test';
import { loginOnPage } from './helpers';

test.use({ viewport: { width: 1280, height: 900 } });

test('assistant: guests are asked to sign in; a signed-in user gets an answer with links and cards', async ({
  page,
  request,
}) => {
  await page.goto('/uz/search?q=choynak');
  await page.getByRole('link', { name: 'Yordamchidan soʻrash' }).click();
  await expect(page).toHaveURL(/\/uz\/assistant\?q=choynak$/);
  await expect(page.getByText('Yordamchidan foydalanish uchun tizimga kiring.')).toBeVisible();
  await page.getByRole('link', { name: 'Kirish', exact: true }).click();
  await loginOnPage(page, request);
  await expect(page).toHaveURL(/\/uz\/assistant$/);

  const input = page.getByLabel('Savolingiz');
  await input.fill('Menga choynak');
  await input.press('Enter');
  const reply = page.getByTestId('assistant-reply').last();
  await expect(reply).toContainText('choynak');
  // Internal links only, and a card for the product the tool found.
  const link = reply.getByRole('link', { name: /Bahor elektr choynagi/ }).first();
  await expect(link).toHaveAttribute('href', /^\/uz\/p\//);
  await expect(reply.getByTestId('assistant-card').first()).toContainText('soʻm');
  await expect(page.getByText(/Bugun yana \d+ ta savol/)).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/uz\/p\//);
});
