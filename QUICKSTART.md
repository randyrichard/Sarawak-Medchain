# Sarawak MedChain - Complete Quick Start Guide

## Step-by-Step Instructions from Scratch

This guide assumes you're starting fresh and need to install everything.

---

## Step 1: Install IPFS

### Option A: Install via Snap (Recommended for Ubuntu/Debian)

```bash
sudo snap install ipfs
```

After installation, initialize and start IPFS:

```bash
# Initialize IPFS (first time only)
ipfs init

# Start IPFS daemon
ipfs daemon
```

**Keep this terminal open!** IPFS needs to keep running.

### Option B: Install IPFS Desktop (GUI)

1. Download IPFS Desktop from: https://github.com/ipfs/ipfs-desktop/releases
2. Install the `.deb` package:
```bash
cd ~/Downloads
sudo dpkg -i ipfs-desktop_*.deb
```
3. Launch IPFS Desktop from your applications menu
4. The daemon will start automatically

### Option C: Manual Installation

```bash
# Download IPFS
cd /tmp
wget https://dist.ipfs.tech/kubo/v0.24.0/kubo_v0.24.0_linux-amd64.tar.gz

# Extract
tar -xvzf kubo_v0.24.0_linux-amd64.tar.gz

# Install
cd kubo
sudo bash install.sh

# Initialize (first time only)
ipfs init

# Start daemon
ipfs daemon
```

### Verify IPFS is Running

Open a new terminal and test:

```bash
ipfs version
# Should show: ipfs version 0.24.0 (or similar)

# Check if daemon is running
curl http://127.0.0.1:5001/api/v0/version
# Should return JSON with version info
```

---

## Step 2: Install Project Dependencies

Open a **NEW terminal** (keep IPFS running in the first one):

```bash
cd ~/Desktop/Sarawak-Medchain

# Install root dependencies
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

---

## Step 3: Start Hardhat Local Blockchain

Open a **NEW terminal** (Terminal 2):

```bash
cd ~/Desktop/Sarawak-Medchain

# Start local Ethereum network
npx hardhat node
```

**Important:** This will display 20 test accounts with private keys. Keep this terminal open and **save this information** - you'll need it for MetaMask!

Example output:
```
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000 ETH)
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
...
```

**Keep this terminal open!**

---

## Step 4: Deploy Smart Contract

Open a **NEW terminal** (Terminal 3):

```bash
cd ~/Desktop/Sarawak-Medchain

# Deploy contract to local network
node scripts/deploy.cjs
```

You should see output like:

```
========================================
SarawakMedMVP deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
========================================

Adding verified doctors for testing...

✓ Doctor 1 verified: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
✓ Doctor 2 verified: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

========================================
Test Accounts (Import these into MetaMask):
========================================
Admin/Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Doctor 1 (Verified): 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Doctor 2 (Verified): 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
Patient 1: 0x90F79bf6EB2c4f870365E785982E1f101E93b906

========================================
IMPORTANT: Update your .env files
========================================
Add to frontend/.env:
VITE_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

**Copy the contract address** and update the frontend environment:

```bash
# Create/update frontend/.env
cd ~/Desktop/Sarawak-Medchain/frontend
echo "VITE_API_BASE_URL=http://localhost:3001" > .env
echo "VITE_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3" >> .env
# (Replace with YOUR actual contract address from the output above)

cd ..
```

---

## Step 5: Configure MetaMask

### A. Install MetaMask

If not already installed:
1. Open Chrome/Firefox/Brave browser
2. Go to https://metamask.io/download/
3. Install the extension
4. Create a new wallet or import existing one

### B. Add Hardhat Local Network

1. Click the MetaMask extension icon
2. Click the network dropdown (top left, probably says "Ethereum Mainnet")
3. Click "Add Network" → "Add a network manually"
4. Fill in:
   - **Network Name:** `Hardhat Local`
   - **New RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
   - **Currency Symbol:** `ETH`
5. Click "Save"
6. Switch to "Hardhat Local" network

### C. Import Test Accounts

Import at least 4 accounts using the private keys from Step 3:

