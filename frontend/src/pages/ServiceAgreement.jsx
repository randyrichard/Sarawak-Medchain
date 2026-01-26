/**
 * Digital Service Agreement (DSA) Module
 * Professional contract signing for hospital onboarding
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { QRCodeSVG } from 'qrcode.react';

const MEDCHAIN_BLUE = '#0066CC';
const MEDCHAIN_DARK = '#003366';
const MEDCHAIN_GOLD = '#D4A017'; // Prestigious gold for signatures
const MEDCHAIN_GREEN = '#10B981';

// Contract template
const CONTRACT_VERSION = 'DSA-2026-001';

// Generate unique document ID for QR code
const generateDocumentId = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `${CONTRACT_VERSION}-${timestamp}-${random}`;
};
const EFFECTIVE_DATE = new Date().toLocaleDateString('en-MY', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export default function ServiceAgreement() {
  const navigate = useNavigate();
  const location = useLocation();
  const signaturePadRef = useRef(null);

  // Extract referral code from URL query parameter
  const searchParams = new URLSearchParams(location.search);
  const referralCode = searchParams.get('ref') || null;

  // Get hospital data from location state or localStorage
  const getInitialData = () => {
    if (location.state?.hospitalData) {
      return location.state.hospitalData;
    }
    const stored = localStorage.getItem('medchain_pending_admin');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  };

  const [hospitalData] = useState(getInitialData);
  const [formData, setFormData] = useState({
    hospitalName: hospitalData?.facilityName || '',
    registrationNumber: hospitalData?.registrationNumber || '',
    ceoName: hospitalData?.decisionMakerName || '',
    ceoTitle: hospitalData?.decisionMakerRole || 'Chief Executive Officer',
    address: hospitalData?.address || '',
    email: hospitalData?.email || '',
  });

  const [hasSignature, setHasSignature] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSignatureSuccess, setShowSignatureSuccess] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Generate unique document ID for this session
  const [documentId] = useState(() => generateDocumentId());

  // Generate QR code data - encodes authorization URL with document details
  const qrCodeData = JSON.stringify({
    type: 'medchain_authorization',
    documentId: documentId,
    version: CONTRACT_VERSION,
    hospital: formData.hospitalName || 'Pending',
    timestamp: new Date().toISOString(),
    verifyUrl: `https://medchain.sarawak.gov.my/verify/${documentId}`,
  });

  // Authorization URL for QR code scanning
  const authorizationUrl = `${window.location.origin}/verify-agreement?doc=${documentId}&hospital=${encodeURIComponent(formData.hospitalName || 'Pending')}`;

  // Real-time clock - update every second
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  // Signature canvas container ref for proper sizing
  const signatureContainerRef = useRef(null);

  // Fix canvas coordinates - recalculate on mount and resize
  useEffect(() => {
    const fixCanvasSize = () => {
      if (!signaturePadRef.current || !signatureContainerRef.current) return;

      const canvas = signaturePadRef.current.getCanvas();
      const container = signatureContainerRef.current;
      const rect = container.getBoundingClientRect();

      // Account for padding (12px on each side from p-3)
      const displayWidth = Math.floor(rect.width - 24);
      const displayHeight = 180;

      // Get device pixel ratio for high-DPI screens
      const dpr = window.devicePixelRatio || 1;

      // Set canvas internal resolution to match display size * DPI
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;

      // Set CSS display size - ensures ink stays within box boundary
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      // Scale context to account for DPI
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      // Fill with dark background color to ensure proper initialization
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, displayWidth, displayHeight);

      // Clear canvas state after resize
      signaturePadRef.current.clear();
      setHasSignature(false);
      setShowSignatureSuccess(false);
    };

    // Delay to ensure DOM is ready and container is properly sized
    const timer = setTimeout(fixCanvasSize, 150);

    // Recalculate on window resize (handles orientation changes too)
    window.addEventListener('resize', fixCanvasSize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', fixCanvasSize);
    };
  }, []);

  // Pricing
  const selectedPlan = location.state?.plan || 'enterprise';
  const pricing = {
    enterprise: { name: 'Hospital Enterprise Plan', baseFee: 10000, mcFee: 1.00 },
    clinic: { name: 'Clinic Standard Plan', baseFee: 2000, mcFee: 1.00 },
  };
  const currentPlan = pricing[selectedPlan] || pricing.enterprise;

  // Clear signature
  const clearSignature = () => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
      setHasSignature(false);
      setShowSignatureSuccess(false);
    }
  };

  // Check if signature exists and trigger success animation
  const checkSignature = () => {
    if (signaturePadRef.current) {
      const hasSig = !signaturePadRef.current.isEmpty();
      setHasSignature(hasSig);

      // Trigger success animation when signature is first captured
      if (hasSig && !hasSignature) {
        setShowSignatureSuccess(true);
        // Auto-hide after 4 seconds
        setTimeout(() => setShowSignatureSuccess(false), 4000);
      }
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!hasSignature || !agreedToTerms) return;

    setIsSubmitting(true);

    try {
      // Get signature data
      const signatureData = signaturePadRef.current.toDataURL('image/png');

      // Generate agreement reference
      const ref = `DSA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Store signed agreement data
      const agreementData = {
        ref,
        hospitalName: formData.hospitalName,
        ceoName: formData.ceoName,
        ceoTitle: formData.ceoTitle,
        plan: currentPlan.name,
        baseFee: currentPlan.baseFee,
        mcFee: currentPlan.mcFee,
        signedAt: new Date().toISOString(),
        signatureData,
        status: 'active',
        contractVersion: CONTRACT_VERSION,
        referralCode: referralCode, // Track referral for reward processing
      };

      // Save to localStorage
      localStorage.setItem('medchain_signed_agreement', JSON.stringify(agreementData));

      // Update pending admin status to approved
      const pendingAdmin = JSON.parse(localStorage.getItem('medchain_pending_admin') || '{}');
      pendingAdmin.agreementSigned = true;
      pendingAdmin.agreementRef = ref;
      pendingAdmin.topUpUnlocked = true;
      localStorage.setItem('medchain_pending_admin', JSON.stringify(pendingAdmin));

      // Send alert to CEO Dashboard (stored in localStorage for demo)
      const alerts = JSON.parse(localStorage.getItem('medchain_founder_alerts') || '[]');
      alerts.unshift({
        id: `alert-${Date.now()}`,
        type: 'new_hospital_signed',
        title: 'New Hospital Signed!',
        message: `${formData.hospitalName} has signed the Digital Service Agreement`,
        details: {
          hospitalName: formData.hospitalName,
          ceoName: formData.ceoName,
          plan: currentPlan.name,
          monthlyValue: currentPlan.baseFee,
          agreementRef: ref,
        },
        timestamp: new Date().toISOString(),
        read: false,
      });
      localStorage.setItem('medchain_founder_alerts', JSON.stringify(alerts));

      // Redirect to payment page with agreement data
      navigate('/payment', { state: { agreementData } });
    } catch (error) {
      console.error('Error processing agreement:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center"
      style={{ backgroundColor: '#0a0e14', width: '100%' }}
    >
      {/* Header */}
      <header className="sticky top-0 z-50 w-full" style={{ backgroundColor: '#0a0e14', borderBottom: '1px solid rgba(51, 65, 85, 0.3)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }} className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: MEDCHAIN_BLUE }}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <span className="text-xl font-bold text-white">Sarawak</span>
              <span className="text-xl font-bold text-amber-400 ml-1">MedChain</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded-full text-blue-400 text-xs font-bold">
              {CONTRACT_VERSION}
            </span>
            {/* Real-Time Digital Clock */}
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/80 border border-slate-700 rounded-full">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-emerald-400 text-sm font-mono font-bold tracking-wider">
                {currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }} className="w-full px-6 pt-12 pb-12">
        {/* Referral Banner */}
        {referralCode && (
          <div
            className="mb-8 w-full rounded-2xl p-5"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(20, 184, 166, 0.1) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%)',
                }}
              >
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                </svg>
              </div>
              <div>
                <p className="text-emerald-400 font-semibold">You were referred by a partner hospital!</p>
                <p className="text-slate-400 text-sm mt-0.5">
                  Referral Code: <span className="font-mono text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded">{referralCode}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Title */}
        <div className="text-center mb-10 w-full">
          <span
            className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-4"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34D399',
            }}
          >
            Digital Service Agreement
          </span>
          <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">Service Agreement</h1>
          <p className="text-slate-400">Please review and sign to activate your hospital node</p>
        </div>

        {/* Contract Form - Floating Document */}
        <div
          className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl overflow-hidden w-full"
          style={{
            border: '1px solid rgba(100, 116, 139, 0.4)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)'
          }}
        >
          {/* Contract Header */}
          <div
            className="p-8 border-b border-slate-700/50"
            style={{
              background: `linear-gradient(135deg, ${MEDCHAIN_BLUE}08 0%, ${MEDCHAIN_DARK}05 100%)`,
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-5">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${MEDCHAIN_BLUE} 0%, ${MEDCHAIN_DARK} 100%)`,
                    boxShadow: `0 8px 24px ${MEDCHAIN_BLUE}30`,
                  }}
                >
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Sarawak MedChain Service Agreement</h2>
                  <p className="text-slate-400 mt-1">Blockchain Medical Certificate Verification Services</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div
                  className="inline-flex flex-col items-end px-4 py-3 rounded-xl"
                  style={{
                    background: 'rgba(30, 41, 59, 0.5)',
                    border: '1px solid rgba(71, 85, 105, 0.3)',
                  }}
                >
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Effective Date</p>
                  <p className="text-white font-semibold">{EFFECTIVE_DATE}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Parties */}
          <div className="p-8 border-b border-slate-700/50">
            <h3 className="text-lg font-bold text-white mb-6">Parties to this Agreement</h3>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Provider */}
              <div
                className="rounded-2xl p-6"
                style={{
                  background: 'rgba(30, 41, 59, 0.4)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                  <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">Service Provider</p>
                </div>
                <p className="text-lg font-bold text-white">Sarawak MedChain Sdn Bhd</p>
                <div className="mt-3 space-y-1">
                  <p className="text-sm text-slate-400">Level 15, Wisma Saberkas</p>
                  <p className="text-sm text-slate-400">Jalan Tun Abang Haji Openg</p>
                  <p className="text-sm text-slate-400">93000 Kuching, Sarawak</p>
                </div>
              </div>

              {/* Client */}
              <div
                className="rounded-2xl p-6"
                style={{
                  background: 'rgba(30, 41, 59, 0.4)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Client (Hospital/Clinic)</p>
                </div>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={formData.hospitalName}
                    onChange={(e) => setFormData({ ...formData, hospitalName: e.target.value })}
                    placeholder="Hospital / Clinic Name"
                    className="w-full rounded-xl px-4 py-3 text-white text-base font-semibold placeholder-slate-500 focus:outline-none transition-all"
                    style={{
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(71, 85, 105, 0.5)',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = MEDCHAIN_GREEN;
                      e.target.style.boxShadow = `0 0 0 3px ${MEDCHAIN_GREEN}20`;
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(71, 85, 105, 0.5)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Business Address"
                    className="w-full rounded-xl px-4 py-2.5 text-slate-300 text-sm placeholder-slate-500 focus:outline-none transition-all"
                    style={{
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(71, 85, 105, 0.5)',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = MEDCHAIN_GREEN;
                      e.target.style.boxShadow = `0 0 0 3px ${MEDCHAIN_GREEN}20`;
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(71, 85, 105, 0.5)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Selected Plan */}
          <div className="p-8 border-b border-slate-700/50">
            <h3 className="text-lg font-bold text-white mb-6">Selected Service Plan</h3>
            <div
              className="rounded-2xl p-6"
              style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(6, 182, 212, 0.08) 100%)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
              }}
            >
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-xl font-bold text-white">{currentPlan.name}</h4>
                <span
                  className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider"
                  style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#34D399',
                  }}
                >
                  Selected
                </span>
              </div>
              <div className="grid grid-cols-3 gap-0">
                <div className="text-center py-4 px-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Monthly Subscription</p>
                  <p className="text-2xl font-bold text-white">RM {currentPlan.baseFee.toLocaleString()}</p>
                </div>
                <div className="text-center py-4 px-2 border-x border-slate-700/50">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Per MC Fee</p>
                  <p className="text-2xl font-bold text-white">RM {currentPlan.mcFee.toFixed(2)}</p>
                </div>
                <div className="text-center py-4 px-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Billing Cycle</p>
                  <p className="text-2xl font-bold text-white">Monthly</p>
                </div>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="p-8 border-b border-slate-700/50">
            <h3 className="text-lg font-bold text-white mb-6">Terms and Conditions</h3>
            <div
              className="rounded-2xl p-6 max-h-72 overflow-y-auto custom-scrollbar"
              style={{
                background: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid rgba(71, 85, 105, 0.4)',
              }}
            >
              <div className="space-y-4">
                {[
                  { num: '1', title: 'Service Provision', content: 'Sarawak MedChain agrees to provide blockchain-based medical certificate verification services, including dedicated node access, unlimited doctor accounts, and QR verification capabilities.' },
                  { num: '2', title: 'Payment Terms', content: 'Client agrees to maintain a positive credit balance. Monthly subscription is due on the 1st of each month. MC fees are deducted per issuance from the prepaid credit balance.' },
                  { num: '3', title: 'Data Protection', content: "Both parties agree to comply with Malaysia's Personal Data Protection Act 2010 (PDPA). All medical data is encrypted using AES-256-GCM and stored in compliance with healthcare regulations." },
                  { num: '4', title: 'Service Level', content: 'Provider guarantees 99.9% uptime for the blockchain network. Scheduled maintenance will be communicated 48 hours in advance.' },
                  { num: '5', title: 'Termination', content: 'Either party may terminate with 30 days written notice. No refunds for partial months. All data export will be provided upon termination request.' },
                  { num: '6', title: 'Liability', content: "Provider's liability is limited to the value of services paid in the preceding 12 months." },
                  { num: '7', title: 'Governing Law', content: 'This agreement is governed by the laws of Malaysia and subject to the jurisdiction of Sarawak courts.' },
                ].map((term, idx) => (
                  <div key={idx} className="pb-4 border-b border-slate-700/30 last:border-0 last:pb-0">
                    <p style={{ lineHeight: '1.6' }} className="text-sm text-slate-300">
                      <span className="text-white font-bold">{term.num}. {term.title}:</span>{' '}
                      {term.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Signatory Details */}
          <div className="p-8 border-b border-slate-700/50">
            <h3 className="text-lg font-bold text-white mb-6">Authorized Signatory</h3>
            <div
              className="rounded-2xl p-6"
              style={{
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px solid rgba(71, 85, 105, 0.3)',
              }}
            >
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Full Name</label>
                  <input
                    type="text"
                    value={formData.ceoName}
                    onChange={(e) => setFormData({ ...formData, ceoName: e.target.value })}
                    placeholder="Full legal name"
                    className="w-full rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none transition-all"
                    style={{
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(71, 85, 105, 0.5)',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = MEDCHAIN_BLUE;
                      e.target.style.boxShadow = `0 0 0 3px ${MEDCHAIN_BLUE}20`;
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(71, 85, 105, 0.5)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Title / Position</label>
                  <input
                    type="text"
                    value={formData.ceoTitle}
                    onChange={(e) => setFormData({ ...formData, ceoTitle: e.target.value })}
                    placeholder="e.g., Chief Executive Officer"
                    className="w-full rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none transition-all"
                    style={{
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(71, 85, 105, 0.5)',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = MEDCHAIN_BLUE;
                      e.target.style.boxShadow = `0 0 0 3px ${MEDCHAIN_BLUE}20`;
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(71, 85, 105, 0.5)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Signature Pad */}
          <div className="p-8 border-b border-slate-700/50 relative">
            <h3 className="text-lg font-bold text-white mb-2">Digital Signature</h3>
            <p className="text-sm text-slate-400 mb-6">Please sign in the box below using your mouse or touchscreen</p>

            <div
              ref={signatureContainerRef}
              className="rounded-2xl p-3 mb-4 w-full relative overflow-hidden"
              style={{
                width: '100%',
                border: `2px solid ${MEDCHAIN_GOLD}40`,
                boxSizing: 'border-box',
                backgroundColor: '#0f172a',
                boxShadow: `inset 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 1px ${MEDCHAIN_GOLD}10`
              }}
            >
              <SignatureCanvas
                ref={signaturePadRef}
                canvasProps={{
                  className: 'signature-canvas rounded-lg cursor-crosshair',
                  style: {
                    width: '100%',
                    height: '180px',
                    display: 'block',
                    touchAction: 'none'
                  }
                }}
                backgroundColor="#0f172a"
                penColor={MEDCHAIN_GOLD}
                onEnd={checkSignature}
              />

              {/* Signature Success Animation Overlay */}
              {showSignatureSuccess && (
                <div
                  className="absolute inset-0 flex items-center justify-center z-10"
                  style={{
                    backgroundColor: 'rgba(6, 78, 59, 0.97)',
                    animation: 'fadeInScale 0.5s ease-out forwards'
                  }}
                >
                  <div className="flex flex-col items-center justify-center text-center px-4">
                    {/* Animated Checkmark with Glow */}
                    <div
                      className="relative mb-6"
                      style={{
                        filter: 'drop-shadow(0 0 20px rgba(16, 185, 129, 0.8)) drop-shadow(0 0 40px rgba(16, 185, 129, 0.5))'
                      }}
                    >
                      <svg
                        width="80"
                        height="80"
                        viewBox="0 0 52 52"
                        style={{
                          animation: 'checkmarkCircle 0.6s ease-in-out forwards'
                        }}
                      >
                        <circle
                          cx="26"
                          cy="26"
                          r="23"
                          fill="none"
                          stroke="#10B981"
                          strokeWidth="3"
                          style={{
                            strokeDasharray: 166,
                            strokeDashoffset: 166,
                            animation: 'strokeDraw 0.6s ease-in-out forwards'
                          }}
                        />
                        <path
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14 27l7 7 16-16"
                          style={{
                            strokeDasharray: 48,
                            strokeDashoffset: 48,
                            animation: 'strokeDraw 0.4s 0.4s ease-in-out forwards'
                          }}
                        />
                      </svg>
                    </div>
                    <h4 className="text-white text-2xl font-bold mb-2 tracking-tight">Node Authorization Successful</h4>
                    <p className="text-emerald-300/80 text-sm font-medium">Miri Hospital Node Online</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={clearSignature}
                className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all"
                style={{
                  background: 'rgba(71, 85, 105, 0.3)',
                  border: '1px solid rgba(71, 85, 105, 0.5)',
                  color: '#94A3B8',
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(71, 85, 105, 0.5)';
                  e.target.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(71, 85, 105, 0.3)';
                  e.target.style.color = '#94A3B8';
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear Signature
              </button>
              {hasSignature && (
                <span
                  className="text-sm font-medium flex items-center gap-2 px-4 py-2 rounded-xl"
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34D399',
                  }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Signature captured
                </span>
              )}
            </div>

            {/* CSS Keyframe Animations & Global Background Unity */}
            <style>{`
              /* Perfect Background Unity - #0a0e14 everywhere */
              html, body, #root {
                background-color: #0a0e14 !important;
              }

              /* Custom Scrollbar for Terms */
              .custom-scrollbar::-webkit-scrollbar {
                width: 6px;
              }
              .custom-scrollbar::-webkit-scrollbar-track {
                background: rgba(30, 41, 59, 0.3);
                border-radius: 3px;
              }
              .custom-scrollbar::-webkit-scrollbar-thumb {
                background: rgba(71, 85, 105, 0.6);
                border-radius: 3px;
              }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                background: rgba(100, 116, 139, 0.8);
              }

              @keyframes fadeInScale {
                0% { opacity: 0; transform: scale(0.8); }
                100% { opacity: 1; transform: scale(1); }
              }
              @keyframes strokeDraw {
                to { stroke-dashoffset: 0; }
              }
              @keyframes checkmarkCircle {
                0% { transform: scale(0); opacity: 0; }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); opacity: 1; }
              }
            `}</style>
          </div>

          {/* Agreement Checkbox */}
          <div className="p-8">
            <label
              className="flex items-start gap-4 cursor-pointer group p-5 rounded-2xl transition-all"
              style={{
                background: agreedToTerms ? 'rgba(16, 185, 129, 0.08)' : 'rgba(30, 41, 59, 0.3)',
                border: agreedToTerms ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(71, 85, 105, 0.3)',
              }}
            >
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
                style={{
                  background: agreedToTerms ? MEDCHAIN_GREEN : 'rgba(15, 23, 42, 0.8)',
                  border: agreedToTerms ? 'none' : '2px solid rgba(71, 85, 105, 0.6)',
                }}
              >
                {agreedToTerms && (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="sr-only"
              />
              <span className="text-slate-300 text-sm leading-relaxed">
                I, <strong className="text-white">{formData.ceoName || '[Signatory Name]'}</strong>, as the authorized representative of <strong className="text-white">{formData.hospitalName || '[Hospital Name]'}</strong>, have read, understood, and agree to be bound by the terms and conditions outlined in this Digital Service Agreement. I confirm that I have the authority to enter into this agreement on behalf of the organization.
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <div className="p-8 pt-0">
            <button
              onClick={handleSubmit}
              disabled={!hasSignature || !agreedToTerms || !formData.hospitalName || !formData.ceoName || isSubmitting}
              className="w-full py-4 rounded-2xl font-bold text-white text-lg transition-all transform disabled:cursor-not-allowed flex items-center justify-center gap-3"
              style={{
                background: hasSignature && agreedToTerms
                  ? `linear-gradient(135deg, ${MEDCHAIN_BLUE} 0%, ${MEDCHAIN_GREEN} 100%)`
                  : 'rgba(55, 65, 81, 0.5)',
                boxShadow: hasSignature && agreedToTerms
                  ? `0 8px 32px ${MEDCHAIN_BLUE}40, 0 0 0 1px rgba(255,255,255,0.1) inset`
                  : 'none',
                opacity: (!hasSignature || !agreedToTerms || !formData.hospitalName || !formData.ceoName) ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (hasSignature && agreedToTerms && formData.hospitalName && formData.ceoName && !isSubmitting) {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = `0 12px 40px ${MEDCHAIN_BLUE}50, 0 0 0 1px rgba(255,255,255,0.15) inset`;
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                if (hasSignature && agreedToTerms) {
                  e.target.style.boxShadow = `0 8px 32px ${MEDCHAIN_BLUE}40, 0 0 0 1px rgba(255,255,255,0.1) inset`;
                }
              }}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing Agreement...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Sign Agreement & Activate
                </>
              )}
            </button>

            {(!hasSignature || !agreedToTerms) && (
              <p className="text-center text-slate-500 text-sm mt-4">
                {!hasSignature && !agreedToTerms
                  ? 'Please sign above and accept the terms to continue'
                  : !hasSignature
                  ? 'Please provide your signature above'
                  : 'Please accept the terms and conditions'}
              </p>
            )}
          </div>
        </div>

        {/* QR Code - Scan to Verify/Authorize */}
        <div className="mt-12 flex flex-col items-center pb-8">
          {/* QR Code Container with Glow Animation */}
          <div
            className="relative p-1 rounded-3xl qr-glow-container"
            style={{
              background: 'linear-gradient(135deg, rgba(0, 102, 204, 0.3) 0%, rgba(16, 185, 129, 0.3) 100%)',
            }}
          >
            <div
              className="relative p-5 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              {/* Corner Brackets for Scan Effect */}
              <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-blue-400/60 rounded-tl"></div>
              <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-blue-400/60 rounded-tr"></div>
              <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-emerald-400/60 rounded-bl"></div>
              <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-emerald-400/60 rounded-br"></div>

              <QRCodeSVG
                value={authorizationUrl}
                size={160}
                level="H"
                bgColor="transparent"
                fgColor="#ffffff"
                imageSettings={{
                  src: '',
                  height: 0,
                  width: 0,
                  excavate: true,
                }}
              />

              {/* MedChain Shield Logo Overlay - Centered */}
              <div
                className="absolute pointer-events-none"
                style={{
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #0066CC 0%, #003366 100%)',
                    boxShadow: '0 4px 16px rgba(0, 102, 204, 0.5), 0 0 0 2px rgba(255,255,255,0.1)',
                  }}
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Document ID Badge */}
          <div
            className="mt-4 px-4 py-2 rounded-xl flex items-center gap-2"
            style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(71, 85, 105, 0.4)',
            }}
          >
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-mono text-slate-400">{documentId}</span>
          </div>

          <p className="mt-3 text-slate-500 text-xs font-medium tracking-wider uppercase">
            Scan to verify document authenticity
          </p>

          {/* QR Glow Animation Styles */}
          <style>{`
            .qr-glow-container {
              animation: qrGlow 3s ease-in-out infinite;
            }
            @keyframes qrGlow {
              0%, 100% {
                box-shadow: 0 0 20px rgba(0, 102, 204, 0.3), 0 0 40px rgba(0, 102, 204, 0.1);
              }
              50% {
                box-shadow: 0 0 30px rgba(16, 185, 129, 0.4), 0 0 60px rgba(16, 185, 129, 0.15);
              }
            }
          `}</style>
        </div>

        {/* Export Official PDF Button */}
        <div className="mt-4 flex justify-center pb-12">
          <button
            onClick={() => window.print()}
            className="px-6 py-3 rounded-xl font-medium text-sm flex items-center gap-3 transition-all"
            style={{
              background: 'rgba(30, 41, 59, 0.5)',
              border: '1px solid rgba(71, 85, 105, 0.4)',
              color: '#94A3B8',
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(30, 41, 59, 0.8)';
              e.target.style.borderColor = 'rgba(100, 116, 139, 0.6)';
              e.target.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(30, 41, 59, 0.5)';
              e.target.style.borderColor = 'rgba(71, 85, 105, 0.4)';
              e.target.style.color = '#94A3B8';
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Export Official PDF
          </button>
        </div>
      </div>
    </div>
  );
}
