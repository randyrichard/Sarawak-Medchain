import { useState, useEffect } from 'react';
import { getMyRecords, grantAccess, revokeAccess, hasAccess, formatTimestamp } from '../utils/contract';
import { retrieveMedicalRecord, openPDFInNewTab } from '../utils/api';

export default function PatientPortal({ walletAddress }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [doctorAddress, setDoctorAddress] = useState('');
  const [encryptionKeys, setEncryptionKeys] = useState({});

  // Load patient records on mount
  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    try {
      setLoading(true);
      const myRecords = await getMyRecords();
      setRecords(myRecords);
      setMessage(`Loaded ${myRecords.length} records`);
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

      // Pass walletAddress for blockchain permission verification
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
    setEncryptionKeys(prev => ({
      ...prev,
      [ipfsHash]: value
    }));
  };

  return (
    <div
      className="font-sans patient-portal"
      style={{
        backgroundColor: '#0a0e14',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden'
      }}
    >
      {/* ELITE SOVEREIGN HEADER */}
      <header
        style={{
          backgroundColor: '#0a0e14',
          borderBottom: '2px solid rgba(218, 165, 32, 0.3)',
          boxShadow: '0 4px 30px rgba(0, 0, 0, 0.4)',
          padding: '24px 40px',
          flexShrink: 0
        }}
      >
        <div
          style={{
            maxWidth: '1400px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          {/* LEFT: Branding Block - Logo + Title + Badge stacked */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {/* Gold Avatar Logo */}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #daa520 0%, #b8860b 100%)',
                boxShadow: '0 0 30px rgba(218, 165, 32, 0.5), inset 0 2px 0 rgba(255,255,255,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                position: 'relative'
              }}
            >
              <svg style={{ width: '36px', height: '36px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '14px', boxShadow: '0 0 25px rgba(218, 165, 32, 0.4)' }} className="animate-pulse"></div>
            </div>

            {/* Title + Badge Stacked */}
            <div>
              <h1 style={{ color: '#ffffff', fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.025em', margin: 0, lineHeight: 1.2 }}>
                Patient Portal
              </h1>
              {/* SECURE Badge - Under Title */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  marginTop: '8px',
                  background: 'linear-gradient(135deg, rgba(218, 165, 32, 0.2) 0%, rgba(218, 165, 32, 0.08) 100%)',
                  border: '1px solid #daa520',
                  color: '#daa520',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  boxShadow: '0 0 12px rgba(218, 165, 32, 0.2)'
                }}
              >
                <svg style={{ width: '12px', height: '12px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                SECURE PATIENT VIEW
              </div>
            </div>
          </div>

          {/* RIGHT: Wallet + Refresh */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <code
              style={{
                padding: '12px 18px',
                borderRadius: '10px',
                fontFamily: 'monospace',
                backgroundColor: '#111827',
                border: '1px solid rgba(218, 165, 32, 0.3)',
                color: '#daa520',
                fontSize: '0.85rem'
              }}
            >
              {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
            </code>
            <button
              onClick={loadRecords}
              disabled={loading}
              className="patient-refresh-btn hover:scale-105"
              style={{
                padding: '12px 20px',
                borderRadius: '10px',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#ffffff',
                color: '#000000',
                border: '2px solid #daa520',
                boxShadow: '0 0 15px rgba(218, 165, 32, 0.3)',
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <svg style={{ width: '16px', height: '16px' }} className={loading ? 'animate-spin' : ''} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - VERTICAL CENTERED */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '20px 40px',
          overflow: 'auto'
        }}
      >
        {/* Error Messages Only - Hide debug/success messages */}
        {message && message.includes('Error') && (
          <div
            className="mb-6 p-5 rounded-2xl text-lg font-medium"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              maxWidth: '1400px',
              margin: '0 auto 24px auto'
            }}
          >
            {message}
          </div>
        )}

        {/* SYMMETRICAL GRID - CENTERED */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            alignItems: 'stretch',
            gap: '60px',
            margin: 'auto',
            maxWidth: '1400px',
            width: '100%'
          }}
        >
            {/* ACCESS CONTROL - Luxury Sovereign Card */}
            <div
              className="luxury-card-breathing"
              style={{
                width: '100%',
                padding: '48px',
                backgroundColor: '#111827',
                border: '2px solid #daa520',
                borderRadius: '24px',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Card Header - ENLARGED */}
              <div className="flex items-center gap-4 mb-8">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #daa520 0%, #b8860b 100%)',
                    boxShadow: '0 0 25px rgba(218, 165, 32, 0.5)'
                  }}
                >
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h2 className="font-black text-white" style={{ fontSize: '2rem' }}>Access Control</h2>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-base font-semibold mb-3" style={{ color: '#daa520' }}>Doctor's Wallet Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={doctorAddress}
                  onChange={(e) => setDoctorAddress(e.target.value)}
                  className="w-full px-6 py-5 rounded-xl outline-none transition-all text-lg"
                  style={{
                    backgroundColor: '#0a0e14',
                    border: '1px solid rgba(218, 165, 32, 0.3)',
                    color: '#ffffff'
                  }}
                />
              </div>

              {/* Premium White Buttons - ENLARGED for Easy Tap */}
              <div className="space-y-4 pt-4">
                <button
                  onClick={handleGrantAccess}
                  disabled={loading || !doctorAddress}
                  className="patient-action-btn w-full px-8 py-5 rounded-2xl transition-all duration-300 flex items-center justify-center gap-3"
                  style={{
                    backgroundColor: (loading || !doctorAddress) ? '#374151' : '#ffffff',
                    color: (loading || !doctorAddress) ? '#9ca3af' : '#000000',
                    border: '2px solid #daa520',
                    boxShadow: (loading || !doctorAddress) ? 'none' : '0 0 20px rgba(218, 165, 32, 0.4)',
                    opacity: (loading || !doctorAddress) ? 0.6 : 1,
                    fontWeight: 900,
                    fontSize: '1.1rem'
                  }}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Grant Access
                </button>
                <button
                  onClick={handleRevokeAccess}
                  disabled={loading || !doctorAddress}
                  className="patient-action-btn w-full px-8 py-5 rounded-2xl transition-all duration-300 flex items-center justify-center gap-3"
                  style={{
                    backgroundColor: (loading || !doctorAddress) ? '#374151' : '#ffffff',
                    color: (loading || !doctorAddress) ? '#9ca3af' : '#000000',
                    border: '2px solid #daa520',
                    boxShadow: (loading || !doctorAddress) ? 'none' : '0 0 20px rgba(218, 165, 32, 0.4)',
                    opacity: (loading || !doctorAddress) ? 0.6 : 1,
                    fontWeight: 900,
                    fontSize: '1.1rem'
                  }}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Revoke Access
                </button>
                <button
                  onClick={handleCheckAccess}
                  disabled={loading || !doctorAddress}
                  className="patient-action-btn w-full px-8 py-5 rounded-2xl transition-all duration-300 flex items-center justify-center gap-3"
                  style={{
                    backgroundColor: (loading || !doctorAddress) ? '#374151' : '#ffffff',
                    color: (loading || !doctorAddress) ? '#9ca3af' : '#000000',
                    border: '2px solid #daa520',
                    boxShadow: (loading || !doctorAddress) ? 'none' : '0 0 20px rgba(218, 165, 32, 0.4)',
                    opacity: (loading || !doctorAddress) ? 0.6 : 1,
                    fontWeight: 900,
                    fontSize: '1.1rem'
                  }}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Check Access
                </button>
              </div>
            </div>
          </div>

          {/* MEDICAL RECORDS - Luxury Sovereign Card */}
          <div
            className="luxury-card-breathing"
            style={{
              width: '100%',
              padding: '48px',
              backgroundColor: '#111827',
              border: '2px solid #daa520',
              borderRadius: '24px',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Card Header - ENLARGED */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #daa520 0%, #b8860b 100%)',
                    boxShadow: '0 0 25px rgba(218, 165, 32, 0.5)'
                  }}
                >
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="font-black text-white" style={{ fontSize: '2rem' }}>My Medical Records</h2>
                <span
                  className="px-4 py-2 rounded-full text-base font-bold"
                  style={{
                    backgroundColor: 'rgba(218, 165, 32, 0.2)',
                    border: '2px solid rgba(218, 165, 32, 0.5)',
                    color: '#daa520'
                  }}
                >
                  {records.length} records
                </span>
              </div>
            </div>

            {records.length === 0 ? (
              /* Empty State - CENTERED HERO SHIELD */
              <div className="flex items-center justify-center" style={{ minHeight: '350px' }}>
                <div className="text-center">
                  {/* Glowing Gold Medical Shield Icon - PERFECTLY CENTERED */}
                  <div
                    className="w-40 h-40 mx-auto mb-8 rounded-3xl flex items-center justify-center relative"
                    style={{
                      background: 'linear-gradient(135deg, rgba(218, 165, 32, 0.15) 0%, rgba(218, 165, 32, 0.05) 100%)',
                      border: '2px solid rgba(218, 165, 32, 0.4)'
                    }}
                  >
                    <svg
                      className="w-20 h-20"
                      style={{
                        color: '#daa520',
                        filter: 'drop-shadow(0 0 15px rgba(218, 165, 32, 0.4))'
                      }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    {/* Animated glow ring */}
                    <div className="absolute inset-0 rounded-3xl animate-pulse" style={{ boxShadow: '0 0 40px rgba(218, 165, 32, 0.3)' }}></div>
                  </div>
                  <p className="text-xl font-bold" style={{ color: '#94a3b8' }}>No medical records found</p>
                  <p className="text-base mt-2" style={{ color: '#64748b' }}>Your blockchain-secured records will appear here</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {records.map((record, index) => (
                  <div
                    key={index}
                    className="rounded-2xl p-6"
                    style={{
                      backgroundColor: '#0a0e14',
                      border: '1px solid rgba(218, 165, 32, 0.2)'
                    }}
                  >
                    <div className="grid grid-cols-3 gap-6 mb-5">
                      <div>
                        <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: '#daa520' }}>Date</p>
                        <p className="text-sm font-medium text-white">{formatTimestamp(record.timestamp)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: '#daa520' }}>Doctor</p>
                        <code className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: '#111827', color: '#94a3b8' }}>
                          {record.doctorAddress.slice(0, 10)}...
                        </code>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: '#daa520' }}>IPFS Hash</p>
                        <code className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: '#111827', color: '#94a3b8' }}>
                          {record.ipfsHash.slice(0, 12)}...
                        </code>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <input
                        type="text"
                        placeholder="Enter encryption key"
                        value={encryptionKeys[record.ipfsHash] || ''}
                        onChange={(e) => handleKeyChange(record.ipfsHash, e.target.value)}
                        className="flex-1 px-5 py-3 rounded-xl text-sm outline-none"
                        style={{
                          backgroundColor: '#111827',
                          border: '1px solid rgba(218, 165, 32, 0.2)',
                          color: '#ffffff'
                        }}
                      />
                      <button
                        onClick={() => handleViewRecord(record.ipfsHash)}
                        disabled={loading || !encryptionKeys[record.ipfsHash]}
                        className="patient-action-btn px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300"
                        style={{
                          backgroundColor: (loading || !encryptionKeys[record.ipfsHash]) ? '#374151' : '#ffffff',
                          color: (loading || !encryptionKeys[record.ipfsHash]) ? '#9ca3af' : '#000000',
                          border: '1px solid #daa520',
                          opacity: (loading || !encryptionKeys[record.ipfsHash]) ? 0.6 : 1
                        }}
                      >
                        View Record
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
