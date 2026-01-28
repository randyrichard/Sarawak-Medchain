import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ═══════════════════════════════════════════════════════════════════════════════
// HOSPITAL CEO DASHBOARD
// Client-facing dashboard for hospital CEOs (RM10,000/month subscription)
// ═══════════════════════════════════════════════════════════════════════════════

// Professional Theme
const theme = {
  bg: '#0f172a',
  bgCard: 'rgba(15, 23, 42, 0.8)',
  bgCardSolid: '#1e293b',
  border: 'rgba(51, 65, 85, 0.5)',
  borderAccent: 'rgba(14, 165, 233, 0.3)',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  accent: '#0ea5e9',      // Sky blue - professional
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
};

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA - Replace with real API calls
// ═══════════════════════════════════════════════════════════════════════════════

// Hospital info (would come from login/context)
const HOSPITAL_INFO = {
  id: 'hosp_001',
  name: 'Timberland Medical Centre',
  logo: null, // Placeholder for logo URL
  location: 'Kuching, Sarawak',
  subscriptionTier: 'Enterprise',
  joinDate: '2025-11-15',
  walletAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
};

// Generate mock MC data for the last 30 days
const generateDailyMCData = () => {
  const data = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayOfWeek = date.getDay();
    // Lower on weekends
    const baseCount = dayOfWeek === 0 || dayOfWeek === 6 ? 15 : 35;
    const variance = Math.floor(Math.random() * 20) - 10;
    data.push({
      date: date.toLocaleDateString('en-MY', { month: 'short', day: 'numeric' }),
      fullDate: date.toISOString().split('T')[0],
      mcs: Math.max(5, baseCount + variance),
    });
  }
  return data;
};

// Department breakdown
const DEPARTMENT_DATA = [
  { name: 'General Practice', mcs: 312, color: '#0ea5e9' },
  { name: 'Emergency', mcs: 189, color: '#ef4444' },
  { name: 'Orthopedics', mcs: 145, color: '#10b981' },
  { name: 'Internal Medicine', mcs: 98, color: '#8b5cf6' },
  { name: 'Pediatrics', mcs: 76, color: '#f59e0b' },
  { name: 'Others', mcs: 27, color: '#64748b' },
];

// Peak hours data
const PEAK_HOURS_DATA = [
  { hour: '8AM', mcs: 45 },
  { hour: '9AM', mcs: 78 },
  { hour: '10AM', mcs: 92 },
  { hour: '11AM', mcs: 85 },
  { hour: '12PM', mcs: 42 },
  { hour: '1PM', mcs: 38 },
  { hour: '2PM', mcs: 65 },
  { hour: '3PM', mcs: 88 },
  { hour: '4PM', mcs: 95 },
  { hour: '5PM', mcs: 72 },
  { hour: '6PM', mcs: 35 },
];

// Doctor data
const DOCTORS_DATA = [
  { id: 1, name: 'Dr. Ahmad bin Hassan', specialty: 'General Practice', mcsIssued: 156, avgDuration: 2.3, lastActive: '5 min ago', status: 'online' },
  { id: 2, name: 'Dr. Sarah Lim', specialty: 'Emergency Medicine', mcsIssued: 134, avgDuration: 1.8, lastActive: '12 min ago', status: 'online' },
  { id: 3, name: 'Dr. Rajesh Kumar', specialty: 'Internal Medicine', mcsIssued: 98, avgDuration: 3.1, lastActive: '1 hour ago', status: 'away' },
  { id: 4, name: 'Dr. Fatimah Abdullah', specialty: 'Pediatrics', mcsIssued: 87, avgDuration: 2.5, lastActive: '2 hours ago', status: 'offline' },
  { id: 5, name: 'Dr. Wong Mei Ling', specialty: 'Orthopedics', mcsIssued: 76, avgDuration: 4.2, lastActive: '30 min ago', status: 'online' },
  { id: 6, name: 'Dr. Tan Boon Hock', specialty: 'General Practice', mcsIssued: 72, avgDuration: 2.1, lastActive: '45 min ago', status: 'online' },
];

