import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

// Only short, safe ids are accepted from clients/proxies, so they cannot be
// used for log injection.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

/** Reuses a well-formed incoming X-Request-Id or generates a new UUID, and echoes it back. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}
