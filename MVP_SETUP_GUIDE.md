# Sarawak MedChain MVP - Complete Setup Guide

## Overview

This MVP demonstrates a patient-controlled medical records system using blockchain technology for access control and IPFS for encrypted file storage.

## System Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│     IPFS     │
│  (React +    │     │  (Node.js +  │     │  (Storage)   │
│   Ethers)    │     │  Encryption) │     │              │
└──────┬───────┘     └──────────────┘     └──────────────┘
       │
       │ (Smart Contract Calls)
       ▼
┌──────────────────────────────┐
│  Hardhat Local Network or    │
│  Ethereum Testnet            │
│  (SarawakMedMVP Contract)    │
└──────────────────────────────┘
```

## Prerequisites

1. **Node.js** (v18 or higher)
2. **MetaMask** browser extension
3. **IPFS Desktop** or IPFS CLI
4. **Git**

## Installation Steps

### 1. Install IPFS

**Option A: IPFS Desktop (Recommended for beginners)**
- Download from: https://docs.ipfs.tech/install/ipfs-desktop/
- Install and start IPFS Desktop
- It will run on http://127.0.0.1:5001

**Option B: IPFS CLI**
```bash
# macOS/Linux
wget https://dist.ipfs.tech/kubo/v0.24.0/kubo_v0.24.0_linux-amd64.tar.gz
tar -xvzf kubo_v0.24.0_linux-amd64.tar.gz
cd kubo
sudo bash install.sh

# Start IPFS daemon
ipfs init
ipfs daemon
```

### 2. Clone and Install Project

```bash
cd /path/to/Sarawak-Medchain

# Install root dependencies (Hardhat)
npm install

# Install backend dependencies
cd backend
npm install
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 3. Configure Environment Variables

```bash
# Copy environment examples
cp .env.example .env

# For backend
cd backend
cp ../.env.example .env
cd ..

# For frontend
cd frontend
cp .env.example .env
cd ..
```

### 4. Start Local Blockchain

Open a new terminal:

```bash
# Terminal 1: Start Hardhat local node
npx hardhat node
```

This will:
- Start a local Ethereum network on `http://127.0.0.1:8545`
- Create 20 test accounts with 10000 ETH each
- Display private keys and addresses

**Important:** Copy the first few account addresses and private keys. You'll need them for MetaMask and testing.

### 5. Deploy Smart Contract

Open a new terminal:

```bash
# Terminal 2: Deploy contract to local network
npx hardhat run scripts/deploy.js --network localhost
```

**If you don't have a deploy script yet, create one:**

