import { z } from 'zod';

/** GET /api/v1/health/live — the process is up. */
export const healthLiveSchema = z.object({
  status: z.literal('ok'),
});
export type HealthLive = z.infer<typeof healthLiveSchema>;

/** GET /api/v1/health/ready — the API can serve traffic (database reachable). */
export const healthReadySchema = z.object({
  status: z.enum(['ok', 'error']),
  checks: z.object({
    database: z.enum(['up', 'down']),
  }),
});
export type HealthReady = z.infer<typeof healthReadySchema>;
