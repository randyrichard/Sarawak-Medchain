import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getAllHospitalBalances } from '../utils/contract';
import { useBilling } from '../context/BillingContext';

// Mock flu season data - in production, this would come from actual MC issuance dates
const generateFluSeasonData = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((month, index) => {
    // Simulate flu season spikes (higher in monsoon months: Oct-Feb)
    let baseValue = 50;
    if (index >= 9 || index <= 1) baseValue = 120; // Oct-Feb spike
    if (index >= 5 && index <= 7) baseValue = 80; // Jun-Aug moderate
    const randomVariation = Math.floor(Math.random() * 30) - 15;
    const mcs = Math.max(20, baseValue + randomVariation);
    return {
      month,
      mcsIssued: mcs,
      previousYear: Math.max(15, baseValue - 20 + Math.floor(Math.random() * 20)),
      revenue: mcs * 1, // RM1 per MC
      prevRevenue: Math.max(15, baseValue - 20 + Math.floor(Math.random() * 20))
    };
  });
};

// Stat Card Component - Enterprise Style
function StatCard({ title, value, subtitle, icon, trend, darkMode }) {
  return (
    <div className={`rounded-xl p-6 shadow-lg transition-all duration-300 hover:shadow-xl ${
      darkMode
        ? 'bg-gray-800 border border-gray-700'
        : 'bg-white border border-gray-100'
    }`}>
      <div className="flex items-center justify-start gap-x-4">
        <div>
          <p className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {title}
          </p>
          <p className={`text-3xl font-bold mt-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {value}
          </p>
          {subtitle && (
            <p className={`text-sm mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {subtitle}
            </p>
          )}
          {trend && (
            <p className={`text-sm mt-2 ${trend > 0 ? 'text-green-500' : 'text-red-500'}`}>
              {trend > 0 ? '+' : ''}{trend}% from last month
            </p>
          )}
        </div>
        <div className={`p-4 rounded-full ${
          darkMode ? 'bg-gray-700' : 'bg-blue-50'
        }`}>
          <span className="text-3xl">{icon}</span>
        </div>
      </div>
    </div>
  );
}

