import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * LiveRevenueFeed - Real-time MC transaction feed with auto-scroll
 * Shows transactions as they occur with hospital, doctor, and revenue info
 */

const theme = {
  success: '#10b981',
  teal: '#14b8a6',
  textPrimary: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
};

// Mock MC feed generator
const generateMockMC = () => {
  const hospitals = [
    { name: 'Hospital Umum Sarawak', city: 'Kuching' },
    { name: 'Hospital Miri', city: 'Miri' },
    { name: 'Hospital Sibu', city: 'Sibu' },
    { name: 'Klinik Kesihatan Kuching', city: 'Kuching' },
    { name: 'Klinik Kesihatan Miri', city: 'Miri' },
  ];
  const doctors = [
    'Dr. Ahmad Razak', 'Dr. Sarah Lim', 'Dr. James Wong',
    'Dr. Fatimah Hassan', 'Dr. Kumar Pillai', 'Dr. Michelle Tan'
  ];

  return {
    id: Date.now() + Math.random(),
    hospital: hospitals[Math.floor(Math.random() * hospitals.length)],
    doctor: doctors[Math.floor(Math.random() * doctors.length)],
    timestamp: new Date(),
    profit: 1.00,
  };
};

export default function LiveRevenueFeed({
  feed = [],
  maxItems = 8,
  autoGenerate = true,
  generateInterval = 3000,
  onNewTransaction,
  className = '',
}) {
  const [mcFeed, setMcFeed] = useState(feed.length > 0 ? feed : []);
  const [totalProfit, setTotalProfit] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const feedRef = useRef(null);

  // Auto-generate mock transactions
  useEffect(() => {
    if (!autoGenerate || isPaused) return;

    const interval = setInterval(() => {
      const newMC = generateMockMC();
      setMcFeed(prev => [newMC, ...prev].slice(0, maxItems));
      setTotalProfit(prev => prev + newMC.profit);
      onNewTransaction?.(newMC);
    }, generateInterval);

    return () => clearInterval(interval);
  }, [autoGenerate, isPaused, generateInterval, maxItems, onNewTransaction]);

  // Auto-scroll to top when new item added
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [mcFeed]);

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-MY', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`pro-card ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${theme.success}20` }}
            >
              <svg className="w-5 h-5" fill={theme.success} viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
              </svg>
            </div>
            {/* Live indicator */}
            <span
              className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse"
              style={{ backgroundColor: theme.success }}
            />
          </div>
          <div>
            <h3 className="text-lg font-bold" style={{ color: theme.textPrimary }}>
              Live Revenue Feed
            </h3>
            <p className="text-xs" style={{ color: theme.textMuted }}>
              Real-time MC transactions • RM1.00/MC
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <span
            className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              backgroundColor: `${theme.success}20`,
              color: theme.success,
            }}
          >
            +RM {totalProfit.toFixed(2)} today
          </span>
          <button
            onClick={() => setIsPaused(!isPaused)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-slate-100"
            style={{
              backgroundColor: isPaused ? `${theme.teal}20` : 'transparent',
            }}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? (
              <svg className="w-4 h-4" fill={theme.teal} viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill={theme.textSecondary} viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Transaction Feed */}
      <div
        ref={feedRef}
        className="space-y-2 max-h-80 overflow-y-auto pr-2"
        style={{
          scrollBehavior: 'smooth',
        }}
      >
        <AnimatePresence initial={false}>
          {mcFeed.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: theme.textMuted }}>
                Waiting for transactions...
              </p>
            </div>
          ) : (
            mcFeed.map((mc, index) => (
              <motion.div
                key={mc.id}
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="p-3 rounded-xl"
                style={{
                  background: index === 0
                    ? `linear-gradient(90deg, ${theme.success}08, transparent)`
                    : '#F8FAFC',
                  border: index === 0
                    ? `1px solid ${theme.success}30`
                    : '1px solid #E2E8F0',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Hospital Icon */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{
                        backgroundColor: `${theme.teal}20`,
                        color: theme.teal,
                      }}
                    >
                      {mc.hospital.city.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm" style={{ color: theme.textPrimary }}>
                        {mc.hospital.name}
                      </p>
                      <p className="text-xs" style={{ color: theme.textMuted }}>
                        {mc.doctor} • {formatTime(mc.timestamp)}
                      </p>
                    </div>
                  </div>

                  {/* Revenue */}
                  <div className="text-right">
                    <p
                      className="font-bold"
                      style={{ color: theme.success }}
                    >
                      +RM {mc.profit.toFixed(2)}
                    </p>
                    <p className="text-[10px]" style={{ color: theme.textMuted }}>
                      MC Fee
                    </p>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Footer Stats */}
      <div
        className="mt-4 pt-4 grid grid-cols-3 gap-4 text-center"
        style={{ borderTop: `1px solid ${theme.border}` }}
      >
        <div>
          <p className="text-lg font-bold" style={{ color: theme.textPrimary }}>
            {mcFeed.length}
          </p>
          <p className="text-xs" style={{ color: theme.textMuted }}>Transactions</p>
        </div>
        <div>
          <p className="text-lg font-bold" style={{ color: theme.success }}>
            RM {totalProfit.toFixed(2)}
          </p>
          <p className="text-xs" style={{ color: theme.textMuted }}>Session Revenue</p>
        </div>
        <div>
          <p className="text-lg font-bold" style={{ color: theme.teal }}>
            ~{Math.round(mcFeed.length / (Date.now() / 60000) * 60) || 0}/hr
          </p>
          <p className="text-xs" style={{ color: theme.textMuted }}>Rate</p>
        </div>
      </div>
    </motion.div>
  );
}
