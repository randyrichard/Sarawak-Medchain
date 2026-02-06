import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

export default function VerifyMC() {
  const { hash } = useParams();
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [mcData, setMcData] = useState(null);
  const [error, setError] = useState(null);

  // Debug logging
  console.log('[VerifyMC] Rendering - hash:', hash, 'loading:', loading, 'error:', error);

  useEffect(() => {
    console.log('[VerifyMC] useEffect triggered - hash:', hash);

    // Guard: require hash to proceed
    if (!hash) {
      setError('No MC hash provided');
      setLoading(false);
      return;
    }

    // Simulate blockchain verification
    const verifyOnChain = async () => {
      try {
        setLoading(true);
        setError(null);
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1500));

      // Mock MC data (in production, fetch from blockchain)
      const mockData = {
        mcId: 'MC-2026-0847',
        patientName: 'Ahmad B***',
        patientIC: '901201-**-5678',
        doctor: 'Dr. Sarah Lim',
        doctorMMC: 'MMC-45678',
        hospital: 'Timberland Medical Centre',
        dateIssued: '30 Jan 2026',
        mcDays: 2,
        startDate: '30 Jan 2026',
        endDate: '31 Jan 2026',
        diagnosis: 'Medical Leave - Certified Unfit for Work',
        blockchainHash: hash || '0x7a3f8c2d9e4b1a6f3c8d2e5a9b7f4c1d8e3a6b9c',
        blockNumber: 8234567,
        verifiedAt: new Date().toLocaleString('en-GB', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        networkName: 'Sarawak MedChain Network'
      };

      setMcData(mockData);
      setVerified(true);
      setLoading(false);
      } catch (err) {
        console.error('Verification error:', err);
        setError(err.message || 'Failed to verify MC');
        setLoading(false);
      }
    };

    verifyOnChain();
  }, [hash]);

  // Global mobile-safe styles (defined once, used in all returns)
  const mobileResetStyles = `
    html, body, #root {
      background-color: #FFFFFF !important;
      min-height: 100vh;
      min-height: 100dvh;
      margin: 0;
      padding: 0;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }
    @keyframes pulse-ring {
      0% { transform: scale(1); opacity: 0.8; }
      100% { transform: scale(1.5); opacity: 0; }
    }
  `;

  // Error state
  if (error) {
    return (
      <div style={styles.container}>
        <style>{mobileResetStyles}</style>
        <div style={styles.loadingWrapper}>
          <div style={{...styles.checkmarkCircle, backgroundColor: 'rgba(239, 68, 68, 0.2)', borderColor: '#ef4444'}}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 style={{...styles.loadingTitle, marginTop: '20px'}}>Verification Failed</h2>
          <p style={styles.loadingSubtitle}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{marginTop: '20px', padding: '12px 24px', backgroundColor: '#14b8a6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer'}}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div style={styles.container}>
        <style>{mobileResetStyles}</style>
        <div style={styles.loadingWrapper}>
          {/* Animated spinner */}
          <div style={styles.spinnerOuter}>
            <div style={styles.spinnerInner}></div>
          </div>
          <h2 style={styles.loadingTitle}>Verifying on Blockchain...</h2>
          <p style={styles.loadingSubtitle}>Checking Sarawak MedChain network</p>

          {/* Animated dots */}
          <div style={styles.dotsContainer}>
            <span style={{...styles.dot, animationDelay: '0s'}}>●</span>
            <span style={{...styles.dot, animationDelay: '0.2s'}}>●</span>
            <span style={{...styles.dot, animationDelay: '0.4s'}}>●</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <style>{mobileResetStyles}</style>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logoContainer}>
          <div style={styles.logo}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2">
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h1 style={styles.headerTitle}>Sarawak MedChain</h1>
            <p style={styles.headerSubtitle}>MC Verification Portal</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        {/* Verification Status */}
        <div style={styles.statusCard}>
          {/* Stacked layout: checkmark -> badge -> subtitle */}
          <div style={styles.verificationStack}>
            {/* Large checkmark circle */}
            <div style={styles.checkmarkCircle}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            {/* VERIFIED Badge */}
            <div style={styles.verifiedBadge}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" style={{marginRight: '8px'}}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span style={styles.verifiedText}>VERIFIED</span>
            </div>

            {/* Subtitle */}
            <p style={styles.verifiedSubtext}>This Medical Certificate is authentic</p>
          </div>
        </div>

        {/* MC Details Card */}
        <div style={styles.detailsCard}>
          <h2 style={styles.cardTitle}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" style={{marginRight: '8px'}}>
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            MC Details
          </h2>

          <div style={styles.detailsGrid}>
            <DetailRow label="MC ID" value={mcData.mcId} highlight />
            <DetailRow label="Patient" value={mcData.patientName} />
            <DetailRow label="IC Number" value={mcData.patientIC} />
            <DetailRow label="Doctor" value={mcData.doctor} />
            <DetailRow label="MMC Registration" value={mcData.doctorMMC} />
            <DetailRow label="Hospital" value={mcData.hospital} />
            <DetailRow label="Date Issued" value={mcData.dateIssued} />
            <DetailRow label="MC Duration" value={`${mcData.mcDays} day${mcData.mcDays > 1 ? 's' : ''}`} highlight />
            <DetailRow label="Valid From" value={mcData.startDate} />
            <DetailRow label="Valid Until" value={mcData.endDate} />
          </div>

          {/* Divider */}
          <div style={styles.divider}></div>

          {/* Blockchain Info */}
          <h3 style={styles.sectionTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" style={{marginRight: '6px'}}>
              <path d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            Blockchain Record
          </h3>

          <div style={styles.blockchainInfo}>
            <div style={styles.hashContainer}>
              <span style={styles.hashLabel}>Transaction Hash</span>
              <code style={styles.hashValue}>{mcData.blockchainHash}</code>
            </div>
            <div style={styles.blockInfo}>
              <span style={styles.blockLabel}>Block #</span>
              <span style={styles.blockValue}>{mcData.blockNumber.toLocaleString()}</span>
            </div>
            <div style={styles.timestampInfo}>
              <span style={styles.timestampLabel}>Verified at</span>
              <span style={styles.timestampValue}>{mcData.verifiedAt}</span>
            </div>
          </div>
        </div>

        {/* Trust Indicators */}
        <div style={styles.trustCard}>
          <div style={styles.trustItem}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Tamper-Proof</span>
          </div>
          <div style={styles.trustItem}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Encrypted</span>
          </div>
          <div style={styles.trustItem}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span>Immutable</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <p style={styles.footerText}>Powered by <strong>Sarawak MedChain</strong></p>
        <p style={styles.footerSubtext}>Blockchain-secured medical records for Sarawak</p>
      </footer>
    </div>
  );
}

