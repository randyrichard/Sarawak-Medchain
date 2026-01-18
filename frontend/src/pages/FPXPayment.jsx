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

const PROCESSING_STEPS = [
  { title: 'Connecting to FPX Gateway', icon: '🔗', duration: 1000 },
  { title: 'Redirecting to Bank', icon: '🏦', duration: 1200 },
  { title: 'Awaiting Authorization', icon: '🔐', duration: 2000 },
  { title: 'Processing Payment', icon: '💳', duration: 1500 },
  { title: 'Confirming Transaction', icon: '✅', duration: 800 },
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

  useEffect(() => {
    // Try to get agreement data from location state first, then localStorage
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
  }, [location.state, navigate]);

  const calculateTotal = () => {
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

    setIsProcessing(true);
    setCurrentStep(0);

    // Simulate FPX payment processing steps
    for (let i = 0; i < PROCESSING_STEPS.length; i++) {
      setCurrentStep(i);
      await new Promise(resolve => setTimeout(resolve, PROCESSING_STEPS[i].duration));
    }

    // Payment successful - update hospital node to Active
    const invoice = generateInvoice();
    setInvoiceData(invoice);

    // Update hospital node status in localStorage
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

    // Clear any critical alerts
    clearCriticalAlerts();

    // Store invoice
    const invoices = JSON.parse(localStorage.getItem('medchain_invoices') || '[]');
    invoices.unshift(invoice);
    localStorage.setItem('medchain_invoices', JSON.stringify(invoices));

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
    return {
      invoiceNumber,
      date: new Date().toISOString(),
      dueDate: new Date().toISOString(),
      status: 'Paid',
      hospital: {
        name: agreementData?.hospitalName || 'Hospital',
        address: agreementData?.hospitalAddress || '',
        registration: agreementData?.registrationNumber || '',
      },
      items: [
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
      ],
      subtotal: pricing.subtotal,
      sst: pricing.sst,
      total: pricing.total,
      paymentMethod: `FPX - ${MALAYSIAN_BANKS.find(b => b.code === selectedBank)?.name}`,
      transactionRef: `FPX${Date.now()}`,
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

  const downloadInvoice = () => {
    // Generate printable invoice
    const invoiceWindow = window.open('', '_blank');
    invoiceWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoiceData.invoiceNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0d9488; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { font-size: 24px; font-weight: bold; color: #0d9488; }
          .invoice-info { text-align: right; }
          .invoice-number { font-size: 20px; font-weight: bold; }
          .status { background: #10b981; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; }
          .parties { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .party { width: 45%; }
          .party-title { font-weight: bold; color: #666; margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f8f9fa; }
          .amount { text-align: right; }
          .totals { width: 300px; margin-left: auto; }
          .totals tr td { border: none; padding: 8px 12px; }
          .totals .total-row { font-weight: bold; font-size: 18px; border-top: 2px solid #0d9488; }
          .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">Sarawak MedChain</div>
          <div class="invoice-info">
            <div class="invoice-number">${invoiceData.invoiceNumber}</div>
            <div>Date: ${new Date(invoiceData.date).toLocaleDateString()}</div>
            <div><span class="status">${invoiceData.status}</span></div>
          </div>
        </div>

        <div class="parties">
          <div class="party">
            <div class="party-title">From:</div>
            <div><strong>Sarawak MedChain Sdn Bhd</strong></div>
            <div>Level 10, Wisma Sarawak</div>
            <div>93000 Kuching, Sarawak</div>
            <div>SST Reg: W10-1234-56789012</div>
          </div>
          <div class="party">
            <div class="party-title">Bill To:</div>
            <div><strong>${invoiceData.hospital.name}</strong></div>
            <div>${invoiceData.hospital.address || 'Address on file'}</div>
            <div>Reg: ${invoiceData.hospital.registration || 'N/A'}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th class="amount">Qty</th>
              <th class="amount">Unit Price</th>
              <th class="amount">Amount (RM)</th>
            </tr>
          </thead>
          <tbody>
            ${invoiceData.items.map(item => `
              <tr>
                <td>${item.description}</td>
                <td class="amount">${item.quantity}</td>
                <td class="amount">${item.unitPrice.toLocaleString()}</td>
                <td class="amount">${item.amount.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <table class="totals">
          <tr>
            <td>Subtotal:</td>
            <td class="amount">RM ${invoiceData.subtotal.toLocaleString()}</td>
          </tr>
          <tr>
            <td>SST (6%):</td>
            <td class="amount">RM ${invoiceData.sst.toLocaleString()}</td>
          </tr>
          <tr class="total-row">
            <td>Total:</td>
            <td class="amount">RM ${invoiceData.total.toLocaleString()}</td>
          </tr>
        </table>

        <div style="margin-top: 30px; padding: 15px; background: #f0fdf4; border-radius: 8px;">
          <strong>Payment Details:</strong><br/>
          Method: ${invoiceData.paymentMethod}<br/>
          Transaction Ref: ${invoiceData.transactionRef}<br/>
          Status: Paid on ${new Date(invoiceData.date).toLocaleString()}
        </div>

        <div class="footer">
          <p>Thank you for choosing Sarawak MedChain. This is a computer-generated invoice and does not require a signature.</p>
          <p>For billing inquiries: billing@sarawakmedchain.com | +60 82-XXX XXXX</p>
        </div>

        <script>window.print();</script>
      </body>
      </html>
    `);
    invoiceWindow.document.close();
  };

  if (!agreementData) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // Payment Processing Screen
  if (isProcessing) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
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
      <div className="min-h-screen bg-gray-900 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Success Banner */}
          <div className="bg-gradient-to-r from-green-600 to-teal-600 rounded-2xl p-8 text-center mb-8">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-3xl font-bold text-white mb-2">Payment Successful!</h1>
            <p className="text-green-100">Your hospital node is now active</p>
          </div>

          {/* Invoice Summary */}
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Tax Invoice</h2>
                <p className="text-gray-400">{invoiceData.invoiceNumber}</p>
              </div>
              <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm">
                Paid
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
                <div className="text-gray-400 text-sm">Credit Balance</div>
                <div className="text-white font-bold">{initialCredits} Credits</div>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Plan</div>
                <div className="text-white font-bold">Enterprise</div>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Next Billing</div>
                <div className="text-white font-bold">
                  {new Date(getNextBillingDate()).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={downloadInvoice}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 px-6 rounded-lg font-medium transition-colors"
            >
              Download Invoice
            </button>
            <button
              onClick={() => navigate('/ceo-dashboard')}
              className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white py-3 px-6 rounded-lg font-medium transition-colors"
            >
              Go to Dashboard
            </button>
          </div>

          <p className="text-center text-gray-500 text-sm mt-6">
            A copy of this invoice has been sent to your registered email
          </p>
        </div>
      </div>
    );
  }

  // Main Payment Selection Screen
  return (
    <div className="min-h-screen bg-gray-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Complete Your Payment</h1>
          <p className="text-gray-400">
            Activate your hospital node with FPX Online Banking
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Order Summary */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Order Summary</h2>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center py-3 border-b border-gray-700">
                <div>
                  <div className="text-white font-medium">Enterprise Subscription</div>
                  <div className="text-gray-400 text-sm">Monthly fee</div>
                </div>
                <div className="text-white font-bold">RM 10,000</div>
              </div>

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
              <div className="text-white">{agreementData.hospitalName}</div>
              <div className="text-gray-400 text-sm mt-2">
                Agreement signed on {new Date(agreementData.signedAt).toLocaleDateString()}
              </div>
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
