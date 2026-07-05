/**
 * Connect Wallet Page
 * Gate page for accessing the MedChain application
 * Only shown when user tries to access protected routes without a wallet
 * WEALTH 2026 DEMO: Includes biometric-style Security Verified animation
 */

import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Shield, Lock, FileCheck, ChevronLeft, Play, Stethoscope, User, Settings, ArrowRight, CheckCircle2, Link2 } from 'lucide-react';
import { useDemo } from '../context/DemoContext';
import { canAccess, ROLE_HOME } from '../utils/roles';

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

// Helper to get initial pending admin data.
// Only treat it as a real pending application if it actually has the core
// fields — otherwise stale/empty data would hijack the connect screen with a
// broken "Welcome, / Invalid Date" card and hide the demo buttons.
function getInitialPendingAdmin() {
  try {
    const storedData = localStorage.getItem('medchain_pending_admin');
    if (!storedData) return null;
    const parsed = JSON.parse(storedData);
    const hasName = parsed && typeof parsed.facilityName === 'string' && parsed.facilityName.trim().length > 0;
    if (!hasName) {
      // Corrupt / incomplete onboarding state — clear it and fall through to normal login
      localStorage.removeItem('medchain_pending_admin');
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem('medchain_pending_admin');
    return null;
  }
}

export default function ConnectWallet({ onConnect, loading, error }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { enterDemoMode } = useDemo();
  const [pendingAdmin, setPendingAdmin] = useState(getInitialPendingAdmin);
  const autoConnectTriggeredRef = useRef(false);
  const [showSecurityAnimation, setShowSecurityAnimation] = useState(false);
  const [localError, setLocalError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Check if MetaMask is installed
  const isMetaMaskInstalled = typeof window !== 'undefined' && Boolean(window.ethereum);

  // Demo mode bypass — enter demo and go to that role's own portal
  const handleEnterDemoMode = (role = 'doctor') => {
    enterDemoMode(role);
    const from = location.state?.from;
    navigate(from && canAccess(role, from) ? from : (ROLE_HOME[role] || '/doctor'), { replace: true });
  };

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

  // Main Connect Wallet UI — full-bleed split-screen layout
  const roleOptions = [
    {
      role: 'doctor',
      label: 'Doctor',
      desc: 'Issue & anchor medical certificates on-chain',
      Icon: Stethoscope,
      gradient: 'linear-gradient(135deg, #0F766E, #14B8A6)',
      ring: 'rgba(15, 118, 110, 0.35)',
    },
    {
      role: 'patient',
      label: 'Patient',
      desc: 'View your records & control who can access them',
      Icon: User,
      gradient: 'linear-gradient(135deg, #2563EB, #3B82F6)',
      ring: 'rgba(37, 99, 235, 0.35)',
    },
    {
      role: 'admin',
      label: 'Admin',
      desc: 'Verify doctors & oversee the network (+ CEO view)',
      Icon: Settings,
      gradient: 'linear-gradient(135deg, #7C3AED, #8B5CF6)',
      ring: 'rgba(124, 58, 237, 0.35)',
    },
  ];

  return (
    <div className="cw-split" style={{ background: '#FFFFFF' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        /* Own class so the global ".min-h-screen { display:flex }" rule can't hijack the grid */
        .cw-split { display: grid; grid-template-columns: 1fr; min-height: 100vh; width: 100%; }
        @media (min-width: 1024px) { .cw-split { grid-template-columns: 1fr 1fr; } }
        /* Prevent grid tracks from being forced wider than the viewport by max-w-md content */
        .cw-split > * { min-width: 0; }
        .role-card { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        .role-card:hover { transform: translateY(-3px); }
        .cw-primary-btn { transition: transform .18s ease, box-shadow .18s ease, filter .18s ease; }
        .cw-primary-btn:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.05); }
      `}</style>

      {/* ============ LEFT: Brand / value hero ============ */}
      <div
        className="relative hidden lg:flex flex-col justify-between p-12 xl:p-16 overflow-hidden"
        style={{ background: 'linear-gradient(150deg, #0B3B37 0%, #0F766E 55%, #115E59 100%)' }}
      >
        {/* Decorative glows */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full" style={{ background: 'radial-gradient(circle, rgba(20,184,166,0.35), transparent 65%)' }} />
        <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full" style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.22), transparent 65%)' }} />

        {/* Brand */}
        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}>
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div className="text-white text-xl font-bold tracking-tight">
              Sarawak<span style={{ color: '#5EEAD4' }}>MedChain</span>
            </div>
          </Link>
        </div>

        {/* Headline + value */}
        <div className="relative z-10 max-w-lg">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: '#5EEAD4' }} />
            <span className="text-xs font-semibold tracking-wide" style={{ color: '#CCFBF1' }}>LIVE ON BLOCKCHAIN · SEPOLIA</span>
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-5">
            Medical certificates that <span style={{ color: '#5EEAD4' }}>can't be faked.</span>
          </h1>
          <p className="text-lg leading-relaxed" style={{ color: 'rgba(226,255,251,0.85)' }}>
            Every MC is cryptographically anchored on-chain and verifiable in seconds — by any employer, anywhere, with no login. Fraud stops here.
          </p>

          {/* Value bullets */}
          <div className="mt-10 space-y-4">
            {[
              { Icon: Lock, title: 'Tamper-proof by design', body: 'Alter one detail and verification instantly fails.' },
              { Icon: CheckCircle2, title: 'Verify without a wallet', body: 'Employers scan a QR code and see the truth.' },
              { Icon: Link2, title: 'Permanent public record', body: 'Backed by a real blockchain transaction.' },
            ].map(({ Icon, title, body }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.16)' }}>
                  <Icon className="w-5 h-5" style={{ color: '#5EEAD4' }} />
                </div>
                <div>
                  <p className="text-white font-semibold">{title}</p>
                  <p className="text-sm" style={{ color: 'rgba(204,251,241,0.75)' }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer trust row */}
        <div className="relative z-10 flex items-center gap-8 pt-8" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          <div>
            <p className="text-2xl font-bold text-white">256-bit</p>
            <p className="text-xs" style={{ color: 'rgba(204,251,241,0.7)' }}>AES encryption</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">&lt; 2s</p>
            <p className="text-xs" style={{ color: 'rgba(204,251,241,0.7)' }}>to verify an MC</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">100%</p>
            <p className="text-xs" style={{ color: 'rgba(204,251,241,0.7)' }}>on-chain audit trail</p>
          </div>
        </div>
      </div>

      {/* ============ RIGHT: Login panel ============ */}
      {/* Inline minHeight instead of the min-h-screen class, which a global rule
          overrides with align-items:center and breaks the column width. */}
      <div className="flex flex-col" style={{ minHeight: '100vh' }}>
        {/* Mobile top bar (brand + back) — hidden on desktop */}
        <div className="lg:hidden flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#0F766E' }}>
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold" style={{ color: '#1E293B' }}>Sarawak<span style={{ color: '#0F766E' }}>MedChain</span></span>
          </Link>
          <Link to="/" className="flex items-center gap-1 text-sm" style={{ color: '#64748B' }}>
            <ChevronLeft className="w-4 h-4" /> Home
          </Link>
        </div>

        {/* Desktop back link */}
        <div className="hidden lg:flex justify-end px-10 pt-8">
          <Link to="/" className="flex items-center gap-1 text-sm transition-colors hover:opacity-70" style={{ color: '#64748B' }}>
            <ChevronLeft className="w-4 h-4" /> Back to Home
          </Link>
        </div>

        {/* Centered content */}
        <div className="flex-1 flex flex-col justify-center px-6 sm:px-10 xl:px-20 py-10">
          <div className="w-full max-w-md mx-auto">
            {/* Heading */}
            <h2 className="text-3xl font-bold mb-2" style={{ color: '#0F172A' }}>
              {isFromDoctorPortal ? 'Doctor Portal Access' : 'Sign in to MedChain'}
            </h2>
            <p className="mb-8" style={{ color: '#64748B' }}>
              {isFromDoctorPortal
                ? 'Verify your identity to access the doctor terminal.'
                : 'Choose a role to explore, or connect your wallet for live blockchain access.'}
            </p>

            {/* Role cards (demo mode) */}
            <div className="space-y-3 mb-7">
              <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>
                Explore instantly — no wallet needed
              </p>
              {roleOptions.map(({ role, label, desc, Icon, gradient, ring }) => (
                <button
                  key={role}
                  onClick={() => handleEnterDemoMode(role)}
                  className="role-card w-full flex items-center gap-4 p-4 rounded-2xl text-left"
                  style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = ring; e.currentTarget.style.boxShadow = `0 10px 28px ${ring}`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: gradient }}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold" style={{ color: '#0F172A' }}>Enter as {label}</p>
                    <p className="text-sm truncate" style={{ color: '#64748B' }}>{desc}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 flex-shrink-0" style={{ color: '#CBD5E1' }} />
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px" style={{ background: '#E2E8F0' }} />
              <span className="text-xs font-semibold" style={{ color: '#94A3B8' }}>OR CONNECT LIVE</span>
              <div className="flex-1 h-px" style={{ background: '#E2E8F0' }} />
            </div>

            {/* Error Message */}
            {displayError && (
              <div className="p-4 rounded-xl mb-4 text-sm flex items-start gap-3" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{displayError}</span>
              </div>
            )}

            {/* MetaMask connect */}
            <button
              onClick={handleSecureConnect}
              disabled={isLoading || !isMetaMaskInstalled}
              className="cw-primary-btn w-full py-4 text-white font-bold rounded-xl disabled:opacity-60 flex items-center justify-center gap-3"
              style={{
                background: !isMetaMaskInstalled
                  ? 'linear-gradient(135deg, #94A3B8, #64748B)'
                  : 'linear-gradient(135deg, #f6851b, #e2761b)',
                boxShadow: !isMetaMaskInstalled ? 'none' : '0 8px 24px rgba(246, 133, 27, 0.35)',
                cursor: (isLoading || !isMetaMaskInstalled) ? 'not-allowed' : 'pointer',
              }}
            >
              {isLoading ? (
                <>
                  <svg className="h-5 w-5" style={{ animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connecting to MetaMask...
                </>
              ) : !isMetaMaskInstalled ? (
                <span>MetaMask Not Installed</span>
              ) : (
                <>
                  <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6" />
                  Connect MetaMask Wallet
                </>
              )}
            </button>

            <p className="text-xs text-center mt-3" style={{ color: '#94A3B8' }}>
              {isMetaMaskInstalled ? 'Your wallet is your identity — no passwords stored.' : (
                <>Don't have MetaMask?{' '}
                  <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: '#0F766E' }}>Download here</a>
                </>
              )}
            </p>

            {/* Trust chips */}
            <div className="grid grid-cols-3 gap-3 mt-8">
              {[
                { Icon: Lock, label: 'Zero Passwords' },
                { Icon: Shield, label: 'Audit Trail' },
                { Icon: FileCheck, label: 'Instant Verify' },
              ].map(({ Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-2 py-3 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                  <Icon className="w-5 h-5" style={{ color: '#0F766E' }} />
                  <p className="text-xs font-medium" style={{ color: '#475569' }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Footer links */}
            <div className="mt-8 text-center space-x-4">
              <Link to="/pitch" className="text-sm transition-colors hover:opacity-70" style={{ color: '#94A3B8' }}>View Pitch Deck</Link>
              <span style={{ color: '#CBD5E1' }}>|</span>
              <Link to="/" className="text-sm transition-colors hover:opacity-70" style={{ color: '#94A3B8' }}>Return Home</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
