import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const MALAYSIAN_BANKS = [
  { code: 'MBB', name: 'Maybank2u', logo: '🏦' },
  { code: 'CIMB', name: 'CIMB Clicks', logo: '🏛️' },
  { code: 'PBB', name: 'Public Bank', logo: '🏢' },
  { code: 'RHB', name: 'RHB Now', logo: '🏬' },
  { code: 'HLB', name: 'Hong Leong Connect', logo: '🏗️' },
  { code: 'AMB', name: 'AmOnline', logo: '🏘️' },
  { code: 'BIMB', name: 'Bank Islam', logo: '🕌' },
  { code: 'BSN', name: 'myBSN', logo: '🏠' },
  { code: 'OCBC', name: 'OCBC Online', logo: '🏙️' },
  { code: 'SCB', name: 'Standard Chartered', logo: '🌐' },
  { code: 'UOB', name: 'UOB Internet Banking', logo: '🏨' },
  { code: 'AFFIN', name: 'Affin Online', logo: '🏪' },
];

// WEALTH 2026 DEMO: Sub-500ms total processing for instant feel on 4G
const PROCESSING_STEPS = [
  { title: 'Connecting to FPX Gateway', icon: '🔗', duration: 60 },
  { title: 'Redirecting to Bank', icon: '🏦', duration: 80 },
  { title: 'Awaiting Authorization', icon: '🔐', duration: 100 },
  { title: 'Processing Payment', icon: '💳', duration: 80 },
  { title: 'Confirming Transaction', icon: '✅', duration: 60 },
];

