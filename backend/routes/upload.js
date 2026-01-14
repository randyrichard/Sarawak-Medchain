import express from 'express';
import multer from 'multer';
import { encryptFile, prepareForIPFS, extractFromIPFS, decryptFile } from '../utils/encryption.js';
import { uploadToIPFS, downloadFromIPFS, isIPFSAvailable } from '../utils/ipfs.js';
import { verifyWalletSignature, getAuthMessage } from '../middleware/auth.js';
import { verifyRecordAccess, isVerifiedDoctor } from '../utils/contract.js';

const router = express.Router();

// Configure multer for memory storage (we don't save files to disk)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for MVP
  },
  fileFilter: (req, file, cb) => {
    // Only accept PDF files for MVP
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

/**
 * GET /api/upload/auth-message
 * Get the message format for wallet signing
 * Query params: action (upload, retrieve)
 */
router.get('/auth-message', (req, res) => {
  const action = req.query.action || 'retrieve';
  const authData = getAuthMessage(action);
  res.json(authData);
});

/**
 * POST /api/upload/medical-record
 * Upload and encrypt a medical record
 * REQUIRES: Wallet authentication + Verified doctor status
 *
 * Headers:
 * - x-wallet-address: Doctor's wallet address
 * - x-wallet-signature: Signed message
 * - x-wallet-timestamp: Timestamp used in signature
 * - x-wallet-action: "upload"
 *
 * Body (multipart/form-data):
 * - file: PDF file
 * - patientAddress: Ethereum address of the patient
 *
 * Response:
 * - ipfsHash: Hash of encrypted file on IPFS
 * - encryptionKey: Key to decrypt the file (should be stored securely by patient)
 */
router.post('/medical-record', verifyWalletSignature, upload.single('file'), async (req, res) => {
  try {
    // Verify the action matches
    if (req.authAction !== 'upload') {
      return res.status(403).json({
        error: 'Invalid action',
        message: 'Signature must be for "upload" action'
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.body.patientAddress) {
      return res.status(400).json({ error: 'Patient address is required' });
    }

    // Verify the caller is a verified doctor on blockchain
    const isDoctor = await isVerifiedDoctor(req.walletAddress);
    if (!isDoctor) {
      return res.status(403).json({
        error: 'Unauthorized',
        message: 'Only verified doctors can upload medical records'
      });
    }

    // Check IPFS availability
    const ipfsReady = await isIPFSAvailable();
    if (!ipfsReady) {
      return res.status(503).json({
        error: 'IPFS service unavailable',
        message: 'Please ensure IPFS daemon is running on the configured endpoint'
      });
    }

    const fileBuffer = req.file.buffer;

    // Step 1: Encrypt the file
    console.log(`[${req.walletAddress}] Encrypting file: ${req.file.originalname} (${fileBuffer.length} bytes)`);
    const { encryptedData, key, iv, authTag } = encryptFile(fileBuffer);

    // Step 2: Prepare for IPFS (combine metadata with encrypted data)
    const ipfsBuffer = prepareForIPFS(encryptedData, iv, authTag);

    // Step 3: Upload to IPFS
    console.log(`[${req.walletAddress}] Uploading to IPFS...`);
    const ipfsHash = await uploadToIPFS(ipfsBuffer);

    // Step 4: Return IPFS hash and encryption key
    // NOTE: In production, use proper key derivation instead of returning the key
    res.json({
      success: true,
      ipfsHash: ipfsHash,
      encryptionKey: key,
      message: 'File encrypted and uploaded successfully',
      metadata: {
        originalName: req.file.originalname,
        size: req.file.size,
        patientAddress: req.body.patientAddress,
        doctorAddress: req.walletAddress
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: error.message
    });
  }
});

/**
 * POST /api/upload/retrieve
 * Retrieve and decrypt a medical record
 * REQUIRES: Wallet authentication + Blockchain access permission
 *
 * Headers:
 * - x-wallet-address: Requester's wallet address
 * - x-wallet-signature: Signed message
 * - x-wallet-timestamp: Timestamp used in signature
 * - x-wallet-action: "retrieve"
 *
 * Body:
 * - ipfsHash: IPFS CID
 * - encryptionKey: Encryption key (hex)
 * - patientAddress: Patient whose record is being accessed
 *
 * Response: Decrypted PDF file
 */
router.post('/retrieve', verifyWalletSignature, async (req, res) => {
  try {
    // Verify the action matches
    if (req.authAction !== 'retrieve') {
      return res.status(403).json({
        error: 'Invalid action',
        message: 'Signature must be for "retrieve" action'
      });
    }

    const { ipfsHash, encryptionKey, patientAddress } = req.body;

    if (!ipfsHash || !encryptionKey) {
      return res.status(400).json({
        error: 'Missing parameters',
        message: 'ipfsHash and encryptionKey are required'
      });
    }

    if (!patientAddress) {
      return res.status(400).json({
        error: 'Missing patientAddress',
        message: 'patientAddress is required to verify access permission'
      });
    }

    // CRITICAL: Verify blockchain access permission
    console.log(`[${req.walletAddress}] Verifying access to patient ${patientAddress} records...`);
    const accessCheck = await verifyRecordAccess(req.walletAddress, patientAddress);

    if (!accessCheck.authorized) {
      console.log(`[${req.walletAddress}] Access DENIED: ${accessCheck.reason}`);
      return res.status(403).json({
        error: 'Access denied',
        message: accessCheck.reason
      });
    }

    console.log(`[${req.walletAddress}] Access GRANTED: ${accessCheck.reason}`);

    // Check IPFS availability
    const ipfsReady = await isIPFSAvailable();
    if (!ipfsReady) {
      return res.status(503).json({
        error: 'IPFS service unavailable'
      });
    }

    // Step 1: Download from IPFS
    console.log(`[${req.walletAddress}] Downloading from IPFS: ${ipfsHash}`);
    const ipfsBuffer = await downloadFromIPFS(ipfsHash);

    // Step 2: Extract metadata and encrypted data
    const { metadata, encryptedData } = extractFromIPFS(ipfsBuffer);

    // Step 3: Decrypt the file
    console.log(`[${req.walletAddress}] Decrypting file...`);
    const decryptedBuffer = decryptFile(
      encryptedData,
      encryptionKey,
      metadata.iv,
      metadata.authTag
    );

    // Step 4: Return the decrypted file
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="medical-record.pdf"'
    });
    res.send(decryptedBuffer);

  } catch (error) {
    console.error('Retrieve error:', error);
    res.status(500).json({
      error: 'Retrieval failed',
      message: error.message
    });
  }
});

/**
 * GET /api/upload/status
 * Check backend and IPFS status (no auth required)
 */
router.get('/status', async (req, res) => {
  const ipfsAvailable = await isIPFSAvailable();
  res.json({
    backend: 'ok',
    ipfs: ipfsAvailable ? 'connected' : 'disconnected',
    authRequired: true,
    message: ipfsAvailable
      ? 'All systems operational. Wallet authentication required for uploads/retrieval.'
      : 'IPFS not available. Please start IPFS daemon.'
  });
});

export default router;
