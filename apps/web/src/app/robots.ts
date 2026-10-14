import type { MetadataRoute } from 'next';
import { getServerEnv } from '@/lib/server-env';

/** Indexing stays off until launch (PUBLIC_INDEXING=true, Phase 7). */
export default function robots(): MetadataRoute.Robots {
  const env = getServerEnv();
  return env.PUBLIC_INDEXING
    ? {
        rules: {
          userAgent: '*',
          allow: '/',
          disallow: ['/api/', '/account', '/cart', '/checkout', '/login'],
        },
        sitemap: `${env.PUBLIC_SITE_URL}/sitemap.xml`,
      }
    : { rules: { userAgent: '*', disallow: '/' } };
}
