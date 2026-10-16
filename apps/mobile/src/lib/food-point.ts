import { useSyncExternalStore } from 'react';
import type { Point } from './location';

/** A chosen place (kept in memory while the app runs). */
export type FoodPoint = Point & { label: string };

/** food: the delivery point; pickup / dropoff: UZGO Go (ADR 0025). */
export type PointSlot = 'food' | 'pickup' | 'dropoff';

const current: Record<PointSlot, FoodPoint | null> = { food: null, pickup: null, dropoff: null };
const listeners = new Set<() => void>();

export function setPoint(slot: PointSlot, point: FoodPoint | null): void {
  current[slot] = point;
  for (const l of listeners) l();
}

export function usePoint(slot: PointSlot): FoodPoint | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current[slot],
    () => current[slot],
  );
}

export const setFoodPoint = (point: FoodPoint | null) => {
  setPoint('food', point);
};
export const useFoodPoint = () => usePoint('food');
