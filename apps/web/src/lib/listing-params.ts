import { PRODUCT_SORTS, type ProductSort } from '@uzgo/contracts';
import type { ListingQuery } from './catalog-api';

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ATTR = /^[a-z0-9-]{1,40}:[a-z0-9-]{1,40}$/;
const INT = /^\d{1,11}$/;

/** Reads listing params from the URL, silently dropping anything invalid. */
export function parseListingParams(params: Params): ListingQuery & { sort?: ProductSort } {
  const attrs = ([] as string[])
    .concat(params.attr ?? [])
    .filter((a) => ATTR.test(a))
    .slice(0, 20);
  const sort = first(params.sort);
  const page = first(params.page);
  const minPrice = first(params.minPrice);
  const maxPrice = first(params.maxPrice);
  const category = first(params.category);
  const q = first(params.q)?.slice(0, 100);
  return {
    ...(q ? { q } : {}),
    ...(category && SLUG.test(category) ? { category } : {}),
    ...(attrs.length > 0 ? { attr: attrs } : {}),
    ...(sort && (PRODUCT_SORTS as readonly string[]).includes(sort)
      ? { sort: sort as ProductSort }
      : {}),
    ...(page && INT.test(page) && Number(page) >= 1 && Number(page) <= 500 ? { page } : {}),
    ...(minPrice && INT.test(minPrice) ? { minPrice } : {}),
    ...(maxPrice && INT.test(maxPrice) ? { maxPrice } : {}),
  };
}

/** Builds "?a=1&attr=x" from a listing query (drops empty values). */
export function listingSearch(query: ListingQuery, overrides: Partial<ListingQuery> = {}): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();
  for (const key of ['q', 'category', 'minPrice', 'maxPrice', 'sort', 'page'] as const) {
    const value = merged[key];
    if (value) params.set(key, value);
  }
  for (const attr of merged.attr ?? []) params.append('attr', attr);
  const search = params.toString();
  return search ? `?${search}` : '';
}
