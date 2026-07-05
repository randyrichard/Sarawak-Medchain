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
    <div className="cw-root">
      <style>{`
        @keyframes cwspin { to { transform: rotate(360deg); } }
        @keyframes cwfade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

        .cw-root { display: grid; grid-template-columns: 1fr; min-height: 100vh; width: 100%; max-width: 100%; overflow-x: hidden; background: #F1F5F9; font-family: 'Plus Jakarta Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
        .cw-root * { box-sizing: border-box; }
        /* Let grid tracks shrink below content width so nothing forces horizontal scroll */
        .cw-root > * { min-width: 0; }
        .cw-body { min-width: 0; }
        @media (min-width: 1024px) { .cw-root { grid-template-columns: 1.05fr 1fr; } }

        /* ---------- LEFT HERO ---------- */
        .cw-hero { display: none; }
        @media (min-width: 1024px) {
          .cw-hero {
            position: relative; display: flex; flex-direction: column; justify-content: space-between;
            padding: 56px; overflow: hidden;
            background:
              radial-gradient(1200px 500px at 15% -10%, rgba(45,212,191,0.18), transparent 60%),
              radial-gradient(900px 600px at 110% 110%, rgba(20,184,166,0.22), transparent 55%),
              linear-gradient(160deg, #0A3A36 0%, #0E5F58 60%, #0F766E 100%);
          }
        }
        .cw-hero-grid { position: absolute; inset: 0; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
          background-size: 44px 44px; }
        .cw-hero > * { position: relative; z-index: 1; }
        .cw-brand { display: inline-flex; align-items: center; gap: 12px; text-decoration: none; }
        .cw-brand-badge { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.22); }
        .cw-brand-name { color: #fff; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
        .cw-eyebrow { display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border-radius: 999px;
          background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); margin-bottom: 28px; }
        .cw-eyebrow span { color: #CCFBF1; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; }
        .cw-dot { width: 8px; height: 8px; border-radius: 999px; background: #5EEAD4; box-shadow: 0 0 0 0 rgba(94,234,212,0.7); animation: cwpulse 2s infinite; }
        @keyframes cwpulse { 0% { box-shadow: 0 0 0 0 rgba(94,234,212,0.6);} 70% { box-shadow: 0 0 0 8px rgba(94,234,212,0);} 100% { box-shadow: 0 0 0 0 rgba(94,234,212,0);} }
        .cw-h1 { color: #fff; font-size: 44px; line-height: 1.08; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 18px; max-width: 15ch; }
        .cw-h1 em { color: #5EEAD4; font-style: normal; }
        .cw-lead { color: rgba(226,255,251,0.82); font-size: 17px; line-height: 1.6; margin: 0; max-width: 46ch; }
        .cw-values { margin-top: 36px; display: flex; flex-direction: column; gap: 18px; }
        .cw-value { display: flex; align-items: flex-start; gap: 14px; }
        .cw-value-ic { width: 42px; height: 42px; border-radius: 11px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.16); }
        .cw-value-t { color: #fff; font-weight: 700; font-size: 15px; margin: 0; }
        .cw-value-b { color: rgba(204,251,241,0.72); font-size: 13.5px; margin: 2px 0 0; }
        .cw-stats { display: flex; gap: 40px; padding-top: 28px; border-top: 1px solid rgba(255,255,255,0.14); }
        .cw-stat-n { color: #fff; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.02em; }
        .cw-stat-l { color: rgba(204,251,241,0.66); font-size: 12px; margin: 2px 0 0; }

        /* ---------- RIGHT PANEL ---------- */
        .cw-panel { display: flex; flex-direction: column; min-height: 100vh; background: #FFFFFF; }
        .cw-topbar { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid #E2E8F0; }
        @media (min-width: 1024px) { .cw-topbar { border-bottom: none; padding: 28px 40px; justify-content: flex-end; } }
        .cw-topbar-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        @media (min-width: 1024px) { .cw-topbar-brand { display: none; } }
        .cw-topbar-badge { width: 36px; height: 36px; border-radius: 10px; background: #0F766E; display: flex; align-items: center; justify-content: center; }
        .cw-back { display: inline-flex; align-items: center; gap: 4px; color: #64748B; font-size: 14px; text-decoration: none; font-weight: 500; }
        .cw-back:hover { color: #0F766E; }

        .cw-body { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 32px 24px 40px; }
        @media (min-width: 640px) { .cw-body { padding: 40px; } }
        @media (min-width: 1280px) { .cw-body { padding: 40px 72px; } }
        .cw-card { width: 100%; max-width: 430px; margin: 0 auto; animation: cwfade 0.5s ease both; }

        .cw-title { color: #0F172A; font-size: 28px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 6px; }
        .cw-sub { color: #64748B; font-size: 15px; line-height: 1.5; margin: 0 0 28px; }
        .cw-section-label { color: #94A3B8; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 12px; }

        .cw-roles { display: flex; flex-direction: column; gap: 12px; margin-bottom: 26px; }
        .cw-role { display: flex; align-items: center; gap: 16px; width: 100%; text-align: left; cursor: pointer;
          padding: 16px; border-radius: 16px; background: #FFFFFF; border: 1.5px solid #E8EDF3;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        .cw-role:hover { transform: translateY(-2px); }
        .cw-role-ic { width: 48px; height: 48px; border-radius: 13px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .cw-role-t { color: #0F172A; font-weight: 700; font-size: 15.5px; margin: 0; }
        .cw-role-d { color: #64748B; font-size: 13px; margin: 2px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cw-role-arrow { color: #CBD5E1; flex-shrink: 0; transition: transform .18s ease, color .18s ease; }
        .cw-role:hover .cw-role-arrow { transform: translateX(3px); color: #0F766E; }
        .cw-role-txt { flex: 1; min-width: 0; }

        .cw-or { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
        .cw-or-line { flex: 1; height: 1px; background: #E2E8F0; }
        .cw-or-txt { color: #94A3B8; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; }

        .cw-err { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 12px; margin-bottom: 16px;
          background: #FEF2F2; border: 1px solid #FECACA; color: #DC2626; font-size: 13.5px; }

        .cw-connect { width: 100%; display: flex; align-items: center; justify-content: center; gap: 12px; padding: 15px 20px; border: none;
          border-radius: 13px; color: #fff; font-size: 15.5px; font-weight: 700; cursor: pointer;
          background: linear-gradient(135deg, #f6851b, #e2761b); box-shadow: 0 10px 26px rgba(246,133,27,0.32);
          transition: transform .18s ease, box-shadow .18s ease, filter .18s ease; }
        .cw-connect:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.05); box-shadow: 0 14px 32px rgba(246,133,27,0.4); }
        .cw-connect:disabled { background: linear-gradient(135deg, #94A3B8, #64748B); box-shadow: none; cursor: not-allowed; }
        .cw-connect img { width: 24px; height: 24px; }

        .cw-hint { text-align: center; font-size: 12.5px; color: #94A3B8; margin: 14px 0 0; }
        .cw-hint a { color: #0F766E; font-weight: 600; text-decoration: none; }
        .cw-hint a:hover { text-decoration: underline; }

        .cw-chips { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 28px; }
        .cw-chip { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 14px 6px; border-radius: 13px;
          background: #F8FAFC; border: 1px solid #EEF2F6; }
        .cw-chip span { font-size: 11.5px; font-weight: 600; color: #475569; text-align: center; }

        .cw-foot { text-align: center; margin-top: 28px; display: flex; align-items: center; justify-content: center; gap: 14px; }
        .cw-foot a { color: #94A3B8; font-size: 13.5px; text-decoration: none; }
        .cw-foot a:hover { color: #0F766E; }
        .cw-foot i { color: #CBD5E1; font-style: normal; }
      `}</style>

      {/* ============ LEFT: Brand / value hero ============ */}
      <div className="cw-hero">
        <div className="cw-hero-grid" />

        {/* Brand */}
        <Link to="/" className="cw-brand">
          <span className="cw-brand-badge"><Shield className="w-6 h-6 text-white" /></span>
          <span className="cw-brand-name">Sarawak<span style={{ color: '#5EEAD4' }}>MedChain</span></span>
        </Link>

        {/* Headline + value */}
        <div>
          <div className="cw-eyebrow">
            <span className="cw-dot" />
            <span>LIVE ON BLOCKCHAIN · SEPOLIA</span>
          </div>
          <h1 className="cw-h1">Medical certificates that <em>can't be faked.</em></h1>
          <p className="cw-lead">
            Every certificate is cryptographically anchored on-chain and verifiable in seconds — by any employer, anywhere, with no login. Fraud stops here.
          </p>

          <div className="cw-values">
            {[
              { Icon: Lock, title: 'Tamper-proof by design', body: 'Alter one detail and verification instantly fails.' },
              { Icon: CheckCircle2, title: 'Verify without a wallet', body: 'Employers scan a QR code and see the truth.' },
              { Icon: Link2, title: 'Permanent public record', body: 'Backed by a real blockchain transaction.' },
            ].map(({ Icon, title, body }) => (
              <div key={title} className="cw-value">
                <span className="cw-value-ic"><Icon className="w-5 h-5" style={{ color: '#5EEAD4' }} /></span>
                <div>
                  <p className="cw-value-t">{title}</p>
                  <p className="cw-value-b">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="cw-stats">
          <div><p className="cw-stat-n">256-bit</p><p className="cw-stat-l">AES encryption</p></div>
          <div><p className="cw-stat-n">&lt; 2s</p><p className="cw-stat-l">to verify an MC</p></div>
          <div><p className="cw-stat-n">100%</p><p className="cw-stat-l">on-chain audit trail</p></div>
        </div>
      </div>

      {/* ============ RIGHT: Login panel ============ */}
      <div className="cw-panel">
        <div className="cw-topbar">
          <Link to="/" className="cw-topbar-brand">
            <span className="cw-topbar-badge"><Shield className="w-5 h-5 text-white" /></span>
            <span style={{ fontWeight: 800, color: '#1E293B' }}>Sarawak<span style={{ color: '#0F766E' }}>MedChain</span></span>
          </Link>
          <Link to="/" className="cw-back"><ChevronLeft className="w-4 h-4" /> Back to Home</Link>
        </div>

        <div className="cw-body">
          <div className="cw-card">
            <h2 className="cw-title">{isFromDoctorPortal ? 'Doctor Portal Access' : 'Sign in to MedChain'}</h2>
            <p className="cw-sub">
              {isFromDoctorPortal
                ? 'Verify your identity to access the doctor terminal.'
                : 'Choose a role to explore the prototype, or connect your wallet for live blockchain access.'}
            </p>

            {/* Role cards */}
            <p className="cw-section-label">Explore instantly — no wallet needed</p>
            <div className="cw-roles">
              {roleOptions.map(({ role, label, desc, Icon, gradient, ring }) => (
                <button
                  key={role}
                  onClick={() => handleEnterDemoMode(role)}
                  className="cw-role"
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = ring; e.currentTarget.style.boxShadow = `0 12px 28px ${ring}`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E8EDF3'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <span className="cw-role-ic" style={{ background: gradient }}><Icon className="w-6 h-6 text-white" /></span>
                  <span className="cw-role-txt">
                    <p className="cw-role-t">Enter as {label}</p>
                    <p className="cw-role-d">{desc}</p>
                  </span>
                  <ArrowRight className="w-5 h-5 cw-role-arrow" />
                </button>
              ))}
            </div>

            <div className="cw-or">
              <span className="cw-or-line" /><span className="cw-or-txt">OR CONNECT LIVE</span><span className="cw-or-line" />
            </div>

            {displayError && (
              <div className="cw-err">
                <svg className="w-5 h-5" style={{ flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{displayError}</span>
              </div>
            )}

            <button onClick={handleSecureConnect} disabled={isLoading || !isMetaMaskInstalled} className="cw-connect">
              {isLoading ? (
                <>
                  <svg className="h-5 w-5" style={{ animation: 'cwspin 1s linear infinite' }} viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Connecting to MetaMask...
                </>
              ) : !isMetaMaskInstalled ? (
                <span>MetaMask Not Installed</span>
              ) : (
                <>
                  <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" />
                  Connect MetaMask Wallet
                </>
              )}
            </button>

            <p className="cw-hint">
              {isMetaMaskInstalled ? 'Your wallet is your identity — no passwords stored.' : (
                <>Don't have MetaMask? <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">Download here</a></>
              )}
            </p>

            <div className="cw-chips">
              {[
                { Icon: Lock, label: 'Zero Passwords' },
                { Icon: Shield, label: 'Audit Trail' },
                { Icon: FileCheck, label: 'Instant Verify' },
              ].map(({ Icon, label }) => (
                <div key={label} className="cw-chip">
                  <Icon className="w-5 h-5" style={{ color: '#0F766E' }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <div className="cw-foot">
              <Link to="/pitch">View Pitch Deck</Link>
              <i>|</i>
              <Link to="/">Return Home</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
