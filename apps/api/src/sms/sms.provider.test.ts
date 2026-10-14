import { describe, expect, it } from 'vitest';
import { DevSmsProvider } from './dev-sms.provider.js';
import { FakeSmsProvider } from './fake-sms.provider.js';

describe('development SMS adapters', () => {
  it('DevSmsProvider refuses to run outside development', () => {
    expect(() => new DevSmsProvider('production')).toThrow(/NODE_ENV=development/);
    expect(() => new DevSmsProvider('test')).toThrow();
    expect(() => new DevSmsProvider(undefined)).toThrow();
    expect(new DevSmsProvider('development').name).toBe('dev');
  });

  it('FakeSmsProvider refuses to run outside tests', () => {
    expect(() => new FakeSmsProvider('production')).toThrow(/NODE_ENV=test/);
    expect(() => new FakeSmsProvider('development')).toThrow();
  });
});
