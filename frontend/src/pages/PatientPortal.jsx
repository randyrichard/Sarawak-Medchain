import { useState, useEffect } from 'react';
import { getMyRecords, grantAccess, revokeAccess, hasAccess, formatTimestamp } from '../utils/contract';
import { retrieveMedicalRecord, openPDFInNewTab } from '../utils/api';
import { useDemo, DEMO_MCS } from '../context/DemoContext';

export default function PatientPortal({ walletAddress }) {
  const { isDemoMode, demoMCs } = useDemo();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [doctorAddress, setDoctorAddress] = useState('');
  const [encryptionKeys, setEncryptionKeys] = useState({});

  useEffect(() => {
    loadRecords();
  }, [isDemoMode]);

  const loadRecords = async () => {
    // Demo mode: use demo data, no blockchain calls
    if (isDemoMode) {
      setRecords(demoMCs.map(mc => ({
        ipfsHash: mc.txHash,
        timestamp: mc.timestamp,
        doctor: mc.doctor,
        diagnosis: mc.diagnosis,
        patientName: mc.patientName,
        mcDays: mc.mcDays,
      })));
      setMessage('');
      return;
    }

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
    // Demo mode: simulate success
    if (isDemoMode) {
      setMessage(`✓ Demo: Access granted to ${doctorAddress}`);
      setDoctorAddress('');
      return;
    }

    try {
      setLoading(true);
      setMessage('Granting access...');
      await grantAccess(doctorAddress);
      setMessage(`Access granted to ${doctorAddress}`);
      setDoctorAddress('');
    } catch (error) {
      console.error('Error granting access:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeAccess = async () => {
    // Demo mode: simulate success
    if (isDemoMode) {
      setMessage(`✓ Demo: Access revoked from ${doctorAddress}`);
      setDoctorAddress('');
      return;
    }

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
    // Demo mode: simulate success
    if (isDemoMode) {
      setMessage(`✓ Demo: Doctor ${doctorAddress} HAS access`);
      return;
    }

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

  const isButtonDisabled = loading || !doctorAddress;

  // Card styles - polished
  const cardStyle = {
    border: '1px solid rgba(20, 184, 166, 0.2)',
    borderRadius: '16px',
    backgroundColor: 'rgba(20, 184, 166, 0.02)',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
  };

  // Button styles with hover transitions
  const primaryButtonStyle = {
    width: '100%',
    padding: '12px 18px',
    borderRadius: '10px',
    background: isButtonDisabled
      ? '#1e293b'
      : 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
    border: 'none',
    color: isButtonDisabled ? '#475569' : '#fff',
    fontSize: '0.85rem',
    fontWeight: '600',
    cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.2s ease'
  };

  const secondaryButtonStyle = {
    width: '100%',
    padding: '12px 18px',
    borderRadius: '10px',
    background: 'rgba(30, 41, 59, 0.6)',
    border: '1px solid rgba(148, 163, 184, 0.15)',
    color: isButtonDisabled ? '#475569' : '#e2e8f0',
    fontSize: '0.85rem',
    fontWeight: '500',
    cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.2s ease'
  };

  return (
    <div className="patient-portal" style={{
      backgroundColor: '#0a0e14',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: '100%'
    }}>
      {/* Premium Header */}
      <header style={{
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.8) 100%)',
        borderBottom: '1px solid rgba(20, 184, 166, 0.1)',
        padding: '20px 24px',
        width: '100%',
        boxSizing: 'border-box',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: '920px',
          margin: '0 auto',
          width: '100%'
        }}>
          {/* Left: Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 15px rgba(20, 184, 166, 0.3)'
            }}>
              <svg style={{ width: '24px', height: '24px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h1 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: '700', margin: 0, letterSpacing: '-0.02em' }}>Patient Portal</h1>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: '600',
                color: '#14b8a6',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>Secure Patient View</span>
            </div>
          </div>

          {/* Right: Wallet + Refresh */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              padding: '10px 16px',
              borderRadius: '10px',
              background: 'rgba(20, 184, 166, 0.08)',
              border: '1px solid rgba(20, 184, 166, 0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }}></div>
              <code style={{ color: '#94a3b8', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
              </code>
            </div>
            <button
              onClick={loadRecords}
              disabled={loading}
              className="refresh-btn"
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(20, 184, 166, 0.15) 0%, rgba(20, 184, 166, 0.05) 100%)',
                border: '1px solid rgba(20, 184, 166, 0.2)',
                color: '#14b8a6',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div style={{
        padding: '40px 24px',
        width: '100%',
        maxWidth: '1000px',
        boxSizing: 'border-box'
      }}>
        {/* Status Messages */}
        {message && (
          <div style={{
            marginBottom: '24px',
            padding: '16px 20px',
            borderRadius: '12px',
            background: message.includes('Error')
              ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)'
              : 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)',
            border: message.includes('Error') ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
            color: message.includes('Error') ? '#f87171' : '#10b981',
            fontSize: '0.9rem',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <svg style={{ width: '20px', height: '20px', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {message.includes('Error') ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              )}
            </svg>
            {message}
          </div>
        )}

        {/* Two Column Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
          padding: '24px',
          alignItems: 'stretch'
        }}>

          {/* LEFT CARD - Access Control */}
          <div className="patient-portal-card" style={cardStyle}>
            {/* Header row - fixed at top */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <svg style={{ width: '20px', height: '20px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>Access Control</h2>
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Manage doctor permissions</span>
              </div>
            </div>

            {/* Input Field */}
            <div style={{ marginBottom: '16px', flexShrink: 0 }}>
              <label style={{
                display: 'block',
                fontSize: '0.7rem',
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '1.2px',
                marginBottom: '10px'
              }}>Doctor's Wallet Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={doctorAddress}
                onChange={(e) => setDoctorAddress(e.target.value)}
                className="premium-input"
                style={{
                  width: '100%',
                  padding: '16px 18px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(148, 163, 184, 0.15)',
                  color: '#fff',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.2s ease',
                  fontFamily: 'monospace'
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto', flexShrink: 0 }}>
              <button
                onClick={handleGrantAccess}
                disabled={isButtonDisabled}
                className="btn-primary"
                style={primaryButtonStyle}
              >
                <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Grant Access
              </button>

              <button
                onClick={handleRevokeAccess}
                disabled={isButtonDisabled}
                className="btn-secondary"
                style={secondaryButtonStyle}
              >
                <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Revoke Access
              </button>

              <button
                onClick={handleCheckAccess}
                disabled={isButtonDisabled}
                className="btn-secondary"
                style={secondaryButtonStyle}
              >
                <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Check Access
              </button>
            </div>
          </div>

          {/* RIGHT CARD - My Medical Records */}
          <div className="patient-portal-card" style={cardStyle}>
            {/* Header row - fixed at top */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <svg style={{ width: '20px', height: '20px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>My Medical Records</h2>
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Blockchain-secured documents</span>
              </div>
              <span style={{
                padding: '3px 10px',
                borderRadius: '10px',
                backgroundColor: 'rgba(20, 184, 166, 0.1)',
                color: 'rgba(20, 184, 166, 0.8)',
                fontSize: '0.7rem',
                fontWeight: '500',
                flexShrink: 0
              }}>{records.length} records</span>
            </div>

            {/* Content - grows and centers */}
            {records.length === 0 ? (
              <div style={{
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                {/* Shield Icon */}
                <div className="shield-glow" style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(20, 184, 166, 0.15) 0%, rgba(20, 184, 166, 0.05) 60%, transparent 80%)',
                  border: '1px solid rgba(20, 184, 166, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <svg style={{ width: '40px', height: '40px', color: '#14b8a6' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <p style={{ color: '#fff', fontSize: '0.95rem', fontWeight: '600', margin: '0 0 4px 0' }}>
                  Your medical history is secured
                </p>
                <p style={{ color: '#14b8a6', fontSize: '0.85rem', fontWeight: '500', margin: 0 }}>
                  on the Sarawak Blockchain
                </p>
              </div>
            ) : (
              <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                {records.map((record, index) => (
                  <div
                    key={index}
                    className="record-item"
                    style={{
                      background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.2) 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '14px',
                      padding: '18px',
                      marginBottom: '12px',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '14px' }}>
                      <div>
                        <span style={{ color: '#64748b', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '600' }}>Date</span>
                        <p style={{ color: '#fff', margin: '4px 0 0 0', fontWeight: '500' }}>{formatTimestamp(record.timestamp)}</p>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: '600' }}>Doctor</span>
                        <p style={{ color: '#94a3b8', margin: '4px 0 0 0', fontFamily: 'monospace', fontSize: '0.85rem' }}>{(record.doctorAddress || '0xDemoDoctor').slice(0, 10)}...</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input
                        type="text"
                        placeholder="Enter encryption key"
                        value={encryptionKeys[record.ipfsHash] || ''}
                        onChange={(e) => handleKeyChange(record.ipfsHash, e.target.value)}
                        className="premium-input"
                        style={{
                          flex: 1,
                          padding: '12px 14px',
                          borderRadius: '10px',
                          backgroundColor: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid rgba(148, 163, 184, 0.15)',
                          color: '#fff',
                          fontSize: '0.85rem',
                          outline: 'none',
                          transition: 'all 0.2s ease'
                        }}
                      />
                      <button
                        onClick={() => handleViewRecord(record.ipfsHash)}
                        disabled={loading || !encryptionKeys[record.ipfsHash]}
                        className="view-btn"
                        style={{
                          padding: '12px 20px',
                          borderRadius: '10px',
                          background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
                          border: 'none',
                          color: '#fff',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: '0 2px 10px rgba(20, 184, 166, 0.25)'
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
      </div>

      {/* Premium CSS */}
      <style>{`
        /* Premium hover effects */
        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(20, 184, 166, 0.4) !important;
          filter: brightness(1.1);
        }
        .btn-primary:active:not(:disabled) {
          transform: translateY(0);
        }

        .btn-secondary:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(51, 65, 85, 0.9) 0%, rgba(51, 65, 85, 0.7) 100%) !important;
          border-color: rgba(148, 163, 184, 0.4) !important;
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        }
        .btn-secondary:active:not(:disabled) {
          transform: translateY(0);
        }

        .refresh-btn:hover {
          background: linear-gradient(135deg, rgba(20, 184, 166, 0.25) 0%, rgba(20, 184, 166, 0.1) 100%) !important;
          border-color: rgba(20, 184, 166, 0.4) !important;
          transform: translateY(-1px);
        }

        .premium-input:focus {
          border-color: rgba(20, 184, 166, 0.4) !important;
          box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.1);
        }

        .premium-input::placeholder {
          color: #475569;
        }

        .patient-portal-card {
          border: 1px solid rgba(20, 184, 166, 0.2) !important;
          border-radius: 16px !important;
          background-color: rgba(20, 184, 166, 0.02) !important;
          transition: all 0.2s ease;
        }

        .patient-portal-card:hover {
          border-color: rgba(20, 184, 166, 0.3) !important;
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
        }

        .btn-primary:hover:not(:disabled) {
          filter: brightness(1.1);
          box-shadow: 0 4px 12px rgba(20, 184, 166, 0.3);
        }

        .btn-secondary:hover:not(:disabled) {
          background: rgba(51, 65, 85, 0.7) !important;
          border-color: rgba(148, 163, 184, 0.25) !important;
        }

        .shield-glow {
          animation: shieldPulse 3s ease-in-out infinite;
        }

        @keyframes shieldPulse {
          0%, 100% {
            box-shadow: 0 0 40px rgba(20, 184, 166, 0.15), 0 0 80px rgba(20, 184, 166, 0.08);
          }
          50% {
            box-shadow: 0 0 50px rgba(20, 184, 166, 0.25), 0 0 100px rgba(20, 184, 166, 0.12);
          }
        }

        .record-item:hover {
          background: linear-gradient(135deg, rgba(20, 184, 166, 0.05) 0%, rgba(0, 0, 0, 0.25) 100%) !important;
          border-color: rgba(20, 184, 166, 0.15) !important;
        }

        .view-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 15px rgba(20, 184, 166, 0.35);
        }

        /* Scrollbar styling */
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(20, 184, 166, 0.3);
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(20, 184, 166, 0.5);
        }
      `}</style>
    </div>
  );
}
