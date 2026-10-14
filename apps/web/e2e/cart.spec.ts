import { expect, test } from '@playwright/test';

test.describe('guest cart', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('add from the product page, change quantity, remove', async ({ page }) => {
    await page.goto('/uz/p/kok-choy-100g');
    await page.getByRole('button', { name: 'Koʻpaytirish' }).click();
    await page.getByRole('button', { name: 'Savatga' }).click();
    await expect(page.getByText('Savatga qoʻshildi')).toBeVisible();
    await expect(page.getByTestId('cart-count').first()).toContainText('2');

    await page.goto('/uz/cart');
    await expect(page.getByRole('link', { name: 'Koʻk choy, 100 g' })).toBeVisible();
    await expect(page.getByTestId('cart-total')).toHaveText('49 000 soʻm');

    await page
      .getByRole('group', { name: 'Koʻk choy, 100 g soni' })
      .getByRole('button', { name: 'Koʻpaytirish' })
      .click();
    await expect(page.getByTestId('cart-total')).toHaveText('73 500 soʻm');

    await expect(page.getByRole('link', { name: 'Rasmiylashtirish uchun kiring' })).toHaveAttribute(
      'href',
      '/uz/login?next=%2Fcheckout',
    );

    await page.getByRole('button', { name: 'Koʻk choy, 100 g — savatdan oʻchirish' }).click();
    await expect(page.getByText('Savatingiz boʻsh')).toBeVisible();
  });

  test('items from several stores are grouped per seller', async ({ page }) => {
    for (const slug of ['kok-choy-100g', 'lagan-40sm']) {
      await page.goto(`/ru/p/${slug}`);
      await page.getByRole('button', { name: 'В корзину' }).click();
      await expect(page.getByText('Добавлено в корзину')).toBeVisible();
    }
    await page.goto('/ru/cart');
    await expect(page.getByRole('link', { name: 'Из магазина Демо Маркет' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Из магазина Демо Дом' })).toBeVisible();
  });
});
