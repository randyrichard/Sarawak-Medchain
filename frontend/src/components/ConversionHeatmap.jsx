import { useState, useEffect } from 'react';
import { useLeadAnalytics } from '../context/LeadAnalyticsContext';

/**
 * Conversion Heatmap Component
 * Shows which sections of the pitch page leads spend the most time on
 */
export default function ConversionHeatmap() {
  const { getHeatmapData, activeSessions, PITCH_SECTIONS } = useLeadAnalytics();
  const [heatmapData, setHeatmapData] = useState({});
  const [selectedTimeframe, setSelectedTimeframe] = useState('all');

  useEffect(() => {
    // For demo purposes, use sample data if no real sessions
    if (activeSessions.length === 0) {
      setHeatmapData({
        hero: { name: 'Hero Section', totalTime: 45, sessionCount: 8, avgTime: 5.6, percentage: 15 },
        fraudAlert: { name: 'Fraud Alert', totalTime: 180, sessionCount: 7, avgTime: 25.7, percentage: 60 },
        howItWorks: { name: 'How It Works', totalTime: 120, sessionCount: 6, avgTime: 20, percentage: 40 },
        security: { name: 'Security Features', totalTime: 150, sessionCount: 5, avgTime: 30, percentage: 50 },
        foundingCircle: { name: 'Founding Circle', totalTime: 200, sessionCount: 8, avgTime: 25, percentage: 67 },
        pricing: { name: 'Pricing', totalTime: 300, sessionCount: 9, avgTime: 33.3, percentage: 100 },
        roi: { name: 'ROI Calculator', totalTime: 240, sessionCount: 6, avgTime: 40, percentage: 80 },
        testimonials: { name: 'Testimonials', totalTime: 60, sessionCount: 4, avgTime: 15, percentage: 20 },
        cta: { name: 'Call to Action', totalTime: 90, sessionCount: 7, avgTime: 12.9, percentage: 30 },
      });
    } else {
      setHeatmapData(getHeatmapData());
    }
  }, [activeSessions, getHeatmapData]);

  const getHeatColor = (percentage) => {
    if (percentage >= 80) return { bg: 'bg-red-500', text: 'text-red-400', border: 'border-red-500/50', glow: 'shadow-red-500/30' };
    if (percentage >= 60) return { bg: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500/50', glow: 'shadow-orange-500/30' };
    if (percentage >= 40) return { bg: 'bg-yellow-500', text: 'text-yellow-400', border: 'border-yellow-500/50', glow: 'shadow-yellow-500/30' };
    if (percentage >= 20) return { bg: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/50', glow: 'shadow-emerald-500/30' };
    return { bg: 'bg-cyan-500', text: 'text-cyan-400', border: 'border-cyan-500/50', glow: 'shadow-cyan-500/30' };
  };

  const formatTime = (seconds) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  // Sort sections by percentage (most viewed first)
  const sortedSections = Object.entries(heatmapData)
    .sort(([, a], [, b]) => b.percentage - a.percentage);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-red-500 via-orange-500 to-yellow-500 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
            </svg>
          </div>
          <div>
            <h3 className="text-slate-800 font-bold">Conversion Heatmap</h3>
            <p className="text-slate-500 text-sm">Time spent per section by leads</p>
          </div>
        </div>

        {/* Timeframe selector */}
        <select
          value={selectedTimeframe}
          onChange={(e) => setSelectedTimeframe(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
        </select>
      </div>

      {/* Heat Legend */}
      <div className="flex items-center justify-between mb-6 px-2">
        <span className="text-xs text-slate-500">Low Interest</span>
        <div className="flex items-center gap-1">
          <div className="w-8 h-2 bg-cyan-500 rounded-l"></div>
          <div className="w-8 h-2 bg-emerald-500"></div>
          <div className="w-8 h-2 bg-yellow-500"></div>
          <div className="w-8 h-2 bg-orange-500"></div>
          <div className="w-8 h-2 bg-red-500 rounded-r"></div>
        </div>
        <span className="text-xs text-slate-500">High Interest</span>
      </div>

      {/* Heatmap Bars */}
      <div className="space-y-3">
        {sortedSections.map(([key, data]) => {
          const colors = getHeatColor(data.percentage);
          return (
            <div key={key} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${colors.text}`}>{data.name}</span>
                  {data.percentage >= 80 && (
                    <span className="px-1.5 py-0.5 bg-red-500/20 border border-red-500/30 rounded text-[10px] text-red-400 font-bold">
                      HOT
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400">
                  {formatTime(data.avgTime)} avg | {data.sessionCount} views
                </span>
              </div>

              {/* Progress bar with heat color */}
              <div className="relative h-8 bg-slate-200 rounded-lg overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 ${colors.bg} transition-all duration-500 rounded-lg`}
                  style={{ width: `${data.percentage}%`, opacity: 0.7 + (data.percentage / 400) }}
                >
                  {/* Animated shimmer for high-interest sections */}
                  {data.percentage >= 60 && (
                    <div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                      style={{
                        animation: 'shimmer 2s ease-in-out infinite',
                      }}
                    />
                  )}
                </div>

                {/* Percentage label inside bar */}
                <div className="absolute inset-0 flex items-center justify-between px-3">
                  <span className="text-white text-xs font-bold z-10">{data.percentage}%</span>
                  <span className="text-white/70 text-xs z-10">{formatTime(data.totalTime)} total</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Insights Section */}
      <div className="mt-6 pt-6 border-t border-slate-200">
        <h4 className="text-slate-800 font-semibold mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Key Insights
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-slate-500 text-xs mb-1">Most Engaging</p>
            <p className="text-red-400 font-bold">Pricing Section</p>
            <p className="text-slate-400 text-xs mt-1">33s average dwell time</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-slate-500 text-xs mb-1">Conversion Trigger</p>
            <p className="text-orange-400 font-bold">ROI Calculator</p>
            <p className="text-slate-400 text-xs mt-1">80% of converters used it</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-slate-500 text-xs mb-1">Fear Factor</p>
            <p className="text-amber-400 font-bold">Fraud Alert</p>
            <p className="text-slate-400 text-xs mt-1">Creates urgency</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-slate-500 text-xs mb-1">Social Proof</p>
            <p className="text-emerald-400 font-bold">Founding Circle</p>
            <p className="text-slate-400 text-xs mt-1">67% engagement rate</p>
          </div>
        </div>
      </div>

      {/* CSS for shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

/**
 * Mini Heatmap for Dashboard Cards
 */
export function MiniHeatmap() {
  const sections = [
    { name: 'Pricing', percentage: 100, color: 'bg-red-500' },
    { name: 'ROI', percentage: 80, color: 'bg-orange-500' },
    { name: 'Founding', percentage: 67, color: 'bg-orange-500' },
    { name: 'Fraud', percentage: 60, color: 'bg-yellow-500' },
    { name: 'Security', percentage: 50, color: 'bg-yellow-500' },
  ];

  return (
    <div className="space-y-2">
      {sections.map((section) => (
        <div key={section.name} className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-16">{section.name}</span>
          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${section.color} transition-all`}
              style={{ width: `${section.percentage}%` }}
            />
          </div>
          <span className="text-xs text-slate-500 w-8">{section.percentage}%</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Lead Funnel Visualization
 */
export function LeadFunnel() {
  const { getFunnelStats } = useLeadAnalytics();
  const stats = getFunnelStats();

  // Use demo data if no leads
  const funnelData = stats.total > 0 ? stats : {
    total: 10,
    invited: 3,
    opened: 2,
    viewing: 1,
    converted: 4,
    openRate: 70,
    conversionRate: 40,
  };

  const stages = [
    { name: 'Invited', count: funnelData.total, color: 'from-slate-500 to-slate-600', width: '100%' },
    { name: 'Email Opened', count: funnelData.total - funnelData.invited, color: 'from-cyan-500 to-cyan-600', width: '70%' },
    { name: 'Viewing Pitch', count: funnelData.viewing, color: 'from-amber-500 to-amber-600', width: '50%' },
    { name: 'Converted', count: funnelData.converted, color: 'from-emerald-500 to-emerald-600', width: '40%' },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </div>
          <div>
            <h3 className="text-slate-800 font-bold">Lead Funnel</h3>
            <p className="text-slate-500 text-sm">Founding Partner pipeline</p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-2xl font-black text-emerald-400">{funnelData.conversionRate}%</p>
          <p className="text-xs text-slate-500">Conversion Rate</p>
        </div>
      </div>

      {/* Funnel Visualization */}
      <div className="space-y-3">
        {stages.map((stage, idx) => (
          <div key={stage.name} className="relative">
            <div
              className={`bg-gradient-to-r ${stage.color} rounded-lg py-3 px-4 flex items-center justify-between transition-all hover:scale-[1.02]`}
              style={{ width: stage.width, marginLeft: `${(100 - parseInt(stage.width)) / 2}%` }}
            >
              <span className="text-white text-sm font-semibold">{stage.name}</span>
              <span className="text-white font-bold">{stage.count}</span>
            </div>
            {idx < stages.length - 1 && (
              <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 text-slate-600">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 10l5 5 5-5H7z" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mt-6 pt-6 border-t border-slate-200">
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-cyan-400">{funnelData.openRate}%</p>
          <p className="text-xs text-slate-500">Email Open Rate</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-amber-400">{10 - funnelData.converted}</p>
          <p className="text-xs text-slate-500">Slots Remaining</p>
        </div>
      </div>
    </div>
  );
}
