import type { AssistantTurn } from '@uzgo/contracts';

/** A tool the model may call: name, description and JSON Schema of its input. */
export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
};

/** Runs tools for one conversation turn (read-only, public catalogue data). */
export interface Toolbox {
  readonly definitions: ToolDefinition[];
  /** Returns the tool result as text (JSON); throws ToolInputError on bad input. */
  run(name: string, input: unknown): Promise<string>;
}

export class ToolInputError extends Error {}

export type AssistantAnswer = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** The model declined (safety); the service answers with a fixed polite text. */
  refused: boolean;
};

/** The AI behind the shopping assistant (ADR 0026); swap the provider, keep the rest. */
export interface AssistantProvider {
  reply(input: {
    system: string;
    turns: AssistantTurn[];
    tools: Toolbox;
  }): Promise<AssistantAnswer>;
}

export const ASSISTANT_PROVIDER = Symbol('ASSISTANT_PROVIDER');
