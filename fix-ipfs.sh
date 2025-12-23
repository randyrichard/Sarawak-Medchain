#!/bin/bash
echo "Removing old snap version of IPFS..."
sudo snap remove ipfs
echo ""
echo "✓ Old snap version removed"
echo ""
echo "Now starting IPFS daemon..."
/usr/local/bin/ipfs daemon