1. Click the account icon (top right)
2. Click "Import Account"
3. Paste the private key from Hardhat output
4. Click "Import"

**Import these accounts:**

| Account | Role | Private Key (from Hardhat node output) |
|---------|------|----------------------------------------|
| Account #0 | Admin | 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 |
| Account #1 | Doctor 1 (Verified) | 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d |
| Account #2 | Doctor 2 (Verified) | 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a |
| Account #3 | Patient 1 | 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 |

**Tip:** Name each account in MetaMask (click ⋮ next to account → Account details → pencil icon) so you know which is which.

---

## Step 6: Start Backend Server

Open a **NEW terminal** (Terminal 4):

```bash
cd ~/Desktop/Sarawak-Medchain/backend

# Start backend server
npm start
```

You should see:
```
Server running on port 3001
IPFS Gateway: http://127.0.0.1:5001
IPFS client initialized
```

**Keep this terminal open!**

Test backend is running:
```bash
# In another terminal
curl http://localhost:3001/api/upload/status
```

Should return: `{"backend":"ok","ipfs":"connected","message":"All systems operational"}`

---

## Step 7: Start Frontend

Open a **NEW terminal** (Terminal 5):

```bash
cd ~/Desktop/Sarawak-Medchain/frontend

# Start frontend dev server
npm run dev
```

You should see:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

**Keep this terminal open!**

---

## Step 8: Open Application

1. Open browser: http://localhost:5173
2. Click "Connect MetaMask Wallet"
3. MetaMask will pop up → Click "Connect"
4. You should see the main application!

---

## Testing the MVP

### Test 1: Unverified User Cannot Upload

1. In MetaMask, switch to **Account #4** (Patient 2 - NOT verified as doctor)
2. Refresh the page
3. Go to "Doctor Portal"
4. You should see: "⚠️ You are not a verified doctor"
5. Try to upload a file → Error!

✅ **PASS:** Unverified doctors cannot write records

---

### Test 2: Verified Doctor Can Upload Record

1. In MetaMask, switch to **Account #1** (Doctor 1 - Verified)
2. Refresh the page
3. Go to "Doctor Portal"
4. You should see: "✓ You are verified as a doctor"
5. Create a test PDF:

```bash
# Create a sample PDF for testing
echo "This is a test medical record for Patient 1" | enscript -B -o - | ps2pdf - ~/Desktop/test-record.pdf
```

Or just use any PDF file you have.

