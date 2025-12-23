# Sarawak MedChain Backend

## Overview
Node.js backend for handling medical record encryption and IPFS storage.

## Features
- AES-256-GCM file encryption
- IPFS integration for decentralized storage
- PDF file upload support
- Secure file retrieval with decryption

## Setup

### 1. Install IPFS
```bash
# Download and install IPFS Desktop or CLI from:
# https://docs.ipfs.tech/install/

# Start IPFS daemon
ipfs daemon
```

### 2. Install Dependencies
```bash
cd backend
npm install
```

### 3. Configure Environment
```bash
cp ../.env.example ../.env
# Edit .env with your configuration
```

### 4. Start Server
```bash
npm start
```

## API Endpoints

### POST /api/upload/medical-record
Upload and encrypt a medical record.

**Request:**
- Content-Type: multipart/form-data
- Body:
  - file: PDF file
  - patientAddress: Ethereum address

**Response:**
```json
{
  "success": true,
  "ipfsHash": "QmXxx...",
  "encryptionKey": "hex-key",
  "message": "File encrypted and uploaded successfully"
}
```

### POST /api/upload/retrieve
Retrieve and decrypt a medical record.

**Request:**
```json
{
  "ipfsHash": "QmXxx...",
  "encryptionKey": "hex-key"
}
```

**Response:** PDF file (application/pdf)

### GET /api/upload/status
Check backend and IPFS status.

## Security Notes

### MVP Limitations
- Encryption keys are returned to the caller
- Keys should be stored securely by the patient
- No server-side key storage

### Production Recommendations
- Implement proper key management system
- Use HSM or key vault for sensitive keys
- Implement key escrow mechanism
- Add rate limiting
- Add authentication middleware
- Implement audit logging

## Architecture

```
Client → Backend → Encryption → IPFS
                ↓
         Smart Contract (hash only)
```

1. Client uploads PDF
2. Backend encrypts with AES-256-GCM
3. Encrypted file → IPFS
4. IPFS hash → Smart contract
5. Patient controls access via blockchain
