import { useState, useEffect } from 'react';
import { getMyRecords, grantAccess, revokeAccess, hasAccess, formatTimestamp } from '../utils/contract';
import { retrieveMedicalRecord, openPDFInNewTab } from '../utils/api';

export default function PatientPortal({ walletAddress }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [doctorAddress, setDoctorAddress] = useState('');
  const [encryptionKeys, setEncryptionKeys] = useState({});

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

  const isButtonDisabled = loading || !doctorAddress;

  return (
    <div style={{ backgroundColor: '#0a0e14', minHeight: '100vh' }}>
      {/* Header */}
      <header style={{
        backgroundColor: '#0f172a',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        padding: '16px 24px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: '1100px',
          margin: '0 auto'
        }}>
          {/* Left: Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg style={{ width: '20px', height: '20px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h1 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: '600', margin: 0 }}>Patient Portal</h1>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: '500',
                color: '#14b8a6',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>Secure Patient View</span>
            </div>
          </div>

          {/* Right: Wallet + Refresh */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <code style={{
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8',
              fontSize: '0.75rem'
            }}>
              {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
            </code>
            <button
              onClick={loadRecords}
              disabled={loading}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff',
                fontSize: '0.8rem',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
        {/* Error/Success Messages */}
        {message && (
          <div style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: message.includes('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
            border: message.includes('Error') ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(16,185,129,0.2)',
            color: message.includes('Error') ? '#f87171' : '#10b981',
            fontSize: '0.85rem'
          }}>
            {message}
          </div>
        )}

        {/* TWO COLUMN GRID */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
          alignItems: 'start'
        }}>

          {/* LEFT CARD - Access Control */}
          <div style={{
            background: 'rgba(20, 184, 166, 0.05)',
            border: '1px solid rgba(20, 184, 166, 0.3)',
            borderRadius: '16px',
            padding: '24px'
          }}>
            {/* Card Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg style={{ width: '20px', height: '20px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h2 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>Access Control</h2>
            </div>

            {/* Input Field */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '0.7rem',
                fontWeight: '500',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '6px'
              }}>Doctor's Wallet Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={doctorAddress}
                onChange={(e) => setDoctorAddress(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={handleGrantAccess}
                disabled={isButtonDisabled}
                className="btn-grant"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: isButtonDisabled ? '#1e293b' : '#14b8a6',
                  border: isButtonDisabled ? '1px solid rgba(148, 163, 184, 0.2)' : '1px solid #14b8a6',
                  color: isButtonDisabled ? '#475569' : '#fff',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Grant Access
              </button>

              <button
                onClick={handleRevokeAccess}
                disabled={isButtonDisabled}
                className="btn-secondary"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#1e293b',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  color: isButtonDisabled ? '#475569' : '#e2e8f0',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Revoke Access
              </button>

              <button
                onClick={handleCheckAccess}
                disabled={isButtonDisabled}
                className="btn-secondary"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#1e293b',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  color: isButtonDisabled ? '#475569' : '#e2e8f0',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Check Access
              </button>
            </div>
          </div>

          {/* RIGHT CARD - My Medical Records */}
          <div style={{
            background: 'rgba(20, 184, 166, 0.05)',
            border: '1px solid rgba(20, 184, 166, 0.3)',
            borderRadius: '16px',
            padding: '24px'
          }}>
            {/* Card Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg style={{ width: '20px', height: '20px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>My Medical Records</h2>
              <span style={{
                marginLeft: 'auto',
                padding: '4px 10px',
                borderRadius: '12px',
                backgroundColor: 'rgba(20,184,166,0.1)',
                border: '1px solid rgba(20,184,166,0.2)',
                color: '#14b8a6',
                fontSize: '0.75rem',
                fontWeight: '500'
              }}>{records.length} records</span>
            </div>

            {/* Content */}
            {records.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 20px',
                textAlign: 'center'
              }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: 'rgba(20,184,166,0.08)',
                  border: '1px solid rgba(20,184,166,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <svg style={{ width: '40px', height: '40px', color: '#14b8a6' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <p style={{ color: '#fff', fontSize: '0.95rem', fontWeight: '500', margin: '0 0 4px 0' }}>
                  Your medical history is secured
                </p>
                <p style={{ color: '#14b8a6', fontSize: '0.85rem', margin: 0 }}>
                  on the Sarawak Blockchain
                </p>
              </div>
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {records.map((record, index) => (
                  <div
                    key={index}
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.2)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: '10px',
                      padding: '16px',
                      marginBottom: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '0.8rem' }}>
                      <div>
                        <span style={{ color: '#64748b', fontSize: '0.65rem', textTransform: 'uppercase' }}>Date</span>
                        <p style={{ color: '#fff', margin: '2px 0 0 0' }}>{formatTimestamp(record.timestamp)}</p>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', fontSize: '0.65rem', textTransform: 'uppercase' }}>Doctor</span>
                        <p style={{ color: '#94a3b8', margin: '2px 0 0 0', fontFamily: 'monospace' }}>{record.doctorAddress.slice(0, 10)}...</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="Encryption key"
                        value={encryptionKeys[record.ipfsHash] || ''}
                        onChange={(e) => handleKeyChange(record.ipfsHash, e.target.value)}
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff',
                          fontSize: '0.85rem',
                          outline: 'none'
                        }}
                      />
                      <button
                        onClick={() => handleViewRecord(record.ipfsHash)}
                        disabled={loading || !encryptionKeys[record.ipfsHash]}
                        style={{
                          padding: '10px 16px',
                          borderRadius: '6px',
                          backgroundColor: '#14b8a6',
                          border: 'none',
                          color: '#fff',
                          fontSize: '0.85rem',
                          fontWeight: '500',
                          cursor: 'pointer'
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

      {/* CSS for hover effects */}
      <style>{`
        .btn-grant:hover:not(:disabled) {
          background-color: #0d9488 !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(20, 184, 166, 0.3);
        }
        .btn-secondary:hover:not(:disabled) {
          background-color: #334155 !important;
          border-color: rgba(148, 163, 184, 0.5) !important;
          transform: translateY(-1px);
        }
        .btn-grant:active:not(:disabled),
        .btn-secondary:active:not(:disabled) {
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}