6. Fill in the form:
   - **Patient Wallet Address:** `0x90F79bf6EB2c4f870365E785982E1f101E93b906` (Account #3 address)
   - **Select file:** Choose your PDF
7. Click "Upload and Encrypt"
8. Wait for success message
9. **IMPORTANT:** Copy the encryption key shown in the success message!

Example success message:
```
✓ Record uploaded successfully!

IPFS Hash: QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Encryption Key: a1b2c3d4e5f6789...

⚠️ IMPORTANT: Give this encryption key to the patient to decrypt their record!
```

✅ **PASS:** Verified doctors can write records

---

### Test 3: Patient Views Their Records

1. In MetaMask, switch to **Account #3** (Patient 1)
2. Refresh the page
3. Go to "Patient Portal"
4. Click "Refresh Records"
5. You should see the record uploaded by Doctor 1
6. Paste the encryption key you copied earlier
7. Click "View Record"
8. PDF should open in new tab!

✅ **PASS:** Patients can view their own records

---

### Test 4: Patient Grants Access to Doctor

1. Still on Patient Portal (Account #3)
2. In "Access Control" section
3. Enter Doctor 2 address: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
4. Click "Grant Access"
5. MetaMask pops up → Confirm transaction
6. Wait for success message

✅ **PASS:** Patients can grant access

---

### Test 5: Doctor Without Permission Cannot Read

1. In MetaMask, switch to **Account #2** (Doctor 2)
2. Go to "Doctor Portal"
3. Try to read Patient 1 records:
   - Enter patient address: `0x90F79bf6EB2c4f870365E785982E1f101E93b906`
   - Click "Request Access to Records"
4. Now it should work because Patient granted access in Test 4!

Now test BEFORE granting access:

1. Switch to **Account #3** (Patient 1)
2. Check who has access by entering Doctor 2 address and clicking "Check Access"
3. If they have access, click "Revoke Access"
4. Switch back to **Account #2** (Doctor 2)
5. Try to read records again
6. Should show: "Error: Access denied"

✅ **PASS:** Doctors without permission cannot read

---

### Test 6: Access Revocation Works Immediately

1. MetaMask → **Account #3** (Patient 1)
2. Go to "Patient Portal"
3. Grant access to Doctor 2 (if not already granted)
4. Switch to **Account #2** (Doctor 2)
5. Confirm you can read records (should work)
6. Switch back to **Account #3** (Patient 1)
7. Revoke access from Doctor 2
8. Switch to **Account #2** (Doctor 2)
9. Try to read again
10. Should immediately fail!

✅ **PASS:** Access revocation is enforced immediately

---

## Summary of Running Terminals

When everything is running, you should have:

1. **Terminal 1:** IPFS daemon
2. **Terminal 2:** Hardhat node (blockchain)
3. **Terminal 3:** Can be closed after deployment
4. **Terminal 4:** Backend server
5. **Terminal 5:** Frontend dev server

**Browser:** http://localhost:5173 with MetaMask connected

---

## Troubleshooting

### Issue: "Command 'ipfs' not found"
**Solution:** Install IPFS using Step 1 above

### Issue: MetaMask transactions fail with "nonce too high"
**Solution:**
```bash
# In MetaMask:
# Settings → Advanced → Clear activity tab data
# OR: Reset Account (Settings → Advanced → Reset Account)
```

### Issue: "IPFS service unavailable"
**Solution:**
```bash
# Check if IPFS is running
curl http://127.0.0.1:5001/api/v0/version

# If not, restart IPFS daemon
ipfs daemon
```

### Issue: "Contract not found" or transactions fail
**Solution:**
1. Stop Hardhat node (Ctrl+C in Terminal 2)
2. Restart: `npx hardhat node`
3. Redeploy: `node scripts/deploy.cjs`
4. Update `frontend/.env` with new contract address
5. Restart frontend
6. Reset MetaMask accounts (see above)

### Issue: Backend connection refused
**Solution:**
```bash
# Check backend is running
curl http://localhost:3001/health

# Should return: {"status":"ok","message":"Backend server is running"}

# If not, restart backend:
cd backend
npm start
```

### Issue: Frontend build errors
**Solution:**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

---

## Stopping Everything

When you're done testing:

1. **Frontend:** Ctrl+C in Terminal 5
2. **Backend:** Ctrl+C in Terminal 4
3. **Hardhat:** Ctrl+C in Terminal 2
4. **IPFS:** Ctrl+C in Terminal 1 (or leave running)

---

## Next Session: Quick Restart

If you've already set everything up once, here's the quick restart:

```bash
# Terminal 1: IPFS (if not running)
ipfs daemon

# Terminal 2: Blockchain
cd ~/Desktop/Sarawak-Medchain
npx hardhat node

# Terminal 3: Deploy (only if you restarted blockchain)
node scripts/deploy.cjs
# Update frontend/.env with new contract address if changed

# Terminal 4: Backend
cd backend
npm start

# Terminal 5: Frontend
cd frontend
npm run dev
```

Then reset MetaMask accounts and you're ready!

---

## Success Criteria

You've successfully set up the MVP when:

- ✅ IPFS daemon is running
- ✅ Hardhat node is running with 20 test accounts
- ✅ Smart contract is deployed
- ✅ Backend shows "IPFS client initialized"
- ✅ Frontend loads at http://localhost:5173
- ✅ MetaMask connects to Hardhat Local network
- ✅ You can upload a record as Doctor 1
- ✅ You can view the record as Patient 1

---

**Questions?** Check the detailed guides:
- [MVP_SETUP_GUIDE.md](./MVP_SETUP_GUIDE.md)
- [README.md](./README.md)
- [backend/README.md](./backend/README.md)
