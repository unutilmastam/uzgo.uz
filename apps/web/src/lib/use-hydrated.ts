import { useSyncExternalStore } from 'react';

const noop = () => () => undefined;

/**
 * False during server rendering and before hydration, true afterwards.
 * Interactive controls stay disabled until then, so an early click is never lost.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
