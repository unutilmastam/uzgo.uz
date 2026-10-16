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

test('search finds products across scripts and apostrophe variants', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/uz');
  const search = page.getByRole('search').getByRole('searchbox');
  await search.fill('чойнак');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/uz\/search\?q=/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('чойнак');
  await expect(page.getByRole('link', { name: /Bahor elektr choynagi/ })).toBeVisible();

  await page.goto(`/ru/search?q=${encodeURIComponent("ko'k choy")}`);
  await expect(page.getByRole('link', { name: /Зелёный чай/ })).toBeVisible();
});

test('catalog sheet opens, lists categories and closes', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/ru');
  await page.getByRole('button', { name: 'Каталог' }).click();
  const dialog = page.getByRole('dialog', { name: 'Все категории' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Электроника' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Смартфоны' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('category page filters by attribute and sorts by price', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/uz/c/smartphones');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Smartfonlar');
  const filters = page.locator('aside');
  await filters.getByLabel('256 GB').check();
  await filters.getByRole('button', { name: 'Qoʻllash' }).click();
  await expect(page).toHaveURL(/attr=memory%3A256gb/);
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Nova X5/ })).toBeVisible();

  await page.goto('/uz/c/electronics?sort=price_asc');
  const prices = await page.getByRole('article').locator('.text-lg').allTextContents();
  const numbers = prices.map((p) => Number(p.replace(/\D/g, '')));
  expect(numbers.length).toBeGreaterThan(1);
  expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
});

test('product page switches variants and shows the right price', async ({ page }) => {
  await page.goto('/uz/p/nova-x5-smartfon');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nova X5 smartfon, 6,5"');
  await expect(page.getByText('2 799 000 soʻm').first()).toBeVisible();
  await page.getByRole('button', { name: '256 GB' }).click();
  await expect(page.getByRole('button', { name: '256 GB' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('3 199 000 soʻm').first()).toBeVisible();
  await expect(page.getByTestId('availability')).toHaveText('5 ta qoldi');
  await page.getByRole('link', { name: /Demo Elektronika/ }).click();
  await expect(page).toHaveURL(/\/uz\/s\/demo-elektronika$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Demo Elektronika');
});

test('product pages carry SEO metadata and structured data', async ({ page, request }) => {
  await page.goto('/ru/p/bahor-elektr-choynak');
  await expect(page).toHaveTitle(/Электрочайник Bahor/);
  const ld = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
  ) as {
    offers: { priceCurrency: string; price: string };
  };
  expect(ld.offers).toMatchObject({ priceCurrency: 'UZS', price: '249000' });
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/uz/p/nova-x5-smartfon');
  expect(sitemap).not.toContain('moderatsiyadagi-smartfon');
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /');
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

test('only live services are interactive; coming soon services are not', async ({ page }) => {
  await page.goto('/uz');
  const services = page.locator('section[aria-labelledby="services"]');
  await expect(services.getByText('Tez kunda')).toHaveCount(1);
  await expect(services.getByRole('link')).toHaveCount(3);
  await expect(services.getByRole('link').first()).toContainText('Market');
  await expect(services.getByRole('link').last()).toContainText('Food');
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

test('pages run under the nonce Content-Security-Policy without violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  const res = await page.goto('/uz');
  const csp = res?.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  await expect(page.getByRole('article').first()).toBeVisible();
  // Hydration and client-side navigation work under the policy.
  await page.getByRole('article').first().getByRole('link').first().click();
  await expect(page.getByRole('button', { name: 'Savatga' })).toBeVisible();
  expect(violations).toEqual([]);
});

test('legal pages show the offer and privacy policy (draft) in both languages', async ({
  page,
}) => {
  await page.goto('/uz/info/terms');
  await expect(
    page.getByRole('heading', { name: 'Foydalanish shartlari (ommaviy oferta)' }),
  ).toBeVisible();
  await expect(page.getByTestId('legal-draft')).toBeVisible();
  await expect(page.getByRole('heading', { name: '5. Toʻlov' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations).toEqual([]);

  await page.goto('/ru/info/privacy');
  await expect(page.getByRole('heading', { name: 'Политика конфиденциальности' })).toBeVisible();
  await expect(page.getByText('хранятся на серверах на территории Узбекистана')).toBeVisible();
});
