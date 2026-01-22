import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { pauseHospital, unpauseHospital } from '../utils/contract';
import { sendBroadcast, clearBroadcast } from '../components/BroadcastNotification';
import { MaintenanceSchedulerButton, ServiceNotificationsPanel } from '../components/ServiceNotifications';
import { LiveViewersPanel, AlertHistoryPanel } from '../components/CEOLeadAlerts';
import ConversionHeatmap, { LeadFunnel } from '../components/ConversionHeatmap';
import { useLeadAnalytics } from '../context/LeadAnalyticsContext';
import { SoundToggleButton, TestPaymentButton } from '../components/RevenueAlertToast';
import { useRevenueAlert } from '../context/RevenueAlertContext';
import DisasterRecoveryDashboard, { MiniDRStatus } from '../components/DisasterRecoveryDashboard';
import { useDisasterRecovery } from '../context/DisasterRecoveryContext';

// FOUNDER WALLET ADDRESS - Only this address can access this dashboard
const FOUNDER_WALLET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Your wallet

// Terminal Theme - Master: #0a0e14
const theme = {
  bg: '#0a0e14',
  bgCard: '#0a0e14',
  border: '#1e3a5f',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  accent: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  gold: '#fbbf24',
  cyan: '#06b6d4',
};

// City coordinates on the Sarawak map (relative positions)
const CITY_POSITIONS = {
  'Kuching': { x: 18, y: 75, hospitals: 3 },
  'Sibu': { x: 52, y: 55, hospitals: 1 },
  'Bintulu': { x: 68, y: 42, hospitals: 1 },
  'Miri': { x: 82, y: 25, hospitals: 0 },
};

// Hospital/Lead data with location mapping
const FACILITIES_DATA = [
  {
    id: 1,
    name: 'Timberland Medical Centre',
    wallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    location: 'Kuching',
    tier: 'Hospital',
    monthlyFee: 10000,
    mcsThisMonth: 847,
    variableFee: 847,
    totalRevenue: 10847,
    doctors: 12,
    status: 'active', // Green pulse
    joinedDate: '2025-11-15',
    lastActivity: '2 min ago',
    paid: true,
  },
  {
    id: 2,
    name: 'KPJ Kuching Specialist',
    wallet: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    location: 'Kuching',
    tier: 'Hospital',
    monthlyFee: 10000,
    mcsThisMonth: 1203,
    variableFee: 1203,
    totalRevenue: 11203,
    doctors: 18,
    status: 'active',
    joinedDate: '2025-10-22',
    lastActivity: '5 min ago',
    paid: true,
  },
  {
    id: 3,
    name: 'Normah Medical Specialist',
    wallet: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    location: 'Kuching',
    tier: 'Hospital',
    monthlyFee: 10000,
    mcsThisMonth: 523,
    variableFee: 523,
    totalRevenue: 10523,
    doctors: 8,
    status: 'active',
    joinedDate: '2025-12-01',
    lastActivity: '15 min ago',
    paid: true,
  },
  {
    id: 4,
    name: 'Rejang Medical Centre',
    wallet: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    location: 'Sibu',
    tier: 'Hospital',
    monthlyFee: 10000,
    mcsThisMonth: 312,
    variableFee: 312,
    totalRevenue: 10312,
    doctors: 6,
    status: 'active',
    joinedDate: '2026-01-05',
    lastActivity: '1 hour ago',
    paid: true,
  },
  {
    id: 5,
    name: 'Bintulu Medical Centre',
    wallet: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    location: 'Bintulu',
    tier: 'Clinic',
    monthlyFee: 2000,
    mcsThisMonth: 156,
    variableFee: 156,
    totalRevenue: 2156,
    doctors: 3,
    status: 'lead', // Gold pulse - signed but not paid
    joinedDate: '2026-01-10',
    lastActivity: '3 hours ago',
    paid: false,
  },
  {
    id: 6,
    name: 'Miri City Medical',
    wallet: null,
    location: 'Miri',
    tier: 'Hospital',
    monthlyFee: 10000,
    mcsThisMonth: 0,
    variableFee: 0,
    totalRevenue: 0,
    doctors: 0,
    status: 'lead', // Gold pulse - high-value lead
    joinedDate: null,
    lastActivity: 'Proposal sent',
    paid: false,
  },
];

// Generate mock live transactions
const generateLiveTransaction = (hospitals) => {
  const activeHospitals = hospitals.filter(h => h.status === 'active');
  if (activeHospitals.length === 0) return null;

  const hospital = activeHospitals[Math.floor(Math.random() * activeHospitals.length)];
  const doctors = ['Dr. Ahmad', 'Dr. Sarah', 'Dr. Wong', 'Dr. Kumar', 'Dr. Fatimah', 'Dr. Lee', 'Dr. Tan'];
  const doctor = doctors[Math.floor(Math.random() * doctors.length)];

  return {
    id: Date.now(),
    hospital: hospital.name,
    location: hospital.location,
    doctor,
    amount: 1.00,
    timestamp: new Date(),
  };
};

// Sarawak Map SVG Component
function SarawakMap({ facilities, clientView }) {
  // Group facilities by location
  const locationData = {};
  facilities.forEach(f => {
    if (!locationData[f.location]) {
      locationData[f.location] = { active: 0, leads: 0, revenue: 0 };
    }
    if (f.status === 'active') {
      locationData[f.location].active++;
      locationData[f.location].revenue += f.totalRevenue;
    } else {
      locationData[f.location].leads++;
    }
  });

  return (
    <div className="relative w-full h-full">
      {/* SVG Map of Sarawak */}
      <svg viewBox="0 0 100 100" className="w-full h-full" style={{ filter: 'drop-shadow(0 0 20px rgba(6, 182, 212, 0.3))' }}>
        {/* Grid lines for tech effect */}
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(6, 182, 212, 0.1)" strokeWidth="0.2"/>
          </pattern>
          <linearGradient id="mapGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(6, 182, 212, 0.15)" />
            <stop offset="100%" stopColor="rgba(59, 130, 246, 0.1)" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Background grid */}
        <rect width="100" height="100" fill="url(#grid)" />

        {/* Simplified Sarawak outline */}
        <path
          d="M 5 80
             C 8 75, 12 72, 15 70
             L 20 68 L 25 72 L 30 70 L 35 65
             L 40 62 L 45 58 L 50 55
             L 55 50 L 60 45 L 65 40
             L 70 35 L 75 28 L 80 22
             L 85 18 L 90 15 L 95 12
             L 98 15 L 95 25 L 92 35
             L 88 45 L 85 52 L 80 58
             L 75 62 L 70 65 L 65 70
             L 60 72 L 55 75 L 50 78
             L 45 82 L 40 85 L 35 87
             L 30 88 L 25 87 L 20 85
             L 15 83 L 10 82 Z"
          fill="url(#mapGradient)"
          stroke={theme.cyan}
          strokeWidth="0.5"
          filter="url(#glow)"
        />

        {/* Rivers */}
        <path
          d="M 20 75 Q 30 70, 40 72 Q 50 68, 55 60"
          fill="none"
          stroke="rgba(6, 182, 212, 0.3)"
          strokeWidth="0.3"
          strokeDasharray="2 1"
        />
        <path
          d="M 50 55 Q 55 50, 58 45"
          fill="none"
          stroke="rgba(6, 182, 212, 0.3)"
          strokeWidth="0.3"
          strokeDasharray="2 1"
        />
      </svg>

      {/* City Pulse Points */}
      {Object.entries(CITY_POSITIONS).map(([city, pos]) => {
        const data = locationData[city] || { active: 0, leads: 0, revenue: 0 };
        const hasActive = data.active > 0;
        const hasLeads = data.leads > 0;
        const pulseColor = hasActive ? theme.success : hasLeads ? theme.gold : 'rgba(100,100,100,0.3)';

        return (
          <div
            key={city}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            {/* Outer pulse rings */}
            {(hasActive || hasLeads) && (
              <>
                <div
                  className="absolute w-16 h-16 rounded-full animate-ping"
                  style={{
                    backgroundColor: pulseColor,
                    opacity: 0.2,
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    animationDuration: '2s',
                  }}
                />
                <div
                  className="absolute w-12 h-12 rounded-full animate-ping"
                  style={{
                    backgroundColor: pulseColor,
                    opacity: 0.3,
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    animationDuration: '2s',
                    animationDelay: '0.5s',
                  }}
                />
              </>
            )}

            {/* Core dot */}
            <div
              className="relative w-4 h-4 rounded-full border-2 flex items-center justify-center"
              style={{
                backgroundColor: pulseColor,
                borderColor: hasActive ? theme.success : hasLeads ? theme.gold : theme.textMuted,
                boxShadow: hasActive || hasLeads ? `0 0 20px ${pulseColor}` : 'none',
              }}
            />

            {/* City label */}
            <div className="absolute top-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
              <p className="text-xs font-bold" style={{ color: theme.textPrimary, textShadow: '0 0 10px rgba(0,0,0,0.8)' }}>
                {city}
              </p>
              {!clientView && (hasActive || hasLeads) && (
                <p className="text-xs text-center" style={{ color: hasActive ? theme.success : theme.gold }}>
                  {hasActive ? `${data.active} active` : `${data.leads} lead${data.leads > 1 ? 's' : ''}`}
                </p>
              )}
            </div>

            {/* Hover tooltip */}
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
              <div className="bg-slate-900 border border-cyan-500/30 rounded-lg p-3 shadow-xl min-w-[180px]">
                <p className="text-sm font-bold text-white mb-2">{city}</p>
                {!clientView ? (
                  <>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: theme.textMuted }}>Active:</span>
                      <span style={{ color: theme.success }}>{data.active} hospitals</span>
                    </div>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: theme.textMuted }}>Leads:</span>
                      <span style={{ color: theme.gold }}>{data.leads} pending</span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-slate-700 pt-1 mt-1">
                      <span style={{ color: theme.textMuted }}>Revenue:</span>
                      <span style={{ color: theme.success }}>RM {data.revenue.toLocaleString()}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-xs" style={{ color: theme.textMuted }}>
                    {data.active + data.leads} facilities
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Map Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700 rounded-lg p-3">
        <p className="text-xs font-bold text-white mb-2">Legend</p>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.success, boxShadow: `0 0 8px ${theme.success}` }} />
          <span className="text-xs" style={{ color: theme.textSecondary }}>Active Hospital</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.gold, boxShadow: `0 0 8px ${theme.gold}` }} />
          <span className="text-xs" style={{ color: theme.textSecondary }}>High-Value Lead</span>
        </div>
      </div>
    </div>
  );
}

