#!/bin/bash
echo "Installing IPFS..."
cd /tmp/kubo
sudo bash install.sh
echo ""
echo "Initializing IPFS..."
ipfs init
echo ""
echo "✓ IPFS installed successfully!"
echo ""
echo "To start IPFS daemon, run:"
echo "  ipfs daemon"
