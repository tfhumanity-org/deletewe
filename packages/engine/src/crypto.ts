/**
 * Envelope encryption. See docs/adr/0004-envelope-encryption.md.
 *
 *   master key (secret binding / key file, versioned)
 *     wraps a per-member DEK (AES-256-GCM)
 *       encrypts every PII column and evidence blob for that member
 *
 * Uses WebCrypto only, which exists on Workers and Node alike, so there is one
 * implementation rather than one per platform.
 */

const VERSION = 1;
const IV_BYTES = 12;

export interface KeyMaterial {
  /** 32 bytes. Wraps member DEKs. */
  readonly masterKey: Uint8Array;
  /** 32 bytes, stored separately from the master key. Keys blind indexes. */
  readonly indexKey: Uint8Array;
  readonly version: number;
}

export interface SealedValue {
  readonly bytes: Uint8Array;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) throw new Error('hex string must have even length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bufferSource(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function importHmacKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bufferSource(raw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/**
 * Normalisation for blind indexes. Equality after normalisation is the only
 * query this scheme supports: no ordering, no ranges, no prefix search.
 */
export function normaliseForIndex(value: string): string {
  return value.trim().toLowerCase().normalize('NFKC').replace(/\s+/g, ' ');
}

export class CryptoService {
  constructor(private readonly keys: KeyMaterial) {
    if (keys.masterKey.length !== 32) throw new Error('master key must be 32 bytes');
    if (keys.indexKey.length !== 32) throw new Error('index key must be 32 bytes');
  }

  get keyVersion(): number {
    return this.keys.version;
  }

  generateDek(): Uint8Array {
    const dek = new Uint8Array(32);
    crypto.getRandomValues(dek);
    return dek;
  }

  /** Wraps a member DEK under the master key, with the key version as AAD. */
  async wrapDek(dek: Uint8Array): Promise<Uint8Array> {
    return this.seal(this.keys.masterKey, `dek:v${this.keys.version}`, dek);
  }

  async unwrapDek(wrapped: Uint8Array): Promise<Uint8Array> {
    return this.open(this.keys.masterKey, `dek:v${this.keys.version}`, wrapped);
  }

  /**
   * Encrypts a column value. `memberId` is bound as additional authenticated
   * data, so a ciphertext cannot be transplanted into another member's row.
   */
  async encryptField(dek: Uint8Array, memberId: string, plaintext: string): Promise<Uint8Array> {
    return this.seal(dek, memberId, enc.encode(plaintext));
  }

  async decryptField(dek: Uint8Array, memberId: string, ciphertext: Uint8Array): Promise<string> {
    return dec.decode(await this.open(dek, memberId, ciphertext));
  }

  async encryptBytes(dek: Uint8Array, memberId: string, bytes: Uint8Array): Promise<Uint8Array> {
    return this.seal(dek, memberId, bytes);
  }

  async decryptBytes(dek: Uint8Array, memberId: string, ciphertext: Uint8Array): Promise<Uint8Array> {
    return this.open(dek, memberId, ciphertext);
  }

  /**
   * HMAC-SHA256 over `kind:normalised`, truncated to 128 bits. Supports
   * equality lookup (notably login by email) without decryption.
   */
  async blindIndex(kind: string, value: string): Promise<string> {
    const key = await importHmacKey(this.keys.indexKey);
    const sig = await crypto.subtle.sign('HMAC', key, bufferSource(enc.encode(`${kind}:${normaliseForIndex(value)}`)));
    return toHex(new Uint8Array(sig).slice(0, 16));
  }

  private async seal(key: Uint8Array, aad: string, plaintext: Uint8Array): Promise<Uint8Array> {
    const iv = new Uint8Array(IV_BYTES);
    crypto.getRandomValues(iv);
    const cryptoKey = await importAesKey(key);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: bufferSource(iv), additionalData: bufferSource(enc.encode(aad)) },
      cryptoKey,
      bufferSource(plaintext),
    );
    return concat(new Uint8Array([VERSION, this.keys.version]), iv, new Uint8Array(ct));
  }

  private async open(key: Uint8Array, aad: string, sealed: Uint8Array): Promise<Uint8Array> {
    if (sealed.length < 2 + IV_BYTES + 16) throw new Error('ciphertext too short');
    const version = sealed[0];
    if (version !== VERSION) throw new Error(`unsupported ciphertext version ${String(version)}`);
    const iv = sealed.slice(2, 2 + IV_BYTES);
    const body = sealed.slice(2 + IV_BYTES);
    const cryptoKey = await importAesKey(key);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bufferSource(iv), additionalData: bufferSource(enc.encode(aad)) },
      cryptoKey,
      bufferSource(body),
    );
    return new Uint8Array(pt);
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bufferSource(bytes))));
}

export async function sha256Text(text: string): Promise<string> {
  return sha256Hex(enc.encode(text));
}

export function randomKey(): Uint8Array {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  return k;
}

export function keyToHex(key: Uint8Array): string {
  return toHex(key);
}

/** Password hashing via PBKDF2-SHA256; available on Workers and Node alike. */
const PBKDF2_ITERATIONS = 310_000;

export async function hashPassword(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex ? fromHex(saltHex) : (() => { const s = new Uint8Array(16); crypto.getRandomValues(s); return s; })();
  const base = await crypto.subtle.importKey('raw', bufferSource(enc.encode(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: bufferSource(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const computed = await hashPassword(password, parts[2]);
  return timingSafeEqualHex(computed.split('$')[3] ?? '', parts[3] ?? '');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
