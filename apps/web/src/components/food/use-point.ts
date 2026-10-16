'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** The customer's delivery point, kept in this browser only (never sent until ordering). */
export type SavedPoint = { lat: number; lng: number; label: string };

const KEY = 'uzgo:food:point';
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: SavedPoint | null } = { raw: null, value: null };

function read(): SavedPoint | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === cached.raw) return cached.value;
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
  cached = { raw, value };
  return value;
}

/** Shared between the list, the restaurant page and checkout. */
export function usePoint(): [SavedPoint | null, (point: SavedPoint | null) => void] {
  const point = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => null,
  );
  const set = useCallback((next: SavedPoint | null) => {
    try {
      if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
      else window.localStorage.removeItem(KEY);
    } catch {
      // Private mode: the point lives for this page only.
    }
    cached = { raw: null, value: null };
    for (const l of listeners) l();
  }, []);
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
