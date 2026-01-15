import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { connectWallet, getMyBalance } from './utils/contract';
import { BillingProvider } from './context/BillingContext';
import PatientPortal from './pages/PatientPortal';
import DoctorPortal from './pages/DoctorPortal';
import AdminPortal from './pages/AdminPortal';
import CEODashboard from './pages/CEODashboard';
import FounderAdmin from './pages/FounderAdmin';
import './App.css';

// Sticky Credit Balance Header Component (shows at top of main content)
function StickyBalanceHeader({ walletAddress }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [creditBalance, setCreditBalance] = useState(null);
  const [loading, setLoading] = useState(false);

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
            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-lg ${styles.button}`}
          >
            Top Up Now
          </button>
        </div>
      </div>
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
            Credit Balance
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
              {loading ? '...' : creditBalance !== null ? creditBalance : '--'}
            </p>
            <p className={`text-xs mt-1 ${isLowBalance ? 'text-amber-200/70' : 'text-emerald-200/70'}`}>
              credits available
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

function App() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnectWallet = async () => {
    try {
      setLoading(true);
      setError('');
      const { address } = await connectWallet();
      setWalletAddress(address);
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
    // Reload page to fully reset state
    window.location.reload();
  };

  // Auto-connect if already connected
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' })
        .then(accounts => {
          if (accounts.length > 0) {
            handleConnectWallet();
          }
        });
    }
  }, []);

  if (!walletAddress) {
    return (
      <div className="connect-container">
        <div className="connect-card">
          <h1>Sarawak MedChain MVP</h1>
          <p>Patient-Controlled Medical Records</p>

          {error && <div className="message error">{error}</div>}

          <button onClick={handleConnectWallet} disabled={loading}>
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

  return (
    <BillingProvider>
      <BrowserRouter>
        <div className="flex h-screen w-full overflow-hidden">
        {/* Fixed Sidebar */}
        <aside className="w-72 h-full bg-slate-900 text-white flex flex-col flex-shrink-0">
          {/* Logo & Title */}
          <div className="p-6 border-b border-slate-800">
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
          <div className="p-4 border-t border-slate-800">
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
        <main className="flex-1 flex flex-col w-full overflow-y-auto">
          {/* Sticky Credit Balance Header */}
          <StickyBalanceHeader walletAddress={walletAddress} />

          <Routes>
            <Route path="/" element={<Navigate to="/patient" replace />} />
            <Route path="/patient" element={<PatientPortal walletAddress={walletAddress} />} />
            <Route path="/doctor" element={<DoctorPortal walletAddress={walletAddress} />} />
            <Route path="/admin" element={<AdminPortal walletAddress={walletAddress} />} />
            <Route path="/ceo" element={<CEODashboard walletAddress={walletAddress} />} />
            <Route path="/founder-admin-secret-99" element={<FounderAdmin />} />
          </Routes>
        </main>
        </div>
      </BrowserRouter>
    </BillingProvider>
  );
}

export default App;
