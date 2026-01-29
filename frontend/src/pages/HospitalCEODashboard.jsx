import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

// Theme colors
const theme = {
  bg: '#0a0e14',
  bgCard: 'rgba(15, 23, 42, 0.9)',
  border: 'rgba(56, 189, 248, 0.2)',
  borderHover: 'rgba(56, 189, 248, 0.4)',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  accent: '#38bdf8',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
};

// Mock data for the hospital
const HOSPITAL_DATA = {
  name: 'Timberland Medical Centre',
  ceoName: 'Dr. Ahmad bin Hassan',
  location: 'Kuching, Sarawak',
  subscriptionPlan: 'Enterprise',
  monthlyBase: 10000,
  mcRate: 1,
};

// Generate MC trend data (last 30 days)
const generateMCTrendData = () => {
  const data = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toLocaleDateString('en-MY', { month: 'short', day: 'numeric' }),
      mcs: Math.floor(Math.random() * 30) + 20,
    });
  }
  return data;
};

// Department breakdown
const DEPARTMENT_DATA = [
  { name: 'General Practice', mcs: 312, color: '#38bdf8' },
  { name: 'Emergency', mcs: 187, color: '#10b981' },
  { name: 'Pediatrics', mcs: 145, color: '#f59e0b' },
  { name: 'Orthopedics', mcs: 98, color: '#8b5cf6' },
  { name: 'Internal Medicine', mcs: 105, color: '#ec4899' },
];

// Doctor data
const DOCTORS_DATA = [
  { id: 1, name: 'Dr. Sarah Wong', department: 'General Practice', mcsIssued: 87, avgDays: 2.3, status: 'online' },
  { id: 2, name: 'Dr. Kumar Raj', department: 'Emergency', mcsIssued: 65, avgDays: 1.8, status: 'online' },
  { id: 3, name: 'Dr. Fatimah Ali', department: 'Pediatrics', mcsIssued: 54, avgDays: 2.1, status: 'offline' },
  { id: 4, name: 'Dr. Lee Wei Ming', department: 'Orthopedics', mcsIssued: 42, avgDays: 3.5, status: 'online' },
  { id: 5, name: 'Dr. Ahmad Razak', department: 'Internal Medicine', mcsIssued: 38, avgDays: 2.8, status: 'offline' },
];

// Recent MCs
const RECENT_MCS = [
  { id: 'MC-2026-8847', patient: 'Tan W***', doctor: 'Dr. Sarah Wong', date: '29 Jan 2026', status: 'verified' },
  { id: 'MC-2026-8846', patient: 'Ahmad R***', doctor: 'Dr. Kumar Raj', date: '29 Jan 2026', status: 'verified' },
  { id: 'MC-2026-8845', patient: 'Lee M***', doctor: 'Dr. Sarah Wong', date: '29 Jan 2026', status: 'pending' },
  { id: 'MC-2026-8844', patient: 'Siti N***', doctor: 'Dr. Fatimah Ali', date: '28 Jan 2026', status: 'verified' },
  { id: 'MC-2026-8843', patient: 'Wong K***', doctor: 'Dr. Lee Wei Ming', date: '28 Jan 2026', status: 'verified' },
];

// Payment history
const PAYMENT_HISTORY = [
  { month: 'January 2026', amount: 10847, status: 'Due', dueDate: '15 Feb 2026' },
  { month: 'December 2025', amount: 11203, status: 'Paid', paidDate: '12 Jan 2026' },
  { month: 'November 2025', amount: 10523, status: 'Paid', paidDate: '14 Dec 2025' },
];

