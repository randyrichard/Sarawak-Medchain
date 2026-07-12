import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import { config } from '../config.js';

/**
 * Blockchain anchoring — uses the same SarawakMedMVP contract as the live
 * prototype. Only the canonical keccak256 hash ever touches the chain;
 * patient data never leaves the encrypted database.
 */
const ABI = [
  'function issueMC(bytes32 mcHash)',
  'function verifyMC(bytes32 mcHash) view returns (bool exists, address doctor, uint256 timestamp, bool doctorVerified)',
  'event MCIssued(bytes32 indexed mcHash, address indexed doctor, uint256 timestamp)',
];

export interface AnchorResult {
  txHash: string;
  blockNumber: number;
  timestamp: Date;
}

export interface ChainVerification {
  exists: boolean;
  doctor: string;
  timestamp: Date | null;
  doctorVerified: boolean;
}

function readProvider(): JsonRpcProvider {
  return new JsonRpcProvider(config.chain.rpcUrl);
}

export function chainEnabled(): boolean {
  return config.chain.enabled && !!config.chain.issuerPrivateKey;
}

/** Anchor an MC hash on-chain. Returns null when anchoring is disabled (demo mode). */
export async function anchorMCHash(mcHash: string): Promise<AnchorResult | null> {
  if (!chainEnabled()) return null;
  const provider = readProvider();
  const wallet = new Wallet(config.chain.issuerPrivateKey, provider);
  const contract = new Contract(config.chain.contractAddress, ABI, wallet);
  const tx = await contract.issueMC(mcHash);
  const receipt = await tx.wait();
  const block = await receipt.getBlock();
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    timestamp: new Date(Number(block.timestamp) * 1000),
  };
}

/** Read-only on-chain check — no wallet required. */
export async function verifyMCOnChain(mcHash: string): Promise<ChainVerification | null> {
  if (!config.chain.enabled) return null;
  try {
    const contract = new Contract(config.chain.contractAddress, ABI, readProvider());
    const [exists, doctor, timestamp, doctorVerified] = await contract.verifyMC(mcHash);
    return {
      exists,
      doctor,
      timestamp: exists ? new Date(Number(timestamp) * 1000) : null,
      doctorVerified,
    };
  } catch (err) {
    console.warn('[chain] on-chain verification unavailable:', (err as Error).message);
    return null; // verification degrades gracefully to DB + signature checks
  }
}

export function explorerTxUrl(txHash: string): string {
  return `${config.chain.explorerTxBase}${txHash}`;
}
