import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { EngineError, type BlobStore } from '@deletewe/engine';

/**
 * Filesystem blob store with write-once semantics.
 *
 * Keys are checked against path traversal and resolved under the root: a key
 * is attacker-influenced only indirectly, but evidence paths include ids that
 * must never be able to escape the store.
 */
export class FileBlobStore implements BlobStore {
  constructor(private readonly root: string) {}

  private pathFor(key: string): string {
    const target = resolve(this.root, key);
    const rel = relative(this.root, target);
    if (rel.startsWith('..') || rel.startsWith(sep) || rel.length === 0) {
      throw new EngineError('forbidden', 'blob key escapes the store root');
    }
    return target;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const path = this.pathFor(key);
    try {
      await stat(path);
      throw new EngineError('storage_conflict', 'evidence is write-once; this key already exists');
    } catch (error) {
      if (error instanceof EngineError) throw error;
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: 'wx' });
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    try {
      return new Uint8Array(await readFile(this.pathFor(key)));
    } catch {
      return undefined;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const base = this.pathFor(prefix.endsWith('/') ? prefix.slice(0, -1) : prefix);
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else out.push(relative(this.root, full).split(sep).join('/'));
      }
    };
    await walk(base);
    return out;
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
