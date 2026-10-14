import { z } from 'zod';

// Server-only configuration. Never import this from a client component.
const serverEnvSchema = z.object({
  API_INTERNAL_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:4000'),
  /** Public origin of the site, used for sitemap and canonical URLs. */
  PUBLIC_SITE_URL: z
    .url({ protocol: /^https?$/ })
    .default('http://localhost:3000')
    .transform((url) => url.replace(/\/$/, '')),
  /** Search engines are blocked until launch. */
  PUBLIC_INDEXING: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid web environment: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  }
  return result.data;
}
