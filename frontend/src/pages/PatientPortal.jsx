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
    <div className="portal-container">
      <h1>Patient Portal</h1>
      <p>Connected as: <code>{walletAddress}</code></p>

      {message && (
        <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      {/* Access Control Section */}
      <div className="section">
        <h2>Access Control</h2>
        <div className="form-group">
          <input
            type="text"
            placeholder="Doctor's wallet address"
            value={doctorAddress}
            onChange={(e) => setDoctorAddress(e.target.value)}
            className="input-field"
          />
          <div className="button-group">
            <button onClick={handleGrantAccess} disabled={loading || !doctorAddress}>
              Grant Access
            </button>
            <button onClick={handleRevokeAccess} disabled={loading || !doctorAddress}>
              Revoke Access
            </button>
            <button onClick={handleCheckAccess} disabled={loading || !doctorAddress}>
              Check Access
            </button>
          </div>
        </div>
      </div>

      {/* Medical Records Section */}
      <div className="section">
        <h2>My Medical Records ({records.length})</h2>
        <button onClick={loadRecords} disabled={loading}>
          Refresh Records
        </button>

        {records.length === 0 ? (
          <p>No medical records found</p>
        ) : (
          <div className="records-list">
            {records.map((record, index) => (
              <div key={index} className="record-card">
                <div className="record-info">
                  <p><strong>Date:</strong> {formatTimestamp(record.timestamp)}</p>
                  <p><strong>Doctor:</strong> <code>{record.doctorAddress}</code></p>
                  <p><strong>IPFS Hash:</strong> <code>{record.ipfsHash}</code></p>
                </div>
                <div className="record-actions">
                  <input
                    type="text"
                    placeholder="Enter encryption key"
                    value={encryptionKeys[record.ipfsHash] || ''}
                    onChange={(e) => handleKeyChange(record.ipfsHash, e.target.value)}
                    className="input-field"
                  />
                  <button
                    onClick={() => handleViewRecord(record.ipfsHash)}
                    disabled={loading || !encryptionKeys[record.ipfsHash]}
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
  );
}
