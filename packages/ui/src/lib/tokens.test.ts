// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { colors } from './tokens';

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const entries = [...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map(([, name, value]) => [
    (name ?? '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
    value,
  ]);
  return Object.fromEntries(entries) as Record<string, string>;
}

describe('design tokens for mobile', () => {
  it('match the CSS tokens exactly', () => {
    expect(colors.light).toEqual(block(':root'));
    expect(colors.dark).toEqual(block('.dark'));
  });
});
