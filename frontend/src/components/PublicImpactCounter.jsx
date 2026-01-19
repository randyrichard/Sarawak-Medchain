import { useState, useEffect } from 'react';
import { getTotalRecordStats, getContractAddress, formatTimestamp } from '../utils/contract';

// Average fraud cost per fake MC in Malaysia (RM)
const AVERAGE_FRAUD_COST_RM = 850;

export default function PublicImpactCounter() {
  const [stats, setStats] = useState({
    totalRecords: 0,
    latestTimestamp: null,
    latestTxHash: null,
    latestBlockNumber: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [animatedCount, setAnimatedCount] = useState(0);
  const [animatedSavings, setAnimatedSavings] = useState(0);

  // Load stats on mount and set up polling
  useEffect(() => {
    loadStats();
    // Poll every 30 seconds for new records
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Animate counters when stats change
  useEffect(() => {
    if (stats.totalRecords > 0) {
      animateCounter(stats.totalRecords, setAnimatedCount, 1500);
      animateCounter(stats.totalRecords * AVERAGE_FRAUD_COST_RM, setAnimatedSavings, 2000);
    }
  }, [stats.totalRecords]);

  const animateCounter = (target, setter, duration) => {
    const startTime = Date.now();
    const startValue = 0;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Easing function for smooth animation
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(startValue + (target - startValue) * easeOut);
      setter(current);

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  };

  const loadStats = async () => {
    try {
      setError(null);
      const data = await getTotalRecordStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load impact stats:', err);
      setError('Unable to connect to blockchain');
    } finally {
      setLoading(false);
    }
  };

  // Generate block explorer URL (supports local hardhat and testnets)
  const getBlockExplorerUrl = () => {
    const contractAddress = getContractAddress();
    // For local development, link to etherscan with the tx hash
    // In production, this would point to the actual network's explorer
    if (stats.latestTxHash) {
      // Local development - show transaction details
      return `https://etherscan.io/tx/${stats.latestTxHash}`;
    }
    return `https://etherscan.io/address/${contractAddress}`;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MY', {
      style: 'currency',
      currency: 'MYR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-MY').format(num);
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-8 shadow-2xl border border-slate-700/50 relative overflow-hidden">
      {/* Animated background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2310b981' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      {/* Live indicator header */}
      <div className="flex items-center justify-between mb-8 relative">
        <div className="flex items-center gap-3">
          {/* Pulsing green dot */}
          <div className="relative">
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
            <div className="absolute inset-0 w-3 h-3 bg-emerald-400 rounded-full animate-ping opacity-75" />
          </div>
          <span className="text-emerald-400 font-semibold text-sm uppercase tracking-wider">
            Now Live Across Sarawak
          </span>
        </div>

        {/* Blockchain badge */}
        <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-600/50">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-slate-300 text-xs font-medium">Blockchain Secured</span>
        </div>
      </div>

      {/* Main content */}
      <div className="relative">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-400 mb-2">{error}</p>
            <button
              onClick={loadStats}
              className="text-emerald-400 hover:text-emerald-300 text-sm underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Total Medical Certificates Counter */}
            <div className="text-center lg:text-left">
              <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-2">
                Total Secured Medical Certificates Issued in Sarawak
              </h3>
              <div className="flex items-baseline gap-2 justify-center lg:justify-start">
                <span className="text-5xl lg:text-6xl font-bold text-white tabular-nums">
                  {formatNumber(animatedCount)}
                </span>
                <span className="text-emerald-400 text-lg font-medium">MCs</span>
              </div>

              {/* Live update indicator */}
              {stats.latestTimestamp && (
                <p className="text-slate-500 text-xs mt-2">
                  Last issued: {formatTimestamp(stats.latestTimestamp)}
                </p>
              )}
            </div>

            {/* Fraud Prevention Counter */}
            <div className="text-center lg:text-right">
              <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-2">
                Estimated Employer Fraud Prevented
              </h3>
              <div className="flex items-baseline gap-2 justify-center lg:justify-end">
                <span className="text-5xl lg:text-6xl font-bold text-emerald-400 tabular-nums">
                  {formatCurrency(animatedSavings)}
                </span>
              </div>
              <p className="text-slate-500 text-xs mt-2">
                Based on avg. {formatCurrency(AVERAGE_FRAUD_COST_RM)} fraud cost per fake MC
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer with verification link */}
      <div className="mt-8 pt-6 border-t border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>Powered by Ethereum Blockchain</span>
        </div>

        <a
          href={getBlockExplorerUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors text-sm font-medium group"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Verify on Blockchain
          <svg className="w-3 h-3 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>
      </div>

      {/* Decorative corner elements */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-emerald-500/5 to-transparent rounded-tr-full" />
    </div>
  );
}
