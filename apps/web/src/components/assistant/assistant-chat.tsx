'use client';

import {
  ASSISTANT_LIMITS,
  type AssistantCard,
  assistantReplySchema,
  assistantTextParts,
  type AssistantTurn,
} from '@uzgo/contracts';
import { Button } from '@uzgo/ui/components/button';
import { Price } from '@uzgo/ui/components/price';
import { SendHorizontal, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Textarea } from '@/components/panel/form-controls';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { ApiClientError, apiClient } from '@/lib/api-client';

type Message = AssistantTurn & { cards?: AssistantCard[] };

/** Assistant text: only internal UZGO links become links; everything else stays text. */
function RichText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap">
      {assistantTextParts(text).map((part, index) =>
        part.type === 'link' ? (
          <Link key={index} href={part.href} className="font-medium text-primary underline">
            {part.text}
          </Link>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  );
}

function Cards({ cards }: { cards: AssistantCard[] }) {
  const locale = useLocale() as Locale;
  return (
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {cards.map((card) => {
        const href =
          card.type === 'product'
            ? `/p/${card.slug}`
            : `/food/${card.type === 'dish' ? card.restaurantSlug : card.slug}`;
        return (
          <li key={`${card.type}:${href}`}>
            <Link
              href={href}
              className="flex items-center gap-3 rounded-lg border border-border bg-background p-2 text-sm hover:border-primary"
              data-testid="assistant-card"
            >
              {card.type === 'product' && card.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- object storage URLs
                <img src={card.image.url} alt="" className="size-12 rounded object-cover" />
              ) : null}
              <span className="flex min-w-0 flex-col">
                <span className="line-clamp-2 font-medium">{card.name[locale]}</span>
                {card.type !== 'restaurant' ? (
                  <Price value={card.priceTiyin} locale={locale} className="text-xs" />
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The shopping assistant chat (ADR 0026). The conversation lives in this tab
 * only; each request sends it as plain text and nothing is stored.
 */
export function AssistantChat({
  initialQuestion,
  remainingToday,
}: {
  initialQuestion?: string | undefined;
  remainingToday: number | null;
}) {
  const t = useTranslations('assistant');
  const locale = useLocale() as Locale;
  const id = useId();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState(initialQuestion ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(remainingToday);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages, pending]);

  async function send(text: string) {
    const question = text.trim().slice(0, ASSISTANT_LIMITS.chars);
    if (!question || pending) return;
    const history: Message[] = [...messages, { role: 'user', text: question }];
    setMessages(history);
    setDraft('');
    setPending(true);
    setError(null);
    try {
      const res = assistantReplySchema.parse(
        await apiClient('/assistant/chat', {
          method: 'POST',
          body: {
            locale,
            // The newest turns only, as plain text.
            messages: history.slice(-ASSISTANT_LIMITS.turns).map(({ role, text: turn }) => ({
              role,
              text: turn.slice(0, ASSISTANT_LIMITS.chars),
            })),
          },
        }),
      );
      setMessages([...history, { role: 'assistant', text: res.reply, cards: res.cards }]);
      setRemaining(res.remainingToday);
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : '';
      setError(t.has(`error_${code}`) ? t(`error_${code}`) : t('error_generic'));
      // Let the user try again with the same question.
      setMessages(messages);
      setDraft(question);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex min-h-64 flex-col gap-3 rounded-xl border border-border bg-card p-4"
        aria-live="polite"
        data-testid="assistant-log"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Sparkles aria-hidden="true" className="size-5 text-primary" />
              {t('hello')}
            </p>
            <div className="flex flex-wrap gap-2">
              {(['example1', 'example2', 'example3'] as const).map((key) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || remaining === 0}
                  onClick={() => void send(t(key))}
                >
                  {t(key)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m, index) => (
          <div
            key={index}
            className={
              m.role === 'user'
                ? 'max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground'
                : 'max-w-[95%] self-start rounded-2xl rounded-bl-sm bg-muted px-3 py-2'
            }
            data-testid={m.role === 'user' ? 'assistant-user' : 'assistant-reply'}
          >
            {m.role === 'assistant' ? (
              <RichText text={m.text} />
            ) : (
              <p className="whitespace-pre-wrap">{m.text}</p>
            )}
            {m.cards && m.cards.length > 0 ? <Cards cards={m.cards} /> : null}
          </div>
        ))}
        {pending ? (
          <p className="self-start text-sm text-muted-foreground" role="status">
            {t('thinking')}
          </p>
        ) : null}
        <div ref={end} />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          {t('inputLabel')}
        </label>
        <Textarea
          id={`${id}-q`}
          value={draft}
          maxLength={ASSISTANT_LIMITS.chars}
          className="min-h-12 flex-1"
          placeholder={t('placeholder')}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          disabled={pending || !draft.trim() || remaining === 0}
          aria-label={t('send')}
        >
          <SendHorizontal aria-hidden="true" />
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        {remaining === null ? null : `${t('remaining', { count: remaining })} · `}
        {t('privacy')}
      </p>
    </div>
  );
}
