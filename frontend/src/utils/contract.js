import { ethers } from 'ethers';
import ContractABI from '../SarawakMedMVP.json';
import BillingABI from '../BillingHistory.json';

// Update this with your deployed contract address
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const BILLING_CONTRACT_ADDRESS = import.meta.env.VITE_BILLING_CONTRACT_ADDRESS || '0x9A676e781A523b5d0C0e43731313A708CB607508';

/**
 * Validate Ethereum address format
 */
function validateAddress(address) {
  if (!address || typeof address !== 'string') {
    throw new Error('Address is required');
  }
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid Ethereum address: ${address}`);
  }
  return ethers.getAddress(address); // Returns checksummed address
}

let provider;
let signer;
let contract;
let billingContract;

/**
 * Initialize Web3 connection with MetaMask
 */
export async function connectWallet() {
  try {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed');
    }

    // Request account access
    await window.ethereum.request({ method: 'eth_requestAccounts' });

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    const address = await signer.getAddress();

    // Initialize contracts
    contract = new ethers.Contract(CONTRACT_ADDRESS, ContractABI.abi, signer);
    billingContract = new ethers.Contract(BILLING_CONTRACT_ADDRESS, BillingABI.abi, signer);

    console.log('Connected to wallet:', address);
    console.log('Contract address:', CONTRACT_ADDRESS);
    console.log('Billing contract address:', BILLING_CONTRACT_ADDRESS);

    return { address, contract, billingContract };
  } catch (error) {
    console.error('Wallet connection error:', error);
    throw error;
  }
}

/**
 * Get the current connected wallet address
 */
export async function getCurrentAddress() {
  if (!signer) {
    await connectWallet();
  }
  return await signer.getAddress();
}

/**
 * Get the contract instance
 */
export function getContract() {
  if (!contract) {
    throw new Error('Contract not initialized. Connect wallet first.');
  }
  return contract;
}

/**
 * Check if an address is a verified doctor
 */
export async function isVerifiedDoctor(address) {
  const validAddress = validateAddress(address);
  const contract = getContract();
  return await contract.isVerifiedDoctor(validAddress);
}

/**
 * Write a medical record (Doctor only)
 */
export async function writeRecord(patientAddress, ipfsHash) {
  const validAddress = validateAddress(patientAddress);
  const contract = getContract();
  const tx = await contract.writeRecord(validAddress, ipfsHash);
  const receipt = await tx.wait();
  return receipt;
}

/**
 * Get patient's own medical records
 */
export async function getMyRecords() {
  const contract = getContract();
  return await contract.getMyRecords();
}

/**
 * Read a patient's records (requires permission)
 */
export async function readRecords(patientAddress) {
  const validAddress = validateAddress(patientAddress);
  const contract = getContract();
  const tx = await contract.readRecords(validAddress);
  return await tx.wait();
}

/**
 * Grant access to a doctor
 */
export async function grantAccess(doctorAddress) {
  const validAddress = validateAddress(doctorAddress);
  const contract = getContract();
  const tx = await contract.grantAccess(validAddress);
  const receipt = await tx.wait();
  return receipt;
}

/**
 * Revoke access from a doctor
 */
export async function revokeAccess(doctorAddress) {
  const validAddress = validateAddress(doctorAddress);
  const contract = getContract();
  const tx = await contract.revokeAccess(validAddress);
  const receipt = await tx.wait();
  return receipt;
}

/**
 * Check if a doctor has access to my records
 */
export async function hasAccess(doctorAddress) {
  const validAddress = validateAddress(doctorAddress);
  const contract = getContract();
  return await contract.hasAccess(validAddress);
}

/**
 * Request emergency access to a patient's records (1-hour temporary access)
 * Only verified doctors can call this
 */
export async function requestEmergencyAccess(patientAddress) {
  const validAddress = validateAddress(patientAddress);
  const contract = getContract();
  const tx = await contract.emergencyAccess(validAddress);
  const receipt = await tx.wait();
  return receipt;
}

/**
 * Check if a doctor has valid emergency access to a patient's records
 */
export async function checkEmergencyAccess(patientAddress, doctorAddress) {
  const validPatient = validateAddress(patientAddress);
  const validDoctor = validateAddress(doctorAddress);
  const contract = getContract();
  return await contract.hasEmergencyAccess(validPatient, validDoctor);
}

/**
 * Get count of patient's records
 */
export async function getMyRecordsCount() {
  const contract = getContract();
  const count = await contract.getMyRecordsCount();
  return Number(count);
}

/**
 * Listen for contract events
 */
export function listenToEvents(eventName, callback) {
  const contract = getContract();
  contract.on(eventName, callback);
  return () => contract.off(eventName, callback);
}

/**
 * Format timestamp to readable date
 */
export function formatTimestamp(timestamp) {
  return new Date(Number(timestamp) * 1000).toLocaleString();
}

// ========== BILLING FUNCTIONS ==========

/**
 * Get billing contract instance
 */
export function getBillingContract() {
  if (!billingContract) {
    throw new Error('Billing contract not initialized. Connect wallet first.');
  }
  return billingContract;
}

/**
 * Get hospital/doctor credit balance
 * @param {string} address - Hospital/doctor address
 * @returns {number} Credit balance (negative = owes money)
 */
export async function getHospitalBalance(address) {
  const validAddress = validateAddress(address);
  const billing = getBillingContract();
  const balance = await billing.getHospitalBalance(validAddress);
  return Number(balance);
}

/**
 * Get current user's credit balance
 * @returns {number} Credit balance (negative = owes money)
 */
export async function getMyBalance() {
  const address = await getCurrentAddress();
  return await getHospitalBalance(address);
}

/**
 * Get total MC count issued by a hospital
 * @param {string} address - Hospital/doctor address
 * @returns {number} Number of MCs issued
 */
export async function getHospitalMCCount(address) {
  const validAddress = validateAddress(address);
  const billing = getBillingContract();
  const history = await billing.getHospitalMCHistory(validAddress);
  return history.length;
}

/**
 * Get all hospital balances (admin view)
 * @returns {Array} Array of {hospital, balance} objects
 */
export async function getAllHospitalBalances() {
  const billing = getBillingContract();
  const balances = await billing.getAllHospitalBalances();
  return balances.map(item => ({
    hospital: item.hospital,
    balance: Number(item.balance)
  }));
}

/**
 * Get total amount owed by all hospitals
 * @returns {number} Total credits owed (sum of negative balances)
 */
export async function getTotalOwed() {
  const balances = await getAllHospitalBalances();
  return balances
    .filter(b => b.balance < 0)
    .reduce((sum, b) => sum + Math.abs(b.balance), 0);
}

// ========== ADMIN FUNCTIONS ==========

/**
 * Get the current admin address
 * @returns {string} Admin address
 */
export async function getAdmin() {
  const contract = getContract();
  return await contract.admin();
}

/**
 * Get the pending admin address (if any)
 * @returns {string} Pending admin address or zero address
 */
export async function getPendingAdmin() {
  const contract = getContract();
  return await contract.pendingAdmin();
}

/**
 * Propose a new admin (Step 1 of 2-step transfer)
 * Only current admin can call this
 * @param {string} newAdminAddress - Address of proposed new admin
 */
export async function proposeAdmin(newAdminAddress) {
  const validAddress = validateAddress(newAdminAddress);
  const contract = getContract();
  const tx = await contract.proposeAdmin(validAddress);
  return await tx.wait();
}

/**
 * Accept admin role (Step 2 of 2-step transfer)
 * Only pending admin can call this
 */
export async function acceptAdmin() {
  const contract = getContract();
  const tx = await contract.acceptAdmin();
  return await tx.wait();
}

/**
 * Cancel a pending admin transfer
 * Only current admin can call this
 */
export async function cancelAdminTransfer() {
  const contract = getContract();
  const tx = await contract.cancelAdminTransfer();
  return await tx.wait();
}

/**
 * Add a verified doctor (admin only)
 * @param {string} doctorAddress - Address of doctor to verify
 */
export async function addVerifiedDoctor(doctorAddress) {
  const validAddress = validateAddress(doctorAddress);
  const contract = getContract();
  const tx = await contract.addVerifiedDoctor(validAddress);
  return await tx.wait();
}

/**
 * Remove a verified doctor (admin only)
 * @param {string} doctorAddress - Address of doctor to remove
 */
export async function removeVerifiedDoctor(doctorAddress) {
  const validAddress = validateAddress(doctorAddress);
  const contract = getContract();
  const tx = await contract.removeVerifiedDoctor(validAddress);
  return await tx.wait();
}

// ========== PUBLIC IMPACT STATS FUNCTIONS ==========

/**
 * Get total record statistics from RecordWritten events
 * Returns total count, latest timestamp, and latest transaction hash
 * @returns {Object} { totalRecords, latestTimestamp, latestTxHash, latestBlockNumber }
 */
export async function getTotalRecordStats() {
  // Create a read-only provider for public access (no wallet needed)
  let readProvider = provider;
  if (!readProvider && window.ethereum) {
    readProvider = new ethers.BrowserProvider(window.ethereum);
  } else if (!readProvider) {
    // Fallback to local Hardhat node for development
    readProvider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  }

  const readContract = new ethers.Contract(CONTRACT_ADDRESS, ContractABI.abi, readProvider);

  // Query all RecordWritten events from block 0 to latest
  const filter = readContract.filters.RecordWritten();
  const events = await readContract.queryFilter(filter, 0, 'latest');

  if (events.length === 0) {
    return {
      totalRecords: 0,
      latestTimestamp: null,
      latestTxHash: null,
      latestBlockNumber: null
    };
  }

  // Get the latest event
  const latestEvent = events[events.length - 1];
  const latestTimestamp = Number(latestEvent.args.timestamp);

  return {
    totalRecords: events.length,
    latestTimestamp,
    latestTxHash: latestEvent.transactionHash,
    latestBlockNumber: latestEvent.blockNumber
  };
}

/**
 * Get contract address for block explorer links
 * @returns {string} Contract address
 */
export function getContractAddress() {
  return CONTRACT_ADDRESS;
}

// ========== HOSPITAL NODE CONTROL FUNCTIONS ==========

/**
 * Check if a hospital is paused
 * @param {string} hospitalAddress - Address of the hospital to check
 * @returns {boolean} True if the hospital is paused
 */
export async function isHospitalPaused(hospitalAddress) {
  const validAddress = validateAddress(hospitalAddress);
  const contract = getContract();
  return await contract.isHospitalPaused(validAddress);
}

/**
 * Pause a hospital node (admin only)
 * Stops all MC issuance for this hospital
 * @param {string} hospitalAddress - Address of hospital to pause
 */
export async function pauseHospital(hospitalAddress) {
  const validAddress = validateAddress(hospitalAddress);
  const contract = getContract();
  const tx = await contract.pauseHospital(validAddress);
  return await tx.wait();
}

/**
 * Unpause a hospital node (admin only)
 * Resumes MC issuance for this hospital
 * @param {string} hospitalAddress - Address of hospital to unpause
 */
export async function unpauseHospital(hospitalAddress) {
  const validAddress = validateAddress(hospitalAddress);
  const contract = getContract();
  const tx = await contract.unpauseHospital(validAddress);
  return await tx.wait();
}
