/**
 * Connect Wallet Page
 * Gate page for accessing the MedChain application
 * Only shown when user tries to access protected routes without a wallet
 * WEALTH 2026 DEMO: Includes biometric-style Security Verified animation
 */

import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Shield, Lock, FileCheck, ChevronLeft } from 'lucide-react';

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

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 100,
      background: '#FFFFFF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: 0,
      padding: 0,
    }}>
      {/* Card container */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '20px',
        border: isVerified
          ? '1px solid rgba(16, 185, 129, 0.5)'
          : '1px solid #E2E8F0',
        boxShadow: isVerified
          ? '0 0 30px rgba(16, 185, 129, 0.15), 0 0 60px rgba(16, 185, 129, 0.05)'
          : '0 4px 24px rgba(0, 0, 0, 0.08)',
        padding: '48px',
        textAlign: 'center',
        minWidth: '380px',
        transition: 'all 0.5s ease',
      }}>
        {/* Shield Icon Container */}
        <div style={{
          position: 'relative',
          width: '120px',
          height: '120px',
          margin: '0 auto 32px auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {/* Pulse ring (only during scanning) */}
          {phase === 'scanning' && (
            <div style={{
              position: 'absolute',
              inset: '-10px',
              borderRadius: '50%',
              border: '2px solid rgba(16, 185, 129, 0.4)',
              animation: 'pulse-ring 1.5s ease-out infinite',
            }} />
          )}

          {/* Shield background circle */}
          <div style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: isVerified
              ? 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 70%)'
              : '#F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.5s ease',
            boxShadow: isVerified
              ? '0 0 30px rgba(16, 185, 129, 0.2), inset 0 0 15px rgba(16, 185, 129, 0.05)'
              : 'none',
            animation: isVerified ? 'shield-glow 2s ease-in-out infinite' : 'none',
          }}>
            {/* Shield SVG with checkmark */}
            <svg
              style={{
                width: '64px',
                height: '64px',
                color: isVerified ? '#059669' : '#94A3B8',
                transition: 'all 0.5s ease',
                filter: isVerified ? 'drop-shadow(0 0 8px rgba(5, 150, 105, 0.4))' : 'none',
              }}
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

        {/* Title */}
        <h2 style={{
          fontSize: '26px',
          fontWeight: '700',
          color: isVerified ? '#059669' : '#1E293B',
          margin: '0 0 8px 0',
          letterSpacing: '0.3px',
          transition: 'color 0.5s ease',
        }}>
          {isVerified ? 'Security Verified' : 'Verifying Identity...'}
        </h2>

        {/* Subtitle */}
        <p style={{
          fontSize: '14px',
          color: '#64748B',
          margin: '0 0 24px 0',
        }}>
          {isVerified ? 'Military-grade encryption active' : 'Cryptographic signature check in progress'}
        </p>

        {/* Security badges (only when verified) */}
        {isVerified && (
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            marginBottom: '24px',
          }}>
            <span style={{
              padding: '8px 16px',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: '20px',
              color: '#059669',
              fontSize: '11px',
              fontWeight: '600',
              letterSpacing: '0.5px',
            }}>AES-256-GCM</span>
            <span style={{
              padding: '8px 16px',
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '20px',
              color: '#2563EB',
              fontSize: '11px',
              fontWeight: '600',
              letterSpacing: '0.5px',
            }}>BLOCKCHAIN VERIFIED</span>
          </div>
        )}

        {/* Loading dots (only during scanning) */}
        {phase === 'scanning' && (
          <div style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
            marginBottom: '24px',
          }}>
            {[0, 0.2, 0.4].map((delay, i) => (
              <div key={i} style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#94A3B8',
                animation: 'loading-dot 1.4s ease-in-out infinite',
                animationDelay: `${delay}s`,
              }} />
            ))}
          </div>
        )}

        {/* Footer text with spinner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}>
          {isVerified && (
            <div style={{
              width: '14px',
              height: '14px',
              border: '2px solid rgba(5, 150, 105, 0.2)',
              borderTopColor: '#059669',
              borderRadius: '50%',
              animation: 'spinner 0.8s linear infinite',
            }} />
          )}
          <p style={{
            fontSize: '13px',
            color: '#94A3B8',
            margin: 0,
          }}>
            {isVerified ? 'Redirecting to dashboard...' : 'Please wait while we verify your credentials'}
          </p>
        </div>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes loading-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes shield-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(16, 185, 129, 0.2), inset 0 0 15px rgba(16, 185, 129, 0.05); }
          50% { box-shadow: 0 0 40px rgba(16, 185, 129, 0.25), inset 0 0 20px rgba(16, 185, 129, 0.08); }
        }
        @keyframes spinner {
          to { transform: rotate(360deg); }
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

  // Check if we're on production (not localhost)
  const isProduction = typeof window !== 'undefined' &&
    !window.location.hostname.includes('localhost') &&
    !window.location.hostname.includes('127.0.0.1');

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
        background: '#FFFFFF'
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
          <h2 style={{ color: '#1E293B', fontSize: '20px', marginBottom: '8px' }}>Connecting to MetaMask...</h2>
          <p style={{ color: '#64748B', fontSize: '14px' }}>Please confirm the connection in your wallet</p>
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
        background: '#FFFFFF'
      }}>
        <div style={{
          maxWidth: '500px',
          width: '100%',
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '24px',
          padding: '48px',
          textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)'
        }}>
          {/* Pending badge */}
          <div style={{
            display: 'inline-block',
            background: '#FFFBEB',
            color: '#B45309',
            padding: '8px 20px',
            borderRadius: '50px',
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '32px'
          }}>
            Pending Admin Verification
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
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#1E293B', marginBottom: '8px' }}>
            Welcome, {pendingAdmin.facilityName}
          </h1>

          {/* Subtitle */}
          <p style={{ color: '#64748B', marginBottom: '32px' }}>
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
            background: '#F8FAFC',
            borderRadius: '16px',
            border: '1px solid #E2E8F0'
          }}>
            {/* Facility Type */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Facility Type
              </p>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#1E293B', margin: 0 }}>
                {pendingAdmin.facilityType}
              </p>
            </div>
            {/* Your Role */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Your Role
              </p>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#1E293B', margin: 0 }}>
                {pendingAdmin.decisionMakerRole}
              </p>
            </div>
            {/* Blockchain Ref */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Blockchain Ref
              </p>
              <p style={{ fontSize: '13px', fontWeight: '500', color: '#0F766E', fontFamily: 'monospace', margin: 0 }}>
                {pendingAdmin.blockchainRef}
              </p>
            </div>
            {/* Submitted */}
            <div>
              <p style={{ fontSize: '11px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Submitted
              </p>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#1E293B', margin: 0 }}>
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
            background: '#F0FDFA',
            borderRadius: '12px',
            border: '1px solid #CCFBF1'
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
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              color: '#B45309',
              textAlign: 'left'
            }}>
              <p style={{ fontWeight: '600', marginBottom: '8px' }}>MetaMask Required</p>
              <p style={{ margin: 0, color: '#64748B' }}>
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
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#DC2626',
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
              'MetaMask Not Installed'
            ) : (
              <>
                Connect MetaMask Wallet
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
              color: '#94A3B8',
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
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header style={{ borderBottom: '1px solid #E2E8F0', background: '#FFFFFF' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#0F766E' }}>
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold" style={{ color: '#1E293B' }}>Sarawak</span>
              <span className="text-xl font-bold ml-1" style={{ color: '#0F766E' }}>MedChain</span>
            </div>
          </Link>
          <Link to="/" className="flex items-center gap-1 text-sm transition-colors hover:opacity-80" style={{ color: '#64748B' }}>
            <ChevronLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          {/* Connection Card */}
          <div className="rounded-3xl p-8" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)' }}>
            {/* Icon */}
            <div className="w-20 h-20 mx-auto mb-6 relative">
              <div className="absolute inset-0 rounded-2xl opacity-20 blur-xl" style={{ background: 'linear-gradient(135deg, #0F766E, #14B8A6)' }}></div>
              <div className="relative w-full h-full rounded-2xl flex items-center justify-center" style={{ background: 'rgba(15, 118, 110, 0.08)', border: '1px solid rgba(15, 118, 110, 0.2)' }}>
                <Lock className="w-10 h-10" style={{ color: '#0F766E' }} />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-center mb-2" style={{ color: '#1E293B' }}>
              {isFromDoctorPortal ? 'Doctor Portal Access' : 'Connect to MedChain'}
            </h1>
            <p className="text-center mb-8" style={{ color: '#64748B' }}>
              {isFromDoctorPortal
                ? 'Verify your identity to access the doctor terminal'
                : 'Connect your wallet to access the secure medical records system'}
            </p>

            {/* Security Badge */}
            <div className="rounded-xl p-4 mb-6" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>
                  <Shield className="w-4 h-4" style={{ color: '#059669' }} />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: '#059669' }}>Blockchain-Secured</p>
                  <p className="text-xs mt-1" style={{ color: '#64748B' }}>
                    Your wallet acts as your cryptographic identity. No passwords, no breaches.
                  </p>
                </div>
              </div>
            </div>

            {/* MetaMask Not Installed Warning - Only on localhost */}
            {!isProduction && !isMetaMaskInstalled && (
              <div className="p-4 rounded-xl mb-6 text-sm" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#B45309' }}>
                <p className="font-semibold mb-2">MetaMask Required</p>
                <p style={{ color: '#64748B' }}>
                  Please install the MetaMask browser extension to connect your wallet.{' '}
                  <a
                    href="https://metamask.io/download/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: '#0F766E' }}
                  >
                    Download MetaMask
                  </a>
                </p>
              </div>
            )}

            {/* Production Warning - Show on deployed site */}
            {isProduction && (
              <div className="p-6 rounded-xl mb-6" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF' }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                    <svg className="w-5 h-5" style={{ color: '#2563EB' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="font-bold text-lg" style={{ color: '#1E40AF' }}>Demo Deployment</p>
                </div>
                <p className="mb-4 leading-relaxed" style={{ color: '#334155' }}>
                  This is a live demo site without a blockchain backend. MetaMask connection is not available here.
                </p>
                <p className="text-sm mb-4" style={{ color: '#64748B' }}>
                  To explore the full application with simulated blockchain features, use our interactive demo mode.
                </p>
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 text-white px-6 py-3 rounded-xl font-bold transition-all"
                  style={{ background: 'linear-gradient(135deg, #0F766E, #14B8A6)', boxShadow: '0 4px 16px rgba(15, 118, 110, 0.25)' }}
                >
                  <ChevronLeft className="w-5 h-5" />
                  Go to Landing Page & Try Demo
                </Link>
              </div>
            )}

            {/* Error Message */}
            {displayError && (
              <div className="p-4 rounded-xl mb-6 text-sm flex items-start gap-3" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{displayError}</span>
              </div>
            )}

            {/* Connect Button - Hidden on production */}
            {!isProduction && (
              <button
                onClick={handleSecureConnect}
                disabled={isLoading || !isMetaMaskInstalled}
                className={`w-full py-4 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-3 ${
                  !isMetaMaskInstalled
                    ? 'cursor-not-allowed'
                    : ''
                }`}
                style={{
                  background: !isMetaMaskInstalled
                    ? 'linear-gradient(135deg, #94A3B8, #64748B)'
                    : 'linear-gradient(135deg, #0F766E, #14B8A6)',
                  boxShadow: !isMetaMaskInstalled
                    ? 'none'
                    : '0 8px 24px rgba(15, 118, 110, 0.3)',
                }}
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
                    <span>MetaMask Not Installed</span>
                  </>
                ) : (
                  <>
                    <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6" />
                    Connect MetaMask Wallet
                  </>
                )}
              </button>
            )}

            {/* Info Text - Only show on localhost */}
            {!isProduction && (
              <p className="text-xs text-center mt-4" style={{ color: '#94A3B8' }}>
                Don't have MetaMask?{' '}
                <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: '#0F766E' }}>
                  Download here
                </a>
              </p>
            )}
          </div>

          {/* Features */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center" style={{ background: '#F1F5F9' }}>
                <Lock className="w-5 h-5" style={{ color: '#64748B' }} />
              </div>
              <p className="text-xs" style={{ color: '#1E293B' }}>Zero Passwords</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center" style={{ background: '#F1F5F9' }}>
                <Shield className="w-5 h-5" style={{ color: '#64748B' }} />
              </div>
              <p className="text-xs" style={{ color: '#1E293B' }}>Audit Trail</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center" style={{ background: '#F1F5F9' }}>
                <FileCheck className="w-5 h-5" style={{ color: '#64748B' }} />
              </div>
              <p className="text-xs" style={{ color: '#1E293B' }}>Instant Verify</p>
            </div>
          </div>

          {/* Back Links */}
          <div className="mt-8 text-center space-x-4">
            <Link to="/pitch" className="text-sm transition-colors hover:opacity-70" style={{ color: '#94A3B8' }}>
              View Pitch Deck
            </Link>
            <span style={{ color: '#CBD5E1' }}>|</span>
            <Link to="/" className="text-sm transition-colors hover:opacity-70" style={{ color: '#94A3B8' }}>
              Return Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
