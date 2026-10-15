import type { ApiClient } from './api';
import type { PushState } from './push';

/** No push notifications in the web preview (tests only). */
export function pushPermission(): Promise<PushState> {
  return Promise.resolve('unavailable');
}

export function registerForPush(_api: ApiClient, _ask: boolean): Promise<PushState> {
  return Promise.resolve('unavailable');
}
