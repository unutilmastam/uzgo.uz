import type { Role } from '../generated/prisma/client.js';

export type AuthUser = { id: string; phone: string; roles: Role[] };

export type AuthContext = { user: AuthUser; sessionId: string };

declare module 'express' {
  interface Request {
    auth?: AuthContext;
  }
}
