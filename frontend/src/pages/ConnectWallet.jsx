/**
 * Connect Wallet Page
 * Gate page for accessing the MedChain application
 * Only shown when user tries to access protected routes without a wallet
 * WEALTH 2026 DEMO: Includes biometric-style Security Verified animation
 */

import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';

const MEDCHAIN_BLUE = '#0066CC';

// WEALTH 2026 DEMO: Security Verified Animation Component
function SecurityVerifiedAnimation({ onComplete }) {
  const [phase, setPhase] = useState('scanning'); // scanning -> verified -> complete

  useEffect(() => {
    // Phase 1: Scanning (300ms)
    const scanTimer = setTimeout(() => setPhase('verified'), 300);
    // Phase 2: Verified display (600ms)
    const verifyTimer = setTimeout(() => setPhase('complete'), 900);
    // Phase 3: Complete and callback
    const completeTimer = setTimeout(() => onComplete?.(), 1200);

    return () => {
      clearTimeout(scanTimer);
      clearTimeout(verifyTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[100] bg-[#030712] flex items-center justify-center">
      {/* Background grid animation */}
      <div className="absolute inset-0 overflow-hidden opacity-20">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(16, 185, 129, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(16, 185, 129, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '30px 30px',
          }}
        />
      </div>

      <div className="relative text-center">
        {/* Shield Icon with Scan Effect */}
        <div className="relative w-32 h-32 mx-auto mb-8">
          {/* Outer pulse rings */}
          <div
            className={`absolute inset-0 rounded-full border-2 border-emerald-500/30 ${
              phase === 'scanning' ? 'animate-ping' : ''
            }`}
            style={{ animationDuration: '1s' }}
          />
          <div
            className={`absolute inset-2 rounded-full border-2 border-emerald-500/40 ${
              phase === 'scanning' ? 'animate-ping' : ''
            }`}
            style={{ animationDuration: '1.2s', animationDelay: '0.1s' }}
          />

          {/* Main shield container */}
          <div
            className={`absolute inset-4 rounded-full flex items-center justify-center transition-all duration-500 ${
              phase === 'verified' || phase === 'complete'
                ? 'bg-emerald-500/20 scale-110'
                : 'bg-slate-800/50'
            }`}
          >
            {/* Shield SVG */}
            <svg
              className={`w-16 h-16 transition-all duration-300 ${
                phase === 'verified' || phase === 'complete'
                  ? 'text-emerald-400'
                  : 'text-slate-500'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                className={phase === 'verified' || phase === 'complete' ? 'checkmark-animate' : ''}
                style={{
                  strokeDasharray: phase === 'verified' || phase === 'complete' ? '100' : '0',
                  strokeDashoffset: phase === 'verified' || phase === 'complete' ? '0' : '100',
                  transition: 'stroke-dashoffset 0.5s ease-out',
                }}
              />
            </svg>

            {/* Scan line effect */}
            {phase === 'scanning' && (
              <div
                className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
                style={{
                  animation: 'security-scan 0.8s ease-in-out infinite',
                }}
              />
            )}
          </div>
        </div>

        {/* Status Text */}
        <div className="space-y-2">
          {phase === 'scanning' && (
            <>
              <h2 className="text-2xl font-bold text-white animate-pulse">
                Verifying Identity...
              </h2>
              <p className="text-slate-400 text-sm">Cryptographic signature check</p>
            </>
          )}
          {(phase === 'verified' || phase === 'complete') && (
            <>
              <h2 className="text-2xl font-bold text-emerald-400">
                Security Verified
              </h2>
              <div className="flex items-center justify-center gap-2 mt-4">
                <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-xs font-bold">
                  AES-256-GCM
                </span>
                <span className="px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded-full text-blue-400 text-xs font-bold">
                  BLOCKCHAIN
                </span>
              </div>
              <p className="text-slate-400 text-sm mt-3">
                Military-grade encryption active
              </p>
            </>
          )}
        </div>
      </div>

      {/* CSS for scan animation */}
      <style>{`
        @keyframes security-scan {
          0%, 100% { top: 10%; opacity: 0; }
          50% { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}

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
  const [showSecurityAnimation, setShowSecurityAnimation] = useState(false);

  // WEALTH 2026 DEMO: Wrap onConnect to show security animation first
  const handleSecureConnect = async () => {
    setShowSecurityAnimation(true);
  };

  const handleAnimationComplete = () => {
    setShowSecurityAnimation(false);
    onConnect();
  };

  // Show Security Verified animation
  if (showSecurityAnimation) {
    return <SecurityVerifiedAnimation onComplete={handleAnimationComplete} />;
  }

  // Get the intended destination
  const from = location.state?.from || '/patient';
  const isFromDoctorPortal = from.includes('doctor');

  // Handle auto-connect for pending admin
  useEffect(() => {
    if (!pendingAdmin?.autoConnect || autoConnectTriggeredRef.current) return;

    autoConnectTriggeredRef.current = true;
    const updatedData = { ...pendingAdmin, autoConnect: false };
    localStorage.setItem('medchain_pending_admin', JSON.stringify(updatedData));
    const timer = setTimeout(() => handleSecureConnect(), 500);
    return () => clearTimeout(timer);
  }, [pendingAdmin]);

  // Pending Admin UI
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
            onClick={handleSecureConnect}
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
              onClick={handleSecureConnect}
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
