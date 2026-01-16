import { useState, useEffect } from 'react';
import {
  getAllHospitalBalances,
  getBillingContract,
  getAdmin,
  getPendingAdmin,
  proposeAdmin,
  acceptAdmin,
  cancelAdminTransfer,
  addVerifiedDoctor,
  removeVerifiedDoctor,
  isVerifiedDoctor
} from '../utils/contract';
import { useBilling } from '../context/BillingContext';
import BroadcastNotification from '../components/BroadcastNotification';

// Doctor Performance Leaderboard Data
const generateDoctorPerformanceData = () => {
  const doctors = [
    { id: 1, name: 'Dr. Ahmad Razak', department: 'General Medicine', mcsIssued: 47 },
    { id: 2, name: 'Dr. Sarah Lim', department: 'Pediatrics', mcsIssued: 38 },
    { id: 3, name: 'Dr. James Wong', department: 'Emergency', mcsIssued: 31 },
    { id: 4, name: 'Dr. Fatimah Hassan', department: 'Internal Medicine', mcsIssued: 24 },
    { id: 5, name: 'Dr. Kumar Pillai', department: 'Orthopedics', mcsIssued: 16 },
  ];

  return doctors.sort((a, b) => b.mcsIssued - a.mcsIssued).map((doc, index) => ({
    ...doc,
    rank: index + 1,
    revenue: doc.mcsIssued * 1,
  }));
};

