import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { contentTypeForKey, isValidStorageKey, type StorageAdapter } from './storage.adapter.js';

/** DEVELOPMENT / TESTS: stores objects on the local disk. Not for production. */
export class DevLocalDiskStorage implements StorageAdapter {
  readonly name = 'dev-local-disk';
  private readonly root: string;

  constructor(
    rootDir: string,
    private readonly publicBaseUrl: string,
  ) {
    this.root = resolve(rootDir);
  }

  private pathFor(key: string): string {
    if (!isValidStorageKey(key)) throw new Error('Invalid storage key');
    const path = resolve(this.root, key);
    // Defence in depth: the resolved path must stay inside the root.
    if (!path.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return path;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (contentTypeForKey(key) !== contentType) throw new Error('Content type does not match key');
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body, { flag: 'wx' });
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    if (!isValidStorageKey(key)) return null;
    const contentType = contentTypeForKey(key);
    if (!contentType) return null;
    try {
      return { body: await readFile(this.pathFor(key)), contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }
}
