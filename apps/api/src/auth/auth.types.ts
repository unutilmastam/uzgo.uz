import type { Role } from '../generated/prisma/client.js';

export type AuthUser = { id: string; phone: string; roles: Role[] };

/** totpVerified: the session passed the staff second factor recently. */
export type AuthContext = { user: AuthUser; sessionId: string; totpVerified: boolean };

declare module 'express' {
  interface Request {
    auth?: AuthContext;
  }
}
