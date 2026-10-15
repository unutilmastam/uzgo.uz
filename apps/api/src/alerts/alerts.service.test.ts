import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import { AlertsService } from './alerts.service.js';

const env = { NODE_ENV: 'test' } as Env;

describe('AlertsService', () => {
  it('throttles repeated fingerprints and caps the hourly volume', () => {
    const alerts = new AlertsService(env);
    const t0 = 1_000_000;
    expect(alerts.report('GET /x TypeError', 'boom', t0)).toBe(true);
    expect(alerts.report('GET /x TypeError', 'boom', t0 + 60_000)).toBe(false);
    expect(alerts.report('GET /x TypeError', 'boom', t0 + 11 * 60_000)).toBe(true);
    for (let i = 0; i < 30; i += 1) alerts.report(`f${String(i)}`, 'x', t0 + 12 * 60_000);
    expect(alerts.testProvider?.sent).toHaveLength(20);
    expect(alerts.testProvider?.sent[0]?.text).toBe('[UZGO test] boom');
  });

  it('is a no-op without a chat id outside tests', () => {
    const alerts = new AlertsService({ NODE_ENV: 'production' } as Env);
    expect(alerts.report('a', 'b')).toBe(false);
  });
});
