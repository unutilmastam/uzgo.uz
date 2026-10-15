import { pushDataSchema } from '@uzgo/contracts';

/** Screen a tapped notification opens (validated payload; anything else is ignored). */
export function pushTarget(
  data: unknown,
):
  | { pathname: '/order/[number]'; params: { number: string } }
  | { pathname: '/seller/[storeId]'; params: { storeId: string } }
  | null {
  const parsed = pushDataSchema.safeParse(data);
  if (!parsed.success) return null;
  return parsed.data.type === 'order'
    ? { pathname: '/order/[number]', params: { number: parsed.data.number } }
    : { pathname: '/seller/[storeId]', params: { storeId: parsed.data.storeId } };
}
