'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** The customer's delivery point, kept in this browser only (never sent until ordering). */
export type SavedPoint = { lat: number; lng: number; label: string };

/** The food delivery point; UZGO Go keeps its pickup and drop-off under their own keys. */
export const FOOD_POINT_KEY = 'uzgo:food:point';
const listeners = new Set<() => void>();
const caches = new Map<string, { raw: string | null; value: SavedPoint | null }>();

function read(key: string): SavedPoint | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return null;
  }
  const cached = caches.get(key);
  if (cached && raw === cached.raw) return cached.value;
  let value: SavedPoint | null = null;
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<SavedPoint>) : null;
    if (
      parsed &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number' &&
      typeof parsed.label === 'string'
    ) {
      value = { lat: parsed.lat, lng: parsed.lng, label: parsed.label };
    }
  } catch {
    value = null;
  }
  caches.set(key, { raw, value });
  return value;
}

/** Shared between the pages that use the same key (food: list, restaurant page, checkout). */
export function usePoint(
  key: string = FOOD_POINT_KEY,
): [SavedPoint | null, (point: SavedPoint | null) => void] {
  const point = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => read(key),
    () => null,
  );
  const set = useCallback(
    (next: SavedPoint | null) => {
      try {
        if (next) window.localStorage.setItem(key, JSON.stringify(next));
        else window.localStorage.removeItem(key);
      } catch {
        // Private mode: the point lives for this page only.
      }
      caches.delete(key);
      for (const l of listeners) l();
    },
    [key],
  );
  return [point, set];
}

/** Browser location (asks permission); null when refused or unavailable. */
export function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
