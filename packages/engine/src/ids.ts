/**
 * ULIDs: lexicographically sortable, 128-bit, generated without coordination.
 * Crockford base32, 10 chars of millisecond timestamp + 16 chars of randomness.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(now: number, length: number): string {
  let out = '';
  let t = now;
  for (let i = length - 1; i >= 0; i--) {
    out = ALPHABET[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function encodeRandom(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % 32];
  return out;
}

export function newId(now: number = Date.now()): string {
  return encodeTime(now, 10) + encodeRandom(16);
}

/** High-entropy, URL-safe token for inbound mail addresses and task links. */
export function newToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let out = '';
  for (const b of buf) out += ALPHABET[b % 32];
  return out.toLowerCase();
}
