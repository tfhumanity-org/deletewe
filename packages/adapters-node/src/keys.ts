import { readFile, writeFile, chmod } from 'node:fs/promises';
import { fromHex, keyToHex, randomKey, type KeyMaterial } from '@deletewe/engine';

interface KeyFile {
  readonly version: number;
  readonly masterKey: string;
  readonly indexKey: string;
}

/**
 * Key material for self-hosting, held in a 0600 file.
 *
 * Losing this file makes every encrypted record unreadable — that is the
 * correct consequence of real encryption, and it is why the quick start tells
 * self-hosters to back it up before they put anything real in. See ADR-0004.
 */
export async function loadKeyFile(path: string): Promise<KeyMaterial> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as KeyFile;
  return {
    masterKey: fromHex(parsed.masterKey),
    indexKey: fromHex(parsed.indexKey),
    version: parsed.version,
  };
}

export async function createKeyFile(path: string): Promise<KeyMaterial> {
  const material: KeyMaterial = { masterKey: randomKey(), indexKey: randomKey(), version: 1 };
  const content: KeyFile = {
    version: material.version,
    masterKey: keyToHex(material.masterKey),
    indexKey: keyToHex(material.indexKey),
  };
  await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await chmod(path, 0o600);
  return material;
}

export async function loadOrCreateKeyFile(path: string): Promise<{ keys: KeyMaterial; created: boolean }> {
  try {
    return { keys: await loadKeyFile(path), created: false };
  } catch {
    return { keys: await createKeyFile(path), created: true };
  }
}

/** Keys from the environment, for container deployments. */
export function keysFromEnv(env: Record<string, string | undefined>): KeyMaterial | undefined {
  const master = env['DELETEWE_MASTER_KEY'];
  const index = env['DELETEWE_INDEX_KEY'];
  if (!master || !index) return undefined;
  return {
    masterKey: fromHex(master),
    indexKey: fromHex(index),
    version: Number(env['DELETEWE_KEY_VERSION'] ?? '1'),
  };
}