// CSS Styles for animations
const styles = `
  @keyframes countUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes pulse-dot {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.5); opacity: 0.7; }
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 5px currentColor; }
    50% { box-shadow: 0 0 15px currentColor, 0 0 25px currentColor; }
  }

  @keyframes progress-grow {
    from { width: 0%; }
  }

  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  @keyframes check-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .card-hover {
    transition: all 0.3s ease;
  }

  .card-hover:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 32px rgba(56, 189, 248, 0.15);
    border-color: rgba(56, 189, 248, 0.4) !important;
  }

  .btn-hover {
    transition: all 0.2s ease;
  }

  .btn-hover:hover {
    filter: brightness(1.15);
    transform: scale(1.02);
  }

  .row-hover {
    transition: background 0.2s ease;
  }

  .row-hover:hover {
    background: rgba(56, 189, 248, 0.05) !important;
  }

  .badge-glow-green {
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
  }

  .badge-glow-orange {
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.4);
  }

  .dot-pulse {
    animation: pulse-dot 2s ease-in-out infinite;
  }

  .check-pulse {
    animation: check-pulse 2s ease-in-out infinite;
  }

  .status-glow {
    text-shadow: 0 0 10px currentColor;
  }

  .skeleton {
    background: linear-gradient(90deg, rgba(56, 189, 248, 0.1) 25%, rgba(56, 189, 248, 0.2) 50%, rgba(56, 189, 248, 0.1) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 8px;
  }

  .progress-bar {
    animation: progress-grow 1s ease-out forwards;
  }

  .avatar-glow {
    box-shadow: 0 0 15px rgba(56, 189, 248, 0.3);
  }
`;

// Animated Number Component
function AnimatedNumber({ value, duration = 1500, prefix = '', suffix = '' }) {
  const [displayValue, setDisplayValue] = useState(0);
  const startTime = useRef(null);
  const animationFrame = useRef(null);

  useEffect(() => {
    const animate = (timestamp) => {
      if (!startTime.current) startTime.current = timestamp;
      const progress = Math.min((timestamp - startTime.current) / duration, 1);

      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.floor(easeOut * value));

      if (progress < 1) {
        animationFrame.current = requestAnimationFrame(animate);
      }
    };

    animationFrame.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame.current);
  }, [value, duration]);

  return <span>{prefix}{displayValue.toLocaleString()}{suffix}</span>;
}

// Skeleton Loader
function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />;
}

// Card component with enhanced hover
function Card({ children, className = '', hover = true, delay = 0, padding = '32px' }) {
  return (
    <div
      className={`rounded-2xl ${hover ? 'card-hover' : ''} ${className}`}
      style={{
        background: theme.bgCard,
        border: `1px solid ${theme.border}`,
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
        animation: `fadeInUp 0.5s ease-out ${delay}ms backwards`,
        padding: padding,
      }}
    >
      {children}
    </div>
  );
}

