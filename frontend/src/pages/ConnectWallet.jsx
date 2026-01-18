/**
 * Connect Wallet Page
 * Gate page for accessing the MedChain application
 * Only shown when user tries to access protected routes without a wallet
 */

import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';

const MEDCHAIN_BLUE = '#0066CC';

// Helper to get initial pending admin data
function getInitialPendingAdmin() {
  try {
    const storedData = localStorage.getItem('medchain_pending_admin');
    return storedData ? JSON.parse(storedData) : null;
  } catch {
    return null;
  }
}

export default function ConnectWallet({ onConnect, loading, error }) {
  const location = useLocation();
  const [pendingAdmin, setPendingAdmin] = useState(getInitialPendingAdmin);
  const autoConnectTriggeredRef = useRef(false);

  // Get the intended destination
  const from = location.state?.from || '/patient';
  const isFromDoctorPortal = from.includes('doctor');

  // Handle auto-connect for pending admin
  useEffect(() => {
    if (!pendingAdmin?.autoConnect || autoConnectTriggeredRef.current) return;

    autoConnectTriggeredRef.current = true;
    const updatedData = { ...pendingAdmin, autoConnect: false };
    localStorage.setItem('medchain_pending_admin', JSON.stringify(updatedData));
    const timer = setTimeout(() => onConnect(), 500);
    return () => clearTimeout(timer);
  }, [pendingAdmin, onConnect]);

  // Pending Admin UI
  if (pendingAdmin) {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center p-6">
        <div className="max-w-lg w-full">
          <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-8 shadow-2xl">
            <div className="flex justify-center mb-6">
              <span className="px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-full text-amber-400 text-sm font-bold flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
                Pending Admin Verification
              </span>
            </div>

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

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
              <p className="text-blue-400 font-semibold text-sm mb-2">Next Step: Connect Your Wallet</p>
              <p className="text-slate-400 text-sm">
                Connect your MetaMask wallet to complete the onboarding process.
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
                  <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" className="w-5 h-5" />
                  Connect MetaMask Wallet
                </>
              )}
            </button>

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

  // Main Connect Wallet UI
  return (
    <div className="min-h-screen bg-[#030712] flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: MEDCHAIN_BLUE }}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <span className="text-xl font-bold text-white">Sarawak</span>
              <span className="text-xl font-bold text-amber-400 ml-1">MedChain</span>
            </div>
          </Link>
          <Link to="/" className="text-slate-400 hover:text-white text-sm transition-colors">
            ← Back to Home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          {/* Connection Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 rounded-3xl p-8 shadow-2xl">
            {/* Icon */}
            <div className="w-20 h-20 mx-auto mb-6 relative">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 opacity-20 blur-xl"></div>
              <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center">
                <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-white text-center mb-2">
              {isFromDoctorPortal ? 'Doctor Portal Access' : 'Connect to MedChain'}
            </h1>
            <p className="text-slate-400 text-center mb-8">
              {isFromDoctorPortal
                ? 'Verify your identity to access the doctor terminal'
                : 'Connect your wallet to access the secure medical records system'}
            </p>

            {/* Security Badge */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <p className="text-emerald-400 font-semibold text-sm">Blockchain-Secured</p>
                  <p className="text-slate-400 text-xs mt-1">
                    Your wallet acts as your cryptographic identity. No passwords, no breaches.
                  </p>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl mb-6 text-sm flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Connect Button */}
            <button
              onClick={onConnect}
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold rounded-xl hover:from-blue-500 hover:to-cyan-500 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg shadow-blue-500/20"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connecting to MetaMask...
                </>
              ) : (
                <>
                  <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6" />
                  Connect MetaMask Wallet
                </>
              )}
            </button>

            {/* Info Text */}
            <p className="text-slate-500 text-xs text-center mt-4">
              Don't have MetaMask?{' '}
              <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                Download here
              </a>
            </p>
          </div>

          {/* Features */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-slate-800 flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <p className="text-slate-400 text-xs">Zero Passwords</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-slate-800 flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <p className="text-slate-400 text-xs">Audit Trail</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-slate-800 flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <p className="text-slate-400 text-xs">Instant Verify</p>
            </div>
          </div>

          {/* Back Links */}
          <div className="mt-8 text-center space-x-4">
            <Link to="/pitch" className="text-slate-500 hover:text-blue-400 text-sm transition-colors">
              View Pitch Deck
            </Link>
            <span className="text-slate-700">|</span>
            <Link to="/" className="text-slate-500 hover:text-blue-400 text-sm transition-colors">
              Return Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
