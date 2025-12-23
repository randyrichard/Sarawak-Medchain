import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Upload a medical record file
 * @param {File} file - PDF file
 * @param {string} patientAddress - Patient's Ethereum address
 * @returns {Promise<{ipfsHash: string, encryptionKey: string}>}
 */
export async function uploadMedicalRecord(file, patientAddress) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('patientAddress', patientAddress);

  const response = await api.post('/api/upload/medical-record', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
}

/**
 * Retrieve and decrypt a medical record
 * @param {string} ipfsHash - IPFS CID
 * @param {string} encryptionKey - Encryption key (hex)
 * @returns {Promise<Blob>} PDF file blob
 */
export async function retrieveMedicalRecord(ipfsHash, encryptionKey) {
  const response = await api.post('/api/upload/retrieve', {
    ipfsHash,
    encryptionKey,
  }, {
    responseType: 'blob',
  });

  return response.data;
}

/**
 * Check backend and IPFS status
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
