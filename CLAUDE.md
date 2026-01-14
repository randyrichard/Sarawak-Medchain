# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sarawak MedChain is a patient-controlled medical records MVP using blockchain for cryptographic access enforcement. Medical documents are encrypted and stored on IPFS; only IPFS hashes are stored on-chain.

## Development Commands

### Smart Contract (Root Directory)
```bash
npm install                  # Install root dependencies
npx hardhat compile          # Compile Solidity contracts
npx hardhat test             # Run all 31 smart contract tests
npx hardhat node             # Start local blockchain (chainId 1337)
node scripts/deploy.cjs      # Deploy contract and verify test doctors
```

### Backend (backend/)
```bash
cd backend && npm install    # Install backend dependencies
npm start                    # Start Express server (port 3001)
npm run dev                  # Start with --watch for auto-reload
```

### Frontend (frontend/)
```bash
cd frontend && npm install   # Install frontend dependencies
npm run dev                  # Start Vite dev server
npm run build                # Production build
npm run lint                 # ESLint check
```

### IPFS
```bash
ipfs daemon                  # Must be running for file uploads
```

## Architecture

```
Frontend (React/Vite)  ──MetaMask──▶  Smart Contract (Hardhat)
       │                                      │
       │ API calls                   stores IPFS hashes only
       ▼
Backend (Express)  ──────────────▶  IPFS (encrypted files)
```

### Three-Layer Data Flow
1. **Frontend**: React app connects to Ethereum via MetaMask/ethers.js. Contract ABI is at `frontend/src/SarawakMedMVP.json`
2. **Backend**: Express server handles file upload, AES-256-GCM encryption (`backend/utils/encryption.js`), and IPFS storage (`backend/utils/ipfs.js`)
3. **Smart Contract**: `contracts/SarawakMedMVP.sol` enforces role-based access control (Admin, Doctor, Patient) and emits audit events

### Roles
- **Admin**: Verifies/removes doctors (simulates Sarawak Medical Council)
- **Doctor**: Writes records for patients (must be verified)
- **Patient**: Grants/revokes read access to specific doctors

### Contract Key Functions
- `addVerifiedDoctor(address)` - Admin only
- `writeRecord(patientAddress, ipfsHash)` - Verified doctor only
- `grantAccess(doctorAddress)` / `revokeAccess(doctorAddress)` - Patient only
- `readRecords(patientAddress)` - Requires patient permission or self
- `getMyRecords()` - Patient's own records

## Environment Configuration

**Root `.env`**: IPFS gateway, contract address, RPC URLs
**Frontend `.env`**: `VITE_CONTRACT_ADDRESS`, `VITE_API_BASE_URL`

After deploying, update `frontend/.env` with the contract address from deploy script output.

## Running the Full Stack

1. Start IPFS: `ipfs daemon`
2. Start Hardhat node: `npx hardhat node`
3. Deploy contract: `node scripts/deploy.cjs` (note the contract address)
4. Update `frontend/.env` with contract address
5. Start backend: `cd backend && npm start`
6. Start frontend: `cd frontend && npm run dev`
7. Import test account private keys from `hardhatkeys.txt` into MetaMask
