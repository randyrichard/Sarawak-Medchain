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
