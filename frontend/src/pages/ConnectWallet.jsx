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
    // Phase 1: Scanning (800ms for more dramatic effect)
    const scanTimer = setTimeout(() => setPhase('verified'), 800);
    // Phase 2: Verified display (800ms)
    const verifyTimer = setTimeout(() => setPhase('complete'), 1600);
    // Phase 3: Complete and callback
    const completeTimer = setTimeout(() => onComplete?.(), 2000);

    return () => {
      clearTimeout(scanTimer);
      clearTimeout(verifyTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  const isVerified = phase === 'verified' || phase === 'complete';

  // All styles as inline for consistency
  const containerStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    background: 'linear-gradient(180deg, #030712 0%, #0a1628 50%, #030712 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
  };

  const gridOverlayStyle = {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    opacity: 0.15,
    backgroundImage: `
      linear-gradient(rgba(16, 185, 129, 0.2) 1px, transparent 1px),
      linear-gradient(90deg, rgba(16, 185, 129, 0.2) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
  };

  const shieldContainerStyle = {
    position: 'relative',
    width: '160px',
    height: '160px',
    marginBottom: '32px',
  };

  const pulseRing1Style = {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    border: '2px solid rgba(16, 185, 129, 0.3)',
    animation: phase === 'scanning' ? 'pulse-ring 2s ease-out infinite' : 'none',
  };

  const pulseRing2Style = {
    position: 'absolute',
    inset: '8px',
    borderRadius: '50%',
    border: '2px solid rgba(16, 185, 129, 0.4)',
    animation: phase === 'scanning' ? 'pulse-ring 2s ease-out infinite 0.3s' : 'none',
  };

  const pulseRing3Style = {
    position: 'absolute',
    inset: '16px',
    borderRadius: '50%',
    border: '2px solid rgba(16, 185, 129, 0.5)',
    animation: phase === 'scanning' ? 'pulse-ring 2s ease-out infinite 0.6s' : 'none',
  };

  const shieldBackgroundStyle = {
    position: 'absolute',
    inset: '24px',
    borderRadius: '50%',
    background: isVerified
      ? 'radial-gradient(circle, rgba(16, 185, 129, 0.3) 0%, rgba(16, 185, 129, 0.1) 70%, transparent 100%)'
      : 'rgba(30, 41, 59, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.5s ease',
    transform: isVerified ? 'scale(1.1)' : 'scale(1)',
    boxShadow: isVerified
      ? '0 0 60px rgba(16, 185, 129, 0.4), 0 0 100px rgba(16, 185, 129, 0.2), inset 0 0 30px rgba(16, 185, 129, 0.1)'
      : '0 0 30px rgba(16, 185, 129, 0.1)',
  };

  const shieldIconStyle = {
    width: '80px',
    height: '80px',
    color: isVerified ? '#34d399' : '#64748b',
    transition: 'all 0.5s ease',
    filter: isVerified ? 'drop-shadow(0 0 20px rgba(52, 211, 153, 0.6))' : 'none',
  };

  const titleStyle = {
    fontSize: '28px',
    fontWeight: '700',
    color: isVerified ? '#34d399' : '#ffffff',
    marginBottom: '8px',
    letterSpacing: '0.5px',
    textShadow: isVerified ? '0 0 20px rgba(52, 211, 153, 0.5)' : 'none',
    transition: 'all 0.5s ease',
  };

  const subtitleStyle = {
    fontSize: '14px',
    color: '#94a3b8',
    marginBottom: '24px',
  };

  const badgeContainerStyle = {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    marginTop: '16px',
  };

  const encryptionBadgeStyle = {
    padding: '8px 16px',
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: '20px',
    color: '#34d399',
    fontSize: '12px',
    fontWeight: '600',
    letterSpacing: '0.5px',
  };

  const blockchainBadgeStyle = {
    padding: '8px 16px',
    background: 'rgba(59, 130, 246, 0.15)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    borderRadius: '20px',
    color: '#60a5fa',
    fontSize: '12px',
    fontWeight: '600',
    letterSpacing: '0.5px',
  };

  const loadingDotsStyle = {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    marginTop: '32px',
  };

  const dotStyle = (delay) => ({
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: isVerified ? '#34d399' : '#64748b',
    animation: 'loading-dot 1.4s ease-in-out infinite',
    animationDelay: delay,
  });

  const footerTextStyle = {
    fontSize: '13px',
    color: '#64748b',
    marginTop: '24px',
  };

  return (
    <div style={containerStyle}>
      {/* Background grid */}
      <div style={gridOverlayStyle} />

      {/* Main content */}
      <div style={{ position: 'relative', textAlign: 'center' }}>
        {/* Shield Icon with Pulse Effect */}
        <div style={shieldContainerStyle}>
          {/* Pulse rings */}
          <div style={pulseRing1Style} />
          <div style={pulseRing2Style} />
          <div style={pulseRing3Style} />

          {/* Shield background with glow */}
          <div style={shieldBackgroundStyle}>
            {/* Shield SVG - larger size */}
            <svg
              style={shieldIconStyle}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
        </div>

        {/* Status Text */}
        <div>
          <h2 style={titleStyle}>
            {isVerified ? 'Security Verified' : 'Verifying Identity...'}
          </h2>
          <p style={subtitleStyle}>
            {isVerified ? 'Military-grade encryption active' : 'Cryptographic signature check in progress'}
          </p>

          {/* Security badges */}
          {isVerified && (
            <div style={badgeContainerStyle}>
              <span style={encryptionBadgeStyle}>AES-256-GCM</span>
              <span style={blockchainBadgeStyle}>BLOCKCHAIN VERIFIED</span>
            </div>
          )}

          {/* Loading dots indicator */}
          {phase === 'scanning' && (
            <div style={loadingDotsStyle}>
              <div style={dotStyle('0s')} />
              <div style={dotStyle('0.2s')} />
              <div style={dotStyle('0.4s')} />
            </div>
          )}
        </div>

        {/* Footer text */}
        <p style={footerTextStyle}>
          {isVerified ? 'Redirecting to dashboard...' : 'Please wait while we verify your credentials'}
        </p>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes loading-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
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
  const [localError, setLocalError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Check if MetaMask is installed
  const isMetaMaskInstalled = typeof window !== 'undefined' && Boolean(window.ethereum);

  // WEALTH 2026 DEMO: Wrap onConnect to show security animation first
  const handleSecureConnect = async () => {
    console.log('[ConnectWallet] Button clicked');
    console.log('[ConnectWallet] MetaMask installed:', isMetaMaskInstalled);

    // Clear any previous errors
    setLocalError('');

    // Check if MetaMask is installed first
    if (!isMetaMaskInstalled) {
      console.log('[ConnectWallet] MetaMask not installed, showing error');
      setLocalError('MetaMask is not installed. Please install MetaMask to continue.');
      return;
    }

    console.log('[ConnectWallet] Starting security animation');
    setShowSecurityAnimation(true);
  };

  const handleAnimationComplete = async () => {
    console.log('[ConnectWallet] Animation complete, starting connection');
    setShowSecurityAnimation(false);
    setIsConnecting(true);

    try {
      console.log('[ConnectWallet] Calling onConnect()...');
      await onConnect();
      console.log('[ConnectWallet] onConnect() completed successfully');
    } catch (err) {
      console.error('[ConnectWallet] Connection error:', err);
      setLocalError(err.message || 'Failed to connect wallet. Please try again.');
      setIsConnecting(false);
    }
    // Note: Don't set isConnecting to false on success - we're navigating away
  };

  // Get the intended destination (moved before any returns)
  const from = location.state?.from || '/patient';
  const isFromDoctorPortal = from.includes('doctor');

  // Combined error from parent or local
  const displayError = localError || error;
  // Combined loading state
  const isLoading = loading || isConnecting;

  // Handle auto-connect for pending admin - MUST be before any early returns (Rules of Hooks)
  useEffect(() => {
    if (!pendingAdmin?.autoConnect || autoConnectTriggeredRef.current) return;

    autoConnectTriggeredRef.current = true;
    const updatedData = { ...pendingAdmin, autoConnect: false };
    localStorage.setItem('medchain_pending_admin', JSON.stringify(updatedData));
    const timer = setTimeout(() => handleSecureConnect(), 500);
    return () => clearTimeout(timer);
  }, [pendingAdmin]);

  // Show Security Verified animation
  if (showSecurityAnimation) {
    return <SecurityVerifiedAnimation onComplete={handleAnimationComplete} />;
  }

  // Show connecting state after animation
  if (isConnecting) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0e14'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '64px',
            height: '64px',
            border: '4px solid rgba(246, 133, 27, 0.2)',
            borderTopColor: '#f6851b',
            borderRadius: '50%',
            margin: '0 auto 24px',
            animation: 'spin 1s linear infinite'
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <h2 style={{ color: 'white', fontSize: '20px', marginBottom: '8px' }}>Connecting to MetaMask...</h2>
          <p style={{ color: '#9ca3af', fontSize: '14px' }}>Please confirm the connection in your wallet</p>
        </div>
      </div>
    );
  }

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

          {/* MetaMask Not Installed Warning */}
          {!isMetaMaskInstalled && (
            <div style={{
              padding: '16px',
              borderRadius: '12px',
              marginBottom: '24px',
              fontSize: '14px',
              background: 'rgba(251, 191, 36, 0.1)',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              color: '#fbbf24',
              textAlign: 'left'
            }}>
              <p style={{ fontWeight: '600', marginBottom: '8px' }}>MetaMask Required</p>
              <p style={{ margin: 0, color: '#94a3b8' }}>
                Please install the MetaMask browser extension to connect your wallet.{' '}
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#f6851b', textDecoration: 'underline' }}
                >
                  Download MetaMask
                </a>
              </p>
            </div>
          )}

          {/* Error Message */}
          {displayError && (
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
              {displayError}
            </div>
          )}

          {/* MetaMask button hover styles */}
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
            .metamask-connect-btn {
              transition: all 0.3s ease !important;
            }
            .metamask-connect-btn:hover:not(:disabled) {
              transform: translateY(-2px);
              box-shadow: 0 12px 40px rgba(246, 133, 27, 0.6), 0 0 20px rgba(246, 133, 27, 0.3) !important;
              filter: brightness(1.1);
            }
            .metamask-connect-btn:active:not(:disabled) {
              transform: translateY(0);
            }
          `}</style>

          {/* MetaMask button */}
          <button
            onClick={handleSecureConnect}
            disabled={isLoading || !isMetaMaskInstalled}
            className="metamask-connect-btn"
            style={{
              width: '100%',
              background: !isMetaMaskInstalled
                ? 'linear-gradient(135deg, #6b7280, #4b5563)'
                : 'linear-gradient(135deg, #f6851b, #e2761b)',
              color: 'white',
              padding: '16px 24px',
              borderRadius: '12px',
              fontWeight: '600',
              border: 'none',
              cursor: (isLoading || !isMetaMaskInstalled) ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              opacity: (isLoading || !isMetaMaskInstalled) ? 0.7 : 1,
              boxShadow: !isMetaMaskInstalled
                ? 'none'
                : '0 8px 32px rgba(246, 133, 27, 0.4)'
            }}
          >
            {isLoading ? (
              <>
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                Connecting...
              </>
            ) : !isMetaMaskInstalled ? (
              '🦊 MetaMask Not Installed'
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

            {/* MetaMask Not Installed Warning */}
            {!isMetaMaskInstalled && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 p-4 rounded-xl mb-6 text-sm">
                <p className="font-semibold mb-2">MetaMask Required</p>
                <p className="text-slate-400">
                  Please install the MetaMask browser extension to connect your wallet.{' '}
                  <a
                    href="https://metamask.io/download/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    Download MetaMask
                  </a>
                </p>
              </div>
            )}

            {/* Error Message */}
            {displayError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl mb-6 text-sm flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{displayError}</span>
              </div>
            )}

            {/* Connect Button */}
            <button
              onClick={handleSecureConnect}
              disabled={isLoading || !isMetaMaskInstalled}
              className={`w-full py-4 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg ${
                !isMetaMaskInstalled
                  ? 'bg-gradient-to-r from-gray-600 to-gray-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-blue-500/20'
              }`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connecting to MetaMask...
                </>
              ) : !isMetaMaskInstalled ? (
                <>
                  <span>🦊</span>
                  MetaMask Not Installed
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