```bash
# Create deployment script
mkdir -p scripts
cat > scripts/deploy.js << 'EOF'
const hre = require("hardhat");

async function main() {
  const [deployer, doctor1, doctor2, patient1] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const SarawakMedMVP = await hre.ethers.getContractFactory("SarawakMedMVP");
  const sarawakMed = await SarawakMedMVP.deploy();

  await sarawakMed.waitForDeployment();

  const contractAddress = await sarawakMed.getAddress();
  console.log("SarawakMedMVP deployed to:", contractAddress);

  // Add some verified doctors for testing
  console.log("\nAdding verified doctors...");
  await sarawakMed.addVerifiedDoctor(doctor1.address);
  console.log("Doctor 1 verified:", doctor1.address);

  await sarawakMed.addVerifiedDoctor(doctor2.address);
  console.log("Doctor 2 verified:", doctor2.address);

  console.log("\nTest Accounts:");
  console.log("Admin/Deployer:", deployer.address);
  console.log("Doctor 1:", doctor1.address);
  console.log("Doctor 2:", doctor2.address);
  console.log("Patient 1:", patient1.address);

  console.log("\nUpdate frontend .env with:");
  console.log(`VITE_CONTRACT_ADDRESS=${contractAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
EOF
```

Then run:
```bash
node scripts/deploy.js
```

**Copy the deployed contract address** and update `frontend/.env`:
```
VITE_CONTRACT_ADDRESS=<your-deployed-address>
```

### 6. Configure MetaMask

1. Open MetaMask extension
2. Click network dropdown → "Add Network" → "Add a network manually"
3. Enter:
   - Network Name: `Hardhat Local`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `1337` or `31337`
   - Currency Symbol: `ETH`
4. Click "Save"

5. Import test accounts:
   - Click account icon → "Import Account"
   - Paste private key from Hardhat node output
   - Import at least:
     - 1 Admin account (Account #0)
     - 2 Doctor accounts (Accounts #1, #2)
     - 2 Patient accounts (Accounts #3, #4)

### 7. Start Backend Server

Open a new terminal:

```bash
# Terminal 3: Start backend
cd backend
npm start
```

Backend will run on `http://localhost:3001`

Check backend status: `http://localhost:3001/api/upload/status`

### 8. Start Frontend

Open a new terminal:

```bash
# Terminal 4: Start frontend
cd frontend
npm run dev
```

Frontend will run on `http://localhost:5173`

## Testing the MVP

### MVP Validation Checklist

#### Test 1: Unverified Doctor Cannot Write Records

1. Open `http://localhost:5173`
2. Connect with Patient account (Account #3)
3. Switch to "Doctor Portal"
4. Try to upload a PDF
5. **Expected:** Error message "You must be a verified doctor"

✓ **PASS:** Unverified doctors cannot write records

#### Test 2: Verified Doctor Can Write Records

1. Switch MetaMask to Doctor account (Account #1 - verified during deployment)
2. Refresh page, go to "Doctor Portal"
3. Upload a PDF file:
   - Enter patient address (Account #3)
   - Select a PDF file
   - Click "Upload and Encrypt"
4. **Expected:** Success message with IPFS hash and encryption key
5. **Copy the encryption key** - patient will need it

✓ **PASS:** Verified doctors can write records

#### Test 3: Patient Controls Access

1. Switch MetaMask to Patient account (Account #3)
2. Go to "Patient Portal"
3. Click "Refresh Records"
4. **Expected:** See the record uploaded by Doctor #1
5. Grant access to Doctor #2:
   - Enter Doctor #2 address
   - Click "Grant Access"
6. **Expected:** Transaction confirmation, success message

✓ **PASS:** Patients can grant access

#### Test 4: Doctor Without Permission Cannot Read

1. Switch MetaMask to Doctor #3 (Account #2) - verified but no access
2. Go to "Doctor Portal"
3. Try to read Patient #1 records:
   - Enter Patient #1 address (Account #3)
   - Click "Request Access to Records"
4. **Expected:** Error "Access denied"

✓ **PASS:** Doctors without permission cannot read records

#### Test 5: Access Revocation Works Immediately

1. Switch to Patient account (Account #3)
2. Go to "Patient Portal"
3. Revoke access from Doctor #2:
   - Enter Doctor #2 address
   - Click "Revoke Access"
4. **Expected:** Success message
5. Switch to Doctor #2 account
6. Try to read records again
7. **Expected:** Access denied

✓ **PASS:** Access revocation is enforced immediately

#### Test 6: Patient Can View Own Records

1. Switch to Patient account (Account #3)
2. Go to "Patient Portal"
3. In the records list, enter the encryption key
4. Click "View Record"
5. **Expected:** PDF opens in new tab

✓ **PASS:** Patients can view their own records

#### Test 7: All Actions Are Auditable

1. Open browser console (F12)
2. In console, run:
```javascript
// Get contract instance
const contract = window.ethereum
// Check recent events
```

Or use Hardhat:
```bash
npx hardhat console --network localhost
const contract = await ethers.getContractAt("SarawakMedMVP", "CONTRACT_ADDRESS");
const events = await contract.queryFilter("*");
console.log(events);
```

✓ **PASS:** All events are logged on blockchain

## Troubleshooting

### Issue: MetaMask transactions fail
**Solution:**
- Reset MetaMask account: Settings → Advanced → Reset Account
- This clears transaction history when restarting Hardhat node

### Issue: IPFS upload fails
**Solution:**
- Ensure IPFS daemon is running
- Check `http://127.0.0.1:5001/webui`
- Restart IPFS daemon

### Issue: Contract not found
**Solution:**
- Redeploy contract
- Update `VITE_CONTRACT_ADDRESS` in `frontend/.env`
- Restart frontend

### Issue: Backend connection refused
**Solution:**
- Check backend is running on port 3001
- Check CORS settings in backend/server.js

## MVP Scope Reminder

This MVP demonstrates ONLY:
- ✓ Access control via smart contracts
- ✓ Encrypted file storage
- ✓ Patient-controlled permissions
- ✓ Audit trail of all actions

This MVP does NOT include:
- ✗ Payments or tokens
- ✗ Insurance logic
- ✗ AI diagnostics
- ✗ Production-grade key management
- ✗ National identity systems
- ✗ Mobile apps

## Next Steps for Production

1. **Key Management**: Implement proper key vault or HSM
2. **Identity**: Integrate with national ID system
3. **Deployment**: Deploy to testnet (Sepolia) then mainnet
4. **Scaling**: Optimize gas costs and add batch operations
5. **Mobile**: Build mobile apps for better UX
6. **Compliance**: Add audit logs, regulatory compliance features

## Architecture Decisions

### Why IPFS?
- Decentralized storage
- Content addressing (hash = proof of integrity)
- Censorship resistant
- Lower costs than storing on blockchain

### Why AES-256-GCM?
- Industry standard encryption
- Authenticated encryption (prevents tampering)
- Fast encryption/decryption
- Well-tested and secure

### Why Ethereum/EVM?
- Mature ecosystem
- Strong security guarantees
- Wide tooling support
- Easy to deploy to multiple chains

## Security Considerations

### MVP Security Limitations
1. Encryption keys returned to client (not production-ready)
2. No key rotation mechanism
3. No backup/recovery for lost keys
4. IPFS node trust (using local node)

### Production Requirements
1. Hardware Security Modules (HSM) for keys
2. Multi-signature admin controls
3. Emergency pause mechanism
4. Formal security audit
5. Insurance for smart contract risks

## License

MIT License - See LICENSE file

## Support

For issues, please check:
1. This setup guide
2. Project README.md
3. Backend README.md
4. Smart contract tests for examples

---

**Built for Sarawak MedChain MVP - Demonstrating Patient-Controlled Medical Records**
