import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Minimal ABI for permission checking
const MEDCHAIN_ABI = [
  "function accessPermissions(address patient, address doctor) view returns (bool)",
  "function verifiedDoctors(address doctor) view returns (bool)",
  "function patientRecords(address patient, uint256 index) view returns (address patientAddress, string ipfsHash, uint256 timestamp, address doctorAddress)"
];

let provider = null;
let contract = null;

/**
 * Initialize the contract connection
 */
function getContract() {
  if (contract) return contract;

  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!contractAddress) {
    throw new Error('CONTRACT_ADDRESS not set in environment');
  }

  provider = new ethers.JsonRpcProvider(rpcUrl);
  contract = new ethers.Contract(contractAddress, MEDCHAIN_ABI, provider);

  console.log(`Contract initialized at ${contractAddress}`);
  return contract;
}

/**
 * Check if a doctor has access to a patient's records
 * @param {string} patientAddress - Patient's wallet address
 * @param {string} doctorAddress - Doctor's wallet address
 * @returns {boolean} - True if doctor has access
 */
export async function hasAccess(patientAddress, doctorAddress) {
  try {
    const medchain = getContract();

    // Patient always has access to their own records
    if (patientAddress.toLowerCase() === doctorAddress.toLowerCase()) {
      return true;
    }

    // Check permission mapping on blockchain
    const hasPermission = await medchain.accessPermissions(patientAddress, doctorAddress);
    return hasPermission;

  } catch (error) {
    console.error('Error checking access:', error);
    throw new Error(`Failed to verify blockchain access: ${error.message}`);
  }
}

/**
 * Check if an address is a verified doctor
 * @param {string} doctorAddress - Doctor's wallet address
 * @returns {boolean} - True if verified
 */
export async function isVerifiedDoctor(doctorAddress) {
  try {
    const medchain = getContract();
    const isVerified = await medchain.verifiedDoctors(doctorAddress);
    return isVerified;

  } catch (error) {
    console.error('Error checking doctor status:', error);
    throw new Error(`Failed to verify doctor status: ${error.message}`);
  }
}

/**
 * Get the patient address associated with an IPFS hash
 * by searching through records (expensive operation)
 * Note: In production, use events or an indexed database
 */
export async function getPatientByIPFSHash(ipfsHash, callerAddress) {
  // For MVP: We require the caller to specify the patient address
  // In production, you would index events or maintain an off-chain database
  return null;
}

/**
 * Verify that the caller has permission to access a specific record
 * @param {string} callerAddress - Address of the person making the request
 * @param {string} patientAddress - Address of the patient whose record is being accessed
 * @returns {object} - { authorized: boolean, reason: string }
 */
export async function verifyRecordAccess(callerAddress, patientAddress) {
  try {
    // Self-access is always allowed
    if (callerAddress.toLowerCase() === patientAddress.toLowerCase()) {
      return { authorized: true, reason: 'Self-access' };
    }

    // Check blockchain permission
    const permitted = await hasAccess(patientAddress, callerAddress);

    if (permitted) {
      return { authorized: true, reason: 'Granted access on blockchain' };
    }

    return {
      authorized: false,
      reason: 'No access permission found on blockchain'
    };

  } catch (error) {
    return {
      authorized: false,
      reason: `Verification failed: ${error.message}`
    };
  }
}
