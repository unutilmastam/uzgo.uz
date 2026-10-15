import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalDiskStorage } from './local-disk.storage.js';
import { isValidStorageKey } from './storage.adapter.js';

describe('storage keys', () => {
  it('accepts server-generated keys only', () => {
    expect(isValidStorageKey('products/0193a1b2/abc123.webp')).toBe(true);
    for (const key of [
      '../etc/passwd',
      'products/../../x.webp',
      '/abs/path.webp',
      'x.svg',
      'x.html',
      'Products/X.webp',
      'a//b.png',
      '',
    ]) {
      expect(isValidStorageKey(key), key).toBe(false);
    }
  });
});

describe('LocalDiskStorage', () => {
  let dir: string;
  let storage: LocalDiskStorage;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'uzgo-storage-'));
    storage = new LocalDiskStorage(dir, '/api/v1/media');
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('stores, reads and deletes objects', async () => {
    const key = 'products/p1/img1.png';
    await storage.put(key, Buffer.from('png-bytes'), 'image/png');
    expect((await storage.get(key))?.body.toString()).toBe('png-bytes');
    expect(storage.publicUrl(key)).toBe('/api/v1/media/products/p1/img1.png');
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  it('never overwrites, and rejects mismatched types and bad keys', async () => {
    await storage.put('a/b.webp', Buffer.from('1'), 'image/webp');
    await expect(storage.put('a/b.webp', Buffer.from('2'), 'image/webp')).rejects.toThrow();
    await expect(storage.put('a/c.webp', Buffer.from('1'), 'image/png')).rejects.toThrow(
      /Content type/,
    );
    await expect(storage.put('../x.webp', Buffer.from('1'), 'image/webp')).rejects.toThrow(
      /Invalid/,
    );
    expect(await storage.get('../x.webp')).toBeNull();
  });
});
