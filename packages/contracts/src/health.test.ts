import { describe, expect, it } from 'vitest';
import { healthReadySchema } from './health.js';

describe('healthReadySchema', () => {
  it('accepts a valid ready response', () => {
    expect(healthReadySchema.parse({ status: 'ok', checks: { database: 'up' } })).toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('rejects an unknown database state', () => {
    expect(
      healthReadySchema.safeParse({ status: 'ok', checks: { database: 'maybe' } }).success,
    ).toBe(false);
  });
});
