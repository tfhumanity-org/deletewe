import { describe, expect, it } from 'vitest';
import { CryptoService, hashPassword, normaliseForIndex, randomKey, sha256Text, verifyPassword } from './crypto.ts';

const svc = () => new CryptoService({ masterKey: randomKey(), indexKey: randomKey(), version: 1 });

describe('CryptoService', () => {
  it('round-trips a field', async () => {
    const c = svc();
    const dek = c.generateDek();
    const sealed = await c.encryptField(dek, 'member-1', '221B Baker Street');
    expect(await c.decryptField(dek, 'member-1', sealed)).toBe('221B Baker Street');
  });

  it('produces different ciphertext for the same plaintext', async () => {
    const c = svc();
    const dek = c.generateDek();
    const a = await c.encryptField(dek, 'm', 'same');
    const b = await c.encryptField(dek, 'm', 'same');
    expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'));
  });

  // The AAD binding: a stolen ciphertext cannot be moved into another member's
  // row to make it decrypt. docs/adr/0004.
  it('refuses to decrypt under a different member id', async () => {
    const c = svc();
    const dek = c.generateDek();
    const sealed = await c.encryptField(dek, 'member-1', 'secret');
    await expect(c.decryptField(dek, 'member-2', sealed)).rejects.toThrow();
  });

  it('refuses to decrypt with the wrong DEK', async () => {
    const c = svc();
    const sealed = await c.encryptField(c.generateDek(), 'm', 'secret');
    await expect(c.decryptField(c.generateDek(), 'm', sealed)).rejects.toThrow();
  });

  it('detects tampering', async () => {
    const c = svc();
    const dek = c.generateDek();
    const sealed = await c.encryptField(dek, 'm', 'secret');
    sealed[sealed.length - 1] = (sealed[sealed.length - 1] ?? 0) ^ 0xff;
    await expect(c.decryptField(dek, 'm', sealed)).rejects.toThrow();
  });

  it('wraps and unwraps a DEK', async () => {
    const c = svc();
    const dek = c.generateDek();
    const unwrapped = await c.unwrapDek(await c.wrapDek(dek));
    expect(Buffer.from(unwrapped)).toEqual(Buffer.from(dek));
  });

  it('blind-indexes deterministically and case-insensitively', async () => {
    const c = svc();
    const a = await c.blindIndex('email', 'Ada@Example.com');
    const b = await c.blindIndex('email', ' ada@example.com ');
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  it('separates blind indexes by kind', async () => {
    const c = svc();
    expect(await c.blindIndex('email', 'x@y.z')).not.toBe(await c.blindIndex('alias', 'x@y.z'));
  });

  it('uses independent index keys across instances', async () => {
    expect(await svc().blindIndex('email', 'a@b.c')).not.toBe(await svc().blindIndex('email', 'a@b.c'));
  });

  it('rejects short keys', () => {
    expect(() => new CryptoService({ masterKey: new Uint8Array(16), indexKey: randomKey(), version: 1 })).toThrow();
  });
});

describe('normaliseForIndex', () => {
  it('collapses case, whitespace and unicode form', () => {
    expect(normaliseForIndex('  Ada   LOVELACE ')).toBe('ada lovelace');
  });
});

describe('passwords', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
    expect(await verifyPassword('wrong', stored)).toBe(false);
  });

  it('salts, so identical passwords hash differently', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });
});

describe('sha256Text', () => {
  it('matches the known digest of the empty string', async () => {
    expect(await sha256Text('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
