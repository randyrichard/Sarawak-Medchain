# Sarawak MedChain - Complete Setup Guide

## Prerequisites

- **Node.js** v18 or higher
- **MetaMask** browser extension
- **Git**
- **Linux/macOS** (tested on Ubuntu)

---

## 1. Clone Repository

```bash
git clone <repository-url>
cd Sarawak-Medchain
```

---

## 2. Install IPFS

### Download and Install:
```bash
cd /tmp
wget https://dist.ipfs.tech/kubo/v0.31.0/kubo_v0.31.0_linux-amd64.tar.gz
tar -xvzf kubo_v0.31.0_linux-amd64.tar.gz
cd kubo
sudo bash install.sh
```

### Initialize IPFS:
```bash
ipfs init
```

---

## 3. Install Dependencies

```bash
# Root dependencies
npm install

# Backend dependencies
cd backend
npm install
cd ..

# Frontend dependencies
cd frontend
npm install
cd ..
```

---

## 4. Start Services (5 Terminals Required)

### Terminal 1: IPFS Daemon
```bash
ipfs daemon
```
Wait for: `Daemon is ready`

---

### Terminal 2: Hardhat Local Blockchain
```bash
cd Sarawak-Medchain
npx hardhat node
```

**IMPORTANT:** Copy and save the account addresses and private keys displayed. You need:
- Account #0 (Admin): `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Account #1 (Doctor 1): `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- Account #2 (Doctor 2): `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
- Account #3 (Patient 1): `0x90F79bf6EB2c4f870365E785982E1f101E93b906`

Private keys are shown in Terminal 2 output.

---

### Terminal 3: Deploy Smart Contract
```bash
cd Sarawak-Medchain
npx hardhat run scripts/deploy.cjs --network localhost
```

**Expected output:**
```
SarawakMedMVP deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
✓ Doctor 1 verified: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
✓ Doctor 2 verified: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
```

**Copy the contract address** (starts with `0x5FbDB...`)

**Verify in Terminal 2:** You should see `Contract deployment: SarawakMedMVP`

---

### Terminal 4: Backend Server
```bash
cd Sarawak-Medchain/backend
npm start
```

**Expected output:**
```
Server running on port 3001
IPFS client initialized
```

---

### Terminal 5: Frontend Application

**Create .env file:**
```bash
cd Sarawak-Medchain/frontend
echo "VITE_API_BASE_URL=http://localhost:3001" > .env
echo "VITE_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3" >> .env
```
*Replace the contract address with YOUR address from Terminal 3*

**Start frontend:**
```bash
npm run dev
```

**Expected output:**
```
➜  Local:   http://localhost:5173/
```

---

## 5. Configure MetaMask

### A. Install MetaMask
Install from: https://metamask.io/download/

### B. Create New Wallet
- Click "Create a new wallet"
- Set password
- Skip recovery phrase (local testing only)

### C. Add Hardhat Local Network
1. Click network dropdown → "Add network" → "Add a network manually"
2. Fill in:
   - **Network name:** `Hardhat Local`
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `1337`
   - **Currency symbol:** `ETH`
3. Click "Save"
4. Switch to "Hardhat Local" network

### D. Import Test Accounts
Click account icon → "Add account or hardware wallet" → "Import account"

Import these 4 accounts with their private keys from Terminal 2:

**Account #0 (Admin):**
```
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

**Account #1 (Doctor 1 - Verified):**
```
0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

**Account #2 (Doctor 2 - Verified):**
```
0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
```

**Account #3 (Patient 1):**
```
0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
```

**Tip:** Rename each account in MetaMask for easy identification.

---

## 6. Open Application

1. Open browser: **http://localhost:5173**
2. Click **"Connect MetaMask Wallet"**
3. Approve connection in MetaMask popup

---

## 7. Test the MVP

### Test 1: View Empty Records (Patient)
- Switch to Account #3 (Patient 1) in MetaMask
- Go to "Patient Portal"
- Should see: "No medical records found" ✅

### Test 2: Upload Medical Record (Doctor)
- Switch to Account #1 (Doctor 1) in MetaMask
- Click "Disconnect" button → Refresh page → Connect
- Go to "Doctor Portal"
- Should see: "✓ You are verified as a doctor"
- Upload a PDF file:
  - Patient Address: `0x90F79bf6EB2c4f870365E785982E1f101E93b906`
  - Select any PDF file
  - Click "Upload and Encrypt"
