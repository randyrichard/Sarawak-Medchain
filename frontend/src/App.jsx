import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { connectWallet, getMyBalance } from './utils/contract';
import { BillingProvider } from './context/BillingContext';
import { MaintenanceProvider } from './context/MaintenanceContext';
import { FoundingMemberProvider } from './context/FoundingMemberContext';
import { LeadAnalyticsProvider } from './context/LeadAnalyticsContext';
import { RevenueAlertProvider } from './context/RevenueAlertContext';
import { DisasterRecoveryProvider } from './context/DisasterRecoveryContext';
import { DemoProvider, useDemo } from './context/DemoContext';
import DemoBanner from './components/DemoBanner';
import { CEOAlertToast } from './components/CEOLeadAlerts';
import RevenueAlertToast from './components/RevenueAlertToast';
import { DRAlertToast } from './components/DisasterRecoveryDashboard';
import PatientPortal from './pages/PatientPortal';
import DoctorPortal from './pages/DoctorPortal';
import AdminPortal from './pages/AdminPortal';
import CEODashboard from './pages/CEODashboard';
import HospitalPitch from './pages/HospitalPitch';
import ConnectWallet from './pages/ConnectWallet';
import DoctorPortalDemo from './pages/DoctorPortalDemo';
import ServiceAgreement from './pages/ServiceAgreement';
import FPXPayment from './pages/FPXPayment';
import CEOQuarterlySummary from './pages/CEOQuarterlySummary';
import FounderAdmin from './pages/FounderAdmin';
import HospitalCEODashboard from './pages/HospitalCEODashboard';
import BusinessOverview from './pages/BusinessOverview';
import LandingPage from './pages/LandingPage';
import VerificationPage from './pages/VerificationPage';
import VerifyMC from './pages/VerifyMC';
import VerifyAgreement from './pages/VerifyAgreement';
import SystemStatus from './pages/SystemStatus';
import CouncilorView from './pages/CouncilorView';
import DemoApp from './pages/DemoApp';
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

  // Show only on Admin portal - Doctor portal has its own credit display in header
  const showOnRoutes = ['/admin'];
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
        banner: '', // Use inline style for dark background
        badge: 'border-red-500/30',
        text: 'text-white',
        subtext: 'text-slate-300',
        icon: 'text-red-400',
        button: '' // Use inline style for white button
      };
    }
    if (isWarningBalance) {
      return {
        banner: '', // Use inline style for dark background
        badge: 'border-yellow-500/30',
        text: 'text-white',
        subtext: 'text-slate-300',
        icon: 'text-yellow-400',
        button: '' // Use inline style for white button
      };
    }
    return {
      banner: '',
      badge: 'bg-emerald-50 border-emerald-200',
      text: 'text-slate-300',
      subtext: 'text-slate-400',
      icon: 'text-emerald-500',
      button: 'bg-emerald-600 text-white hover:bg-emerald-700'
    };
  };

  const styles = getStatusStyles();

  // Show warning banner for low credit - DARK THEME with teal accents
  if (needsAttention) {
    return (
      <>
      <div
        className="sticky top-0 z-50"
        style={{
          width: '100%',
          backgroundColor: '#0a0e14',
          borderBottom: '1px solid rgba(20, 184, 166, 0.2)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto' }} className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Warning Icon - Teal */}
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: 'rgba(20, 184, 166, 0.15)',
                border: '1px solid rgba(20, 184, 166, 0.3)'
              }}
            >
              <svg className="w-6 h-6" style={{ color: '#14b8a6' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            {/* Alert Message */}
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold" style={{ color: '#ffffff' }}>
                  {isCriticalBalance ? 'Low Credit Balance' : 'Credit Warning'}
                </h3>
                <span className="text-sm font-semibold" style={{ color: '#14b8a6' }}>
                  RM {loading ? '...' : creditBalance?.toLocaleString() || 0}
                </span>
              </div>
              <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>
                {isCriticalBalance
                  ? 'Top-up required to continue issuing MCs.'
                  : 'Consider topping up soon.'}
              </p>
            </div>
          </div>

          {/* Top Up Now Button */}
          <button
            onClick={handleTopUp}
            disabled={buttonLoading}
            className="credit-topup-btn px-6 py-3 rounded-xl font-semibold text-sm transform hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
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
    <div className="sticky top-0 z-50" style={{ backgroundColor: '#0a0e14', border: 'none', boxShadow: 'none' }}>
      <div className="px-6 py-3 flex items-center justify-between" style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 border border-slate-700`}>
            <svg className={`w-5 h-5 ${styles.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-slate-400">Credit Balance:</span>
              <span className="text-xl font-bold text-emerald-400">
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
  const location = useLocation();
  const [creditBalance, setCreditBalance] = useState(null);
  const [loading, setLoading] = useState(false);

  // Don't show on Doctor route - Doctor Portal has its own credit display
  const isOnDoctorRoute = location.pathname === '/doctor';

  const topUpThreshold = 500; // RM500 threshold
  const needsTopUp = creditBalance !== null && creditBalance < topUpThreshold && !isOnDoctorRoute;

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
  // Disabled - Doctor Portal has its own credit display in header
  // This prevents duplicate credit displays
  return null;
}

// Protected App Layout - requires wallet connection
function ProtectedApp({ walletAddress, handleDisconnect, isDemo = false }) {
  const location = useLocation();
  const currentPath = location.pathname;
  console.log('[ProtectedApp] Rendering with walletAddress:', walletAddress, 'isDemo:', isDemo);
  return (
    <div className="flex flex-col h-screen w-full overflow-hidden" style={{ backgroundColor: '#0a0e14' }}>
      {/* Demo Mode Banner */}
      {isDemo && <DemoBanner />}

      <div className="flex flex-1 overflow-hidden">
      {/* Service Restored Toast Notification */}
      <ServiceRestoredToast />
      {/* Fixed Sidebar */}
      <aside className="w-72 h-full text-white flex flex-col flex-shrink-0" style={{ backgroundColor: '#0a0e14', borderRight: 'none', boxShadow: 'none' }}>
        {/* Logo & Title */}
        <div className="p-6" style={{ borderBottom: 'none' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' }}
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Sarawak</h1>
              <p className="text-xs font-semibold" style={{ color: '#14b8a6' }}>MedChain</p>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            <li>
              <Link
                to="/patient"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                  currentPath === '/patient'
                    ? 'bg-gradient-to-r from-teal-500/20 to-teal-500/5 border-l-2 border-teal-400'
                    : 'hover:bg-slate-800/50'
                }`}
              >
                <svg className={`w-5 h-5 ${currentPath === '/patient' ? 'text-teal-400' : 'text-slate-400 group-hover:text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className={`${currentPath === '/patient' ? 'text-white font-semibold' : 'text-slate-300 group-hover:text-white'}`}>Patient Portal</span>
              </Link>
            </li>
            <li>
              <Link
                to="/doctor"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                  currentPath === '/doctor'
                    ? 'bg-gradient-to-r from-teal-500/20 to-teal-500/5 border-l-2 border-teal-400'
                    : 'hover:bg-slate-800/50'
                }`}
              >
                <svg className={`w-5 h-5 ${currentPath === '/doctor' ? 'text-teal-400' : 'text-slate-400 group-hover:text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className={`${currentPath === '/doctor' ? 'text-white font-semibold' : 'text-slate-300 group-hover:text-white'}`}>Doctor Portal</span>
              </Link>
            </li>
            <li>
              <Link
                to="/admin"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                  currentPath === '/admin'
                    ? 'bg-gradient-to-r from-teal-500/20 to-teal-500/5 border-l-2 border-teal-400'
                    : 'hover:bg-slate-800/50'
                }`}
              >
                <svg className={`w-5 h-5 ${currentPath === '/admin' ? 'text-teal-400' : 'text-slate-400 group-hover:text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className={`${currentPath === '/admin' ? 'text-white font-semibold' : 'text-slate-300 group-hover:text-white'}`}>Admin Portal</span>
              </Link>
            </li>
            <li>
              <Link
                to="/ceo-dashboard"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                  currentPath === '/ceo-dashboard'
                    ? 'bg-gradient-to-r from-teal-500/20 to-teal-500/5 border-l-2 border-teal-400'
                    : 'hover:bg-slate-800/50'
                }`}
              >
                <svg className={`w-5 h-5 ${currentPath === '/ceo-dashboard' ? 'text-teal-400' : 'text-slate-400 group-hover:text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span className={`${currentPath === '/ceo-dashboard' ? 'text-white font-semibold' : 'text-slate-300 group-hover:text-white'}`}>CEO Dashboard</span>
              </Link>
            </li>
            {/* Founder Dashboard - Only shows for founder wallet AND not in demo mode */}
            {!isDemo && walletAddress?.toLowerCase() === '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' && (
              <li>
                <Link to="/founder-admin-secret-99" className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-amber-500/20 transition-colors group border border-amber-500/30 bg-amber-500/10">
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
        <div className="p-4" style={{ borderTop: 'none' }}>
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
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
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
          <Route path="/ceo-dashboard" element={<HospitalCEODashboard />} />
          <Route path="*" element={<Navigate to="/patient" replace />} />
        </Routes>
      </main>
      </div>
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
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        background: '#0a0e14'
      }}>
        <div style={{
          maxWidth: '500px',
          width: '100%',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '24px',
          padding: '48px',
          textAlign: 'center'
        }}>
          {/* Pending badge */}
          <div style={{
            display: 'inline-block',
            background: 'rgba(234,179,8,0.2)',
            color: '#facc15',
            padding: '8px 20px',
            borderRadius: '50px',
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '32px'
          }}>
            ⏳ Pending Admin Verification
          </div>

          {/* Icon */}
          <div style={{
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, #14b8a6, #0891b2)',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            boxShadow: '0 0 30px rgba(20,184,166,0.3)'
          }}>
            <svg width="40" height="40" fill="none" stroke="white" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>

          {/* Title */}
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>
            Welcome, {pendingAdmin.facilityName}
          </h1>

          {/* Subtitle */}
          <p style={{ color: '#9ca3af', marginBottom: '32px' }}>
            Your application is being reviewed by our team
          </p>

          {/* Info grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px',
            textAlign: 'left',
            marginBottom: '32px',
            padding: '24px',
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            {/* Facility Type */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Facility Type
              </p>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', margin: 0 }}>
                {pendingAdmin.facilityType}
              </p>
            </div>
            {/* Your Role */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Your Role
              </p>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', margin: 0 }}>
                {pendingAdmin.decisionMakerRole}
              </p>
            </div>
            {/* Blockchain Ref */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Blockchain Ref
              </p>
              <p style={{ fontSize: '13px', fontWeight: '500', color: '#22d3ee', fontFamily: 'monospace', margin: 0 }}>
                {pendingAdmin.blockchainRef}
              </p>
            </div>
            {/* Submitted */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Submitted
              </p>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', margin: 0 }}>
                {new Date(pendingAdmin.submittedAt).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                })}
              </p>
            </div>
          </div>

          {/* Next Step Section */}
          <div style={{
            textAlign: 'left',
            marginBottom: '24px',
            padding: '16px 20px',
            background: 'rgba(20, 184, 166, 0.1)',
            borderRadius: '12px',
            border: '1px solid rgba(20, 184, 166, 0.2)'
          }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#14b8a6', marginBottom: '4px' }}>
              Next Step: Connect Your Wallet
            </p>
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
              Connect your MetaMask wallet to complete the onboarding process.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              padding: '16px',
              borderRadius: '12px',
              marginBottom: '24px',
              fontSize: '14px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              textAlign: 'left'
            }}>
              {error}
            </div>
          )}

          {/* MetaMask button */}
          <button
            onClick={onConnect}
            disabled={loading}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #f6851b, #e2761b)',
              color: 'white',
              padding: '16px 24px',
              borderRadius: '12px',
              fontWeight: '600',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 8px 32px rgba(246, 133, 27, 0.4)'
            }}
          >
            {loading ? (
              'Connecting...'
            ) : (
              <>
                🦊 Connect MetaMask Wallet
              </>
            )}
          </button>

          {/* Footer link */}
          <p
            onClick={() => {
              localStorage.removeItem('medchain_pending_admin');
              setPendingAdmin(null);
            }}
            style={{
              color: '#6b7280',
              marginTop: '24px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Not {pendingAdmin.facilityName}? Start fresh
          </p>
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
  const { isDemoMode, getDemoWallet, exitDemoMode } = useDemo();
  const [walletAddress, setWalletAddress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingWallet, setCheckingWallet] = useState(true);

  // Demo mode: use mock wallet address
  const effectiveWalletAddress = isDemoMode ? getDemoWallet() : walletAddress;

  const handleConnectWallet = async () => {
    console.log('[App] handleConnectWallet called');
    try {
      setLoading(true);
      setError('');
      console.log('[App] Calling connectWallet()...');
      const { address } = await connectWallet();
      console.log('[App] Wallet connected:', address);
      setWalletAddress(address);
      // After successful connection, redirect to intended destination
      const from = location.state?.from || '/patient';
      console.log('[App] Navigating to:', from);
      navigate(from, { replace: true });
    } catch (err) {
      console.error('[App] Wallet connection error:', err);
      setError(err.message);
      throw err; // Re-throw so ConnectWallet can catch it
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    setWalletAddress(null);
    setError('');
    if (isDemoMode) {
      exitDemoMode();
    }
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
  const publicPaths = ['/', '/founder-admin-secret-99', '/business-overview', '/pitch', '/pricing', '/connect', '/demo', '/demo-app', '/ceo-dashboard', '/agreement', '/payment', '/ceo/quarterly', '/status', '/gov-preview', '/portal/gov-preview', '/admin/gov-dashboard', '/pwa/verify', '/pwa/issue', '/verify-agreement'];
  const isPublicRoute = publicPaths.includes(location.pathname);
  const isVerificationRoute = location.pathname.startsWith('/verify/');

  // Protected routes that require wallet connection
  const protectedPaths = ['/mvp', '/patient', '/doctor', '/admin', '/ceo', '/ceo-dashboard'];
  const isProtectedRoute = protectedPaths.some(path => location.pathname.startsWith(path));

  // Debug logging
  console.log('[AppRoutes] Render - path:', location.pathname, 'walletAddress:', walletAddress, 'isDemoMode:', isDemoMode, 'effectiveWallet:', effectiveWalletAddress, 'isPublicRoute:', isPublicRoute, 'isProtectedRoute:', isProtectedRoute, 'checkingWallet:', checkingWallet);

  // DEMO MODE: Allow access to protected routes with mock wallet
  if (isDemoMode && isProtectedRoute) {
    console.log('[AppRoutes] Demo mode: allowing protected route with mock wallet');
    return <ProtectedApp walletAddress={effectiveWalletAddress} handleDisconnect={handleDisconnect} isDemo={true} />;
  }

  // CRITICAL: If we're on a protected route with a wallet, show protected app immediately
  // This prevents the blank page issue when navigating after connection
  if (walletAddress && isProtectedRoute) {
    console.log('[AppRoutes] Fast path: wallet + protected route -> ProtectedApp');
    return <ProtectedApp walletAddress={walletAddress} handleDisconnect={handleDisconnect} isDemo={false} />;
  }

  // Show loading while checking wallet (skip if in demo mode)
  if (checkingWallet && isProtectedRoute && !isDemoMode) {
    return (
      <div className="min-h-screen bg-[#0a0e14] flex items-center justify-center">
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
        <Route path="/demo-app" element={<DemoApp />} />
        <Route path="/ceo-dashboard" element={<HospitalCEODashboard />} />
        <Route path="/agreement" element={<ServiceAgreement />} />
        <Route path="/payment" element={<FPXPayment />} />
        <Route path="/ceo/quarterly" element={<CEOQuarterlySummary />} />
        <Route path="/status" element={<SystemStatus />} />
        <Route path="/gov-preview" element={<CouncilorView />} />
        <Route path="/portal/gov-preview" element={<CouncilorView />} />
        <Route path="/admin/gov-dashboard" element={<CouncilorView />} />
        <Route path="/pwa/verify" element={<VerificationPage />} />
        <Route path="/pwa/issue" element={<DoctorPortalDemo />} />
        <Route path="/verify-agreement" element={<VerifyAgreement />} />
      </Routes>
    );
  }

  // Verification page is public (for employers to verify MCs)
  if (isVerificationRoute) {
    return (
      <Routes>
        <Route path="/verify/:hash" element={<VerifyMC />} />
      </Routes>
    );
  }

  // THE GATE: Protected routes redirect to /connect if no wallet (unless demo mode)
  if (isProtectedRoute && !walletAddress && !isDemoMode) {
    return <Navigate to="/connect" state={{ from: location.pathname }} replace />;
  }

  // Wallet connected - show protected app
  if (walletAddress) {
    console.log('[AppRoutes] Rendering ProtectedApp');
    try {
      return <ProtectedApp walletAddress={walletAddress} handleDisconnect={handleDisconnect} />;
    } catch (err) {
      console.error('[AppRoutes] Error rendering ProtectedApp:', err);
      return (
        <div style={{ minHeight: '100vh', background: '#0a0e14', color: 'white', padding: '40px', textAlign: 'center' }}>
          <h1>Error Loading App</h1>
          <p style={{ color: '#f87171' }}>{err.message}</p>
          <button onClick={handleDisconnect} style={{ marginTop: '20px', padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
            Disconnect Wallet
          </button>
        </div>
      );
    }
  }

  // Fallback: redirect to home
  console.log('[AppRoutes] Fallback - redirecting to home');
  return <Navigate to="/" replace />;
}

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', background: '#0a0e14', color: 'white', padding: '40px', textAlign: 'center' }}>
          <h1 style={{ color: '#f87171', marginBottom: '20px' }}>Something went wrong</h1>
          <p style={{ color: '#94a3b8', marginBottom: '20px' }}>{this.state.error?.message || 'Unknown error'}</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = '/';
            }}
            style={{ padding: '12px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            Go to Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <DemoProvider>
        <MaintenanceProvider>
          <FoundingMemberProvider>
            <LeadAnalyticsProvider>
              <RevenueAlertProvider>
                <DisasterRecoveryProvider>
                  <BillingProvider>
                    <BrowserRouter>
                      <AppRoutes />
                    </BrowserRouter>
                  </BillingProvider>
                </DisasterRecoveryProvider>
              </RevenueAlertProvider>
            </LeadAnalyticsProvider>
          </FoundingMemberProvider>
        </MaintenanceProvider>
      </DemoProvider>
    </ErrorBoundary>
  );
}

export default App;
