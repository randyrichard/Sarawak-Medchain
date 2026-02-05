import { motion } from 'framer-motion';
import AnimatedNumber from '../ui/AnimatedNumber';

/**
 * QuickStatsHeader - Sticky header with critical KPIs always visible
 * Shows MRR, Cash Balance, Active Nodes, Network Health
 */
export default function QuickStatsHeader({
  mrr = 0,
  cashBalance = 0,
  activeNodes = 0,
  totalNodes = 5,
  networkHealth = 100,
  onExport,
  className = '',
}) {
  const nodeHealthPercent = (activeNodes / totalNodes) * 100;

  const stats = [
    {
      label: 'Monthly Recurring Revenue',
      value: mrr,
      prefix: 'RM ',
      color: '#10b981',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Cash in Bank',
      value: cashBalance,
      prefix: 'RM ',
      color: '#14b8a6',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: 'Active Nodes',
      value: activeNodes,
      suffix: `/${totalNodes}`,
      color: nodeHealthPercent >= 80 ? '#10b981' : nodeHealthPercent >= 60 ? '#f59e0b' : '#ef4444',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
        </svg>
      ),
    },
    {
      label: 'Network Health',
      value: networkHealth,
      suffix: '%',
      color: networkHealth >= 95 ? '#10b981' : networkHealth >= 80 ? '#f59e0b' : '#ef4444',
      showBar: true,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`sticky-header ${className}`}
    >
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-6">
        {/* Logo/Title */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              boxShadow: '0 4px 20px rgba(245, 158, 11, 0.3)',
            }}
          >
            <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Founder Command</h1>
            <p className="text-xs text-slate-400">Real-time Control Center</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-6">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-3"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: `${stat.color}20`,
                  border: `1px solid ${stat.color}40`,
                  color: stat.color,
                }}
              >
                {stat.icon}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                  {stat.label}
                </p>
                <p className="text-lg font-bold" style={{ color: stat.color }}>
                  <AnimatedNumber
                    value={stat.value}
                    prefix={stat.prefix || ''}
                    suffix={stat.suffix || ''}
                    duration={0.8}
                  />
                </p>
                {stat.showBar && (
                  <div className="w-20 h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: stat.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${stat.value}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-3">
          {/* Command Bar Hint */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 border border-slate-200">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-xs text-slate-400">Quick Search</span>
            <kbd className="px-1.5 py-0.5 text-[10px] bg-slate-200 rounded text-slate-500">Cmd+K</kbd>
          </div>

          {/* Export Button */}
          {onExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#000',
                boxShadow: '0 4px 20px rgba(245, 158, 11, 0.3)',
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
