import { ethers } from 'ethers';
import ContractABI from '../SarawakMedMVP.json';
import { getReadOnlyProvider } from './mcRegistry';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3';

// Where each role lands after login
export const ROLE_HOME = {
  admin: '/admin',
  doctor: '/doctor',
  patient: '/patient',
};

// Which portals each role may open.
// The admin wallet is the platform owner (Sarawak MedChain company), so it
// also gets the CEO/business dashboards.
export const ROLE_ACCESS = {
  admin: ['/admin', '/ceo', '/ceo-dashboard'],
  doctor: ['/doctor'],
  patient: ['/patient'],
};

export function canAccess(role, path) {
  const allowed = ROLE_ACCESS[role] || [];
  return allowed.some(p => path === p || path.startsWith(p + '/'));
}

export function roleLabel(role) {
  return { admin: 'Administrator', doctor: 'Verified Doctor', patient: 'Patient' }[role] || 'Patient';
}

/**
 * Resolve a wallet's role from the blockchain:
 * - contract admin        -> 'admin'   (Medical Council / platform owner)
 * - verified doctor       -> 'doctor'
 * - any other wallet      -> 'patient'
 *
 * Uses a read-only provider so it works right after connect, before the
 * signer-bound contract is initialized. Falls back to 'patient' if the
 * chain is unreachable (e.g. contract not deployed yet).
 */
export async function resolveRole(walletAddress) {
  if (!walletAddress) return 'patient';
  try {
    const provider = getReadOnlyProvider();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ContractABI.abi, provider);
    const [adminAddr, isDoctor] = await Promise.all([
      contract.admin(),
      contract.isVerifiedDoctor(walletAddress),
    ]);
    if (adminAddr.toLowerCase() === walletAddress.toLowerCase()) return 'admin';
    if (isDoctor) return 'doctor';
    return 'patient';
  } catch (err) {
    console.warn('Role resolution failed, defaulting to patient:', err.message);
    return 'patient';
  }
}
