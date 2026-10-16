import { useSyncExternalStore } from 'react';
import type { Point } from './location';

/** The chosen delivery point for UZGO Food (kept in memory while the app runs). */
export type FoodPoint = Point & { label: string };

let current: FoodPoint | null = null;
const listeners = new Set<() => void>();

export function setFoodPoint(point: FoodPoint | null): void {
  current = point;
  for (const l of listeners) l();
}

export function useFoodPoint(): FoodPoint | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current,
  );
}
