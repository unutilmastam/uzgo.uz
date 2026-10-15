import { describe, expect, it } from 'vitest';
import { pushTarget } from './push-target';

describe('push deep links', () => {
  it('opens the order or the store shipments', () => {
    expect(pushTarget({ type: 'order', number: 'UZ-2026-000001' })).toEqual({
      pathname: '/order/[number]',
      params: { number: 'UZ-2026-000001' },
    });
    const storeId = '01a1402e-9251-727c-91cb-9ceff87e8604';
    expect(pushTarget({ type: 'shipment', storeId })?.params).toEqual({ storeId });
  });

  it('ignores unknown or malformed payloads', () => {
    expect(pushTarget({ type: 'url', href: 'https://evil.example' })).toBeNull();
    expect(pushTarget({ type: 'shipment', storeId: '../admin' })).toBeNull();
    expect(pushTarget(null)).toBeNull();
  });
});