export default function FPXPayment() {
  const navigate = useNavigate();
  const location = useLocation();

  // Get agreement data from navigation state or localStorage
  const [agreementData, setAgreementData] = useState(null);
  const [selectedBank, setSelectedBank] = useState(null);
  const [initialCredits, setInitialCredits] = useState(100);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [newBalance, setNewBalance] = useState(0); // Track new balance after top-up

  // Check if this is a top-up flow (from TopUpModal)
  const isTopUp = location.state?.isTopUp === true;
  const topUpAmount = location.state?.topUpAmount || 1000;

  // Check for pending payment recovery on page load
  useEffect(() => {
    const checkPendingPayment = async () => {
      const pendingTxn = localStorage.getItem('medchain_pending_fpx_txn');
      if (!pendingTxn) return;

      setIsRecovering(true);
      try {
        // Check with backend if payment was confirmed server-side
        const response = await fetch(`/api/webhook/fpx/status/${pendingTxn}`);
        const data = await response.json();

        if (data.success && data.found && data.status === 'confirmed') {
          // Payment was confirmed server-side, recover the activation
          if (data.activation) {
            // Restore hospital node from server-side activation
            const hospitalData = {
              ...data.activation,
              recoveredAt: new Date().toISOString(),
            };
            localStorage.setItem('medchain_hospital_node', JSON.stringify(hospitalData));

            // Clear pending transaction
            localStorage.removeItem('medchain_pending_fpx_txn');

            // Generate invoice from recovered data
            const recoveredInvoice = {
              invoiceNumber: `INV-${pendingTxn.slice(-8).toUpperCase()}`,
              date: data.payment?.timestamp || new Date().toISOString(),
              status: 'Paid',
              hospital: {
                name: data.activation.hospitalName,
                ceoEmail: data.payment?.hospitalEmail || 'ceo@hospital.com',
                financeEmail: 'finance@hospital.com',
              },
              items: [
                { description: 'Sarawak MedChain Enterprise Subscription (Monthly)', quantity: 1, unitPrice: 10000, amount: 10000 },
                { description: `Transaction Credits (${data.activation.credits?.balance || 100} credits)`, quantity: data.activation.credits?.balance || 100, unitPrice: 1, amount: data.activation.credits?.balance || 100 },
              ],
              subtotal: 10000 + (data.activation.credits?.balance || 100),
              sst: Math.round((10000 + (data.activation.credits?.balance || 100)) * 0.06),
              total: Math.round((10000 + (data.activation.credits?.balance || 100)) * 1.06),
              paymentMethod: 'FPX (Recovered)',
              transactionRef: pendingTxn,
              blockchainTxHash: data.payment?.blockchainTxHash || '0x' + 'a'.repeat(64),
              blockchainVerified: true,
              blockchainNetwork: 'Sarawak MedChain Network',
              blockNumber: Math.floor(Math.random() * 1000000) + 8000000,
            };
            setInvoiceData(recoveredInvoice);
            setPaymentComplete(true);

            // Add recovery alert for founder
            addFounderAlert({
              type: 'payment_recovered',
              title: 'Payment Recovered',
              message: `Payment for ${data.activation.hospitalName} was recovered after browser interruption`,
              priority: 'info',
            });
          }
        }
      } catch (error) {
        console.log('No pending payment to recover or backend unavailable');
      } finally {
        setIsRecovering(false);
      }
    };

    checkPendingPayment();
  }, []);

  useEffect(() => {
    // For top-up flow, use existing hospital data
    if (isTopUp) {
      const hospitalNode = localStorage.getItem('medchain_hospital_node');
      if (hospitalNode) {
        setAgreementData(JSON.parse(hospitalNode));
      } else {
        // Fallback to signed agreement or create minimal data
        const storedAgreement = localStorage.getItem('medchain_signed_agreement');
        if (storedAgreement) {
          setAgreementData(JSON.parse(storedAgreement));
        } else {
          // Use minimal data for top-up demo
          setAgreementData({
            hospitalName: 'Miri Hospital',
            ceoEmail: 'admin@hospital.com',
            signedAt: new Date().toISOString()
          });
        }
      }
      return;
    }

    // Subscription flow: get agreement data from location state first, then localStorage
    const stateData = location.state?.agreementData;
    const storedData = localStorage.getItem('medchain_signed_agreement');

    if (stateData) {
      setAgreementData(stateData);
    } else if (storedData) {
      setAgreementData(JSON.parse(storedData));
    } else {
      // No agreement found, redirect to agreement page
      navigate('/agreement');
    }
  }, [location.state, navigate, isTopUp]);

  const calculateTotal = () => {
    // Top-up flow: only the selected credit amount + SST
    if (isTopUp) {
      const creditCost = topUpAmount;
      return {
        baseFee: 0,
        creditCost,
        subtotal: creditCost,
        sst: Math.round(creditCost * 0.06), // 6% SST
        total: Math.round(creditCost * 1.06),
      };
    }

    // Subscription flow: base fee + credits + SST
    const baseFee = 10000; // RM 10,000 monthly subscription
    const creditCost = initialCredits * 1; // RM 1.00 per credit
    return {
      baseFee,
      creditCost,
      subtotal: baseFee + creditCost,
      sst: Math.round((baseFee + creditCost) * 0.06), // 6% SST
      total: Math.round((baseFee + creditCost) * 1.06),
    };
  };

  const pricing = calculateTotal();

  const handlePayment = async () => {
    if (!selectedBank) return;

    // Generate transaction ID upfront for recovery
    const transactionId = `FPX${Date.now()}`;

    // CRITICAL: Store pending transaction BEFORE starting payment
    // This allows recovery if browser closes during payment
    localStorage.setItem('medchain_pending_fpx_txn', transactionId);

    setIsProcessing(true);
    setCurrentStep(0);

    // Simulate FPX payment processing steps
    for (let i = 0; i < PROCESSING_STEPS.length; i++) {
      setCurrentStep(i);
      await new Promise(resolve => setTimeout(resolve, PROCESSING_STEPS[i].duration));
    }

    // WEALTH 2026 DEMO: Persistent server-side activation
    // This ensures RM 10,000 credits trigger even if user switches apps during demo
    try {
      await fetch('/api/webhook/fpx/success', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId,
          amount: pricing.total,
          hospitalId: transactionId,
          hospitalName: agreementData.hospitalName,
          hospitalEmail: agreementData.ceoEmail || agreementData.email,
          initialCredits,
          bankCode: selectedBank,
          bankName: MALAYSIAN_BANKS.find(b => b.code === selectedBank)?.name,
          // Full agreement data for persistent recovery
          agreementData: {
            ...agreementData,
            activatedCredits: initialCredits,
            subscriptionPlan: 'Enterprise',
            monthlyFee: 10000,
          },
        }),
      });
    } catch (error) {
      console.log('Backend webhook unavailable, continuing with local activation');
    }

    // Clear pending transaction after successful webhook call
    localStorage.removeItem('medchain_pending_fpx_txn');

    // Payment successful - update hospital node
    const invoice = generateInvoice();
    invoice.transactionRef = transactionId; // Use consistent transaction ID
    setInvoiceData(invoice);

    // Handle top-up vs new subscription differently
    if (isTopUp) {
      // Top-up flow: Add credits to existing balance
      const existingNode = JSON.parse(localStorage.getItem('medchain_hospital_node') || '{}');
      const currentBalance = existingNode.credits?.balance || 0;
      const updatedBalance = currentBalance + topUpAmount;
      setNewBalance(updatedBalance); // Store new balance for receipt
      const hospitalData = {
        ...existingNode,
        credits: {
          ...existingNode.credits,
          balance: updatedBalance,
          lastTopUp: new Date().toISOString(),
        },
      };
      localStorage.setItem('medchain_hospital_node', JSON.stringify(hospitalData));
    } else {
      // New subscription flow: Create new hospital node
      const hospitalData = {
        ...agreementData,
        status: 'Active',
        activatedAt: new Date().toISOString(),
        subscription: {
          plan: 'Enterprise',
          monthlyFee: 10000,
          creditsIncluded: initialCredits,
          nextBillingDate: getNextBillingDate(),
        },
        credits: {
          balance: initialCredits,
          lastTopUp: new Date().toISOString(),
        },
      };
      localStorage.setItem('medchain_hospital_node', JSON.stringify(hospitalData));
    }

    // Clear any critical alerts
    clearCriticalAlerts();

    // Store invoice
    const invoices = JSON.parse(localStorage.getItem('medchain_invoices') || '[]');
    invoices.unshift(invoice);
    localStorage.setItem('medchain_invoices', JSON.stringify(invoices));

    // Process referral reward if this hospital was referred
    processReferralReward(agreementData);

    // Add success alert for founder
    addFounderAlert({
      type: 'payment_received',
      title: 'Payment Received!',
      message: `${agreementData?.hospitalName || 'Hospital'} has completed FPX payment of RM ${pricing.total.toLocaleString()}`,
      priority: 'success',
    });

    setPaymentComplete(true);
    setIsProcessing(false);
  };

  const generateInvoice = () => {
    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
    // Generate blockchain transaction hash for verified payment
    const blockchainTxHash = '0x' + Array.from({ length: 64 }, () =>
      '0123456789abcdef'[Math.floor(Math.random() * 16)]
    ).join('');

    // Different items based on flow type
    const items = isTopUp
      ? [
          {
            description: `Credit Top-Up (${topUpAmount} credits @ RM 1.00)`,
            quantity: topUpAmount,
            unitPrice: 1,
            amount: topUpAmount,
          },
        ]
      : [
          {
            description: 'Sarawak MedChain Enterprise Subscription (Monthly)',
            quantity: 1,
            unitPrice: 10000,
            amount: 10000,
          },
          {
            description: `Initial Transaction Credits (${initialCredits} credits @ RM 1.00)`,
            quantity: initialCredits,
            unitPrice: 1,
            amount: initialCredits,
          },
        ];

    return {
      invoiceNumber,
      date: new Date().toISOString(),
      dueDate: new Date().toISOString(),
      status: 'Paid',
      isTopUp,
      hospital: {
        name: agreementData?.hospitalName || 'Hospital',
        address: agreementData?.hospitalAddress || '',
        registration: agreementData?.registrationNumber || '',
        ceoEmail: agreementData?.ceoEmail || agreementData?.email || 'ceo@hospital.com',
        financeEmail: agreementData?.financeEmail || 'finance@hospital.com',
      },
      items,
      subtotal: pricing.subtotal,
      sst: pricing.sst,
      total: pricing.total,
      paymentMethod: `FPX - ${MALAYSIAN_BANKS.find(b => b.code === selectedBank)?.name}`,
      transactionRef: `FPX${Date.now()}`,
      blockchainTxHash,
      blockchainVerified: true,
      blockchainNetwork: 'Sarawak MedChain Network',
      blockNumber: Math.floor(Math.random() * 1000000) + 8000000,
    };
  };

  const getNextBillingDate = () => {
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    return next.toISOString();
  };

  const clearCriticalAlerts = () => {
    const alerts = JSON.parse(localStorage.getItem('medchain_founder_alerts') || '[]');
    const filteredAlerts = alerts.filter(alert =>
      alert.type !== 'low_credit_balance' &&
      alert.type !== 'payment_pending'
    );
    localStorage.setItem('medchain_founder_alerts', JSON.stringify(filteredAlerts));
  };

  const addFounderAlert = (alert) => {
    const alerts = JSON.parse(localStorage.getItem('medchain_founder_alerts') || '[]');
    alerts.unshift({
      id: `alert-${Date.now()}`,
      ...alert,
      timestamp: new Date().toISOString(),
      read: false,
    });
    localStorage.setItem('medchain_founder_alerts', JSON.stringify(alerts));
  };

  // Process referral reward if this hospital was referred
  const processReferralReward = (agreement) => {
    const referralCode = agreement?.referralCode;
    if (!referralCode) return;

    const REFERRAL_REWARD = 1000; // 1,000 free MC credits

    // Get referral tracking data
    const referrals = JSON.parse(localStorage.getItem('medchain_referrals') || '{}');

    // Initialize referrer's stats if not exists
    if (!referrals[referralCode]) {
      referrals[referralCode] = { referred: [], totalEarned: 0, pendingRewards: 0 };
    }

    // Check if this hospital was already counted
    const alreadyReferred = referrals[referralCode].referred.some(
      r => r.hospitalName === agreement.hospitalName
    );
    if (alreadyReferred) return;

    // Add the referred hospital
    referrals[referralCode].referred.push({
      hospitalName: agreement.hospitalName,
      signedAt: agreement.signedAt,
      paidAt: new Date().toISOString(),
      rewardAmount: REFERRAL_REWARD,
    });
    referrals[referralCode].totalEarned += REFERRAL_REWARD;

    // Save updated referrals
    localStorage.setItem('medchain_referrals', JSON.stringify(referrals));

    // Update referrer's hospital node credits
    const pendingReferrals = JSON.parse(localStorage.getItem('medchain_pending_referrals') || '[]');
    const referralRecord = pendingReferrals.find(r => r.referrerCode === referralCode);

    if (referralRecord?.referrerWallet) {
      // Find and update the referrer's hospital node
      const allNodes = JSON.parse(localStorage.getItem('medchain_all_hospital_nodes') || '{}');
      if (allNodes[referralRecord.referrerWallet]) {
        allNodes[referralRecord.referrerWallet].credits.balance += REFERRAL_REWARD;
        allNodes[referralRecord.referrerWallet].credits.lastBonusAt = new Date().toISOString();
        localStorage.setItem('medchain_all_hospital_nodes', JSON.stringify(allNodes));
      }
    }

    // Add alert for founder about referral reward
    addFounderAlert({
      type: 'referral_reward',
      title: 'Referral Reward Credited!',
      message: `${REFERRAL_REWARD.toLocaleString()} free MC credits awarded to referrer (Code: ${referralCode}) for referring ${agreement.hospitalName}`,
      priority: 'success',
    });

    // Mark pending referral as completed
    const updatedPending = pendingReferrals.map(r =>
      r.invitedHospitalName === agreement.hospitalName
        ? { ...r, status: 'completed', completedAt: new Date().toISOString() }
        : r
    );
    localStorage.setItem('medchain_pending_referrals', JSON.stringify(updatedPending));
  };

  const downloadInvoice = () => {
    // Generate professional PDF receipt with blockchain verification
    const invoiceWindow = window.open('', '_blank');
    invoiceWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Official Receipt - ${invoiceData.invoiceNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; background: #fff; color: #1a1a2e; line-height: 1.6; }

          /* Header with Logo */
          .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 25px; margin-bottom: 25px; border-bottom: 3px solid #0d9488; }
          .logo-section { display: flex; align-items: center; gap: 15px; }
          .logo-icon { width: 60px; height: 60px; background: linear-gradient(135deg, #dc2626, #b91c1c); border-radius: 12px; display: flex; align-items: center; justify-content: center; }
          .logo-icon svg { width: 32px; height: 32px; }
          .logo-text h1 { font-size: 26px; font-weight: 800; color: #0d9488; margin-bottom: 2px; }
          .logo-text p { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
          .receipt-info { text-align: right; }
          .receipt-number { font-size: 22px; font-weight: 700; color: #1e293b; }
          .receipt-date { font-size: 13px; color: #64748b; margin-top: 5px; }
          .paid-badge { display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-top: 10px; text-transform: uppercase; letter-spacing: 0.5px; }

          /* Blockchain Verification Seal */
          .blockchain-seal { background: linear-gradient(135deg, #0f172a, #1e293b); border-radius: 12px; padding: 20px; margin-bottom: 25px; color: white; position: relative; overflow: hidden; }
          .blockchain-seal::before { content: ''; position: absolute; top: -50%; right: -50%; width: 100%; height: 200%; background: radial-gradient(circle, rgba(13,148,136,0.1) 0%, transparent 70%); }
          .seal-header { display: flex; align-items: center; gap: 12px; margin-bottom: 15px; position: relative; }
          .seal-icon { width: 48px; height: 48px; background: linear-gradient(135deg, #0d9488, #06b6d4); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 20px rgba(13,148,136,0.4); }
          .seal-icon svg { width: 24px; height: 24px; }
          .seal-title { font-size: 16px; font-weight: 700; color: #0d9488; }
          .seal-subtitle { font-size: 11px; color: #94a3b8; }
          .seal-details { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; position: relative; }
          .seal-item { background: rgba(255,255,255,0.05); border-radius: 8px; padding: 12px; }
          .seal-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
          .seal-value { font-size: 12px; color: #e2e8f0; font-family: 'Courier New', monospace; word-break: break-all; }
          .seal-value.highlight { color: #0d9488; font-weight: 600; }

          /* Parties Section */
          .parties { display: flex; justify-content: space-between; margin-bottom: 25px; gap: 30px; }
          .party { flex: 1; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
          .party-title { font-size: 10px; font-weight: 700; color: #0d9488; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
          .party-name { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 8px; }
          .party-detail { font-size: 13px; color: #64748b; margin-bottom: 4px; }

          /* Items Table */
          .items-section { margin-bottom: 25px; }
          .section-title { font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #0d9488; color: white; padding: 14px 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
          th:first-child { border-radius: 8px 0 0 0; }
          th:last-child { border-radius: 0 8px 0 0; text-align: right; }
          td { padding: 14px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #334155; }
          td:last-child { text-align: right; font-weight: 600; }
          tr:last-child td { border-bottom: none; }
          .item-desc { font-weight: 500; color: #1e293b; }

          /* Totals */
          .totals-section { display: flex; justify-content: flex-end; margin-bottom: 25px; }
          .totals-box { width: 320px; background: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; }
          .totals-row { display: flex; justify-content: space-between; padding: 10px 0; font-size: 14px; color: #64748b; }
          .totals-row.subtotal { border-bottom: 1px solid #e2e8f0; }
          .totals-row.total { border-top: 2px solid #0d9488; padding-top: 15px; margin-top: 10px; }
          .totals-row.total .label { font-size: 16px; font-weight: 700; color: #1e293b; }
          .totals-row.total .value { font-size: 20px; font-weight: 800; color: #0d9488; }

          /* Payment Details */
          .payment-details { background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 25px; }
          .payment-title { font-size: 14px; font-weight: 700; color: #166534; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
          .payment-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .payment-item { }
          .payment-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
          .payment-value { font-size: 13px; color: #1e293b; font-weight: 500; margin-top: 2px; }

          /* Email Confirmation */
          .email-confirmation { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px 20px; margin-bottom: 25px; display: flex; align-items: center; gap: 12px; }
          .email-icon { width: 40px; height: 40px; background: #3b82f6; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
          .email-icon svg { width: 20px; height: 20px; }
          .email-text { flex: 1; }
          .email-title { font-size: 13px; font-weight: 600; color: #1e40af; margin-bottom: 2px; }
          .email-desc { font-size: 12px; color: #64748b; }

          /* Footer */
          .footer { text-align: center; padding-top: 25px; border-top: 1px solid #e2e8f0; }
          .footer-logo { font-size: 14px; font-weight: 700; color: #0d9488; margin-bottom: 8px; }
          .footer-text { font-size: 11px; color: #94a3b8; margin-bottom: 4px; }
          .footer-contact { font-size: 11px; color: #64748b; }

          @media print {
            body { padding: 20px; }
            .blockchain-seal { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <!-- Header with Logo -->
        <div class="header">
          <div class="logo-section">
            <div class="logo-icon">
              <svg fill="none" stroke="white" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div class="logo-text">
              <h1>Sarawak MedChain</h1>
              <p>Blockchain Healthcare Platform</p>
            </div>
          </div>
          <div class="receipt-info">
            <div class="receipt-number">${invoiceData.invoiceNumber}</div>
            <div class="receipt-date">${new Date(invoiceData.date).toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div class="paid-badge">PAID</div>
          </div>
        </div>

        <!-- Blockchain Verification Seal -->
        <div class="blockchain-seal">
          <div class="seal-header">
            <div class="seal-icon">
              <svg fill="none" stroke="white" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <div class="seal-title">BLOCKCHAIN VERIFIED PAYMENT</div>
              <div class="seal-subtitle">This transaction has been cryptographically secured on the blockchain</div>
            </div>
          </div>
          <div class="seal-details">
            <div class="seal-item">
              <div class="seal-label">Transaction Hash</div>
              <div class="seal-value">${invoiceData.blockchainTxHash}</div>
            </div>
            <div class="seal-item">
              <div class="seal-label">Block Number</div>
              <div class="seal-value highlight">#${invoiceData.blockNumber?.toLocaleString()}</div>
            </div>
            <div class="seal-item">
              <div class="seal-label">Network</div>
              <div class="seal-value highlight">${invoiceData.blockchainNetwork}</div>
            </div>
            <div class="seal-item">
              <div class="seal-label">Verification Status</div>
              <div class="seal-value highlight">CONFIRMED</div>
            </div>
          </div>
        </div>

        <!-- Parties -->
        <div class="parties">
          <div class="party">
            <div class="party-title">Service Provider</div>
            <div class="party-name">Sarawak MedChain Sdn Bhd</div>
            <div class="party-detail">Level 15, Wisma Saberkas</div>
            <div class="party-detail">Jalan Tun Abang Haji Openg</div>
            <div class="party-detail">93000 Kuching, Sarawak</div>
            <div class="party-detail" style="margin-top: 8px;">SST Reg: W10-1234-56789012</div>
          </div>
          <div class="party">
            <div class="party-title">Billed To</div>
            <div class="party-name">${invoiceData.hospital.name}</div>
            <div class="party-detail">${invoiceData.hospital.address || 'Address on file'}</div>
            <div class="party-detail">Registration: ${invoiceData.hospital.registration || 'On file'}</div>
          </div>
        </div>

        <!-- Items Table -->
        <div class="items-section">
          <div class="section-title">Itemized Billing</div>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Unit Price (RM)</th>
                <th>Amount (RM)</th>
              </tr>
            </thead>
            <tbody>
              ${invoiceData.items.map(item => `
                <tr>
                  <td class="item-desc">${item.description}</td>
                  <td style="text-align: center;">${item.quantity}</td>
                  <td style="text-align: right;">${item.unitPrice.toLocaleString()}.00</td>
                  <td>${item.amount.toLocaleString()}.00</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Totals -->
        <div class="totals-section">
          <div class="totals-box">
            <div class="totals-row subtotal">
              <span class="label">Subtotal</span>
              <span class="value">RM ${invoiceData.subtotal.toLocaleString()}.00</span>
            </div>
            <div class="totals-row">
              <span class="label">SST (6%)</span>
              <span class="value">RM ${invoiceData.sst.toLocaleString()}.00</span>
            </div>
            <div class="totals-row total">
              <span class="label">Total Paid</span>
              <span class="value">RM ${invoiceData.total.toLocaleString()}.00</span>
            </div>
          </div>
        </div>

        <!-- Payment Details -->
        <div class="payment-details">
          <div class="payment-title">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Payment Confirmed
          </div>
          <div class="payment-grid">
            <div class="payment-item">
              <div class="payment-label">Payment Method</div>
              <div class="payment-value">${invoiceData.paymentMethod}</div>
            </div>
            <div class="payment-item">
              <div class="payment-label">FPX Reference</div>
              <div class="payment-value">${invoiceData.transactionRef}</div>
            </div>
            <div class="payment-item">
              <div class="payment-label">Payment Date & Time</div>
              <div class="payment-value">${new Date(invoiceData.date).toLocaleString('en-MY')}</div>
            </div>
            <div class="payment-item">
              <div class="payment-label">${invoiceData.isTopUp ? 'Credits Added' : 'Credits Loaded'}</div>
              <div class="payment-value" style="color: #0d9488; font-weight: 700;">RM ${(invoiceData.isTopUp ? topUpAmount : initialCredits).toLocaleString()}.00</div>
            </div>
          </div>
          ${invoiceData.isTopUp ? `
          <div style="margin-top: 16px; padding: 16px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 12px; text-align: center;">
            <div style="font-size: 12px; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">New Credit Balance</div>
            <div style="font-size: 28px; font-weight: 800; color: white;">RM ${newBalance.toLocaleString()}.00</div>
          </div>
          ` : ''}
        </div>

        <!-- Email Confirmation -->
        <div class="email-confirmation">
          <div class="email-icon">
            <svg fill="none" stroke="white" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div class="email-text">
            <div class="email-title">Receipt Sent Successfully</div>
            <div class="email-desc">A copy of this receipt has been emailed to ${invoiceData.hospital.ceoEmail} and ${invoiceData.hospital.financeEmail}</div>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="footer-logo">Sarawak MedChain</div>
          <div class="footer-text">This is a computer-generated receipt and does not require a signature.</div>
          <div class="footer-text">All payments are secured and verified on the blockchain.</div>
          <div class="footer-contact">billing@sarawakmedchain.com | +60 82-123 456</div>
        </div>

        <script>window.print();</script>
      </body>
      </html>
    `);
    invoiceWindow.document.close();
  };

  if (!agreementData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0e14' }}>
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // Payment Processing Screen
  if (isProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0e14' }}>
        <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 text-center">
          <div className="mb-8">
            <div className="text-6xl mb-4">{PROCESSING_STEPS[currentStep]?.icon}</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {PROCESSING_STEPS[currentStep]?.title}
            </h2>
            <p className="text-gray-400">Please do not close this window</p>
          </div>

          {/* Progress Steps */}
          <div className="space-y-3">
            {PROCESSING_STEPS.map((step, index) => (
              <div
                key={index}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  index < currentStep
                    ? 'bg-green-900/30 text-green-400'
                    : index === currentStep
                    ? 'bg-teal-900/30 text-teal-400'
                    : 'bg-gray-700/30 text-gray-500'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  index < currentStep
                    ? 'bg-green-500 text-white'
                    : index === currentStep
                    ? 'bg-teal-500 text-white animate-pulse'
                    : 'bg-gray-600 text-gray-400'
                }`}>
                  {index < currentStep ? '✓' : index + 1}
                </div>
                <span className="text-sm">{step.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Payment Complete Screen
  if (paymentComplete && invoiceData) {
    return (
      <div className="min-h-screen py-12 px-4" style={{ backgroundColor: '#0a0e14' }}>
        {/* Global CSS for seamless background */}
        <style>{`
          html, body, #root {
            background-color: #0a0e14 !important;
          }
        `}</style>
        <div className="max-w-2xl mx-auto">
          {/* Success Banner */}
          <div className="bg-gradient-to-r from-green-600 to-teal-600 rounded-2xl p-8 text-center mb-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAzMHYySDI0di0yaDEyek0zNiAyNnYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
            <div className="relative">
              <div className="w-20 h-20 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {isTopUp ? 'Top-Up Successful!' : 'Payment Successful!'}
              </h1>
              <p className="text-green-100">
                {isTopUp ? `${topUpAmount.toLocaleString()} credits added to your balance` : 'Your hospital node is now active'}
              </p>
            </div>
          </div>

          {/* Blockchain Verification Card */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 mb-6 border border-teal-500/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h3 className="text-teal-400 font-bold">Blockchain Verified Payment</h3>
                <p className="text-gray-400 text-sm">Transaction secured on the blockchain</p>
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4 mb-3">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Transaction Hash</p>
              <code className="text-teal-300 text-xs font-mono break-all">{invoiceData.blockchainTxHash}</code>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900/50 rounded-lg p-3">
                <p className="text-gray-500 text-xs">Block Number</p>
                <p className="text-white font-mono">#{invoiceData.blockNumber?.toLocaleString()}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-3">
                <p className="text-gray-500 text-xs">Network</p>
                <p className="text-teal-400 font-semibold text-sm">{invoiceData.blockchainNetwork}</p>
              </div>
            </div>
          </div>

          {/* Invoice Summary */}
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Tax Invoice</h2>
                <p className="text-gray-400">{invoiceData.invoiceNumber}</p>
              </div>
              <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                PAID
              </span>
            </div>

            <div className="border-t border-gray-700 pt-4 mb-4">
              {invoiceData.items.map((item, index) => (
                <div key={index} className="flex justify-between py-2 text-gray-300">
                  <span>{item.description}</span>
                  <span>RM {item.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-700 pt-4">
              <div className="flex justify-between py-1 text-gray-400">
                <span>Subtotal</span>
                <span>RM {invoiceData.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 text-gray-400">
                <span>SST (6%)</span>
                <span>RM {invoiceData.sst.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 text-xl font-bold text-white">
                <span>Total Paid</span>
                <span className="text-green-400">RM {invoiceData.total.toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-4 p-4 bg-gray-700/50 rounded-lg text-sm text-gray-400">
              <div className="flex justify-between">
                <span>Payment Method:</span>
                <span>{invoiceData.paymentMethod}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span>Transaction Ref:</span>
                <span className="font-mono">{invoiceData.transactionRef}</span>
              </div>
            </div>
          </div>

          {/* Credits Loaded Banner */}
          <div className="bg-gradient-to-r from-emerald-600/20 to-teal-600/20 border border-emerald-500/30 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-emerald-400 font-bold text-lg">{isTopUp ? 'Credits Added' : 'Credits Loaded'}</p>
                  <p className="text-gray-400 text-sm">{isTopUp ? `+RM ${topUpAmount.toLocaleString()} added` : 'Ready for MC issuance'}</p>
                </div>
              </div>
              <div className="text-right">
                {isTopUp ? (
                  <>
                    <p className="text-3xl font-black text-white">RM {newBalance.toLocaleString()}</p>
                    <p className="text-emerald-400 text-sm">New Balance</p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-black text-white">RM {initialCredits.toLocaleString()}</p>
                    <p className="text-emerald-400 text-sm">{initialCredits} MC credits</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Node Status */}
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Your Hospital Node</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Status</div>
                <div className="text-green-400 font-bold flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  Active
                </div>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">{isTopUp ? 'New Balance' : 'Credit Balance'}</div>
                <div className="text-emerald-400 font-bold">RM {(isTopUp ? newBalance : initialCredits).toLocaleString()}</div>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Plan</div>
                <div className="text-white font-bold">Enterprise</div>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">{isTopUp ? 'Transaction ID' : 'Next Billing'}</div>
                <div className="text-white font-bold text-sm">
                  {isTopUp ? invoiceData?.transactionRef : new Date(getNextBillingDate()).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>

          {/* Email Sent Confirmation */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-blue-400 font-semibold">Receipt Sent Successfully</p>
                <p className="text-gray-400 text-sm">
                  Sent to {invoiceData.hospital.ceoEmail} and {invoiceData.hospital.financeEmail}
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={downloadInvoice}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 px-6 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Receipt
            </button>
            <button
              onClick={() => navigate('/ceo')}
              className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white py-3 px-6 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Payment Selection Screen
  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: '#0a0e14' }}>
      {/* Global CSS for seamless background */}
      <style>{`
        html, body, #root {
          background-color: #0a0e14 !important;
        }
      `}</style>

      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            {isTopUp ? 'Top Up Credits' : 'Complete Your Payment'}
          </h1>
          <p className="text-gray-400">
            {isTopUp ? 'Add credits to your hospital node via FPX' : 'Activate your hospital node with FPX Online Banking'}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Order Summary */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Order Summary</h2>

            <div className="space-y-4 mb-6">
              {/* Show subscription line ONLY for non-top-up flow */}
              {!isTopUp && (
                <div className="flex justify-between items-center py-3 border-b border-gray-700">
                  <div>
                    <div className="text-white font-medium">Enterprise Subscription</div>
                    <div className="text-gray-400 text-sm">Monthly fee</div>
                  </div>
                  <div className="text-white font-bold">RM 10,000</div>
                </div>
              )}

              {/* Credits section - different for top-up vs subscription */}
              {isTopUp ? (
                <div className="flex justify-between items-center py-3 border-b border-gray-700">
                  <div>
                    <div className="text-white font-medium">Credit Top-Up</div>
                    <div className="text-gray-400 text-sm">{topUpAmount} MC credits @ RM 1.00 each</div>
                  </div>
                  <div className="text-white font-bold">RM {topUpAmount.toLocaleString()}</div>
                </div>
              ) : (
                <div className="py-3 border-b border-gray-700">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <div className="text-white font-medium">Initial Credits</div>
                      <div className="text-gray-400 text-sm">RM 1.00 per MC transaction</div>
                    </div>
                    <div className="text-white font-bold">RM {initialCredits}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="50"
                      max="500"
                      step="50"
                      value={initialCredits}
                      onChange={(e) => setInitialCredits(Number(e.target.value))}
                      className="flex-1 accent-teal-500"
                    />
                    <span className="text-teal-400 font-mono w-20 text-right">
                      {initialCredits} credits
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-gray-400">
                <span>Subtotal</span>
                <span>RM {pricing.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>SST (6%)</span>
                <span>RM {pricing.sst.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex justify-between items-center py-4 border-t border-gray-700">
              <span className="text-xl text-white font-bold">Total</span>
              <span className="text-2xl text-teal-400 font-bold">
                RM {pricing.total.toLocaleString()}
              </span>
            </div>

            <div className="mt-4 p-4 bg-teal-900/30 rounded-lg">
              <div className="text-teal-400 font-medium mb-1">Hospital</div>
              <div className="text-white">{agreementData?.hospitalName || 'Hospital'}</div>
              {!isTopUp && agreementData?.signedAt && (
                <div className="text-gray-400 text-sm mt-2">
                  Agreement signed on {new Date(agreementData.signedAt).toLocaleDateString()}
                </div>
              )}
              {isTopUp && (
                <div className="text-gray-400 text-sm mt-2">
                  Credits will be added to your existing balance
                </div>
              )}
            </div>
          </div>

          {/* Bank Selection */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Select Your Bank
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Choose your bank to proceed with FPX payment
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {MALAYSIAN_BANKS.map((bank) => (
                <button
                  key={bank.code}
                  onClick={() => setSelectedBank(bank.code)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    selectedBank === bank.code
                      ? 'border-teal-500 bg-teal-900/30'
                      : 'border-gray-700 bg-gray-700/30 hover:border-gray-600'
                  }`}
                >
                  <div className="text-2xl mb-1">{bank.logo}</div>
                  <div className={`text-sm font-medium ${
                    selectedBank === bank.code ? 'text-teal-400' : 'text-white'
                  }`}>
                    {bank.name}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={handlePayment}
              disabled={!selectedBank}
              className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${
                selectedBank
                  ? 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {selectedBank
                ? `Pay RM ${pricing.total.toLocaleString()} via FPX`
                : 'Select a bank to continue'
              }
            </button>

            <div className="mt-4 flex items-center justify-center gap-2 text-gray-500 text-sm">
              <span>🔒</span>
              <span>Secured by FPX Payment Gateway</span>
            </div>

            <div className="mt-6 p-4 bg-gray-700/30 rounded-lg">
              <div className="text-gray-400 text-sm">
                <strong className="text-white">Note:</strong> You will be redirected to your bank&apos;s secure login page to authorize this payment.
              </div>
            </div>
          </div>
        </div>

        {/* Back Button */}
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/agreement')}
            className="text-gray-400 hover:text-white transition-colors"
          >
            &larr; Back to Agreement
          </button>
        </div>
      </div>
    </div>
  );
}
