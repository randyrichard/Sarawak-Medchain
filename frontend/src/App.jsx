import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { connectWallet, getMyBalance } from './utils/contract';
import { BillingProvider } from './context/BillingContext';
import { MaintenanceProvider } from './context/MaintenanceContext';
import { FoundingMemberProvider } from './context/FoundingMemberContext';
import { LeadAnalyticsProvider } from './context/LeadAnalyticsContext';
import { RevenueAlertProvider } from './context/RevenueAlertContext';
import { DisasterRecoveryProvider } from './context/DisasterRecoveryContext';
import { CEOAlertToast } from './components/CEOLeadAlerts';
import RevenueAlertToast from './components/RevenueAlertToast';
import { DRAlertToast } from './components/DisasterRecoveryDashboard';
import PatientPortal from './pages/PatientPortal';
import DoctorPortal from './pages/DoctorPortal';
import AdminPortal from './pages/AdminPortal';
import CEODashboard from './pages/CEODashboard';
import CEOMainDashboard from './pages/CEOMainDashboard';
import HospitalPitch from './pages/HospitalPitch';
import ConnectWallet from './pages/ConnectWallet';
import DoctorPortalDemo from './pages/DoctorPortalDemo';
import ServiceAgreement from './pages/ServiceAgreement';
import FPXPayment from './pages/FPXPayment';
import CEOQuarterlySummary from './pages/CEOQuarterlySummary';
import FounderAdmin from './pages/FounderAdmin';
import BusinessOverview from './pages/BusinessOverview';
import LandingPage from './pages/LandingPage';
import VerificationPage from './pages/VerificationPage';
import SystemStatus from './pages/SystemStatus';
import CouncilorView from './pages/CouncilorView';
import { ServiceRestoredToast } from './components/ServiceNotifications';
import './App.css';

