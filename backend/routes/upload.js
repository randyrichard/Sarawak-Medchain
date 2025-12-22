import express from 'express';
import multer from 'multer';
import { encryptFile, prepareForIPFS, extractFromIPFS, decryptFile } from '../utils/encryption.js';
import { uploadToIPFS, downloadFromIPFS, isIPFSAvailable } from '../utils/ipfs.js';

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
 * POST /api/upload/medical-record
 * Upload and encrypt a medical record
 *
 * Body (multipart/form-data):
 * - file: PDF file
 * - patientAddress: Ethereum address of the patient
 *
 * Response:
 * - ipfsHash: Hash of encrypted file on IPFS
 * - encryptionKey: Key to decrypt the file (should be stored securely by patient)
 */
router.post('/medical-record', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.body.patientAddress) {
      return res.status(400).json({ error: 'Patient address is required' });
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
    console.log(`Encrypting file: ${req.file.originalname} (${fileBuffer.length} bytes)`);
    const { encryptedData, key, iv, authTag } = encryptFile(fileBuffer);

    // Step 2: Prepare for IPFS (combine metadata with encrypted data)
    const ipfsBuffer = prepareForIPFS(encryptedData, iv, authTag);

    // Step 3: Upload to IPFS
    console.log('Uploading to IPFS...');
    const ipfsHash = await uploadToIPFS(ipfsBuffer);

    // Step 4: Return IPFS hash and encryption key
    // CRITICAL: In MVP, we return the key to the caller
    // In production, implement proper key management
    res.json({
      success: true,
      ipfsHash: ipfsHash,
      encryptionKey: key,
      message: 'File encrypted and uploaded successfully',
      metadata: {
        originalName: req.file.originalname,
        size: req.file.size,
        patientAddress: req.body.patientAddress
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
 *
 * Body:
 * - ipfsHash: IPFS CID
 * - encryptionKey: Encryption key (hex)
 *
 * Response: Decrypted PDF file
 */
router.post('/retrieve', async (req, res) => {
  try {
    const { ipfsHash, encryptionKey } = req.body;

    if (!ipfsHash || !encryptionKey) {
      return res.status(400).json({
        error: 'Missing parameters',
        message: 'ipfsHash and encryptionKey are required'
      });
    }

    // Check IPFS availability
    const ipfsReady = await isIPFSAvailable();
    if (!ipfsReady) {
      return res.status(503).json({
        error: 'IPFS service unavailable'
      });
    }

    // Step 1: Download from IPFS
    console.log(`Downloading from IPFS: ${ipfsHash}`);
    const ipfsBuffer = await downloadFromIPFS(ipfsHash);

    // Step 2: Extract metadata and encrypted data
    const { metadata, encryptedData } = extractFromIPFS(ipfsBuffer);

    // Step 3: Decrypt the file
    console.log('Decrypting file...');
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
 * Check backend and IPFS status
 */
router.get('/status', async (req, res) => {
  const ipfsAvailable = await isIPFSAvailable();
  res.json({
    backend: 'ok',
    ipfs: ipfsAvailable ? 'connected' : 'disconnected',
    message: ipfsAvailable
      ? 'All systems operational'
      : 'IPFS not available. Please start IPFS daemon.'
  });
});

export default router;
