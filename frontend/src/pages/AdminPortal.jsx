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

// Reusable Card Component for consistent styling
const Card = ({ children, className = '', noPadding = false }) => (
  <div
    className={`bg-slate-800/60 backdrop-blur-sm rounded-2xl ${noPadding ? '' : 'p-6'} ${className}`}
    style={{ border: '1px solid rgba(20, 184, 166, 0.2)' }}
  >
    {children}
  </div>
);

// Section Header Component
const SectionHeader = ({ title, subtitle, icon, badge }) => (
  <div className="flex items-center justify-between mb-6">
    <div className="flex items-center gap-3">
      {icon && (
        <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
          {icon}
        </div>
      )}
      <div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {subtitle && <p className="text-slate-400 text-sm">{subtitle}</p>}
      </div>
    </div>
    {badge}
  </div>
);

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
  const [paymentStage, setPaymentStage] = useState('broadcasting');
  const [transactionHash, setTransactionHash] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);

  // Derived billing values
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

  useEffect(() => {
    fetchData();
    setDoctorPerformance(generateDoctorPerformanceData());
  }, [walletAddress]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const billing = getBillingContract();
      const mcCount = await billing.getMCCount();
      setTotalMCs(Number(mcCount));

      const balances = await getAllHospitalBalances();
      setHospitalBalances(balances);
      setActiveDoctors(balances.length);

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

  const generateTransactionHash = () => {
    const chars = '0123456789abcdef';
    let hash = '0x';
    for (let i = 0; i < 64; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  };

  const handleProcessMonthlyPayment = async () => {
    setPaymentAmount(totalDue);
    setShowPaymentOverlay(true);
    setPaymentStage('broadcasting');
    setPaymentProcessing(true);
    setPaymentSuccess(false);

    await new Promise(resolve => setTimeout(resolve, 1500));
    setPaymentStage('verifying');
    await new Promise(resolve => setTimeout(resolve, 1500));

    const txHash = generateTransactionHash();
    setTransactionHash(txHash);
    setPaymentStage('success');

    try {
      const result = await processPayment(totalDue);
      if (result.success) {
        setPaymentSuccess(true);
        setMessage(`Payment successful! Transaction ID: ${result.transactionId}`);
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
    <div className="flex-1 flex-grow w-full min-h-full font-sans" style={{ backgroundColor: '#0a0e14' }}>
      <BroadcastNotification />

      <div className="px-8 lg:px-12 py-8" style={{ maxWidth: '1600px', margin: '0 auto' }}>

        {/* ==================== HEADER SECTION ==================== */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">Hospital Admin Portal</h1>
              <p className="text-slate-400">Sarawak MedChain Enterprise Billing Dashboard</p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={facilityType}
                onChange={(e) => setFacilityType(e.target.value)}
                className="bg-slate-700/50 border border-slate-600 text-white text-sm font-medium rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="Hospital">Hospital</option>
                <option value="Clinic">Clinic</option>
              </select>
              <span className={`px-4 py-2 rounded-full text-sm font-semibold ${
                isAdmin
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : isPendingAdmin
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                    : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
              }`}>
                {isAdmin ? 'Admin' : isPendingAdmin ? 'Pending Admin' : 'Viewer'}
              </span>
            </div>
          </div>
        </div>

        {/* ==================== ALERT BANNERS ==================== */}
        {isSubscriptionOverdue && (
          <div className="mb-6 bg-red-500/10 rounded-2xl p-5 flex items-center justify-between" style={{ border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-red-300 font-semibold text-lg">Monthly Subscription Overdue</p>
                <p className="text-red-400/80 text-sm">{tierName} subscription (RM {baseFee.toLocaleString()}/mo) requires immediate payment</p>
              </div>
            </div>
            <button
              onClick={handleProcessMonthlyPayment}
              className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-all shadow-lg shadow-red-500/25"
            >
              Pay Now
            </button>
          </div>
        )}

        {paymentSuccess && (
          <div className="mb-6 bg-emerald-500/10 rounded-2xl p-5 flex items-center gap-4" style={{ border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-emerald-300 font-semibold text-lg">Payment Successful</p>
              <p className="text-emerald-400/80 text-sm">Your monthly payment has been processed and recorded on the blockchain</p>
            </div>
          </div>
        )}

        {message && (
          <div className={`mb-6 p-4 rounded-xl ${
            message.includes('Error')
              ? 'bg-red-500/10 border border-red-500/30 text-red-400'
              : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
          }`}>
            {message}
          </div>
        )}

        {/* ==================== ROW 1: BILLING SUMMARY (3 Cards) ==================== */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Billing Summary</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Card 1: Subscription & Usage */}
            <Card>
              <SectionHeader
                title="Subscription & Usage"
                subtitle="January 2026"
                icon={<svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}
              />
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-xl">
                  <div>
                    <p className="text-slate-400 text-sm">Base Fee</p>
                    <p className="text-white font-medium">{tierName}</p>
                  </div>
                  <p className="text-2xl font-bold text-white">RM {baseFee.toLocaleString()}</p>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-xl">
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="text-slate-400 text-sm">MC Usage</p>
                      <p className="text-white font-medium">{mcsIssuedThisMonth} MCs × RM {mcCost.toFixed(2)}</p>
                    </div>
                    <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium bg-emerald-500/20 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                      LIVE
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-400">RM {meteredUsageCost.toLocaleString()}</p>
                </div>
              </div>
            </Card>

            {/* Card 2: Monthly Invoice */}
            <Card>
              <SectionHeader
                title="Monthly Invoice"
                subtitle="January 2026"
                icon={<svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                badge={
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    subscriptionPaid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {subscriptionPaid ? 'Paid' : 'Due'}
                  </span>
                }
              />
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Monthly Subscription</span>
                  <span className="text-white font-medium">RM {baseFee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Variable Usage</span>
                  <span className="text-emerald-400 font-medium">RM {meteredUsageCost.toLocaleString()}</span>
                </div>
                {subscriptionPaid && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Payment Received</span>
                    <span className="text-sky-400 font-medium">- RM {baseFeePayment.toLocaleString()}</span>
                  </div>
                )}
                <div className="pt-3 border-t border-slate-700">
                  <div className="flex justify-between">
                    <span className="text-white font-semibold">Total</span>
                    <span className="text-xl font-bold text-teal-400">RM {totalDue.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowInvoiceModal(true)}
                className="w-full mt-4 py-3 bg-slate-700/50 hover:bg-slate-700 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                View Full Invoice
              </button>
            </Card>

            {/* Card 3: Total Due / Payment */}
            <Card className={`${isSubscriptionOverdue ? 'bg-gradient-to-br from-red-900/40 to-red-950/40' : subscriptionPaid ? 'bg-gradient-to-br from-emerald-900/30 to-slate-800/60' : 'bg-gradient-to-br from-teal-900/30 to-slate-800/60'}`}>
              <div className="text-center py-4">
                <p className={`text-sm font-semibold uppercase tracking-wider mb-2 ${
                  isSubscriptionOverdue ? 'text-red-400' : subscriptionPaid ? 'text-emerald-400' : 'text-teal-400'
                }`}>
                  {isSubscriptionOverdue ? 'Amount Overdue' : 'Total Due'}
                </p>
                <p className={`text-5xl font-black mb-2 ${
                  isSubscriptionOverdue ? 'text-red-400' : subscriptionPaid ? 'text-emerald-400' : 'text-white'
                }`}>
                  RM {totalDue.toLocaleString()}
                </p>
                <p className="text-slate-400 text-sm mb-6">
                  Base + Usage = RM {(baseFee + meteredUsageCost).toLocaleString()}
                </p>
                {subscriptionPaid ? (
                  <div className="flex items-center justify-center gap-2 bg-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-semibold">All Dues Cleared</span>
                  </div>
                ) : (
                  <button
                    onClick={handleProcessMonthlyPayment}
                    disabled={paymentProcessing}
                    className={`w-full py-4 rounded-xl font-bold text-lg text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] ${
                      isSubscriptionOverdue
                        ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30'
                        : 'bg-teal-500 hover:bg-teal-600 shadow-lg shadow-teal-500/30'
                    }`}
                  >
                    {paymentProcessing ? 'Processing...' : 'Process Payment'}
                  </button>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* ==================== ROW 2: OPERATIONS (2 Cards) ==================== */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Operations</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Card 1: Transaction Meter + Real-time Costing */}
            <Card>
              <div className="grid grid-cols-2 gap-6">
                {/* Transaction Meter */}
                <div className="text-center p-4 bg-slate-700/30 rounded-xl">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <span className="text-slate-400 text-sm font-medium">Transaction Meter</span>
                    <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                      LIVE
                    </span>
                  </div>
                  <p className="text-5xl font-black text-white tabular-nums mb-2">{totalMCs}</p>
                  <p className="text-slate-400 text-sm">MCs This Month</p>
                  <div className="mt-3 pt-3 border-t border-slate-600">
                    <p className="text-slate-400 text-xs">Rate: <span className="text-white font-semibold">RM {mcCost.toFixed(2)}/MC</span></p>
                  </div>
                </div>

                {/* Real-time Costing */}
                <div className="space-y-3">
                  <p className="text-slate-400 text-sm font-medium mb-3">Real-time Costing</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Base Subscription</span>
                    <span className="text-white font-medium">RM {baseFee.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Metered Usage</span>
                    <span className="text-emerald-400 font-medium">RM {meteredUsageCost.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Payments</span>
                    <span className="text-sky-400 font-medium">- RM {baseFeePayment.toLocaleString()}</span>
                  </div>
                  <div className="pt-3 border-t border-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-semibold">Sub-Total</span>
                      <span className={`text-xl font-bold ${isSubscriptionOverdue ? 'text-red-400' : 'text-teal-400'}`}>
                        RM {totalDue.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Card 2: Outstanding Balance */}
            <Card className={totalOwed > 0 ? 'bg-gradient-to-br from-amber-900/20 to-slate-800/60' : ''}>
              <SectionHeader
                title="Outstanding Balance"
                subtitle="Credit account status"
                icon={<svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-700/30 rounded-xl text-center">
                  <p className="text-slate-400 text-sm mb-1">Total Credits</p>
                  <p className="text-3xl font-bold text-emerald-400">{totalCredits}</p>
                  <p className="text-emerald-400/60 text-xs">Available</p>
                </div>
                <div className={`p-4 rounded-xl text-center ${totalOwed > 0 ? 'bg-amber-500/10' : 'bg-slate-700/30'}`}>
                  <p className="text-slate-400 text-sm mb-1">Total Owed</p>
                  <p className={`text-3xl font-bold ${totalOwed > 0 ? 'text-amber-400' : 'text-slate-400'}`}>{totalOwed}</p>
                  <p className={`text-xs ${totalOwed > 0 ? 'text-amber-400/60' : 'text-slate-500'}`}>{totalOwed > 0 ? 'Payment Due' : 'No dues'}</p>
                </div>
              </div>
              {totalOwed > 0 && (
                <div className="mt-4 p-3 bg-amber-500/10 rounded-xl flex items-center gap-3">
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-amber-300 text-sm font-medium">{totalOwed} credits owed across accounts</span>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* ==================== ROW 3: PERFORMANCE (2 Cards) ==================== */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Performance</h3>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* Card 1: Doctor Leaderboard (2 cols) */}
            <Card noPadding className="lg:col-span-2">
              <div className="px-6 py-4 border-b" style={{ borderColor: 'rgba(20, 184, 166, 0.2)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">Doctor Leaderboard</h3>
                    <p className="text-slate-400 text-xs">Top performers this month</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400">
                    {doctorPerformance.length} Doctors
                  </span>
                </div>
              </div>
              <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                {doctorPerformance.map((doctor, index) => (
                  <div
                    key={doctor.id}
                    className={`p-3 rounded-xl transition-all hover:bg-slate-700/50 ${
                      index === 0 ? 'bg-amber-500/10' : ''
                    }`}
                    style={index === 0 ? { border: '1px solid rgba(245, 158, 11, 0.3)' } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        index === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white'
                          : index === 1 ? 'bg-slate-300 text-slate-700'
                          : index === 2 ? 'bg-amber-700 text-white'
                          : 'bg-slate-700 text-slate-400'
                      }`}>
                        {doctor.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-white truncate">{doctor.name}</p>
                        <p className="text-xs text-slate-400">{doctor.department}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${index === 0 ? 'text-amber-400' : 'text-emerald-400'}`}>RM {doctor.revenue}</p>
                        <p className="text-xs text-slate-500">{doctor.mcsIssued} MCs</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 border-t bg-slate-800/30" style={{ borderColor: 'rgba(20, 184, 166, 0.2)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">Total Revenue</p>
                    <p className="text-lg font-bold text-emerald-400">RM {doctorPerformance.reduce((sum, d) => sum + d.revenue, 0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Total MCs</p>
                    <p className="text-lg font-bold text-white">{doctorPerformance.reduce((sum, d) => sum + d.mcsIssued, 0)}</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Card 2: Performance Overview + Top Performer (3 cols) */}
            <Card className="lg:col-span-3">
              <SectionHeader
                title="Performance Overview"
                icon={<svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
              />

              {/* Top Performer Highlight */}
              {doctorPerformance[0] && (
                <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/5 rounded-xl p-5 mb-6" style={{ border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                      <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider">Top Performer</p>
                      <p className="text-xl font-bold text-white">{doctorPerformance[0].name}</p>
                      <p className="text-slate-400 text-sm">{doctorPerformance[0].department}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-black text-amber-400">RM {doctorPerformance[0].revenue}</p>
                      <p className="text-slate-400 text-sm">{doctorPerformance[0].mcsIssued} MCs issued</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Stats Grid */}
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
                  <p className="text-2xl font-bold text-teal-400">
                    {((doctorPerformance.reduce((sum, d) => sum + d.revenue, 0) / (facilityType === 'Hospital' ? 10000 : 2000)) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* ==================== ROW 4: STATISTICS (3 Cards) ==================== */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Statistics</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Total MCs Issued */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 shadow-xl" style={{ border: '1px solid rgba(59, 130, 246, 0.3)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-500/30 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="text-blue-200 text-xs font-medium bg-blue-500/20 px-3 py-1 rounded-full">All Time</span>
              </div>
              <p className="text-blue-100 text-sm font-medium mb-1">Total MCs Issued</p>
              <p className="text-4xl font-bold text-white">{loading ? '...' : totalMCs.toLocaleString()}</p>
            </div>

            {/* Active Doctors */}
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-6 shadow-xl" style={{ border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-500/30 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <span className="text-emerald-200 text-xs font-medium bg-emerald-500/20 px-3 py-1 rounded-full">Registered</span>
              </div>
              <p className="text-emerald-100 text-sm font-medium mb-1">Active Doctors</p>
              <p className="text-4xl font-bold text-white">{loading ? '...' : activeDoctors}</p>
            </div>

            {/* Available Credits */}
            <div className="bg-gradient-to-br from-violet-600 to-violet-800 rounded-2xl p-6 shadow-xl" style={{ border: '1px solid rgba(139, 92, 246, 0.3)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-violet-500/30 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-violet-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-violet-200 text-xs font-medium bg-violet-500/20 px-3 py-1 rounded-full">Prepaid</span>
              </div>
              <p className="text-violet-100 text-sm font-medium mb-1">Available Credits</p>
              <p className="text-4xl font-bold text-white">{loading ? '...' : totalCredits}</p>
            </div>
          </div>
        </div>

        {/* ==================== ROW 5: MANAGEMENT ==================== */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Management</h3>

          {/* Monthly Dues Table */}
          <Card noPadding className="mb-6">
            <div className="px-6 py-4 border-b" style={{ borderColor: 'rgba(20, 184, 166, 0.2)' }}>
              <h3 className="text-lg font-bold text-white">Monthly Dues</h3>
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
                  <tr className="border-t hover:bg-slate-700/20 transition-colors" style={{ borderColor: 'rgba(20, 184, 166, 0.1)' }}>
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
                        onClick={handleProcessMonthlyPayment}
                        disabled={baseFeeDetected}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                          baseFeeDetected
                            ? 'bg-emerald-600 text-white cursor-default'
                            : 'bg-teal-500 hover:bg-teal-600 text-white shadow-lg shadow-teal-500/25'
                        }`}
                      >
                        {baseFeeDetected ? 'Paid' : 'Pay Now'}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Admin Transfer + Doctor Management */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Admin Transfer */}
            <Card>
              <SectionHeader
                title="Admin Transfer"
                icon={<svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
              />
              <div className="space-y-4">
                <div>
                  <p className="text-slate-400 text-sm mb-1">Current Admin</p>
                  <code className="text-emerald-400 bg-slate-700/50 px-3 py-2 rounded-lg block text-sm">
                    {formatAddress(currentAdmin)}
                  </code>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Pending Admin</p>
                  <code className="text-yellow-400 bg-slate-700/50 px-3 py-2 rounded-lg block text-sm">
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
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 mb-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleProposeAdmin}
                        disabled={actionLoading}
                        className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                      >
                        {actionLoading ? 'Processing...' : 'Propose'}
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
            </Card>

            {/* Doctor Management */}
            <Card className="lg:col-span-2">
              <SectionHeader
                title="Doctor Management"
                subtitle={isAdmin ? 'Add or remove verified doctors' : 'Admin access required'}
                icon={<svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>}
              />
              {isAdmin ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-slate-300 text-sm mb-2 block">Add Verified Doctor</label>
                    <input
                      type="text"
                      placeholder="0x..."
                      value={newDoctorAddress}
                      onChange={(e) => setNewDoctorAddress(e.target.value)}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 mb-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleAddDoctor}
                      disabled={actionLoading}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      {actionLoading ? 'Processing...' : 'Verify Doctor'}
                    </button>
                  </div>
                  <div>
                    <label className="text-slate-300 text-sm mb-2 block">Remove Verified Doctor</label>
                    <input
                      type="text"
                      placeholder="0x..."
                      value={removeDoctorAddress}
                      onChange={(e) => setRemoveDoctorAddress(e.target.value)}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 mb-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
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
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <p className="text-slate-400">Only the admin can manage doctors</p>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* ==================== ROW 6: HOSPITAL BALANCES ==================== */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Account Details</h3>
          <Card noPadding>
            <div className="px-6 py-4 border-b" style={{ borderColor: 'rgba(20, 184, 166, 0.2)' }}>
              <h3 className="text-lg font-bold text-white">Hospital Balances</h3>
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
                      <td colSpan={3} className="px-6 py-8 text-center text-slate-400">Loading...</td>
                    </tr>
                  ) : hospitalBalances.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-slate-400">No hospitals registered yet</td>
                    </tr>
                  ) : (
                    hospitalBalances.map((item, index) => (
                      <tr key={index} className="border-t hover:bg-slate-700/20 transition-colors" style={{ borderColor: 'rgba(20, 184, 166, 0.1)' }}>
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
          </Card>
        </div>

        {/* ==================== FOOTER ==================== */}
        <div className="pt-6 border-t border-slate-800 flex items-center justify-between">
          <p className="text-slate-500 text-sm">Sarawak MedChain Enterprise Portal</p>
          <div className="flex items-center gap-2 text-emerald-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-sm font-medium">Verified on Blockchain</span>
          </div>
        </div>

        {/* ==================== INVOICE MODAL ==================== */}
        {showInvoiceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowInvoiceModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              {/* Invoice Header */}
              <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-8 py-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-widest">Kerajaan Negeri Sarawak</p>
                      <h1 className="text-2xl font-bold">SARAWAK MEDCHAIN</h1>
                      <p className="text-sm text-slate-300">Healthcare Blockchain Services</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="bg-white/10 rounded-xl px-5 py-3 border border-white/20">
                      <p className="text-xs text-slate-400 uppercase tracking-wide">Official Invoice</p>
                      <p className="text-xl font-bold">INV-2026-01-{String(Date.now()).slice(-4)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Invoice Body */}
              <div className="p-8">
                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Bill To</p>
                    <p className="text-lg font-bold text-slate-800">{facilityType === 'Hospital' ? 'Hospital General Sarawak' : 'Klinik Kesihatan'}</p>
                    <p className="text-sm text-slate-600">{tierName}</p>
                    <code className="text-xs font-mono text-slate-500 mt-2 block">{walletAddress}</code>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Invoice Details</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Invoice Date:</span>
                        <span className="font-medium text-slate-800">{new Date().toLocaleDateString('en-MY')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Billing Period:</span>
                        <span className="font-medium text-slate-800">January 2026</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Status:</span>
                        <span className={`font-bold ${subscriptionPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {subscriptionPaid ? 'PAID' : 'DUE'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Line Items */}
                <table className="w-full mb-8 border border-slate-200 rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="text-left px-6 py-4 font-semibold">Description</th>
                      <th className="text-center px-6 py-4 font-semibold">Qty</th>
                      <th className="text-right px-6 py-4 font-semibold">Unit (RM)</th>
                      <th className="text-right px-6 py-4 font-semibold">Amount (RM)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-800">Monthly Subscription</p>
                        <p className="text-sm text-slate-500">{tierName} - {facilityType}</p>
                      </td>
                      <td className="px-6 py-4 text-center text-slate-600">1</td>
                      <td className="px-6 py-4 text-right text-slate-600">{baseFee.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-800">{baseFee.toLocaleString()}</td>
                    </tr>
                    <tr className="border-b border-slate-100 bg-emerald-50/50">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-800">Blockchain Ledger Fee</p>
                        <p className="text-sm text-slate-500">MC Issuance</p>
                      </td>
                      <td className="px-6 py-4 text-center text-slate-600">{mcsIssuedThisMonth}</td>
                      <td className="px-6 py-4 text-right text-slate-600">{mcCost.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-600">{meteredUsageCost.toLocaleString()}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-800 text-white">
                      <td colSpan={3} className="px-6 py-4 text-right font-bold text-lg">TOTAL DUE</td>
                      <td className="px-6 py-4 text-right font-black text-2xl">RM {totalDue.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>

                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Payment Information</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">Bank:</span><span className="font-medium">CIMB Bank Berhad</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Account:</span><span className="font-medium">Sarawak MedChain Sdn Bhd</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Account No:</span><span className="font-medium">8600-1234-5678</span></div>
                    </div>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-5 border border-amber-200">
                    <p className="text-xs text-amber-700 uppercase tracking-wider font-semibold mb-3">Terms</p>
                    <ul className="text-sm text-amber-800 space-y-1">
                      <li>Payment due within 30 days</li>
                      <li>Late payments: 1.5% monthly interest</li>
                      <li>All fees are non-refundable</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Invoice Actions */}
              <div className="bg-slate-50 px-8 py-5 border-t border-slate-200 flex items-center justify-between">
                <button onClick={() => setShowInvoiceModal(false)} className="px-6 py-3 rounded-xl font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100">
                  Close
                </button>
                <div className="flex items-center gap-3">
                  <button onClick={() => window.print()} className="px-6 py-3 rounded-xl font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Print
                  </button>
                  {!subscriptionPaid && (
                    <button
                      onClick={() => { setShowInvoiceModal(false); handleProcessMonthlyPayment(); }}
                      className="px-8 py-3 rounded-xl font-bold text-white bg-teal-500 hover:bg-teal-600 shadow-lg shadow-teal-500/30"
                    >
                      Pay RM {totalDue.toLocaleString()}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAYMENT OVERLAY ==================== */}
        {showPaymentOverlay && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" />
            <div className="relative bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 rounded-3xl shadow-2xl border border-slate-700/50 p-10 max-w-lg w-full mx-4">
              <div className="text-center">
                {paymentStage !== 'success' ? (
                  <>
                    <div className="mb-8 flex justify-center">
                      <div className="w-24 h-24 rounded-full flex items-center justify-center animate-spin" style={{ background: 'linear-gradient(135deg, #14B8A6 0%, #0EA5E9 50%, #8B5CF6 100%)', boxShadow: '0 0 40px rgba(20, 184, 166, 0.5)' }}>
                        <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center">
                          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">
                      {paymentStage === 'broadcasting' ? 'Broadcasting Transaction...' : 'Verifying Payment...'}
                    </h2>
                    <p className="text-slate-400 mb-6">
                      {paymentStage === 'broadcasting' ? 'Sending to Sarawak MedChain...' : `Confirming RM ${paymentAmount.toLocaleString()}...`}
                    </p>
                    <div className="flex justify-center gap-2 mb-6">
                      <div className={`w-3 h-3 rounded-full ${paymentStage === 'broadcasting' ? 'bg-teal-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                      <div className={`w-3 h-3 rounded-full ${paymentStage === 'verifying' ? 'bg-teal-500 animate-pulse' : 'bg-slate-600'}`}></div>
                      <div className="w-3 h-3 rounded-full bg-slate-600"></div>
                    </div>
                    <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
                      <p className="text-slate-400 text-sm mb-1">Amount</p>
                      <p className="text-4xl font-black text-white">RM {paymentAmount.toLocaleString()}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-8 flex justify-center">
                      <div className="w-28 h-28 rounded-full flex items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-600" style={{ boxShadow: '0 0 60px rgba(16, 185, 129, 0.5)' }}>
                        <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                    <h2 className="text-3xl font-bold text-emerald-400 mb-2">Payment Successful!</h2>
                    <p className="text-slate-400 mb-6">Transaction confirmed on blockchain</p>
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
                    <button
                      onClick={closePaymentOverlay}
                      className="w-full py-4 rounded-xl font-bold text-lg text-white bg-teal-500 hover:bg-teal-600 transition-all shadow-lg shadow-teal-500/30"
                    >
                      Done
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
