import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import SignatureCanvas from 'react-signature-canvas';
import { isVerifiedDoctor, writeRecord, readRecords, getMyBalance, requestEmergencyAccess } from '../utils/contract';
import { uploadMedicalRecord, checkStatus } from '../utils/api';
import { useBilling } from '../context/BillingContext';

// Terminal Theme Colors
const terminalTheme = {
  bg: '#0a0f1a',
  bgCard: '#0f1629',
  bgCardHover: '#141d33',
  border: '#1e3a5f',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  accent: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  medical: '#06b6d4',
};

export default function DoctorPortal({ walletAddress }) {
  // Use Billing Context
  const {
    accountType,
    currentTier,
    monthlySubscriptionFee,
    variableUsageCost,
    totalOutstandingBalance,
    mcRate,
    mcsIssuedThisMonth,
    subscriptionPaid
  } = useBilling();

  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [backendStatus, setBackendStatus] = useState(null);
  const [creditBalance, setCreditBalance] = useState(null);

  // Derived billing values
  const sarawakBlue = '#007BFF';
  const tierName = currentTier.name;
  const baseFee = monthlySubscriptionFee;
  const mcCost = mcRate;
  const totalDue = totalOutstandingBalance;

  // Upload form state
  const [patientAddress, setPatientAddress] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  // MC Success state for QR code
  const [mcSuccess, setMcSuccess] = useState(null);
  const qrRef = useRef(null);

  // Read records state
  const [readPatientAddress, setReadPatientAddress] = useState('');
  const [patientRecords, setPatientRecords] = useState([]);

  // Recent uploads tracking (mock data for demo - in production would come from events)
  const [recentUploads, setRecentUploads] = useState([
    { id: 1, date: '2026-01-15', patientId: '0x90F7...3906', type: 'Medical Certificate', status: 'Verified', ipfsHash: 'Qm...abc1' },
    { id: 2, date: '2026-01-14', patientId: '0x8626...1199', type: 'Lab Report', status: 'Verified', ipfsHash: 'Qm...abc2' },
    { id: 3, date: '2026-01-13', patientId: '0x90F7...3906', type: 'Prescription', status: 'Pending', ipfsHash: 'Qm...abc3' },
    { id: 4, date: '2026-01-12', patientId: '0x15d3...6A65', type: 'Medical Certificate', status: 'Verified', ipfsHash: 'Qm...abc4' },
    { id: 5, date: '2026-01-11', patientId: '0x9965...A4dc', type: 'Referral Letter', status: 'Verified', ipfsHash: 'Qm...abc5' },
  ]);

  // MC Issue Terminal State
  const [mcFormData, setMcFormData] = useState({
    patientIC: '',
    patientName: '',
    diagnosis: '',
    duration: '1',
    remarks: '',
  });
  const signaturePadRef = useRef(null);
  const [isSigning, setIsSigning] = useState(false);
  const [transactionHash, setTransactionHash] = useState(null);
  const [isMinting, setIsMinting] = useState(false);

  // Live feed for recently issued certificates
  const [liveFeed, setLiveFeed] = useState([
    { id: 1, time: '2 min ago', patientName: 'Ahmad bin Hassan', diagnosis: 'Upper Respiratory Infection', duration: 2, txHash: '0x7a3f...8c2d', status: 'confirmed' },
    { id: 2, time: '15 min ago', patientName: 'Sarah Lee', diagnosis: 'Acute Gastritis', duration: 1, txHash: '0x9b2e...4f1a', status: 'confirmed' },
    { id: 3, time: '32 min ago', patientName: 'Mohd Rizal', diagnosis: 'Viral Fever', duration: 3, txHash: '0x2c8d...7e3b', status: 'confirmed' },
    { id: 4, time: '1 hour ago', patientName: 'Tan Wei Ming', diagnosis: 'Migraine', duration: 1, txHash: '0x5f4a...9d2c', status: 'confirmed' },
  ]);

  // Get hospital name from pending admin or default
  const pendingAdmin = JSON.parse(localStorage.getItem('medchain_pending_admin') || '{}');
  const hospitalName = pendingAdmin.facilityName || 'Sarawak General Hospital';

  // Clear signature
  const clearSignature = () => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
    }
    setIsSigning(false);
  };

  // Check if signature exists
  const hasSignature = () => {
    return signaturePadRef.current && !signaturePadRef.current.isEmpty();
  };

  // Handle MC form input change
  const handleMcInputChange = (e) => {
    const { name, value } = e.target;
    setMcFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle secure on blockchain (mint)
  const handleSecureOnBlockchain = async () => {
    if (!hasSignature()) {
      setMessage('Error: Please provide your digital signature');
      return;
    }

    if (!mcFormData.patientIC || !mcFormData.patientName || !mcFormData.diagnosis) {
      setMessage('Error: Please fill in all required fields');
      return;
    }

    setIsMinting(true);
    setMessage('');

    try {
      // Simulate blockchain transaction
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Generate mock transaction hash
      const mockTxHash = '0x' + Array.from({ length: 64 }, () =>
        '0123456789abcdef'[Math.floor(Math.random() * 16)]
      ).join('');

      setTransactionHash(mockTxHash);

      // Add to live feed
      const newEntry = {
        id: Date.now(),
        time: 'Just now',
        patientName: mcFormData.patientName,
        diagnosis: mcFormData.diagnosis,
        duration: parseInt(mcFormData.duration),
        txHash: mockTxHash.slice(0, 6) + '...' + mockTxHash.slice(-4),
        status: 'confirming'
      };
      setLiveFeed(prev => [newEntry, ...prev.slice(0, 9)]);

      // Simulate confirmation after 3 seconds
      setTimeout(() => {
        setLiveFeed(prev => prev.map(item =>
          item.id === newEntry.id ? { ...item, status: 'confirmed', time: '1 min ago' } : item
        ));
      }, 3000);

      setMessage('✓ Medical Certificate secured on blockchain!');

      // Reset form after success
      setTimeout(() => {
        setMcFormData({
          patientIC: '',
          patientName: '',
          diagnosis: '',
          duration: '1',
          remarks: '',
        });
        clearSignature();
        setTransactionHash(null);
      }, 5000);

    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setIsMinting(false);
    }
  };

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
    <div className="min-h-screen font-sans" style={{ backgroundColor: terminalTheme.bg }}>
      {/* Terminal Header */}
      <header className="border-b px-8 py-4" style={{ borderColor: terminalTheme.border, backgroundColor: terminalTheme.bgCard }}>
        <div className="flex items-center justify-between">
          {/* Left: Hospital Name & Logo */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${terminalTheme.medical}20` }}>
              <svg className="w-6 h-6" style={{ color: terminalTheme.medical }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: terminalTheme.textPrimary }}>{hospitalName}</h1>
              <p className="text-sm" style={{ color: terminalTheme.textMuted }}>Medical Certificate Issue Terminal</p>
            </div>
          </div>

          {/* Center: Network Status */}
          <div className="flex items-center gap-3 px-5 py-2 rounded-xl" style={{ backgroundColor: `${terminalTheme.success}15`, border: `1px solid ${terminalTheme.success}30` }}>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: terminalTheme.success }}></span>
              <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: terminalTheme.success }}></span>
            </span>
            <span className="text-sm font-semibold" style={{ color: terminalTheme.success }}>Network Status: Connected</span>
          </div>

          {/* Right: Doctor Info */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold" style={{ color: terminalTheme.textPrimary }}>Dr. Verified</p>
              <p className="text-xs font-mono" style={{ color: terminalTheme.textMuted }}>
                {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}
              </p>
            </div>
            <div className={`px-3 py-1 rounded-lg text-xs font-bold ${isVerified ? '' : 'opacity-50'}`} style={{
              backgroundColor: isVerified ? `${terminalTheme.success}20` : `${terminalTheme.danger}20`,
              color: isVerified ? terminalTheme.success : terminalTheme.danger
            }}>
              {isVerified ? 'VERIFIED' : 'UNVERIFIED'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex">
        {/* Issue MC Form - Main Panel */}
        <div className="flex-1 p-8">
          {/* Message */}
          {message && (
            <div className={`mb-6 p-4 rounded-xl border ${
              message.includes('Error') || message.includes('⚠️')
                ? 'border-red-500/30 bg-red-500/10'
                : 'border-emerald-500/30 bg-emerald-500/10'
            }`}>
              <p className={message.includes('Error') ? 'text-red-400' : 'text-emerald-400'}>{message}</p>
            </div>
          )}

          {/* Issue MC Form Card */}
          <div className="rounded-2xl p-6 border" style={{ backgroundColor: terminalTheme.bgCard, borderColor: terminalTheme.border }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${terminalTheme.medical}20` }}>
                <svg className="w-5 h-5" style={{ color: terminalTheme.medical }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold" style={{ color: terminalTheme.textPrimary }}>Issue Medical Certificate</h2>
                <p className="text-sm" style={{ color: terminalTheme.textMuted }}>Fill in patient details and sign to issue</p>
              </div>
            </div>

            {/* Patient Info Section */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: terminalTheme.textSecondary }}>
                  Patient IC Number *
                </label>
                <input
                  type="text"
                  name="patientIC"
                  value={mcFormData.patientIC}
                  onChange={handleMcInputChange}
                  placeholder="e.g., 901201-13-5678"
                  className="w-full px-4 py-3 rounded-xl border outline-none transition-all"
                  style={{
                    backgroundColor: terminalTheme.bg,
                    borderColor: terminalTheme.border,
                    color: terminalTheme.textPrimary
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: terminalTheme.textSecondary }}>
                  Patient Name *
                </label>
                <input
                  type="text"
                  name="patientName"
                  value={mcFormData.patientName}
                  onChange={handleMcInputChange}
                  placeholder="e.g., Ahmad bin Hassan"
                  className="w-full px-4 py-3 rounded-xl border outline-none transition-all"
                  style={{
                    backgroundColor: terminalTheme.bg,
                    borderColor: terminalTheme.border,
                    color: terminalTheme.textPrimary
                  }}
                />
              </div>
            </div>

            {/* Diagnosis & Duration Section */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2" style={{ color: terminalTheme.textSecondary }}>
                  Diagnosis *
                </label>
                <input
                  type="text"
                  name="diagnosis"
                  value={mcFormData.diagnosis}
                  onChange={handleMcInputChange}
                  placeholder="e.g., Upper Respiratory Tract Infection"
                  className="w-full px-4 py-3 rounded-xl border outline-none transition-all"
                  style={{
                    backgroundColor: terminalTheme.bg,
                    borderColor: terminalTheme.border,
                    color: terminalTheme.textPrimary
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: terminalTheme.textSecondary }}>
                  Duration (Days)
                </label>
                <select
                  name="duration"
                  value={mcFormData.duration}
                  onChange={handleMcInputChange}
                  className="w-full px-4 py-3 rounded-xl border outline-none transition-all cursor-pointer"
                  style={{
                    backgroundColor: terminalTheme.bg,
                    borderColor: terminalTheme.border,
                    color: terminalTheme.textPrimary
                  }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 14].map(d => (
                    <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Remarks */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2" style={{ color: terminalTheme.textSecondary }}>
                Additional Remarks
              </label>
              <textarea
                name="remarks"
                value={mcFormData.remarks}
                onChange={handleMcInputChange}
                placeholder="Optional notes..."
                rows={2}
                className="w-full px-4 py-3 rounded-xl border outline-none transition-all resize-none"
                style={{
                  backgroundColor: terminalTheme.bg,
                  borderColor: terminalTheme.border,
                  color: terminalTheme.textPrimary
                }}
              />
            </div>

            {/* Digital Signature Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium" style={{ color: terminalTheme.textSecondary }}>
                  Digital Signature *
                </label>
                <button
                  onClick={clearSignature}
                  className="text-xs px-3 py-1 rounded-lg transition-colors"
                  style={{ backgroundColor: `${terminalTheme.danger}20`, color: terminalTheme.danger }}
                >
                  Clear
                </button>
              </div>
              <div
                className="rounded-xl border-2 border-dashed overflow-hidden"
                style={{ borderColor: isSigning ? terminalTheme.medical : terminalTheme.border, backgroundColor: '#ffffff' }}
              >
                <SignatureCanvas
                  ref={signaturePadRef}
                  penColor="#1e3a5f"
                  canvasProps={{
                    width: 600,
                    height: 150,
                    className: 'signature-canvas w-full cursor-crosshair'
                  }}
                  onBegin={() => setIsSigning(true)}
                />
              </div>
              <p className="mt-2 text-xs" style={{ color: terminalTheme.textMuted }}>
                Sign above using your mouse or touchpad
              </p>
            </div>

            {/* Transaction Hash Display */}
            {transactionHash && (
              <div className="mb-6 p-4 rounded-xl border" style={{ backgroundColor: `${terminalTheme.success}10`, borderColor: `${terminalTheme.success}30` }}>
                <p className="text-sm font-semibold mb-2" style={{ color: terminalTheme.success }}>Transaction Secured!</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono p-2 rounded-lg truncate" style={{ backgroundColor: terminalTheme.bg, color: terminalTheme.textSecondary }}>
                    {transactionHash}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(transactionHash)}
                    className="p-2 rounded-lg transition-colors"
                    style={{ backgroundColor: terminalTheme.bg }}
                  >
                    <svg className="w-4 h-4" style={{ color: terminalTheme.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Secure on Blockchain Button */}
            <button
              onClick={handleSecureOnBlockchain}
              disabled={isMinting || !isVerified}
              className="w-full py-4 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              style={{
                background: isMinting
                  ? terminalTheme.textMuted
                  : `linear-gradient(135deg, ${terminalTheme.accent}, ${terminalTheme.medical})`,
                boxShadow: isMinting ? 'none' : `0 8px 24px ${terminalTheme.accent}40`
              }}
            >
              {isMinting ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Securing on Blockchain...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Secure on Blockchain
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Feed Sidebar */}
        <div className="w-96 border-l p-6" style={{ borderColor: terminalTheme.border, backgroundColor: terminalTheme.bgCard }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${terminalTheme.success}20` }}>
              <svg className="w-5 h-5" style={{ color: terminalTheme.success }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: terminalTheme.textPrimary }}>Live Feed</h2>
              <p className="text-xs" style={{ color: terminalTheme.textMuted }}>Recently Issued Certificates</p>
            </div>
          </div>

          {/* Live Feed Items */}
          <div className="space-y-3">
            {liveFeed.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border transition-all"
                style={{
                  backgroundColor: terminalTheme.bg,
                  borderColor: item.status === 'confirming' ? terminalTheme.warning : terminalTheme.border
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-semibold truncate" style={{ color: terminalTheme.textPrimary }}>
                    {item.patientName}
                  </p>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                    style={{
                      backgroundColor: item.status === 'confirming' ? `${terminalTheme.warning}20` : `${terminalTheme.success}20`,
                      color: item.status === 'confirming' ? terminalTheme.warning : terminalTheme.success
                    }}
                  >
                    {item.status === 'confirming' && (
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: terminalTheme.warning }}></span>
                    )}
                    {item.status === 'confirming' ? 'Confirming' : 'Confirmed'}
                  </span>
                </div>
                <p className="text-xs mb-2 truncate" style={{ color: terminalTheme.textSecondary }}>
                  {item.diagnosis}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: terminalTheme.textMuted }}>
                    {item.duration} day{item.duration > 1 ? 's' : ''} MC
                  </span>
                  <code className="text-xs font-mono px-2 py-1 rounded" style={{ backgroundColor: terminalTheme.bgCard, color: terminalTheme.accent }}>
                    {item.txHash}
                  </code>
                </div>
                <p className="text-xs mt-2" style={{ color: terminalTheme.textMuted }}>{item.time}</p>
              </div>
            ))}
          </div>

          {/* Stats Summary */}
          <div className="mt-6 p-4 rounded-xl" style={{ backgroundColor: terminalTheme.bg }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: terminalTheme.textMuted }}>Today's Summary</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl font-bold" style={{ color: terminalTheme.medical }}>{liveFeed.length}</p>
                <p className="text-xs" style={{ color: terminalTheme.textMuted }}>MCs Issued</p>
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: terminalTheme.success }}>100%</p>
                <p className="text-xs" style={{ color: terminalTheme.textMuted }}>Confirmed</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
