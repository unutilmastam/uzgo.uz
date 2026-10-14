import {
  type CurrentUser,
  currentUserResponseSchema,
  type Region,
  regionsResponseSchema,
} from '@uzgo/contracts';
import { cookies } from 'next/headers';
import { getServerEnv } from './server-env';

const SESSION_COOKIES = ['uzgo_session', '__Host-uzgo_session'];

/** Server-to-server call to the API, forwarding only the session cookie. */
async function apiFetch(path: string): Promise<Response> {
  const jar = await cookies();
  const session = SESSION_COOKIES.map((name) => jar.get(name)).find(Boolean);
  return fetch(`${getServerEnv().API_INTERNAL_URL}/api/v1${path}`, {
    cache: 'no-store',
    headers: session ? { cookie: `${session.name}=${session.value}` } : {},
    signal: AbortSignal.timeout(5000),
  });
}

/** The logged-in user, or null when there is no valid session. Throws on API failure. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const res = await apiFetch('/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`API /auth/me failed with ${String(res.status)}`);
  return currentUserResponseSchema.parse(await res.json()).user;
}

export async function getRegions(): Promise<Region[]> {
  const res = await apiFetch('/geo/regions');
  if (!res.ok) throw new Error(`API /geo/regions failed with ${String(res.status)}`);
  return regionsResponseSchema.parse(await res.json()).items;
}
