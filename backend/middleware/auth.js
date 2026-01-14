import { ethers } from 'ethers';

/**
 * Middleware to verify wallet signatures
 *
 * Clients must send:
 * - x-wallet-address: The wallet address claiming to make the request
 * - x-wallet-signature: Signature of the message (timestamp + action)
 * - x-wallet-timestamp: Unix timestamp (must be within 5 minutes)
 * - x-wallet-action: The action being performed (e.g., "upload", "retrieve")
 */
export function verifyWalletSignature(req, res, next) {
  try {
    const walletAddress = req.headers['x-wallet-address'];
    const signature = req.headers['x-wallet-signature'];
    const timestamp = req.headers['x-wallet-timestamp'];
    const action = req.headers['x-wallet-action'];

    // Check all required headers
    if (!walletAddress || !signature || !timestamp || !action) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Missing wallet authentication headers (x-wallet-address, x-wallet-signature, x-wallet-timestamp, x-wallet-action)'
      });
    }

    // Validate timestamp (must be within 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp, 10);
    const timeDiff = Math.abs(now - requestTime);

    if (timeDiff > 300) { // 5 minutes
      return res.status(401).json({
        error: 'Authentication expired',
        message: 'Timestamp is too old or too far in the future. Please sign a new message.'
      });
    }

    // Construct the message that was signed
    const message = `SarawakMedChain:${action}:${timestamp}`;

    // Verify the signature
    const recoveredAddress = ethers.verifyMessage(message, signature);

    // Check if recovered address matches claimed address
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(401).json({
        error: 'Invalid signature',
        message: 'Wallet signature does not match the claimed address'
      });
    }

    // Attach verified wallet address to request
    req.walletAddress = ethers.getAddress(walletAddress); // Checksummed
    req.authAction = action;

    console.log(`Authenticated request from ${req.walletAddress} for action: ${action}`);
    next();

  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      error: 'Authentication failed',
      message: error.message
    });
  }
}

/**
 * Generate the message format for clients to sign
 * Used by frontend to know what to sign
 */
export function getAuthMessage(action) {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    message: `SarawakMedChain:${action}:${timestamp}`,
    timestamp: timestamp
  };
}
