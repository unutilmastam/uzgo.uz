import { z } from 'zod';

// Server-only configuration. Never import this from a client component.
const serverEnvSchema = z.object({
  API_INTERNAL_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:4000'),
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