// Detail Row Component
function DetailRow({ label, value, highlight }) {
  return (
    <div style={styles.detailRow}>
      <span style={styles.detailLabel}>{label}</span>
      <span style={{
        ...styles.detailValue,
        ...(highlight ? styles.detailValueHighlight : {})
      }}>{value}</span>
    </div>
  );
}

// Styles - Mobile-safe values
const styles = {
  container: {
    minHeight: '100vh',
    minHeight: '100dvh', // Dynamic viewport height for mobile
    backgroundColor: '#FFFFFF',
    color: '#1E293B',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    margin: 0,
    padding: 0,
    boxSizing: 'border-box',
    WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
    overflowX: 'hidden',
  },

  // Loading styles
  loadingWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    minHeight: '100dvh',
    padding: '20px',
    width: '100%',
    boxSizing: 'border-box',
  },
  spinnerOuter: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    border: '4px solid rgba(20, 184, 166, 0.2)',
    borderTopColor: '#14b8a6',
    animation: 'spin 1s linear infinite',
    marginBottom: '24px',
  },
  spinnerInner: {
    width: '100%',
    height: '100%',
  },
  loadingTitle: {
    fontSize: '24px',
    fontWeight: '700',
    marginBottom: '8px',
    color: '#1E293B',
  },
  loadingSubtitle: {
    fontSize: '16px',
    color: '#94A3B8',
    marginBottom: '20px',
  },
  dotsContainer: {
    display: 'flex',
    gap: '8px',
  },
  dot: {
    color: '#14b8a6',
    fontSize: '20px',
    animation: 'pulse 1s ease-in-out infinite',
  },

  // Header styles
  header: {
    padding: '16px 20px',
    backgroundColor: '#1e293b',
    width: '100%',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    maxWidth: '500px',
    margin: '0 auto',
  },
  logo: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#14b8a6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '18px',
    fontWeight: '600',
    margin: 0,
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: '13px',
    color: '#94a3b8',
    margin: 0,
  },

  // Main content styles
  main: {
    padding: '20px',
    maxWidth: '500px',
    width: '100%',
    margin: '0 auto',
  },

  // Status card
  statusCard: {
    textAlign: 'center',
    padding: '32px 20px',
    marginBottom: '20px',
  },
  verificationStack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  checkmarkCircle: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: '#ccfbf1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '4px solid #14b8a6',
  },
  verifiedBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 24px',
    borderRadius: '50px',
    backgroundColor: '#0d9488',
  },
  verifiedText: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: '1px',
  },
  verifiedSubtext: {
    fontSize: '15px',
    color: '#64748B',
    margin: 0,
  },

  // Details card
  detailsCard: {
    background: '#FFFFFF',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '20px',
    border: '1px solid #E2E8F0',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    color: '#1E293B',
  },
  detailsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #F1F5F9',
  },
  detailLabel: {
    fontSize: '14px',
    color: '#94A3B8',
  },
  detailValue: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1E293B',
    textAlign: 'right',
  },
  detailValueHighlight: {
    color: '#14b8a6',
    fontWeight: '700',
    fontSize: '16px',
  },
  divider: {
    height: '1px',
    background: '#E2E8F0',
    margin: '20px 0',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#64748B',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  blockchainInfo: {
    background: 'rgba(20, 184, 166, 0.1)',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid rgba(20, 184, 166, 0.2)',
  },
  hashContainer: {
    marginBottom: '12px',
  },
  hashLabel: {
    display: 'block',
    fontSize: '12px',
    color: '#94A3B8',
    marginBottom: '4px',
  },
  hashValue: {
    fontSize: '11px',
    color: '#14b8a6',
    wordBreak: 'break-all',
    fontFamily: 'monospace',
    background: '#F1F5F9',
    padding: '8px',
    borderRadius: '6px',
    display: 'block',
  },
  blockInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  blockLabel: {
    fontSize: '12px',
    color: '#94A3B8',
  },
  blockValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1E293B',
  },
  timestampInfo: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  timestampLabel: {
    fontSize: '12px',
    color: '#94A3B8',
  },
  timestampValue: {
    fontSize: '14px',
    color: '#64748B',
  },

  // Trust indicators
  trustCard: {
    display: 'flex',
    justifyContent: 'space-around',
    padding: '20px',
    background: 'rgba(16, 185, 129, 0.1)',
    borderRadius: '12px',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    marginBottom: '20px',
  },
  trustItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: '#10b981',
    fontWeight: '600',
  },

  // Footer
  footer: {
    textAlign: 'center',
    padding: '24px 20px',
    borderTop: '1px solid #E2E8F0',
    width: '100%',
    maxWidth: '500px',
  },
  footerText: {
    fontSize: '14px',
    color: '#94A3B8',
    marginBottom: '4px',
  },
  footerSubtext: {
    fontSize: '12px',
    color: '#94A3B8',
  },
};
