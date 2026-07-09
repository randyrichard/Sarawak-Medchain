import { useState, useEffect } from 'react';
import { getMyRecords, grantAccess, revokeAccess, hasAccess } from '../lib/blockchain/contract';
import { retrieveMedicalRecord, openPDFInNewTab } from '../lib/data/api';
import { useDemo } from '../context/DemoContext';
import { CheckCircle, XCircle, ShieldCheck, Key, FileText, RefreshCw, HelpCircle, User } from 'lucide-react';
import PortalPage from '../ui/PortalPage';
import PageHeader from '../ui/PageHeader';
import Card, { CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

// Format date for display - handles both Unix timestamps and ISO strings
const formatRecordDate = (timestamp, dateIssued) => {
  if (dateIssued) return dateIssued;
  if (typeof timestamp === 'number' || !isNaN(Number(timestamp))) {
    const ts = Number(timestamp);
    const date = new Date(ts > 9999999999 ? ts : ts * 1000);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }
  if (typeof timestamp === 'string') {
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }
  return 'Date unavailable';
};

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
    if (isDemoMode) {
      setRecords(demoMCs.map(mc => ({
        ipfsHash: mc.txHash,
        timestamp: mc.timestamp,
        dateIssued: mc.dateIssued,
        doctor: mc.doctor,
        doctorAddress: mc.txHash?.slice(0, 42) || '0xDemoDoctor',
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
    if (isDemoMode) { setMessage(`✓ Demo: Access granted to ${doctorAddress}`); setDoctorAddress(''); return; }
    try {
      setLoading(true); setMessage('Granting access...');
      await grantAccess(doctorAddress);
      setMessage(`Access granted to ${doctorAddress}`); setDoctorAddress('');
    } catch (error) { setMessage(`Error: ${error.message}`); } finally { setLoading(false); }
  };

  const handleRevokeAccess = async () => {
    if (isDemoMode) { setMessage(`✓ Demo: Access revoked from ${doctorAddress}`); setDoctorAddress(''); return; }
    try {
      setLoading(true); setMessage('Revoking access...');
      await revokeAccess(doctorAddress);
      setMessage(`Access revoked from ${doctorAddress}`); setDoctorAddress('');
    } catch (error) { setMessage(`Error: ${error.message}`); } finally { setLoading(false); }
  };

  const handleCheckAccess = async () => {
    if (isDemoMode) { setMessage(`✓ Demo: Doctor ${doctorAddress} HAS access`); return; }
    try {
      setLoading(true);
      const access = await hasAccess(doctorAddress);
      setMessage(`Doctor ${doctorAddress} ${access ? 'HAS' : 'DOES NOT HAVE'} access`);
    } catch (error) { setMessage(`Error: ${error.message}`); } finally { setLoading(false); }
  };

  const handleViewRecord = async (ipfsHash) => {
    try {
      const key = encryptionKeys[ipfsHash];
      if (!key) { setMessage('Please enter the encryption key for this record'); return; }
      setLoading(true); setMessage('Retrieving and decrypting record...');
      const pdfBlob = await retrieveMedicalRecord(ipfsHash, key, walletAddress);
      openPDFInNewTab(pdfBlob);
      setMessage('Record opened in new tab');
    } catch (error) { setMessage(`Error: ${error.message}`); } finally { setLoading(false); }
  };

  const handleKeyChange = (ipfsHash, value) => setEncryptionKeys(prev => ({ ...prev, [ipfsHash]: value }));

  const isButtonDisabled = loading || !doctorAddress;
  const isError = message.includes('Error');

  const inputStyle = {
    width: '100%', padding: '15px 16px', borderRadius: 'var(--mc-radius-sm)',
    background: 'var(--mc-surface-2)', border: '1px solid var(--mc-border)',
    color: 'var(--mc-ink)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'monospace',
  };

  const header = (
    <PageHeader
      icon={<User size={22} />}
      title="Patient Portal"
      eyebrow="Secure Patient View"
      actions={
        <>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: 'var(--mc-radius-sm)', background: 'var(--mc-teal-50)', border: '1px solid var(--mc-border)' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--mc-green)', boxShadow: '0 0 8px var(--mc-green)' }} />
            <code style={{ color: 'var(--mc-slate-500)', fontSize: '0.75rem' }}>
              {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
            </code>
          </span>
          <Button variant="ghost" onClick={loadRecords} disabled={loading} style={{ padding: '9px 14px', fontSize: '0.8rem' }}>
            <RefreshCw size={16} /> Refresh
          </Button>
        </>
      }
    />
  );

  return (
    <PortalPage header={header} maxWidth="1000px">
      {message && (
        <div style={{
          marginBottom: '24px', padding: '16px 20px', borderRadius: 'var(--mc-radius-sm)',
          background: isError ? 'rgba(220,38,38,.06)' : 'rgba(16,185,129,.06)',
          border: `1px solid ${isError ? 'rgba(220,38,38,.2)' : 'rgba(16,185,129,.2)'}`,
          color: isError ? 'var(--mc-red)' : 'var(--mc-green)',
          fontSize: '0.9rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          {isError ? <XCircle size={20} style={{ flexShrink: 0 }} /> : <CheckCircle size={20} style={{ flexShrink: 0 }} />}
          {message}
        </div>
      )}

      <div className="patient-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'stretch' }}>
        {/* Access Control */}
        <Card hover style={{ display: 'flex', flexDirection: 'column' }}>
          <CardHeader icon={<Key size={20} />} title="Access Control" subtitle="Manage doctor permissions" />
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--mc-slate-400)', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '10px' }}>
              Doctor's Wallet Address
            </label>
            <input type="text" placeholder="0x..." value={doctorAddress} onChange={(e) => setDoctorAddress(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto' }}>
            <Button variant="primary" onClick={handleGrantAccess} disabled={isButtonDisabled} style={{ width: '100%' }}>
              <CheckCircle size={18} /> Grant Access
            </Button>
            <Button variant="secondary" onClick={handleRevokeAccess} disabled={isButtonDisabled} style={{ width: '100%' }}>
              <XCircle size={18} /> Revoke Access
            </Button>
            <Button variant="secondary" onClick={handleCheckAccess} disabled={isButtonDisabled} style={{ width: '100%' }}>
              <HelpCircle size={18} /> Check Access
            </Button>
          </div>
        </Card>

        {/* My Medical Records */}
        <Card hover style={{ display: 'flex', flexDirection: 'column' }}>
          <CardHeader
            icon={<FileText size={20} />}
            title="My Medical Records"
            subtitle="Blockchain-secured documents"
            right={<Badge tone="teal">{records.length} records</Badge>}
          />
          {records.length === 0 ? (
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px 0' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(15,118,110,.1) 0%, transparent 75%)', border: '1px solid var(--mc-teal-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <ShieldCheck size={40} color="var(--mc-teal-500)" strokeWidth={1.5} />
              </div>
              <p style={{ color: 'var(--mc-ink)', fontSize: '0.95rem', fontWeight: 600, margin: '0 0 4px' }}>Your medical history is secured</p>
              <p style={{ color: 'var(--mc-teal-700)', fontSize: '0.85rem', fontWeight: 500, margin: 0 }}>on the Sarawak Blockchain</p>
            </div>
          ) : (
            <div style={{ flexGrow: 1, overflowY: 'auto' }}>
              {records.map((record, index) => (
                <div key={index} style={{ background: 'var(--mc-surface-2)', border: '1px solid var(--mc-border)', borderRadius: '14px', padding: '18px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', gap: '20px', marginBottom: '14px' }}>
                    <div>
                      <span style={{ color: 'var(--mc-slate-400)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600 }}>Date</span>
                      <p style={{ color: 'var(--mc-ink)', margin: '4px 0 0', fontWeight: 500 }}>{formatRecordDate(record.timestamp, record.dateIssued)}</p>
                    </div>
                    <div>
                      <span style={{ color: 'var(--mc-slate-400)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600 }}>Doctor</span>
                      <p style={{ color: 'var(--mc-slate-500)', margin: '4px 0 0', fontFamily: 'monospace', fontSize: '0.85rem' }}>{(record.doctorAddress || '0xDemoDoctor').slice(0, 10)}...</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="text" placeholder="Enter encryption key" value={encryptionKeys[record.ipfsHash] || ''} onChange={(e) => handleKeyChange(record.ipfsHash, e.target.value)} style={{ ...inputStyle, flex: 1, padding: '12px 14px', fontSize: '0.85rem', background: 'var(--mc-surface)' }} />
                    <Button variant="primary" onClick={() => handleViewRecord(record.ipfsHash)} disabled={loading || !encryptionKeys[record.ipfsHash]} style={{ padding: '12px 20px' }}>
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .patient-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </PortalPage>
  );
}
