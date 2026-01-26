import { useState, useEffect } from 'react';
import { getMyRecords, grantAccess, revokeAccess, hasAccess, formatTimestamp } from '../utils/contract';
import { retrieveMedicalRecord, openPDFInNewTab } from '../utils/api';

export default function PatientPortal({ walletAddress }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [doctorAddress, setDoctorAddress] = useState('');
  const [encryptionKeys, setEncryptionKeys] = useState({});
  const [successGlow, setSuccessGlow] = useState(false);

  // Load patient records on mount
  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    try {
      setLoading(true);
      const myRecords = await getMyRecords();
      setRecords(myRecords);
    } catch (error) {
      console.error('Error loading records:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGrantAccess = async () => {
    try {
      setLoading(true);
      setMessage('Granting access...');
      await grantAccess(doctorAddress);
      setMessage(`Access granted to ${doctorAddress}`);
      setDoctorAddress('');
      setSuccessGlow(true);
      setTimeout(() => setSuccessGlow(false), 3000);
    } catch (error) {
      console.error('Error granting access:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeAccess = async () => {
    try {
      setLoading(true);
      setMessage('Revoking access...');
      await revokeAccess(doctorAddress);
      setMessage(`Access revoked from ${doctorAddress}`);
      setDoctorAddress('');
    } catch (error) {
      console.error('Error revoking access:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckAccess = async () => {
    try {
      setLoading(true);
      const access = await hasAccess(doctorAddress);
      setMessage(`Doctor ${doctorAddress} ${access ? 'HAS' : 'DOES NOT HAVE'} access`);
    } catch (error) {
      console.error('Error checking access:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleViewRecord = async (ipfsHash) => {
    try {
      const key = encryptionKeys[ipfsHash];
      if (!key) {
        setMessage('Please enter the encryption key for this record');
        return;
      }
      setLoading(true);
      setMessage('Retrieving and decrypting record...');
      const pdfBlob = await retrieveMedicalRecord(ipfsHash, key, walletAddress);
      openPDFInNewTab(pdfBlob);
      setMessage('Record opened in new tab');
    } catch (error) {
      console.error('Error viewing record:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyChange = (ipfsHash, value) => {
    setEncryptionKeys(prev => ({ ...prev, [ipfsHash]: value }));
  };

  // Styles
  const styles = {
    container: {
      backgroundColor: '#0a0e14',
      minHeight: '100vh',
      padding: '0',
    },
    header: {
      backgroundColor: '#0f172a',
      borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
      padding: '20px 32px',
    },
    headerContent: {
      maxWidth: '1200px',
      margin: '0 auto',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
    },
    logo: {
      width: '48px',
      height: '48px',
      borderRadius: '12px',
      background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    titleGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    },
    title: {
      color: '#ffffff',
      fontSize: '1.5rem',
      fontWeight: '700',
      margin: 0,
      lineHeight: 1.2,
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      borderRadius: '6px',
      background: successGlow ? 'rgba(16, 185, 129, 0.15)' : 'rgba(20, 184, 166, 0.1)',
      border: successGlow ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(20, 184, 166, 0.2)',
      color: successGlow ? '#10b981' : '#14b8a6',
      fontSize: '0.7rem',
      fontWeight: '600',
      letterSpacing: '0.5px',
      transition: 'all 0.3s ease',
    },
    headerRight: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    walletBadge: {
      padding: '10px 14px',
      borderRadius: '8px',
      fontFamily: 'monospace',
      backgroundColor: 'rgba(15, 23, 42, 0.8)',
      border: '1px solid rgba(148, 163, 184, 0.15)',
      color: '#94a3b8',
      fontSize: '0.8rem',
    },
    refreshBtn: {
      padding: '10px 16px',
      borderRadius: '8px',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      backgroundColor: '#1e293b',
      color: '#ffffff',
      border: '1px solid rgba(148, 163, 184, 0.2)',
      fontSize: '0.85rem',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
    main: {
      padding: '32px',
      maxWidth: '1200px',
      margin: '0 auto',
    },
    cardsGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '32px',
      alignItems: 'start',
    },
    card: {
      backgroundColor: 'rgba(17, 24, 39, 0.8)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '16px',
      padding: '28px',
    },
    cardHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '24px',
    },
    cardIcon: {
      width: '44px',
      height: '44px',
      borderRadius: '10px',
      background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    cardTitle: {
      fontSize: '1.2rem',
      fontWeight: '600',
      color: '#ffffff',
      margin: 0,
    },
    recordsBadge: {
      marginLeft: 'auto',
      padding: '5px 12px',
      borderRadius: '16px',
      fontSize: '0.8rem',
      fontWeight: '500',
      backgroundColor: 'rgba(20, 184, 166, 0.1)',
      border: '1px solid rgba(20, 184, 166, 0.2)',
      color: '#14b8a6',
    },
    label: {
      display: 'block',
      fontSize: '0.75rem',
      fontWeight: '600',
      color: '#64748b',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: '8px',
    },
    input: {
      width: '100%',
      padding: '14px 16px',
      borderRadius: '10px',
      backgroundColor: '#0a0e14',
      border: '1px solid rgba(148, 163, 184, 0.15)',
      color: '#ffffff',
      fontSize: '0.95rem',
      outline: 'none',
      transition: 'border-color 0.2s ease',
    },
    buttonGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      marginTop: '20px',
    },
    button: {
      width: '100%',
      padding: '12px 16px',
      borderRadius: '8px',
      fontWeight: '500',
      fontSize: '0.9rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    buttonPrimary: {
      backgroundColor: '#14b8a6',
      color: '#ffffff',
      border: 'none',
    },
    buttonSecondary: {
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
      color: '#94a3b8',
      border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    buttonDisabled: {
      backgroundColor: 'rgba(30, 41, 59, 0.5)',
      color: '#475569',
      cursor: 'not-allowed',
      opacity: 0.5,
    },
    emptyState: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '40px 20px',
    },
    shieldContainer: {
      width: '100px',
      height: '100px',
      borderRadius: '50%',
      background: 'rgba(20, 184, 166, 0.06)',
      border: '1px solid rgba(20, 184, 166, 0.12)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '20px',
    },
    emptyTitle: {
      fontSize: '1rem',
      fontWeight: '500',
      color: '#ffffff',
      margin: '0 0 6px 0',
    },
    emptySubtitle: {
      fontSize: '0.85rem',
      color: '#14b8a6',
      margin: 0,
    },
    errorMessage: {
      marginBottom: '20px',
      padding: '14px 18px',
      borderRadius: '10px',
      fontSize: '0.9rem',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.2)',
      color: '#f87171',
    },
    successMessage: {
      marginBottom: '20px',
      padding: '14px 18px',
      borderRadius: '10px',
      fontSize: '0.9rem',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      border: '1px solid rgba(16, 185, 129, 0.2)',
      color: '#10b981',
    },
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          {/* Left: Logo + Title */}
          <div style={styles.headerLeft}>
            <div style={styles.logo}>
              <svg style={{ width: '24px', height: '24px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div style={styles.titleGroup}>
              <h1 style={styles.title}>Patient Portal</h1>
              <div style={styles.badge}>
                <svg style={{ width: '10px', height: '10px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {successGlow ? 'ACCESS GRANTED' : 'SECURE PATIENT VIEW'}
              </div>
            </div>
          </div>

          {/* Right: Wallet + Refresh */}
          <div style={styles.headerRight}>
            <code style={styles.walletBadge}>
              {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
            </code>
            <button
              onClick={loadRecords}
              disabled={loading}
              style={{
                ...styles.refreshBtn,
                opacity: loading ? 0.7 : 1,
              }}
            >
              <svg
                style={{
                  width: '16px',
                  height: '16px',
                  animation: loading ? 'spin 1s linear infinite' : 'none',
                }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        {/* Messages */}
        {message && message.includes('Error') && (
          <div style={styles.errorMessage}>{message}</div>
        )}
        {message && !message.includes('Error') && message !== 'Granting access...' && message !== 'Revoking access...' && (
          <div style={styles.successMessage}>{message}</div>
        )}

        {/* Cards Grid */}
        <div style={styles.cardsGrid}>
          {/* Access Control Card */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={styles.cardIcon}>
                <svg style={{ width: '22px', height: '22px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h2 style={styles.cardTitle}>Access Control</h2>
            </div>

            <div>
              <label style={styles.label}>Doctor's Wallet Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={doctorAddress}
                onChange={(e) => setDoctorAddress(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.buttonGroup}>
              <button
                onClick={handleGrantAccess}
                disabled={loading || !doctorAddress}
                style={{
                  ...styles.button,
                  ...(loading || !doctorAddress ? styles.buttonDisabled : styles.buttonPrimary),
                }}
              >
                <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Grant Access
              </button>

              <button
                onClick={handleRevokeAccess}
                disabled={loading || !doctorAddress}
                style={{
                  ...styles.button,
                  ...(loading || !doctorAddress ? styles.buttonDisabled : styles.buttonSecondary),
                }}
              >
                <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Revoke Access
              </button>

              <button
                onClick={handleCheckAccess}
                disabled={loading || !doctorAddress}
                style={{
                  ...styles.button,
                  ...(loading || !doctorAddress ? styles.buttonDisabled : styles.buttonSecondary),
                }}
              >
                <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Check Access
              </button>
            </div>
          </div>

          {/* Medical Records Card */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={styles.cardIcon}>
                <svg style={{ width: '22px', height: '22px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 style={styles.cardTitle}>My Medical Records</h2>
              <span style={styles.recordsBadge}>{records.length} records</span>
            </div>

            {records.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.shieldContainer}>
                  <svg
                    style={{ width: '48px', height: '48px', color: '#14b8a6' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <p style={styles.emptyTitle}>Your medical history is secured</p>
                <p style={styles.emptySubtitle}>on the Sarawak Blockchain</p>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
                {records.map((record, index) => (
                  <div
                    key={index}
                    style={{
                      backgroundColor: '#0a0e14',
                      border: '1px solid rgba(148, 163, 184, 0.1)',
                      borderRadius: '12px',
                      padding: '20px',
                      marginBottom: '12px',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
                      <div>
                        <p style={{ ...styles.label, marginBottom: '4px' }}>Date</p>
                        <p style={{ fontSize: '0.9rem', fontWeight: '500', color: '#ffffff', margin: 0 }}>
                          {formatTimestamp(record.timestamp)}
                        </p>
                      </div>
                      <div>
                        <p style={{ ...styles.label, marginBottom: '4px' }}>Doctor</p>
                        <code style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          {record.doctorAddress.slice(0, 10)}...
                        </code>
                      </div>
                      <div>
                        <p style={{ ...styles.label, marginBottom: '4px' }}>IPFS Hash</p>
                        <code style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          {record.ipfsHash.slice(0, 12)}...
                        </code>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <input
                        type="text"
                        placeholder="Enter encryption key"
                        value={encryptionKeys[record.ipfsHash] || ''}
                        onChange={(e) => handleKeyChange(record.ipfsHash, e.target.value)}
                        style={{ ...styles.input, flex: 1, padding: '12px 14px' }}
                      />
                      <button
                        onClick={() => handleViewRecord(record.ipfsHash)}
                        disabled={loading || !encryptionKeys[record.ipfsHash]}
                        style={{
                          ...styles.button,
                          width: 'auto',
                          padding: '12px 20px',
                          ...(loading || !encryptionKeys[record.ipfsHash] ? styles.buttonDisabled : styles.buttonPrimary),
                        }}
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* CSS for animations */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
