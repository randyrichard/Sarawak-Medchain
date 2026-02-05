import { useState, useEffect } from 'react';
import { getTotalRecordStats, getContractAddress, formatTimestamp } from '../utils/contract';
import { Shield, ExternalLink, ChevronRight, Zap } from 'lucide-react';

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

  const getBlockExplorerUrl = () => {
    const contractAddress = getContractAddress();
    if (stats.latestTxHash) {
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
    <div style={{
      background: '#FFFFFF',
      borderRadius: '24px',
      padding: '48px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 20px 25px -5px rgba(0,0,0,0.05)',
      border: '1px solid #E2E8F0',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative background */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: '200px',
        height: '200px',
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, transparent 70%)',
        borderRadius: '0 0 0 100%',
      }} />

      {/* Live indicator header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ width: '10px', height: '10px', background: '#10B981', borderRadius: '50%' }} />
            <div className="animate-ping" style={{ position: 'absolute', inset: 0, width: '10px', height: '10px', background: '#10B981', borderRadius: '50%', opacity: 0.75 }} />
          </div>
          <span style={{ color: '#059669', fontWeight: 600, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Now Live Across Sarawak
          </span>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#F0FDF4',
          padding: '6px 14px',
          borderRadius: '9999px',
          border: '1px solid #BBF7D0',
        }}>
          <Shield size={14} style={{ color: '#16A34A' }} />
          <span style={{ color: '#15803D', fontSize: '12px', fontWeight: 600 }}>Blockchain Secured</span>
        </div>
      </div>

      {/* Main content */}
      <div style={{ position: 'relative' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
            <div style={{ width: '32px', height: '32px', border: '2px solid #10B981', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p style={{ color: '#EF4444', marginBottom: '8px' }}>{error}</p>
            <button
              onClick={loadStats}
              style={{ color: '#10B981', fontSize: '14px', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
            {/* Total Medical Certificates Counter */}
            <div>
              <h3 style={{ color: '#64748B', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Total Secured Medical Certificates Issued in Sarawak
              </h3>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '48px', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                  {formatNumber(animatedCount)}
                </span>
                <span style={{ color: '#0F766E', fontSize: '18px', fontWeight: 600 }}>MCs</span>
              </div>
              {stats.latestTimestamp && (
                <p style={{ color: '#94A3B8', fontSize: '12px', marginTop: '8px' }}>
                  Last issued: {formatTimestamp(stats.latestTimestamp)}
                </p>
              )}
            </div>

            {/* Fraud Prevention Counter */}
            <div style={{ textAlign: 'right' }}>
              <h3 style={{ color: '#64748B', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Estimated Employer Fraud Prevented
              </h3>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: '48px', fontWeight: 800, color: '#0F766E', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(animatedSavings)}
                </span>
              </div>
              <p style={{ color: '#94A3B8', fontSize: '12px', marginTop: '8px' }}>
                Based on avg. {formatCurrency(AVERAGE_FRAUD_COST_RM)} fraud cost per fake MC
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer with verification link */}
      <div style={{
        marginTop: '32px',
        paddingTop: '24px',
        borderTop: '1px solid #E2E8F0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94A3B8', fontSize: '13px' }}>
          <Zap size={14} />
          <span>Powered by Ethereum Blockchain</span>
        </div>

        <a
          href={getBlockExplorerUrl()}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#0F766E',
            fontSize: '13px',
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'color 0.2s',
          }}
        >
          <ExternalLink size={14} />
          Verify on Blockchain
          <ChevronRight size={12} />
        </a>
      </div>
    </div>
  );
}
