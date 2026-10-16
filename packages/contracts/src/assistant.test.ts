import { describe, expect, it } from 'vitest';
import { assistantChatRequestSchema, assistantTextParts } from './assistant.js';

describe('assistant contracts', () => {
  it('keeps only internal product and restaurant links', () => {
    const parts = assistantTextParts(
      'Mana: [Choynak](/p/choynak-1) va [Osh](/food/termiz-osh). [Bad](https://evil.example) [x](/admin)',
    );
    expect(parts.filter((p) => p.type === 'link')).toEqual([
      { type: 'link', text: 'Choynak', href: '/p/choynak-1' },
      { type: 'link', text: 'Osh', href: '/food/termiz-osh' },
    ]);
    expect(parts.map((p) => p.text).join('')).toContain('[Bad](https://evil.example)');
  });

  it('needs the last turn from the user', () => {
    const user = { role: 'user', text: 'Salom' } as const;
    const bot = { role: 'assistant', text: 'Salom!' } as const;
    expect(assistantChatRequestSchema.safeParse({ locale: 'uz', messages: [user] }).success).toBe(
      true,
    );
    expect(
      assistantChatRequestSchema.safeParse({ locale: 'uz', messages: [user, bot] }).success,
    ).toBe(false);
    const long = { role: 'user', text: 'x'.repeat(2001) } as const;
    expect(assistantChatRequestSchema.safeParse({ locale: 'uz', messages: [long] }).success).toBe(
      false,
    );
  });
});
