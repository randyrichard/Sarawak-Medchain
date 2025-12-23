import { create } from 'ipfs-http-client';
import dotenv from 'dotenv';

dotenv.config();

// Initialize IPFS client
let ipfs;

try {
  const ipfsGateway = process.env.IPFS_GATEWAY || 'http://127.0.0.1:5001';
  ipfs = create({ url: ipfsGateway });
  console.log('IPFS client initialized');
} catch (error) {
  console.error('Failed to initialize IPFS client:', error.message);
  console.log('IPFS functionality will be limited. Please ensure IPFS daemon is running.');
}

/**
 * Upload encrypted file to IPFS
 * @param {Buffer} fileBuffer - Encrypted file buffer
 * @returns {Promise<string>} IPFS hash (CID)
 */
export async function uploadToIPFS(fileBuffer) {
  try {
    if (!ipfs) {
      throw new Error('IPFS client not initialized');
    }

    const result = await ipfs.add(fileBuffer);
    console.log('File uploaded to IPFS:', result.path);
    return result.path; // This is the CID/hash
  } catch (error) {
    console.error('IPFS upload error:', error);
    throw new Error(`Failed to upload to IPFS: ${error.message}`);
  }
}

/**
 * Download file from IPFS
 * @param {string} cid - IPFS CID/hash
 * @returns {Promise<Buffer>} File buffer
 */
export async function downloadFromIPFS(cid) {
  try {
    if (!ipfs) {
      throw new Error('IPFS client not initialized');
    }

    const chunks = [];
    for await (const chunk of ipfs.cat(cid)) {
      chunks.push(chunk);
    }

    const fileBuffer = Buffer.concat(chunks);
    console.log('File downloaded from IPFS:', cid);
    return fileBuffer;
  } catch (error) {
    console.error('IPFS download error:', error);
    throw new Error(`Failed to download from IPFS: ${error.message}`);
  }
}

/**
 * Check if IPFS is available
 * @returns {Promise<boolean>}
 */
export async function isIPFSAvailable() {
  try {
    if (!ipfs) return false;
    await ipfs.version();
    return true;
  } catch (error) {
    return false;
  }
}
