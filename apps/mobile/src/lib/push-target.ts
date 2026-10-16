import { pushDataSchema } from '@uzgo/contracts';

/** Screen a tapped notification opens (validated payload; anything else is ignored). */
export function pushTarget(
  data: unknown,
):
  | { pathname: '/order/[number]'; params: { number: string } }
  | { pathname: '/seller/[storeId]'; params: { storeId: string } }
  | { pathname: '/courier'; params: Record<string, never> }
  | { pathname: '/go/[number]'; params: { number: string } }
  | { pathname: '/driver'; params: Record<string, never> }
  | null {
  const parsed = pushDataSchema.safeParse(data);
  if (!parsed.success) return null;
  switch (parsed.data.type) {
    case 'order':
      return { pathname: '/order/[number]', params: { number: parsed.data.number } };
    case 'shipment':
      return { pathname: '/seller/[storeId]', params: { storeId: parsed.data.storeId } };
    case 'courier':
      return { pathname: '/courier', params: {} };
    case 'ride':
      return { pathname: '/go/[number]', params: { number: parsed.data.number } };
    case 'driver':
      return { pathname: '/driver', params: {} };
  }
}
