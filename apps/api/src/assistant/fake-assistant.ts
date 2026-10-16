import type { AssistantAnswer, AssistantProvider, Toolbox } from './assistant.provider.js';

type FoundItem = { name: string; price_som?: number; path: string };

const FOOD_WORDS = /restoran|oshxona|taom|ovqat|osh|somsa|lavash|pizza|ресторан|еда|плов|блюд/i;

/**
 * DEVELOPMENT / TESTS ONLY — a deterministic stand-in for the AI (refused in
 * production by env validation). It runs the real tools on the user's last
 * message and lists what they found, so the whole chain can be tested
 * without an API key.
 */
export class FakeAssistant implements AssistantProvider {
  async reply(input: {
    system: string;
    turns: { role: 'user' | 'assistant'; text: string }[];
    tools: Toolbox;
  }): Promise<AssistantAnswer> {
    const question = input.turns.at(-1)?.text ?? '';
    // The last word of the question is what it looks for.
    const query =
      question
        .replace(/[?!.,:;]/g, ' ')
        .trim()
        .split(/\s+/)
        .at(-1) ?? '';
    const food = FOOD_WORDS.test(question);
    const raw = await input.tools.run(food ? 'search_food' : 'search_products', { query });
    const parsed = JSON.parse(raw) as {
      products?: FoundItem[];
      restaurants?: FoundItem[];
      dishes?: FoundItem[];
    };
    const items = [
      ...(parsed.products ?? []),
      ...(parsed.restaurants ?? []),
      ...(parsed.dishes ?? []),
    ];
    const text =
      items.length === 0
        ? `[FAKE] «${query}» boʻyicha hech narsa topilmadi.`
        : `[FAKE] «${query}» boʻyicha topganlarim:\n${items
            .slice(0, 5)
            .map(
              (i) =>
                `- [${i.name}](${i.path})${i.price_som === undefined ? '' : ` — ${String(i.price_som)} soʻm`}`,
            )
            .join('\n')}`;
    return {
      text,
      inputTokens: input.system.length + question.length,
      outputTokens: text.length,
      refused: false,
    };
  }
}
