import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import SignatureCanvas from 'react-signature-canvas';
import { isVerifiedDoctor, writeRecord, readRecords, getMyBalance, requestEmergencyAccess, isHospitalPaused } from '../utils/contract';
import { uploadMedicalRecord, checkStatus } from '../utils/api';
import { useBilling } from '../context/BillingContext';
import { useFoundingMember } from '../context/FoundingMemberContext';
import { useDemo, DEMO_DOCTOR_INFO } from '../context/DemoContext';
import BroadcastNotification from '../components/BroadcastNotification';
import MaintenanceBanner from '../components/MaintenanceBanner';
import FoundingPartnerBadge from '../components/FoundingPartnerBadge';

export default function DoctorPortal({ walletAddress }) {
  // Navigation hook - must be at top before any conditionals
  const navigate = useNavigate();

  // Demo mode hook
  const { isDemoMode, addDemoMC } = useDemo();

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

  // Confetti Celebration state
  const [showConfetti, setShowConfetti] = useState(false);

  // Trigger confetti celebration
  const triggerConfetti = () => {
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

  // Profile dropdown state
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const profileDropdownRef = useRef(null);
  const [copySuccess, setCopySuccess] = useState(false);


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

  // Click outside handler for profile dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target)) {
        setShowProfileDropdown(false);
      }
    };

    if (showProfileDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileDropdown]);

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

      // Trigger confetti celebration
      triggerConfetti();

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
  }, [walletAddress, isDemoMode]);

  const fetchCreditBalance = async () => {
    // Demo mode: use fake balance
    if (isDemoMode) {
      setCreditBalance(5000); // Demo balance: RM 5,000
      return;
    }

    try {
      const balance = await getMyBalance();
      setCreditBalance(balance);
    } catch (error) {
      console.error('Error fetching credit balance:', error);
    }
  };

  const checkDoctorStatus = async () => {
    // Demo mode: skip blockchain validation, show as verified
    if (isDemoMode) {
      setIsVerified(true);
      setMessage(`✓ Demo Doctor: ${DEMO_DOCTOR_INFO.name} (${DEMO_DOCTOR_INFO.mmcNumber})`);
      return;
    }

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
    // Demo mode: skip backend check, assume everything is working
    if (isDemoMode) {
      setBackendStatus({ ipfs: 'connected', server: 'running' });
      return;
    }

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
    // Deduct RM 1.00 from MC Credits balance
    setCreditBalance(prev => prev !== null ? Math.max(0, prev - 1) : 9);
    setShowReceipt(false);
    setReceiptData(null);
    setTransactionHash(null);
  };

  // Show loading while checking suspension
  if (checkingSuspension) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-teal-500/30 border-t-teal-500 animate-spin"></div>
          <p style={{ color: '#64748B' }}>Verifying node status...</p>
        </div>
      </div>
    );
  }

  // Show suspension screen if hospital is paused
  if (isHospitalSuspended) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="max-w-lg w-full">
          {/* Suspension Card */}
          <div className="rounded-3xl overflow-hidden border" style={{ backgroundColor: '#FFFFFF', borderColor: '#ef444450' }}>
            {/* Header */}
            <div className="px-8 py-6 text-center" style={{ backgroundColor: '#ef444420' }}>
              <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#ef444430' }}>
                <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-red-400 mb-2">Account Suspended</h1>
              <p style={{ color: '#94A3B8' }}>Medical Certificate Issuance Disabled</p>
            </div>

            {/* Body */}
            <div className="px-8 py-6 space-y-6">
              {/* Professional Message */}
              <div className="p-5 rounded-xl text-center" style={{ backgroundColor: '#F8FAFC' }}>
                <p className="text-lg mb-4" style={{ color: '#1E293B' }}>
                  Your hospital node has been temporarily suspended.
                </p>
                <p style={{ color: '#64748B' }}>
                  Please contact your <strong className="text-teal-600">MedChain Administrator</strong> to settle outstanding subscription fees.
                </p>
              </div>

              {/* Outstanding Balance */}
              <div className="p-5 rounded-xl border" style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span style={{ color: '#94A3B8' }}>Outstanding Balance</span>
                  <span className="text-2xl font-bold text-red-400">RM 10,000.00</span>
                </div>
                <p className="text-xs" style={{ color: '#94A3B8' }}>
                  Monthly subscription fee for blockchain network access
                </p>
              </div>

              {/* Contact Info */}
              <div className="p-5 rounded-xl" style={{ backgroundColor: '#F8FAFC' }}>
                <h3 className="font-semibold mb-3" style={{ color: '#1E293B' }}>How to Restore Access:</h3>
                <ol className="space-y-2 text-sm" style={{ color: '#64748B' }}>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-600 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                    <span>Contact your hospital's accounts department</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-600 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                    <span>Process the RM 10,000 subscription payment</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-600 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                    <span>Send payment confirmation to admin@medchain.sarawak.gov.my</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-600 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">4</span>
                    <span>Your node will be reactivated within 24 hours</span>
                  </li>
                </ol>
              </div>

              {/* Support Contact */}
              <div className="flex items-center justify-center gap-3 pt-4 border-t" style={{ borderColor: '#E2E8F0' }}>
                <svg className="w-5 h-5" style={{ color: '#94A3B8' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span style={{ color: '#94A3B8' }}>support@medchain.sarawak.gov.my</span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-4 text-center" style={{ backgroundColor: '#F8FAFC' }}>
              <p className="text-xs" style={{ color: '#94A3B8' }}>
                Secured by <span className="text-teal-600 font-semibold">Sarawak MedChain</span> • Blockchain Verified Healthcare
              </p>
            </div>
          </div>

          {/* Wallet Info */}
          <div className="mt-6 text-center">
            <code className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#F8FAFC', color: '#94A3B8', border: '1px solid #E2E8F0' }}>
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

  // Handle disconnect wallet
  const handleDisconnectWallet = () => {
    // Clear any local storage related to wallet
    localStorage.removeItem('medchain_pending_admin');
    localStorage.removeItem('medchain_wallet_connected');

    // Close dropdown
    setShowProfileDropdown(false);

    // Navigate to connect page
    navigate('/connect');

    // Reload to clear wallet state (MetaMask will need to reconnect)
    window.location.reload();
  };

  // Copy wallet address to clipboard
  const copyWalletAddress = async () => {
    if (walletAddress) {
      try {
        await navigator.clipboard.writeText(walletAddress);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  // Truncate wallet address for display
  const truncateAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="min-h-screen font-sans doctor-portal" style={{ backgroundColor: '#FFFFFF', overflowX: 'hidden' }}>
      {/* Success Celebration */}
      {showConfetti && (
        <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-20px',
                width: `${6 + Math.random() * 8}px`,
                height: `${6 + Math.random() * 8}px`,
                background: `linear-gradient(135deg, #14b8a6 0%, #10b981 100%)`,
                borderRadius: '2px',
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && receiptData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div
            className="rounded-2xl max-w-md w-full overflow-hidden"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0'
            }}
          >
            <div className="px-6 py-5 text-center" style={{ borderBottom: '1px solid #E2E8F0' }}>
              <div className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)' }}>
                <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">Transaction Successful</h2>
              <p className="text-slate-500 text-sm">Medical Certificate secured on blockchain</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="flex justify-between py-2 border-b border-slate-200">
                <span className="text-slate-500 text-sm">Cost</span>
                <span className="text-lg font-bold text-slate-800">RM 1.00</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-200">
                <span className="text-slate-500 text-sm">Patient</span>
                <span className="text-slate-800 font-medium">{receiptData.patientName}</span>
              </div>
              <div className="py-2 border-b border-slate-200">
                <p className="text-xs text-slate-500 mb-1">Blockchain Hash</p>
                <code className="text-xs font-mono text-teal-400 break-all">{receiptData.txHash}</code>
              </div>

              {/* QR Code for Verification */}
              <div ref={qrRef} className="py-4 text-center">
                <p className="text-xs text-slate-400 mb-3">Scan to Verify MC</p>
                <div className="inline-block p-3 rounded-xl" style={{ backgroundColor: '#ffffff' }}>
                  <QRCodeSVG
                    value={`https://sarawak-medchain.pages.dev/verify/${receiptData.txHash}`}
                    size={140}
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                    level="M"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-2 font-mono">{(receiptData?.txHash || '').slice(0, 20)}...</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-6 pb-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={downloadQRCode}
                  className="py-3 rounded-lg font-semibold transition-all hover:opacity-90 flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'rgba(20, 184, 166, 0.1)', border: '1px solid rgba(20, 184, 166, 0.3)', color: '#14b8a6' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download QR
                </button>
                <button
                  onClick={() => window.print()}
                  className="py-3 rounded-lg font-semibold transition-all hover:opacity-90 flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'rgba(20, 184, 166, 0.1)', border: '1px solid rgba(20, 184, 166, 0.3)', color: '#14b8a6' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print MC
                </button>
              </div>
              <button
                onClick={closeReceipt}
                className="w-full py-3 rounded-lg font-semibold transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)', color: '#fff' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Premium Enterprise Header - Two Row Layout */}
      <header style={{ backgroundColor: '#FFFFFF' }}>
        {/* Utility Bar (Top Row) - Slim */}
        <div className="header-utility-bar" style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '8px 40px' }} className="flex items-center justify-end gap-4">
            {/* Balance & Top Up */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">Balance: <strong className="text-slate-800">RM {creditBalance !== null ? creditBalance : '10'}</strong></span>
              <button
                onClick={handleTopUp}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)', color: '#fff' }}
              >
                Top Up
              </button>
            </div>

            {/* Notification Bell */}
            <button className="p-2 rounded-lg hover:bg-slate-200 transition-colors" style={{ color: '#64748B' }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>

            {/* Profile Dropdown */}
            <div className="relative" ref={profileDropdownRef}>
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#E2E8F0' }}>
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${showProfileDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {showProfileDropdown && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50" style={{ boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)' }}>
                  {/* Wallet Info */}
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">Connected Wallet</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-gray-900 bg-gray-100 px-2 py-1 rounded">
                        {truncateAddress(walletAddress)}
                      </span>
                      <button
                        onClick={copyWalletAddress}
                        className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                        title="Copy address"
                      >
                        {copySuccess ? (
                          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {copySuccess && (
                      <p className="text-xs text-green-500 mt-1">Copied to clipboard!</p>
                    )}
                  </div>

                  {/* Menu Items */}
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setShowProfileDropdown(false);
                        navigate('/settings');
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                    >
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Profile Settings
                    </button>
                    <a
                      href={`https://etherscan.io/address/${walletAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowProfileDropdown(false)}
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                    >
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      View on Explorer
                    </a>
                  </div>

                  {/* Disconnect - Red, at bottom */}
                  <div className="border-t border-gray-100 pt-1 mt-1">
                    <button
                      onClick={handleDisconnectWallet}
                      className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Disconnect Wallet
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Header (Bottom Row) - Brand Bar */}
        <div className="header-main-bar" style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '20px 40px' }} className="flex items-center justify-between">
            {/* Left: Hospital Branding */}
            <div className="flex items-center gap-4">
              {/* Hospital Logo */}
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)', boxShadow: '0 4px 12px rgba(20, 184, 166, 0.25)' }}>
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>

              {/* Hospital Name, Subtitle & Badges */}
              <div>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">{hospitalName}</h1>
                <p className="text-sm text-slate-500 mt-0.5">Medical Certificate Terminal</p>

                {/* Badges Row */}
                <div className="flex items-center gap-3 mt-2">
                  {/* LIVE Badge */}
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    LIVE
                  </span>

                  {/* Verified Badge */}
                  <span
                    className="inline-flex items-center gap-1 text-xs font-medium"
                    style={{ color: isVerified ? '#0d9488' : '#ef4444' }}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {isVerified ? 'Verified' : 'Unverified'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Empty space or optional search (can add later) */}
            <div className="header-right-placeholder hidden md:block">
              {/* Reserved for future: search bar, quick actions, etc. */}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="doctor-main-content" style={{ backgroundColor: '#FFFFFF', minHeight: 'calc(100vh - 64px)', padding: '32px' }}>
        <div className="doctor-content-inner" style={{ maxWidth: '1200px', margin: '0 auto' }}>

          {/* Verification Badge - Centered */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            {isVerified ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '50px',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  color: '#22c55e',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                <svg style={{ width: '16px', height: '16px' }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Verified Doctor</span>
              </div>
            ) : (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '50px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                <svg style={{ width: '16px', height: '16px' }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>Not Verified</span>
              </div>
            )}
          </div>

          {/* Error/Warning Messages */}
          {message && (message.includes('Error') || message.includes('⚠️')) && (
            <div
              style={{
                marginBottom: '20px',
                padding: '12px 16px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 500,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#f87171'
              }}
            >
              {message}
            </div>
          )}

          {/* Success Messages (not verification related) */}
          {message && message.includes('✓') && !message.includes('verified') && (
            <div
              style={{
                marginBottom: '20px',
                padding: '12px 16px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 500,
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.2)',
                color: '#22c55e'
              }}
            >
              {message}
            </div>
          )}

          {/* ========== TWO COLUMN GRID ========== */}
          <div className="doctor-portal-grid" style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr',
            gap: '24px',
            alignItems: 'stretch'
          }}>

            {/* ========== LEFT COLUMN: FORM CARD ========== */}
            <div className="issue-mc-card" style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Card Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                paddingBottom: '20px',
                marginBottom: '20px',
                borderBottom: '1px solid #E2E8F0'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <svg style={{ width: '24px', height: '24px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1E293B', margin: 0 }}>Issue Medical Certificate</h2>
                  <p style={{ fontSize: '13px', color: '#94A3B8', margin: '4px 0 0 0' }}>Blockchain-secured • Tamper-proof</p>
                </div>
              </div>

              {/* Form Fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Row 1: Patient IC & Name */}
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Patient IC Number *
                    </label>
                    <input
                      type="text"
                      name="patientIC"
                      value={mcFormData.patientIC}
                      onChange={handleMcInputChange}
                      placeholder="e.g., 901201-13-5678"
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#F8FAFC',
                        color: '#1E293B',
                        fontSize: '14px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Patient Name *
                    </label>
                    <input
                      type="text"
                      name="patientName"
                      value={mcFormData.patientName}
                      onChange={handleMcInputChange}
                      placeholder="e.g., Ahmad bin Hassan"
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#F8FAFC',
                        color: '#1E293B',
                        fontSize: '14px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                {/* Row 2: Diagnosis & Duration */}
                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Diagnosis *
                    </label>
                    <input
                      type="text"
                      name="diagnosis"
                      value={mcFormData.diagnosis}
                      onChange={handleMcInputChange}
                      placeholder="e.g., Upper Respiratory Tract Infection"
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#F8FAFC',
                        color: '#1E293B',
                        fontSize: '14px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Duration
                    </label>
                    <select
                      name="duration"
                      value={mcFormData.duration}
                      onChange={handleMcInputChange}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#F8FAFC',
                        color: '#1E293B',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: 'pointer',
                        boxSizing: 'border-box'
                      }}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 14].map(d => (
                        <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 3: Remarks */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Additional Remarks
                  </label>
                  <textarea
                    name="remarks"
                    value={mcFormData.remarks}
                    onChange={handleMcInputChange}
                    placeholder="Optional clinical notes..."
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#F8FAFC',
                      color: '#1E293B',
                      fontSize: '14px',
                      outline: 'none',
                      resize: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Row 4: Digital Signature */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Physician Digital Signature *
                    </label>
                    <button
                      onClick={clearSignature}
                      style={{
                        fontSize: '11px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: '#64748B',
                        cursor: 'pointer',
                        transition: 'color 0.2s'
                      }}
                      onMouseOver={(e) => e.target.style.color = '#14b8a6'}
                      onMouseOut={(e) => e.target.style.color = '#64748B'}
                    >
                      Clear
                    </button>
                  </div>
                  <div
                    ref={signatureContainerRef}
                    style={{
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#F1F5F9'
                    }}
                  >
                    <SignatureCanvas
                      ref={signaturePadRef}
                      penColor="#1E293B"
                      backgroundColor="#F1F5F9"
                      canvasProps={{
                        style: {
                          width: '100%',
                          height: '120px',
                          display: 'block'
                        }
                      }}
                      onBegin={() => setIsSigning(true)}
                    />
                  </div>
                  <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '8px' }}>
                    Sign above • Cryptographically secured on blockchain
                  </p>
                </div>

                {/* Transaction Hash (conditional) */}
                {transactionHash && (
                  <div style={{
                    padding: '16px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.2)'
                  }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#22c55e', marginBottom: '8px' }}>Transaction Secured!</p>
                    <code style={{ fontSize: '12px', color: '#14b8a6', wordBreak: 'break-all' }}>{transactionHash}</code>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  onClick={handleSecureOnBlockchain}
                  disabled={isMinting || !isVerified}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: '12px',
                    border: 'none',
                    background: (isMinting || !isVerified) ? '#E2E8F0' : 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
                    color: (isMinting || !isVerified) ? '#94A3B8' : '#ffffff',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: (isMinting || !isVerified) ? 'not-allowed' : 'pointer',
                    opacity: (isMinting || !isVerified) ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '8px'
                  }}
                >
                  {isMinting ? (
                    <>
                      <svg style={{ width: '20px', height: '20px', animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24">
                        <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Securing on Blockchain...</span>
                    </>
                  ) : (
                    <>
                      <span>SECURE ON BLOCKCHAIN</span>
                      <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
            {/* END LEFT COLUMN */}

            {/* ========== RIGHT COLUMN: LIVE FEED CARD ========== */}
            <div className="live-feed-card" style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Card Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                paddingBottom: '16px',
                marginBottom: '16px',
                borderBottom: '1px solid #E2E8F0'
              }}>
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1E293B', margin: 0 }}>Live Feed</h2>
                  <p style={{ fontSize: '12px', color: '#94A3B8', margin: '2px 0 0 0' }}>Real-time activity</p>
                </div>
              </div>

              {/* Activity List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                {liveFeed.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: '#F8FAFC'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                        {item.patientName}
                      </p>
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 8px',
                        borderRadius: '20px',
                        fontWeight: 700,
                        backgroundColor: item.status === 'confirming' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                        color: item.status === 'confirming' ? '#22d3ee' : '#22c55e'
                      }}>
                        {item.status === 'confirming' ? 'PENDING' : 'CONFIRMED'}
                      </span>
                    </div>
                    <p style={{ fontSize: '11px', color: '#94A3B8', margin: '0 0 6px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.diagnosis} • {item.duration}d
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <code style={{ fontSize: '10px', color: '#14b8a6' }}>{item.txHash}</code>
                      <span style={{ fontSize: '10px', color: '#94A3B8' }}>{item.time}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Performance Stats */}
              <div style={{
                paddingTop: '16px',
                marginTop: '16px',
                borderTop: '1px solid #E2E8F0'
              }}>
                <p style={{ fontSize: '10px', fontWeight: 600, color: '#64748B', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  TODAY'S PERFORMANCE
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{
                    textAlign: 'center',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(20, 184, 166, 0.08)',
                    border: '1px solid rgba(20, 184, 166, 0.1)'
                  }}>
                    <p style={{ fontSize: '24px', fontWeight: 700, color: '#14b8a6', margin: 0 }}>{liveFeed.length}</p>
                    <p style={{ fontSize: '10px', color: '#64748B', margin: '4px 0 0 0' }}>MCs Issued</p>
                  </div>
                  <div style={{
                    textAlign: 'center',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.1)'
                  }}>
                    <p style={{ fontSize: '24px', fontWeight: 700, color: '#22c55e', margin: 0 }}>100%</p>
                    <p style={{ fontSize: '10px', color: '#64748B', margin: '4px 0 0 0' }}>Success</p>
                  </div>
                </div>
              </div>
            </div>
            {/* END RIGHT COLUMN */}

          </div>
          {/* END GRID */}
        </div>
      </div>

      {/* Mobile Responsive CSS */}
      <style>{`
        /* Spin animation for loading */
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Confetti animation */
        @keyframes confetti {
          0% {
            transform: translateY(0) rotateZ(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotateZ(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti 3s ease-out forwards;
        }

        /* ============ MOBILE RESPONSIVE STYLES ============ */
        @media (max-width: 1023px) {
          .doctor-portal {
            overflow-x: hidden !important;
          }

          /* Utility Bar - Mobile */
          .header-utility-bar > div {
            padding: 8px 16px !important;
            gap: 12px !important;
            flex-wrap: wrap !important;
          }

          /* Main Header Bar - Mobile */
          .header-main-bar > div {
            padding: 16px !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }

          /* Hospital branding - keep horizontal on mobile */
          .header-main-bar > div > div:first-child {
            width: 100% !important;
          }

          /* Hide placeholder on mobile */
          .header-right-placeholder {
            display: none !important;
          }

          /* Main content padding */
          .doctor-main-content {
            padding: 16px !important;
          }

          /* Main grid - stack vertically */
          .doctor-portal-grid {
            display: flex !important;
            flex-direction: column !important;
            gap: 20px !important;
          }

          /* Cards full width */
          .issue-mc-card,
          .live-feed-card {
            width: 100% !important;
            min-width: unset !important;
            max-width: 100% !important;
            padding: 20px !important;
            box-sizing: border-box !important;
          }

          /* Form rows - stack vertically */
          .form-row {
            display: flex !important;
            flex-direction: column !important;
            gap: 16px !important;
          }

          /* Form inputs full width */
          .issue-mc-card input,
          .issue-mc-card select,
          .issue-mc-card textarea {
            width: 100% !important;
            min-width: unset !important;
            box-sizing: border-box !important;
          }

          /* Signature canvas container */
          .issue-mc-card canvas {
            width: 100% !important;
            max-width: 100% !important;
          }

          /* Performance stats grid */
          .live-feed-card > div:last-child > div:last-child {
            grid-template-columns: 1fr 1fr !important;
          }

          /* Hide some header elements on mobile */
          .doctor-portal header .text-xs:not(:first-child) {
            font-size: 10px !important;
          }
        }

        /* Extra small screens */
        @media (max-width: 480px) {
          .doctor-main-content {
            padding: 12px !important;
          }

          .issue-mc-card,
          .live-feed-card {
            padding: 16px !important;
            border-radius: 12px !important;
          }

          /* Utility bar - stack on very small screens */
          .header-utility-bar > div {
            padding: 8px 12px !important;
            gap: 8px !important;
          }

          .header-utility-bar > div > div:first-child {
            flex-direction: column !important;
            align-items: center !important;
            gap: 8px !important;
            width: 100% !important;
          }

          /* Main header bar - compact */
          .header-main-bar > div {
            padding: 12px !important;
          }

          /* Smaller hospital name on mobile */
          .header-main-bar h1 {
            font-size: 18px !important;
          }

          .header-main-bar p {
            font-size: 12px !important;
          }

          /* Smaller text on mobile */
          .issue-mc-card h2,
          .live-feed-card h2 {
            font-size: 16px !important;
          }

          /* Compact live feed items */
          .live-feed-card > div > div {
            padding: 10px !important;
          }

          /* Smaller button */
          .issue-mc-card button[style*="padding: 16px"] {
            padding: 14px !important;
            font-size: 13px !important;
          }
        }
      `}</style>
    </div>
  );
}
