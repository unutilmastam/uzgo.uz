import { z } from 'zod';
import { localizedNameSchema } from './geo.js';

export type CategoryNode = {
  id: string;
  slug: string;
  icon: string | null;
  name: { uz: string; ru: string };
  children: CategoryNode[];
};

export const categoryNodeSchema: z.ZodType<CategoryNode> = z.lazy(() =>
  z.object({
    id: z.uuid(),
    slug: z.string(),
    icon: z.string().nullable(),
    name: localizedNameSchema,
    children: z.array(categoryNodeSchema),
  }),
);

/** GET /api/v1/catalog/categories — active category tree. */
export const categoryTreeResponseSchema = z.object({ items: z.array(categoryNodeSchema) });

export const filterSchema = z.object({
  code: z.string(),
  name: localizedNameSchema,
  values: z.array(z.object({ code: z.string(), name: localizedNameSchema })),
});
export type CatalogFilter = z.infer<typeof filterSchema>;

const categoryRefSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  icon: z.string().nullable(),
  name: localizedNameSchema,
});
export type CategoryRef = z.infer<typeof categoryRefSchema>;

/** GET /api/v1/catalog/categories/:slug */
export const categoryDetailResponseSchema = z.object({
  category: categoryRefSchema,
  /** Root → parent (excludes the category itself). */
  breadcrumbs: z.array(categoryRefSchema),
  children: z.array(categoryRefSchema),
  /** Filter attributes, inherited from ancestors. */
  filters: z.array(filterSchema),
});
export type CategoryDetail = z.infer<typeof categoryDetailResponseSchema>;