// Live Profit Ticker Component
function LiveProfitTicker({ transactions, clientView }) {
  const tickerRef = useRef(null);

  if (clientView) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 overflow-hidden" style={{ backgroundColor: 'rgba(3, 7, 18, 0.95)', borderTop: `1px solid ${theme.border}` }}>
      <div className="flex items-center h-10">
        {/* Live indicator */}
        <div className="flex items-center gap-2 px-4 border-r" style={{ borderColor: theme.border }}>
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-bold text-red-400">LIVE</span>
        </div>

        {/* Scrolling ticker */}
        <div className="flex-1 overflow-hidden relative">
          <div
            ref={tickerRef}
            className="flex items-center gap-8 animate-scroll whitespace-nowrap"
            style={{
              animation: 'scroll 30s linear infinite',
            }}
          >
            {transactions.map((tx, idx) => (
              <div key={tx.id || idx} className="flex items-center gap-3 px-4">
                <span className="text-emerald-400 font-bold">+RM {tx.amount.toFixed(2)}</span>
                <span style={{ color: theme.textMuted }}>|</span>
                <span style={{ color: theme.textSecondary }}>{tx.hospital}</span>
                <span style={{ color: theme.textMuted }}>•</span>
                <span style={{ color: theme.cyan }}>{tx.doctor}</span>
                <span style={{ color: theme.textMuted }}>•</span>
                <span className="text-xs" style={{ color: theme.textMuted }}>
                  {tx.timestamp.toLocaleTimeString()}
                </span>
              </div>
            ))}
            {/* Duplicate for seamless loop */}
            {transactions.map((tx, idx) => (
              <div key={`dup-${tx.id || idx}`} className="flex items-center gap-3 px-4">
                <span className="text-emerald-400 font-bold">+RM {tx.amount.toFixed(2)}</span>
                <span style={{ color: theme.textMuted }}>|</span>
                <span style={{ color: theme.textSecondary }}>{tx.hospital}</span>
                <span style={{ color: theme.textMuted }}>•</span>
                <span style={{ color: theme.cyan }}>{tx.doctor}</span>
                <span style={{ color: theme.textMuted }}>•</span>
                <span className="text-xs" style={{ color: theme.textMuted }}>
                  {tx.timestamp.toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Total today */}
        <div className="flex items-center gap-2 px-4 border-l" style={{ borderColor: theme.border }}>
          <span className="text-xs" style={{ color: theme.textMuted }}>Today:</span>
          <span className="font-bold text-emerald-400">RM {(transactions.length * 1).toLocaleString()}</span>
        </div>
      </div>

      {/* CSS for scroll animation */}
      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
      `}</style>
    </div>
  );
}

// Kill Switch Confirmation Modal
function KillSwitchModal({ isOpen, hospital, action, onConfirm, onCancel, isProcessing }) {
  if (!isOpen || !hospital) return null;

  const isPausing = action === 'pause';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <div className="relative bg-slate-900 border border-red-500/30 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        {/* Warning Icon */}
        <div className="flex justify-center mb-6">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
            isPausing ? 'bg-red-500/20' : 'bg-emerald-500/20'
          }`}>
            {isPausing ? (
              <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
        </div>

        {/* Title */}
        <h2 className={`text-2xl font-bold text-center mb-2 ${isPausing ? 'text-red-400' : 'text-emerald-400'}`}>
          {isPausing ? 'Shut Down Node?' : 'Reactivate Node?'}
        </h2>

        {/* Hospital Name */}
        <p className="text-center text-white font-semibold text-lg mb-4">
          {hospital.name}
        </p>

        {/* Warning Message */}
        <div className={`p-4 rounded-xl mb-6 ${isPausing ? 'bg-red-500/10 border border-red-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
          {isPausing ? (
            <p className="text-sm text-red-300 text-center">
              This will <strong>immediately stop all MC issuance</strong> for this hospital.
              Doctors will see a suspension notice when they try to log in.
            </p>
          ) : (
            <p className="text-sm text-emerald-300 text-center">
              This will <strong>restore MC issuance</strong> for this hospital.
              Doctors will be able to issue MCs again immediately.
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-4">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1 px-6 py-3 rounded-xl border border-slate-600 text-slate-300 font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isProcessing}
            className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
              isPausing
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white'
            }`}
          >
            {isProcessing ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Processing...
              </>
            ) : isPausing ? (
              'Shut Down'
            ) : (
              'Reactivate'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CEOMainDashboard({ walletAddress }) {
  const [facilities, setFacilities] = useState(FACILITIES_DATA);
  const [transactions, setTransactions] = useState([]);
  const [clientView, setClientView] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('month');

  // Kill Switch Modal State
  const [killSwitchModal, setKillSwitchModal] = useState({ isOpen: false, hospital: null, action: null });
  const [isProcessingKillSwitch, setIsProcessingKillSwitch] = useState(false);

  // Global Kill Switch State
  const [globalKillSwitchActive, setGlobalKillSwitchActive] = useState(false);
  const [showGlobalKillConfirm, setShowGlobalKillConfirm] = useState(false);
  const [isProcessingGlobalKill, setIsProcessingGlobalKill] = useState(false);
  const [nodeStatuses, setNodeStatuses] = useState({});

  // Broadcast State
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastDuration, setBroadcastDuration] = useState(24);
  const [broadcastPriority, setBroadcastPriority] = useState('normal');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [activeBroadcast, setActiveBroadcast] = useState(null);

  // Invoice State
  const [isGeneratingInvoices, setIsGeneratingInvoices] = useState(false);
  const [isSendingInvoices, setIsSendingInvoices] = useState(false);
  const [invoiceHistory, setInvoiceHistory] = useState([]);
  const [currentBatch, setCurrentBatch] = useState(null);
  const [founderAlerts, setFounderAlerts] = useState([]);

  // Profit Chart State
  const [showProjection, setShowProjection] = useState(false);

  // Check if current wallet is the founder
  const isFounder = walletAddress?.toLowerCase() === FOUNDER_WALLET.toLowerCase();

  // Revenue Alert Context
  const { revenueData, getMRRProgress, isSoundEnabled } = useRevenueAlert();
  const mrrProgress = getMRRProgress();

  // Initialize node statuses from localStorage (for demo) or blockchain
  useEffect(() => {
    const savedStatuses = localStorage.getItem('medchain_node_statuses');
    if (savedStatuses) {
      setNodeStatuses(JSON.parse(savedStatuses));
    }
  }, []);

  // Handle kill switch toggle
  const handleKillSwitchClick = (hospital, currentStatus) => {
    const action = currentStatus ? 'unpause' : 'pause';
    setKillSwitchModal({ isOpen: true, hospital, action });
  };

  // Confirm kill switch action
  const handleConfirmKillSwitch = async () => {
    const { hospital, action } = killSwitchModal;
    if (!hospital) return;

    setIsProcessingKillSwitch(true);

    try {
      // In production, this would call the smart contract
      // For demo, we simulate with localStorage
      const newStatuses = {
        ...nodeStatuses,
        [hospital.wallet]: action === 'pause',
      };

      // Simulate blockchain delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Try to call the actual contract (will fail if not connected)
      try {
        if (action === 'pause') {
          await pauseHospital(hospital.wallet);
        } else {
          await unpauseHospital(hospital.wallet);
        }
      } catch (contractError) {
        console.log('Contract call failed (demo mode):', contractError.message);
      }

      setNodeStatuses(newStatuses);
      localStorage.setItem('medchain_node_statuses', JSON.stringify(newStatuses));

      // Update facilities status
      setFacilities(prev => prev.map(f => {
        if (f.wallet === hospital.wallet) {
          return { ...f, nodeStatus: action === 'pause' ? 'paused' : 'active' };
        }
        return f;
      }));

      setKillSwitchModal({ isOpen: false, hospital: null, action: null });
    } catch (error) {
      console.error('Kill switch error:', error);
      alert('Failed to update node status. Please try again.');
    } finally {
      setIsProcessingKillSwitch(false);
    }
  };

  // Cancel kill switch
  const handleCancelKillSwitch = () => {
    setKillSwitchModal({ isOpen: false, hospital: null, action: null });
  };

  // Global Kill Switch - Emergency network shutdown
  const handleGlobalKillSwitch = async () => {
    setIsProcessingGlobalKill(true);
    try {
      if (globalKillSwitchActive) {
        // Restore all nodes
        for (const facility of facilities) {
          try {
            await unpauseHospital(facility.wallet);
          } catch (e) {
            console.log(`Could not unpause ${facility.name}:`, e);
          }
        }
        // Clear localStorage statuses
        localStorage.removeItem('medchain_node_statuses');
        setGlobalKillSwitchActive(false);

        // Send service restored notification
        const notifications = JSON.parse(localStorage.getItem('medchain_service_notifications') || '[]');
        notifications.unshift({
          id: `notif-${Date.now()}`,
          type: 'service_restored',
          title: 'Network Restored',
          message: 'All hospital nodes have been reactivated. Network is fully operational.',
          timestamp: new Date().toISOString(),
          read: false,
        });
        localStorage.setItem('medchain_service_notifications', JSON.stringify(notifications));
      } else {
        // Pause all nodes
        const statuses = {};
        for (const facility of facilities) {
          try {
            await pauseHospital(facility.wallet);
            statuses[facility.wallet] = true;
          } catch (e) {
            console.log(`Could not pause ${facility.name}:`, e);
          }
        }
        localStorage.setItem('medchain_node_statuses', JSON.stringify(statuses));
        setGlobalKillSwitchActive(true);
      }
    } catch (error) {
      console.error('Global kill switch error:', error);
    } finally {
      setIsProcessingGlobalKill(false);
      setShowGlobalKillConfirm(false);
    }
  };

  // Check global kill switch status on mount
  useEffect(() => {
    const savedStatuses = localStorage.getItem('medchain_node_statuses');
    if (savedStatuses) {
      const statuses = JSON.parse(savedStatuses);
      // If more than half of facilities are paused, consider global kill active
      const pausedCount = Object.keys(statuses).length;
      if (pausedCount >= facilities.length / 2) {
        setGlobalKillSwitchActive(true);
      }
    }
  }, []);

  // Check if a node is paused
  const isNodePaused = (wallet) => {
    return nodeStatuses[wallet] || false;
  };

  // Check for active broadcast on mount
  useEffect(() => {
    const checkActiveBroadcast = () => {
      const stored = localStorage.getItem('medchain_broadcast');
      if (stored) {
        const data = JSON.parse(stored);
        if (data.expiresAt && Date.now() < data.expiresAt) {
          setActiveBroadcast(data);
        } else {
          setActiveBroadcast(null);
        }
      } else {
        setActiveBroadcast(null);
      }
    };

    checkActiveBroadcast();
    const interval = setInterval(checkActiveBroadcast, 5000);
    return () => clearInterval(interval);
  }, []);

  // Handle broadcast submission
  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) return;

    setIsBroadcasting(true);
    try {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 800));

      const broadcast = sendBroadcast({
        message: broadcastMessage.trim(),
        duration: broadcastDuration,
        priority: broadcastPriority,
      });

      setActiveBroadcast(broadcast);
      setBroadcastMessage('');
      setBroadcastPriority('normal');
    } catch (error) {
      console.error('Broadcast error:', error);
      alert('Failed to send broadcast. Please try again.');
    } finally {
      setIsBroadcasting(false);
    }
  };

  // Handle clear broadcast
  const handleClearBroadcast = () => {
    clearBroadcast();
    setActiveBroadcast(null);
  };

  // Format expiration time
  const formatExpirationTime = (expiresAt) => {
    if (!expiresAt) return '';
    const date = new Date(expiresAt);
    return date.toLocaleString('en-MY', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Load invoice history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('medchain_invoice_history');
    if (savedHistory) {
      setInvoiceHistory(JSON.parse(savedHistory));
    }
    const savedAlerts = localStorage.getItem('medchain_founder_alerts');
    if (savedAlerts) {
      setFounderAlerts(JSON.parse(savedAlerts));
    }
  }, []);

  // Generate monthly invoices
  const handleGenerateInvoices = async () => {
    setIsGeneratingInvoices(true);
    try {
      const now = new Date();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
      const billingPeriod = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Generate invoices for all active facilities
      const invoices = facilities.filter(f => f.wallet && f.status === 'active').map((f, idx) => ({
        invoiceNumber: `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(idx + 1).padStart(3, '0')}`,
        hospitalId: f.id,
        hospitalName: f.name,
        walletAddress: f.wallet,
        billingPeriod,
        issueDate: now.toISOString(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        baseFee: f.monthlyFee,
        mcCount: f.mcsThisMonth,
        variableFee: f.mcsThisMonth * 1.00,
        total: f.monthlyFee + (f.mcsThisMonth * 1.00),
        status: 'generated',
      }));

      const totalBilled = invoices.reduce((sum, inv) => sum + inv.total, 0);

      const batch = {
        id: `BATCH-${Date.now()}`,
        generatedAt: now.toISOString(),
        billingPeriod,
        invoiceCount: invoices.length,
        totalBilled,
        invoices,
        status: 'generated',
      };

      setCurrentBatch(batch);

      // Add to history
      const newHistory = [batch, ...invoiceHistory];
      setInvoiceHistory(newHistory);
      localStorage.setItem('medchain_invoice_history', JSON.stringify(newHistory));

    } catch (error) {
      console.error('Error generating invoices:', error);
      alert('Failed to generate invoices. Please try again.');
    } finally {
      setIsGeneratingInvoices(false);
    }
  };

  // Send invoices via email
  const handleSendInvoices = async () => {
    if (!currentBatch) return;

    setIsSendingInvoices(true);
    try {
      // Simulate email sending delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Update batch status
      const updatedBatch = { ...currentBatch, status: 'sent' };
      setCurrentBatch(updatedBatch);

      // Update history
      const newHistory = invoiceHistory.map(b =>
        b.id === currentBatch.id ? updatedBatch : b
      );
      setInvoiceHistory(newHistory);
      localStorage.setItem('medchain_invoice_history', JSON.stringify(newHistory));

      // Create founder alert
      const alert = {
        id: `alert-${Date.now()}`,
        type: 'invoice_sent',
        title: 'Invoices Sent',
        message: `RM ${currentBatch.totalBilled.toLocaleString()} total billing initiated for ${currentBatch.billingPeriod}`,
        timestamp: new Date().toISOString(),
        read: false,
      };

      const newAlerts = [alert, ...founderAlerts];
      setFounderAlerts(newAlerts);
      localStorage.setItem('medchain_founder_alerts', JSON.stringify(newAlerts));

      // Clear current batch after sending
      setTimeout(() => setCurrentBatch(null), 3000);

    } catch (error) {
      console.error('Error sending invoices:', error);
      alert('Failed to send invoices. Please try again.');
    } finally {
      setIsSendingInvoices(false);
    }
  };

  // Dismiss founder alert
  const dismissAlert = (alertId) => {
    const newAlerts = founderAlerts.map(a =>
      a.id === alertId ? { ...a, read: true } : a
    );
    setFounderAlerts(newAlerts);
    localStorage.setItem('medchain_founder_alerts', JSON.stringify(newAlerts));
  };

  // Format currency
  const formatCurrency = (amount) => `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;

  // Generate initial transactions
  useEffect(() => {
    const initialTxs = [];
    for (let i = 0; i < 10; i++) {
      const tx = generateLiveTransaction(facilities);
      if (tx) {
        tx.id = i;
        tx.timestamp = new Date(Date.now() - Math.random() * 3600000);
        initialTxs.push(tx);
      }
    }
    setTransactions(initialTxs.sort((a, b) => b.timestamp - a.timestamp));
  }, []);

  // Simulate live transactions
  useEffect(() => {
    const interval = setInterval(() => {
      const newTx = generateLiveTransaction(facilities);
      if (newTx) {
        setTransactions(prev => [newTx, ...prev.slice(0, 19)]);
      }
    }, 3000 + Math.random() * 5000);

    return () => clearInterval(interval);
  }, [facilities]);

  // If not founder, redirect to home
  if (!isFounder) {
    return <Navigate to="/" replace />;
  }

  // Calculate totals
  const activeFacilities = facilities.filter(f => f.status === 'active');
  const leadFacilities = facilities.filter(f => f.status === 'lead');
  const totalRevenue = activeFacilities.reduce((sum, h) => sum + h.totalRevenue, 0);
  const totalMCs = activeFacilities.reduce((sum, h) => sum + h.mcsThisMonth, 0);
  const totalDoctors = activeFacilities.reduce((sum, h) => sum + h.doctors, 0);
  const totalSubscriptions = activeFacilities.reduce((sum, h) => sum + h.monthlyFee, 0);
  const totalVariableFees = activeFacilities.reduce((sum, h) => sum + h.variableFee, 0);
  const pendingRevenue = leadFacilities.reduce((sum, h) => sum + h.monthlyFee, 0);

  // Profit & Overhead Calculations
  const activeNodeCount = facilities.filter(f => f.wallet && f.status === 'active').length;
  const SERVER_COST_PER_NODE = 500; // RM 500/node
  const ESTIMATED_GAS_FEES = 150; // RM per month (blockchain operations)
  const MISC_OVERHEAD = 200; // Domain, email services, etc.

  const grossRevenue = totalSubscriptions + totalMCs;
  const serverCosts = activeNodeCount * SERVER_COST_PER_NODE;
  const totalOperatingCosts = serverCosts + ESTIMATED_GAS_FEES + MISC_OVERHEAD;
  const netProfit = grossRevenue - totalOperatingCosts;
  const profitMargin = grossRevenue > 0 ? ((netProfit / grossRevenue) * 100).toFixed(1) : 0;

  // Current month profit data
  const currentMonthData = [
    {
      name: 'Current',
      grossRevenue: grossRevenue,
      serverCosts: serverCosts,
      gasFees: ESTIMATED_GAS_FEES,
      overhead: MISC_OVERHEAD,
      netProfit: netProfit,
    },
  ];

  // 6-month projection based on lead conversion rate
  const conversionRate = 0.6; // 60% of leads convert
  const monthlyGrowthRate = 0.15; // 15% MoM growth
  const generateProjectionData = () => {
    const months = ['Current', 'Month 2', 'Month 3', 'Month 4', 'Month 5', 'Month 6'];
    const leadCount = facilities.filter(f => f.status === 'lead').length;

    return months.map((month, idx) => {
      // Project node growth from leads
      const projectedNewNodes = idx === 0 ? 0 : Math.floor(leadCount * conversionRate * (idx / 6));
      const projectedTotalNodes = activeNodeCount + projectedNewNodes;

      // Project revenue growth
      const growthMultiplier = Math.pow(1 + monthlyGrowthRate, idx);
      const projectedSubscriptions = projectedTotalNodes * 10000;
      const projectedMCs = Math.round(totalMCs * growthMultiplier);
      const projectedGross = projectedSubscriptions + projectedMCs;

      // Project costs
      const projectedServerCosts = projectedTotalNodes * SERVER_COST_PER_NODE;
      const projectedGasFees = Math.round(ESTIMATED_GAS_FEES * (1 + idx * 0.1));
      const projectedOverhead = MISC_OVERHEAD;
      const projectedTotalCosts = projectedServerCosts + projectedGasFees + projectedOverhead;
      const projectedNet = projectedGross - projectedTotalCosts;

      return {
        name: month,
        grossRevenue: projectedGross,
        serverCosts: projectedServerCosts,
        gasFees: projectedGasFees,
        overhead: projectedOverhead,
        netProfit: projectedNet,
        nodes: projectedTotalNodes,
      };
    });
  };

  const profitChartData = showProjection ? generateProjectionData() : currentMonthData;

  // Custom tooltip for chart
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="p-4 rounded-xl border" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
          <p className="font-bold mb-2" style={{ color: theme.textPrimary }}>{label}</p>
          <div className="space-y-1 text-sm">
            <p style={{ color: theme.success }}>Gross Revenue: {formatCurrency(data.grossRevenue)}</p>
            <p style={{ color: theme.danger }}>Server Costs: {formatCurrency(data.serverCosts)}</p>
            <p style={{ color: theme.warning }}>Gas Fees: {formatCurrency(data.gasFees)}</p>
            <p style={{ color: theme.textMuted }}>Overhead: {formatCurrency(data.overhead)}</p>
            <div className="pt-2 mt-2 border-t" style={{ borderColor: theme.border }}>
              <p className="font-bold" style={{ color: theme.cyan }}>Net Profit: {formatCurrency(data.netProfit)}</p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen pb-12 founder-command" style={{ backgroundColor: '#0a0e14' }}>
      {/* Header */}
      <header className="px-8 py-4" style={{ backgroundColor: '#0a0e14', border: 'none', boxShadow: 'none', maxWidth: '1600px', margin: '0 auto' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${theme.gold}, ${theme.warning})` }}>
              <svg className="w-6 h-6 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: theme.textPrimary }}>Sarawak MedChain</h1>
              <p className="text-sm" style={{ color: theme.gold }}>Master Command Center</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Privacy Toggle */}
            <button
              onClick={() => setClientView(!clientView)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                clientView
                  ? 'bg-purple-500/20 border border-purple-500/30'
                  : 'bg-slate-800 border border-slate-700'
              }`}
            >
              <svg className={`w-4 h-4 ${clientView ? 'text-purple-400' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {clientView ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                )}
              </svg>
              <span className={`text-sm font-semibold ${clientView ? 'text-purple-400' : 'text-slate-400'}`}>
                {clientView ? 'Client View' : 'Full View'}
              </span>
            </button>

            {/* Service Notifications */}
            <ServiceNotificationsPanel />

            {/* Maintenance Scheduler */}
            <MaintenanceSchedulerButton />

            <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ backgroundColor: `${theme.gold}20`, border: `1px solid ${theme.gold}30` }}>
              <svg className="w-4 h-4" style={{ color: theme.gold }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-sm font-semibold" style={{ color: theme.gold }}>FOUNDER ACCESS</span>
            </div>
            <code className="text-xs font-mono px-3 py-2 rounded-lg" style={{ backgroundColor: theme.bg, color: theme.textMuted }}>
              {walletAddress?.slice(0, 8)}...{walletAddress?.slice(-6)}
            </code>
          </div>
        </div>
      </header>

      {/* Founder Alerts */}
      {founderAlerts.filter(a => !a.read).length > 0 && (
        <div className="px-8 pt-4">
          <div className="space-y-2">
            {founderAlerts.filter(a => !a.read).slice(0, 3).map(alert => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-4 rounded-xl border animate-pulse-once"
                style={{
                  backgroundColor: alert.type === 'invoice_sent' ? `${theme.success}15` : `${theme.accent}15`,
                  borderColor: alert.type === 'invoice_sent' ? `${theme.success}30` : `${theme.accent}30`,
                }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: alert.type === 'invoice_sent' ? `${theme.success}20` : `${theme.accent}20` }}
                  >
                    {alert.type === 'invoice_sent' ? (
                      <svg className="w-5 h-5" style={{ color: theme.success }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" style={{ color: theme.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: alert.type === 'invoice_sent' ? theme.success : theme.accent }}>
                      {alert.title}
                    </p>
                    <p className="text-sm" style={{ color: theme.textPrimary }}>{alert.message}</p>
                  </div>
                </div>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="p-2 rounded-lg transition-colors hover:bg-white/10"
                >
                  <svg className="w-5 h-5" style={{ color: theme.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global Kill Switch Panel */}
      <div className="px-8 pt-4">
        <div
          className={`rounded-2xl p-6 border-2 transition-all ${
            globalKillSwitchActive
              ? 'bg-red-500/10 border-red-500/50'
              : 'bg-slate-800/50 border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Status indicator */}
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                globalKillSwitchActive ? 'bg-red-500/20' : 'bg-emerald-500/20'
              }`}>
                {globalKillSwitchActive ? (
                  <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                ) : (
                  <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                )}
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold" style={{ color: theme.textPrimary }}>
                    Global Kill Switch
                  </h2>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    globalKillSwitchActive
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {globalKillSwitchActive ? 'NETWORK HALTED' : 'ALL SYSTEMS GO'}
                  </span>
                </div>
                <p className="text-sm mt-1" style={{ color: theme.textMuted }}>
                  {globalKillSwitchActive
                    ? 'All hospital nodes are suspended. MC issuance is disabled network-wide.'
                    : `Emergency control to halt all ${facilities.length} hospital nodes instantly.`}
                </p>
              </div>
            </div>

            {/* Kill Switch Button */}
            <div className="flex items-center gap-4">
              {/* System Status Link */}
              <a
                href="/status"
                target="_blank"
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-medium transition-colors"
                style={{ color: theme.textSecondary }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                System Status
              </a>

              {/* Main Kill Switch Button */}
              <button
                onClick={() => setShowGlobalKillConfirm(true)}
                disabled={isProcessingGlobalKill}
                className={`flex items-center gap-3 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
                  globalKillSwitchActive
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-red-600 hover:bg-red-500 text-white'
                } disabled:opacity-50`}
              >
                {isProcessingGlobalKill ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </>
                ) : globalKillSwitchActive ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Restore Network
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    Halt All Nodes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Global Kill Switch Confirmation Modal */}
      {showGlobalKillConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${
              globalKillSwitchActive ? 'bg-emerald-500/20' : 'bg-red-500/20'
            }`}>
              {globalKillSwitchActive ? (
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
            </div>

            <h3 className="text-xl font-bold text-white text-center mb-2">
              {globalKillSwitchActive ? 'Restore Network?' : 'Emergency Network Halt?'}
            </h3>

            <p className="text-slate-400 text-center mb-6">
              {globalKillSwitchActive
                ? `This will reactivate all ${facilities.length} hospital nodes and resume MC issuance across Sarawak.`
                : `This will immediately suspend all ${facilities.length} hospital nodes. No MCs can be issued until restored.`}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowGlobalKillConfirm(false)}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGlobalKillSwitch}
                disabled={isProcessingGlobalKill}
                className={`flex-1 py-3 font-bold rounded-xl transition-colors disabled:opacity-50 ${
                  globalKillSwitchActive
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-red-600 hover:bg-red-500 text-white'
                }`}
              >
                {isProcessingGlobalKill ? 'Processing...' : globalKillSwitchActive ? 'Restore Now' : 'Halt Network'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live MRR Revenue Tracker */}
      <div className="px-8 pt-6">
        <div className="bg-gradient-to-r from-emerald-900/50 via-emerald-800/30 to-green-900/50 rounded-2xl border border-emerald-500/30 p-6 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="relative flex items-center justify-between">
            {/* Left: MRR Display */}
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <span className="text-3xl">💰</span>
              </div>

              <div>
                <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-1">Live Monthly Recurring Revenue</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-black text-white">RM {revenueData.mrr.toLocaleString()}</span>
                  <span className="text-emerald-400 text-lg font-semibold">/ month</span>
                </div>
              </div>
            </div>

            {/* Center: Progress to Goal */}
            <div className="flex-1 max-w-md mx-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Progress to RM 500K Goal</span>
                <span className="text-white font-bold">{mrrProgress.percentage.toFixed(1)}%</span>
              </div>
              <div className="h-4 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-green-400 to-emerald-500 rounded-full transition-all duration-1000 relative"
                  style={{
                    width: `${mrrProgress.percentage}%`,
                    backgroundSize: '200% 100%',
                    animation: 'shimmer-green 2s ease-in-out infinite',
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-emerald-400 text-xs">{revenueData.hospitalCount} Hospitals + {revenueData.clinicCount} Clinics</span>
                <span className="text-slate-500 text-xs">{mrrProgress.hospitalsNeeded} more hospitals to goal</span>
              </div>
            </div>

            {/* Right: Controls & Test */}
            <div className="flex items-center gap-4">
              <SoundToggleButton />
              <div className="h-10 w-px bg-slate-700" />
              <TestPaymentButton />
            </div>
          </div>
        </div>

        {/* CSS for shimmer animation */}
        <style>{`
          @keyframes shimmer-green {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          .animate-shimmer {
            animation: shimmer 2s ease-in-out infinite;
          }
        `}</style>
      </div>

      {/* Hospital Lead Analytics Section */}
      <div className="px-8 pt-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Hospital Lead Analytics</h2>
              <p className="text-slate-400 text-sm">Track Founding Partner prospects in real-time</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6">
          {/* Live Viewers Panel */}
          <div className="col-span-1">
            <LiveViewersPanel />
          </div>

          {/* Lead Funnel */}
          <div className="col-span-1">
            <LeadFunnel />
          </div>

          {/* Conversion Heatmap */}
          <div className="col-span-1">
            <ConversionHeatmap />
          </div>

          {/* Alert History */}
          <div className="col-span-1">
            <AlertHistoryPanel />
          </div>
        </div>
      </div>

      {/* Disaster Recovery Suite Section */}
      <div className="px-8 pt-6">
        <DisasterRecoveryDashboard />
      </div>

      <div className="p-8">
        {/* Top Stats Row */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          {/* Total Revenue */}
          <div className="rounded-2xl p-5 border" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.success}20` }}>
                <svg className="w-4 h-4" style={{ color: theme.success }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xs font-medium" style={{ color: theme.textSecondary }}>Total Revenue</p>
            </div>
            <p className="text-2xl font-black" style={{ color: clientView ? theme.textMuted : theme.success }}>
              {clientView ? '••••••' : `RM ${totalRevenue.toLocaleString()}`}
            </p>
          </div>

          {/* MRR */}
          <div className="rounded-2xl p-5 border" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.accent}20` }}>
                <svg className="w-4 h-4" style={{ color: theme.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-xs font-medium" style={{ color: theme.textSecondary }}>MRR</p>
            </div>
            <p className="text-2xl font-black" style={{ color: clientView ? theme.textMuted : theme.accent }}>
              {clientView ? '••••••' : `RM ${totalSubscriptions.toLocaleString()}`}
            </p>
          </div>

          {/* Pipeline */}
          <div className="rounded-2xl p-5 border" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.gold}20` }}>
                <svg className="w-4 h-4" style={{ color: theme.gold }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <p className="text-xs font-medium" style={{ color: theme.textSecondary }}>Pipeline</p>
            </div>
            <p className="text-2xl font-black" style={{ color: clientView ? theme.textMuted : theme.gold }}>
              {clientView ? '••••••' : `RM ${pendingRevenue.toLocaleString()}`}
            </p>
            <p className="text-xs mt-1" style={{ color: theme.textMuted }}>{leadFacilities.length} leads</p>
          </div>

          {/* Active Sites */}
          <div className="rounded-2xl p-5 border" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.cyan}20` }}>
                <svg className="w-4 h-4" style={{ color: theme.cyan }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-xs font-medium" style={{ color: theme.textSecondary }}>Active Sites</p>
            </div>
            <p className="text-2xl font-black" style={{ color: theme.cyan }}>
              {activeFacilities.length}
            </p>
            <p className="text-xs mt-1" style={{ color: theme.textMuted }}>across Sarawak</p>
          </div>

          {/* MCs Today */}
          <div className="rounded-2xl p-5 border" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.warning}20` }}>
                <svg className="w-4 h-4" style={{ color: theme.warning }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-xs font-medium" style={{ color: theme.textSecondary }}>MCs This Month</p>
            </div>
            <p className="text-2xl font-black" style={{ color: clientView ? theme.textMuted : theme.warning }}>
              {clientView ? '••••' : totalMCs.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* Heat Map - col-span-8 */}
          <div className="col-span-8 rounded-2xl border overflow-hidden" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: theme.border }}>
              <div>
                <h2 className="text-lg font-bold" style={{ color: theme.textPrimary }}>Sarawak Network Heat Map</h2>
                <p className="text-sm" style={{ color: theme.textMuted }}>Real-time hospital activity across the state</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full" style={{ backgroundColor: `${theme.success}20`, color: theme.success }}>
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: theme.success }} />
                  LIVE
                </span>
              </div>
            </div>
            <div className="relative h-[500px] p-6">
              <SarawakMap facilities={facilities} clientView={clientView} />
            </div>
          </div>

          {/* Sidebar - col-span-4 */}
          <div className="col-span-4 space-y-6">
            {/* Active Hospitals */}
            <div className="rounded-2xl border" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: theme.border }}>
                <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: theme.textPrimary }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.success }} />
                  Active Hospitals
                </h3>
              </div>
              <div className="p-4 space-y-3 max-h-[200px] overflow-y-auto">
                {activeFacilities.map(h => (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: theme.bg }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>{h.name}</p>
                      <p className="text-xs" style={{ color: theme.textMuted }}>{h.location} • {h.doctors} doctors</p>
                    </div>
                    {!clientView && (
                      <p className="text-sm font-bold" style={{ color: theme.success }}>
                        RM {h.totalRevenue.toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* High-Value Leads */}
            <div className="rounded-2xl border" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: theme.border }}>
                <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: theme.textPrimary }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.gold }} />
                  High-Value Leads
                </h3>
              </div>
              <div className="p-4 space-y-3">
                {leadFacilities.map(h => (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: `${theme.gold}10`, border: `1px solid ${theme.gold}20` }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: theme.gold }}>{h.name}</p>
                      <p className="text-xs" style={{ color: theme.textMuted }}>{h.location} • {h.lastActivity}</p>
                    </div>
                    {!clientView && (
                      <p className="text-sm font-bold" style={{ color: theme.gold }}>
                        RM {h.monthlyFee.toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="rounded-2xl border p-5" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
              <h3 className="text-sm font-bold mb-4" style={{ color: theme.textPrimary }}>Network Stats</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: theme.textMuted }}>Total Doctors</span>
                  <span className="font-bold" style={{ color: theme.textPrimary }}>{totalDoctors}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: theme.textMuted }}>Avg MCs/Hospital</span>
                  <span className="font-bold" style={{ color: theme.textPrimary }}>
                    {Math.round(totalMCs / (activeFacilities.length || 1))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: theme.textMuted }}>Conversion Rate</span>
                  <span className="font-bold" style={{ color: theme.success }}>
                    {Math.round((activeFacilities.length / facilities.length) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Privacy Notice */}
        {clientView && (
          <div className="mt-8 p-4 rounded-xl border flex items-center gap-4" style={{ backgroundColor: `${theme.accent}10`, borderColor: `${theme.accent}30` }}>
            <svg className="w-6 h-6 flex-shrink-0" style={{ color: theme.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-semibold text-sm" style={{ color: theme.accent }}>Client View Mode Active</p>
              <p className="text-xs" style={{ color: theme.textMuted }}>
                Sensitive financial data is hidden. Safe to share screen with investors.
              </p>
            </div>
          </div>
        )}

        {/* Master Infrastructure Controls - Only in Full View */}
        {!clientView && (
          <div className="mt-8 rounded-2xl border overflow-hidden" style={{ backgroundColor: theme.bgCard, borderColor: theme.danger + '30' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: theme.border, backgroundColor: `${theme.danger}10` }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${theme.danger}20` }}>
                  <svg className="w-5 h-5" style={{ color: theme.danger }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: theme.textPrimary }}>Master Infrastructure Controls</h2>
                  <p className="text-sm" style={{ color: theme.textMuted }}>Hospital node management & kill switches</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: `${theme.danger}20`, color: theme.danger }}>
                ADMIN ONLY
              </span>
            </div>

            {/* Node List */}
            <div className="p-6">
              <div className="grid gap-4">
                {facilities.filter(f => f.wallet && f.status === 'active').map(hospital => {
                  const isPaused = isNodePaused(hospital.wallet);

                  return (
                    <div
                      key={hospital.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isPaused
                          ? 'bg-red-500/5 border-red-500/30'
                          : 'bg-slate-800/50 border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {/* Status Indicator */}
                          <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />

                          {/* Hospital Info */}
                          <div>
                            <p className="font-semibold" style={{ color: theme.textPrimary }}>{hospital.name}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs" style={{ color: theme.textMuted }}>{hospital.location}</span>
                              <span className="text-xs" style={{ color: theme.textMuted }}>•</span>
                              <span className="text-xs" style={{ color: theme.textMuted }}>{hospital.doctors} doctors</span>
                              <span className="text-xs" style={{ color: theme.textMuted }}>•</span>
                              <code className="text-xs font-mono" style={{ color: theme.cyan }}>
                                {hospital.wallet?.slice(0, 6)}...{hospital.wallet?.slice(-4)}
                              </code>
                            </div>
                          </div>
                        </div>

                        {/* Kill Switch Toggle */}
                        <div className="flex items-center gap-4">
                          <span className={`text-sm font-semibold ${isPaused ? 'text-red-400' : 'text-emerald-400'}`}>
                            Node Status: {isPaused ? 'PAUSED' : 'ACTIVE'}
                          </span>
                          <button
                            onClick={() => handleKillSwitchClick(hospital, isPaused)}
                            className={`relative w-14 h-7 rounded-full transition-colors ${
                              isPaused
                                ? 'bg-red-500/30'
                                : 'bg-emerald-500/30'
                            }`}
                          >
                            <div
                              className={`absolute top-1 w-5 h-5 rounded-full transition-all ${
                                isPaused
                                  ? 'left-1 bg-red-500'
                                  : 'left-8 bg-emerald-500'
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Paused Warning */}
                      {isPaused && (
                        <div className="mt-3 pt-3 border-t border-red-500/20">
                          <div className="flex items-center gap-2 text-red-400 text-sm">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span>MC issuance blocked. Doctors see suspension notice.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Warning Footer */}
              <div className="mt-6 p-4 rounded-xl flex items-start gap-3" style={{ backgroundColor: `${theme.warning}10`, border: `1px solid ${theme.warning}30` }}>
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: theme.warning }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="font-semibold text-sm" style={{ color: theme.warning }}>Critical Infrastructure Control</p>
                  <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
                    Pausing a node will immediately prevent all MC issuance for that hospital.
                    Use this to enforce payment of outstanding RM 10,000 subscription fees.
                    Doctors will see a professional suspension notice when attempting to log in.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Network-Wide Broadcast Panel - Only in Full View */}
        {!clientView && (
          <div className="mt-8 rounded-2xl border overflow-hidden" style={{ backgroundColor: theme.bgCard, borderColor: '#0066CC50' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: theme.border, background: 'linear-gradient(135deg, #0066CC20, #0052A320)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#0066CC30' }}>
                  <svg className="w-5 h-5" style={{ color: '#0066CC' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: theme.textPrimary }}>Network-Wide Announcement</h2>
                  <p className="text-sm" style={{ color: theme.textMuted }}>Broadcast messages to all Doctor Portals & Admin views</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#0066CC30', color: '#0066CC' }}>
                LIVE BROADCAST
              </span>
            </div>

            <div className="p-6">
              {/* Active Broadcast Display */}
              {activeBroadcast && (
                <div className="mb-6 p-4 rounded-xl border" style={{ backgroundColor: '#0066CC10', borderColor: '#0066CC30' }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="relative flex-shrink-0 mt-1">
                        <div className="absolute inset-0 bg-[#0066CC] rounded-full animate-ping opacity-30" />
                        <div className="relative w-3 h-3 bg-[#0066CC] rounded-full" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold mb-1" style={{ color: '#0066CC' }}>
                          Active Broadcast
                          {activeBroadcast.priority === 'urgent' && (
                            <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">URGENT</span>
                          )}
                        </p>
                        <p className="text-sm" style={{ color: theme.textPrimary }}>{activeBroadcast.message}</p>
                        <p className="text-xs mt-2" style={{ color: theme.textMuted }}>
                          Expires: {formatExpirationTime(activeBroadcast.expiresAt)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleClearBroadcast}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-red-500/20"
                      style={{ backgroundColor: '#ef444420', color: theme.danger }}
                    >
                      End Broadcast
                    </button>
                  </div>
                </div>
              )}

              {/* Compose New Broadcast */}
              <div className="space-y-4">
                {/* Message Input */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                    Announcement Message
                  </label>
                  <textarea
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    placeholder="Enter your network-wide announcement message..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0066CC]/50"
                    style={{
                      backgroundColor: theme.bg,
                      borderColor: theme.border,
                      color: theme.textPrimary,
                    }}
                    maxLength={280}
                  />
                  <p className="text-xs mt-1 text-right" style={{ color: theme.textMuted }}>
                    {broadcastMessage.length}/280 characters
                  </p>
                </div>

                {/* Options Row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Duration Selector */}
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                      Auto-Expire After
                    </label>
                    <select
                      value={broadcastDuration}
                      onChange={(e) => setBroadcastDuration(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#0066CC]/50 cursor-pointer"
                      style={{
                        backgroundColor: theme.bg,
                        borderColor: theme.border,
                        color: theme.textPrimary,
                      }}
                    >
                      <option value={1}>1 hour</option>
                      <option value={4}>4 hours</option>
                      <option value={8}>8 hours</option>
                      <option value={12}>12 hours</option>
                      <option value={24}>24 hours</option>
                      <option value={48}>48 hours</option>
                      <option value={72}>72 hours</option>
                    </select>
                  </div>

                  {/* Priority Selector */}
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                      Priority Level
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setBroadcastPriority('normal')}
                        className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                          broadcastPriority === 'normal'
                            ? 'border-[#0066CC] bg-[#0066CC]/20'
                            : 'border-slate-700 hover:border-slate-600'
                        }`}
                        style={{ color: broadcastPriority === 'normal' ? '#0066CC' : theme.textSecondary }}
                      >
                        Normal
                      </button>
                      <button
                        onClick={() => setBroadcastPriority('urgent')}
                        className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                          broadcastPriority === 'urgent'
                            ? 'border-red-500 bg-red-500/20'
                            : 'border-slate-700 hover:border-slate-600'
                        }`}
                        style={{ color: broadcastPriority === 'urgent' ? theme.danger : theme.textSecondary }}
                      >
                        Urgent
                      </button>
                    </div>
                  </div>
                </div>

                {/* Broadcast Button */}
                <button
                  onClick={handleBroadcast}
                  disabled={!broadcastMessage.trim() || isBroadcasting}
                  className="w-full py-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: broadcastMessage.trim() ? 'linear-gradient(135deg, #0066CC, #0052A3)' : '#1e3a5f',
                    boxShadow: broadcastMessage.trim() ? '0 4px 20px rgba(0, 102, 204, 0.3)' : 'none',
                  }}
                >
                  {isBroadcasting ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Broadcasting...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                      </svg>
                      Broadcast to All Nodes
                    </>
                  )}
                </button>

                {/* Info Footer */}
                <div className="pt-4 border-t" style={{ borderColor: theme.border }}>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: theme.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs" style={{ color: theme.textMuted }}>
                      Messages appear instantly at the top of all active Doctor Portals and Hospital Admin views.
                      Users can dismiss the notification, but it will reappear on page refresh until it expires.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Monthly Invoicer Panel - Only in Full View */}
        {!clientView && (
          <div className="mt-8 rounded-2xl border overflow-hidden" style={{ backgroundColor: theme.bgCard, borderColor: `${theme.success}50` }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: theme.border, background: `linear-gradient(135deg, ${theme.success}20, ${theme.cyan}10)` }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${theme.success}30` }}>
                  <svg className="w-5 h-5" style={{ color: theme.success }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: theme.textPrimary }}>Automated Monthly Invoicer</h2>
                  <p className="text-sm" style={{ color: theme.textMuted }}>Generate and send invoices to all hospital nodes</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: `${theme.success}30`, color: theme.success }}>
                  {new Date().toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>

            <div className="p-6">
              {/* Invoice Summary Stats */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="p-4 rounded-xl" style={{ backgroundColor: theme.bg }}>
                  <p className="text-xs font-medium mb-1" style={{ color: theme.textMuted }}>Active Hospitals</p>
                  <p className="text-2xl font-bold" style={{ color: theme.textPrimary }}>{facilities.filter(f => f.wallet && f.status === 'active').length}</p>
                </div>
                <div className="p-4 rounded-xl" style={{ backgroundColor: theme.bg }}>
                  <p className="text-xs font-medium mb-1" style={{ color: theme.textMuted }}>Total MCs This Month</p>
                  <p className="text-2xl font-bold" style={{ color: theme.warning }}>{totalMCs.toLocaleString()}</p>
                </div>
                <div className="p-4 rounded-xl" style={{ backgroundColor: theme.bg }}>
                  <p className="text-xs font-medium mb-1" style={{ color: theme.textMuted }}>Base Subscriptions</p>
                  <p className="text-2xl font-bold" style={{ color: theme.accent }}>{formatCurrency(totalSubscriptions)}</p>
                </div>
                <div className="p-4 rounded-xl" style={{ backgroundColor: theme.bg }}>
                  <p className="text-xs font-medium mb-1" style={{ color: theme.textMuted }}>Variable Fees (MCs)</p>
                  <p className="text-2xl font-bold" style={{ color: theme.cyan }}>{formatCurrency(totalMCs)}</p>
                </div>
              </div>

              {/* Total Billing Preview */}
              <div className="p-5 rounded-xl mb-6 border" style={{ backgroundColor: `${theme.success}10`, borderColor: `${theme.success}30` }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: theme.textMuted }}>Total Billing for {new Date().toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })}</p>
                    <p className="text-3xl font-black mt-1" style={{ color: theme.success }}>
                      {formatCurrency(totalSubscriptions + totalMCs)}
                    </p>
                    <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
                      {formatCurrency(totalSubscriptions)} base + {formatCurrency(totalMCs)} variable
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm" style={{ color: theme.textMuted }}>Formula</p>
                    <p className="text-sm font-mono mt-1" style={{ color: theme.cyan }}>
                      RM 10,000 + (MCs × RM 1.00)
                    </p>
                  </div>
                </div>
              </div>

              {/* Current Batch Status */}
              {currentBatch && (
                <div className="mb-6 p-4 rounded-xl border" style={{
                  backgroundColor: currentBatch.status === 'sent' ? `${theme.success}10` : `${theme.warning}10`,
                  borderColor: currentBatch.status === 'sent' ? `${theme.success}30` : `${theme.warning}30`,
                }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${currentBatch.status === 'sent' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                      <div>
                        <p className="font-semibold text-sm" style={{ color: currentBatch.status === 'sent' ? theme.success : theme.warning }}>
                          {currentBatch.status === 'sent' ? 'Invoices Sent Successfully' : 'Invoices Generated - Ready to Send'}
                        </p>
                        <p className="text-xs" style={{ color: theme.textMuted }}>
                          {currentBatch.invoiceCount} invoices • {formatCurrency(currentBatch.totalBilled)} total
                        </p>
                      </div>
                    </div>
                    {currentBatch.status === 'generated' && (
                      <button
                        onClick={handleSendInvoices}
                        disabled={isSendingInvoices}
                        className="px-4 py-2 rounded-xl font-semibold text-sm text-white transition-all flex items-center gap-2 disabled:opacity-50"
                        style={{ backgroundColor: theme.success }}
                      >
                        {isSendingInvoices ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Sending...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            Send All Invoices
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Invoice List Preview */}
                  {currentBatch.status === 'generated' && (
                    <div className="mt-4 pt-4 border-t" style={{ borderColor: `${theme.warning}30` }}>
                      <p className="text-xs font-medium mb-3" style={{ color: theme.textMuted }}>Invoice Preview</p>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {currentBatch.invoices.map(inv => (
                          <div key={inv.invoiceNumber} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: theme.bg }}>
                            <div className="flex items-center gap-3">
                              <code className="text-xs font-mono" style={{ color: theme.cyan }}>{inv.invoiceNumber}</code>
                              <span className="text-sm" style={{ color: theme.textPrimary }}>{inv.hospitalName}</span>
                            </div>
                            <span className="font-semibold text-sm" style={{ color: theme.success }}>{formatCurrency(inv.total)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Generate Button */}
              <button
                onClick={handleGenerateInvoices}
                disabled={isGeneratingInvoices || currentBatch?.status === 'generated'}
                className="w-full py-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: !isGeneratingInvoices && !currentBatch ? `linear-gradient(135deg, ${theme.success}, ${theme.cyan})` : theme.border,
                  boxShadow: !isGeneratingInvoices && !currentBatch ? `0 4px 20px ${theme.success}40` : 'none',
                }}
              >
                {isGeneratingInvoices ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Generating Invoices...
                  </>
                ) : currentBatch?.status === 'generated' ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Invoices Ready
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Generate {new Date().toLocaleDateString('en-MY', { month: 'long' })} Invoices
                  </>
                )}
              </button>

              {/* Invoice History */}
              {invoiceHistory.length > 0 && (
                <div className="mt-6 pt-6 border-t" style={{ borderColor: theme.border }}>
                  <h3 className="text-sm font-bold mb-4" style={{ color: theme.textPrimary }}>Invoice History</h3>
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {invoiceHistory.slice(0, 5).map(batch => (
                      <div key={batch.id} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: theme.bg }}>
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${batch.status === 'sent' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          <div>
                            <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>{batch.billingPeriod}</p>
                            <p className="text-xs" style={{ color: theme.textMuted }}>
                              {batch.invoiceCount} invoices • {new Date(batch.generatedAt).toLocaleDateString('en-MY')}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm" style={{ color: theme.success }}>{formatCurrency(batch.totalBilled)}</p>
                          <p className="text-xs" style={{ color: batch.status === 'sent' ? theme.success : theme.warning }}>
                            {batch.status === 'sent' ? 'Sent' : 'Generated'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Auto-Run Info */}
              <div className="mt-6 p-4 rounded-xl flex items-start gap-3" style={{ backgroundColor: `${theme.accent}10`, border: `1px solid ${theme.accent}30` }}>
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: theme.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-semibold text-sm" style={{ color: theme.accent }}>Automated Monthly Run</p>
                  <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
                    This script runs automatically on the 1st of every month at 9:00 AM MYT.
                    Invoices are generated and emailed to each hospital's finance team.
                    You'll receive a notification: "Invoices Sent: RM X total billing initiated for [Month]"
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Profit & Overhead Chart Panel - Only in Full View */}
        {!clientView && (
          <div className="mt-8 rounded-2xl border overflow-hidden" style={{ backgroundColor: theme.bgCard, borderColor: `${theme.gold}50` }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: theme.border, background: `linear-gradient(135deg, ${theme.gold}20, ${theme.warning}10)` }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${theme.gold}30` }}>
                  <svg className="w-5 h-5" style={{ color: theme.gold }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: theme.textPrimary }}>Profit & Overhead Analysis</h2>
                  <p className="text-sm" style={{ color: theme.textMuted }}>Gross revenue vs operating costs breakdown</p>
                </div>
              </div>
              {/* Projection Toggle */}
              <button
                onClick={() => setShowProjection(!showProjection)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                  showProjection
                    ? 'bg-cyan-500/20 border border-cyan-500/30'
                    : 'bg-slate-800 border border-slate-700'
                }`}
              >
                <svg className={`w-4 h-4 ${showProjection ? 'text-cyan-400' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <span className={`text-sm font-semibold ${showProjection ? 'text-cyan-400' : 'text-slate-400'}`}>
                  {showProjection ? '6-Month Forecast' : 'Current Month'}
                </span>
              </button>
            </div>

            <div className="p-6">
              {/* Take-Home Metric - Large Glowing Number */}
              <div className="mb-6 p-6 rounded-2xl relative overflow-hidden" style={{
                background: `linear-gradient(135deg, ${theme.success}15, ${theme.cyan}10)`,
                border: `2px solid ${theme.success}40`,
              }}>
                {/* Glow Effect */}
                <div className="absolute inset-0 opacity-30" style={{
                  background: `radial-gradient(circle at 30% 50%, ${theme.success}40 0%, transparent 50%)`,
                }} />

                <div className="relative flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium mb-1" style={{ color: theme.textMuted }}>Net Profit Margin (Solo Founder)</p>
                    <div className="flex items-baseline gap-3">
                      <span className="text-6xl font-black animate-pulse" style={{
                        color: theme.success,
                        textShadow: `0 0 30px ${theme.success}60, 0 0 60px ${theme.success}40`,
                      }}>
                        {profitMargin}%
                      </span>
                      <span className="text-2xl font-bold" style={{ color: theme.success }}>
                        {formatCurrency(netProfit)}
                      </span>
                    </div>
                    <p className="text-xs mt-2" style={{ color: theme.textMuted }}>
                      Take-home after all operating expenses
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.success }} />
                      <span className="text-sm" style={{ color: theme.textSecondary }}>Gross: {formatCurrency(grossRevenue)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.danger }} />
                      <span className="text-sm" style={{ color: theme.textSecondary }}>Costs: {formatCurrency(totalOperatingCosts)}</span>
                    </div>
                  </div>
                </div>

                {/* High Margin Badge */}
                {profitMargin > 90 && (
                  <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold animate-bounce" style={{
                    backgroundColor: `${theme.gold}30`,
                    color: theme.gold,
                    border: `1px solid ${theme.gold}50`,
                  }}>
                    EXCEPTIONAL MARGIN
                  </div>
                )}
              </div>

              {/* Cost Breakdown Grid */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="p-4 rounded-xl" style={{ backgroundColor: theme.bg }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.success }} />
                    <p className="text-xs font-medium" style={{ color: theme.textMuted }}>Gross Revenue</p>
                  </div>
                  <p className="text-xl font-bold" style={{ color: theme.success }}>{formatCurrency(grossRevenue)}</p>
                </div>
                <div className="p-4 rounded-xl" style={{ backgroundColor: theme.bg }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.danger }} />
                    <p className="text-xs font-medium" style={{ color: theme.textMuted }}>Server Costs</p>
                  </div>
                  <p className="text-xl font-bold" style={{ color: theme.danger }}>{formatCurrency(serverCosts)}</p>
                  <p className="text-xs" style={{ color: theme.textMuted }}>RM 500 × {activeNodeCount} nodes</p>
                </div>
                <div className="p-4 rounded-xl" style={{ backgroundColor: theme.bg }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.warning }} />
                    <p className="text-xs font-medium" style={{ color: theme.textMuted }}>Gas Fees</p>
                  </div>
                  <p className="text-xl font-bold" style={{ color: theme.warning }}>{formatCurrency(ESTIMATED_GAS_FEES)}</p>
                  <p className="text-xs" style={{ color: theme.textMuted }}>Blockchain operations</p>
                </div>
                <div className="p-4 rounded-xl" style={{ backgroundColor: theme.bg }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.textMuted }} />
                    <p className="text-xs font-medium" style={{ color: theme.textMuted }}>Misc Overhead</p>
                  </div>
                  <p className="text-xl font-bold" style={{ color: theme.textSecondary }}>{formatCurrency(MISC_OVERHEAD)}</p>
                  <p className="text-xs" style={{ color: theme.textMuted }}>Domain, email, etc.</p>
                </div>
              </div>

              {/* Stacked Bar Chart */}
              <div className="rounded-xl p-4" style={{ backgroundColor: theme.bg }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold" style={{ color: theme.textPrimary }}>
                    {showProjection ? 'Revenue vs Costs - 6 Month Projection' : 'Revenue vs Costs - Current Month'}
                  </h3>
                  {showProjection && (
                    <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `${theme.cyan}20`, color: theme.cyan }}>
                      Based on {(conversionRate * 100)}% lead conversion rate
                    </span>
                  )}
                </div>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profitChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                      <XAxis dataKey="name" tick={{ fill: theme.textMuted, fontSize: 12 }} />
                      <YAxis tick={{ fill: theme.textMuted, fontSize: 12 }} tickFormatter={(value) => `RM ${(value / 1000).toFixed(0)}k`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        wrapperStyle={{ paddingTop: 10 }}
                        formatter={(value) => <span style={{ color: theme.textSecondary, fontSize: 12 }}>{value}</span>}
                      />
                      <Bar dataKey="grossRevenue" name="Gross Revenue" stackId="a" fill={theme.success} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="serverCosts" name="Server Costs" stackId="b" fill={theme.danger} />
                      <Bar dataKey="gasFees" name="Gas Fees" stackId="b" fill={theme.warning} />
                      <Bar dataKey="overhead" name="Overhead" stackId="b" fill={theme.textMuted} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Projection Insights */}
              {showProjection && (
                <div className="mt-6 p-4 rounded-xl border" style={{ backgroundColor: `${theme.cyan}10`, borderColor: `${theme.cyan}30` }}>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: theme.cyan }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: theme.cyan }}>6-Month Projection Insights</p>
                      <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
                        With {facilities.filter(f => f.status === 'lead').length} leads in pipeline at {(conversionRate * 100)}% conversion rate,
                        projected to reach {generateProjectionData()[5]?.nodes || activeNodeCount} active nodes.
                        Month 6 projected net profit: {formatCurrency(generateProjectionData()[5]?.netProfit || netProfit)}.
                        Margins remain exceptionally high due to minimal operational overhead as a solo founder.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Solo Founder Advantage */}
              <div className="mt-6 p-4 rounded-xl flex items-start gap-3" style={{ backgroundColor: `${theme.gold}10`, border: `1px solid ${theme.gold}30` }}>
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: theme.gold }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-semibold text-sm" style={{ color: theme.gold }}>Solo Founder Advantage</p>
                  <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
                    No employee salaries, no office rent, no equity dilution. Your {profitMargin}% profit margin
                    represents near-complete take-home earnings. Each new hospital node adds approximately
                    RM {(10000 - SERVER_COST_PER_NODE).toLocaleString()} to your monthly take-home.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Kill Switch Confirmation Modal */}
      <KillSwitchModal
        isOpen={killSwitchModal.isOpen}
        hospital={killSwitchModal.hospital}
        action={killSwitchModal.action}
        onConfirm={handleConfirmKillSwitch}
        onCancel={handleCancelKillSwitch}
        isProcessing={isProcessingKillSwitch}
      />

      {/* Live Profit Ticker */}
      <LiveProfitTicker transactions={transactions} clientView={clientView} />
    </div>
  );
}
