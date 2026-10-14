import { z } from 'zod';

export const localizedNameSchema = z.object({ uz: z.string(), ru: z.string() });

export const regionSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  kind: z.enum(['REGION', 'REPUBLIC', 'CITY']),
  name: localizedNameSchema,
});
export type Region = z.infer<typeof regionSchema>;

export const districtSchema = z.object({
  id: z.uuid(),
  regionId: z.uuid(),
  kind: z.enum(['DISTRICT', 'CITY']),
  name: localizedNameSchema,
});
export type District = z.infer<typeof districtSchema>;

/** GET /api/v1/geo/regions */
export const regionsResponseSchema = z.object({ items: z.array(regionSchema) });
/** GET /api/v1/geo/regions/:regionId/districts */
export const districtsResponseSchema = z.object({ items: z.array(districtSchema) });
