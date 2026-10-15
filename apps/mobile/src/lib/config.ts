/**
 * Build-time configuration (Expo inlines EXPO_PUBLIC_* variables). In
 * production the website and the API share one origin (ADR 0007, ADR 0020).
 */
const trim = (url: string) => url.replace(/\/+$/, '');

export const API_URL = trim(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000');
export const WEB_URL = trim(process.env.EXPO_PUBLIC_WEB_URL ?? API_URL);

/** Absolute URL for API-relative media paths (/api/v1/media/…). */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
