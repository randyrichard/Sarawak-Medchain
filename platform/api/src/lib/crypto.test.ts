import { describe, expect, it } from 'vitest';
import { stableStringify } from './audit.js';
import {
  decryptField,
  encryptField,
  generateDoctorKeyPair,
  searchDigest,
  signHash,
  verifySignature,
} from './crypto.js';

describe('AES-256-GCM field encryption', () => {
  it('round-trips plaintext', () => {
    const secret = '990101-13-5678';
    expect(decryptField(encryptField(secret))).toBe(secret);
  });

  it('produces a different ciphertext each call (random IV)', () => {
    expect(encryptField('same')).not.toBe(encryptField('same'));
  });

  it('rejects tampered ciphertext (GCM auth tag)', () => {
    const payload = Buffer.from(encryptField('sensitive'), 'base64');
    payload[payload.length - 1] ^= 0xff;
    expect(() => decryptField(payload.toString('base64'))).toThrow();
  });
});

describe('searchDigest', () => {
  it('is case- and whitespace-insensitive (IC normalization)', () => {
    expect(searchDigest(' 990101-13-5678 ')).toBe(searchDigest('990101-13-5678'));
  });
  it('differs for different ICs', () => {
    expect(searchDigest('990101-13-5678')).not.toBe(searchDigest('990101-13-5679'));
  });
});

describe('stableStringify — audit-chain canonical JSON', () => {
  it('is key-order independent (jsonb round-trip safety)', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      stableStringify({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 })
    );
  });
  it('handles primitives, arrays and null', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify([1, 'x'])).toBe('[1,"x"]');
  });
});

describe('PKI — doctor signing keys', () => {
  const keys = generateDoctorKeyPair();
  const hash = '0x' + 'ab'.repeat(32);

  it('signs and verifies a canonical hash', () => {
    const sig = signHash(hash, keys.privateKeyEncrypted);
    expect(verifySignature(hash, sig, keys.publicKeyPem)).toBe(true);
  });

  it('rejects a signature over a different hash (forgery)', () => {
    const sig = signHash(hash, keys.privateKeyEncrypted);
    expect(verifySignature('0x' + 'cd'.repeat(32), sig, keys.publicKeyPem)).toBe(false);
  });

  it("rejects another doctor's signature (impersonation)", () => {
    const otherKeys = generateDoctorKeyPair();
    const sig = signHash(hash, otherKeys.privateKeyEncrypted);
    expect(verifySignature(hash, sig, keys.publicKeyPem)).toBe(false);
  });

  it('handles malformed public keys without throwing', () => {
    expect(verifySignature(hash, 'not-a-signature', 'not-a-key')).toBe(false);
  });
});
