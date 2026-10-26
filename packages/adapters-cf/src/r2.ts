import { EngineError, type BlobStore } from '@deletewe/engine';
import type { R2Bucket } from './cf-types.ts';

/** Evidence storage on R2, with the same write-once rule as the file store. */
export class R2BlobStore implements BlobStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, bytes: Uint8Array, contentType = 'application/octet-stream'): Promise<void> {
    if (await this.bucket.head(key)) {
      throw new EngineError('storage_conflict', 'evidence is write-once; this key already exists');
    }
    await this.bucket.put(key, bytes, { httpMetadata: { contentType } });
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    const object = await this.bucket.get(key);
    return object ? new Uint8Array(await object.arrayBuffer()) : undefined;
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix, cursor, limit: 1000 });
      keys.push(...page.objects.map((o) => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return keys;
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}
