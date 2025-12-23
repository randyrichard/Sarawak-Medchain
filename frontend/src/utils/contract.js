import { ethers } from 'ethers';
import ContractABI from '../SarawakMedMVP.json';

// Update this with your deployed contract address
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3';

let provider;
let signer;
let contract;

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

    // Initialize contract
    contract = new ethers.Contract(CONTRACT_ADDRESS, ContractABI.abi, signer);

    console.log('Connected to wallet:', address);
    console.log('Contract address:', CONTRACT_ADDRESS);

    return { address, contract };
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
  const contract = getContract();
  return await contract.isVerifiedDoctor(address);
}

/**
 * Write a medical record (Doctor only)
 */
export async function writeRecord(patientAddress, ipfsHash) {
  const contract = getContract();
  const tx = await contract.writeRecord(patientAddress, ipfsHash);
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
  const contract = getContract();
  const tx = await contract.readRecords(patientAddress);
  return await tx.wait();
}

/**
 * Grant access to a doctor
 */
export async function grantAccess(doctorAddress) {
  const contract = getContract();
  const tx = await contract.grantAccess(doctorAddress);
  const receipt = await tx.wait();
  return receipt;
}

/**
 * Revoke access from a doctor
 */
export async function revokeAccess(doctorAddress) {
  const contract = getContract();
  const tx = await contract.revokeAccess(doctorAddress);
  const receipt = await tx.wait();
  return receipt;
}

/**
 * Check if a doctor has access to my records
 */
export async function hasAccess(doctorAddress) {
  const contract = getContract();
  return await contract.hasAccess(doctorAddress);
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
