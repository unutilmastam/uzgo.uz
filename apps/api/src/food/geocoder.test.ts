import { describe, expect, it, vi } from 'vitest';
import { NominatimGeocoder } from './geocoder.js';

const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('NominatimGeocoder', () => {
  it('asks Uzbekistan only, identifies itself, keeps hits inside the country and caches', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      json([
        { lat: '37.2286', lon: '67.2756', display_name: 'Alpomish koʻchasi, Termiz' },
        { lat: '55.75', lon: '37.61', display_name: 'Moskva' },
        { lat: 'x', lon: '1', display_name: 'broken' },
      ]),
    );
    const geo = new NominatimGeocoder(
      'https://nominatim.example',
      'UZGO/1.0 (ops@example.uz)',
      fetchMock as unknown as typeof fetch,
      0,
    );
    const hits = await geo.search('  Alpomish   koʻchasi ', 'uz');
    expect(hits).toEqual([{ lat: 37.2286, lng: 67.2756, label: 'Alpomish koʻchasi, Termiz' }]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toContain('countrycodes=uz');
    expect(url).toContain('q=Alpomish+ko%CA%BBchasi');
    expect((init?.headers as Record<string, string>)['user-agent']).toBe(
      'UZGO/1.0 (ops@example.uz)',
    );
    await geo.search('Alpomish koʻchasi', 'uz');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await geo.search('ab', 'uz')).toEqual([]);
  });

  it('spaces requests at least the minimum interval apart', async () => {
    const times: number[] = [];
    const fetchMock = vi.fn(() => {
      times.push(Date.now());
      return json([]);
    });
    const geo = new NominatimGeocoder('https://n', 'UZGO', fetchMock, 200);
    await Promise.all([geo.search('one place', 'uz'), geo.search('two place', 'uz')]);
    expect((times[1] ?? 0) - (times[0] ?? 0)).toBeGreaterThanOrEqual(190);
  });

  it('treats errors as "not found"', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('offline')));
    const geo = new NominatimGeocoder('https://n', 'UZGO', fetchMock, 0);
    expect(await geo.search('Termiz', 'uz')).toEqual([]);
    expect(await geo.reverse({ lat: 37.2, lng: 67.2 }, 'uz')).toBeNull();
  });
});
