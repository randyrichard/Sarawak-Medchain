import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign as edSign,
  verify as edVerify,
  createHash,
} from 'node:crypto';
import { config } from '../config.js';

const KEY = Buffer.from(config.dataEncryptionKey, 'hex');

/** AES-256-GCM field-level encryption. Output: base64(iv | tag | ciphertext). */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decryptField(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Keyed digest for exact-match search over encrypted fields (e.g. IC number). */
export function searchDigest(value: string): string {
  return createHmac('sha256', config.searchHmacKey)
    .update(value.trim().toUpperCase())
    .digest('hex');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// ─── PKI: per-doctor Ed25519 signing keys ───────────────────────────────────

export interface DoctorKeyPair {
  publicKeyPem: string;
  privateKeyEncrypted: string;
}

export function generateDoctorKeyPair(): DoctorKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyEncrypted: encryptField(
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    ),
  };
}

/** Sign a canonical MC hash (0x-hex string) with the doctor's private key. */
export function signHash(canonicalHash: string, privateKeyEncrypted: string): string {
  const pem = decryptField(privateKeyEncrypted);
  const key = createPrivateKey(pem);
  return edSign(null, Buffer.from(canonicalHash, 'utf8'), key).toString('base64');
}

export function verifySignature(
  canonicalHash: string,
  signatureB64: string,
  publicKeyPem: string
): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return edVerify(
      null,
      Buffer.from(canonicalHash, 'utf8'),
      key,
      Buffer.from(signatureB64, 'base64')
    );
  } catch {
    return false;
  }
}

/** Opaque random tokens (refresh tokens, share links, API keys). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
