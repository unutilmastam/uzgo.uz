import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile', width: 360, height: 780 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const;

const LOCALES = [
  { locale: 'uz', cart: 'Savat', recommended: 'Siz uchun tavsiyalar', html: 'uz' },
  { locale: 'ru', cart: 'Корзина', recommended: 'Рекомендуем вам', html: 'ru' },
] as const;

for (const viewport of VIEWPORTS) {
  for (const l of LOCALES) {
    test.describe(`${l.locale} @ ${viewport.name} (${String(viewport.width)}px)`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test('homepage renders without horizontal overflow', async ({ page }) => {
        await page.goto(`/${l.locale}`);
        await expect(page.locator('html')).toHaveAttribute('lang', l.html);
        await expect(page.getByRole('heading', { name: l.recommended })).toBeVisible();
        await expect(page.getByRole('img', { name: 'UZGO' }).first()).toBeVisible();
        await expect(page.getByRole('article').first()).toBeVisible();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);

        const bottomNav = page.getByTestId('bottom-nav');
        if (viewport.width < 768) await expect(bottomNav).toBeVisible();
        else await expect(bottomNav).toBeHidden();

        await page.screenshot({
          path: `test-results/screenshots/home-${l.locale}-${String(viewport.width)}.png`,
          fullPage: true,
        });
      });
    });
  }
}

test('root redirects to the default locale', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/uz$/);
});

test('language switch keeps the current page and query', async ({ page }) => {
  await page.goto('/uz/search?category=electronics');
  await page
    .getByRole('navigation', { name: 'Tilni tanlash' })
    .getByRole('link', { name: 'Русский' })
    .click();
  await expect(page).toHaveURL(/\/ru\/search\?category=electronics$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Электроника');
});

test('search form submits to the search page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/uz');
  const search = page.getByRole('search').getByRole('searchbox');
  await search.fill('choynak');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/uz\/search\?q=choynak/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('choynak');
  await expect(page.getByRole('status')).toContainText('Hozircha mahsulotlar yoʻq');
});

test('catalog sheet opens, lists categories and closes', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/ru');
  await page.getByRole('button', { name: 'Каталог' }).click();
  const dialog = page.getByRole('dialog', { name: 'Все категории' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link')).toHaveCount(8);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('demo add-to-cart shows an honest toast', async ({ page }) => {
  await page.goto('/uz');
  await page
    .getByRole('button', { name: /savatga qoʻshish/ })
    .first()
    .click();
  await expect(page.getByText('Savat tez orada ishga tushadi.')).toBeVisible();
});

test('theme toggle switches to dark mode and persists', async ({ page }) => {
  await page.goto('/uz');
  await page.getByRole('button', { name: 'Qorongʻi rejimni yoqish' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('unknown pages show a localised 404', async ({ page }) => {
  const response = await page.goto('/ru/net-takoy-stranicy');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('Страница не найдена')).toBeVisible();
});

test('only the live service is interactive; coming soon services are not', async ({ page }) => {
  await page.goto('/uz');
  const services = page.locator('section[aria-labelledby="services"]');
  await expect(services.getByText('Tez kunda')).toHaveCount(3);
  await expect(services.getByRole('link')).toHaveCount(1);
  await expect(services.getByRole('link')).toContainText('Market');
  await expect(services.getByRole('button')).toHaveCount(0);
});

for (const theme of ['light', 'dark'] as const) {
  for (const l of LOCALES) {
    test(`homepage has no accessibility violations (${l.locale}, ${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`/${l.locale}`);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)).toEqual([]);
    });
  }
}