// Recent MCs
const RECENT_MCS = [
  { id: 'MC-2026-001847', patientName: 'Ahmad B***', date: '2026-01-28', doctor: 'Dr. Sarah Lim', duration: '2 days', status: 'verified', department: 'Emergency' },
  { id: 'MC-2026-001846', patientName: 'Lee W***', date: '2026-01-28', doctor: 'Dr. Ahmad bin Hassan', duration: '1 day', status: 'verified', department: 'General Practice' },
  { id: 'MC-2026-001845', patientName: 'Siti N***', date: '2026-01-28', doctor: 'Dr. Wong Mei Ling', duration: '3 days', status: 'pending', department: 'Orthopedics' },
  { id: 'MC-2026-001844', patientName: 'Raj K***', date: '2026-01-28', doctor: 'Dr. Fatimah Abdullah', duration: '1 day', status: 'verified', department: 'Pediatrics' },
  { id: 'MC-2026-001843', patientName: 'Tan M***', date: '2026-01-27', doctor: 'Dr. Rajesh Kumar', duration: '2 days', status: 'verified', department: 'Internal Medicine' },
  { id: 'MC-2026-001842', patientName: 'Wong S***', date: '2026-01-27', doctor: 'Dr. Ahmad bin Hassan', duration: '1 day', status: 'verified', department: 'General Practice' },
  { id: 'MC-2026-001841', patientName: 'Lim C***', date: '2026-01-27', doctor: 'Dr. Sarah Lim', duration: '2 days', status: 'verified', department: 'Emergency' },
  { id: 'MC-2026-001840', patientName: 'Abdul R***', date: '2026-01-27', doctor: 'Dr. Tan Boon Hock', duration: '1 day', status: 'verified', department: 'General Practice' },
];

