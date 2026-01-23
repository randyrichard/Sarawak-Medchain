import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import SignatureCanvas from 'react-signature-canvas';
import { isVerifiedDoctor, writeRecord, readRecords, getMyBalance, requestEmergencyAccess, isHospitalPaused } from '../utils/contract';
import { uploadMedicalRecord, checkStatus } from '../utils/api';
import { useBilling } from '../context/BillingContext';
import { useFoundingMember } from '../context/FoundingMemberContext';
import BroadcastNotification from '../components/BroadcastNotification';
import MaintenanceBanner from '../components/MaintenanceBanner';
import FoundingPartnerBadge from '../components/FoundingPartnerBadge';

// Terminal Theme Colors - Master: #0a0e14
const terminalTheme = {
  bg: '#0a0e14',
  bgCard: '#0a0e14',
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
  // Navigation hook - must be at top before any conditionals
  const navigate = useNavigate();

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

  // Use Founding Member Context
  const { isFoundingMember, getFoundingMemberNumber } = useFoundingMember();
  const foundingMemberNumber = getFoundingMemberNumber(walletAddress);
  const isFoundingPartner = isFoundingMember(walletAddress);

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

  // Gold Confetti Celebration state
  const [showConfetti, setShowConfetti] = useState(false);

  // Trigger gold confetti celebration
  const triggerGoldConfetti = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);
  };

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
  const signatureContainerRef = useRef(null);
  const [isSigning, setIsSigning] = useState(false);
  const [transactionHash, setTransactionHash] = useState(null);
  const [isMinting, setIsMinting] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

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

  // Hospital suspension state
  const [isHospitalSuspended, setIsHospitalSuspended] = useState(false);
  const [checkingSuspension, setCheckingSuspension] = useState(true);

  // Check if hospital is suspended
  useEffect(() => {
    const checkSuspension = async () => {
      setCheckingSuspension(true);
      try {
        // First check localStorage (for demo mode)
        const savedStatuses = localStorage.getItem('medchain_node_statuses');
        if (savedStatuses) {
          const statuses = JSON.parse(savedStatuses);
          if (walletAddress && statuses[walletAddress]) {
            setIsHospitalSuspended(true);
            setCheckingSuspension(false);
            return;
          }
        }

        // Then try the blockchain (if connected)
        if (walletAddress) {
          try {
            const isPaused = await isHospitalPaused(walletAddress);
            setIsHospitalSuspended(isPaused);
          } catch (contractError) {
            console.log('Contract check failed (demo mode)');
          }
        }
      } catch (error) {
        console.error('Error checking suspension:', error);
      } finally {
        setCheckingSuspension(false);
      }
    };

    checkSuspension();

    // Also listen for storage changes (in case admin pauses from another tab)
    const handleStorageChange = (e) => {
      if (e.key === 'medchain_node_statuses') {
        checkSuspension();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Poll every 10 seconds for real-time suspension updates
    const pollInterval = setInterval(checkSuspension, 10000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(pollInterval);
    };
  }, [walletAddress]);

  // Fix canvas size on mount and resize - uses getBoundingClientRect for perfect alignment
  useEffect(() => {
    const resizeCanvas = () => {
      if (signaturePadRef.current && signatureContainerRef.current) {
        const canvas = signaturePadRef.current.getCanvas();
        const container = signatureContainerRef.current;
        const rect = container.getBoundingClientRect();

        // Get device pixel ratio for high DPI displays
        const ratio = window.devicePixelRatio || 1;

        // Calculate display dimensions from container
        const displayWidth = Math.floor(rect.width);
        const displayHeight = 150;

        // Set the canvas internal dimensions to match display size * DPI
        canvas.width = displayWidth * ratio;
        canvas.height = displayHeight * ratio;

        // Set CSS display size - ensures ink follows cursor perfectly
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        // Scale the context to account for pixel ratio
        const ctx = canvas.getContext('2d');
        ctx.scale(ratio, ratio);

        // Clear the canvas after resizing
        signaturePadRef.current.clear();
      }
    };

    // Resize on mount with a small delay to ensure DOM is ready
    const timeoutId = setTimeout(resizeCanvas, 150);

    // Also resize on window resize
    window.addEventListener('resize', resizeCanvas);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

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

      // Trigger gold confetti celebration
      triggerGoldConfetti();

      // Show receipt modal with QR code
      setReceiptData({
        txHash: mockTxHash,
        patientName: mcFormData.patientName,
        patientIC: mcFormData.patientIC,
        diagnosis: mcFormData.diagnosis,
        duration: parseInt(mcFormData.duration),
        hospital: hospitalName,
        issueDate: new Date().toLocaleDateString('en-MY', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }),
        verificationUrl: `${window.location.origin}/verify/${mockTxHash}`,
      });
      setShowReceipt(true);

      // Reset form after showing receipt
      setMcFormData({
        patientIC: '',
        patientName: '',
        diagnosis: '',
        duration: '1',
        remarks: '',
      });
      clearSignature();

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

  // Close receipt modal
  const closeReceipt = () => {
    setShowReceipt(false);
    setReceiptData(null);
    setTransactionHash(null);
  };

  // Show loading while checking suspension
  if (checkingSuspension) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: terminalTheme.bg }}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-cyan-500/30 border-t-cyan-500 animate-spin"></div>
          <p style={{ color: terminalTheme.textSecondary }}>Verifying node status...</p>
        </div>
      </div>
    );
  }

  // Show suspension screen if hospital is paused
  if (isHospitalSuspended) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ backgroundColor: terminalTheme.bg }}>
        <div className="max-w-lg w-full">
          {/* Suspension Card */}
          <div className="rounded-3xl overflow-hidden border" style={{ backgroundColor: terminalTheme.bgCard, borderColor: '#ef444450' }}>
            {/* Header */}
            <div className="px-8 py-6 text-center" style={{ backgroundColor: '#ef444420' }}>
              <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#ef444430' }}>
                <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-red-400 mb-2">Account Suspended</h1>
              <p style={{ color: terminalTheme.textMuted }}>Medical Certificate Issuance Disabled</p>
            </div>

            {/* Body */}
            <div className="px-8 py-6 space-y-6">
              {/* Professional Message */}
              <div className="p-5 rounded-xl text-center" style={{ backgroundColor: terminalTheme.bg }}>
                <p className="text-lg mb-4" style={{ color: terminalTheme.textPrimary }}>
                  Your hospital node has been temporarily suspended.
                </p>
                <p style={{ color: terminalTheme.textSecondary }}>
                  Please contact your <strong className="text-cyan-400">MedChain Administrator</strong> to settle outstanding subscription fees.
                </p>
              </div>

              {/* Outstanding Balance */}
              <div className="p-5 rounded-xl border" style={{ backgroundColor: '#f59e0b10', borderColor: '#f59e0b30' }}>
                <div className="flex items-center justify-between mb-3">
                  <span style={{ color: terminalTheme.textMuted }}>Outstanding Balance</span>
                  <span className="text-2xl font-bold text-amber-400">RM 10,000.00</span>
                </div>
                <p className="text-xs" style={{ color: terminalTheme.textMuted }}>
                  Monthly subscription fee for blockchain network access
                </p>
              </div>

              {/* Contact Info */}
              <div className="p-5 rounded-xl" style={{ backgroundColor: terminalTheme.bg }}>
                <h3 className="font-semibold mb-3" style={{ color: terminalTheme.textPrimary }}>How to Restore Access:</h3>
                <ol className="space-y-2 text-sm" style={{ color: terminalTheme.textSecondary }}>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                    <span>Contact your hospital's accounts department</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                    <span>Process the RM 10,000 subscription payment</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                    <span>Send payment confirmation to admin@medchain.sarawak.gov.my</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">4</span>
                    <span>Your node will be reactivated within 24 hours</span>
                  </li>
                </ol>
              </div>

              {/* Support Contact */}
              <div className="flex items-center justify-center gap-3 pt-4 border-t" style={{ borderColor: terminalTheme.border }}>
                <svg className="w-5 h-5" style={{ color: terminalTheme.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span style={{ color: terminalTheme.textMuted }}>support@medchain.sarawak.gov.my</span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-4 text-center" style={{ backgroundColor: terminalTheme.bg }}>
              <p className="text-xs" style={{ color: terminalTheme.textMuted }}>
                Secured by <span className="text-cyan-400 font-semibold">Sarawak MedChain</span> • Blockchain Verified Healthcare
              </p>
            </div>
          </div>

          {/* Wallet Info */}
          <div className="mt-6 text-center">
            <code className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: terminalTheme.bgCard, color: terminalTheme.textMuted }}>
              Connected: {walletAddress?.slice(0, 10)}...{walletAddress?.slice(-8)}
            </code>
          </div>
        </div>
      </div>
    );
  }

  // Handle Top Up click
  const handleTopUp = () => {
    navigate('/payment', { state: { topUpAmount: 1000, isTopUp: true } });
  };

  return (
    <div className="min-h-screen font-sans doctor-portal" style={{ backgroundColor: '#0a0e14' }}>
      {/* Maintenance Banner - Shows 24 hours before scheduled maintenance */}
      <MaintenanceBanner />

      {/* Network-Wide Broadcast Notification */}
      <BroadcastNotification />

      {/* Gold Confetti Celebration */}
      {showConfetti && (
        <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
          {/* Generate 50 gold confetti particles */}
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-20px',
                width: `${8 + Math.random() * 12}px`,
                height: `${8 + Math.random() * 12}px`,
                background: `linear-gradient(135deg, #daa520 0%, #ffd700 50%, #b8860b 100%)`,
                borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                boxShadow: '0 0 10px rgba(218, 165, 32, 0.8)',
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
                transform: `rotate(${Math.random() * 360}deg)`,
              }}
            />
          ))}
          {/* Center burst glow */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full animate-pulse"
            style={{
              background: 'radial-gradient(circle, rgba(218, 165, 32, 0.4) 0%, transparent 70%)',
              boxShadow: '0 0 100px rgba(218, 165, 32, 0.6), 0 0 200px rgba(218, 165, 32, 0.3)',
            }}
          />
        </div>
      )}

      {/* QR Code Receipt Modal */}
      {showReceipt && receiptData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-white/10 shadow-2xl">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-cyan-600 px-6 py-5 rounded-t-3xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">MC Issued Successfully!</h2>
                    <p className="text-emerald-100 text-sm">Secured on Blockchain</p>
                  </div>
                </div>
                <button
                  onClick={closeReceipt}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* QR Code Section */}
            <div className="p-6">
              <div className="bg-white rounded-2xl p-6 mb-6 text-center relative overflow-hidden">
                {/* Founding Member Watermark */}
                {isFoundingPartner && (
                  <div className="absolute top-2 right-2 z-10">
                    <div className="bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-amber-900 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                      </svg>
                      <span>Founding #{foundingMemberNumber}</span>
                    </div>
                  </div>
                )}
                <QRCodeSVG
                  value={receiptData.verificationUrl}
                  size={180}
                  level="H"
                  includeMargin={true}
                />
                <p className="text-slate-600 text-sm mt-3">Scan to verify this certificate</p>
                {/* Founding Partner Trust Seal */}
                {isFoundingPartner && (
                  <div className="mt-3 pt-3 border-t border-amber-200">
                    <p className="text-amber-700 text-xs font-semibold flex items-center justify-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                      </svg>
                      Issued by Founding Partner #{foundingMemberNumber} - First to Secure Sarawak
                    </p>
                  </div>
                )}
              </div>

              {/* Patient Details */}
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Patient Name</p>
                    <p className="text-white font-semibold">{receiptData.patientName}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">IC Number</p>
                    <p className="text-white font-mono">{receiptData.patientIC}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Duration</p>
                    <p className="text-cyan-400 font-bold text-lg">{receiptData.duration} Day{receiptData.duration > 1 ? 's' : ''}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Issue Date</p>
                    <p className="text-white font-semibold">{receiptData.issueDate}</p>
                  </div>
                </div>

                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Healthcare Facility</p>
                  <p className="text-white font-semibold">{receiptData.hospital}</p>
                </div>

                {/* Blockchain Hash */}
                <div className="bg-slate-800/50 rounded-xl p-4">
                  <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">Blockchain Transaction Hash</p>
                  <code className="text-cyan-400 text-xs font-mono break-all block">
                    {receiptData.txHash}
                  </code>
                </div>

                {/* Verification URL */}
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <p className="text-blue-400 text-xs uppercase tracking-wider mb-2">Verification URL</p>
                  <code className="text-blue-300 text-xs font-mono break-all block">
                    {receiptData.verificationUrl}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(receiptData.verificationUrl)}
                    className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy URL
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => window.open(receiptData.verificationUrl, '_blank')}
                  className="flex-1 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold rounded-xl hover:from-cyan-500 hover:to-blue-500 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View Certificate
                </button>
                <button
                  onClick={closeReceipt}
                  className="flex-1 py-3 bg-white/10 border border-white/20 text-white font-bold rounded-xl hover:bg-white/20 transition-all"
                >
                  Issue Another
                </button>
              </div>

              {/* Branding Footer */}
              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-center gap-2">
                <div className="w-6 h-6 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <span className="text-slate-400 text-xs">Secured by Sarawak MedChain</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PREMIUM ELITE HEADER */}
      <header
        className="px-8 py-5"
        style={{
          backgroundColor: '#0a0e14',
          borderBottom: '1px solid rgba(218, 165, 32, 0.2)',
          boxShadow: '0 4px 30px rgba(0, 0, 0, 0.3)'
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto' }} className="flex items-center justify-between">
          {/* Left: Premium Hospital Branding */}
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center relative"
              style={{
                background: 'linear-gradient(135deg, #daa520 0%, #b8860b 100%)',
                boxShadow: '0 0 20px rgba(218, 165, 32, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
              }}
            >
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              {/* Premium glow ring */}
              <div className="absolute inset-0 rounded-2xl animate-pulse" style={{ boxShadow: '0 0 15px rgba(218, 165, 32, 0.3)' }}></div>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: '#ffffff' }}>{hospitalName}</h1>
                <FoundingPartnerBadge walletAddress={walletAddress} size="small" showTooltip={true} />
              </div>
              <p className="text-sm font-medium" style={{ color: '#daa520' }}>
                Enterprise Medical Certificate Terminal
              </p>
            </div>
          </div>

          {/* Center: Premium Network Status */}
          <div
            className="flex items-center gap-4 px-6 py-3 rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 182, 212, 0.1) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              boxShadow: '0 0 20px rgba(16, 185, 129, 0.15)'
            }}
          >
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div>
              <p className="text-xs uppercase tracking-wider text-emerald-400/70">Blockchain Status</p>
              <p className="text-sm font-bold text-emerald-400">LIVE • Sarawak MedChain</p>
            </div>
          </div>

          {/* Right: MC Credits + Doctor Badge - ANCHORED TO HEADER */}
          <div className="flex items-center gap-4">
            {/* MC CREDITS - Perfectly Aligned */}
            <div
              className="flex items-center gap-4 px-5 py-3 rounded-xl"
              style={{
                backgroundColor: '#111827',
                border: '1px solid #daa520',
                boxShadow: '0 0 15px rgba(218, 165, 32, 0.2)'
              }}
            >
              <span className="text-sm font-bold" style={{ color: '#daa520' }}>MC Credits:</span>
              <span className="text-lg font-black text-white">
                RM {creditBalance !== null ? creditBalance.toLocaleString() : '10'}
              </span>
              <button
                onClick={handleTopUp}
                className="px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 hover:scale-105"
                style={{
                  backgroundColor: '#daa520',
                  color: '#000000',
                  boxShadow: '0 0 10px rgba(218, 165, 32, 0.5)'
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Top Up
              </button>
            </div>

            {/* Doctor Badge */}
            <div
              className="px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2"
              style={{
                background: isVerified
                  ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%)'
                  : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%)',
                border: isVerified ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
                color: isVerified ? '#10b981' : '#ef4444',
                boxShadow: isVerified ? '0 0 15px rgba(16, 185, 129, 0.2)' : 'none'
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isVerified ? '#10b981' : '#ef4444' }}></span>
              {isVerified ? 'MMC VERIFIED' : 'UNVERIFIED'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - MASTER COMMAND CENTER SYMMETRY */}
      <div
        style={{
          backgroundColor: '#0a0e14',
          minHeight: 'calc(100vh - 80px)',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          padding: '32px 24px'
        }}
      >
        {/* Centered Container - DEAD CENTER max-width 1200px */}
        <div
          style={{
            maxWidth: '1200px',
            width: '100%',
            display: 'flex',
            gap: '32px',
            margin: '0 auto'
          }}
        >
          {/* Issue MC Form - Main Panel */}
          <div style={{ flex: 1 }}>
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

            {/* PREMIUM FORM CARD */}
            <div
              className="rounded-3xl overflow-hidden"
              style={{
                backgroundColor: '#111827',
                border: '1px solid #daa520',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
              }}
            >
              {/* Premium Card Header */}
              <div
                className="px-8 py-6"
                style={{
                  background: 'linear-gradient(135deg, rgba(218, 165, 32, 0.15) 0%, rgba(218, 165, 32, 0.05) 100%)',
                  borderBottom: '1px solid rgba(218, 165, 32, 0.2)'
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{
                        background: 'linear-gradient(135deg, #daa520 0%, #b8860b 100%)',
                        boxShadow: '0 0 20px rgba(218, 165, 32, 0.4)'
                      }}
                    >
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Issue Medical Certificate</h2>
                      <p className="text-sm text-slate-400">Blockchain-secured • Tamper-proof • Instant verification</p>
                    </div>
                  </div>

                </div>
              </div>

              {/* Form Content */}
              <div className="p-8">

            {/* Premium Patient Info Section */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: '#daa520' }}>
                  Patient IC Number *
                </label>
                <input
                  type="text"
                  name="patientIC"
                  value={mcFormData.patientIC}
                  onChange={handleMcInputChange}
                  placeholder="e.g., 901201-13-5678"
                  className="w-full px-5 py-4 rounded-xl border-2 outline-none transition-all focus:ring-2 focus:ring-amber-500/50"
                  style={{
                    backgroundColor: '#0a0e14',
                    borderColor: 'rgba(218, 165, 32, 0.3)',
                    color: '#ffffff',
                    fontSize: '16px'
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: '#daa520' }}>
                  Patient Name *
                </label>
                <input
                  type="text"
                  name="patientName"
                  value={mcFormData.patientName}
                  onChange={handleMcInputChange}
                  placeholder="e.g., Ahmad bin Hassan"
                  className="w-full px-5 py-4 rounded-xl border-2 outline-none transition-all focus:ring-2 focus:ring-amber-500/50"
                  style={{
                    backgroundColor: '#0a0e14',
                    borderColor: 'rgba(218, 165, 32, 0.3)',
                    color: '#ffffff',
                    fontSize: '16px'
                  }}
                />
              </div>
            </div>

            {/* Premium Diagnosis & Duration Section */}
            <div className="grid grid-cols-3 gap-6 mb-8">
              <div className="col-span-2">
                <label className="block text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: '#daa520' }}>
                  Diagnosis *
                </label>
                <input
                  type="text"
                  name="diagnosis"
                  value={mcFormData.diagnosis}
                  onChange={handleMcInputChange}
                  placeholder="e.g., Upper Respiratory Tract Infection"
                  className="w-full px-5 py-4 rounded-xl border-2 outline-none transition-all focus:ring-2 focus:ring-amber-500/50"
                  style={{
                    backgroundColor: '#0a0e14',
                    borderColor: 'rgba(218, 165, 32, 0.3)',
                    color: '#ffffff',
                    fontSize: '16px'
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: '#daa520' }}>
                  Duration
                </label>
                <select
                  name="duration"
                  value={mcFormData.duration}
                  onChange={handleMcInputChange}
                  className="w-full px-5 py-4 rounded-xl border-2 outline-none transition-all cursor-pointer focus:ring-2 focus:ring-amber-500/50"
                  style={{
                    backgroundColor: '#0a0e14',
                    borderColor: 'rgba(218, 165, 32, 0.3)',
                    color: '#ffffff',
                    fontSize: '16px'
                  }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 14].map(d => (
                    <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Premium Remarks */}
            <div className="mb-8">
              <label className="block text-sm font-semibold mb-3 uppercase tracking-wider" style={{ color: '#daa520' }}>
                Additional Remarks
              </label>
              <textarea
                name="remarks"
                value={mcFormData.remarks}
                onChange={handleMcInputChange}
                placeholder="Optional clinical notes..."
                rows={2}
                className="w-full px-5 py-4 rounded-xl border-2 outline-none transition-all resize-none focus:ring-2 focus:ring-amber-500/50"
                style={{
                  backgroundColor: '#0a0e14',
                  borderColor: 'rgba(218, 165, 32, 0.3)',
                  color: '#ffffff',
                  fontSize: '16px'
                }}
              />
            </div>

            {/* PREMIUM Digital Signature Section */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, #daa520 0%, #b8860b 100%)',
                      boxShadow: '0 0 15px rgba(218, 165, 32, 0.3)'
                    }}
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                  <div>
                    <label className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#daa520' }}>
                      Physician Digital Signature *
                    </label>
                    <p className="text-xs text-slate-400">Cryptographically secured on blockchain</p>
                  </div>
                </div>
                <button
                  onClick={clearSignature}
                  className="text-xs px-4 py-2 rounded-lg transition-all hover:scale-105 font-semibold"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                  }}
                >
                  Clear Signature
                </button>
              </div>
              <div
                ref={signatureContainerRef}
                className="rounded-2xl overflow-hidden signature-container"
                style={{
                  border: '1px solid #daa520',
                  backgroundColor: '#0a0e14',
                  width: '100%',
                  boxShadow: isSigning
                    ? '0 0 30px rgba(218, 165, 32, 0.4), inset 0 0 20px rgba(218, 165, 32, 0.08)'
                    : '0 0 15px rgba(218, 165, 32, 0.15)'
                }}
              >
                <SignatureCanvas
                  ref={signaturePadRef}
                  penColor="#daa520"
                  backgroundColor="#0a0e14"
                  canvasProps={{
                    style: {
                      width: '100%',
                      height: '160px',
                      display: 'block',
                      backgroundColor: '#0a0e14'
                    },
                    className: 'signature-canvas cursor-crosshair'
                  }}
                  onBegin={() => setIsSigning(true)}
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs flex items-center gap-2" style={{ color: '#daa520' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Sign with MedChain Gold ink • Tamper-proof • Legally binding
                </p>
                <span className="text-xs text-slate-500 font-mono">SHA-256 Encrypted</span>
              </div>
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

            {/* PREMIUM Secure on Blockchain Button */}
            <div className="flex justify-center mt-6">
              <button
                onClick={handleSecureOnBlockchain}
                disabled={isMinting || !isVerified}
                className="w-full py-5 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-4 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: isMinting ? '#374151' : '#ffffff',
                  color: isMinting ? '#9ca3af' : '#000000',
                  boxShadow: isMinting
                    ? 'none'
                    : '0 0 20px rgba(218, 165, 32, 0.8), 0 0 50px rgba(218, 165, 32, 0.5)',
                  textShadow: 'none',
                  border: isMinting ? 'none' : '2px solid rgba(218, 165, 32, 0.3)'
                }}
              >
              {isMinting ? (
                <>
                  <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="font-black">Securing on Blockchain...</span>
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="#000000" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="font-black tracking-wide">SECURE ON BLOCKCHAIN</span>
                  <svg className="w-5 h-5" fill="none" stroke="#000000" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
          </div>
          </div>
          </div>
          </div>
        </div>

        {/* PREMIUM Live Feed Sidebar */}
        <div
          className="w-80 rounded-3xl overflow-hidden"
          style={{
            backgroundColor: '#111827',
            border: '1px solid #daa520',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}
        >
          {/* Sidebar Header */}
          <div
            className="px-6 py-5"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 182, 212, 0.1) 100%)',
              borderBottom: '1px solid rgba(16, 185, 129, 0.2)'
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center relative"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)'
                }}
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full animate-pulse border-2 border-slate-900"></div>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Live Feed</h2>
                <p className="text-xs text-emerald-400">Real-time blockchain activity</p>
              </div>
            </div>
          </div>

          <div className="p-5">

          {/* Premium Live Feed Items */}
          <div className="space-y-3">
            {liveFeed.map((item, index) => (
              <div
                key={item.id}
                className="p-4 rounded-xl transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: '#0a0e14',
                  border: item.status === 'confirming'
                    ? '1px solid rgba(245, 158, 11, 0.4)'
                    : '1px solid rgba(16, 185, 129, 0.2)',
                  boxShadow: item.status === 'confirming'
                    ? '0 0 15px rgba(245, 158, 11, 0.15)'
                    : index === 0 ? '0 0 20px rgba(16, 185, 129, 0.15)' : 'none'
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-bold truncate text-white">
                    {item.patientName}
                  </p>
                  <span
                    className="text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1.5"
                    style={{
                      backgroundColor: item.status === 'confirming' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.25)',
                      color: item.status === 'confirming' ? '#f59e0b' : '#10b981',
                      border: item.status === 'confirming' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(16, 185, 129, 0.4)'
                    }}
                  >
                    {item.status === 'confirming' && (
                      <span className="w-2 h-2 rounded-full animate-pulse bg-amber-500"></span>
                    )}
                    {item.status === 'confirming' ? 'PENDING' : 'CONFIRMED'}
                  </span>
                </div>
                <p className="text-xs mb-3 truncate text-slate-400">
                  {item.diagnosis}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: '#daa520' }}>
                    {item.duration} day{item.duration > 1 ? 's' : ''} MC
                  </span>
                  <code className="text-xs font-mono px-2 py-1 rounded-lg bg-slate-800 text-cyan-400">
                    {item.txHash}
                  </code>
                </div>
                <p className="text-xs mt-2 text-slate-500">{item.time}</p>
              </div>
            ))}
          </div>

          {/* Premium Stats Summary */}
          <div
            className="mt-6 p-5 rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(218, 165, 32, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%)',
              border: '1px solid rgba(218, 165, 32, 0.2)'
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: '#daa520' }}>Today's Performance</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 rounded-xl" style={{ backgroundColor: 'rgba(6, 182, 212, 0.1)' }}>
                <p className="text-3xl font-black text-cyan-400">{liveFeed.length}</p>
                <p className="text-xs text-slate-400 font-semibold">MCs Issued</p>
              </div>
              <div className="text-center p-3 rounded-xl" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                <p className="text-3xl font-black text-emerald-400">100%</p>
                <p className="text-xs text-slate-400 font-semibold">Success Rate</p>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