export default function CEODashboard({ walletAddress }) {
  // Use Billing Context for consistent billing data
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

  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalMCs: 0,
    activeDoctors: 0,
    revenue: 0
  });
  const [fluData, setFluData] = useState([]);
  const [hospitalBalances, setHospitalBalances] = useState([]);

  // Payment processing state
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Derived billing values (using context)
  const facilityType = accountType;
  const setFacilityType = changeAccountType;
  const baseFee = monthlySubscriptionFee;
  const tierName = currentTier.name;
  const mcCost = mcRate;
  const meteredUsageCost = variableUsageCost;
  const totalDue = totalOutstandingBalance;
  const baseFeeDetected = subscriptionPaid;
  const baseFeePayment = subscriptionPaid ? baseFee : 0;
  const isSubscriptionOverdue = !subscriptionPaid && totalDue > 0;

  // Color scheme
  const sarawakRed = '#DC2626'; // For overdue alerts
  const sarawakBlue = '#007BFF'; // Professional Sarawak Blue for buttons
  const medicalBlue = '#0284C7'; // For View Invoice button

  useEffect(() => {
    fetchDashboardData();
    setFluData(generateFluSeasonData());
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch hospital balances from contract
      const balances = await getAllHospitalBalances();
      setHospitalBalances(balances);

      // Calculate stats
      const activeDoctors = balances.length;
      const totalMCs = balances.reduce((sum, b) => {
        // Each MC costs 1 credit, so negative balance = MCs issued beyond credits
        // Credits added - current balance = MCs issued
        return sum + Math.abs(Math.min(0, b.balance)) + (10 - Math.max(0, b.balance));
      }, 0);

      // For demo, use a simpler calculation
      const totalMCsSimple = balances.reduce((sum, b) => sum + (10 - b.balance), 0);

      setStats({
        totalMCs: Math.max(0, totalMCsSimple),
        activeDoctors,
        revenue: Math.max(0, totalMCsSimple) // RM1 per MC
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Use mock data if contract call fails
      setStats({
        totalMCs: 156,
        activeDoctors: 2,
        revenue: 156
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const handlePayNow = async () => {
    try {
      setPaymentProcessing(true);
      setPaymentSuccess(false);

      const result = await processPayment(totalDue);

      if (result.success) {
        setPaymentSuccess(true);

        // Auto-hide success after 5 seconds
        setTimeout(() => {
          setPaymentSuccess(false);
        }, 5000);

        // Refresh billing data
        await refreshBillingData();
        await fetchDashboardData();
      }
    } catch (error) {
      console.error('Payment error:', error);
    } finally {
      setPaymentProcessing(false);
    }
  };

  return (
    <div className={`flex-1 flex-grow w-full min-h-full px-12 py-10 font-sans transition-colors duration-300 ${
      darkMode ? 'bg-slate-900' : 'bg-slate-100'
    }`}>
      {/* Header - Full Width Enterprise Style */}
      <div className="mb-8 flex flex-col lg:flex-row lg:items-center justify-start gap-6">
        <div className="flex items-center gap-4">
          <h1 className={`text-3xl lg:text-4xl font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            CEO Dashboard
          </h1>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
          }`}>
            Analytics
          </span>
        </div>

        {/* Dark Mode Toggle */}
        <button
          onClick={toggleDarkMode}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all lg:ml-auto ${
            darkMode
              ? 'bg-amber-500 text-slate-900 hover:bg-amber-400'
              : 'bg-slate-800 text-white hover:bg-slate-700'
          }`}
        >
          <span className="text-lg">{darkMode ? '☀️' : '🌙'}</span>
          <span className="font-medium text-sm">{darkMode ? 'Light' : 'Dark'}</span>
        </button>
      </div>

        {/* Payment Success Notification */}
        {paymentSuccess && (
          <div className={`mb-6 rounded-xl px-6 py-4 flex items-center gap-3 ${
            darkMode
              ? 'bg-emerald-500/10 border border-emerald-500/30'
              : 'bg-emerald-50 border border-emerald-200'
          }`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              darkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
            }`}>
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className={`font-semibold ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>Payment Successful!</p>
              <p className={`text-sm ${darkMode ? 'text-emerald-400/80' : 'text-emerald-600'}`}>Your monthly payment has been processed</p>
            </div>
          </div>
        )}

        {/* ========== SUBSCRIPTION & USAGE CARD (col-span-12) ========== */}
        <div className="col-span-12 mb-8">
          <div className={`rounded-2xl shadow-2xl overflow-hidden ${
            darkMode
              ? 'bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 border border-slate-700/50'
              : 'bg-white border border-gray-200'
          }`}>
            {/* Card Header */}
            <div className={`px-8 py-5 border-b ${
              darkMode ? 'border-slate-700/50 bg-slate-800/80' : 'border-gray-100 bg-gray-50'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${sarawakBlue}20` }}>
                    <svg className="w-6 h-6" style={{ color: sarawakBlue }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Subscription & Usage</h2>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>January 2026 Billing Period</p>
                  </div>
                </div>
                {/* Tier Selector */}
                <div className="flex items-center gap-3">
                  <select
                    value={facilityType}
                    onChange={(e) => setFacilityType(e.target.value)}
                    className={`text-sm font-medium rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 ${
                      darkMode
                        ? 'bg-slate-700 border border-slate-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-900'
                    }`}
                  >
                    <option value="Hospital">Hospital</option>
                    <option value="Clinic">Clinic</option>
                  </select>
                  <span className={`px-4 py-2 rounded-full text-sm font-bold ${
                    subscriptionPaid
                      ? darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                      : darkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'
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
                  <div className={`rounded-xl p-5 border ${
                    darkMode ? 'bg-slate-700/30 border-slate-600/30' : 'bg-gray-50 border-gray-100'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          facilityType === 'Hospital'
                            ? darkMode ? 'bg-sky-500/20' : 'bg-sky-100'
                            : darkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
                        }`}>
                          <svg className={`w-6 h-6 ${facilityType === 'Hospital' ? 'text-sky-500' : 'text-emerald-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <div>
                          <p className={`font-semibold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>Base Fee</p>
                          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{tierName}</p>
                        </div>
                      </div>
                      <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        RM {baseFee.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* MC Usage - Live Counter */}
                  <div className={`rounded-xl p-5 border ${
                    darkMode ? 'bg-slate-700/30 border-slate-600/30' : 'bg-gray-50 border-gray-100'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          darkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
                        }`}>
                          <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`font-semibold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>MC Usage</p>
                            <span className="flex items-center gap-1 text-emerald-500 text-xs font-medium bg-emerald-500/20 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                              LIVE
                            </span>
                          </div>
                          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                            <span className={`font-bold text-xl ${darkMode ? 'text-white' : 'text-gray-900'}`}>{mcsIssuedThisMonth}</span> MCs × RM {mcCost.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-emerald-500">
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
                        ? darkMode
                          ? 'bg-gradient-to-br from-emerald-600/20 to-emerald-800/20 border border-emerald-500/30'
                          : 'bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200'
                        : darkMode
                          ? 'bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50'
                          : 'bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300'
                  }`}>
                    <p className={`text-sm font-semibold uppercase tracking-wider mb-2 ${
                      isSubscriptionOverdue ? 'text-red-200' : subscriptionPaid ? (darkMode ? 'text-emerald-400' : 'text-emerald-700') : (darkMode ? 'text-slate-400' : 'text-gray-600')
                    }`}>
                      Total Due
                    </p>
                    <p className={`text-6xl font-black mb-2 ${
                      isSubscriptionOverdue ? 'text-white' : subscriptionPaid ? (darkMode ? 'text-emerald-400' : 'text-emerald-700') : (darkMode ? 'text-white' : 'text-gray-900')
                    }`}>
                      RM {totalDue.toLocaleString()}
                    </p>
                    <p className={`text-sm mb-6 ${
                      isSubscriptionOverdue ? 'text-red-200' : subscriptionPaid ? (darkMode ? 'text-emerald-400/70' : 'text-emerald-600') : (darkMode ? 'text-slate-400' : 'text-gray-500')
                    }`}>
                      Base: RM {baseFee.toLocaleString()} + Usage: RM {meteredUsageCost.toLocaleString()}
                    </p>

                    {subscriptionPaid ? (
                      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${
                        darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-200/50 text-emerald-700'
                      }`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-semibold">All Dues Cleared</span>
                      </div>
                    ) : (
                      <button
                        onClick={handlePayNow}
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

        {/* Monetization Engine - Full Width Subscription Banner */}
        <div className="col-span-12 mb-8">
          <div className={`rounded-2xl p-6 ${
            isSubscriptionOverdue
              ? darkMode
                ? 'bg-gradient-to-r from-red-900/40 to-slate-900 border-2 border-red-500/50'
                : 'bg-gradient-to-r from-red-50 to-white border-2 border-red-300'
              : darkMode
                ? 'bg-gradient-to-r from-sky-900/40 to-slate-900 border border-sky-500/30'
                : 'bg-gradient-to-r from-sky-50 to-white border border-sky-200 shadow-lg'
          }`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              {/* Entity Type & Subscription Info */}
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                  facilityType === 'Hospital'
                    ? darkMode ? 'bg-sky-500/20' : 'bg-sky-100'
                    : darkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
                }`}>
                  <svg className={`w-7 h-7 ${facilityType === 'Hospital' ? 'text-sky-500' : 'text-emerald-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <select
                      value={facilityType}
                      onChange={(e) => setFacilityType(e.target.value)}
                      className={`text-sm rounded-lg px-3 py-1 focus:ring-2 focus:ring-sky-500 ${
                        darkMode
                          ? 'bg-slate-700/50 border border-slate-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-900'
                      }`}
                    >
                      <option value="Hospital">Hospital</option>
                      <option value="Clinic">Clinic</option>
                    </select>
                    {isSubscriptionOverdue && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: `${sarawakRed}20`, color: sarawakRed }}>
                        Overdue
                      </span>
                    )}
                  </div>
                  <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {tierName} <span className={darkMode ? 'text-slate-400' : 'text-gray-400'}>—</span> <span className="text-sky-500">RM {baseFee.toLocaleString()}/mo</span>
                  </p>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    {facilityType === 'Hospital'
                      ? 'Unlimited doctors • Priority support • Full API access'
                      : 'Up to 5 doctors • Email support • Standard API access'}
                  </p>
                </div>
              </div>

              {/* View Invoice Button */}
              <button
                onClick={handlePayNow}
                className="px-8 py-3 rounded-xl font-semibold text-white transition-all shadow-lg flex items-center gap-2"
                style={{ backgroundColor: medicalBlue, boxShadow: `0 10px 25px ${medicalBlue}40` }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                View Invoice
              </button>
            </div>
          </div>
        </div>

        {/* Transaction Meter & Real-time Costing */}
        <div className="grid grid-cols-12 gap-6 w-full mb-8">
          {/* Live Transaction Meter */}
          <div className={`col-span-12 lg:col-span-4 rounded-2xl p-6 ${
            darkMode
              ? 'bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700'
              : 'bg-white border border-gray-100 shadow-lg'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Transaction Meter</h2>
              <span className="flex items-center gap-1.5 text-emerald-500 text-xs font-medium">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                LIVE
              </span>
            </div>
            <div className="text-center py-4">
              <p className={`text-6xl font-black tabular-nums ${darkMode ? 'text-white' : 'text-gray-900'}`}>{stats.totalMCs}</p>
              <p className={`text-sm mt-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>MCs Issued This Month</p>
            </div>
            <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
              <div className="flex items-center justify-between text-sm">
                <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>Rate per MC</span>
                <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>RM {mcCost.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Real-time Costing */}
          <div className={`col-span-12 lg:col-span-4 rounded-2xl p-6 ${
            darkMode
              ? 'bg-gradient-to-br from-emerald-900/30 to-slate-900 border border-emerald-700/30'
              : 'bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 shadow-lg'
          }`}>
            <h2 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Real-time Costing</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>Base Subscription</span>
                <span className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>RM {baseFee.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>Metered Usage ({stats.totalMCs} × RM1)</span>
                <span className="text-emerald-500 font-medium">RM {meteredUsageCost.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={darkMode ? 'text-slate-400' : 'text-gray-500'}>Payments Received</span>
                <span className="text-sky-500 font-medium">- RM {baseFeePayment.toLocaleString()}</span>
              </div>
              <div className={`pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-emerald-100'}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Sub-Total Due</span>
                  <span className={`text-2xl font-bold ${isSubscriptionOverdue ? 'text-red-500' : 'text-emerald-500'}`}>
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
                onClick={handlePayNow}
                className="w-full py-3 rounded-lg font-semibold text-white transition-all"
                style={{ backgroundColor: isSubscriptionOverdue ? sarawakRed : medicalBlue }}
              >
                {isSubscriptionOverdue ? 'Pay Overdue Balance' : 'Pay Now'}
              </button>
            )}
          </div>
        </div>

        {/* Monthly Dues Table */}
        <div className={`rounded-2xl overflow-hidden mb-8 ${
          darkMode ? 'bg-slate-800/50 border border-slate-700' : 'bg-white shadow-lg'
        }`}>
          <div className={`px-6 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Monthly Dues</h2>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Invoice history and payment status</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={darkMode ? 'bg-slate-700/30' : 'bg-gray-50'}>
                  <th className={`text-left px-6 py-4 font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Billing Period</th>
                  <th className={`text-right px-6 py-4 font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Base Fee</th>
                  <th className={`text-right px-6 py-4 font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Metered Usage</th>
                  <th className={`text-right px-6 py-4 font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Total</th>
                  <th className={`text-right px-6 py-4 font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Status</th>
                  <th className={`text-right px-6 py-4 font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-t transition-colors ${
                  darkMode ? 'border-slate-700/30 hover:bg-slate-700/20' : 'border-gray-100 hover:bg-gray-50'
                }`}>
                  <td className={`px-6 py-4 font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>January 2026</td>
                  <td className={`px-6 py-4 text-right ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>RM {baseFee.toLocaleString()}</td>
                  <td className={`px-6 py-4 text-right ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>RM {meteredUsageCost.toLocaleString()}</td>
                  <td className={`px-6 py-4 text-right font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>RM {totalDue.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    {baseFeeDetected ? (
                      <span className="inline-flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full text-sm font-medium">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                        Paid
                      </span>
                    ) : isSubscriptionOverdue ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: `${sarawakRed}15`, color: sarawakRed }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sarawakRed }}></span>
                        Overdue
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full text-sm font-medium">
                        <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={handlePayNow}
                      disabled={baseFeeDetected}
                      className="px-4 py-2 rounded-lg font-semibold text-sm transition-all text-white"
                      style={{
                        backgroundColor: baseFeeDetected ? '#10B981' : medicalBlue,
                        boxShadow: baseFeeDetected ? 'none' : `0 4px 15px ${medicalBlue}40`,
                        cursor: baseFeeDetected ? 'default' : 'pointer'
                      }}
                    >
                      {baseFeeDetected ? 'Paid' : 'View Invoice'}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-start h-64">
            <div className={`text-lg ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Loading dashboard data...
            </div>
          </div>
        ) : (
          <>
            {/* Stats Cards Grid - Full Width 12 Column */}
            <div className="grid grid-cols-12 gap-10 w-full mb-8">
              <div className="col-span-12 md:col-span-4">
                <StatCard
                  title="Total MCs Issued"
                  value={stats.totalMCs.toLocaleString()}
                  subtitle="Medical certificates this period"
                  icon="📋"
                  trend={12}
                  darkMode={darkMode}
                />
              </div>
              <div className="col-span-12 md:col-span-4">
                <StatCard
                  title="Active Verified Doctors"
                  value={stats.activeDoctors}
                  subtitle="Currently registered doctors"
                  icon="👨‍⚕️"
                  trend={5}
                  darkMode={darkMode}
                />
              </div>
              <div className="col-span-12 md:col-span-4">
                <StatCard
                  title="Revenue Generated"
                  value={`RM ${stats.revenue.toLocaleString()}`}
                  subtitle="At RM1 per MC issued"
                  icon="💰"
                  trend={15}
                  darkMode={darkMode}
                />
              </div>
            </div>

            {/* Charts Grid - Full Width */}
            <div className="grid grid-cols-12 gap-8 mb-8">
              {/* Flu Season Chart - col-span-7 */}
              <div className={`col-span-12 xl:col-span-7 rounded-3xl p-8 shadow-md ${
                darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'
              }`}>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      12-Month MC Issuance Trend
                    </h2>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Flu season spikes for staff allocation planning
                    </p>
                  </div>
                </div>

                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={fluData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={darkMode ? '#374151' : '#e5e7eb'}
                      />
                      <XAxis
                        dataKey="month"
                        stroke={darkMode ? '#9ca3af' : '#6b7280'}
                        tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }}
                      />
                      <YAxis
                        stroke={darkMode ? '#9ca3af' : '#6b7280'}
                        tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                          border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                          borderRadius: '12px',
                          color: darkMode ? '#ffffff' : '#000000'
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="mcsIssued"
                        name="MCs This Year"
                        stroke="#3b82f6"
                        strokeWidth={3}
                        dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 8 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="previousYear"
                        name="Previous Year"
                        stroke="#9ca3af"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ fill: '#9ca3af', strokeWidth: 2, r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Revenue Chart - col-span-5 */}
              <div className={`col-span-12 xl:col-span-5 rounded-3xl p-8 shadow-md ${
                darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'
              }`}>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Revenue Trend (RM)
                    </h2>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Monthly revenue at RM1/MC
                    </p>
                  </div>
                </div>

                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={fluData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={darkMode ? '#374151' : '#e5e7eb'}
                      />
                      <XAxis
                        dataKey="month"
                        stroke={darkMode ? '#9ca3af' : '#6b7280'}
                        tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }}
                      />
                      <YAxis
                        stroke={darkMode ? '#9ca3af' : '#6b7280'}
                        tick={{ fill: darkMode ? '#9ca3af' : '#6b7280', fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: darkMode ? '#1f2937' : '#ffffff',
                          border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                          borderRadius: '12px',
                          color: darkMode ? '#ffffff' : '#000000'
                        }}
                        formatter={(value) => [`RM ${value}`, 'Revenue']}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        name="Revenue (RM)"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 8 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Key Insights Card */}
            <div className={`rounded-3xl p-8 shadow-md mb-8 ${
              darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'
            }`}>
              <h3 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                📊 Key Insights
              </h3>
              <div className="grid grid-cols-12 gap-6">
                <div className={`col-span-12 md:col-span-4 p-5 rounded-2xl ${darkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
                  <p className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Peak Season</p>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>October - February (Monsoon season flu spike)</p>
                </div>
                <div className={`col-span-12 md:col-span-4 p-5 rounded-2xl ${darkMode ? 'bg-gray-700' : 'bg-emerald-50'}`}>
                  <p className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Recommendation</p>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Increase staff allocation by 40% during peak months</p>
                </div>
                <div className={`col-span-12 md:col-span-4 p-5 rounded-2xl ${darkMode ? 'bg-gray-700' : 'bg-amber-50'}`}>
                  <p className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>YoY Trend</p>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>12% increase in MC issuance compared to last year</p>
                </div>
              </div>
            </div>

            {/* Hospital Performance Table */}
            <div className={`rounded-3xl p-8 shadow-md ${
              darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'
            }`}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Doctor Performance Overview
                  </h2>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Credit balances and activity status
                  </p>
                </div>
                <button
                  onClick={fetchDashboardData}
                  className="px-6 py-3 bg-sarawak-blue-500 hover:bg-sarawak-blue-600 text-white rounded-2xl font-semibold transition-all duration-200"
                >
                  Refresh
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={darkMode ? 'border-b border-gray-700' : 'border-b border-gray-200'}>
                      <th className={`text-left py-3 px-4 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        Doctor Address
                      </th>
                      <th className={`text-left py-3 px-4 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        Credit Balance
                      </th>
                      <th className={`text-left py-3 px-4 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {hospitalBalances.length > 0 ? (
                      hospitalBalances.map((hospital, index) => (
                        <tr
                          key={index}
                          className={`${darkMode ? 'border-b border-gray-700 hover:bg-gray-700' : 'border-b border-gray-100 hover:bg-gray-50'}`}
                        >
                          <td className={`py-3 px-4 font-mono text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {hospital.hospital.slice(0, 10)}...{hospital.hospital.slice(-8)}
                          </td>
                          <td className={`py-3 px-4 ${hospital.balance >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {hospital.balance} credits
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              hospital.balance >= 0
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {hospital.balance >= 0 ? 'Active' : 'Owes Payment'}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className={`py-8 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          No doctor data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
    </div>
  );
}
