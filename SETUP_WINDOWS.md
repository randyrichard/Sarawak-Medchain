# Sarawak MedChain - Windows Setup Guide

## Prerequisites

- **Node.js** v18 or higher - Download from https://nodejs.org/
- **Git for Windows** - Download from https://git-scm.com/download/win (includes Git Bash)
- **MetaMask** browser extension
- **VSCode** with Git Bash terminal (recommended)

---

## Important: Choose Your Environment

### Option A: Git Bash (Recommended for simplicity)
- Comes with Git for Windows
- Most Linux commands work
- Easier for beginners

### Option B: WSL2 (Windows Subsystem for Linux)
- Full Linux environment on Windows
- Follow the Linux SETUP.md instead
- Better compatibility but requires WSL2 installation

**This guide uses Git Bash.** For WSL2, use SETUP.md instead.

---

## 1. Clone Repository

Open Git Bash:
```bash
cd ~/Desktop
git clone <repository-url>
cd Sarawak-Medchain
```

---

## 2. Install IPFS for Windows

### Download and Install:

**Option 1: Manual Installation (Recommended)**

1. Download IPFS Kubo for Windows:
   - Go to: https://dist.ipfs.tech/kubo/v0.31.0/
   - Download: `kubo_v0.31.0_windows-amd64.zip`

2. Extract the ZIP file to `C:\Program Files\kubo\`

3. Add to PATH:
   - Press `Win + X` → System → Advanced system settings
   - Click "Environment Variables"
   - Under "System variables", find "Path" → Click "Edit"
   - Click "New" → Add: `C:\Program Files\kubo`
   - Click OK on all dialogs

4. **Restart Git Bash** (important!)

5. Verify installation:
```bash
ipfs --version
# Should show: ipfs version 0.31.0
```

**Option 2: Using PowerShell Script**

Open PowerShell as Administrator:
```powershell
# Download IPFS
Invoke-WebRequest -Uri "https://dist.ipfs.tech/kubo/v0.31.0/kubo_v0.31.0_windows-amd64.zip" -OutFile "$env:TEMP\kubo.zip"

# Extract
Expand-Archive -Path "$env:TEMP\kubo.zip" -DestinationPath "$env:TEMP\kubo" -Force

# Install
Move-Item "$env:TEMP\kubo\kubo\*" "C:\Program Files\kubo\" -Force

# Add to PATH
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\kubo", "Machine")
```

Then restart Git Bash and verify with `ipfs --version`.

### Initialize IPFS:
```bash
ipfs init
```

---

## 3. Install Dependencies

In Git Bash:
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

**Note:** If you get permission errors, try running Git Bash as Administrator.

---

## 4. Start Services (5 Terminals Required)

Open 5 Git Bash terminals in VSCode or separate windows.

### Terminal 1: IPFS Daemon
```bash
ipfs daemon
```
Wait for: `Daemon is ready`

**Windows-specific note:** If you see firewall warnings, click "Allow access"

---

### Terminal 2: Hardhat Local Blockchain
```bash
cd ~/Desktop/Sarawak-Medchain
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
cd ~/Desktop/Sarawak-Medchain
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
cd ~/Desktop/Sarawak-Medchain/backend
npm start
```

**Expected output:**
```
Server running on port 3001
IPFS client initialized
```

**Windows-specific note:** If you see firewall warnings, click "Allow access"

---

### Terminal 5: Frontend Application

**Create .env file:**

**Using Git Bash:**
```bash
cd ~/Desktop/Sarawak-Medchain/frontend
echo "VITE_API_BASE_URL=http://localhost:3001" > .env
echo "VITE_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3" >> .env
```

**OR using Notepad (if echo doesn't work):**
Create `frontend/.env` with:
```
VITE_API_BASE_URL=http://localhost:3001
VITE_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
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

### Error: "ipfs: command not found"
**Cause:** IPFS not in PATH or Git Bash not restarted.

**Fix:**
1. Verify installation: Check if `C:\Program Files\kubo\ipfs.exe` exists
2. Restart Git Bash completely
3. Check PATH in Git Bash: `echo $PATH | grep kubo`
4. If still not working, add manually to Git Bash profile:
```bash
echo 'export PATH="/c/Program Files/kubo:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

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
# Check IPFS is running (in Git Bash)
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
2. Update `frontend/.env` with new contract address
3. Reset MetaMask activity
4. Refresh browser

### Windows Firewall Blocks
**Fix:**
- When Windows Firewall prompt appears, click "Allow access"
- If you accidentally blocked it:
  - Windows Security → Firewall & network protection
  - Allow an app through firewall
  - Find "Node.js" and "ipfs" → Check "Private" and "Public"

### Port Already in Use Errors
**Fix:**
```bash
# Find and kill process on port (in PowerShell as Admin)
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Common ports to check:
# 3001 (Backend), 5173 (Frontend), 8545 (Hardhat), 5001 (IPFS)
```

### npm install fails with permission errors
**Fix:**
- Run Git Bash as Administrator
- OR clean npm cache: `npm cache clean --force`

---

## Quick Restart (After Initial Setup)

If all services were stopped, restart in order:

```bash
# Terminal 1
ipfs daemon

# Terminal 2
cd ~/Desktop/Sarawak-Medchain && npx hardhat node

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
# IPFS (in Git Bash)
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

## Windows-Specific Notes

### Terminal Management
- **VSCode:** Use integrated terminal (View → Terminal)
- Split terminals with `Ctrl+Shift+5`
- Switch between terminals with dropdown menu

### File Paths
- Git Bash uses Unix-style paths: `/c/Users/...`
- Windows uses: `C:\Users\...`
- Both usually work, but Git Bash style is more reliable

### Line Endings
If you get errors about `\r` characters:
```bash
git config core.autocrlf true
```

### Antivirus Software
Some antivirus programs may block:
- IPFS daemon
- Node.js servers
- Hardhat blockchain

**Fix:** Add exceptions for:
- `C:\Program Files\kubo\ipfs.exe`
- `C:\Program Files\nodejs\node.exe`
- Your project directory

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
- [SETUP.md](./SETUP.md) - Linux/macOS setup
- [backend/README.md](./backend/README.md) - API documentation

For issues, check Terminal 2 output and MetaMask network settings.

---

## Common Windows-Specific Issues

### Git Bash vs PowerShell vs CMD
- **Git Bash:** Recommended for this project (best compatibility)
- **PowerShell:** Works but requires different syntax for some commands
- **CMD:** Not recommended (many commands won't work)

### VSCode Terminal Configuration
Set Git Bash as default terminal in VSCode:
1. `Ctrl+Shift+P` → "Terminal: Select Default Profile"
2. Choose "Git Bash"

### Node.js Version
Check Node.js version:
```bash
node --version  # Should be v18 or higher
```

If you need to update:
- Download from: https://nodejs.org/
- Use LTS version

---

**Setup complete! You should now have a fully functional Sarawak MedChain MVP running locally on Windows.**
