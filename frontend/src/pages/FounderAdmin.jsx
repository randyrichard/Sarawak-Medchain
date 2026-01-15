import { useState, useEffect, useRef } from 'react';

// Midnight Navy Theme Colors
const theme = {
  bg: '#0a1628',
  bgCard: '#0f1f38',
  bgCardHover: '#142847',
  border: '#1e3a5f',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  accent: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
};

// Mock data generators
const generateMockMCFeed = () => {
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
    id: Date.now(),
    hospital: hospitals[Math.floor(Math.random() * hospitals.length)],
    doctor: doctors[Math.floor(Math.random() * doctors.length)],
    timestamp: new Date(),
    profit: 1.00
  };
};

const mockHospitals = [
  { id: 1, name: 'Hospital Umum Sarawak', city: 'Kuching', tier: 'Hospital', monthlyFee: 10000, paid: true, mcs: 156 },
  { id: 2, name: 'Hospital Miri', city: 'Miri', tier: 'Hospital', monthlyFee: 10000, paid: true, mcs: 124 },
  { id: 3, name: 'Hospital Sibu', city: 'Sibu', tier: 'Hospital', monthlyFee: 10000, paid: false, mcs: 98 },
  { id: 4, name: 'Klinik Kesihatan Kuching', city: 'Kuching', tier: 'Clinic', monthlyFee: 2000, paid: true, mcs: 47 },
  { id: 5, name: 'Klinik Kesihatan Miri', city: 'Miri', tier: 'Clinic', monthlyFee: 2000, paid: false, mcs: 32 },
  { id: 6, name: 'Klinik Kesihatan Sibu', city: 'Sibu', tier: 'Clinic', monthlyFee: 2000, paid: true, mcs: 28 },
];

