import { createContext, useContext, useState, useEffect } from 'react';
import { getBillingContract, getAllHospitalBalances } from '../utils/contract';

const BillingContext = createContext(null);

// Subscription tier pricing
const TIERS = {
  Hospital: {
    name: 'Premium Enterprise Tier',
    monthlyFee: 10000,
    features: ['Unlimited doctors', 'Priority support', 'Full API access', 'Custom integrations']
  },
  Clinic: {
    name: 'Standard Tier',
    monthlyFee: 2000,
    features: ['Up to 5 doctors', 'Email support', 'Standard API access']
  }
};

const MC_RATE = 1.00; // RM per MC

export function BillingProvider({ children }) {
  // Account type
  const [accountType, setAccountType] = useState('Hospital'); // 'Hospital' or 'Clinic'

  // Usage tracking
  const [mcsIssuedThisMonth, setMcsIssuedThisMonth] = useState(0);
  const [totalMcsAllTime, setTotalMcsAllTime] = useState(0);

  // Payment state
  const [subscriptionPaid, setSubscriptionPaid] = useState(false);
  const [lastPaymentDate, setLastPaymentDate] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Derived values
  const currentTier = TIERS[accountType];
  const monthlySubscriptionFee = currentTier.monthlyFee;
  const variableUsageCost = mcsIssuedThisMonth * MC_RATE;
  const totalOutstandingBalance = subscriptionPaid
    ? variableUsageCost
    : monthlySubscriptionFee + variableUsageCost;

  // Fetch billing data from contract
  const fetchBillingData = async () => {
    try {
      setLoading(true);
      setError(null);

      const billing = getBillingContract();

      // Get total MCs from contract
      const mcCount = await billing.getMCCount();
      setTotalMcsAllTime(Number(mcCount));
      setMcsIssuedThisMonth(Number(mcCount)); // For demo, using all-time as this month

      // Get hospital balances for additional data
      const balances = await getAllHospitalBalances();

      // Check if subscription was paid (mock logic - in production would check blockchain)
      // For demo: if there are credits in the system, subscription is considered paid
      const totalCredits = balances.reduce((sum, b) => sum + Math.max(0, b.balance), 0);
      setSubscriptionPaid(totalCredits > 0);

    } catch (err) {
      console.error('Error fetching billing data:', err);
      setError(err.message);
      // Use mock data on error
      setMcsIssuedThisMonth(156);
      setTotalMcsAllTime(156);
    } finally {
      setLoading(false);
    }
  };

  // Process payment
  const processPayment = async (amount) => {
    return new Promise((resolve) => {
      // Simulate payment processing
      setTimeout(() => {
        setSubscriptionPaid(true);
        setLastPaymentDate(new Date());
        setPaymentHistory(prev => [...prev, {
          id: Date.now(),
          date: new Date(),
          amount,
          type: 'Monthly Subscription + Usage',
          status: 'completed'
        }]);
        resolve({ success: true, transactionId: `TXN-${Date.now()}` });
      }, 1500);
    });
  };

  // Change account type
  const changeAccountType = (type) => {
    if (TIERS[type]) {
      setAccountType(type);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchBillingData();
  }, []);

  const value = {
    // Account
    accountType,
    changeAccountType,
    currentTier,

    // Pricing
    monthlySubscriptionFee,
    variableUsageCost,
    totalOutstandingBalance,
    mcRate: MC_RATE,

    // Usage
    mcsIssuedThisMonth,
    totalMcsAllTime,

    // Payment
    subscriptionPaid,
    lastPaymentDate,
    paymentHistory,
    processPayment,

    // State
    loading,
    error,
    refreshBillingData: fetchBillingData,

    // Constants
    TIERS
  };

  return (
    <BillingContext.Provider value={value}>
      {children}
    </BillingContext.Provider>
  );
}

export function useBilling() {
  const context = useContext(BillingContext);
  if (!context) {
    throw new Error('useBilling must be used within a BillingProvider');
  }
  return context;
}

export default BillingContext;