- **Copy the encryption key shown in success message**

### Test 3: View Medical Record (Patient)
- Switch to Account #3 (Patient 1) in MetaMask
- Click "Disconnect" → Refresh → Connect
- Go to "Patient Portal"
- Click "Refresh Records"
- Should see 1 record
- Paste encryption key in the input field
- Click "View Record"
- PDF opens in new tab ✅

### Test 4: Grant Access (Patient → Doctor)
- Patient Portal (Account #3)
- In "Access Control" section:
  - Enter Doctor 2 address: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
  - Click "Grant Access"
  - Confirm MetaMask transaction
- Should see: "Access granted" ✅

### Test 5: Revoke Access (Patient)
- Patient Portal (Account #3)
- Enter same Doctor 2 address
- Click "Revoke Access"
- Confirm transaction
- Should see: "Access revoked" ✅

---

## Troubleshooting

### Error: "could not decode result data"
**Cause:** Contract not deployed or MetaMask out of sync.

**Fix:**
1. Check Terminal 2 shows: `Contract deployment: SarawakMedMVP`
2. If not, redeploy: `npx hardhat run scripts/deploy.cjs --network localhost`
3. MetaMask → Settings → Advanced → "Clear activity tab data"
4. Refresh browser

### Error: "IPFS service unavailable"
**Fix:**
```bash
# Check IPFS is running
curl http://127.0.0.1:5001/api/v0/version

# If not running, start IPFS daemon:
ipfs daemon
```

### Error: MetaMask transactions fail
**Fix:**
1. MetaMask → Settings → Advanced → "Clear activity tab data"
2. If that doesn't work: Settings → Advanced → "Reset account"

### Terminal 2 was restarted
**Fix:**
1. Redeploy contract: `npx hardhat run scripts/deploy.cjs --network localhost`
2. Reset MetaMask activity
3. Refresh browser

---

## Quick Restart (After Initial Setup)

If all services were stopped, restart in order:

```bash
# Terminal 1
ipfs daemon

# Terminal 2
cd Sarawak-Medchain && npx hardhat node

# Terminal 3 (deploy contract)
npx hardhat run scripts/deploy.cjs --network localhost

# Terminal 4
cd backend && npm start

# Terminal 5
cd frontend && npm run dev
```

Then:
- MetaMask → Reset account activity
- Browser → http://localhost:5173

---

## System Requirements Check

### Verify all services are running:

```bash
# IPFS
curl http://127.0.0.1:5001/api/v0/version

# Backend
curl http://localhost:3001/health

# Hardhat (should return chain ID)
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  http://127.0.0.1:8545
```

All should return valid responses.

---

## Important Notes

### Security Warnings
- ⚠️ **These private keys are PUBLIC**
- ⚠️ **NEVER use these accounts on mainnet**
- ⚠️ **Any funds sent to these addresses will be LOST**

### MVP Limitations
- Local development only
- Encryption keys returned to client (not production-ready)
- No key management system
- No production security measures

### For Production
- Deploy to testnet/mainnet
- Implement proper key management
- Add authentication/authorization
- Conduct security audit
- Implement rate limiting
- Add comprehensive logging

---

## Architecture Summary

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│   Backend   │────▶│    IPFS     │
│  (React)    │     │  (Node.js)  │     │  (Storage)  │
│  Port 5173  │     │  Port 3001  │     │  Port 5001  │
└──────┬──────┘     └─────────────┘     └─────────────┘
       │
       │ Web3/Ethers.js
       ▼
┌─────────────────────────────────┐
│   Hardhat Local Blockchain      │
│   (Port 8545, Chain ID 1337)    │
│   SarawakMedMVP Smart Contract  │
└─────────────────────────────────┘
```

---

## Support

For detailed documentation:
- [README.md](./README.md) - Project overview
- [MVP_SETUP_GUIDE.md](./MVP_SETUP_GUIDE.md) - Comprehensive guide
- [QUICKSTART.md](./QUICKSTART.md) - Quick reference
- [backend/README.md](./backend/README.md) - API documentation

For issues, check Terminal 2 output and MetaMask network settings.

---

**Setup complete! You should now have a fully functional Sarawak MedChain MVP running locally.**
