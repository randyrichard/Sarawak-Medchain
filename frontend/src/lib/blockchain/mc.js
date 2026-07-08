import { ethers } from 'ethers';
import ContractABI from '../../SarawakMedMVP.json';
import { getContract, executeWithGasBuffer, executeWithRetry } from './contract';
import {
  CONTRACT_ADDRESS,
  SEPOLIA_RPC_URL,
  SEPOLIA_LOG_RPC_URLS,
  DEPLOY_BLOCK,
  LOCAL_RPC_URL,
  isProduction,
} from '../config';

/**
 * Compute the canonical keccak256 hash of an MC's data.
 * This exact hash is anchored on-chain at issuance and recomputed at
 * verification time — if any field is altered, the hashes no longer match.
 *
 * Field order and formatting must never change once MCs are in circulation.
 *
 * NOTE: the diagnosis (medical reason) is deliberately NOT part of the hash and
 * is never stored in the public verification system — employers verify that a
 * valid certificate exists for a given person and duration, not the private
 * medical reason. This keeps sensitive health data out of the public flow.
 */
export function computeMCHash(mc) {
  const canonical = [
    mc.mcId,
    mc.patientIC,
    mc.patientName,
    String(mc.duration),
    mc.doctorName,
    mc.mmcNumber,
    mc.hospital,
    mc.dateIssued,
    mc.startDate,
    mc.endDate,
  ].map(v => String(v ?? '').trim()).join('|');

  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

/**
 * Anchor an MC hash on-chain (requires connected wallet of a verified doctor).
 * @returns {Object} { txHash, blockNumber, timestamp }
 */
export async function issueMCOnChain(mcHash) {
  const contract = getContract();

  const receipt = await executeWithRetry(async () => {
    const tx = await executeWithGasBuffer(contract, 'issueMC', [mcHash]);
    return await tx.wait();
  });

  const block = await receipt.getBlock();
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    timestamp: block.timestamp,
  };
}

/**
 * Get a read-only provider — no wallet or MetaMask needed.
 * Employers verifying an MC only ever read from the chain.
 */
export function getReadOnlyProvider() {
  return new ethers.JsonRpcProvider(
    isProduction() ? SEPOLIA_RPC_URL : LOCAL_RPC_URL
  );
}

/**
 * Verify an MC hash against the blockchain (public, no wallet needed).
 * @returns {Object} { exists, doctor, timestamp, doctorVerified }
 */
export async function verifyMCOnChain(mcHash) {
  const provider = getReadOnlyProvider();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ContractABI.abi, provider);

  const [exists, doctor, timestamp, doctorVerified] = await contract.verifyMC(mcHash);
  return {
    exists,
    doctor,
    timestamp: Number(timestamp),
    doctorVerified,
  };
}

/**
 * Look up the on-chain transaction that anchored this MC (via the indexed
 * MCIssued event). Returns null if the event can't be found — verification
 * can still succeed from contract state alone.
 * @returns {Object|null} { txHash, blockNumber }
 */
export async function getMCIssuanceTx(mcHash) {
  const rpcUrls = isProduction() ? SEPOLIA_LOG_RPC_URLS : [LOCAL_RPC_URL];

  for (const url of rpcUrls) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ContractABI.abi, provider);

      const filter = contract.filters.MCIssued(mcHash);
      const events = await contract.queryFilter(filter, DEPLOY_BLOCK || 0, 'latest');

      if (events.length === 0) return null; // query worked, MC has no event
      return {
        txHash: events[0].transactionHash,
        blockNumber: events[0].blockNumber,
      };
    } catch (err) {
      console.warn(`MCIssued event lookup failed on ${url} (non-fatal):`, err.message);
    }
  }
  return null;
}

/**
 * Etherscan link for a transaction (Sepolia in production, none locally).
 */
export function getExplorerTxUrl(txHash) {
  return isProduction() ? `https://sepolia.etherscan.io/tx/${txHash}` : null;
}
