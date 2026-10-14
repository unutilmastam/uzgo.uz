import { describe, expect, it } from 'vitest';
import { maskPhone } from './mask.js';

describe('maskPhone', () => {
  it('keeps country/operator prefix and last two digits', () => {
    expect(maskPhone('+998901234567')).toBe('+99890*****67');
  });

  it('fully masks very short input', () => {
    expect(maskPhone('12345')).toBe('*****');
  });
});