// Top-Up Modal Component
function TopUpModal({ isOpen, onClose, currentBalance }) {
  const navigate = useNavigate();
  const [selectedAmount, setSelectedAmount] = useState(1000);
  const [isProcessing, setIsProcessing] = useState(false);

  const topUpOptions = [
    { amount: 500, label: 'RM 500', popular: false },
    { amount: 1000, label: 'RM 1,000', popular: true },
    { amount: 2500, label: 'RM 2,500', popular: false },
    { amount: 5000, label: 'RM 5,000', popular: false },
  ];

  const handleProceedToPayment = async () => {
    setIsProcessing(true);
    // Small delay for visual feedback
    await new Promise(resolve => setTimeout(resolve, 200));
    // Navigate to payment page with amount
    navigate('/payment', { state: { topUpAmount: selectedAmount, isTopUp: true } });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - Centered with max-width matching Service Agreement */}
      <div
        className="relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl overflow-hidden w-full mx-4"
        style={{
          maxWidth: '500px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)'
        }}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-700/50 bg-gradient-to-r from-blue-600/10 to-cyan-600/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Top Up Credits</h2>
                <p className="text-slate-400 text-sm">Instant FPX payment</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Current Balance */}
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Current Balance</span>
            <span className="text-2xl font-bold text-white">RM {currentBalance?.toLocaleString() || 0}</span>
          </div>
        </div>

        {/* Amount Selection */}
        <div className="p-6">
          <p className="text-sm text-slate-400 mb-4">Select top-up amount</p>
          <div className="grid grid-cols-2 gap-3">
            {topUpOptions.map((option) => (
              <button
                key={option.amount}
                onClick={() => setSelectedAmount(option.amount)}
                className={`relative p-4 rounded-xl border-2 transition-all ${
                  selectedAmount === option.amount
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'
                }`}
              >
                {option.popular && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-emerald-500 text-white text-xs font-bold rounded-full">
                    POPULAR
                  </span>
                )}
                <p className={`text-lg font-bold ${selectedAmount === option.amount ? 'text-blue-400' : 'text-white'}`}>
                  {option.label}
                </p>
                <p className="text-xs text-slate-500 mt-1">{option.amount} MC credits</p>
              </button>
            ))}
          </div>
        </div>

        {/* Summary & Action */}
        <div className="p-6 bg-slate-800/50">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400">New Balance</span>
            <span className="text-xl font-bold text-emerald-400">
              RM {((currentBalance || 0) + selectedAmount).toLocaleString()}
            </span>
          </div>
          <button
            onClick={handleProceedToPayment}
            disabled={isProcessing}
            className="w-full py-4 rounded-xl font-bold text-white text-lg transition-all transform hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-70 disabled:transform-none"
            style={{
              background: 'linear-gradient(135deg, #0066CC, #003366)',
              boxShadow: '0 10px 40px rgba(0, 102, 204, 0.3)'
            }}
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Pay RM {selectedAmount.toLocaleString()} via FPX
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Sticky Credit Balance Header Component (shows at top of main content)
function StickyBalanceHeader({ walletAddress }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [creditBalance, setCreditBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [buttonLoading, setButtonLoading] = useState(false);

  // Show on Doctor and Admin portals where billing matters
  const showOnRoutes = ['/doctor', '/admin'];
  const shouldShow = showOnRoutes.includes(location.pathname);

  const criticalThreshold = 100; // RM100 - critical (red)
  const warningThreshold = 500; // RM500 - warning (amber)

  const isCriticalBalance = creditBalance !== null && creditBalance < criticalThreshold;
  const isWarningBalance = creditBalance !== null && creditBalance < warningThreshold && creditBalance >= criticalThreshold;
  const needsAttention = isCriticalBalance || isWarningBalance;

  useEffect(() => {
    if (shouldShow && walletAddress) {
      fetchCreditBalance();
    }
  }, [shouldShow, walletAddress, location.pathname]);

  const fetchCreditBalance = async () => {
    try {
      setLoading(true);
      // First check localStorage for hospital node credits (from FPX payment)
      const hospitalNode = localStorage.getItem('medchain_hospital_node');
      if (hospitalNode) {
        const nodeData = JSON.parse(hospitalNode);
        if (nodeData.credits?.balance !== undefined) {
          // Convert credit count to RM value (1 credit = RM 1)
          setCreditBalance(nodeData.credits.balance);
          setLoading(false);
          return;
        }
      }
      // Fall back to blockchain call
      const balance = await getMyBalance();
      setCreditBalance(balance);
    } catch (error) {
      console.error('Error fetching credit balance:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = async () => {
    setButtonLoading(true);
    // Show spinner if loading takes more than 200ms
    const timer = setTimeout(() => {
      setShowTopUpModal(true);
      setButtonLoading(false);
    }, 200);

    // Open modal immediately if ready
    setShowTopUpModal(true);
    setButtonLoading(false);
    clearTimeout(timer);
  };

  if (!shouldShow) return null;

  // Determine styling based on balance level
  const getStatusStyles = () => {
    if (isCriticalBalance) {
      return {
        banner: 'bg-gradient-to-r from-red-600 to-red-700',
        badge: 'bg-red-50 border-red-200',
        text: 'text-white',
        subtext: 'text-red-100',
        icon: 'text-white',
        button: 'bg-white text-red-600 hover:bg-red-50'
      };
    }
    if (isWarningBalance) {
      return {
        banner: 'bg-gradient-to-r from-amber-500 to-orange-500',
        badge: 'bg-amber-50 border-amber-200',
        text: 'text-white',
        subtext: 'text-amber-100',
        icon: 'text-white',
        button: 'bg-white text-amber-600 hover:bg-amber-50'
      };
    }
    return {
      banner: 'bg-white/95 border-b border-slate-200',
      badge: 'bg-emerald-50 border-emerald-200',
      text: 'text-slate-800',
      subtext: 'text-slate-600',
      icon: 'text-emerald-500',
      button: 'bg-emerald-600 text-white hover:bg-emerald-700'
    };
  };

  const styles = getStatusStyles();

  // Show amber warning banner for low credit
  if (needsAttention) {
    return (
      <>
      <div className={`sticky top-0 z-50 ${styles.banner} shadow-lg`}>
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Warning Icon */}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isCriticalBalance ? 'bg-white/20' : 'bg-white/20'} animate-pulse`}>
              <svg className={`w-6 h-6 ${styles.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            {/* Alert Message */}
            <div>
              <div className="flex items-center gap-3">
                <h3 className={`text-lg font-bold ${styles.text}`}>
                  {isCriticalBalance ? 'Critical: Low Credit Balance' : 'Low Credit Warning'}
                </h3>
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  isCriticalBalance ? 'bg-white/20 text-white' : 'bg-white/20 text-white'
                }`}>
                  RM {loading ? '...' : creditBalance?.toLocaleString() || 0}
                </span>
              </div>
              <p className={`text-sm mt-1 ${styles.subtext}`}>
                {isCriticalBalance
                  ? 'Immediate top-up required. MC issuance may be interrupted.'
                  : 'Please top up to ensure uninterrupted MC issuance.'}
              </p>
            </div>
          </div>

          {/* Top Up Button */}
          <button
            onClick={handleTopUp}
            disabled={buttonLoading}
            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-lg transform hover:scale-105 hover:shadow-xl active:scale-95 flex items-center gap-2 cursor-pointer ${styles.button}`}
            style={{
              transition: 'all 0.2s ease-in-out',
              cursor: 'pointer'
            }}
          >
            {buttonLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading...
              </>
            ) : (
              'Top Up Now'
            )}
          </button>
        </div>
      </div>

      {/* Top-Up Modal */}
      <TopUpModal
        isOpen={showTopUpModal}
        onClose={() => setShowTopUpModal(false)}
        currentBalance={creditBalance}
      />
    </>
    );
  }

  // Normal state - compact header
  return (
    <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-200 shadow-sm">
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${styles.badge} border`}>
            <svg className={`w-5 h-5 ${styles.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-slate-600">Credit Balance:</span>
              <span className="text-xl font-bold text-emerald-600">
                {loading ? '...' : creditBalance !== null ? `RM ${creditBalance.toLocaleString()}` : '--'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Glowing Top Up Required Badge (shows in sidebar when credits < RM500)
function TopUpRequiredBadge({ walletAddress }) {
  const navigate = useNavigate();
  const [creditBalance, setCreditBalance] = useState(null);
  const [loading, setLoading] = useState(false);

  const topUpThreshold = 500; // RM500 threshold
  const needsTopUp = creditBalance !== null && creditBalance < topUpThreshold;

  useEffect(() => {
    if (walletAddress) {
      fetchCreditBalance();
    }
  }, [walletAddress]);

  const fetchCreditBalance = async () => {
    try {
      setLoading(true);
      // First check localStorage for hospital node credits (from FPX payment)
      const hospitalNode = localStorage.getItem('medchain_hospital_node');
      if (hospitalNode) {
        const nodeData = JSON.parse(hospitalNode);
        if (nodeData.credits?.balance !== undefined) {
          // Convert credit count to RM value (1 credit = RM 1)
          setCreditBalance(nodeData.credits.balance);
          setLoading(false);
          return;
        }
      }
      // Fall back to blockchain call
      const balance = await getMyBalance();
      setCreditBalance(balance);
    } catch (error) {
      console.error('Error fetching credit balance for badge:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = () => {
    navigate('/admin');
  };

  if (!needsTopUp || loading) return null;

  return (
    <div className="p-4">
      <button
        onClick={handleTopUp}
        className="w-full relative overflow-hidden rounded-xl p-4 bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
        style={{
          boxShadow: '0 0 20px rgba(249, 115, 22, 0.5), 0 0 40px rgba(249, 115, 22, 0.3), 0 0 60px rgba(249, 115, 22, 0.1)',
          animation: 'glow-pulse 2s ease-in-out infinite'
        }}
      >
        {/* Animated glow overlay */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          style={{
            animation: 'shimmer 2s ease-in-out infinite'
          }}
        />

        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-white font-bold text-sm">Top Up Required</p>
            <p className="text-orange-100 text-xs">
              Balance: RM {creditBalance?.toLocaleString() || 0}
            </p>
          </div>
        </div>
      </button>

      {/* CSS for glow animation */}
      <style>{`
        @keyframes glow-pulse {
          0%, 100% {
            box-shadow: 0 0 20px rgba(249, 115, 22, 0.5), 0 0 40px rgba(249, 115, 22, 0.3), 0 0 60px rgba(249, 115, 22, 0.1);
          }
          50% {
            box-shadow: 0 0 30px rgba(249, 115, 22, 0.7), 0 0 60px rgba(249, 115, 22, 0.5), 0 0 90px rgba(249, 115, 22, 0.2);
          }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

// Credit Balance Sidebar Component (needs to be inside Router)
function CreditBalanceSidebar({ walletAddress }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [creditBalance, setCreditBalance] = useState(null);
  const [loading, setLoading] = useState(false);

  const isOnDoctorRoute = location.pathname === '/doctor';
  const lowBalanceThreshold = 5;
  const isLowBalance = creditBalance !== null && creditBalance <= lowBalanceThreshold;

  useEffect(() => {
    if (isOnDoctorRoute && walletAddress) {
      fetchCreditBalance();
    }
  }, [isOnDoctorRoute, walletAddress]);

  const fetchCreditBalance = async () => {
    try {
      setLoading(true);
      // First check localStorage for hospital node credits (from FPX payment)
      const hospitalNode = localStorage.getItem('medchain_hospital_node');
      if (hospitalNode) {
        const nodeData = JSON.parse(hospitalNode);
        if (nodeData.credits?.balance !== undefined) {
          // Credits are already in RM value (1 credit = RM 1)
          setCreditBalance(nodeData.credits.balance);
          setLoading(false);
          return;
        }
      }
      // Fall back to blockchain call
      const balance = await getMyBalance();
      setCreditBalance(balance);
    } catch (error) {
      console.error('Error fetching credit balance:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = () => {
    navigate('/admin');
  };

  if (!isOnDoctorRoute) return null;

  return (
    <div className="p-4 border-t border-slate-800">
      <div className={`rounded-xl p-4 ${
        isLowBalance
          ? 'bg-gradient-to-r from-amber-600 to-amber-700'
          : 'bg-gradient-to-r from-emerald-600 to-emerald-700'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <p className={`text-xs font-semibold uppercase tracking-wide ${
            isLowBalance ? 'text-amber-200' : 'text-emerald-200'
          }`}>
            Credits Loaded
          </p>
          {isLowBalance && (
            <span className="px-2 py-0.5 bg-amber-500/30 rounded-full text-xs font-bold text-amber-100">
              LOW
            </span>
          )}
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-black text-white">
              {loading ? '...' : creditBalance !== null ? `RM ${creditBalance.toLocaleString()}` : '--'}
            </p>
            <p className={`text-xs mt-1 ${isLowBalance ? 'text-amber-200/70' : 'text-emerald-200/70'}`}>
              {creditBalance !== null ? `${creditBalance} MC credits` : 'credits available'}
            </p>
          </div>
          <button
            onClick={handleTopUp}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              isLowBalance
                ? 'bg-white text-amber-700 hover:bg-amber-100'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            Top Up
          </button>
        </div>
        {isLowBalance && (
          <p className="text-xs text-amber-200/80 mt-3 pt-3 border-t border-amber-500/30">
            RM1.00 per MC issued
          </p>
        )}
      </div>
    </div>
  );
}

// Protected App Layout - requires wallet connection
function ProtectedApp({ walletAddress, handleDisconnect }) {
  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: '#0a0e14' }}>
      {/* Service Restored Toast Notification */}
      <ServiceRestoredToast />
      {/* Fixed Sidebar */}
      <aside className="w-72 h-full text-white flex flex-col flex-shrink-0" style={{ backgroundColor: '#0a0e14', borderRight: 'none', boxShadow: 'none' }}>
        {/* Logo & Title */}
        <div className="p-6" style={{ borderBottom: 'none' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sarawak-red-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Sarawak</h1>
              <p className="text-xs text-sarawak-yellow-500 font-semibold">MedChain</p>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            <li>
              <Link to="/patient" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors group">
                <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-slate-300 group-hover:text-white">Patient Portal</span>
              </Link>
            </li>
            <li>
              <Link to="/doctor" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors group">
                <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-slate-300 group-hover:text-white">Doctor Portal</span>
              </Link>
            </li>
            <li>
              <Link to="/admin" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors group">
                <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-slate-300 group-hover:text-white">Admin Portal</span>
              </Link>
            </li>
            <li>
              <Link to="/ceo" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800 transition-colors group">
                <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span className="text-slate-300 group-hover:text-white">CEO Dashboard</span>
              </Link>
            </li>
            {/* Founder Dashboard - Only shows for founder wallet */}
            {walletAddress?.toLowerCase() === '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' && (
              <li>
                <Link to="/ceo-main" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-amber-500/20 transition-colors group border border-amber-500/30 bg-amber-500/10">
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-amber-400 font-semibold">Founder Command</span>
                </Link>
              </li>
            )}
          </ul>
        </nav>

        {/* Glowing Top Up Required Badge - Shows when credits < RM500 */}
        <TopUpRequiredBadge walletAddress={walletAddress} />

        {/* Credit Balance - Shows only on Doctor Portal */}
        <CreditBalanceSidebar walletAddress={walletAddress} />

        {/* Verified Badge */}
        <div className="p-4 border-t border-slate-800">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-blue-200 font-medium uppercase tracking-wide">Verified by</p>
                <p className="text-sm font-bold text-white">Sarawak MedChain</p>
              </div>
            </div>
            <p className="text-xs text-blue-200/70">Blockchain-secured medical records</p>
          </div>
        </div>

        {/* Wallet Info */}
        <div className="p-4" style={{ borderTop: 'none' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-xs text-slate-400 font-mono">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
            </div>
            <button
              onClick={handleDisconnect}
              className="text-xs text-slate-400 hover:text-red-400 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content - Fluid, Scrolls Independently, Edge-to-Edge */}
      <main className="flex-1 flex flex-col w-full overflow-y-auto" style={{ backgroundColor: '#0a0e14', minHeight: '100vh' }}>
        {/* Sticky Credit Balance Header */}
        <StickyBalanceHeader walletAddress={walletAddress} />

        <Routes>
          <Route path="/patient" element={<PatientPortal walletAddress={walletAddress} />} />
          <Route path="/doctor" element={<DoctorPortal walletAddress={walletAddress} />} />
          <Route path="/admin" element={<AdminPortal walletAddress={walletAddress} />} />
          <Route path="/ceo" element={<CEODashboard walletAddress={walletAddress} />} />
          <Route path="/ceo-main" element={<CEOMainDashboard walletAddress={walletAddress} />} />
          <Route path="*" element={<Navigate to="/patient" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// Connect Wallet Screen
function ConnectScreen({ onConnect, loading, error }) {
  // Check for pending admin status from application submission
  const [pendingAdmin, setPendingAdmin] = useState(null);
  const [autoConnectTriggered, setAutoConnectTriggered] = useState(false);

  useEffect(() => {
    const storedData = localStorage.getItem('medchain_pending_admin');
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        setPendingAdmin(data);

        // Auto-trigger MetaMask if autoConnect flag is set
        if (data.autoConnect && !autoConnectTriggered) {
          setAutoConnectTriggered(true);
          // Clear the autoConnect flag to prevent re-triggering
          const updatedData = { ...data, autoConnect: false };
          localStorage.setItem('medchain_pending_admin', JSON.stringify(updatedData));
          // Trigger MetaMask after a brief delay for visual smoothness
          setTimeout(() => {
            onConnect();
          }, 500);
        }
      } catch (e) {
        console.error('Error parsing pending admin data:', e);
      }
    }
  }, [onConnect, autoConnectTriggered]);

  // If pending admin, show special UI
  if (pendingAdmin) {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center p-6">
        <div className="max-w-lg w-full">
          {/* Pending Admin Card */}
          <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-8 shadow-2xl">
            {/* Status Badge */}
            <div className="flex justify-center mb-6">
              <span className="px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-full text-amber-400 text-sm font-bold flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
                Pending Admin Verification
              </span>
            </div>

            {/* Hospital Icon */}
            <div className="w-20 h-20 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-white text-center mb-2">
              Welcome, {pendingAdmin.facilityName}
            </h1>
            <p className="text-slate-400 text-center mb-8">
              Your application is being reviewed by our team
            </p>

            {/* Application Details */}
            <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Facility Type</p>
                  <p className="text-white font-medium">{pendingAdmin.facilityType}</p>
                </div>
                <div>
                  <p className="text-slate-500">Your Role</p>
                  <p className="text-white font-medium">{pendingAdmin.decisionMakerRole}</p>
                </div>
                <div>
                  <p className="text-slate-500">Blockchain Ref</p>
                  <p className="text-emerald-400 font-mono text-xs">{pendingAdmin.blockchainRef}</p>
                </div>
                <div>
                  <p className="text-slate-500">Submitted</p>
                  <p className="text-white font-medium">
                    {new Date(pendingAdmin.submittedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Connect Wallet Section */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
              <p className="text-blue-400 font-semibold text-sm mb-2">Next Step: Connect Your Wallet</p>
              <p className="text-slate-400 text-sm">
                Connect your MetaMask wallet to complete the onboarding process. This wallet will become your hospital's admin wallet.
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl mb-6 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={onConnect}
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-bold rounded-xl hover:from-amber-400 hover:to-orange-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.5 12l-1.5-1.5-6 6V3h-2v13.5l-6-6L3.5 12 12 20.5 20.5 12z" />
                  </svg>
                  Connect MetaMask Wallet
                </>
              )}
            </button>

            {/* Clear Application Link */}
            <button
              onClick={() => {
                localStorage.removeItem('medchain_pending_admin');
                setPendingAdmin(null);
              }}
              className="w-full mt-4 text-slate-500 hover:text-slate-400 text-sm transition-colors"
            >
              Not {pendingAdmin.facilityName}? Start fresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default connect screen for non-pending users
  return (
    <div className="connect-container">
      <div className="connect-card">
        <h1>Sarawak MedChain MVP</h1>
        <p>Patient-Controlled Medical Records</p>

        {error && <div className="message error">{error}</div>}

        <button onClick={onConnect} disabled={loading}>
          {loading ? 'Connecting...' : 'Connect MetaMask Wallet'}
        </button>

        <div className="info-box">
          <h3>What is this?</h3>
          <p>This MVP demonstrates:</p>
          <ul>
            <li>Only verified doctors can write medical records</li>
            <li>Patients explicitly control who can read their records</li>
            <li>Access revocation is enforced by code</li>
            <li>Every action is auditable on the blockchain</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// App Routes Handler - needs to be inside BrowserRouter
function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const [walletAddress, setWalletAddress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingWallet, setCheckingWallet] = useState(true);

  const handleConnectWallet = async () => {
    try {
      setLoading(true);
      setError('');
      const { address } = await connectWallet();
      setWalletAddress(address);
      // After successful connection, redirect to intended destination
      const from = location.state?.from || '/patient';
      navigate(from, { replace: true });
    } catch (err) {
      console.error('Wallet connection error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    setWalletAddress(null);
    setError('');
    navigate('/');
  };

  // Check if wallet already connected on mount
  useEffect(() => {
    const checkExistingConnection = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            const { address } = await connectWallet();
            setWalletAddress(address);
          }
        } catch (err) {
          console.error('Error checking wallet:', err);
        }
      }
      setCheckingWallet(false);
    };
    checkExistingConnection();
  }, []);

  // Public routes that don't need wallet - NO MetaMask trigger
  const publicPaths = ['/', '/founder-admin-secret-99', '/business-overview', '/pitch', '/pricing', '/connect', '/demo', '/agreement', '/payment', '/ceo/quarterly', '/status', '/gov-preview', '/portal/gov-preview', '/admin/gov-dashboard', '/pwa/verify', '/pwa/issue'];
  const isPublicRoute = publicPaths.includes(location.pathname);
  const isVerificationRoute = location.pathname.startsWith('/verify/');

  // Protected routes that require wallet connection
  const protectedPaths = ['/mvp', '/patient', '/doctor', '/admin', '/ceo', '/ceo-main'];
  const isProtectedRoute = protectedPaths.some(path => location.pathname.startsWith(path));

  // Show loading while checking wallet
  if (checkingWallet && isProtectedRoute) {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Checking wallet connection...</p>
        </div>
      </div>
    );
  }

  // For public routes, render directly without wallet check
  if (isPublicRoute) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/founder-admin-secret-99" element={<FounderAdmin />} />
        <Route path="/business-overview" element={<BusinessOverview />} />
        <Route path="/pitch" element={<HospitalPitch />} />
        <Route path="/pricing" element={<Navigate to="/pitch#pricing" replace />} />
        <Route path="/connect" element={
          walletAddress
            ? <Navigate to="/patient" replace />
            : <ConnectWallet onConnect={handleConnectWallet} loading={loading} error={error} />
        } />
        <Route path="/demo" element={<DoctorPortalDemo />} />
        <Route path="/agreement" element={<ServiceAgreement />} />
        <Route path="/payment" element={<FPXPayment />} />
        <Route path="/ceo/quarterly" element={<CEOQuarterlySummary />} />
        <Route path="/status" element={<SystemStatus />} />
        <Route path="/gov-preview" element={<CouncilorView />} />
        <Route path="/portal/gov-preview" element={<CouncilorView />} />
        <Route path="/admin/gov-dashboard" element={<CouncilorView />} />
        <Route path="/pwa/verify" element={<VerificationPage />} />
        <Route path="/pwa/issue" element={<DoctorPortalDemo />} />
      </Routes>
    );
  }

  // Verification page is public (for employers to verify MCs)
  if (isVerificationRoute) {
    return (
      <Routes>
        <Route path="/verify/:txHash" element={<VerificationPage />} />
      </Routes>
    );
  }

  // THE GATE: Protected routes redirect to /connect if no wallet
  if (isProtectedRoute && !walletAddress) {
    return <Navigate to="/connect" state={{ from: location.pathname }} replace />;
  }

  // Wallet connected - show protected app
  if (walletAddress) {
    return <ProtectedApp walletAddress={walletAddress} handleDisconnect={handleDisconnect} />;
  }

  // Fallback: redirect to home
  return <Navigate to="/" replace />;
}

function App() {
  return (
    <MaintenanceProvider>
      <FoundingMemberProvider>
        <LeadAnalyticsProvider>
          <RevenueAlertProvider>
            <DisasterRecoveryProvider>
              <BillingProvider>
                <BrowserRouter>
                  <CEOAlertToast />
                  <RevenueAlertToast />
                  <DRAlertToast />
                  <AppRoutes />
                </BrowserRouter>
              </BillingProvider>
            </DisasterRecoveryProvider>
          </RevenueAlertProvider>
        </LeadAnalyticsProvider>
      </FoundingMemberProvider>
    </MaintenanceProvider>
  );
}

export default App;