// Invoice history
const INVOICE_HISTORY = [
  { id: 'INV-2026-001', period: 'January 2026', baseFee: 10000, mcCount: 847, variableFee: 847, total: 10847, status: 'pending', dueDate: '2026-02-01' },
  { id: 'INV-2025-012', period: 'December 2025', baseFee: 10000, mcCount: 923, variableFee: 923, total: 10923, status: 'paid', paidDate: '2025-12-28' },
  { id: 'INV-2025-011', period: 'November 2025', baseFee: 10000, mcCount: 756, variableFee: 756, total: 10756, status: 'paid', paidDate: '2025-11-25' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

// Metric Card Component
const MetricCard = ({ title, value, subtitle, icon, trend, trendUp, accentColor = theme.accent }) => (
  <div
    style={{
      background: theme.bgCard,
      border: `1px solid ${theme.border}`,
      borderRadius: '16px',
      padding: '24px',
      backdropFilter: 'blur(10px)',
    }}
  >
    <div className="flex items-start justify-between mb-3">
      <span style={{ color: theme.textMuted, fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </span>
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          background: `${accentColor}15`,
          border: `1px solid ${accentColor}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </div>
    </div>
    <p style={{ fontSize: '32px', fontWeight: 700, color: theme.textPrimary, marginBottom: '4px' }}>
      {value}
    </p>
    <div className="flex items-center gap-2">
      {trend && (
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: trendUp ? theme.success : theme.danger,
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          {trendUp ? '↑' : '↓'} {trend}
        </span>
      )}
      <span style={{ fontSize: '13px', color: theme.textMuted }}>{subtitle}</span>
    </div>
  </div>
);

// Status Badge Component
const StatusBadge = ({ status }) => {
  const styles = {
    verified: { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', text: 'Verified' },
    pending: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', text: 'Pending' },
    paid: { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', text: 'Paid' },
    active: { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', text: 'Active' },
    due: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', text: 'Due' },
    online: { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', text: '●' },
    away: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', text: '●' },
    offline: { bg: 'rgba(100, 116, 139, 0.15)', color: '#64748b', text: '●' },
  };
  const s = styles[status] || styles.pending;

  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        padding: status === 'online' || status === 'away' || status === 'offline' ? '4px 8px' : '4px 12px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: 600,
      }}
    >
      {s.text}
    </span>
  );
};

// Section Header Component
const SectionHeader = ({ title, subtitle, action }) => (
  <div className="flex items-center justify-between mb-4">
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: theme.textPrimary, marginBottom: '2px' }}>{title}</h2>
      {subtitle && <p style={{ fontSize: '13px', color: theme.textMuted }}>{subtitle}</p>}
    </div>
    {action}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function CEOMainDashboard({ walletAddress }) {
  const [dailyMCData] = useState(generateDailyMCData);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Calculate totals
  const totalMCs = dailyMCData.reduce((sum, d) => sum + d.mcs, 0);
  const totalDoctors = DOCTORS_DATA.length;
  const onlineDoctors = DOCTORS_DATA.filter(d => d.status === 'online').length;
  const verificationRate = Math.round((RECENT_MCS.filter(mc => mc.status === 'verified').length / RECENT_MCS.length) * 100);
  const currentInvoice = INVOICE_HISTORY[0];

  // Check if wallet is connected (for demo, allow any wallet)
  if (!walletAddress) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: theme.bg }}>
      {/* ═══════════════════════════════════════════════════════════════════
          HEADER
          ═══════════════════════════════════════════════════════════════════ */}
      <header
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${theme.border}`,
          padding: '16px 32px',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div className="flex items-center justify-between" style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Left: Hospital Info */}
          <div className="flex items-center gap-4">
            {/* Logo Placeholder */}
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: `linear-gradient(135deg, ${theme.accent}, ${theme.purple})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                fontWeight: 700,
                color: '#fff',
              }}
            >
              {HOSPITAL_INFO.name.charAt(0)}
            </div>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: 700, color: theme.textPrimary }}>
                {HOSPITAL_INFO.name}
              </h1>
              <p style={{ fontSize: '13px', color: theme.textMuted }}>
                CEO Dashboard • {HOSPITAL_INFO.location}
              </p>
            </div>
          </div>

          {/* Right: Time & Actions */}
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
                {currentTime.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p style={{ fontSize: '12px', color: theme.textMuted }}>
                {currentTime.toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            </div>

            <div style={{ width: '1px', height: '32px', background: theme.border }} className="hidden md:block" />

            <button
              onClick={() => window.location.href = '/'}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN CONTENT
          ═══════════════════════════════════════════════════════════════════ */}
      <main style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto', width: '100%', flex: 1 }}>

        {/* ═══════════════════════════════════════════════════════════════════
            KEY METRICS ROW
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            title="Total MCs Issued"
            value={totalMCs.toLocaleString()}
            subtitle="This month"
            trend="+12.5%"
            trendUp={true}
            accentColor={theme.accent}
            icon={
              <svg className="w-5 h-5" fill={theme.accent} viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0h8v12H6V4z" clipRule="evenodd" />
              </svg>
            }
          />

          <MetricCard
            title="Active Doctors"
            value={`${onlineDoctors}/${totalDoctors}`}
            subtitle="Currently online"
            accentColor={theme.success}
            icon={
              <svg className="w-5 h-5" fill={theme.success} viewBox="0 0 20 20">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
            }
          />

          <MetricCard
            title="Subscription Status"
            value="Active"
            subtitle={`Next billing: ${new Date(currentInvoice.dueDate).toLocaleDateString('en-MY', { month: 'short', day: 'numeric' })}`}
            accentColor={theme.success}
            icon={
              <svg className="w-5 h-5" fill={theme.success} viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            }
          />

          <MetricCard
            title="Verification Rate"
            value={`${verificationRate}%`}
            subtitle="MCs verified on-chain"
            trend="+2.3%"
            trendUp={true}
            accentColor={theme.purple}
            icon={
              <svg className="w-5 h-5" fill={theme.purple} viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            }
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            MC ANALYTICS SECTION
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Daily MC Chart - Takes 2 columns */}
          <div
            className="lg:col-span-2"
            style={{
              background: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '16px',
              padding: '24px',
            }}
          >
            <SectionHeader
              title="MC Issuance Trend"
              subtitle="Last 30 days"
              action={
                <select
                  style={{
                    background: theme.bgCardSolid,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: theme.textSecondary,
                    fontSize: '13px',
                  }}
                >
                  <option>Last 30 days</option>
                  <option>Last 7 days</option>
                  <option>Last 90 days</option>
                </select>
              }
            />
            <div style={{ height: '280px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyMCData}>
                  <defs>
                    <linearGradient id="mcGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.accent} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={theme.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                  <XAxis
                    dataKey="date"
                    stroke={theme.textMuted}
                    tick={{ fontSize: 11 }}
                    interval={4}
                  />
                  <YAxis stroke={theme.textMuted} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: theme.bgCardSolid,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: theme.textPrimary }}
                  />
                  <Area
                    type="monotone"
                    dataKey="mcs"
                    stroke={theme.accent}
                    strokeWidth={2}
                    fill="url(#mcGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Department Breakdown */}
          <div
            style={{
              background: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '16px',
              padding: '24px',
            }}
          >
            <SectionHeader title="By Department" subtitle="MC distribution" />
            <div className="space-y-3">
              {DEPARTMENT_DATA.map((dept, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '3px',
                      background: dept.color,
                    }}
                  />
                  <span style={{ flex: 1, fontSize: '13px', color: theme.textSecondary }}>{dept.name}</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>{dept.mcs}</span>
                </div>
              ))}
            </div>

            {/* Peak Hours Mini Chart */}
            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: `1px solid ${theme.border}` }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: theme.textMuted, marginBottom: '12px' }}>Peak Hours Today</p>
              <div style={{ height: '80px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={PEAK_HOURS_DATA}>
                    <Bar dataKey="mcs" fill={theme.accent} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            DOCTOR PERFORMANCE & RECENT MCS
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Doctor Performance */}
          <div
            style={{
              background: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '16px',
              padding: '24px',
            }}
          >
            <SectionHeader
              title="Doctor Performance"
              subtitle={`${totalDoctors} registered doctors`}
            />
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '12px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase' }}>Doctor</th>
                    <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: '12px', fontWeight: 600, color: theme.textMuted }}>MCs</th>
                    <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: '12px', fontWeight: 600, color: theme.textMuted }}>Avg Days</th>
                    <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '12px', fontWeight: 600, color: theme.textMuted }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {DOCTORS_DATA.map((doctor) => (
                    <tr key={doctor.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '12px 8px' }}>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: theme.textPrimary }}>{doctor.name}</p>
                        <p style={{ fontSize: '12px', color: theme.textMuted }}>{doctor.specialty}</p>
                      </td>
                      <td style={{ textAlign: 'center', padding: '12px 8px', fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>{doctor.mcsIssued}</td>
                      <td style={{ textAlign: 'center', padding: '12px 8px', fontSize: '14px', color: theme.textSecondary }}>{doctor.avgDuration}</td>
                      <td style={{ textAlign: 'right', padding: '12px 8px' }}>
                        <StatusBadge status={doctor.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent MCs */}
          <div
            style={{
              background: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '16px',
              padding: '24px',
            }}
          >
            <SectionHeader
              title="Recent MCs"
              subtitle="Latest certificates issued"
              action={
                <button
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: `${theme.accent}15`,
                    border: `1px solid ${theme.accent}30`,
                    color: theme.accent,
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  View All
                </button>
              }
            />
            <div className="space-y-3">
              {RECENT_MCS.slice(0, 6).map((mc) => (
                <div
                  key={mc.id}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    background: theme.bgCardSolid,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>{mc.id}</span>
                    <StatusBadge status={mc.status} />
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span style={{ color: theme.textSecondary }}>{mc.patientName}</span>
                    <span style={{ color: theme.textMuted }}>•</span>
                    <span style={{ color: theme.textMuted }}>{mc.duration}</span>
                    <span style={{ color: theme.textMuted }}>•</span>
                    <span style={{ color: theme.textMuted }}>{mc.doctor}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            BILLING & SYSTEM STATUS
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Billing & Subscription */}
          <div
            style={{
              background: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '16px',
              padding: '24px',
            }}
          >
            <SectionHeader title="Billing & Subscription" subtitle="Current billing period" />

            {/* Current Bill Summary */}
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                background: `linear-gradient(135deg, ${theme.accent}10, ${theme.purple}10)`,
                border: `1px solid ${theme.accent}30`,
                marginBottom: '20px',
              }}
            >
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Base Subscription</p>
                  <p style={{ fontSize: '20px', fontWeight: 700, color: theme.textPrimary }}>RM 10,000</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Variable Fee ({currentInvoice.mcCount} MCs × RM1)</p>
                  <p style={{ fontSize: '20px', fontWeight: 700, color: theme.textPrimary }}>RM {currentInvoice.variableFee.toLocaleString()}</p>
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textSecondary }}>Total Due</span>
                  <span style={{ fontSize: '24px', fontWeight: 700, color: theme.accent }}>RM {currentInvoice.total.toLocaleString()}</span>
                </div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                  Due by {new Date(currentInvoice.dueDate).toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>

            {/* Invoice History */}
            <p style={{ fontSize: '13px', fontWeight: 600, color: theme.textMuted, marginBottom: '12px' }}>Invoice History</p>
            <div className="space-y-2">
              {INVOICE_HISTORY.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between"
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: theme.bgCardSolid,
                  }}
                >
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>{inv.period}</p>
                    <p style={{ fontSize: '12px', color: theme.textMuted }}>{inv.id}</p>
                  </div>
                  <div className="text-right">
                    <p style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>RM {inv.total.toLocaleString()}</p>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* System Status */}
          <div
            style={{
              background: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '16px',
              padding: '24px',
            }}
          >
            <SectionHeader title="System Status" subtitle="Infrastructure health" />

            <div className="space-y-4">
              {/* Blockchain Sync */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  background: theme.bgCardSolid,
                  border: `1px solid ${theme.success}30`,
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: theme.success, boxShadow: `0 0 10px ${theme.success}` }} />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>Blockchain Sync</span>
                  <span style={{ marginLeft: 'auto', fontSize: '12px', color: theme.success, fontWeight: 600 }}>Synced</span>
                </div>
                <p style={{ fontSize: '12px', color: theme.textMuted }}>
                  Last block: #4,847,231 • Latency: 45ms
                </p>
              </div>

              {/* Node Health */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  background: theme.bgCardSolid,
                  border: `1px solid ${theme.success}30`,
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: theme.success, boxShadow: `0 0 10px ${theme.success}` }} />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>Node Health</span>
                  <span style={{ marginLeft: 'auto', fontSize: '12px', color: theme.success, fontWeight: 600 }}>Healthy</span>
                </div>
                <p style={{ fontSize: '12px', color: theme.textMuted }}>
                  3/3 nodes online • 99.99% uptime
                </p>
              </div>

              {/* Last Backup */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  background: theme.bgCardSolid,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: theme.accent }} />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>Data Backup</span>
                  <span style={{ marginLeft: 'auto', fontSize: '12px', color: theme.textSecondary }}>2 hours ago</span>
                </div>
                <p style={{ fontSize: '12px', color: theme.textMuted }}>
                  Next scheduled: Today at 11:00 PM
                </p>
              </div>

              {/* Security */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  background: theme.bgCardSolid,
                  border: `1px solid ${theme.success}30`,
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: theme.success, boxShadow: `0 0 10px ${theme.success}` }} />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>Security</span>
                  <span style={{ marginLeft: 'auto', fontSize: '12px', color: theme.success, fontWeight: 600 }}>Secure</span>
                </div>
                <p style={{ fontSize: '12px', color: theme.textMuted }}>
                  SSL active • No threats detected
                </p>
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* ═══════════════════════════════════════════════════════════════════
          FOOTER
          ═══════════════════════════════════════════════════════════════════ */}
      <footer
        style={{
          width: '100%',
          borderTop: `1px solid ${theme.border}`,
          padding: '16px 32px',
          textAlign: 'center',
          marginTop: 'auto',
        }}
      >
        <p style={{ fontSize: '13px', color: theme.textMuted }}>
          Powered by <span style={{ fontWeight: 500, color: theme.textSecondary }}>Sarawak MedChain</span>
          <span style={{ margin: '0 12px', color: theme.border }}>|</span>
          <a href="mailto:support@sarawakmedchain.com" style={{ color: theme.textMuted, textDecoration: 'none' }}>
            support@sarawakmedchain.com
          </a>
          <span style={{ margin: '0 12px', color: theme.border }}>|</span>
          +60 82-XXX-XXX
        </p>
      </footer>
    </div>
  );
}
