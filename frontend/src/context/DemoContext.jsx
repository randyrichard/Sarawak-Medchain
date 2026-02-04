import { createContext, useContext, useState, useEffect } from 'react';

const DemoContext = createContext();

// Demo wallet addresses for different roles (valid Ethereum address format)
export const DEMO_WALLETS = {
  doctor: '0x70997970C51812dc3A010C7d01b50e0d17dc79c8',
  patient: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  admin: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
};

// Demo doctor info for display
export const DEMO_DOCTOR_INFO = {
  name: 'Dr. Sarah Lim',
  mmcNumber: 'MMC-45678',
  hospital: 'Timberland Medical Centre',
  specialty: 'General Practitioner',
  isVerified: true,
};

// Demo MC data
export const DEMO_MCS = [
  {
    id: 'MC-2026-0001',
    patientName: 'Ahmad bin Hassan',
    patientIC: '901201-13-5678',
    doctor: 'Dr. Sarah Lim',
    doctorMMC: 'MMC-45678',
    hospital: 'Timberland Medical Centre',
    dateIssued: '30 Jan 2026',
    mcDays: 2,
    startDate: '30 Jan 2026',
    endDate: '31 Jan 2026',
    diagnosis: 'Upper Respiratory Tract Infection',
    txHash: '0x7a3f8c2d9e4b1a6f3c8d2e5a9b7f4c1d8e3a6b9c2d5f8a1e4b7c0d3f6a9e2b5c8d',
    blockNumber: 8234567,
    timestamp: new Date().toISOString(),
  },
  {
    id: 'MC-2026-0002',
    patientName: 'Siti Nurhaliza',
    patientIC: '850415-13-1234',
    doctor: 'Dr. Wong Mei Ling',
    doctorMMC: 'MMC-34567',
    hospital: 'Normah Medical Specialist Centre',
    dateIssued: '28 Jan 2026',
    mcDays: 3,
    startDate: '28 Jan 2026',
    endDate: '30 Jan 2026',
    diagnosis: 'Acute Gastroenteritis',
    txHash: '0x8b4g9d3e0f5c2b7a1d6e4f8c3b9a2d5e7f1c4b8a3d6e9f2c5b8a1d4e7f0c3b6a9d',
    blockNumber: 8234123,
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export function DemoProvider({ children }) {
  const [isDemoMode, setIsDemoMode] = useState(() => {
    // Check localStorage on init
    return localStorage.getItem('medchain_demo_mode') === 'true';
  });

  const [demoRole, setDemoRole] = useState(() => {
    return localStorage.getItem('medchain_demo_role') || 'doctor';
  });

  const [demoMCs, setDemoMCs] = useState(DEMO_MCS);

  // Persist demo mode to localStorage
  useEffect(() => {
    localStorage.setItem('medchain_demo_mode', isDemoMode.toString());
  }, [isDemoMode]);

  useEffect(() => {
    localStorage.setItem('medchain_demo_role', demoRole);
  }, [demoRole]);

  const enterDemoMode = (role = 'doctor') => {
    // Set localStorage IMMEDIATELY (synchronous) so routing can read it right away
    localStorage.setItem('medchain_demo_mode', 'true');
    localStorage.setItem('medchain_demo_role', role);
    // Also update React state
    setIsDemoMode(true);
    setDemoRole(role);
  };

  const exitDemoMode = () => {
    setIsDemoMode(false);
    localStorage.removeItem('medchain_demo_mode');
    localStorage.removeItem('medchain_demo_role');
  };

  const getDemoWallet = () => {
    return DEMO_WALLETS[demoRole] || DEMO_WALLETS.doctor;
  };

  const addDemoMC = (mc) => {
    const newMC = {
      ...mc,
      id: `MC-2026-${String(demoMCs.length + 1).padStart(4, '0')}`,
      txHash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
      blockNumber: 8234567 + demoMCs.length,
      timestamp: new Date().toISOString(),
    };
    setDemoMCs(prev => [newMC, ...prev]);
    return newMC;
  };

  return (
    <DemoContext.Provider value={{
      isDemoMode,
      demoRole,
      demoMCs,
      enterDemoMode,
      exitDemoMode,
      getDemoWallet,
      addDemoMC,
      setDemoRole,
    }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error('useDemo must be used within a DemoProvider');
  }
  return context;
}

export default DemoContext;
