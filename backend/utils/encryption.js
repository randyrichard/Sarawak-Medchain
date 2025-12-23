import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const AUTH_TAG_LENGTH = 16;

/**
 * Generate a random encryption key
 * @returns {string} Hex-encoded encryption key
 */
export function generateEncryptionKey() {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Encrypt file buffer using AES-256-GCM
 * @param {Buffer} fileBuffer - The file data to encrypt
 * @param {string} keyHex - Hex-encoded encryption key (optional, generates if not provided)
 * @returns {Object} { encryptedData: Buffer, key: string, iv: string, authTag: string }
 */
export function encryptFile(fileBuffer, keyHex = null) {
  try {
    // Generate key if not provided
    const key = keyHex ? Buffer.from(keyHex, 'hex') : crypto.randomBytes(KEY_LENGTH);

    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt data
    const encrypted = Buffer.concat([
      cipher.update(fileBuffer),
      cipher.final()
    ]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      encryptedData: encrypted,
      key: key.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('File encryption failed');
  }
}

/**
 * Decrypt file buffer using AES-256-GCM
 * @param {Buffer} encryptedBuffer - The encrypted file data
 * @param {string} keyHex - Hex-encoded encryption key
 * @param {string} ivHex - Hex-encoded initialization vector
 * @param {string} authTagHex - Hex-encoded authentication tag
 * @returns {Buffer} Decrypted file buffer
 */
export function decryptFile(encryptedBuffer, keyHex, ivHex, authTagHex) {
  try {
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt data
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final()
    ]);

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('File decryption failed');
  }
}

/**
 * Combine encrypted data with metadata for IPFS storage
 * @param {Buffer} encryptedData - Encrypted file data
 * @param {string} iv - IV hex string
 * @param {string} authTag - Auth tag hex string
 * @returns {Buffer} Combined buffer for IPFS
 */
export function prepareForIPFS(encryptedData, iv, authTag) {
  // Create metadata JSON
  const metadata = {
    algorithm: ALGORITHM,
    iv: iv,
    authTag: authTag
  };

  const metadataBuffer = Buffer.from(JSON.stringify(metadata));
  const metadataLength = Buffer.alloc(4);
  metadataLength.writeUInt32BE(metadataBuffer.length);

  // Combine: [metadata length (4 bytes)][metadata][encrypted data]
  return Buffer.concat([metadataLength, metadataBuffer, encryptedData]);
}

/**
 * Extract metadata and encrypted data from IPFS buffer
 * @param {Buffer} ipfsBuffer - Combined buffer from IPFS
 * @returns {Object} { metadata, encryptedData }
 */
export function extractFromIPFS(ipfsBuffer) {
  const metadataLength = ipfsBuffer.readUInt32BE(0);
  const metadataBuffer = ipfsBuffer.slice(4, 4 + metadataLength);
  const encryptedData = ipfsBuffer.slice(4 + metadataLength);

  const metadata = JSON.parse(metadataBuffer.toString());

  return {
    metadata,
    encryptedData
  };
}
