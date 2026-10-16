import Anthropic from '@anthropic-ai/sdk';
import type { AssistantAnswer, AssistantProvider, Toolbox } from './assistant.provider.js';
import { ToolInputError } from './assistant.provider.js';

/** At most this many model calls per user message (each tool round is one call). */
export const MAX_MODEL_CALLS = 5;

/** The part of the SDK client the assistant uses (a test passes a stub). */
export type MessagesClient = Pick<Anthropic, 'beta'>;

/**
 * Anthropic Claude behind the assistant (ADR 0026): adaptive thinking at a
 * chat-sized effort, read-only tools in a short loop, server-side refusal
 * fallback. Earlier turns are sent as plain text, so no thinking blocks are
 * ever replayed across turns; inside one turn the assistant content is
 * appended unchanged.
 */
export class ClaudeAssistant implements AssistantProvider {
  constructor(
    private readonly client: MessagesClient,
    private readonly options: { model: string; effort: 'low' | 'medium' | 'high' },
  ) {}

  async reply(input: {
    system: string;
    turns: { role: 'user' | 'assistant'; text: string }[];
    tools: Toolbox;
  }): Promise<AssistantAnswer> {
    // The conversation must start with the user.
    const first = input.turns.findIndex((t) => t.role === 'user');
    const messages: Anthropic.Beta.BetaMessageParam[] = input.turns
      .slice(Math.max(first, 0))
      .map((t) => ({ role: t.role, content: t.text }));
    const tools: Anthropic.Beta.BetaTool[] = input.tools.definitions.map((d) => ({
      name: d.name,
      description: d.description,
      input_schema: d.input_schema,
    }));
    let inputTokens = 0;
    let outputTokens = 0;
    let lastText = '';

    for (let call = 0; call < MAX_MODEL_CALLS; call += 1) {
      const response = await this.client.beta.messages.create({
        model: this.options.model,
        max_tokens: 16000,
        // Stable prefix (system + tools) is cached across users and turns.
        system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
        tools,
        messages,
        thinking: { type: 'adaptive' },
        output_config: { effort: this.options.effort },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      const usage = response.usage;
      inputTokens +=
        usage.input_tokens +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0);
      outputTokens += usage.output_tokens;

      if (response.stop_reason === 'refusal') {
        return { text: '', inputTokens, outputTokens, refused: true };
      }
      const text = response.content
        .flatMap((b) => (b.type === 'text' ? [b.text] : []))
        .join('')
        .trim();
      if (text) lastText = text;
      const uses = response.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
      );
      if (response.stop_reason !== 'tool_use' || uses.length === 0) {
        return { text: lastText, inputTokens, outputTokens, refused: false };
      }

      messages.push({ role: 'assistant', content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
        uses.map(async (use) => {
          try {
            return {
              type: 'tool_result' as const,
              tool_use_id: use.id,
              content: await input.tools.run(use.name, use.input),
            };
          } catch (err) {
            if (!(err instanceof ToolInputError)) throw err;
            return {
              type: 'tool_result' as const,
              tool_use_id: use.id,
              content: err.message,
              is_error: true,
            };
          }
        }),
      );
      // All results of one round go back in a single user message.
      messages.push({ role: 'user', content: results });
    }
    return { text: lastText, inputTokens, outputTokens, refused: false };
  }
}

export function createClaudeClient(apiKey: string): MessagesClient {
  return new Anthropic({ apiKey, maxRetries: 1, timeout: 45_000 });
}
