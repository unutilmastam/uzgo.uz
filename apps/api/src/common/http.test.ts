import { describe, expect, it } from 'vitest';
import { parseCookies } from './http.js';

describe('parseCookies', () => {
  it('parses, decodes and keeps the first value', () => {
    expect(parseCookies('a=1; b=hello%20world; a=2; bad; =x; c="q"')).toEqual({
      a: '1',
      b: 'hello world',
      c: 'q',
    });
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('x=%E0%A4%A')).toEqual({});
  });
});
