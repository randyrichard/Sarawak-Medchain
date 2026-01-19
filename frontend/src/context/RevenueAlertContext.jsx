import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const RevenueAlertContext = createContext();

// Storage keys
const STORAGE_KEYS = {
  REVENUE_DATA: 'medchain_revenue_data',
  PAYMENT_HISTORY: 'medchain_payment_history',
};

// Revenue targets
const REVENUE_TARGETS = {
  mrrGoal: 500000, // RM 500,000 MRR goal
  hospitalRate: 10000, // RM 10,000/month per hospital
  clinicRate: 2000, // RM 2,000/month per clinic
};

// Default revenue data
const DEFAULT_REVENUE_DATA = {
  mrr: 50000, // Starting MRR (5 hospitals)
  totalRevenue: 150000, // Total collected
  hospitalCount: 5,
  clinicCount: 0,
  lastUpdated: new Date().toISOString(),
};

export function RevenueAlertProvider({ children }) {
  const [revenueData, setRevenueData] = useState(DEFAULT_REVENUE_DATA);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [pendingAlerts, setPendingAlerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);

  // Audio refs
  const chachingAudioRef = useRef(null);
  const notificationAudioRef = useRef(null);

  // Initialize audio elements
  useEffect(() => {
    // Create audio elements with base64 encoded sounds
    // Cha-Ching sound (cash register)
    chachingAudioRef.current = new Audio();
    chachingAudioRef.current.volume = 0.7;

    // We'll use a simple notification sound as fallback
    notificationAudioRef.current = new Audio();
    notificationAudioRef.current.volume = 0.5;

    return () => {
      if (chachingAudioRef.current) {
        chachingAudioRef.current.pause();
      }
      if (notificationAudioRef.current) {
        notificationAudioRef.current.pause();
      }
    };
  }, []);

  // Load data from localStorage
  useEffect(() => {
    const storedRevenue = localStorage.getItem(STORAGE_KEYS.REVENUE_DATA);
    const storedHistory = localStorage.getItem(STORAGE_KEYS.PAYMENT_HISTORY);

    if (storedRevenue) {
      try {
        setRevenueData(JSON.parse(storedRevenue));
      } catch (e) {
        setRevenueData(DEFAULT_REVENUE_DATA);
      }
    } else {
      localStorage.setItem(STORAGE_KEYS.REVENUE_DATA, JSON.stringify(DEFAULT_REVENUE_DATA));
    }

    if (storedHistory) {
      try {
        setPaymentHistory(JSON.parse(storedHistory));
      } catch (e) {
        setPaymentHistory([]);
      }
    }

    setIsLoading(false);
  }, []);

  // Play cha-ching sound
  const playChachingSound = useCallback(() => {
    if (!isSoundEnabled) return;

    // Create oscillator-based cash register sound
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Create a "cha-ching" effect with multiple tones
      const playTone = (frequency, startTime, duration, gain = 0.3) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(gain, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };

      const now = audioContext.currentTime;

      // "Cha" - quick rising notes
      playTone(800, now, 0.1, 0.4);
      playTone(1000, now + 0.05, 0.1, 0.4);
      playTone(1200, now + 0.1, 0.15, 0.5);

      // "Ching" - bell-like tone
      playTone(2400, now + 0.2, 0.4, 0.6);
      playTone(1800, now + 0.25, 0.35, 0.4);
      playTone(2000, now + 0.3, 0.3, 0.3);

      // Close context after sound completes
      setTimeout(() => {
        audioContext.close();
      }, 1000);
    } catch (e) {
      console.log('Audio not available:', e);
    }
  }, [isSoundEnabled]);

  // Record a new payment
  const recordPayment = useCallback((paymentData) => {
    const payment = {
      id: `payment_${Date.now()}`,
      amount: paymentData.amount,
      hospitalName: paymentData.hospitalName,
      hospitalId: paymentData.hospitalId,
      type: paymentData.type || (paymentData.amount >= 10000 ? 'hospital' : 'clinic'),
      status: 'confirmed',
      timestamp: new Date().toISOString(),
      transactionRef: paymentData.transactionRef || `FPX${Date.now()}`,
    };

    // Update payment history
    const updatedHistory = [payment, ...paymentHistory].slice(0, 100);
    setPaymentHistory(updatedHistory);
    localStorage.setItem(STORAGE_KEYS.PAYMENT_HISTORY, JSON.stringify(updatedHistory));

    // Update revenue data
    const isHospital = payment.type === 'hospital';
    const updatedRevenue = {
      ...revenueData,
      mrr: revenueData.mrr + (isHospital ? REVENUE_TARGETS.hospitalRate : REVENUE_TARGETS.clinicRate),
      totalRevenue: revenueData.totalRevenue + payment.amount,
      hospitalCount: isHospital ? revenueData.hospitalCount + 1 : revenueData.hospitalCount,
      clinicCount: !isHospital ? revenueData.clinicCount + 1 : revenueData.clinicCount,
      lastUpdated: new Date().toISOString(),
    };
    setRevenueData(updatedRevenue);
    localStorage.setItem(STORAGE_KEYS.REVENUE_DATA, JSON.stringify(updatedRevenue));

    // Create alert
    const alert = {
      id: payment.id,
      type: 'payment_received',
      amount: payment.amount,
      hospitalName: payment.hospitalName,
      facilityType: payment.type,
      timestamp: payment.timestamp,
      message: `RM ${payment.amount.toLocaleString()} Received from ${payment.hospitalName} - Node Activated`,
    };

    // Add to pending alerts
    setPendingAlerts(prev => [alert, ...prev]);

    // Play sound
    playChachingSound();

    // Dispatch custom event for real-time notification
    window.dispatchEvent(new CustomEvent('medchain-revenue-alert', { detail: alert }));

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      setPendingAlerts(prev => prev.filter(a => a.id !== alert.id));
    }, 10000);

    return payment;
  }, [paymentHistory, revenueData, playChachingSound]);

  // Simulate incoming payment (for demo/testing)
  const simulatePayment = useCallback((type = 'hospital') => {
    const hospitals = [
      'Columbia Asia Hospital Miri',
      'Borneo Medical Centre',
      'Miri City Medical Centre',
      'Sibu Specialist Medical Centre',
      'Sarawak General Hospital',
    ];

    const randomHospital = hospitals[Math.floor(Math.random() * hospitals.length)];
    const amount = type === 'hospital' ? 10000 : 2000;

    return recordPayment({
      amount,
      hospitalName: randomHospital,
      hospitalId: `hosp_${Date.now()}`,
      type,
    });
  }, [recordPayment]);

  // Get MRR progress towards goal
  const getMRRProgress = useCallback(() => {
    const progress = (revenueData.mrr / REVENUE_TARGETS.mrrGoal) * 100;
    return {
      current: revenueData.mrr,
      goal: REVENUE_TARGETS.mrrGoal,
      percentage: Math.min(progress, 100),
      remaining: Math.max(REVENUE_TARGETS.mrrGoal - revenueData.mrr, 0),
      hospitalsNeeded: Math.ceil((REVENUE_TARGETS.mrrGoal - revenueData.mrr) / REVENUE_TARGETS.hospitalRate),
    };
  }, [revenueData.mrr]);

  // Dismiss an alert
  const dismissAlert = useCallback((alertId) => {
    setPendingAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  // Toggle sound
  const toggleSound = useCallback(() => {
    setIsSoundEnabled(prev => !prev);
  }, []);

  // Listen for FPX webhook events
  useEffect(() => {
    const handleFPXSuccess = (event) => {
      const { amount, hospitalName, transactionRef } = event.detail || {};
      if (amount && hospitalName) {
        recordPayment({
          amount,
          hospitalName,
          transactionRef,
          type: amount >= 10000 ? 'hospital' : 'clinic',
        });
      }
    };

    window.addEventListener('fpx-payment-success', handleFPXSuccess);
    return () => window.removeEventListener('fpx-payment-success', handleFPXSuccess);
  }, [recordPayment]);

  const value = {
    revenueData,
    paymentHistory,
    pendingAlerts,
    isLoading,
    isSoundEnabled,
    recordPayment,
    simulatePayment,
    getMRRProgress,
    dismissAlert,
    toggleSound,
    playChachingSound,
    REVENUE_TARGETS,
  };

  return (
    <RevenueAlertContext.Provider value={value}>
      {children}
    </RevenueAlertContext.Provider>
  );
}

export function useRevenueAlert() {
  const context = useContext(RevenueAlertContext);
  if (!context) {
    throw new Error('useRevenueAlert must be used within a RevenueAlertProvider');
  }
  return context;
}

export default RevenueAlertContext;
