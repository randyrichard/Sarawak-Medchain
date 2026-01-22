/**
 * Digital Service Agreement (DSA) Module
 * Professional contract signing for hospital onboarding
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { QRCodeSVG } from 'qrcode.react';

// Live demo URL for mobile preview (Councilor View / Miri-focused map)
// Using local network IP for same-WiFi mobile access
const DEMO_URL = 'http://192.168.0.163:5173/gov-preview';

const MEDCHAIN_BLUE = '#0066CC';
const MEDCHAIN_DARK = '#003366';
const MEDCHAIN_GOLD = '#D4A017'; // Prestigious gold for signatures

// Contract template
const CONTRACT_VERSION = 'DSA-2026-001';
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
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0a0e14' }}>
      {/* Header */}
      <header className="sticky top-0 z-50 w-full" style={{ backgroundColor: '#0a0e14', borderBottom: '1px solid rgba(51, 65, 85, 0.3)' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }} className="px-6 py-4 flex items-center justify-between">
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

      <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column' }} className="w-full px-6 pt-[50px] pb-12">
        {/* Referral Banner */}
        {referralCode && (
          <div className="mb-8 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <span className="text-xl">🎁</span>
              </div>
              <div>
                <p className="text-emerald-400 font-semibold">You were referred by a partner hospital!</p>
                <p className="text-slate-400 text-sm">
                  Referral Code: <span className="font-mono text-emerald-300">{referralCode}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Title */}
        <div className="text-center mb-12">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold text-emerald-400 bg-emerald-500/20 mb-4">
            DIGITAL SERVICE AGREEMENT
          </span>
          <h1 className="text-4xl font-black text-white mb-2">Service Agreement</h1>
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
          <div className="p-8 border-b border-slate-700/50" style={{ background: `linear-gradient(135deg, ${MEDCHAIN_BLUE}10, ${MEDCHAIN_DARK}05)` }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">Sarawak MedChain Service Agreement</h2>
                <p className="text-slate-400 mt-1">Blockchain Medical Certificate Verification Services</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-400">Effective Date</p>
                <p className="text-white font-semibold">{EFFECTIVE_DATE}</p>
              </div>
            </div>
          </div>

          {/* Parties */}
          <div className="p-8 border-b border-slate-700/50">
            <h3 className="text-lg font-bold text-white mb-6">Parties to this Agreement</h3>
            <div className="grid md:grid-cols-2 gap-8">
              {/* Provider */}
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-3">Service Provider</p>
                <p className="text-lg font-bold text-white">Sarawak MedChain Sdn Bhd</p>
                <p className="text-sm text-slate-400 mt-2">Level 15, Wisma Saberkas</p>
                <p className="text-sm text-slate-400">Jalan Tun Abang Haji Openg</p>
                <p className="text-sm text-slate-400">93000 Kuching, Sarawak</p>
              </div>

              {/* Client */}
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3">Client (Hospital/Clinic)</p>
                <input
                  type="text"
                  value={formData.hospitalName}
                  onChange={(e) => setFormData({ ...formData, hospitalName: e.target.value })}
                  placeholder="Hospital / Clinic Name"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white text-lg font-bold mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Business Address"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Selected Plan */}
          <div className="p-8 border-b border-slate-700/50">
            <h3 className="text-lg font-bold text-white mb-6">Selected Service Plan</h3>
            <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xl font-bold text-white">{currentPlan.name}</h4>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-bold">Selected</span>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-slate-400">Monthly Subscription</p>
                  <p className="text-2xl font-black text-white">RM {currentPlan.baseFee.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Per MC Fee</p>
                  <p className="text-2xl font-black text-white">RM {currentPlan.mcFee.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Billing Cycle</p>
                  <p className="text-2xl font-black text-white">Monthly</p>
                </div>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="p-8 border-b border-slate-700/50">
            <h3 className="text-lg font-bold text-white mb-6">Terms and Conditions</h3>
            <div className="bg-slate-800/30 rounded-xl p-6 max-h-64 overflow-y-auto text-sm text-slate-300 space-y-4">
              <p><strong className="text-white">1. Service Provision:</strong> Sarawak MedChain agrees to provide blockchain-based medical certificate verification services, including dedicated node access, unlimited doctor accounts, and QR verification capabilities.</p>
              <p><strong className="text-white">2. Payment Terms:</strong> Client agrees to maintain a positive credit balance. Monthly subscription is due on the 1st of each month. MC fees are deducted per issuance from the prepaid credit balance.</p>
              <p><strong className="text-white">3. Data Protection:</strong> Both parties agree to comply with Malaysia's Personal Data Protection Act 2010 (PDPA). All medical data is encrypted using AES-256-GCM and stored in compliance with healthcare regulations.</p>
              <p><strong className="text-white">4. Service Level:</strong> Provider guarantees 99.9% uptime for the blockchain network. Scheduled maintenance will be communicated 48 hours in advance.</p>
              <p><strong className="text-white">5. Termination:</strong> Either party may terminate with 30 days written notice. No refunds for partial months. All data export will be provided upon termination request.</p>
              <p><strong className="text-white">6. Liability:</strong> Provider's liability is limited to the value of services paid in the preceding 12 months.</p>
              <p><strong className="text-white">7. Governing Law:</strong> This agreement is governed by the laws of Malaysia and subject to the jurisdiction of Sarawak courts.</p>
            </div>
          </div>

          {/* Signatory Details */}
          <div className="p-8 border-b border-slate-700/50">
            <h3 className="text-lg font-bold text-white mb-6">Authorized Signatory</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Full Name</label>
                <input
                  type="text"
                  value={formData.ceoName}
                  onChange={(e) => setFormData({ ...formData, ceoName: e.target.value })}
                  placeholder="Full legal name"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Title / Position</label>
                <input
                  type="text"
                  value={formData.ceoTitle}
                  onChange={(e) => setFormData({ ...formData, ceoTitle: e.target.value })}
                  placeholder="e.g., Chief Executive Officer"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Signature Pad */}
          <div className="p-8 border-b border-slate-700/50 relative">
            <h3 className="text-lg font-bold text-white mb-2">Digital Signature</h3>
            <p className="text-sm text-slate-400 mb-6">Please sign in the box below using your mouse or touchscreen</p>

            <div
              ref={signatureContainerRef}
              className="rounded-xl p-3 mb-4 w-full relative overflow-hidden"
              style={{
                width: '100%',
                border: `2px dashed ${MEDCHAIN_GOLD}`,
                boxSizing: 'border-box',
                backgroundColor: '#0f172a'
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
                  className="absolute inset-0 flex items-center justify-center z-10 animate-fade-in"
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.95)',
                    animation: 'fadeInScale 0.5s ease-out forwards'
                  }}
                >
                  <div className="text-center">
                    {/* Animated Checkmark */}
                    <div className="relative w-20 h-20 mx-auto mb-4">
                      <svg
                        className="w-20 h-20 text-white"
                        viewBox="0 0 52 52"
                        style={{
                          animation: 'checkmarkCircle 0.6s ease-in-out forwards'
                        }}
                      >
                        <circle
                          className="stroke-current"
                          cx="26"
                          cy="26"
                          r="23"
                          fill="none"
                          strokeWidth="3"
                          style={{
                            strokeDasharray: 166,
                            strokeDashoffset: 166,
                            animation: 'strokeDraw 0.6s ease-in-out forwards'
                          }}
                        />
                        <path
                          className="stroke-current"
                          fill="none"
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
                    <h4 className="text-white text-xl font-bold mb-1">Node Authorization Successful</h4>
                    <p className="text-emerald-100 text-sm font-medium">Miri Hospital Node Online</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={clearSignature}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear Signature
              </button>
              {hasSignature && (
                <span className="text-amber-400 text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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

              /* Remove any seams or lines */
              * {
                border-color: transparent;
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
            <label className="flex items-start gap-4 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="w-5 h-5 mt-1 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
              />
              <span className="text-slate-300 text-sm">
                I, <strong className="text-white">{formData.ceoName || '[Signatory Name]'}</strong>, as the authorized representative of <strong className="text-white">{formData.hospitalName || '[Hospital Name]'}</strong>, have read, understood, and agree to be bound by the terms and conditions outlined in this Digital Service Agreement. I confirm that I have the authority to enter into this agreement on behalf of the organization.
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <div className="p-8 pt-0">
            <button
              onClick={handleSubmit}
              disabled={!hasSignature || !agreedToTerms || !formData.hospitalName || !formData.ceoName || isSubmitting}
              className="w-full py-4 rounded-xl font-bold text-white text-lg transition-all transform hover:scale-[1.01] disabled:opacity-50 disabled:transform-none flex items-center justify-center gap-3"
              style={{
                background: hasSignature && agreedToTerms
                  ? `linear-gradient(135deg, ${MEDCHAIN_BLUE}, ${MEDCHAIN_DARK})`
                  : '#374151',
                boxShadow: hasSignature && agreedToTerms ? `0 10px 40px ${MEDCHAIN_BLUE}30` : 'none',
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

        {/* QR Code - Scan to Preview */}
        <div className="mt-12 flex flex-col items-center pb-8">
          <div
            className="relative bg-white p-5 rounded-2xl"
            style={{
              boxShadow: '0 10px 40px rgba(0, 102, 204, 0.2)',
            }}
          >
            <QRCodeSVG
              value={DEMO_URL}
              size={160}
              level="H"
              bgColor="#ffffff"
              fgColor="#003366"
            />
            {/* MedChain Gold Shield Overlay - Centered */}
            <div
              className="absolute pointer-events-none"
              style={{
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)'
              }}
            >
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center border-2 border-white"
                style={{
                  background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.5)',
                }}
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
          </div>
          <p className="mt-4 text-slate-400 text-sm font-medium tracking-wide">
            Scan to authorize mobile node access
          </p>
        </div>

        {/* Export Official PDF Button */}
        <div className="mt-8 flex justify-center pb-8">
          <button
            onClick={() => window.print()}
            className="px-6 py-3 rounded-xl font-semibold text-slate-300 border-2 border-slate-600 hover:border-slate-400 hover:text-white transition-all flex items-center gap-3 cursor-pointer"
            style={{ background: 'transparent' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Export Official PDF
          </button>
        </div>
      </div>
    </div>
  );
}
