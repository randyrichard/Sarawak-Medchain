import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const FoundingMemberContext = createContext();

// Maximum founding members
const MAX_FOUNDING_MEMBERS = 10;

// Legacy pricing (locked for life)
const LEGACY_PRICING = {
  hospital: 10000, // RM 10,000/month
  clinic: 2000,    // RM 2,000/month
  perMC: 1,        // RM 1 per MC
};

// Storage key
const STORAGE_KEY = 'medchain_founding_members';

// Default founding members (first hospitals to join)
const DEFAULT_FOUNDING_MEMBERS = [
  {
    id: 1,
    memberNumber: '001',
    name: 'Timberland Medical Centre',
    wallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    location: 'Kuching',
    tier: 'Hospital',
    joinedAt: '2025-11-15T00:00:00Z',
    logo: null, // Would be URL in production
    legacyRate: LEGACY_PRICING.hospital,
    mcsIssued: 847,
  },
  {
    id: 2,
    memberNumber: '002',
    name: 'KPJ Kuching Specialist',
    wallet: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    location: 'Kuching',
    tier: 'Hospital',
    joinedAt: '2025-10-22T00:00:00Z',
    logo: null,
    legacyRate: LEGACY_PRICING.hospital,
    mcsIssued: 1203,
  },
  {
    id: 3,
    memberNumber: '003',
    name: 'Normah Medical Specialist',
    wallet: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    location: 'Kuching',
    tier: 'Hospital',
    joinedAt: '2025-12-01T00:00:00Z',
    logo: null,
    legacyRate: LEGACY_PRICING.hospital,
    mcsIssued: 523,
  },
  {
    id: 4,
    memberNumber: '004',
    name: 'Rejang Medical Centre',
    wallet: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    location: 'Sibu',
    tier: 'Hospital',
    joinedAt: '2026-01-05T00:00:00Z',
    logo: null,
    legacyRate: LEGACY_PRICING.hospital,
    mcsIssued: 312,
  },
  {
    id: 5,
    memberNumber: '005',
    name: 'Bintulu Medical Centre',
    wallet: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    location: 'Bintulu',
    tier: 'Hospital',
    joinedAt: '2026-01-10T00:00:00Z',
    logo: null,
    legacyRate: LEGACY_PRICING.hospital,
    mcsIssued: 156,
  },
];

export function FoundingMemberProvider({ children }) {
  const [foundingMembers, setFoundingMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load founding members from localStorage or use defaults
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setFoundingMembers(JSON.parse(stored));
      } catch (e) {
        setFoundingMembers(DEFAULT_FOUNDING_MEMBERS);
      }
    } else {
      setFoundingMembers(DEFAULT_FOUNDING_MEMBERS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_FOUNDING_MEMBERS));
    }
    setIsLoading(false);
  }, []);

  // Check if a wallet is a founding member
  const isFoundingMember = useCallback((walletAddress) => {
    if (!walletAddress) return false;
    return foundingMembers.some(
      m => m.wallet.toLowerCase() === walletAddress.toLowerCase()
    );
  }, [foundingMembers]);

  // Get founding member details by wallet
  const getFoundingMemberByWallet = useCallback((walletAddress) => {
    if (!walletAddress) return null;
    return foundingMembers.find(
      m => m.wallet.toLowerCase() === walletAddress.toLowerCase()
    );
  }, [foundingMembers]);

  // Get founding member number (e.g., "001")
  const getFoundingMemberNumber = useCallback((walletAddress) => {
    const member = getFoundingMemberByWallet(walletAddress);
    return member ? member.memberNumber : null;
  }, [getFoundingMemberByWallet]);

  // Get remaining founding member slots
  const getRemainingSlots = useCallback(() => {
    return MAX_FOUNDING_MEMBERS - foundingMembers.length;
  }, [foundingMembers]);

  // Check if founding slots are still available
  const hasAvailableSlots = useCallback(() => {
    return foundingMembers.length < MAX_FOUNDING_MEMBERS;
  }, [foundingMembers]);

  // Add a new founding member (if slots available)
  const addFoundingMember = useCallback((hospitalData) => {
    if (!hasAvailableSlots()) {
      return { success: false, error: 'No founding member slots available' };
    }

    const memberNumber = String(foundingMembers.length + 1).padStart(3, '0');
    const newMember = {
      id: foundingMembers.length + 1,
      memberNumber,
      name: hospitalData.name,
      wallet: hospitalData.wallet,
      location: hospitalData.location,
      tier: hospitalData.tier || 'Hospital',
      joinedAt: new Date().toISOString(),
      logo: hospitalData.logo || null,
      legacyRate: hospitalData.tier === 'Clinic' ? LEGACY_PRICING.clinic : LEGACY_PRICING.hospital,
      mcsIssued: 0,
    };

    const updated = [...foundingMembers, newMember];
    setFoundingMembers(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    return { success: true, member: newMember };
  }, [foundingMembers, hasAvailableSlots]);

  // Get legacy pricing for a wallet
  const getLegacyPricing = useCallback((walletAddress) => {
    const member = getFoundingMemberByWallet(walletAddress);
    if (member) {
      return {
        isLegacy: true,
        monthlyRate: member.legacyRate,
        perMC: LEGACY_PRICING.perMC,
        lockedForLife: true,
      };
    }
    return {
      isLegacy: false,
      monthlyRate: null,
      perMC: null,
      lockedForLife: false,
    };
  }, [getFoundingMemberByWallet]);

  // Update founding member MC count
  const updateMCCount = useCallback((walletAddress, count) => {
    const updated = foundingMembers.map(m => {
      if (m.wallet.toLowerCase() === walletAddress.toLowerCase()) {
        return { ...m, mcsIssued: count };
      }
      return m;
    });
    setFoundingMembers(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, [foundingMembers]);

  const value = {
    foundingMembers,
    isLoading,
    isFoundingMember,
    getFoundingMemberByWallet,
    getFoundingMemberNumber,
    getRemainingSlots,
    hasAvailableSlots,
    addFoundingMember,
    getLegacyPricing,
    updateMCCount,
    MAX_FOUNDING_MEMBERS,
    LEGACY_PRICING,
  };

  return (
    <FoundingMemberContext.Provider value={value}>
      {children}
    </FoundingMemberContext.Provider>
  );
}

export function useFoundingMember() {
  const context = useContext(FoundingMemberContext);
  if (!context) {
    throw new Error('useFoundingMember must be used within a FoundingMemberProvider');
  }
  return context;
}

export default FoundingMemberContext;