// Sarawak Map SVG Component
function SarawakMap({ clients }) {
  const cities = {
    Kuching: { x: 25, y: 75, clients: clients.filter(c => c.city === 'Kuching') },
    Sibu: { x: 55, y: 45, clients: clients.filter(c => c.city === 'Sibu') },
    Miri: { x: 75, y: 20, clients: clients.filter(c => c.city === 'Miri') },
  };

  return (
    <div className="relative w-full h-64">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Simplified Sarawak outline */}
        <path
          d="M 5 80 Q 15 90 25 85 Q 35 80 45 70 Q 55 60 65 50 Q 75 40 85 30 Q 90 25 95 20 L 95 35 Q 85 45 75 55 Q 65 65 55 75 Q 45 85 35 90 Q 25 95 15 90 Q 5 85 5 80 Z"
          fill={theme.bgCard}
          stroke={theme.border}
          strokeWidth="0.5"
        />

        {/* City dots */}
        {Object.entries(cities).map(([cityName, data]) => (
          <g key={cityName}>
            {/* Glow effect */}
            <circle
              cx={data.x}
              cy={data.y}
              r="4"
              fill={theme.accent}
              opacity="0.3"
              className="animate-pulse"
            />
            {/* Main dot */}
            <circle
              cx={data.x}
              cy={data.y}
              r="2.5"
              fill={theme.accent}
              stroke={theme.textPrimary}
              strokeWidth="0.5"
            />
            {/* City label */}
            <text
              x={data.x}
              y={data.y + 7}
              textAnchor="middle"
              fill={theme.textSecondary}
              fontSize="4"
              fontWeight="bold"
            >
              {cityName}
            </text>
            {/* Client count */}
            <text
              x={data.x}
              y={data.y + 11}
              textAnchor="middle"
              fill={theme.success}
              fontSize="3"
            >
              {data.clients.length} clients
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function FounderAdmin() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Data state
  const [bankBalance, setBankBalance] = useState(0);
  const [mrr, setMrr] = useState(0);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [mcFeed, setMcFeed] = useState([]);
  const [totalProfit, setTotalProfit] = useState(0);
  const feedRef = useRef(null);

  // Super Admin password (in production, this would be server-side)
  const SUPER_ADMIN_PASSWORD = 'founder2026';

  // Handle login
  const handleLogin = (e) => {
    e.preventDefault();
    if (password === SUPER_ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Invalid Super Admin credentials');
    }
  };

  // Initialize data
  useEffect(() => {
    if (isAuthenticated) {
      // Calculate MRR
      const totalMRR = mockHospitals.reduce((sum, h) => sum + h.monthlyFee, 0);
      setMrr(totalMRR);

      // Calculate bank balance (mock - paid subscriptions + MC revenue)
      const paidSubscriptions = mockHospitals.filter(h => h.paid).reduce((sum, h) => sum + h.monthlyFee, 0);
      const mcRevenue = mockHospitals.reduce((sum, h) => sum + h.mcs, 0);
      setBankBalance(paidSubscriptions + mcRevenue);

      // Get pending payments
      const pending = mockHospitals.filter(h => !h.paid);
      setPendingPayments(pending);

      // Initialize MC feed with some entries
      const initialFeed = Array.from({ length: 5 }, () => generateMockMCFeed());
      setMcFeed(initialFeed);
      setTotalProfit(initialFeed.length);
    }
  }, [isAuthenticated]);

  // Live MC Feed - add new entries periodically
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      const newMC = generateMockMCFeed();
      setMcFeed(prev => [newMC, ...prev.slice(0, 19)]); // Keep last 20
      setTotalProfit(prev => prev + 1);
      setBankBalance(prev => prev + 1);
    }, 3000 + Math.random() * 4000); // Random interval 3-7 seconds

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [mcFeed]);

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: theme.bg }}
      >
        <div
          className="w-full max-w-md rounded-2xl p-8 border"
          style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
        >
          {/* Lock Icon */}
          <div className="flex justify-center mb-6">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ backgroundColor: theme.bg, border: `2px solid ${theme.accent}` }}
            >
              <svg className="w-10 h-10" fill={theme.accent} viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center mb-2" style={{ color: theme.textPrimary }}>
            Founder Access
          </h1>
          <p className="text-center mb-8" style={{ color: theme.textSecondary }}>
            Super Admin authentication required
          </p>

          <form onSubmit={handleLogin}>
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2" style={{ color: theme.textSecondary }}>
                Super Admin Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all"
                style={{
                  backgroundColor: theme.bg,
                  borderColor: theme.border,
                  color: theme.textPrimary,
                  focusRingColor: theme.accent
                }}
                placeholder="Enter password..."
              />
            </div>

            {loginError && (
              <div
                className="mb-4 px-4 py-3 rounded-xl text-sm"
                style={{ backgroundColor: `${theme.danger}20`, color: theme.danger }}
              >
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-4 rounded-xl font-bold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: theme.accent }}
            >
              Access Dashboard
            </button>
          </form>

          <p className="text-center mt-6 text-xs" style={{ color: theme.textMuted }}>
            Unauthorized access is prohibited and monitored
          </p>
        </div>
      </div>
    );
  }

  // Main Dashboard
  return (
    <div
      className="min-h-screen p-8"
      style={{ backgroundColor: theme.bg }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: theme.accent }}
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold" style={{ color: theme.textPrimary }}>
              Founder Command Center
            </h1>
          </div>
          <p style={{ color: theme.textSecondary }}>
            Sarawak MedChain Revenue Intelligence
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ backgroundColor: `${theme.success}20`, color: theme.success }}
          >
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: theme.success }}></span>
            <span className="text-sm font-medium">System Online</span>
          </div>
          <button
            onClick={() => setIsAuthenticated(false)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
            style={{ backgroundColor: theme.bgCard, color: theme.textSecondary, border: `1px solid ${theme.border}` }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Revenue Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Total Bank Balance */}
        <div
          className="rounded-2xl p-6 border"
          style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium" style={{ color: theme.textSecondary }}>
              Total Bank Balance
            </p>
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${theme.success}20` }}
            >
              <svg className="w-5 h-5" fill={theme.success} viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </div>
          </div>
          <p className="text-4xl font-black mb-2" style={{ color: theme.success }}>
            RM {bankBalance.toLocaleString()}
          </p>
          <p className="text-sm" style={{ color: theme.textMuted }}>
            From Payment Gateway API
          </p>
        </div>

        {/* Monthly Recurring Revenue */}
        <div
          className="rounded-2xl p-6 border"
          style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium" style={{ color: theme.textSecondary }}>
              Monthly Recurring Revenue
            </p>
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${theme.accent}20` }}
            >
              <svg className="w-5 h-5" fill={theme.accent} viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <p className="text-4xl font-black mb-2" style={{ color: theme.accent }}>
            RM {mrr.toLocaleString()}
          </p>
          <div className="flex items-center gap-4 text-sm" style={{ color: theme.textMuted }}>
            <span>{mockHospitals.filter(h => h.tier === 'Hospital').length} Hospitals × RM10k</span>
            <span>{mockHospitals.filter(h => h.tier === 'Clinic').length} Clinics × RM2k</span>
          </div>
        </div>

        {/* Pending Payments */}
        <div
          className="rounded-2xl p-6 border"
          style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium" style={{ color: theme.textSecondary }}>
              Pending Payments
            </p>
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${theme.warning}20` }}
            >
              <svg className="w-5 h-5" fill={theme.warning} viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <p className="text-4xl font-black mb-2" style={{ color: theme.warning }}>
            RM {pendingPayments.reduce((sum, h) => sum + h.monthlyFee, 0).toLocaleString()}
          </p>
          <div className="space-y-1">
            {pendingPayments.map(hospital => (
              <div key={hospital.id} className="flex items-center justify-between text-sm">
                <span style={{ color: theme.textSecondary }}>{hospital.name}</span>
                <span style={{ color: theme.warning }}>RM {hospital.monthlyFee.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Map and Live Feed Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hospital Map */}
        <div
          className="rounded-2xl p-6 border"
          style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold" style={{ color: theme.textPrimary }}>
                Sarawak Client Map
              </h2>
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                Active healthcare facilities
              </p>
            </div>
            <div
              className="px-3 py-1 rounded-full text-sm font-medium"
              style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}
            >
              {mockHospitals.length} Clients
            </div>
          </div>

          <SarawakMap clients={mockHospitals} />

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-4 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.accent }}></div>
              <span className="text-sm" style={{ color: theme.textSecondary }}>Active Client</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: theme.success }}></div>
              <span className="text-sm" style={{ color: theme.textSecondary }}>Revenue Flowing</span>
            </div>
          </div>
        </div>

        {/* Live MC Feed */}
        <div
          className="rounded-2xl p-6 border"
          style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold" style={{ color: theme.textPrimary }}>
                Live Revenue Feed
              </h2>
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                RM1.00 per MC issued
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black" style={{ color: theme.success }}>
                +RM {totalProfit.toLocaleString()}
              </p>
              <p className="text-xs" style={{ color: theme.textMuted }}>Today's MC Profit</p>
            </div>
          </div>

          {/* Feed List */}
          <div
            ref={feedRef}
            className="space-y-2 h-64 overflow-y-auto pr-2"
            style={{ scrollbarWidth: 'thin' }}
          >
            {mcFeed.map((item, index) => (
              <div
                key={item.id}
                className={`p-3 rounded-xl transition-all ${index === 0 ? 'animate-pulse' : ''}`}
                style={{
                  backgroundColor: index === 0 ? `${theme.success}15` : theme.bg,
                  border: `1px solid ${index === 0 ? theme.success : theme.border}`
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                      style={{ backgroundColor: `${theme.success}20`, color: theme.success }}
                    >
                      +1
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>
                        {item.hospital.name}
                      </p>
                      <p className="text-xs" style={{ color: theme.textMuted }}>
                        {item.doctor} • {item.hospital.city}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold" style={{ color: theme.success }}>
                      +RM {item.profit.toFixed(2)}
                    </p>
                    <p className="text-xs" style={{ color: theme.textMuted }}>
                      {item.timestamp.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Live Indicator */}
          <div
            className="mt-4 pt-4 flex items-center justify-center gap-2"
            style={{ borderTop: `1px solid ${theme.border}` }}
          >
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: theme.success }}></span>
            <span className="text-sm font-medium" style={{ color: theme.success }}>
              Listening for blockchain events...
            </span>
          </div>
        </div>
      </div>

      {/* Footer Stats */}
      <div
        className="mt-8 rounded-2xl p-6 border"
        style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <p className="text-sm" style={{ color: theme.textSecondary }}>Total MCs Issued</p>
            <p className="text-2xl font-bold" style={{ color: theme.textPrimary }}>
              {mockHospitals.reduce((sum, h) => sum + h.mcs, 0).toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm" style={{ color: theme.textSecondary }}>Active Hospitals</p>
            <p className="text-2xl font-bold" style={{ color: theme.textPrimary }}>
              {mockHospitals.filter(h => h.tier === 'Hospital').length}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm" style={{ color: theme.textSecondary }}>Active Clinics</p>
            <p className="text-2xl font-bold" style={{ color: theme.textPrimary }}>
              {mockHospitals.filter(h => h.tier === 'Clinic').length}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm" style={{ color: theme.textSecondary }}>Payment Rate</p>
            <p className="text-2xl font-bold" style={{ color: theme.success }}>
              {Math.round((mockHospitals.filter(h => h.paid).length / mockHospitals.length) * 100)}%
            </p>
          </div>
        </div>
      </div>

      {/* Security Notice */}
      <p className="text-center mt-6 text-xs" style={{ color: theme.textMuted }}>
        Founder Command Center • Access Logged • Session Encrypted
      </p>
    </div>
  );
}
