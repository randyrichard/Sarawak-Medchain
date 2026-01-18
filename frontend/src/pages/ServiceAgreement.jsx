/**
 * Digital Service Agreement (DSA) Module
 * Professional contract signing for hospital onboarding
 */

import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';

const MEDCHAIN_BLUE = '#0066CC';
const MEDCHAIN_DARK = '#003366';

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
  const [signatureComplete, setSignatureComplete] = useState(false);
  const [agreementRef, setAgreementRef] = useState('');

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
    }
  };

  // Check if signature exists
  const checkSignature = () => {
    if (signaturePadRef.current) {
      setHasSignature(!signaturePadRef.current.isEmpty());
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
      setAgreementRef(ref);

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

      setSignatureComplete(true);
    } catch (error) {
      console.error('Error processing agreement:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate and download PDF
  const downloadPDF = () => {
    // For demo, we'll create a simple printable version
    const printWindow = window.open('', '_blank');
    const signatureData = signaturePadRef.current?.toDataURL('image/png') || '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Digital Service Agreement - ${formData.hospitalName}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #1a1a2e; line-height: 1.6; }
          .header { text-align: center; border-bottom: 3px solid ${MEDCHAIN_BLUE}; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { color: ${MEDCHAIN_BLUE}; margin: 0; font-size: 28px; }
          .header p { color: #666; margin: 5px 0 0 0; }
          .ref { background: #f5f5f5; padding: 10px 20px; border-radius: 8px; text-align: center; margin-bottom: 30px; }
          .ref span { font-weight: bold; color: ${MEDCHAIN_BLUE}; }
          .section { margin-bottom: 25px; }
          .section h2 { color: ${MEDCHAIN_DARK}; font-size: 16px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
          .parties { display: flex; justify-content: space-between; gap: 40px; }
          .party { flex: 1; }
          .party h3 { color: ${MEDCHAIN_BLUE}; font-size: 14px; margin-bottom: 10px; }
          .party p { margin: 5px 0; font-size: 14px; }
          .terms { background: #fafafa; padding: 20px; border-radius: 8px; font-size: 13px; }
          .terms ol { padding-left: 20px; }
          .terms li { margin-bottom: 10px; }
          .pricing { background: ${MEDCHAIN_BLUE}10; padding: 20px; border-radius: 8px; border-left: 4px solid ${MEDCHAIN_BLUE}; }
          .pricing-row { display: flex; justify-content: space-between; margin: 10px 0; }
          .pricing-label { color: #666; }
          .pricing-value { font-weight: bold; color: ${MEDCHAIN_DARK}; }
          .signature-section { margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee; }
          .signature-box { display: flex; justify-content: space-between; gap: 60px; margin-top: 30px; }
          .signature-party { flex: 1; }
          .signature-party h4 { font-size: 12px; color: #666; margin-bottom: 10px; text-transform: uppercase; }
          .signature-line { border-bottom: 1px solid #333; height: 60px; margin-bottom: 10px; display: flex; align-items: flex-end; justify-content: center; }
          .signature-line img { max-height: 50px; max-width: 200px; }
          .signature-name { font-weight: bold; }
          .signature-title { color: #666; font-size: 13px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>SARAWAK MEDCHAIN</h1>
          <p>Digital Service Agreement</p>
        </div>

        <div class="ref">
          Agreement Reference: <span>${agreementRef}</span> | Version: ${CONTRACT_VERSION} | Date: ${EFFECTIVE_DATE}
        </div>

        <div class="section">
          <h2>PARTIES TO THIS AGREEMENT</h2>
          <div class="parties">
            <div class="party">
              <h3>Service Provider</h3>
              <p><strong>Sarawak MedChain Sdn Bhd</strong></p>
              <p>Level 15, Wisma Saberkas</p>
              <p>Jalan Tun Abang Haji Openg</p>
              <p>93000 Kuching, Sarawak</p>
              <p>Registration: 202401012345</p>
            </div>
            <div class="party">
              <h3>Client (Hospital/Clinic)</h3>
              <p><strong>${formData.hospitalName}</strong></p>
              <p>${formData.address || 'Address on file'}</p>
              <p>Registration: ${formData.registrationNumber || 'On file'}</p>
              <p>Contact: ${formData.email || 'On file'}</p>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>SERVICE PLAN</h2>
          <div class="pricing">
            <div class="pricing-row">
              <span class="pricing-label">Selected Plan:</span>
              <span class="pricing-value">${currentPlan.name}</span>
            </div>
            <div class="pricing-row">
              <span class="pricing-label">Monthly Subscription:</span>
              <span class="pricing-value">RM ${currentPlan.baseFee.toLocaleString()}/month</span>
            </div>
            <div class="pricing-row">
              <span class="pricing-label">Per MC Fee:</span>
              <span class="pricing-value">RM ${currentPlan.mcFee.toFixed(2)} per certificate</span>
            </div>
            <div class="pricing-row">
              <span class="pricing-label">Billing Cycle:</span>
              <span class="pricing-value">Monthly (1st of each month)</span>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>TERMS AND CONDITIONS</h2>
          <div class="terms">
            <ol>
              <li><strong>Service Provision:</strong> Sarawak MedChain agrees to provide blockchain-based medical certificate verification services, including dedicated node access, unlimited doctor accounts, and QR verification capabilities.</li>
              <li><strong>Payment Terms:</strong> Client agrees to maintain a positive credit balance. Monthly subscription is due on the 1st of each month. MC fees are deducted per issuance.</li>
              <li><strong>Data Protection:</strong> Both parties agree to comply with Malaysia's Personal Data Protection Act 2010 (PDPA). All medical data is encrypted and stored in compliance with healthcare regulations.</li>
              <li><strong>Service Level:</strong> Provider guarantees 99.9% uptime for the blockchain network. Scheduled maintenance will be communicated 48 hours in advance.</li>
              <li><strong>Termination:</strong> Either party may terminate with 30 days written notice. No refunds for partial months. All data export will be provided upon termination.</li>
              <li><strong>Liability:</strong> Provider's liability is limited to the value of services paid in the preceding 12 months.</li>
              <li><strong>Governing Law:</strong> This agreement is governed by the laws of Malaysia and subject to the jurisdiction of Sarawak courts.</li>
            </ol>
          </div>
        </div>

        <div class="signature-section">
          <h2>SIGNATURES</h2>
          <p style="font-size: 13px; color: #666;">By signing below, both parties agree to the terms and conditions outlined in this Digital Service Agreement.</p>

          <div class="signature-box">
            <div class="signature-party">
              <h4>For Sarawak MedChain Sdn Bhd</h4>
              <div class="signature-line">
                <span style="font-style: italic; color: #999;">[System Authorized]</span>
              </div>
              <p class="signature-name">Digital Authorization</p>
              <p class="signature-title">Automated Contract System</p>
              <p style="font-size: 11px; color: #999;">Date: ${EFFECTIVE_DATE}</p>
            </div>
            <div class="signature-party">
              <h4>For ${formData.hospitalName}</h4>
              <div class="signature-line">
                ${signatureData ? `<img src="${signatureData}" alt="Signature" />` : ''}
              </div>
              <p class="signature-name">${formData.ceoName}</p>
              <p class="signature-title">${formData.ceoTitle}</p>
              <p style="font-size: 11px; color: #999;">Date: ${EFFECTIVE_DATE}</p>
            </div>
          </div>
        </div>

        <div class="footer">
          <p>This is a legally binding digital agreement. A copy has been sent to both parties.</p>
          <p>Sarawak MedChain Sdn Bhd | billing@sarawakmedchain.com | +60 82-123456</p>
          <p>Agreement ID: ${agreementRef} | Generated: ${new Date().toISOString()}</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Success Screen
  if (signatureComplete) {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-emerald-500/30 rounded-3xl p-8 text-center">
            {/* Success Icon */}
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center">
              <svg className="w-12 h-12 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h1 className="text-3xl font-black text-white mb-2">Agreement Signed Successfully!</h1>
            <p className="text-slate-400 mb-6">Welcome to the Sarawak MedChain network</p>

            {/* Agreement Reference */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6">
              <p className="text-sm text-slate-400 mb-1">Agreement Reference</p>
              <p className="text-xl font-mono font-bold text-emerald-400">{agreementRef}</p>
            </div>

            {/* Summary */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-8 text-left">
              <h3 className="font-bold text-white mb-4">Agreement Summary</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Hospital:</span>
                  <span className="text-white font-medium">{formData.hospitalName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Signatory:</span>
                  <span className="text-white font-medium">{formData.ceoName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Plan:</span>
                  <span className="text-white font-medium">{currentPlan.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Monthly Fee:</span>
                  <span className="text-white font-medium">RM {currentPlan.baseFee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Per MC Fee:</span>
                  <span className="text-white font-medium">RM {currentPlan.mcFee.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={downloadPDF}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold rounded-xl hover:from-blue-500 hover:to-cyan-500 transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Agreement PDF
              </button>

              <button
                onClick={() => navigate('/connect')}
                className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold rounded-xl hover:from-emerald-500 hover:to-emerald-600 transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Connect Wallet & Top Up
              </button>

              <button
                onClick={() => navigate('/pitch')}
                className="w-full py-3 text-slate-400 hover:text-white transition-colors text-sm"
              >
                Return to Pitch Deck
              </button>
            </div>

            {/* Next Steps */}
            <div className="mt-8 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-left">
              <h4 className="font-bold text-amber-400 mb-2 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Next Steps
              </h4>
              <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside">
                <li>Connect your MetaMask wallet to activate your hospital node</li>
                <li>Top up your credit balance (minimum RM 1,000)</li>
                <li>Add your first verified doctor</li>
                <li>Start issuing blockchain-secured MCs!</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712]">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
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
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded-full text-blue-400 text-xs font-bold">
              {CONTRACT_VERSION}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="text-center mb-12">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold text-emerald-400 bg-emerald-500/20 mb-4">
            DIGITAL SERVICE AGREEMENT
          </span>
          <h1 className="text-4xl font-black text-white mb-2">Service Agreement</h1>
          <p className="text-slate-400">Please review and sign to activate your hospital node</p>
        </div>

        {/* Contract Form */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 rounded-3xl overflow-hidden">
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
          <div className="p-8 border-b border-slate-700/50">
            <h3 className="text-lg font-bold text-white mb-2">Digital Signature</h3>
            <p className="text-sm text-slate-400 mb-6">Please sign in the box below using your mouse or touchscreen</p>

            <div className="bg-white rounded-xl p-2 mb-4">
              <SignatureCanvas
                ref={signaturePadRef}
                canvasProps={{
                  className: 'signature-canvas w-full h-40 rounded-lg cursor-crosshair',
                  style: { width: '100%', height: '160px' }
                }}
                backgroundColor="white"
                penColor="#003366"
                onEnd={checkSignature}
              />
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
                <span className="text-emerald-400 text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Signature captured
                </span>
              )}
            </div>
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
      </div>
    </div>
  );
}
