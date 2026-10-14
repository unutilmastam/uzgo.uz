import type { MetadataRoute } from 'next';
import { getCategoryTreeSafe, getProducts } from '@/lib/catalog-api';
import { getServerEnv } from '@/lib/server-env';

const LOCALES = ['uz', 'ru'] as const;
// Built per request from live catalog data (API responses are cached briefly),
// never frozen at build time when the API may be unavailable.
export const dynamic = 'force-dynamic';

function entry(base: string, path: string, priority: number): MetadataRoute.Sitemap[number] {
  return {
    url: `${base}/uz${path}`,
    priority,
    alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${base}/${l}${path}`])) },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getServerEnv().PUBLIC_SITE_URL;
  const entries = [entry(base, '', 1), entry(base, '/catalog', 0.8)];

  const walk = (nodes: Awaited<ReturnType<typeof getCategoryTreeSafe>>) => {
    for (const node of nodes) {
      entries.push(entry(base, `/c/${node.slug}`, 0.7));
      walk(node.children);
    }
  };
  walk(await getCategoryTreeSafe());

  const stores = new Set<string>();
  for (let page = 1; page <= 50; page++) {
    const result = await getProducts({ sort: 'newest', page: String(page), pageSize: 48 }).catch(
      () => null,
    );
    if (!result) break;
    for (const product of result.items) {
      entries.push(entry(base, `/p/${product.slug}`, 0.6));
      stores.add(product.store.slug);
    }
    if (page * result.pageSize >= result.total) break;
  }
  for (const slug of stores) entries.push(entry(base, `/s/${slug}`, 0.5));
  return entries;
}
