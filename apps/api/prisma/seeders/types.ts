import type { PrismaClient } from '../../src/generated/prisma/client.js';

export type Db = PrismaClient;
export type Localized = { uz: string; ru: string };
