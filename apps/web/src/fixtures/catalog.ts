/**
 * FIXTURE DATA — Phase 2 only. Not real products, stores or prices.
 * Replaced by the catalog API in Phase 4. The UI marks every place that shows
 * this data with a "Demo" badge (SPEC §16).
 *
 * Product titles are catalog *content*, so they carry their own per-locale
 * values (as the database will), not UI message keys.
 */
import type { Locale } from '@/i18n/routing';

export type Localized = Record<Locale, string>;

export type CategoryIcon =
  | 'shirt'
  | 'smartphone'
  | 'washing-machine'
  | 'shopping-basket'
  | 'sofa'
  | 'sparkles'
  | 'baby'
  | 'dumbbell';

export type FixtureCategory = { slug: string; icon: CategoryIcon; name: Localized };

export type FixtureProduct = {
  id: string;
  category: string;
  title: Localized;
  store: string;
  /** Integer tiyin as a string, exactly as the API will send it. */
  priceTiyin: string;
  oldPriceTiyin?: string;
};

export const categories: FixtureCategory[] = [
  { slug: 'clothing', icon: 'shirt', name: { uz: 'Kiyim', ru: 'Одежда' } },
  { slug: 'electronics', icon: 'smartphone', name: { uz: 'Elektronika', ru: 'Электроника' } },
  {
    slug: 'appliances',
    icon: 'washing-machine',
    name: { uz: 'Maishiy texnika', ru: 'Бытовая техника' },
  },
  {
    slug: 'groceries',
    icon: 'shopping-basket',
    name: { uz: 'Oziq-ovqat', ru: 'Продукты' },
  },
  { slug: 'home', icon: 'sofa', name: { uz: 'Uy va bogʻ', ru: 'Дом и сад' } },
  { slug: 'beauty', icon: 'sparkles', name: { uz: 'Goʻzallik', ru: 'Красота' } },
  { slug: 'kids', icon: 'baby', name: { uz: 'Bolalar uchun', ru: 'Детям' } },
  { slug: 'sport', icon: 'dumbbell', name: { uz: 'Sport', ru: 'Спорт' } },
];

export const products: FixtureProduct[] = [
  {
    id: 'demo-1',
    category: 'electronics',
    title: { uz: 'Smartfon 6,5", 128 GB, qora', ru: 'Смартфон 6,5", 128 ГБ, чёрный' },
    store: 'Demo Electronics',
    priceTiyin: '279900000',
    oldPriceTiyin: '329900000',
  },
  {
    id: 'demo-2',
    category: 'appliances',
    title: { uz: 'Elektr choynak 1,7 l', ru: 'Электрочайник 1,7 л' },
    store: 'Demo Texnika',
    priceTiyin: '24900000',
  },
  {
    id: 'demo-3',
    category: 'clothing',
    title: { uz: 'Paxta futbolka, erkaklar uchun', ru: 'Футболка мужская, хлопок' },
    store: 'Demo Moda',
    priceTiyin: '8900000',
    oldPriceTiyin: '11900000',
  },
  {
    id: 'demo-4',
    category: 'groceries',
    title: { uz: 'Koʻk choy, 100 g', ru: 'Зелёный чай, 100 г' },
    store: 'Demo Market',
    priceTiyin: '2450000',
  },
  {
    id: 'demo-5',
    category: 'appliances',
    title: { uz: 'Kir yuvish mashinasi, 7 kg', ru: 'Стиральная машина, 7 кг' },
    store: 'Demo Texnika',
    priceTiyin: '389000000',
    oldPriceTiyin: '429000000',
  },
  {
    id: 'demo-6',
    category: 'electronics',
    title: { uz: 'Simsiz quloqchinlar', ru: 'Беспроводные наушники' },
    store: 'Demo Electronics',
    priceTiyin: '34900000',
  },
  {
    id: 'demo-7',
    category: 'kids',
    title: { uz: 'Konstruktor, 250 dona', ru: 'Конструктор, 250 деталей' },
    store: 'Demo Bolajon',
    priceTiyin: '15900000',
    oldPriceTiyin: '19900000',
  },
  {
    id: 'demo-8',
    category: 'home',
    title: { uz: 'Paxta choyshab toʻplami', ru: 'Комплект постельного белья, хлопок' },
    store: 'Demo Uy',
    priceTiyin: '42000000',
  },
  {
    id: 'demo-9',
    category: 'beauty',
    title: { uz: 'Yuz uchun namlovchi krem', ru: 'Увлажняющий крем для лица' },
    store: 'Demo Beauty',
    priceTiyin: '6700000',
  },
  {
    id: 'demo-10',
    category: 'sport',
    title: { uz: 'Yoga gilamchasi, 6 mm', ru: 'Коврик для йоги, 6 мм' },
    store: 'Demo Sport',
    priceTiyin: '12500000',
    oldPriceTiyin: '14900000',
  },
];
