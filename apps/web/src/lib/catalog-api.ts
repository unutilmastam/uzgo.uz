import {
  type CategoryDetail,
  categoryDetailResponseSchema,
  type CategoryNode,
  categoryTreeResponseSchema,
  type ProductDetail,
  productDetailResponseSchema,
  type ProductList,
  type ProductReviews,
  productListResponseSchema,
  productReviewsResponseSchema,
  type SearchAll,
  searchAllSchema,
  type StoreDetail,
  storeDetailResponseSchema,
} from '@uzgo/contracts';
import { internalHeaders } from './internal-headers';
import { getServerEnv } from './server-env';

/** Public catalog data: no cookies, cached in the Next.js data cache. */
async function publicGet(path: string, revalidate: number): Promise<Response> {
  return fetch(`${getServerEnv().API_INTERNAL_URL}/api/v1${path}`, {
    next: { revalidate },
    // Cached and shared by all visitors, so no visitor IP (and no dynamic headers()).
    headers: await internalHeaders(false),
    signal: AbortSignal.timeout(5000),
  });
}

export class NotFoundError extends Error {}

async function json(res: Response, path: string): Promise<unknown> {
  if (res.status === 404) throw new NotFoundError(path);
  if (!res.ok) throw new Error(`API ${path} failed with ${String(res.status)}`);
  return res.json();
}

export async function getCategoryTree(): Promise<CategoryNode[]> {
  const path = '/catalog/categories';
  return categoryTreeResponseSchema.parse(await json(await publicGet(path, 300), path)).items;
}

/** Category tree, or an empty list when the API is unavailable (layout must still render). */
export async function getCategoryTreeSafe(): Promise<CategoryNode[]> {
  try {
    return await getCategoryTree();
  } catch {
    return [];
  }
}

export async function getCategory(slug: string): Promise<CategoryDetail> {
  const path = `/catalog/categories/${encodeURIComponent(slug)}`;
  return categoryDetailResponseSchema.parse(await json(await publicGet(path, 300), path));
}

export async function getProduct(slug: string): Promise<ProductDetail> {
  const path = `/catalog/products/${encodeURIComponent(slug)}`;
  return productDetailResponseSchema.parse(await json(await publicGet(path, 60), path)).product;
}

export async function getStore(slug: string): Promise<StoreDetail> {
  const path = `/catalog/stores/${encodeURIComponent(slug)}`;
  return storeDetailResponseSchema.parse(await json(await publicGet(path, 300), path)).store;
}

export type ListingQuery = {
  q?: string | undefined;
  category?: string | undefined;
  store?: string | undefined;
  minPrice?: string | undefined;
  maxPrice?: string | undefined;
  attr?: string[] | undefined;
  sort?: string | undefined;
  page?: string | undefined;
  pageSize?: number | undefined;
};

export async function getProducts(query: ListingQuery): Promise<ProductList> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query) as [
    string,
    string | number | string[] | undefined,
  ][]) {
    if (value === undefined || value === '') continue;
    if (Array.isArray(value)) for (const v of value) params.append(key, v);
    else params.set(key, String(value));
  }
  const path = `/catalog/products?${params.toString()}`;
  return productListResponseSchema.parse(await json(await publicGet(path, 30), path));
}

/** First page of published reviews (cached like the product itself). */
export async function getProductReviews(slug: string): Promise<ProductReviews> {
  const path = `/catalog/products/${encodeURIComponent(slug)}/reviews`;
  return productReviewsResponseSchema.parse(await json(await publicGet(path, 60), path));
}

/** Products, restaurants and dishes for one query (ADR 0026); null when the API is unavailable. */
export async function getSearchAll(q: string): Promise<SearchAll | null> {
  const path = `/search/all?q=${encodeURIComponent(q.slice(0, 100))}`;
  try {
    return searchAllSchema.parse(await json(await publicGet(path, 30), path));
  } catch {
    return null;
  }
}