export default function AdminPortal({ walletAddress }) {
  // Use Billing Context
  const {
    accountType,
    changeAccountType,
    currentTier,
    monthlySubscriptionFee,
    variableUsageCost,
    totalOutstandingBalance,
    mcRate,
    mcsIssuedThisMonth,
    subscriptionPaid,
    processPayment,
    refreshBillingData
  } = useBilling();

  const [totalMCs, setTotalMCs] = useState(0);
  const [activeDoctors, setActiveDoctors] = useState(0);
  const [totalCredits, setTotalCredits] = useState(0);
  const [totalOwed, setTotalOwed] = useState(0);
  const [hospitalBalances, setHospitalBalances] = useState([]);
  const [doctorPerformance, setDoctorPerformance] = useState([]);
  const [loading, setLoading] = useState(true);

  // Admin state
  const [currentAdmin, setCurrentAdmin] = useState('');
  const [pendingAdminAddr, setPendingAdminAddr] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPendingAdmin, setIsPendingAdmin] = useState(false);

  // Payment processing state
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Form state
  const [newAdminAddress, setNewAdminAddress] = useState('');
  const [newDoctorAddress, setNewDoctorAddress] = useState('');
  const [removeDoctorAddress, setRemoveDoctorAddress] = useState('');
  const [message, setMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Invoice Modal State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  // Payment Simulation Overlay State
  const [showPaymentOverlay, setShowPaymentOverlay] = useState(false);
  const [paymentStage, setPaymentStage] = useState('broadcasting'); // 'broadcasting' | 'verifying' | 'success'
  const [transactionHash, setTransactionHash] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);

  // Derived billing values (using context)
  const tierName = currentTier.name;
  const baseFee = monthlySubscriptionFee;
  const mcCost = mcRate;
  const meteredUsageCost = variableUsageCost;
  const totalDue = totalOutstandingBalance;
  const baseFeeDetected = subscriptionPaid;
  const isSubscriptionOverdue = !subscriptionPaid && totalDue > 0;
  const baseFeePayment = subscriptionPaid ? baseFee : 0;
  const facilityType = accountType;
  const setFacilityType = changeAccountType;

  // Color scheme
  const sarawakRed = '#DC2626'; // For overdue alerts
  const sarawakBlue = '#007BFF'; // Professional Sarawak Blue for buttons
  const medicalBlue = '#0284C7'; // For View Invoice button

  useEffect(() => {
    fetchData();
    setDoctorPerformance(generateDoctorPerformanceData());
  }, [walletAddress]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const billing = getBillingContract();

      // Get total MCs
      const mcCount = await billing.getMCCount();
      setTotalMCs(Number(mcCount));

      // Get all hospital balances
      const balances = await getAllHospitalBalances();
      setHospitalBalances(balances);
      setActiveDoctors(balances.length);

      // Calculate totals
      let credits = 0;
      let owed = 0;
      balances.forEach(b => {
        if (b.balance >= 0) {
          credits += b.balance;
        } else {
          owed += Math.abs(b.balance);
        }
      });
      setTotalCredits(credits);
      setTotalOwed(owed);

      // Get admin info
      const admin = await getAdmin();
      const pending = await getPendingAdmin();
      setCurrentAdmin(admin);
      setPendingAdminAddr(pending);
      setIsAdmin(admin.toLowerCase() === walletAddress.toLowerCase());
      setIsPendingAdmin(pending.toLowerCase() === walletAddress.toLowerCase() && pending !== '0x0000000000000000000000000000000000000000');

    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProposeAdmin = async () => {
    if (!newAdminAddress) {
      setMessage('Error: Please enter new admin address');
      return;
    }
    try {
      setActionLoading(true);
      setMessage('Proposing new admin...');
      await proposeAdmin(newAdminAddress);
      setMessage('New admin proposed successfully! They must call acceptAdmin() to complete transfer.');
      setNewAdminAddress('');
      await fetchData();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptAdmin = async () => {
    try {
      setActionLoading(true);
      setMessage('Accepting admin role...');
      await acceptAdmin();
      setMessage('You are now the admin!');
      await fetchData();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelTransfer = async () => {
    try {
      setActionLoading(true);
      setMessage('Cancelling admin transfer...');
      await cancelAdminTransfer();
      setMessage('Admin transfer cancelled.');
      await fetchData();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddDoctor = async () => {
    if (!newDoctorAddress) {
      setMessage('Error: Please enter doctor address');
      return;
    }
    try {
      setActionLoading(true);
      setMessage('Adding verified doctor...');
      await addVerifiedDoctor(newDoctorAddress);
      setMessage('Doctor verified successfully!');
      setNewDoctorAddress('');
      await fetchData();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveDoctor = async () => {
    if (!removeDoctorAddress) {
      setMessage('Error: Please enter doctor address');
      return;
    }
    try {
      setActionLoading(true);
      setMessage('Removing doctor...');
      await removeVerifiedDoctor(removeDoctorAddress);
      setMessage('Doctor removed successfully!');
      setRemoveDoctorAddress('');
      await fetchData();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePayNow = (dueId) => {
    handleProcessMonthlyPayment();
  };

  // Generate fake transaction hash
  const generateTransactionHash = () => {
    const chars = '0123456789abcdef';
    let hash = '0x';
    for (let i = 0; i < 64; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  };

  const handleProcessMonthlyPayment = async () => {
    // Store payment amount for display
    setPaymentAmount(totalDue);

    // Show overlay and start animation sequence
    setShowPaymentOverlay(true);
    setPaymentStage('broadcasting');
    setPaymentProcessing(true);
    setPaymentSuccess(false);

    // Stage 1: Broadcasting (1.5 seconds)
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Stage 2: Verifying (1.5 seconds)
    setPaymentStage('verifying');
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Generate transaction hash
    const txHash = generateTransactionHash();
    setTransactionHash(txHash);

    // Stage 3: Success
    setPaymentStage('success');

    try {
      // Process the actual payment in context
      const result = await processPayment(totalDue);

      if (result.success) {
        setPaymentSuccess(true);
        setMessage(`Payment successful! Transaction ID: ${result.transactionId}`);

        // Refresh billing data
        await refreshBillingData();
        await fetchData();
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setPaymentProcessing(false);
    }
  };

  const closePaymentOverlay = () => {
    setShowPaymentOverlay(false);
    setPaymentStage('broadcasting');
  };

  const formatAddress = (addr) => {
    if (!addr || addr === '0x0000000000000000000000000000000000000000') return 'None';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="flex-1 flex-grow w-full min-h-full bg-slate-900 font-sans">
        {/* Network-Wide Broadcast Notification */}
        <BroadcastNotification />

        <div className="px-12 py-10">
        {/* Overdue Subscription Banner */}
        {isSubscriptionOverdue && (
          <div className="mb-6 bg-red-900/30 border border-red-500/40 rounded-xl px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-red-300 font-semibold">Monthly Subscription Overdue</p>
                <p className="text-red-400/80 text-sm">Your {tierName} subscription (RM {baseFee.toLocaleString()}/mo) is pending payment</p>
              </div>
            </div>
            <button
              onClick={() => handlePayNow(1)}
              className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition-all shadow-lg shadow-red-500/25"
            >
              Pay Now
            </button>
          </div>
        )}

        {/* Header - Full Width Enterprise Style */}
        <div className="mb-8 flex flex-col lg:flex-row lg:items-center justify-start gap-x-4 gap-y-2">
          <div className="flex items-center gap-x-4">
            <h1 className="text-3xl lg:text-4xl font-bold text-white">Hospital Admin Portal</h1>
            <span className={`flex px-3 py-1 rounded-full text-sm font-medium ${
              isAdmin
                ? 'bg-emerald-500/20 text-emerald-400'
                : isPendingAdmin
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-slate-500/20 text-slate-400'
            }`}>
              {isAdmin ? 'You are Admin' : isPendingAdmin ? 'Pending Admin' : 'Not Admin'}
            </span>
          </div>
          <p className="text-slate-400 lg:ml-auto">Sarawak MedChain Billing Dashboard</p>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl ${
            message.includes('Error')
              ? 'bg-red-500/10 border border-red-500/30 text-red-400'
              : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
          }`}>
            {message}
          </div>
        )}

        {/* Payment Success Notification */}
        {paymentSuccess && (
          <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-6 py-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-emerald-300 font-semibold">Payment Successful!</p>
              <p className="text-emerald-400/80 text-sm">Your monthly payment has been processed</p>
            </div>
          </div>
        )}

        {/* ========== SUBSCRIPTION & USAGE CARD (col-span-12) ========== */}
        <div className="col-span-12 mb-8">
          <div className="bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden">
            {/* Card Header */}
            <div className="px-8 py-5 border-b border-slate-700/50 bg-slate-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${sarawakBlue}20` }}>
                    <svg className="w-6 h-6" style={{ color: sarawakBlue }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Subscription & Usage</h2>
                    <p className="text-slate-400 text-sm">January 2026 Billing Period</p>
                  </div>
                </div>
                {/* Tier Selector */}
                <div className="flex items-center gap-3">
                  <select
                    value={facilityType}
                    onChange={(e) => setFacilityType(e.target.value)}
                    className="bg-slate-700 border border-slate-600 text-white text-sm font-medium rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Hospital">Hospital</option>
                    <option value="Clinic">Clinic</option>
                  </select>
                  <span className={`px-4 py-2 rounded-full text-sm font-bold ${
                    subscriptionPaid
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {subscriptionPaid ? 'PAID' : 'DUE'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card Body */}
            <div className="p-8">
              <div className="grid grid-cols-12 gap-8">
                {/* Left Side: Fee Breakdown */}
                <div className="col-span-12 lg:col-span-7 space-y-6">
                  {/* Base Fee */}
                  <div className="bg-slate-700/30 rounded-xl p-5 border border-slate-600/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          facilityType === 'Hospital' ? 'bg-sky-500/20' : 'bg-emerald-500/20'
                        }`}>
                          <svg className={`w-6 h-6 ${facilityType === 'Hospital' ? 'text-sky-400' : 'text-emerald-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-white font-semibold text-lg">Base Fee</p>
                          <p className="text-slate-400 text-sm">{tierName}</p>
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-white">
                        RM {baseFee.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* MC Usage - Live Counter */}
                  <div className="bg-slate-700/30 rounded-xl p-5 border border-slate-600/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                          <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-white font-semibold text-lg">MC Usage</p>
                            <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium bg-emerald-500/20 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                              LIVE
                            </span>
                          </div>
                          <p className="text-slate-400 text-sm">
                            <span className="text-white font-bold text-xl">{mcsIssuedThisMonth}</span> MCs × RM {mcCost.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-emerald-400">
                        RM {meteredUsageCost.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Side: Total Due & Pay Button */}
                <div className="col-span-12 lg:col-span-5">
                  <div className={`rounded-2xl p-6 h-full flex flex-col justify-center ${
                    isSubscriptionOverdue
                      ? 'bg-gradient-to-br from-red-600 to-red-800'
                      : subscriptionPaid
                        ? 'bg-gradient-to-br from-emerald-600/20 to-emerald-800/20 border border-emerald-500/30'
                        : 'bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50'
                  }`}>
                    <p className={`text-sm font-semibold uppercase tracking-wider mb-2 ${
                      isSubscriptionOverdue ? 'text-red-200' : subscriptionPaid ? 'text-emerald-400' : 'text-slate-400'
                    }`}>
                      Total Due
                    </p>
                    <p className={`text-6xl font-black mb-2 ${
                      isSubscriptionOverdue ? 'text-white' : subscriptionPaid ? 'text-emerald-400' : 'text-white'
                    }`}>
                      RM {totalDue.toLocaleString()}
                    </p>
                    <p className={`text-sm mb-6 ${
                      isSubscriptionOverdue ? 'text-red-200' : subscriptionPaid ? 'text-emerald-400/70' : 'text-slate-400'
                    }`}>
                      Base: RM {baseFee.toLocaleString()} + Usage: RM {meteredUsageCost.toLocaleString()}
                    </p>

                    {subscriptionPaid ? (
                      <div className="flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-semibold">All Dues Cleared</span>
                      </div>
                    ) : (
                      <button
                        onClick={handleProcessMonthlyPayment}
                        disabled={paymentProcessing}
                        className="w-full py-4 rounded-xl font-bold text-lg text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-xl"
                        style={{
                          backgroundColor: sarawakBlue,
                          boxShadow: `0 10px 30px ${sarawakBlue}50`
                        }}
                      >
                        {paymentProcessing ? (
                          <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Processing...
                          </span>
                        ) : (
                          'Process Payment'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Success Notification */}
        {paymentSuccess && (
          <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-6 py-4 flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-emerald-300 font-semibold">Payment Successful!</p>
                <p className="text-emerald-400/80 text-sm">Your monthly payment has been processed</p>
              </div>
            </div>
          </div>
        )}

        {/* Invoice Card - Full Width (col-span-12) */}
        <div className="col-span-12 mb-8">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700/50 overflow-hidden shadow-xl">
            {/* Invoice Header */}
            <div className="px-8 py-6 border-b border-slate-700/50 bg-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-sky-500/20 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Monthly Invoice</h2>
                    <p className="text-slate-400 text-sm">January 2026 Billing Period</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowInvoiceModal(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                    style={{ backgroundColor: sarawakBlue, boxShadow: `0 8px 20px ${sarawakBlue}40` }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Generate Monthly Invoice
                  </button>
                  <span className={`px-4 py-2 rounded-full text-sm font-semibold ${
                    subscriptionPaid
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {subscriptionPaid ? 'Paid' : 'Payment Due'}
                  </span>
                </div>
              </div>
            </div>

            {/* Invoice Body */}
            <div className="p-8">
              <div className="grid grid-cols-12 gap-8">
                {/* Breakdown Section */}
                <div className="col-span-12 lg:col-span-7">
                  <table className="w-full">
                    <tbody>
                      <tr className="border-b border-slate-700/50">
                        <td className="py-4">
                          <p className="text-white font-medium">Monthly Subscription</p>
                          <p className="text-slate-400 text-sm">{tierName} - {facilityType}</p>
                        </td>
                        <td className="py-4 text-right">
                          <p className="text-xl font-bold text-white">RM {baseFee.toLocaleString()}</p>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-700/50">
                        <td className="py-4">
                          <p className="text-white font-medium">Variable Usage (MC Issued)</p>
                          <p className="text-slate-400 text-sm">{mcsIssuedThisMonth} MCs x RM {mcCost.toFixed(2)}</p>
                        </td>
                        <td className="py-4 text-right">
                          <p className="text-xl font-bold text-emerald-400">RM {meteredUsageCost.toLocaleString()}</p>
                        </td>
                      </tr>
                      {subscriptionPaid && (
                        <tr className="border-b border-slate-700/50">
                          <td className="py-4">
                            <p className="text-white font-medium">Payment Received</p>
                            <p className="text-slate-400 text-sm">Base subscription fee</p>
                          </td>
                          <td className="py-4 text-right">
                            <p className="text-xl font-bold text-sky-400">- RM {baseFeePayment.toLocaleString()}</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Total & Pay Button Section */}
                <div className="col-span-12 lg:col-span-5">
                  <div className={`rounded-2xl p-6 ${
                    isSubscriptionOverdue
                      ? 'bg-gradient-to-br from-red-600/20 to-red-800/20 border border-red-500/30'
                      : subscriptionPaid
                        ? 'bg-gradient-to-br from-emerald-600/20 to-emerald-800/20 border border-emerald-500/30'
                        : 'bg-gradient-to-br from-sky-600/20 to-sky-800/20 border border-sky-500/30'
                  }`}>
                    <p className="text-slate-400 text-sm font-medium mb-2">Total Outstanding Balance</p>
                    <p className={`text-5xl font-black mb-4 ${
                      isSubscriptionOverdue ? 'text-red-400' : subscriptionPaid ? 'text-emerald-400' : 'text-white'
                    }`}>
                      RM {totalDue.toLocaleString()}
                    </p>

                    {subscriptionPaid ? (
                      <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/20 px-4 py-3 rounded-xl">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-semibold">All Dues Cleared</span>
                      </div>
                    ) : (
                      <button
                        onClick={handleProcessMonthlyPayment}
                        disabled={paymentProcessing}
                        className={`w-full py-4 rounded-xl font-bold text-lg text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg ${
                          paymentProcessing
                            ? 'bg-slate-600 cursor-not-allowed'
                            : isSubscriptionOverdue
                              ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-red-500/30'
                              : 'bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 shadow-sky-500/30'
                        }`}
                      >
                        {paymentProcessing ? (
                          <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Processing Payment...
                          </span>
                        ) : (
                          'Process Monthly Payment'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Transaction Meter & Real-time Costing */}
        <div className="grid grid-cols-12 gap-6 w-full mb-8">
          {/* Live Transaction Meter */}
          <div className="col-span-12 lg:col-span-4 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Transaction Meter</h2>
              <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                LIVE
              </span>
            </div>
            <div className="text-center py-4">
              <p className="text-6xl font-black text-white tabular-nums">{totalMCs}</p>
              <p className="text-slate-400 text-sm mt-2">MCs Issued This Month</p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-700">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Rate per MC</span>
                <span className="text-white font-semibold">RM {mcCost.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Real-time Costing */}
          <div className="col-span-12 lg:col-span-4 bg-gradient-to-br from-emerald-900/30 to-slate-900 rounded-2xl border border-emerald-700/30 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Real-time Costing</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Base Subscription</span>
                <span className="text-white font-medium">RM {baseFee.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Metered Usage ({totalMCs} × RM1)</span>
                <span className="text-emerald-400 font-medium">RM {meteredUsageCost.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Payments Received</span>
                <span className="text-sky-400 font-medium">- RM {baseFeePayment.toLocaleString()}</span>
              </div>
              <div className="pt-4 border-t border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-white font-semibold">Sub-Total Due</span>
                  <span className={`text-2xl font-bold ${isSubscriptionOverdue ? 'text-red-400' : 'text-emerald-400'}`}>
                    RM {totalDue.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Total Due Card - Bold & Prominent */}
          <div className={`col-span-12 lg:col-span-4 rounded-2xl p-6 shadow-xl ${
            isSubscriptionOverdue
              ? 'bg-gradient-to-br from-red-600 to-red-800 shadow-red-900/30'
              : 'bg-gradient-to-br from-sky-600 to-sky-800 shadow-sky-900/30'
          }`}>
            <h2 className={`text-lg font-semibold mb-2 ${isSubscriptionOverdue ? 'text-red-100' : 'text-sky-100'}`}>
              {isSubscriptionOverdue ? 'Amount Overdue' : 'Total Due'}
            </h2>
            <div className="mb-4">
              <p className="text-5xl font-black text-white">
                RM {totalDue.toLocaleString()}
              </p>
              <p className={`text-sm mt-1 ${isSubscriptionOverdue ? 'text-red-200' : 'text-sky-200'}`}>
                Base: RM {baseFee.toLocaleString()} + Usage: RM {meteredUsageCost.toLocaleString()}
              </p>
            </div>
            {baseFeeDetected ? (
              <div className="flex items-center gap-2 text-emerald-300 bg-emerald-500/20 px-4 py-2 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">Base Fee Paid</span>
              </div>
            ) : (
              <button
                onClick={() => handlePayNow(1)}
                className="w-full py-3 rounded-lg font-semibold text-white transition-all"
                style={{ backgroundColor: isSubscriptionOverdue ? sarawakRed : medicalBlue }}
              >
                {isSubscriptionOverdue ? 'Pay Overdue Balance' : 'Pay Now'}
              </button>
            )}
          </div>
        </div>

        {/* Doctor Performance Leaderboard Section */}
        <div className="grid grid-cols-12 gap-6 w-full mb-8">
          {/* Doctor Performance Leaderboard - col-span-4 */}
          <div className="col-span-12 lg:col-span-4">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden h-full">
              {/* Leaderboard Header */}
              <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/80">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">Doctor Leaderboard</h3>
                    <p className="text-xs mt-0.5 text-slate-400">Top performers this month</p>
                  </div>
                  <div className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400">
                    {doctorPerformance.length} Doctors
                  </div>
                </div>
              </div>

              {/* Leaderboard Table */}
              <div className="p-4">
                <div className="space-y-2">
                  {doctorPerformance.map((doctor, index) => {
                    const monthlyGoal = facilityType === 'Hospital' ? 10000 : 2000;
                    const progressPercent = Math.min(100, (doctor.revenue / monthlyGoal) * 100);

                    return (
                      <div
                        key={doctor.id}
                        className={`relative p-4 rounded-2xl transition-all cursor-pointer hover:bg-slate-700/50 ${
                          index === 0 ? 'bg-amber-500/10 border border-amber-500/30' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Rank Badge */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                            index === 0
                              ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30'
                              : index === 1
                                ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white'
                                : index === 2
                                  ? 'bg-gradient-to-br from-amber-600 to-amber-800 text-white'
                                  : 'bg-slate-700 text-slate-400'
                          }`}>
                            {doctor.rank}
                          </div>

                          {/* Doctor Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm truncate text-white">
                                {doctor.name}
                              </p>
                              {index === 0 && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-600 text-white shadow-sm">
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                  TOP
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400">{doctor.department}</p>
                          </div>

                          {/* Revenue */}
                          <div className="text-right">
                            <p className={`font-bold ${index === 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              RM {doctor.revenue}
                            </p>
                            <p className="text-xs text-slate-500">{doctor.mcsIssued} MCs</p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-3">
                          <div className="h-1.5 rounded-full overflow-hidden bg-slate-700">
                            <div
                              className={`h-full rounded-full transition-all ${
                                index === 0
                                  ? 'bg-gradient-to-r from-amber-400 to-amber-600'
                                  : 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                              }`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <p className="text-xs mt-1 text-slate-500">
                            {progressPercent.toFixed(1)}% of RM{monthlyGoal.toLocaleString()} goal
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Leaderboard Footer */}
              <div className="px-6 py-4 border-t border-slate-700/50 bg-slate-800/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-400">Total Revenue</p>
                    <p className="text-lg font-bold text-emerald-400">
                      RM {doctorPerformance.reduce((sum, d) => sum + d.revenue, 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-slate-400">Total MCs</p>
                    <p className="text-lg font-bold text-white">
                      {doctorPerformance.reduce((sum, d) => sum + d.mcsIssued, 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Summary - col-span-8 */}
          <div className="col-span-12 lg:col-span-8">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6 h-full">
              <h3 className="text-lg font-bold text-white mb-6">Performance Overview</h3>

              {/* Top Performer Highlight */}
              {doctorPerformance[0] && (
                <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/5 rounded-2xl p-6 border border-amber-500/30 mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                      <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider">Top Performer</p>
                      <p className="text-2xl font-bold text-white mt-1">{doctorPerformance[0].name}</p>
                      <p className="text-slate-400 text-sm">{doctorPerformance[0].department}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-black text-amber-400">RM {doctorPerformance[0].revenue}</p>
                      <p className="text-slate-400 text-sm">{doctorPerformance[0].mcsIssued} MCs issued</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Department Stats Grid */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-700/30 rounded-xl p-4 text-center">
                  <p className="text-slate-400 text-xs mb-1">Avg MCs/Doctor</p>
                  <p className="text-2xl font-bold text-white">
                    {Math.round(doctorPerformance.reduce((sum, d) => sum + d.mcsIssued, 0) / doctorPerformance.length)}
                  </p>
                </div>
                <div className="bg-slate-700/30 rounded-xl p-4 text-center">
                  <p className="text-slate-400 text-xs mb-1">Avg Revenue</p>
                  <p className="text-2xl font-bold text-emerald-400">
                    RM {Math.round(doctorPerformance.reduce((sum, d) => sum + d.revenue, 0) / doctorPerformance.length)}
                  </p>
                </div>
                <div className="bg-slate-700/30 rounded-xl p-4 text-center">
                  <p className="text-slate-400 text-xs mb-1">Goal Progress</p>
                  <p className="text-2xl font-bold text-sky-400">
                    {((doctorPerformance.reduce((sum, d) => sum + d.revenue, 0) / (facilityType === 'Hospital' ? 10000 : 2000)) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Monthly Dues Table */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-slate-700/50">
            <h2 className="text-xl font-semibold text-white">Monthly Dues</h2>
            <p className="text-slate-400 text-sm">Invoice history and payment status</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-700/30">
                  <th className="text-left px-6 py-4 text-slate-300 font-medium text-sm">Billing Period</th>
                  <th className="text-right px-6 py-4 text-slate-300 font-medium text-sm">Base Fee</th>
                  <th className="text-right px-6 py-4 text-slate-300 font-medium text-sm">Metered Usage</th>
                  <th className="text-right px-6 py-4 text-slate-300 font-medium text-sm">Total</th>
                  <th className="text-right px-6 py-4 text-slate-300 font-medium text-sm">Status</th>
                  <th className="text-right px-6 py-4 text-slate-300 font-medium text-sm">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                  <td className="px-6 py-4 text-slate-200 font-medium">January 2026</td>
                  <td className="px-6 py-4 text-right text-slate-300">RM {baseFee.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-slate-300">RM {meteredUsageCost.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right text-white font-bold">RM {totalDue.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    {baseFeeDetected ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full text-sm font-medium">
                        <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                        Paid
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full text-sm font-medium">
                        <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handlePayNow(1)}
                      disabled={baseFeeDetected}
                      className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                        baseFeeDetected
                          ? 'bg-emerald-600 text-white cursor-default'
                          : 'bg-[#007BFF] hover:bg-[#0056b3] text-white shadow-lg shadow-blue-500/25'
                      }`}
                    >
                      {baseFeeDetected ? 'Paid' : 'Pay Now'}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Admin Management Section - 12 Column Grid */}
        <div className="grid grid-cols-12 gap-10 w-full mb-8">
          {/* Admin Transfer Card */}
          <div className="col-span-12 lg:col-span-4 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Admin Transfer</h2>
            <div className="space-y-4">
              <div>
                <p className="text-slate-400 text-sm mb-1">Current Admin</p>
                <code className="text-emerald-400 bg-slate-700/50 px-3 py-2 rounded block text-sm">
                  {formatAddress(currentAdmin)}
                </code>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-1">Pending Admin</p>
                <code className="text-yellow-400 bg-slate-700/50 px-3 py-2 rounded block text-sm">
                  {formatAddress(pendingAdminAddr)}
                </code>
              </div>

              {isAdmin && (
                <div className="pt-4 border-t border-slate-700">
                  <label className="text-slate-300 text-sm mb-2 block">Propose New Admin</label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={newAdminAddress}
                    onChange={(e) => setNewAdminAddress(e.target.value)}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleProposeAdmin}
                      disabled={actionLoading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      {actionLoading ? 'Processing...' : 'Propose Admin'}
                    </button>
                    {pendingAdminAddr !== '0x0000000000000000000000000000000000000000' && (
                      <button
                        onClick={handleCancelTransfer}
                        disabled={actionLoading}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isPendingAdmin && (
                <div className="pt-4 border-t border-slate-700">
                  <p className="text-yellow-400 text-sm mb-3">You have been proposed as the new admin!</p>
                  <button
                    onClick={handleAcceptAdmin}
                    disabled={actionLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    {actionLoading ? 'Processing...' : 'Accept Admin Role'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Doctor Management Card */}
          <div className="col-span-12 lg:col-span-8 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Doctor Management</h2>

            {isAdmin ? (
              <div className="space-y-6">
                {/* Add Doctor */}
                <div>
                  <label className="text-slate-300 text-sm mb-2 block">Add Verified Doctor</label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={newDoctorAddress}
                    onChange={(e) => setNewDoctorAddress(e.target.value)}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 mb-3"
                  />
                  <button
                    onClick={handleAddDoctor}
                    disabled={actionLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    {actionLoading ? 'Processing...' : 'Verify Doctor'}
                  </button>
                </div>

                {/* Remove Doctor */}
                <div className="pt-4 border-t border-slate-700">
                  <label className="text-slate-300 text-sm mb-2 block">Remove Verified Doctor</label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={removeDoctorAddress}
                    onChange={(e) => setRemoveDoctorAddress(e.target.value)}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 mb-3"
                  />
                  <button
                    onClick={handleRemoveDoctor}
                    disabled={actionLoading}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                  >
                    {actionLoading ? 'Processing...' : 'Remove Doctor'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-slate-400">Only the admin can manage doctors.</p>
            )}
          </div>
        </div>

        {/* Stats Cards - Full Width 12 Column Grid */}
        <div className="grid grid-cols-12 gap-10 w-full mb-8">
          {/* Total MCs Issued */}
          <div className="col-span-12 md:col-span-4 bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 shadow-xl shadow-blue-900/20 border border-blue-500/20">
            <div className="flex items-center justify-start gap-x-4 mb-4">
              <div className="w-12 h-12 bg-blue-500/30 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-blue-200 text-sm font-medium bg-blue-500/20 px-3 py-1 rounded-full">
                All Time
              </span>
            </div>
            <p className="text-blue-100 text-sm font-medium mb-1">Total MCs Issued</p>
            <p className="text-5xl font-bold text-white">
              {loading ? '...' : totalMCs.toLocaleString()}
            </p>
          </div>

          {/* Active Doctors */}
          <div className="col-span-12 md:col-span-4 bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-6 shadow-xl shadow-emerald-900/20 border border-emerald-500/20">
            <div className="flex items-center justify-start gap-x-4 mb-4">
              <div className="w-12 h-12 bg-emerald-500/30 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <span className="text-emerald-200 text-sm font-medium bg-emerald-500/20 px-3 py-1 rounded-full">
                Registered
              </span>
            </div>
            <p className="text-emerald-100 text-sm font-medium mb-1">Active Doctors</p>
            <p className="text-5xl font-bold text-white">
              {loading ? '...' : activeDoctors}
            </p>
          </div>

          {/* Available Credits */}
          <div className="col-span-12 md:col-span-4 bg-gradient-to-br from-violet-600 to-violet-800 rounded-2xl p-6 shadow-xl shadow-violet-900/20 border border-violet-500/20">
            <div className="flex items-center justify-start gap-x-4 mb-4">
              <div className="w-12 h-12 bg-violet-500/30 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-violet-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-violet-200 text-sm font-medium bg-violet-500/20 px-3 py-1 rounded-full">
                Prepaid
              </span>
            </div>
            <p className="text-violet-100 text-sm font-medium mb-1">Available Credits</p>
            <p className="text-5xl font-bold text-white">
              {loading ? '...' : totalCredits}
            </p>
          </div>
        </div>

        {/* Outstanding Balance Card - Full Width */}
        {totalOwed > 0 && (
          <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-2xl p-6 mb-8">
            <div className="flex items-center justify-start gap-x-4">
              <div className="w-14 h-14 bg-amber-500/20 rounded-xl flex items-center justify-center">
                <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-amber-200 text-sm font-medium">Outstanding Balance</p>
                <p className="text-3xl font-bold text-amber-400">{totalOwed} credits owed</p>
              </div>
            </div>
          </div>
        )}

        {/* Hospital Balances Table */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700/50">
            <h2 className="text-xl font-semibold text-white">Hospital Balances</h2>
            <p className="text-slate-400 text-sm">Detailed breakdown by hospital/doctor</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-700/30">
                  <th className="text-left px-6 py-4 text-slate-300 font-medium text-sm">Hospital Address</th>
                  <th className="text-right px-6 py-4 text-slate-300 font-medium text-sm">Balance</th>
                  <th className="text-right px-6 py-4 text-slate-300 font-medium text-sm">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                      Loading...
                    </td>
                  </tr>
                ) : hospitalBalances.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                      No hospitals registered yet
                    </td>
                  </tr>
                ) : (
                  hospitalBalances.map((item, index) => (
                    <tr key={index} className="border-t border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                      <td className="px-6 py-4">
                        <code className="text-slate-200 bg-slate-700/50 px-2 py-1 rounded text-sm">
                          {formatAddress(item.hospital)}
                        </code>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-lg font-semibold ${item.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {item.balance >= 0 ? '+' : ''}{item.balance}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {item.balance >= 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full text-sm font-medium">
                            <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                            Good Standing
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-400 bg-red-500/10 px-3 py-1 rounded-full text-sm font-medium">
                            <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                            Payment Due
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex justify-start text-slate-500 text-sm">
          <p>Sarawak MedChain Admin Portal</p>
        </div>

        {/* ========== OFFICIAL SARAWAK GOVERNMENT-STYLE INVOICE MODAL ========== */}
        {showInvoiceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowInvoiceModal(false)}
            />

            {/* Invoice Document */}
            <div className="relative bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              {/* Official Header with Sarawak Branding */}
              <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-8 py-6 text-white">
                <div className="grid grid-cols-12 gap-4 items-center">
                  {/* Logo & Government Title */}
                  <div className="col-span-12 lg:col-span-8">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
                        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-widest font-medium">Kerajaan Negeri Sarawak</p>
                        <h1 className="text-2xl font-bold">SARAWAK MEDCHAIN</h1>
                        <p className="text-sm text-slate-300">Healthcare Blockchain Services</p>
                      </div>
                    </div>
                  </div>
                  {/* Invoice Badge */}
                  <div className="col-span-12 lg:col-span-4 text-right">
                    <div className="inline-block bg-white/10 rounded-xl px-6 py-3 border border-white/20">
                      <p className="text-xs text-slate-400 uppercase tracking-wide">Official Invoice</p>
                      <p className="text-xl font-bold text-white">INV-2026-01-{String(Date.now()).slice(-4)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Invoice Body */}
              <div className="p-8">
                {/* Bill To & Invoice Details Grid */}
                <div className="grid grid-cols-12 gap-8 mb-8">
                  {/* Bill To */}
                  <div className="col-span-12 lg:col-span-6">
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Bill To</p>
                      <p className="text-lg font-bold text-slate-800">{facilityType === 'Hospital' ? 'Hospital General Sarawak' : 'Klinik Kesihatan'}</p>
                      <p className="text-sm text-slate-600 mt-1">{tierName}</p>
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <p className="text-xs text-slate-500">Wallet Address</p>
                        <code className="text-xs font-mono text-slate-700 bg-slate-100 px-2 py-1 rounded mt-1 block">
                          {walletAddress}
                        </code>
                      </div>
                    </div>
                  </div>
                  {/* Invoice Details */}
                  <div className="col-span-12 lg:col-span-6">
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Invoice Details</p>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-slate-500">Invoice Date:</span>
                          <span className="text-sm font-medium text-slate-800">{new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-slate-500">Billing Period:</span>
                          <span className="text-sm font-medium text-slate-800">January 2026</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-slate-500">Due Date:</span>
                          <span className="text-sm font-medium text-slate-800">31 January 2026</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-slate-200">
                          <span className="text-sm text-slate-500">Status:</span>
                          <span className={`text-sm font-bold ${subscriptionPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {subscriptionPaid ? 'PAID' : 'PAYMENT DUE'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Invoice Line Items Table */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-8">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="text-left px-6 py-4 font-semibold text-sm">Description</th>
                        <th className="text-center px-6 py-4 font-semibold text-sm">Quantity</th>
                        <th className="text-right px-6 py-4 font-semibold text-sm">Unit Price (RM)</th>
                        <th className="text-right px-6 py-4 font-semibold text-sm">Amount (RM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Base Subscription Fee */}
                      <tr className="border-b border-slate-100">
                        <td className="px-6 py-5">
                          <p className="font-semibold text-slate-800">Monthly Subscription Fee</p>
                          <p className="text-sm text-slate-500">{tierName} - {facilityType}</p>
                        </td>
                        <td className="px-6 py-5 text-center text-slate-600">1</td>
                        <td className="px-6 py-5 text-right text-slate-600">{baseFee.toLocaleString()}.00</td>
                        <td className="px-6 py-5 text-right font-bold text-slate-800">{baseFee.toLocaleString()}.00</td>
                      </tr>
                      {/* Blockchain Ledger Fee (MC Usage) */}
                      <tr className="border-b border-slate-100 bg-emerald-50/30">
                        <td className="px-6 py-5">
                          <p className="font-semibold text-slate-800">Blockchain Ledger Fee</p>
                          <p className="text-sm text-slate-500">Medical Certificate Issuance</p>
                        </td>
                        <td className="px-6 py-5 text-center text-slate-600">{mcsIssuedThisMonth}</td>
                        <td className="px-6 py-5 text-right text-slate-600">{mcCost.toFixed(2)}</td>
                        <td className="px-6 py-5 text-right font-bold text-emerald-600">{meteredUsageCost.toLocaleString()}.00</td>
                      </tr>
                      {/* Payments Received (if any) */}
                      {subscriptionPaid && (
                        <tr className="border-b border-slate-100 bg-sky-50/30">
                          <td className="px-6 py-5">
                            <p className="font-semibold text-slate-800">Payment Received</p>
                            <p className="text-sm text-slate-500">Base subscription fee</p>
                          </td>
                          <td className="px-6 py-5 text-center text-slate-600">-</td>
                          <td className="px-6 py-5 text-right text-slate-600">-</td>
                          <td className="px-6 py-5 text-right font-bold text-sky-600">-{baseFeePayment.toLocaleString()}.00</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      {/* Subtotal */}
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={3} className="px-6 py-4 text-right font-semibold text-slate-600">Subtotal</td>
                        <td className="px-6 py-4 text-right font-bold text-slate-800">RM {(baseFee + meteredUsageCost).toLocaleString()}.00</td>
                      </tr>
                      {/* Tax (0% for government) */}
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={3} className="px-6 py-4 text-right font-semibold text-slate-600">SST (0% Government Exemption)</td>
                        <td className="px-6 py-4 text-right text-slate-600">RM 0.00</td>
                      </tr>
                      {/* Total Due */}
                      <tr className="bg-slate-800 text-white">
                        <td colSpan={3} className="px-6 py-5 text-right font-bold text-lg">TOTAL DUE</td>
                        <td className="px-6 py-5 text-right font-black text-2xl">RM {totalDue.toLocaleString()}.00</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Payment Information & Footer */}
                <div className="grid grid-cols-12 gap-8">
                  {/* Payment Details */}
                  <div className="col-span-12 lg:col-span-6">
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Payment Information</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Bank:</span>
                          <span className="font-medium text-slate-800">CIMB Bank Berhad</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Account Name:</span>
                          <span className="font-medium text-slate-800">Sarawak MedChain Sdn Bhd</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Account No:</span>
                          <span className="font-medium text-slate-800">8600-1234-5678</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Reference:</span>
                          <span className="font-medium text-slate-800">INV-2026-01-{String(Date.now()).slice(-4)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Terms & Notes */}
                  <div className="col-span-12 lg:col-span-6">
                    <div className="bg-amber-50 rounded-xl p-5 border border-amber-200">
                      <p className="text-xs text-amber-700 uppercase tracking-wider font-semibold mb-3">Terms & Conditions</p>
                      <ul className="text-sm text-amber-800 space-y-1">
                        <li>Payment due within 30 days of invoice date</li>
                        <li>Late payments may incur 1.5% monthly interest</li>
                        <li>All fees are non-refundable once processed</li>
                        <li>Blockchain ledger fees are calculated per MC issued</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Official Footer */}
                <div className="mt-8 pt-6 border-t border-slate-200">
                  <div className="grid grid-cols-12 gap-8 items-center">
                    <div className="col-span-12 lg:col-span-8">
                      <p className="text-xs text-slate-500">
                        This is a computer-generated invoice and does not require a signature.
                        For inquiries, contact billing@sarawak-medchain.gov.my
                      </p>
                      <p className="text-xs text-slate-400 mt-2">
                        Sarawak MedChain - Blockchain-Secured Healthcare Records for Sarawak
                      </p>
                    </div>
                    <div className="col-span-12 lg:col-span-4 text-right">
                      <div className="inline-flex items-center gap-2 text-emerald-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span className="text-sm font-semibold">Verified on Blockchain</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="bg-slate-50 px-8 py-5 border-t border-slate-200 flex items-center justify-between">
                <button
                  onClick={() => setShowInvoiceModal(false)}
                  className="px-6 py-3 rounded-xl font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-all"
                >
                  Close
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print Invoice
                  </button>
                  {!subscriptionPaid && (
                    <button
                      onClick={() => {
                        setShowInvoiceModal(false);
                        handleProcessMonthlyPayment();
                      }}
                      className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                      style={{ backgroundColor: sarawakBlue, boxShadow: `0 8px 20px ${sarawakBlue}40` }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      Pay Now - RM {totalDue.toLocaleString()}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========== PAYMENT SIMULATION OVERLAY ========== */}
        {showPaymentOverlay && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Blur Backdrop */}
            <div
              className="absolute inset-0 bg-slate-900/80"
              style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            />

            {/* Payment Card */}
            <div className="relative bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 rounded-3xl shadow-2xl border border-slate-700/50 p-10 max-w-lg w-full mx-4 overflow-hidden">
              {/* Animated Background Gradient */}
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  background: paymentStage === 'success'
                    ? 'radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.3) 0%, transparent 70%)'
                    : 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.3) 0%, transparent 70%)',
                  animation: 'pulse 2s ease-in-out infinite'
                }}
              />

              <div className="relative text-center">
                {/* Broadcasting & Verifying Stage */}
                {paymentStage !== 'success' && (
                  <>
                    {/* Rotating Blockchain Icon */}
                    <div className="mb-8 flex justify-center">
                      <div
                        className="w-28 h-28 rounded-full flex items-center justify-center"
                        style={{
                          background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 50%, #EC4899 100%)',
                          animation: 'spin 3s linear infinite',
                          boxShadow: '0 0 40px rgba(59, 130, 246, 0.5), 0 0 80px rgba(139, 92, 246, 0.3)'
                        }}
                      >
                        <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center">
                          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Status Text */}
                    <h2 className="text-2xl font-bold text-white mb-3">
                      {paymentStage === 'broadcasting'
                        ? 'Broadcasting Transaction...'
                        : 'Verifying Payment...'}
                    </h2>
                    <p className="text-slate-400 mb-6">
                      {paymentStage === 'broadcasting'
                        ? 'Broadcasting Transaction to Sarawak MedChain...'
                        : `Verifying RM ${paymentAmount.toLocaleString()} Payment...`}
                    </p>

                    {/* Progress Dots */}
                    <div className="flex justify-center gap-2 mb-6">
                      <div className={`w-3 h-3 rounded-full ${paymentStage === 'broadcasting' ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                      <div className={`w-3 h-3 rounded-full ${paymentStage === 'verifying' ? 'bg-blue-500 animate-pulse' : 'bg-slate-600'}`}></div>
                      <div className="w-3 h-3 rounded-full bg-slate-600"></div>
                    </div>

                    {/* Amount Being Processed */}
                    <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
                      <p className="text-slate-400 text-sm mb-1">Amount</p>
                      <p className="text-4xl font-black text-white">RM {paymentAmount.toLocaleString()}</p>
                    </div>
                  </>
                )}

                {/* Success Stage */}
                {paymentStage === 'success' && (
                  <>
                    {/* Large Green Checkmark */}
                    <div className="mb-8 flex justify-center">
                      <div
                        className="w-32 h-32 rounded-full flex items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-600"
                        style={{
                          boxShadow: '0 0 60px rgba(16, 185, 129, 0.5), 0 0 100px rgba(16, 185, 129, 0.3)',
                          animation: 'success-pop 0.5s ease-out'
                        }}
                      >
                        <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>

                    {/* Success Text */}
                    <h2 className="text-3xl font-bold text-emerald-400 mb-2">Payment Successful!</h2>
                    <p className="text-slate-400 mb-6">Your transaction has been confirmed on the blockchain</p>

                    {/* Transaction Details */}
                    <div className="bg-slate-800/50 rounded-2xl p-5 border border-emerald-500/30 mb-6">
                      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-700">
                        <span className="text-slate-400">Amount Paid</span>
                        <span className="text-2xl font-bold text-emerald-400">RM {paymentAmount.toLocaleString()}</span>
                      </div>
                      <div className="text-left">
                        <p className="text-slate-400 text-sm mb-2">Transaction Hash</p>
                        <code className="block bg-slate-900/50 px-4 py-3 rounded-xl text-xs font-mono text-emerald-400 break-all border border-slate-700">
                          {transactionHash.slice(0, 10)}...{transactionHash.slice(-8)}
                        </code>
                      </div>
                    </div>

                    {/* Updated Balance Info */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                        <p className="text-slate-400 text-xs mb-1">Amount Due</p>
                        <p className="text-2xl font-bold text-white">RM 0</p>
                      </div>
                      <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/30">
                        <p className="text-emerald-400 text-xs mb-1">Credits Added</p>
                        <p className="text-2xl font-bold text-emerald-400">+{Math.floor(paymentAmount / mcCost)}</p>
                      </div>
                    </div>

                    {/* Close Button */}
                    <button
                      onClick={closePaymentOverlay}
                      className="w-full py-4 rounded-xl font-bold text-lg text-white transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                      style={{
                        backgroundColor: sarawakBlue,
                        boxShadow: `0 10px 30px ${sarawakBlue}50`
                      }}
                    >
                      Done
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* CSS Animations */}
            <style>{`
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
              @keyframes success-pop {
                0% { transform: scale(0); opacity: 0; }
                50% { transform: scale(1.2); }
                100% { transform: scale(1); opacity: 1; }
              }
              @keyframes pulse {
                0%, 100% { opacity: 0.3; }
                50% { opacity: 0.5; }
              }
            `}</style>
          </div>
        )}
        </div>
    </div>
  );
}
