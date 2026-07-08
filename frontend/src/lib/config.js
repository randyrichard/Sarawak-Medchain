// ─────────────────────────────────────────────────────────────────────────────
// Central configuration for Sarawak MedChain.
// Contract addresses, RPC endpoints and environment detection live here ONLY,
// so the blockchain/data modules never duplicate these constants.
// ─────────────────────────────────────────────────────────────────────────────

export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3';

export const BILLING_CONTRACT_ADDRESS =
  import.meta.env.VITE_BILLING_CONTRACT_ADDRESS || '';

// Public Sepolia RPC for read-only verification (no wallet needed).
export const SEPOLIA_RPC_URL =
  import.meta.env.VITE_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';

// Block the contract was deployed at — narrows MCIssued event queries.
export const DEPLOY_BLOCK = Number(import.meta.env.VITE_CONTRACT_DEPLOY_BLOCK || 0);

// RPCs that permit eth_getLogs (publicnode returns 403 for event queries).
export const SEPOLIA_LOG_RPC_URLS = [
  'https://sepolia.drpc.org',
  'https://sepolia.gateway.tenderly.co',
];

export const LOCAL_RPC_URL = 'http://127.0.0.1:8545';

// True when running on the deployed site (not localhost).
export function isProduction() {
  return (
    typeof window !== 'undefined' &&
    !window.location.hostname.includes('localhost') &&
    !window.location.hostname.includes('127.0.0.1')
  );
}
