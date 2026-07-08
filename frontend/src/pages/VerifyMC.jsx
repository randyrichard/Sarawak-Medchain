import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { fetchMCByHash } from '../lib/data/mcStore';
import { computeMCHash, verifyMCOnChain, getMCIssuanceTx, getExplorerTxUrl } from '../lib/blockchain/mc';

export default function VerifyMC() {
  const { hash } = useParams();
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [mcData, setMcData] = useState(null);
  const [error, setError] = useState(null);

  // Mask patient name: "randy" -> "Randy ***", "Randy Richard" -> "Randy ***"
  const maskName = (name) => {
    if (!name) return '***';
    const parts = name.trim().split(/\s+/);
    const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    return firstName + ' ***';
  };

  // Mask IC number: "1212121212" -> "121212-**-1212"
  const maskIC = (ic) => {
    if (!ic) return '******-**-****';
    const digits = ic.replace(/\D/g, '');
    if (digits.length >= 10) {
      return digits.slice(0, 6) + '-**-' + digits.slice(-4);
    }
    return ic;
  };

  useEffect(() => {
    if (!hash) {
      setError('No MC hash provided');
      setLoading(false);
      return;
    }

    const verifyOnChain = async () => {
      try {
        setLoading(true);
        setError(null);

        // STEP 1: Fetch the MC details through the data layer (locked-down
        // verify_mc RPC, with fallbacks). Diagnosis is never returned.
        const data = await fetchMCByHash(hash);

        if (!data) {
          setError('MC record not found. This QR code may be invalid or expired.');
          setLoading(false);
          return;
        }

        // STEP 2: Integrity check — recompute the canonical hash from the
        // stored data and compare with the hash in the QR code. If anyone
        // altered the record (name, dates, duration...), this fails.
        const recomputedHash = computeMCHash({
          mcId: data.mcId,
          patientIC: data.patientIC,
          patientName: data.patientName,
          duration: data.duration,
          doctorName: data.doctorName,
          mmcNumber: data.mmcNumber,
          hospital: data.hospital,
          dateIssued: data.dateIssued,
          startDate: data.startDate,
          endDate: data.endDate,
        });
        const integrityOk = recomputedHash.toLowerCase() === hash.toLowerCase();

        // STEP 3: Blockchain check — does this exact hash exist on-chain,
        // and was it issued by a verified doctor? (Read-only, no wallet.)
        let chain = null;
        let chainTx = null;
        let chainUnavailable = false;
        try {
          chain = await verifyMCOnChain(hash);
          if (chain.exists) {
            chainTx = await getMCIssuanceTx(hash);
          }
        } catch (chainErr) {
          console.warn('Blockchain check unavailable:', chainErr.message);
          chainUnavailable = true;
        }

        // STEP 4: Decide the verification level
        let level; // 'chain' | 'database' | 'tampered' | 'chain-unavailable'
        if (chain?.exists && integrityOk) {
          level = 'chain';
        } else if (chain?.exists && !integrityOk) {
          level = 'tampered';
        } else if (chainUnavailable) {
          level = 'chain-unavailable';
        } else {
          level = 'database';
        }

        if (level === 'tampered') {
          setError('SECURITY ALERT: This certificate exists on the blockchain, but the record details do NOT match the original. The data may have been tampered with. Do not accept this MC.');
          setLoading(false);
          return;
        }

        setMcData({
          mcId: data.mcId,
          patientName: maskName(data.patientName),
          patientIC: maskIC(data.patientIC),
          doctor: data.doctorName,
          doctorMMC: data.mmcNumber,
          hospital: data.hospital,
          dateIssued: data.dateIssued,
          mcDays: data.duration,
          startDate: data.startDate,
          endDate: data.endDate,
          diagnosis: data.diagnosis,
          blockchainHash: hash,
          blockNumber: chainTx?.blockNumber ?? data.blockNumber ?? 0,
          txHash: chainTx?.txHash || null,
          explorerUrl: chainTx?.txHash ? getExplorerTxUrl(chainTx.txHash) : null,
          issuingDoctorAddress: chain?.exists ? chain.doctor : null,
          issuingDoctorVerified: chain?.exists ? chain.doctorVerified : null,
          chainTimestamp: chain?.exists ? chain.timestamp : null,
          integrityOk,
          verificationLevel: level,
          verifiedAt: new Date().toLocaleString('en-GB', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          networkName: 'Sarawak MedChain Network'
        });
        setVerified(true);
        setLoading(false);
      } catch (err) {
        console.error('Verification error:', err);
        setError('Failed to verify MC. The stored data may be corrupted.');
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

        {/* Brand header — keep visible so users know they're on the real site */}
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

        <main style={styles.main}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #FECACA',
            borderRadius: '16px',
            padding: '40px 28px',
            textAlign: 'center',
            boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
          }}>
            {/* Error icon */}
            <div style={{
              width: '64px',
              height: '64px',
              margin: '0 auto 24px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '2px solid rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
            </div>

            <p style={{
              fontSize: '10px',
              fontWeight: 700,
              color: '#DC2626',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              margin: '0 0 8px 0',
            }}>
              Verification Failed
            </p>
            <h2 style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#0F172A',
              margin: '0 0 12px 0',
              letterSpacing: '-0.01em',
            }}>
              This certificate could not be verified
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#64748B',
              lineHeight: 1.6,
              margin: '0 0 24px 0',
            }}>
              {error}
            </p>

            {/* What this means + what to do */}
            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '16px 20px',
              textAlign: 'left',
              marginBottom: '28px',
            }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', margin: '0 0 8px 0', letterSpacing: '0.04em' }}>
                What this could mean
              </p>
              <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: '13px', color: '#475569', lineHeight: 1.7 }}>
                <li>The QR code link is broken or expired</li>
                <li>The certificate was never issued through MedChain</li>
                <li>The certificate may have been revoked</li>
                <li>Network connection issue — try again in a moment</li>
              </ul>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '12px 22px',
                  background: '#0F2A5C',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 1px 3px rgba(15, 42, 92, 0.2)',
                }}
              >
                Try Again
              </button>
              <a
                href="/"
                style={{
                  padding: '12px 22px',
                  background: '#FFFFFF',
                  color: '#0F2A5C',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                Back to Home
              </a>
            </div>

            <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '20px' }}>
              If you scanned this from a printed certificate, please contact the issuing facility.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Loading state — skeleton MC card so users see what's coming
  if (loading) {
    return (
      <div style={styles.container}>
        <style>{mobileResetStyles}</style>
        <style>{`
          @keyframes verifyPulse {
            0%, 100% { opacity: 0.55; }
            50% { opacity: 0.85; }
          }
          @keyframes verifyShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          .verify-skeleton-bar {
            background: linear-gradient(90deg, #E2E8F0 0%, #F1F5F9 50%, #E2E8F0 100%);
            background-size: 200% 100%;
            animation: verifyShimmer 1.6s ease-in-out infinite;
            border-radius: 6px;
          }
        `}</style>

        {/* Brand header same as success state */}
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

        <main style={styles.main}>
          {/* Verification-in-progress card */}
          <div style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '40px 24px',
            marginBottom: '20px',
            textAlign: 'center',
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              border: '3px solid #E2E8F0',
              borderTopColor: '#0F2A5C',
              animation: 'spin 0.9s linear infinite',
              margin: '0 auto 20px',
            }} />
            <p style={{
              fontSize: '10px',
              fontWeight: 700,
              color: '#0F766E',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              margin: '0 0 8px 0',
            }}>
              Verifying on blockchain
            </p>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', margin: '0 0 6px 0' }}>
              Checking Sarawak MedChain network
            </h2>
            <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
              This usually takes under 2 seconds.
            </p>
          </div>

          {/* Skeleton MC details card — shows users what to expect */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '24px',
            animation: 'verifyPulse 1.8s ease-in-out infinite',
          }}>
            <div className="verify-skeleton-bar" style={{ width: '40%', height: '14px', marginBottom: '20px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[80, 65, 75, 55, 70, 60].map((w, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <div className="verify-skeleton-bar" style={{ width: '30%', height: '12px' }} />
                  <div className="verify-skeleton-bar" style={{ width: `${w}px`, maxWidth: '60%', height: '12px' }} />
                </div>
              ))}
            </div>
            <div style={{ height: '1px', background: '#F1F5F9', margin: '20px 0' }} />
            <div className="verify-skeleton-bar" style={{ width: '50%', height: '11px', marginBottom: '12px' }} />
            <div className="verify-skeleton-bar" style={{ width: '100%', height: '36px' }} />
          </div>
        </main>
      </div>
    );
  }

  const isChainVerified = mcData.verificationLevel === 'chain';
  const statusColor = isChainVerified ? '#0d9488' : '#d97706';
  const statusBg = isChainVerified ? '#ccfbf1' : '#fef3c7';
  const statusLabel = isChainVerified
    ? 'VERIFIED'
    : mcData.verificationLevel === 'chain-unavailable' ? 'RECORD FOUND' : 'DEMO RECORD';
  const statusSubtext = isChainVerified
    ? 'This Medical Certificate is authentic — anchored on the blockchain'
    : mcData.verificationLevel === 'chain-unavailable'
      ? 'Record found, but the blockchain network is temporarily unreachable. Try again to complete verification.'
      : 'This record exists in the registry database but is not anchored on the blockchain (demo certificate).';

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
            {/* Large status circle */}
            <div style={{ ...styles.checkmarkCircle, backgroundColor: statusBg, border: `4px solid ${statusColor}` }}>
              {isChainVerified ? (
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
                </svg>
              )}
            </div>

            {/* Status Badge */}
            <div style={{ ...styles.verifiedBadge, backgroundColor: statusColor }}>
              {isChainVerified && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" style={{marginRight: '8px'}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              <span style={styles.verifiedText}>{statusLabel}</span>
            </div>

            {/* Subtitle */}
            <p style={styles.verifiedSubtext}>{statusSubtext}</p>
          </div>
        </div>

        {/* Compare callout — defeats the "swap a genuine QR onto a forged
            document" attack by forcing the verifier to actively compare. */}
        {isChainVerified && (
          <div style={{
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
            borderRadius: '14px',
            padding: '16px 18px',
            marginBottom: '20px',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#B45309', margin: '0 0 4px' }}>
                This proves the record is real — now check it belongs here
              </p>
              <p style={{ fontSize: '13px', color: '#78350F', lineHeight: 1.6, margin: 0 }}>
                Confirm the <b>name, IC, dates and number of days</b> below match <b>both the certificate presented and the person in front of you</b>. A real QR copied onto a fake or altered MC still shows these true details — which won't match.
              </p>
            </div>
          </div>
        )}

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
            <DetailRow label="Patient" value={mcData.patientName} highlight />
            <DetailRow label="IC Number" value={mcData.patientIC} highlight />
            <DetailRow label="Medical Reason" value="Kept confidential" />
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
              <span style={styles.hashLabel}>MC Fingerprint (keccak256)</span>
              <code style={styles.hashValue}>{mcData.blockchainHash}</code>
            </div>
            {mcData.txHash && (
              <div style={styles.hashContainer}>
                <span style={styles.hashLabel}>Transaction Hash</span>
                <code style={styles.hashValue}>{mcData.txHash}</code>
                {mcData.explorerUrl && (
                  <a
                    href={mcData.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '12px', color: '#0d9488', fontWeight: 600, display: 'inline-block', marginTop: '6px' }}
                  >
                    View on Etherscan ↗
                  </a>
                )}
              </div>
            )}
            {mcData.issuingDoctorAddress && (
              <div style={styles.hashContainer}>
                <span style={styles.hashLabel}>
                  Issuing Doctor Wallet {mcData.issuingDoctorVerified ? '(Verified by Registry)' : '(NO LONGER VERIFIED)'}
                </span>
                <code style={styles.hashValue}>{mcData.issuingDoctorAddress}</code>
              </div>
            )}
            {Number(mcData.blockNumber) > 0 && (
              <div style={styles.blockInfo}>
                <span style={styles.blockLabel}>Block #</span>
                <span style={styles.blockValue}>{Number(mcData.blockNumber).toLocaleString()}</span>
              </div>
            )}
            {mcData.chainTimestamp && (
              <div style={styles.blockInfo}>
                <span style={styles.blockLabel}>Anchored on-chain at</span>
                <span style={styles.blockValue}>
                  {new Date(mcData.chainTimestamp * 1000).toLocaleString('en-GB', {
                    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
            )}
            {!isChainVerified && (
              <div style={{ ...styles.blockInfo, marginTop: '8px' }}>
                <span style={{ ...styles.blockLabel, color: '#d97706' }}>
                  No blockchain anchor found for this record
                </span>
              </div>
            )}
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

      {/* Domain-trust strip — defends against fake look-alike verification
          sites by teaching verifiers to trust only the official address. */}
      <div style={{
        maxWidth: '500px',
        width: '100%',
        padding: '0 20px',
        boxSizing: 'border-box',
        margin: '0 auto 8px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: '#F0FDFA',
          border: '1px solid #CCFBF1',
          borderRadius: '10px',
          padding: '12px 14px',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" style={{ flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p style={{ fontSize: '12px', color: '#0F766E', margin: 0, lineHeight: 1.5 }}>
            Only trust results on the official address <b>sarawak-medchain.pages.dev</b>. Never rely on a certificate you can't check here.
          </p>
        </div>
      </div>

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

  // Header styles — navy gradient, matches brand
  header: {
    padding: '18px 20px',
    background: 'linear-gradient(90deg, #0F2A5C 0%, #1E3A8A 100%)',
    width: '100%',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
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
    borderRadius: '10px',
    backgroundColor: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.18)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '17px',
    fontWeight: '600',
    margin: 0,
    color: '#FFFFFF',
    letterSpacing: '-0.01em',
  },
  headerSubtitle: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.65)',
    margin: 0,
    fontWeight: '500',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
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
