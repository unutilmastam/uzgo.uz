import {
  ASSISTANT_LIMITS,
  type AssistantCard,
  assistantReplySchema,
  assistantStatusSchema,
  assistantTextParts,
  type AssistantTurn,
} from '@uzgo/contracts';
import { formatPrice } from '@uzgo/ui/lib/money';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AppText, Button, Card, ErrorState, Field, Loading } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { localized } from '@/lib/format';
import { radius, spacing, useColors } from '@/lib/theme';
import { useRequest } from '@/lib/use-request';
import { useApp } from '@/state/app';

type Message = AssistantTurn & { cards?: AssistantCard[] };

/** /p/<slug> and /food/<slug> → app screens (other links are never produced). */
function open(href: string) {
  const [, kind, slug] = href.split('/');
  if (!slug) return;
  if (kind === 'p') router.push({ pathname: '/product/[slug]', params: { slug } });
  else if (kind === 'food') router.push({ pathname: '/food/[slug]', params: { slug } });
}

function Reply({ message }: { message: Message }) {
  const { locale } = useApp();
  const c = useColors();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText>
        {assistantTextParts(message.text).map((part, index) =>
          part.type === 'link' ? (
            <AppText
              key={index}
              accessibilityRole="link"
              style={{ color: c.primary, textDecorationLine: 'underline', fontWeight: '600' }}
              onPress={() => {
                open(part.href);
              }}
            >
              {part.text}
            </AppText>
          ) : (
            part.text
          ),
        )}
      </AppText>
      {(message.cards ?? []).map((card) => {
        const href =
          card.type === 'product'
            ? `/p/${card.slug}`
            : `/food/${card.type === 'dish' ? card.restaurantSlug : card.slug}`;
        return (
          <Pressable
            key={`${card.type}:${href}`}
            accessibilityRole="link"
            testID="assistant-card"
            onPress={() => {
              open(href);
            }}
            style={{
              padding: spacing.sm,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.background,
            }}
          >
            <AppText style={{ fontWeight: '600' }}>{localized(card.name, locale)}</AppText>
            {card.type !== 'restaurant' ? (
              <AppText variant="small">{formatPrice(card.priceTiyin, locale)}</AppText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The shopping assistant (ADR 0026). The conversation lives in this screen
 * only; each request sends it as plain text and nothing is stored.
 */
export default function AssistantScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const { api, t, locale, user, errorText } = useApp();
  const c = useColors();
  const status = useRequest(
    () => api.request('/assistant/status', { schema: assistantStatusSchema }),
    [user?.id],
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState(typeof params.q === 'string' ? params.q : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const scroll = useRef<ScrollView>(null);

  if (status.error && !status.data)
    return <ErrorState error={status.error} onRetry={status.reload} />;
  if (!status.data) return <Loading />;
  const left = remaining ?? status.data.remainingToday;

  async function send(text: string) {
    const question = text.trim().slice(0, ASSISTANT_LIMITS.chars);
    if (!question || pending) return;
    const history: Message[] = [...messages, { role: 'user', text: question }];
    setMessages(history);
    setDraft('');
    setPending(true);
    setError(null);
    try {
      const res = await api.request('/assistant/chat', {
        method: 'POST',
        body: {
          locale,
          messages: history
            .slice(-ASSISTANT_LIMITS.turns)
            .map(({ role, text: turn }) => ({ role, text: turn })),
        },
        schema: assistantReplySchema,
      });
      setMessages([...history, { role: 'assistant', text: res.reply, cards: res.cards }]);
      setRemaining(res.remainingToday);
    } catch (err) {
      setError(err instanceof ApiError ? errorText(err) : t('error_generic'));
      setMessages(messages);
      setDraft(question);
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: t('assistantTitle') }} />
      {!status.data.enabled ? (
        <View style={{ padding: spacing.lg }}>
          <AppText testID="assistant-off">{t('assistantOff')}</AppText>
        </View>
      ) : !user ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <AppText>{t('assistantLoginHint')}</AppText>
          <Button
            title={t('login')}
            onPress={() => {
              router.push({ pathname: '/login', params: { next: '/assistant' } });
            }}
          />
        </View>
      ) : (
        <>
          <ScrollView
            ref={scroll}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <Card>
                <AppText>{t('assistantHello')}</AppText>
                {(['assistantExample1', 'assistantExample2', 'assistantExample3'] as const).map(
                  (key) => (
                    <Button
                      key={key}
                      title={t(key)}
                      variant="outline"
                      disabled={pending || left === 0}
                      onPress={() => void send(t(key))}
                    />
                  ),
                )}
              </Card>
            ) : null}
            {messages.map((m, index) =>
              m.role === 'user' ? (
                <View
                  key={index}
                  style={{
                    alignSelf: 'flex-end',
                    maxWidth: '85%',
                    backgroundColor: c.primary,
                    borderRadius: radius.lg,
                    padding: spacing.md,
                  }}
                >
                  <AppText style={{ color: c.primaryForeground }}>{m.text}</AppText>
                </View>
              ) : (
                <View
                  key={index}
                  testID="assistant-reply"
                  style={{
                    alignSelf: 'flex-start',
                    maxWidth: '95%',
                    backgroundColor: c.muted,
                    borderRadius: radius.lg,
                    padding: spacing.md,
                  }}
                >
                  <Reply message={m} />
                </View>
              ),
            )}
            {pending ? <AppText variant="muted">{t('assistantThinking')}</AppText> : null}
            {error ? (
              <AppText color="destructive" accessibilityLiveRegion="polite">
                {error}
              </AppText>
            ) : null}
          </ScrollView>
          <View
            style={{
              padding: spacing.lg,
              gap: spacing.sm,
              borderTopWidth: 1,
              borderColor: c.border,
            }}
          >
            <Field
              label={t('assistantInput')}
              value={draft}
              onChangeText={setDraft}
              maxLength={ASSISTANT_LIMITS.chars}
              multiline
            />
            <Button
              title={t('assistantSend')}
              icon="send"
              loading={pending}
              disabled={!draft.trim() || left === 0}
              onPress={() => void send(draft)}
              testID="assistant-send"
            />
            <AppText variant="small">
              {left === null
                ? t('assistantPrivacy')
                : `${t('assistantRemaining', { count: left })} · ${t('assistantPrivacy')}`}
            </AppText>
          </View>
        </>
      )}
    </View>
  );
}
