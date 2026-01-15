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
    <div className="w-full min-h-full px-8 py-6 font-sans tracking-tight">
      {/* Header - Full Width Enterprise Style */}
      <div className="mb-8 flex flex-col lg:flex-row lg:items-center justify-start gap-6">
        <div className="flex items-center gap-6">
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-800">Patient Portal</h1>
          <span className="flex px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
            Patient View
          </span>
        </div>
        <code className="text-sm bg-slate-200 px-3 py-2 rounded-lg font-mono text-slate-600 lg:ml-auto">
          {walletAddress}
        </code>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-6 p-4 rounded-xl ${
          message.includes('Error')
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
        }`}>
          {message}
        </div>
      )}

      {/* Main Grid - 12 Column Layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* Access Control Section */}
        <div className="col-span-12 lg:col-span-4 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center justify-start gap-6">
            <span>Access Control</span>
          </h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Doctor's wallet address (0x...)"
              value={doctorAddress}
              onChange={(e) => setDoctorAddress(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
            <div className="flex flex-wrap justify-start gap-3">
              <button
                onClick={handleGrantAccess}
                disabled={loading || !doctorAddress}
                className="flex-1 min-w-[120px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
              >
                Grant Access
              </button>
              <button
                onClick={handleRevokeAccess}
                disabled={loading || !doctorAddress}
                className="flex-1 min-w-[120px] px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
              >
                Revoke Access
              </button>
              <button
                onClick={handleCheckAccess}
                disabled={loading || !doctorAddress}
                className="flex-1 min-w-[120px] px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
              >
                Check Access
              </button>
            </div>
          </div>
        </div>

        {/* Medical Records Section */}
        <div className="col-span-12 lg:col-span-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-start gap-6 mb-4">
            <h2 className="text-xl font-semibold text-slate-800">My Medical Records</h2>
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-600">
              {records.length} records
            </span>
            <button
              onClick={loadRecords}
              disabled={loading}
              className="ml-auto px-4 py-2 bg-sarawak-blue-500 hover:bg-sarawak-blue-600 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
            >
              Refresh
            </button>
          </div>

          {records.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">No medical records found</p>
          ) : (
            <div className="space-y-4 max-h-[500px] overflow-y-auto">
              {records.map((record, index) => (
                <div key={index} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Date</p>
                      <p className="text-sm font-medium text-slate-800">{formatTimestamp(record.timestamp)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">Doctor</p>
                      <code className="text-xs bg-slate-200 px-2 py-1 rounded">{record.doctorAddress.slice(0, 10)}...</code>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wide">IPFS Hash</p>
                      <code className="text-xs bg-slate-200 px-2 py-1 rounded">{record.ipfsHash.slice(0, 12)}...</code>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row justify-start gap-3">
                    <input
                      type="text"
                      placeholder="Enter encryption key"
                      value={encryptionKeys[record.ipfsHash] || ''}
                      onChange={(e) => handleKeyChange(record.ipfsHash, e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button
                      onClick={() => handleViewRecord(record.ipfsHash)}
                      disabled={loading || !encryptionKeys[record.ipfsHash]}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium text-sm transition-colors"
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
  );
}
