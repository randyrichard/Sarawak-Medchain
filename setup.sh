#!/bin/bash

# Sarawak MedChain MVP - Setup Helper Script
# This script helps you set up the complete MVP environment

set -e  # Exit on error

echo "=========================================="
echo "  Sarawak MedChain MVP - Setup Helper"
echo "=========================================="
echo ""

# Check if IPFS is installed
echo "Step 1: Checking IPFS installation..."
if command -v ipfs &> /dev/null; then
    echo "✓ IPFS is installed"
    IPFS_VERSION=$(ipfs version --number)
    echo "  Version: $IPFS_VERSION"
else
    echo "✗ IPFS not found"
    echo ""
    echo "Installing IPFS via snap..."
    echo "You may be asked for your sudo password."
    sudo snap install ipfs
    echo "✓ IPFS installed"
fi

echo ""

# Initialize IPFS if needed
echo "Step 2: Initializing IPFS..."
if [ -d ~/.ipfs ]; then
    echo "✓ IPFS already initialized"
else
    ipfs init
    echo "✓ IPFS initialized"
fi

echo ""

# Install dependencies
echo "Step 3: Installing project dependencies..."
echo ""

echo "Installing root dependencies..."
npm install

echo ""
echo "Installing backend dependencies..."
cd backend
npm install
cd ..

echo ""
echo "Installing frontend dependencies..."
cd frontend
npm install
cd ..

echo ""
echo "✓ All dependencies installed"

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Start IPFS daemon (in a new terminal):"
echo "   ipfs daemon"
echo ""
echo "2. Start Hardhat local blockchain (in a new terminal):"
echo "   npx hardhat node"
echo ""
echo "3. Deploy smart contract (in a new terminal):"
echo "   node scripts/deploy.cjs"
echo ""
echo "4. Update frontend/.env with the deployed contract address"
echo ""
echo "5. Start backend (in a new terminal):"
echo "   cd backend && npm start"
echo ""
echo "6. Start frontend (in a new terminal):"
echo "   cd frontend && npm run dev"
echo ""
echo "7. Open browser: http://localhost:5173"
echo ""
echo "For detailed instructions, see:"
echo "  - QUICKSTART.md (step-by-step guide)"
echo "  - MVP_SETUP_GUIDE.md (comprehensive guide)"
echo ""
echo "=========================================="
