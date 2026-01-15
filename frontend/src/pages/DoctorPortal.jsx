import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { isVerifiedDoctor, writeRecord, readRecords, getMyBalance, requestEmergencyAccess } from '../utils/contract';
import { uploadMedicalRecord, checkStatus } from '../utils/api';

export default function DoctorPortal({ walletAddress }) {
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [backendStatus, setBackendStatus] = useState(null);
  const [creditBalance, setCreditBalance] = useState(null);

  // Upload form state
  const [patientAddress, setPatientAddress] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  // MC Success state for QR code
  const [mcSuccess, setMcSuccess] = useState(null);
  const qrRef = useRef(null);

  // Read records state
  const [readPatientAddress, setReadPatientAddress] = useState('');
  const [patientRecords, setPatientRecords] = useState([]);

  // Emergency access state
  const [emergencyPatientAddress, setEmergencyPatientAddress] = useState('');

  useEffect(() => {
    checkDoctorStatus();
    checkBackendStatus();
    fetchCreditBalance();
  }, [walletAddress]);

  const fetchCreditBalance = async () => {
    try {
      const balance = await getMyBalance();
      setCreditBalance(balance);
    } catch (error) {
      console.error('Error fetching credit balance:', error);
    }
  };

  const checkDoctorStatus = async () => {
    try {
      const verified = await isVerifiedDoctor(walletAddress);
      setIsVerified(verified);
      if (!verified) {
        setMessage('⚠️ You are not a verified doctor. Contact admin to get verified.');
      } else {
        setMessage('✓ You are verified as a doctor');
      }
    } catch (error) {
      console.error('Error checking doctor status:', error);
      setMessage(`Error: ${error.message}`);
    }
  };

  const checkBackendStatus = async () => {
    try {
      const status = await checkStatus();
      setBackendStatus(status);
      if (status.ipfs !== 'connected') {
        setMessage('⚠️ IPFS not connected. Please start IPFS daemon.');
      }
    } catch (error) {
      console.error('Backend status error:', error);
      setMessage('⚠️ Backend server not reachable');
    }
  };

  // Download QR code as image
  const downloadQRCode = () => {
    if (!qrRef.current || !mcSuccess) return;

    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const link = document.createElement('a');
      link.download = `MC-${mcSuccess.ipfsHash.slice(0, 8)}-QR.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  // Close MC success modal
  const closeMcSuccess = () => {
    setMcSuccess(null);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setMessage(`Selected: ${file.name}`);
    } else {
      setMessage('Error: Only PDF files are allowed');
      setSelectedFile(null);
    }
  };

  const handleUploadRecord = async (e) => {
    e.preventDefault();

    if (!isVerified) {
      setMessage('Error: You must be a verified doctor');
      return;
    }

    if (!selectedFile || !patientAddress) {
      setMessage('Error: Please select a file and enter patient address');
      return;
    }

    try {
      setLoading(true);
      setMessage('Step 1/3: Uploading and encrypting file...');

      // Upload to backend (encrypts and uploads to IPFS)
      const { ipfsHash, encryptionKey } = await uploadMedicalRecord(
        selectedFile,
        patientAddress
      );

      setMessage(`Step 2/3: Writing to blockchain...`);

      // Write record reference to blockchain
      await writeRecord(patientAddress, ipfsHash);

      setMessage(`✓ Record uploaded successfully!`);

      // Set MC success data for QR code display
      setMcSuccess({
        ipfsHash,
        encryptionKey,
        patientAddress,
        timestamp: new Date().toISOString()
      });

      // Refresh credit balance after upload
      await fetchCreditBalance();

      // Reset form
      setSelectedFile(null);
      setPatientAddress('');
      e.target.reset();

    } catch (error) {
      console.error('Upload error:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReadRecords = async () => {
    if (!readPatientAddress) {
      setMessage('Error: Please enter patient address');
      return;
    }

    try {
      setLoading(true);
      setMessage('Reading patient records...');

      const receipt = await readRecords(readPatientAddress);

      setMessage('✓ Access granted! Check transaction receipt for records.');
      console.log('Transaction receipt:', receipt);

    } catch (error) {
      console.error('Read error:', error);
      if (error.message.includes('Access denied')) {
        setMessage('Error: Access denied. Patient has not granted you permission.');
      } else {
        setMessage(`Error: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmergencyAccess = async () => {
    if (!emergencyPatientAddress) {
      setMessage('Error: Please enter patient address');
      return;
    }

    if (!isVerified) {
      setMessage('Error: You must be a verified doctor to request emergency access');
      return;
    }

    try {
      setLoading(true);
      setMessage('Requesting emergency access...');

      const receipt = await requestEmergencyAccess(emergencyPatientAddress);

      const expiryTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      setMessage(`✓ Emergency access granted until ${expiryTime.toLocaleTimeString()}. This has been logged on-chain for auditing.`);
      console.log('Emergency access receipt:', receipt);

      // Clear the input
      setEmergencyPatientAddress('');

    } catch (error) {
      console.error('Emergency access error:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-full px-8 py-6 font-sans tracking-tight">
      {/* Header - Full Width Enterprise Style */}
      <div className="mb-8 flex flex-col lg:flex-row lg:items-center justify-start gap-6">
        <div className="flex items-center gap-6">
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-800">Doctor Portal</h1>
          <span className={`flex px-3 py-1 rounded-full text-sm font-medium ${
            isVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}>
            {isVerified ? 'Verified Doctor' : 'Not Verified'}
          </span>
          {creditBalance !== null && (
            <span className={`flex px-3 py-1 rounded-full text-sm font-medium ${
              creditBalance >= 0 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {creditBalance} credits
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 lg:ml-auto">
          {backendStatus && (
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${backendStatus.ipfs === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
              <span className="text-slate-600">IPFS: {backendStatus.ipfs}</span>
            </div>
          )}
          <code className="text-sm bg-slate-200 px-3 py-2 rounded-lg font-mono text-slate-600">
            {walletAddress.slice(0, 10)}...{walletAddress.slice(-6)}
          </code>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-6 p-4 rounded-xl ${
          message.includes('Error') || message.includes('⚠️')
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
        }`}>
          <pre className="whitespace-pre-wrap font-sans">{message}</pre>
        </div>
      )}

      {/* MC Issued Success Modal */}
      {mcSuccess && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-2xl font-bold text-emerald-600 text-center mb-6">MC Issued Successfully!</h2>

            <div className="flex justify-center p-6 bg-slate-50 rounded-xl mb-6" ref={qrRef}>
              <QRCodeSVG
                value={`${window.location.origin}/verify/${mcSuccess.ipfsHash}`}
                size={200}
                level="H"
                includeMargin={true}
              />
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-1">Verification URL:</p>
                <code className="block bg-slate-100 px-3 py-2 rounded-lg text-xs font-mono text-blue-600 break-all">
                  {window.location.origin}/verify/{mcSuccess.ipfsHash}
                </code>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-700 mb-1">IPFS Hash:</p>
                <code className="block bg-slate-100 px-3 py-2 rounded-lg text-xs font-mono text-purple-600 break-all">
                  {mcSuccess.ipfsHash}
                </code>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-700 mb-1">Encryption Key:</p>
                <code className="block bg-slate-100 px-3 py-2 rounded-lg text-xs font-mono text-orange-600 break-all">
                  {mcSuccess.encryptionKey}
                </code>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <strong>IMPORTANT:</strong> Give this encryption key to the patient to decrypt their record!
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={downloadQRCode}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
              >
                Download QR Code
              </button>
              <button
                onClick={closeMcSuccess}
                className="px-6 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid - 12 Column Layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* Upload Section */}
        <div className="col-span-12 lg:col-span-6 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center justify-start gap-3">
            <span>Upload Medical Record</span>
          </h2>
          <form onSubmit={handleUploadRecord} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Patient Wallet Address:</label>
              <input
                type="text"
                placeholder="0x..."
                value={patientAddress}
                onChange={(e) => setPatientAddress(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Medical Document (PDF only):</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                required
              />
              {selectedFile && (
                <p className="mt-2 text-sm text-slate-600">Selected: {selectedFile.name}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !isVerified || !selectedFile}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
            >
              {loading ? 'Uploading...' : 'Upload and Encrypt'}
            </button>
          </form>
        </div>

        {/* Read Records Section */}
        <div className="col-span-12 lg:col-span-6 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center justify-start gap-3">
            <span>Read Patient Records</span>
          </h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Patient wallet address (0x...)"
              value={readPatientAddress}
              onChange={(e) => setReadPatientAddress(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
            <button
              onClick={handleReadRecords}
              disabled={loading || !readPatientAddress}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors"
            >
              Request Access to Records
            </button>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Note: You can only read records if the patient has granted you access.
          </p>
        </div>

        {/* Emergency Access Section */}
        <div className="col-span-12 bg-red-50 rounded-2xl shadow-sm border-2 border-red-200 p-6">
          <h2 className="text-xl font-semibold text-red-700 mb-4 flex items-center justify-start gap-3">
            <span>Emergency Access</span>
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mb-4">
            <strong>WARNING:</strong> Use only in medical emergencies. All emergency access requests are logged on-chain for auditing.
          </div>
          <div className="flex flex-col sm:flex-row justify-start gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">Patient Wallet Address:</label>
              <input
                type="text"
                placeholder="0x..."
                value={emergencyPatientAddress}
                onChange={(e) => setEmergencyPatientAddress(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleEmergencyAccess}
                disabled={loading || !isVerified || !emergencyPatientAddress}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
              >
                {loading ? 'Requesting...' : 'Request Emergency Access'}
              </button>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-600">
            Emergency access grants temporary 1-hour view rights to the patient's records without their explicit consent.
          </p>
        </div>
      </div>
    </div>
  );
}
