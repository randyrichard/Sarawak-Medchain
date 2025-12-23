# Sarawak MedChain MVP

## Patient-Controlled Medical Records Using Blockchain

[![Smart Contract Tests](https://img.shields.io/badge/tests-31%20passing-success)]()
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-blue)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

## Overview

Sarawak MedChain is a Minimum Viable Product (MVP) that demonstrates a patient-controlled medical records system using blockchain technology for cryptographic access enforcement.

### Core Principle

**Trust through code, not policy.**

This MVP proves that:
1. ✓ Only verified doctors can write medical records
2. ✓ Patients explicitly control who can read their records
3. ✓ Access revocation is enforced by code, not policy
4. ✓ Every write and access attempt is auditable

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Sarawak MedChain MVP                     │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐        ┌──────────────┐
│   Frontend   │────────▶│   Backend    │───────▶│     IPFS     │
│              │         │              │        │              │
│  React +     │         │  Node.js +   │        │ Decentralized│
│  Ethers.js   │         │  Encryption  │        │   Storage    │
│  MetaMask    │         │  (AES-256)   │        │              │
└──────┬───────┘         └──────────────┘        └──────────────┘
       │
       │ Smart Contract Calls
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│               Ethereum Blockchain (Local/Testnet)             │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │          SarawakMedMVP Smart Contract               │    │
│  │                                                      │    │
│  │  • Role Management (Admin, Doctor, Patient)         │    │
│  │  • Medical Records Registry (IPFS Hashes Only)      │    │
│  │  • Access Control (Grant/Revoke Permissions)        │    │
│  │  • Audit Events (All Actions Logged)                │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Smart Contract
- **Solidity 0.8.24**: Smart contract language
- **Hardhat**: Development environment
- **Chai + Ethers**: Testing framework

### Backend
- **Node.js + Express**: API server
- **IPFS HTTP Client**: Decentralized storage
- **Crypto (Node.js)**: AES-256-GCM encryption
- **Multer**: File upload handling

### Frontend
- **React + Vite**: Modern frontend framework
- **Ethers.js**: Ethereum library
- **React Router**: Navigation
- **Axios**: HTTP client

## Quick Start

### Prerequisites

- Node.js v18+
- MetaMask browser extension
- IPFS Desktop or CLI

### Installation

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..

# Start IPFS (in separate terminal)
ipfs daemon

# Start Hardhat local blockchain (in separate terminal)
npx hardhat node

# Deploy smart contract (in separate terminal)
node scripts/deploy.cjs

# Update frontend/.env with deployed contract address

# Start backend (in separate terminal)
cd backend && npm start

# Start frontend (in separate terminal)
cd frontend && npm run dev
```

**For detailed setup instructions:**
- **Windows Users (Git Bash)**: [SETUP_WINDOWS.md](./SETUP_WINDOWS.md)
- **Linux/macOS Users**: [SETUP.md](./SETUP.md)
- **Comprehensive Guide**: [MVP_SETUP_GUIDE.md](./MVP_SETUP_GUIDE.md)

## Testing

Run the comprehensive test suite:

```bash
npx hardhat test
```

Expected output: **31 passing tests**

## MVP Validation Checklist

| Test | Description | Status |
|------|-------------|--------|
| ✓ | An unverified doctor cannot write a record | PASS |
| ✓ | A doctor without permission cannot read a record | PASS |
| ✓ | Patient revokes access and it works immediately | PASS |
| ✓ | All actions are visible in blockchain event logs | PASS |

## Documentation

### Setup Guides
- [SETUP_WINDOWS.md](./SETUP_WINDOWS.md) - Complete setup for Windows (Git Bash)
- [SETUP.md](./SETUP.md) - Complete setup for Linux/macOS
- [MVP_SETUP_GUIDE.md](./MVP_SETUP_GUIDE.md) - Comprehensive setup and testing instructions
- [QUICKSTART.md](./QUICKSTART.md) - Quick reference guide

### Technical Documentation
- [Backend README](./backend/README.md) - Backend API documentation
- [Build Guide](./Sarawak_MedChain_MVP_Build_Guide.txt) - Original MVP requirements

## Security Features

1. **Role-Based Access Control**: Only verified doctors can write records
2. **Patient-Controlled Permissions**: Patients grant/revoke access explicitly
3. **AES-256-GCM Encryption**: Industry-standard file encryption
4. **Immutable Audit Trail**: All actions logged on blockchain
5. **Immediate Enforcement**: Access changes take effect instantly

## Scope Limitations

### What this MVP IS:
- ✓ Proof of cryptographic access control
- ✓ Demonstration of patient sovereignty
- ✓ Working end-to-end system

### What this MVP is NOT:
- ✗ Production-ready system
- ✗ Including payments or tokens
- ✗ Mobile application
- ✗ AI diagnostics or insurance logic

## License

MIT License

---

**"This MVP is not a product. It is a proof of trust."**
