import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AssistantCard,
  type AssistantChatRequest,
  type AssistantReply,
  type AssistantStatus,
  assistantTextParts,
} from '@uzgo/contracts';
import { AlertsService } from '../alerts/alerts.service.js';
import { AppException } from '../common/http-exception.filter.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SearchService } from '../search/search.service.js';
import { UnifiedSearchService } from '../search/unified-search.service.js';
import { CatalogToolbox } from './assistant-tools.js';
import { ASSISTANT_PROVIDER, type AssistantProvider } from './assistant.provider.js';

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
/** Tashkent calendar day / month start as YYYY-MM-DD. */
const tashkentDay = (now: Date) =>
  new Date(now.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
const tashkentMonthStart = (now: Date) => `${tashkentDay(now).slice(0, 7)}-01`;

const MAX_CARDS = 6;

const REFUSED: Record<'uz' | 'ru', string> = {
  uz: 'Kechirasiz, bu savolga javob bera olmayman. UZGO dagi mahsulot, restoran yoki taom haqida soʻrang.',
  ru: 'Извините, на этот вопрос я ответить не могу. Спросите о товарах, ресторанах или блюдах на UZGO.',
};
const EMPTY: Record<'uz' | 'ru', string> = {
  uz: 'Kechirasiz, javob tayyorlay olmadim. Savolni boshqacha yozib koʻring.',
  ru: 'Извините, не получилось ответить. Попробуйте сформулировать вопрос иначе.',
};

/** Short, stable instructions (cached); the language line is the only variable part. */
export function systemPrompt(locale: 'uz' | 'ru'): string {
  return [
    'You are the shopping assistant of UZGO (uzgo.uz), an online marketplace in Uzbekistan:',
    'UZGO Market (products from many sellers), UZGO Food (restaurant delivery) and UZGO Go (taxi).',
    'Help people find and compare products, restaurants and dishes. Look things up with the tools;',
    'never invent products, prices, stock or delivery promises. Prices are in soʻm.',
    'When you mention an item the tools returned, link it as [Name](path) with the exact path from the tool.',
    'Do not write any other links.',
    'You cannot order, pay, see the user’s orders, rides or personal data, or change anything.',
    'For orders, payments, returns, delivery or rides, tell the user where to find them in their account.',
    'Do not ask for personal data (phone numbers, addresses, card numbers) and do not repeat it.',
    'Politely decline requests unrelated to shopping on UZGO.',
    'Keep answers short and plain, without tables.',
    locale === 'ru'
      ? 'Reply in Russian unless the user writes in another language.'
      : 'Reply in Uzbek (Latin script) unless the user writes in another language.',
  ].join('\n');
}

/**
 * The shopping assistant (ADR 0026): signed-in users, a daily message limit
 * counted atomically before the model runs, a monthly token budget, no
 * conversation stored. Cards come only from items the tools returned.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: SearchService,
    private readonly food: UnifiedSearchService,
    private readonly alerts: AlertsService,
    @Inject(ASSISTANT_PROVIDER) private readonly provider: AssistantProvider | null,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get enabled(): boolean {
    return this.provider !== null && this.env.ASSISTANT_MONTHLY_TOKEN_BUDGET > 0;
  }

  async status(userId: string | null, now = new Date()): Promise<AssistantStatus> {
    const limit = this.env.ASSISTANT_DAILY_LIMIT;
    if (!userId) return { enabled: this.enabled, dailyLimit: limit, remainingToday: null };
    const row = await this.prisma.assistantUsage.findUnique({
      where: { userId_day: { userId, day: new Date(tashkentDay(now)) } },
      select: { messages: true },
    });
    return {
      enabled: this.enabled,
      dailyLimit: limit,
      remainingToday: Math.max(0, limit - (row?.messages ?? 0)),
    };
  }

  private unavailable(code: string, message: string) {
    return new AppException(HttpStatus.SERVICE_UNAVAILABLE, code, message);
  }

  private async monthTokens(now: Date): Promise<number> {
    const sum = await this.prisma.assistantUsage.aggregate({
      where: { day: { gte: new Date(tashkentMonthStart(now)) } },
      _sum: { inputTokens: true, outputTokens: true },
    });
    return (sum._sum.inputTokens ?? 0) + (sum._sum.outputTokens ?? 0);
  }

  async chat(
    userId: string,
    input: AssistantChatRequest,
    now = new Date(),
  ): Promise<AssistantReply> {
    const provider = this.provider;
    if (!provider || !this.enabled) {
      throw this.unavailable('ASSISTANT_DISABLED', 'The assistant is not available');
    }
    if ((await this.monthTokens(now)) >= this.env.ASSISTANT_MONTHLY_TOKEN_BUDGET) {
      throw this.unavailable(
        'ASSISTANT_BUDGET_EXHAUSTED',
        'The assistant is resting until next month',
      );
    }
    const day = tashkentDay(now);
    const limit = this.env.ASSISTANT_DAILY_LIMIT;
    // Count first, atomically: parallel requests can never pass the limit.
    const counted = await this.prisma.$queryRaw<{ messages: number }[]>`
      INSERT INTO "AssistantUsage" ("userId", "day", "messages", "updatedAt")
      VALUES (${userId}::uuid, ${day}::date, 1, now())
      ON CONFLICT ("userId", "day") DO UPDATE
        SET "messages" = "AssistantUsage"."messages" + 1, "updatedAt" = now()
        WHERE "AssistantUsage"."messages" < ${limit}
      RETURNING "messages"`;
    const used = counted[0]?.messages;
    if (used === undefined) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'ASSISTANT_DAILY_LIMIT',
        'Daily assistant limit reached',
        { dailyLimit: limit },
      );
    }

    const toolbox = new CatalogToolbox(
      { prisma: this.prisma, products: this.products, food: this.food },
      input.locale,
    );
    let answer;
    try {
      answer = await provider.reply({
        system: systemPrompt(input.locale),
        turns: input.messages,
        tools: toolbox,
      });
    } catch (err) {
      // A failed answer does not use up the user's daily messages.
      await this.prisma.$executeRaw`
        UPDATE "AssistantUsage" SET "messages" = GREATEST("messages" - 1, 0)
        WHERE "userId" = ${userId}::uuid AND "day" = ${day}::date`;
      this.logger.error({ err }, 'Assistant provider failed');
      this.alerts.report(
        'assistant',
        `Assistant provider failed: ${err instanceof Error ? err.name : 'UnknownError'}`,
      );
      throw this.unavailable('ASSISTANT_UNAVAILABLE', 'The assistant could not answer');
    }
    await this.prisma.assistantUsage.update({
      where: { userId_day: { userId, day: new Date(day) } },
      data: {
        inputTokens: { increment: answer.inputTokens },
        outputTokens: { increment: answer.outputTokens },
      },
    });

    const reply = answer.refused ? REFUSED[input.locale] : answer.text || EMPTY[input.locale];
    const cards: AssistantCard[] = [];
    for (const part of assistantTextParts(reply)) {
      if (part.type !== 'link') continue;
      const card = toolbox.known.get(part.href);
      if (card && !cards.includes(card) && cards.length < MAX_CARDS) cards.push(card);
    }
    return { reply, cards, remainingToday: Math.max(0, limit - used) };
  }
}
