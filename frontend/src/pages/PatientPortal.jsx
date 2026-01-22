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
    <div className="flex-1 flex-grow w-full min-h-full font-sans" style={{ backgroundColor: '#0a0e14' }}>
      {/* Full-Width Content Area - No max-width constraints */}
      <div className="flex-1 w-full px-12 py-10">
        {/* Top Bar - Stretches Full Width */}
        <div className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <h1 className="text-4xl font-bold text-white tracking-tight">Patient Portal</h1>
            <span className="px-4 py-1.5 rounded-full text-sm font-semibold bg-sarawak-blue-500/20 text-sarawak-blue-400">
              Patient View
            </span>
          </div>
          <code className="text-sm bg-slate-800 px-5 py-3 rounded-2xl font-mono text-slate-300 border border-slate-700">
            {walletAddress}
          </code>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-8 p-5 rounded-2xl ${
            message.includes('Error')
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
          }`}>
            {message}
          </div>
        )}

        {/* Fluid Grid - 12 Column Layout, Full Width */}
        <div className="grid grid-cols-12 gap-10 w-full">
          {/* Access Control Section - col-span-4 */}
          <div className="col-span-12 lg:col-span-4 bg-slate-800/50 rounded-3xl border border-slate-700/50 p-8">
            <h2 className="text-xl font-bold text-white mb-6">
              Access Control
            </h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Doctor's Wallet Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={doctorAddress}
                  onChange={(e) => setDoctorAddress(e.target.value)}
                  className="w-full px-5 py-4 border border-slate-600 rounded-2xl focus:ring-2 focus:ring-sarawak-blue-500 focus:border-sarawak-blue-500 outline-none transition-all bg-slate-900/50 text-white placeholder-slate-500"
                />
              </div>
              <div className="space-y-3 pt-2">
                <button
                  onClick={handleGrantAccess}
                  disabled={loading || !doctorAddress}
                  className="w-full px-6 py-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-2xl font-semibold transition-all duration-200"
                >
                  Grant Access
                </button>
                <button
                  onClick={handleRevokeAccess}
                  disabled={loading || !doctorAddress}
                  className="w-full px-6 py-4 bg-red-500 hover:bg-red-600 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-2xl font-semibold transition-all duration-200"
                >
                  Revoke Access
                </button>
                <button
                  onClick={handleCheckAccess}
                  disabled={loading || !doctorAddress}
                  className="w-full px-6 py-4 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-2xl font-semibold transition-all duration-200"
                >
                  Check Access
                </button>
              </div>
            </div>
          </div>

          {/* Medical Records Section - col-span-8 */}
          <div className="col-span-12 lg:col-span-8 bg-slate-800/50 rounded-3xl border border-slate-700/50 p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-white">My Medical Records</h2>
                <span className="px-4 py-1.5 rounded-full text-sm font-semibold bg-slate-700 text-slate-300">
                  {records.length} records
                </span>
              </div>
              <button
                onClick={loadRecords}
                disabled={loading}
                className="px-6 py-3 bg-sarawak-blue-500 hover:bg-sarawak-blue-600 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-2xl font-semibold transition-all duration-200"
              >
                Refresh
              </button>
            </div>

            {records.length === 0 ? (
              <div className="flex items-center justify-center py-20 text-slate-400">
                <div className="text-center">
                  <div className="text-5xl mb-4">📋</div>
                  <p className="text-lg">No medical records found</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {records.map((record, index) => (
                  <div key={index} className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <div className="grid grid-cols-3 gap-6 mb-5">
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Date</p>
                        <p className="text-sm font-medium text-slate-700">{formatTimestamp(record.timestamp)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Doctor</p>
                        <code className="text-xs bg-slate-200 px-3 py-1.5 rounded-lg text-slate-600">{record.doctorAddress.slice(0, 10)}...</code>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">IPFS Hash</p>
                        <code className="text-xs bg-slate-200 px-3 py-1.5 rounded-lg text-slate-600">{record.ipfsHash.slice(0, 12)}...</code>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <input
                        type="text"
                        placeholder="Enter encryption key"
                        value={encryptionKeys[record.ipfsHash] || ''}
                        onChange={(e) => handleKeyChange(record.ipfsHash, e.target.value)}
                        className="flex-1 px-5 py-3 border border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-sarawak-blue-500 outline-none bg-slate-900/50 text-white placeholder-slate-500"
                      />
                      <button
                        onClick={() => handleViewRecord(record.ipfsHash)}
                        disabled={loading || !encryptionKeys[record.ipfsHash]}
                        className="px-6 py-3 bg-sarawak-blue-500 hover:bg-sarawak-blue-600 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl font-semibold text-sm transition-all duration-200"
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
