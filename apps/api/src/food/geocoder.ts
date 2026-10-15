import { Logger } from '@nestjs/common';
import type { Point } from './geo.js';

export const GEOCODER = Symbol('GEOCODER');

export type GeocodeResult = Point & { label: string };

/** Address ↔ coordinates (ADR 0024). Implementations never throw on "not found". */
export interface GeocodingProvider {
  search(query: string, locale: 'uz' | 'ru'): Promise<GeocodeResult[]>;
  reverse(point: Point, locale: 'uz' | 'ru'): Promise<string | null>;
}

/** Inside Uzbekistan's bounding box (lat 37.1–45.6, lng 55.9–73.2). */
export function inUzbekistan(p: Point): boolean {
  return p.lat >= 37 && p.lat <= 46 && p.lng >= 55 && p.lng <= 74;
}

type NominatimHit = { lat?: unknown; lon?: unknown; display_name?: unknown };

/**
 * OpenStreetMap Nominatim. Follows the public usage policy: one request per
 * second, an identifying User-Agent and cached results. For high volume run
 * an own Nominatim or switch the adapter (Yandex) — ADR 0024.
 */
export class NominatimGeocoder implements GeocodingProvider {
  private readonly logger = new Logger(NominatimGeocoder.name);
  private readonly cache = new Map<string, { at: number; value: unknown }>();
  private queue: Promise<unknown> = Promise.resolve();
  private last = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly userAgent: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly minIntervalMs = 1100,
  ) {}

  async search(query: string, locale: 'uz' | 'ru'): Promise<GeocodeResult[]> {
    const q = query.trim().replace(/\s+/g, ' ').slice(0, 200);
    if (q.length < 3) return [];
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      countrycodes: 'uz',
      limit: '5',
      'accept-language': locale,
    });
    const hits = await this.get<NominatimHit[]>(`/search?${params.toString()}`);
    return (Array.isArray(hits) ? hits : []).flatMap((h) => {
      const lat = Number(h.lat);
      const lng = Number(h.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || typeof h.display_name !== 'string') {
        return [];
      }
      const point = { lat, lng };
      return inUzbekistan(point) ? [{ ...point, label: h.display_name.slice(0, 300) }] : [];
    });
  }

  async reverse(point: Point, locale: 'uz' | 'ru'): Promise<string | null> {
    const params = new URLSearchParams({
      lat: point.lat.toFixed(5),
      lon: point.lng.toFixed(5),
      format: 'jsonv2',
      zoom: '18',
      'accept-language': locale,
    });
    const hit = await this.get<NominatimHit>(`/reverse?${params.toString()}`);
    return hit && typeof hit.display_name === 'string' ? hit.display_name.slice(0, 300) : null;
  }

  private async get<T>(path: string): Promise<T | null> {
    const cached = this.cache.get(path);
    if (cached && Date.now() - cached.at < 24 * 60 * 60 * 1000) return cached.value as T;
    // Requests run one after another with at least `minIntervalMs` between them.
    const run = this.queue.then(async () => {
      const wait = this.last + this.minIntervalMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.last = Date.now();
      try {
        const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          headers: { 'user-agent': this.userAgent, accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          this.logger.warn({ status: res.status }, 'Geocoder request failed');
          return null;
        }
        return await res.json();
      } catch (err) {
        this.logger.warn(
          { err: err instanceof Error ? err.name : 'Error' },
          'Geocoder unreachable',
        );
        return null;
      }
    });
    this.queue = run.catch(() => undefined);
    const value = await run;
    if (value !== null) {
      if (this.cache.size >= 1000) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
      this.cache.set(path, { at: Date.now(), value });
    }
    return value as T | null;
  }
}

/** Tests: a fixed gazetteer around Termiz; anything else is "not found". */
export class FakeGeocoder implements GeocodingProvider {
  readonly places: (GeocodeResult & { match: string })[] = [
    { match: 'alpomish', lat: 37.2286, lng: 67.2756, label: 'Alpomish koʻchasi, Termiz' },
    { match: 'navoiy', lat: 37.2311, lng: 67.2881, label: 'Navoiy koʻchasi, Termiz' },
    { match: 'tashkent', lat: 41.3111, lng: 69.2797, label: 'Toshkent' },
  ];

  search(query: string): Promise<GeocodeResult[]> {
    const q = query.toLowerCase();
    return Promise.resolve(
      this.places
        .filter((p) => q.includes(p.match))
        .map(({ lat, lng, label }) => ({ lat, lng, label })),
    );
  }

  reverse(point: Point): Promise<string | null> {
    return Promise.resolve(`${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`);
  }
}
