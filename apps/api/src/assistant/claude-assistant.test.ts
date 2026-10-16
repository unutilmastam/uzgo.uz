import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { ToolInputError, type Toolbox } from './assistant.provider.js';
import { ClaudeAssistant, MAX_MODEL_CALLS, type MessagesClient } from './claude-assistant.js';

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;
const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50 };

/** A stub of client.beta.messages.create returning the given responses in order. */
function stub(responses: object[]) {
  const calls: Params[] = [];
  const client = {
    beta: {
      messages: {
        create: (params: Params) => {
          // Copy: the assistant keeps appending to the same array.
          calls.push(structuredClone(params));
          const next = responses.shift();
          if (!next) throw new Error('No more responses');
          return Promise.resolve(next);
        },
      },
    },
  } as unknown as MessagesClient;
  return { client, calls };
}

const toolbox = (run: Toolbox['run']): Toolbox => ({
  definitions: [
    {
      name: 'search_products',
      description: 'Search',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  ],
  run,
});

const turns = [{ role: 'user' as const, text: 'Choynak kerak' }];

describe('ClaudeAssistant', () => {
  it('runs a tool round, returns the final text and adds up usage', async () => {
    const toolUse = {
      type: 'tool_use',
      id: 'tu_1',
      name: 'search_products',
      input: { query: 'choynak' },
    };
    const thinking = { type: 'thinking', thinking: '', signature: 'sig' };
    const { client, calls } = stub([
      { stop_reason: 'tool_use', content: [thinking, toolUse], usage },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Mana: [Choynak](/p/choynak)' }],
        usage,
      },
    ]);
    const ran: unknown[] = [];
    const answer = await new ClaudeAssistant(client, {
      model: 'claude-opus-5-5',
      effort: 'low',
    }).reply({
      system: 'SYSTEM',
      turns,
      tools: toolbox((name, input) => {
        ran.push({ name, input });
        return Promise.resolve('{"products":[]}');
      }),
    });
    expect(answer).toEqual({
      text: 'Mana: [Choynak](/p/choynak)',
      inputTokens: 300,
      outputTokens: 40,
      refused: false,
    });
    expect(ran).toEqual([{ name: 'search_products', input: { query: 'choynak' } }]);
    const first = calls[0];
    expect(first).toMatchObject({
      model: 'claude-opus-5-5',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
    });
    expect(first?.tool_choice).toBeUndefined();
    // Second call: the assistant turn appended unchanged (thinking included), then one tool_result message.
    const second = calls[1]?.messages ?? [];
    expect(second).toHaveLength(3);
    expect(second[1]).toEqual({ role: 'assistant', content: [thinking, toolUse] });
    expect(second[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '{"products":[]}' }],
    });
  });

  it('reports bad tool input back to the model instead of failing', async () => {
    const { client, calls } = stub([
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu_1', name: 'nope', input: {} }],
        usage,
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'OK' }], usage },
    ]);
    const answer = await new ClaudeAssistant(client, { model: 'm', effort: 'low' }).reply({
      system: 'S',
      turns,
      tools: toolbox(() => Promise.reject(new ToolInputError('Unknown tool nope'))),
    });
    expect(answer.text).toBe('OK');
    expect(calls[1]?.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu_1', content: 'Unknown tool nope', is_error: true },
      ],
    });
  });

  it('flags refusals and stops after the call limit', async () => {
    const refused = stub([{ stop_reason: 'refusal', content: [], usage }]);
    const r = await new ClaudeAssistant(refused.client, { model: 'm', effort: 'low' }).reply({
      system: 'S',
      turns,
      tools: toolbox(() => Promise.resolve('{}')),
    });
    expect(r.refused).toBe(true);

    const loop = Array.from({ length: MAX_MODEL_CALLS + 1 }, (_, i) => ({
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: `tu_${String(i)}`, name: 'search_products', input: { query: 'x' } },
      ],
      usage,
    }));
    const looping = stub(loop);
    await new ClaudeAssistant(looping.client, { model: 'm', effort: 'low' }).reply({
      system: 'S',
      turns,
      tools: toolbox(() => Promise.resolve('{}')),
    });
    expect(looping.calls).toHaveLength(MAX_MODEL_CALLS);
  });

  it('starts the conversation with the user', async () => {
    const { client, calls } = stub([
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hi' }], usage },
    ]);
    await new ClaudeAssistant(client, { model: 'm', effort: 'low' }).reply({
      system: 'S',
      turns: [{ role: 'assistant', text: 'Salom!' }, ...turns],
      tools: toolbox(() => Promise.resolve('{}')),
    });
    expect(calls[0]?.messages).toEqual([{ role: 'user', content: 'Choynak kerak' }]);
  });
});