// Metric Card component with animated number
function MetricCard({ icon, label, value, trend, trendUp, isLoading, delay = 0, isNumeric = true }) {
  return (
    <Card delay={delay}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm mb-2" style={{ color: theme.textSecondary }}>{label}</p>
          {isLoading ? (
            <Skeleton className="h-10 w-24" />
          ) : (
            <p className="text-4xl font-bold" style={{ color: theme.textPrimary }}>
              {isNumeric ? <AnimatedNumber value={parseInt(value) || 0} /> : value}
            </p>
          )}
        </div>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${theme.accent}20` }}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1">
          <span className={`text-sm font-medium ${trendUp ? 'text-emerald-400' : 'text-red-400'}`}>
            {trendUp ? '↑' : '↓'} {trend}
          </span>
          <span className="text-sm" style={{ color: theme.textMuted }}>vs last month</span>
        </div>
      )}
    </Card>
  );
}

// Status Badge with glow
function StatusBadge({ status }) {
  const colors = {
    verified: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981', glow: 'badge-glow-green' },
    pending: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b', glow: 'badge-glow-orange' },
    active: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981', glow: 'badge-glow-green' },
    online: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981', glow: 'badge-glow-green' },
    offline: { bg: 'rgba(100, 116, 139, 0.2)', text: '#64748b', glow: '' },
    paid: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981', glow: 'badge-glow-green' },
    due: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b', glow: 'badge-glow-orange' },
  };
  const style = colors[status.toLowerCase()] || colors.pending;

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${style.glow}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {status}
    </span>
  );
}

// Progress Bar with animation
function AnimatedProgressBar({ value, maxValue, color, delay = 0 }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setWidth((value / maxValue) * 100);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, maxValue, delay]);

  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
      <div
        className="h-2 rounded-full transition-all duration-1000 ease-out"
        style={{
          width: `${width}%`,
          background: `linear-gradient(90deg, ${color}, ${color}dd)`,
        }}
      />
    </div>
  );
}

// Custom Tooltip for charts
function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div
        className="rounded-lg p-3"
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>{label}</p>
        <p className="text-lg font-bold" style={{ color: theme.accent }}>{payload[0].value} MCs</p>
      </div>
    );
  }
  return null;
}

export default function HospitalCEODashboard() {
  const [mcTrendData] = useState(generateMCTrendData());
  const [timeframe, setTimeframe] = useState('30');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Calculate totals
  const totalMCs = DEPARTMENT_DATA.reduce((sum, d) => sum + d.mcs, 0);
  const maxDeptMCs = Math.max(...DEPARTMENT_DATA.map(d => d.mcs));
  const onlineDoctors = DOCTORS_DATA.filter(d => d.status === 'online').length;
  const verificationRate = Math.round((RECENT_MCS.filter(m => m.status === 'verified').length / RECENT_MCS.length) * 100);
  const variableFee = totalMCs * HOSPITAL_DATA.mcRate;
  const totalDue = HOSPITAL_DATA.monthlyBase + variableFee;

  return (
    <div className="min-h-screen hospital-ceo-dashboard" style={{ backgroundColor: theme.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Inject styles */}
      <style>{styles}</style>

      {/* Header */}
      <header style={{ padding: '24px 40px', marginBottom: '40px', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }} className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Hospital Logo Placeholder */}
            <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${theme.accent}, #0ea5e9)` }}>
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: theme.textPrimary }}>{HOSPITAL_DATA.name}</h1>
              <p className="text-sm" style={{ color: theme.textSecondary }}>CEO Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Date/Time */}
            <div className="text-right">
              <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>
                {currentTime.toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                {currentTime.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {/* Divider */}
            <div className="h-10 w-px" style={{ backgroundColor: theme.border }} />

            {/* CEO Info */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center avatar-glow" style={{ backgroundColor: `${theme.accent}20`, border: `2px solid ${theme.accent}40` }}>
                <span className="text-sm font-bold" style={{ color: theme.accent }}>AH</span>
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>{HOSPITAL_DATA.ceoName}</p>
                <p className="text-xs" style={{ color: theme.textMuted }}>Chief Executive Officer</p>
              </div>
            </div>

            {/* Logout */}
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium btn-hover"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px' }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 40px 40px 40px', flexGrow: 1 }}>
        {/* Top Metrics Row */}
        <div className="grid grid-cols-4" style={{ gap: '32px', marginBottom: '40px' }}>
          <MetricCard
            icon={<svg className="w-6 h-6" style={{ color: theme.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
            label="MCs Issued This Month"
            value={totalMCs}
            trend="12.5%"
            trendUp={true}
            isLoading={isLoading}
            delay={0}
          />
          <MetricCard
            icon={<svg className="w-6 h-6" style={{ color: theme.success }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
            label="Active Doctors"
            value={`${onlineDoctors}/${DOCTORS_DATA.length}`}
            trend={null}
            isLoading={isLoading}
            delay={50}
            isNumeric={false}
          />
          <MetricCard
            icon={<svg className="w-6 h-6" style={{ color: theme.success }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            label="Subscription Status"
            value={<StatusBadge status="Active" />}
            trend={null}
            isLoading={isLoading}
            delay={100}
            isNumeric={false}
          />
          <MetricCard
            icon={<svg className="w-6 h-6" style={{ color: theme.warning }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
            label="MC Verification Rate"
            value={verificationRate}
            trend="2.3%"
            trendUp={true}
            isLoading={isLoading}
            delay={150}
            isNumeric={false}
          />
        </div>

        {/* Section 1: MC Analytics */}
        <div className="grid grid-cols-5" style={{ gap: '32px', marginBottom: '40px' }}>
          {/* MC Trend Chart - 60% */}
          <Card className="col-span-3" hover={false} delay={200}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: theme.textPrimary }}>MC Issuance Trend</h2>
                <p className="text-sm" style={{ color: theme.textMuted }}>Daily MC issuance over time</p>
              </div>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="px-4 py-2 rounded-lg text-sm btn-hover cursor-pointer"
                style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', color: theme.textPrimary, border: `1px solid ${theme.border}`, borderRadius: '8px' }}
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </div>
            <div className="h-64">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mcTrendData}>
                    <defs>
                      <linearGradient id="mcGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={theme.accent} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={theme.accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" stroke={theme.textMuted} fontSize={11} tickLine={false} />
                    <YAxis stroke={theme.textMuted} fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="mcs"
                      stroke={theme.accent}
                      strokeWidth={2.5}
                      fill="url(#mcGradient)"
                      dot={false}
                      activeDot={{ r: 6, fill: theme.accent, stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* Department Breakdown - 40% */}
          <Card className="col-span-2" hover={false} delay={250}>
            <h2 className="text-lg font-semibold mb-6" style={{ color: theme.textPrimary }}>By Department</h2>
            <div className="space-y-4">
              {DEPARTMENT_DATA.map((dept, idx) => (
                <div key={dept.name}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm" style={{ color: theme.textSecondary }}>{dept.name}</span>
                    <span className="text-sm font-semibold" style={{ color: theme.textPrimary }}>
                      {isLoading ? '...' : dept.mcs}
                    </span>
                  </div>
                  <AnimatedProgressBar
                    value={dept.mcs}
                    maxValue={maxDeptMCs}
                    color={dept.color}
                    delay={300 + idx * 100}
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Section 2: Doctor Performance & Recent MCs */}
        <div className="grid grid-cols-2" style={{ gap: '40px', marginBottom: '40px' }}>
          {/* Doctor Performance */}
          <Card hover={false} delay={300}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold" style={{ color: theme.textPrimary }}>Doctor Performance</h2>
              <button className="text-sm font-medium btn-hover px-3 py-1 rounded-lg" style={{ color: theme.accent, backgroundColor: `${theme.accent}10`, borderRadius: '8px' }}>View All</button>
            </div>
            <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${theme.border}` }}>
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)' }}>
                    <th className="text-left px-4 py-4 text-xs font-semibold uppercase" style={{ color: theme.textMuted }}>Doctor</th>
                    <th className="text-left px-4 py-4 text-xs font-semibold uppercase" style={{ color: theme.textMuted }}>Dept</th>
                    <th className="text-right px-4 py-4 text-xs font-semibold uppercase" style={{ color: theme.textMuted }}>MCs</th>
                    <th className="text-right px-4 py-4 text-xs font-semibold uppercase" style={{ color: theme.textMuted }}>Avg Days</th>
                    <th className="text-center px-4 py-4 text-xs font-semibold uppercase" style={{ color: theme.textMuted }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {DOCTORS_DATA.map((doctor) => (
                    <tr key={doctor.id} className="row-hover" style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td className="px-4 py-4 text-sm font-medium" style={{ color: theme.textPrimary }}>{doctor.name}</td>
                      <td className="px-4 py-4 text-sm" style={{ color: theme.textSecondary }}>{doctor.department}</td>
                      <td className="px-4 py-4 text-sm text-right font-semibold" style={{ color: theme.accent }}>{doctor.mcsIssued}</td>
                      <td className="px-4 py-4 text-sm text-right" style={{ color: theme.textSecondary }}>{doctor.avgDays}</td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${doctor.status === 'online' ? 'bg-emerald-500/20 text-emerald-400 badge-glow-green' : 'bg-slate-500/20 text-slate-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${doctor.status === 'online' ? 'bg-emerald-400 dot-pulse' : 'bg-slate-400'}`} />
                          {doctor.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Recent MCs */}
          <Card hover={false} delay={350}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold" style={{ color: theme.textPrimary }}>Recent MCs</h2>
              <button className="text-sm font-medium btn-hover px-3 py-1 rounded-lg" style={{ color: theme.accent, backgroundColor: `${theme.accent}10`, borderRadius: '8px' }}>View All</button>
            </div>
            <div className="space-y-3">
              {RECENT_MCS.map((mc) => (
                <div
                  key={mc.id}
                  className="flex items-center justify-between p-4 rounded-xl row-hover"
                  style={{ border: `1px solid ${theme.border}` }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.accent}20` }}>
                      <svg className="w-5 h-5" style={{ color: theme.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>{mc.id}</p>
                      <p className="text-xs" style={{ color: theme.textMuted }}>{mc.patient} • {mc.doctor}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs" style={{ color: theme.textMuted }}>{mc.date}</span>
                    <StatusBadge status={mc.status} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Section 3: Billing & System Status */}
        <div className="grid grid-cols-2" style={{ gap: '40px' }}>
          {/* Billing & Subscription */}
          <Card hover={false} delay={400}>
            <h2 className="text-lg font-semibold mb-6" style={{ color: theme.textPrimary }}>Billing & Subscription</h2>

            {/* Current Bill */}
            <div className="p-4 rounded-xl mb-6" style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', border: `1px solid ${theme.border}` }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm" style={{ color: theme.textSecondary }}>Current Plan</span>
                <span className="text-sm font-semibold" style={{ color: theme.accent }}>{HOSPITAL_DATA.subscriptionPlan}</span>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span style={{ color: theme.textSecondary }}>Monthly Base</span>
                  <span style={{ color: theme.textPrimary }}>RM {HOSPITAL_DATA.monthlyBase.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: theme.textSecondary }}>Variable Fee ({totalMCs} MCs × RM{HOSPITAL_DATA.mcRate})</span>
                  <span style={{ color: theme.textPrimary }}>RM {variableFee.toLocaleString()}</span>
                </div>
                <div className="h-px my-2" style={{ backgroundColor: theme.border }} />
                <div className="flex justify-between">
                  <span className="font-semibold" style={{ color: theme.textPrimary }}>Total Due</span>
                  <span className="text-xl font-bold" style={{ color: theme.success }}>RM {totalDue.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: theme.textMuted }}>Due: 15 Feb 2026</span>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-semibold btn-hover"
                  style={{ backgroundColor: theme.accent, color: '#0a0e14', borderRadius: '8px' }}
                >
                  View Invoice
                </button>
              </div>
            </div>

            {/* Payment History */}
            <h3 className="text-sm font-semibold mb-3" style={{ color: theme.textSecondary }}>Payment History</h3>
            <div className="space-y-2">
              {PAYMENT_HISTORY.map((payment, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg row-hover" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>{payment.month}</p>
                    <p className="text-xs" style={{ color: theme.textMuted }}>{payment.status === 'Paid' ? `Paid ${payment.paidDate}` : `Due ${payment.dueDate}`}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold" style={{ color: theme.textPrimary }}>RM {payment.amount.toLocaleString()}</span>
                    <StatusBadge status={payment.status} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* System Status */}
          <Card hover={false} delay={450}>
            <h2 className="text-lg font-semibold mb-6" style={{ color: theme.textPrimary }}>System Status</h2>

            <div className="space-y-4">
              {[
                { label: 'Blockchain Sync', status: 'Synced', ok: true, detail: 'Block #1,234,567' },
                { label: 'Node Health', status: 'Healthy', ok: true, detail: '99.9% uptime' },
                { label: 'Last Backup', status: '2 hours ago', ok: true, detail: 'Automatic' },
                { label: 'Security', status: 'Secure', ok: true, detail: 'All checks passed' },
                { label: 'API Status', status: 'Operational', ok: true, detail: 'Latency: 45ms' },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 rounded-xl row-hover" style={{ border: `1px solid ${theme.border}` }}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.ok ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                      {item.ok ? (
                        <svg className="w-5 h-5 text-emerald-400 check-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>{item.label}</p>
                      <p className="text-xs" style={{ color: theme.textMuted }}>{item.detail}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${item.ok ? 'text-emerald-400 status-glow' : 'text-red-400'}`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ===== FOOTER - COMPLETELY SEPARATE ===== */}
        <div style={{
          width: '100%',
          marginTop: '60px',
          paddingTop: '24px',
          paddingBottom: '24px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          textAlign: 'center',
          color: '#64748b',
          fontSize: '14px',
          gridColumn: '1 / -1'
        }}>
          Powered by <span style={{color: '#38bdf8', fontWeight: 600}}>Sarawak MedChain</span>
          {' • '}
          <a href="mailto:support@sarawakmedchain.com" style={{color: '#64748b'}}>support@sarawakmedchain.com</a>
          {' • '}
          +60 82-XXX-XXX
        </div>

      </main>
    </div>
  );
}
