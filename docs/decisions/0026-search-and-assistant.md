# 0026 — Unified search and the AI shopping assistant

- Status: Accepted (owner answers, 2026-10-16)
- Builds on: 0014 (search), 0024 (Food), 0022 (mobile), 0021 (hardening)

## Owner decisions

| Question         | Answer                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| AI provider      | Anthropic Claude (behind an adapter, replaceable)                                                                             |
| What the AI does | Shopping helper: finds and compares products, restaurants and dishes; answers questions; never orders or pays — it only links |
| Cost limit       | 30 messages per user per day, signed-in users only, plus a monthly token budget                                               |
| Where            | Website and app                                                                                                               |

## Decision

1. **Unified search** (`GET /search/all?q=`): one query returns products
   (the existing full-text + trigram search), restaurants and dishes. Food
   gets the same normalised `searchText` as products (Uzbek Latin, Uzbek
   Cyrillic and Russian meet; apostrophe variants ignored) with trigram
   indexes, rebuilt whenever staff change a restaurant or a dish. The web
   search page and the app's search screen show restaurants and dishes above
   the product results.
2. **Assistant API** (`POST /assistant/chat`): stateless. The client sends
   the conversation as plain text (at most 20 turns, 2 000 characters each);
   nothing is stored on the server except a per-user daily counter and token
   usage. The server runs a short tool loop (at most 5 model calls) with
   read-only tools over public catalogue data: `search_products`,
   `search_food` and `get_product`. No personal data (orders, addresses,
   phones) is given to the model; the system prompt tells it to answer only
   about UZGO shopping, in the user's language, and to link items as
   relative UZGO paths. The reply is plain text; the server turns links that
   point to items the tools returned into cards, and clients render only
   those internal links (never external URLs).
3. **Provider adapter** `AssistantProvider` with `ClaudeAssistant`
   (official `@anthropic-ai/sdk`, model `claude-opus-5-5` by default, effort
   `low` for chat, adaptive thinking, server-side refusal fallback
   `fallbacks: "default"`; a refusal returns a polite fixed answer) and
   `FakeAssistant` for tests and local development (refused in production).
   Model, effort and limits are env settings.
4. **Limits**: signed-in users only; `ASSISTANT_DAILY_LIMIT` (30) messages
   per user per Tashkent day, counted atomically before the call; a monthly
   token budget `ASSISTANT_MONTHLY_TOKEN_BUDGET` across all users (the
   assistant answers "not available now" once it is spent); request rate
   limit 10/min. Without `ANTHROPIC_API_KEY` the assistant is switched off
   and clients hide it.
5. **Privacy**: users are told not to share personal data in the chat; the
   text they type is sent to Anthropic (USA) to produce the answer. This is
   a cross-border transfer — the privacy policy draft names it and the
   lawyer must confirm it before launch (same review as data residency).

## Consequences

- The assistant can be turned off by removing the key; no data migration.
- Conversations are not kept, so there is no chat history across devices
  (by design: less personal data). The app and website keep the current
  conversation in memory only.
- Reachability of the Anthropic API from the Tashkent server and the
  account's data-retention settings must be checked before launch.
