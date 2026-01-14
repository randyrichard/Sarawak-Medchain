import axios from 'axios';
import { ethers } from 'ethers';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Sign a message with the user's wallet for authentication
 * @param {string} action - The action being performed (upload, retrieve)
 * @returns {Promise<{address: string, signature: string, timestamp: number}>}
 */
async function getWalletAuth(action) {
  if (!window.ethereum) {
    throw new Error('MetaMask not installed');
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  // Create message with timestamp
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `SarawakMedChain:${action}:${timestamp}`;

  // Sign the message
  const signature = await signer.signMessage(message);

  return { address, signature, timestamp, action };
}

/**
 * Create auth headers for API requests
 * @param {string} action - The action being performed
 * @returns {Promise<object>} Headers object
 */
async function createAuthHeaders(action) {
  const auth = await getWalletAuth(action);
  return {
    'x-wallet-address': auth.address,
    'x-wallet-signature': auth.signature,
    'x-wallet-timestamp': auth.timestamp.toString(),
    'x-wallet-action': auth.action,
  };
}

/**
 * Upload a medical record file
 * @param {File} file - PDF file
 * @param {string} patientAddress - Patient's Ethereum address
 * @returns {Promise<{ipfsHash: string, encryptionKey: string}>}
 */
export async function uploadMedicalRecord(file, patientAddress) {
  // Get wallet authentication
  const authHeaders = await createAuthHeaders('upload');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('patientAddress', patientAddress);

  const response = await api.post('/api/upload/medical-record', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      ...authHeaders,
    },
  });

  return response.data;
}

/**
 * Retrieve and decrypt a medical record
 * @param {string} ipfsHash - IPFS CID
 * @param {string} encryptionKey - Encryption key (hex)
 * @param {string} patientAddress - Patient's address (for permission verification)
 * @returns {Promise<Blob>} PDF file blob
 */
export async function retrieveMedicalRecord(ipfsHash, encryptionKey, patientAddress) {
  // Get wallet authentication
  const authHeaders = await createAuthHeaders('retrieve');

  const response = await api.post('/api/upload/retrieve', {
    ipfsHash,
    encryptionKey,
    patientAddress,
  }, {
    headers: authHeaders,
    responseType: 'blob',
  });

  return response.data;
}

/**
 * Check backend and IPFS status (no auth required)
 * @returns {Promise<{backend: string, ipfs: string}>}
 */
export async function checkStatus() {
  const response = await api.get('/api/upload/status');
  return response.data;
}

/**
 * Open PDF in new tab
 */
export function openPDFInNewTab(blob) {
  const url = window.URL.createObjectURL(blob);
  window.open(url, '_blank');
}

export default api;
