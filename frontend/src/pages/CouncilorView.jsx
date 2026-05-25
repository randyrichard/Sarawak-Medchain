import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { usePWA, PWA_CONFIGS } from '../hooks/usePWA';

/**
 * ScrollReveal — fades + slides children into view when they enter the viewport.
 * direction: 'left' | 'right' | 'up' (default 'up')
 * delay: ms to wait before the animation starts (for stagger effects)
 *
 * Uses Intersection Observer; no library dependency.
 * Animation plays once. Reduced-motion users see the content immediately.
 */
function ScrollReveal({ children, direction = 'up', delay = 0, className = '' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Respect reduced-motion preference
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const offset = {
    left: 'translate3d(-48px, 0, 0)',
    right: 'translate3d(48px, 0, 0)',
    up: 'translate3d(0, 32px, 0)',
  }[direction] || 'translate3d(0, 32px, 0)';

  return (
    <div
      ref={ref}
      className={className}
      style={{
        transform: visible ? 'translate3d(0, 0, 0)' : offset,
        opacity: visible ? 1 : 0,
        transition: `transform 0.85s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, opacity 0.85s ease-out ${delay}ms`,
        willChange: visible ? 'auto' : 'transform, opacity',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Councilor View - Government Preview Dashboard
 * Public Health Dashboard, Economic Impact, Governance Branding, ESG Stats
 *
 * OPTIMIZED FOR: iPhone 8 Plus (5.5-inch, 16:9 display)
 * - Touch targets: Minimum 48px for thumb-tapping
 * - Light theme: Professional clean look
 * - PWA: Offline caching enabled via service worker
 */

// Sarawak district data for heatmap
const DISTRICTS = [
  { id: 'kuching', name: 'Kuching', x: 18, y: 75, population: 570407, cases: 0, color: '#10b981' },
  { id: 'samarahan', name: 'Samarahan', x: 25, y: 68, population: 264673, cases: 0, color: '#10b981' },
  { id: 'serian', name: 'Serian', x: 15, y: 65, population: 100694, cases: 0, color: '#10b981' },
  { id: 'sri-aman', name: 'Sri Aman', x: 30, y: 60, population: 68600, cases: 0, color: '#10b981' },
  { id: 'betong', name: 'Betong', x: 38, y: 55, population: 44200, cases: 0, color: '#10b981' },
  { id: 'sarikei', name: 'Sarikei', x: 45, y: 52, population: 129700, cases: 0, color: '#10b981' },
  { id: 'sibu', name: 'Sibu', x: 52, y: 55, population: 291687, cases: 0, color: '#10b981' },
  { id: 'kapit', name: 'Kapit', x: 58, y: 50, population: 129000, cases: 0, color: '#10b981' },
  { id: 'mukah', name: 'Mukah', x: 55, y: 42, population: 67700, cases: 0, color: '#10b981' },
  { id: 'bintulu', name: 'Bintulu', x: 68, y: 42, population: 228900, cases: 0, color: '#10b981' },
  { id: 'miri', name: 'Miri', x: 82, y: 25, population: 358020, cases: 0, color: '#10b981' },
  { id: 'limbang', name: 'Limbang', x: 90, y: 18, population: 53200, cases: 0, color: '#10b981' },
  { id: 'lawas', name: 'Lawas', x: 95, y: 12, population: 38600, cases: 0, color: '#10b981' },
];

// Medical issue categories for heatmap
const HEALTH_CATEGORIES = [
  { id: 'respiratory', name: 'Respiratory', icon: '🫁', color: '#3b82f6' },
  { id: 'cardiovascular', name: 'Cardiovascular', icon: '❤️', color: '#ef4444' },
  { id: 'musculoskeletal', name: 'Musculoskeletal', icon: '🦴', color: '#f59e0b' },
  { id: 'gastrointestinal', name: 'Gastrointestinal', icon: '🔄', color: '#8b5cf6' },
  { id: 'mental-health', name: 'Mental Health', icon: '🧠', color: '#06b6d4' },
  { id: 'general', name: 'General/Fever', icon: '🤒', color: '#10b981' },
];

// ESG Constants
const ESG_METRICS = {
  paperPerMC: 0.015, // kg of paper per traditional MC (3 sheets avg)
  co2PerKgPaper: 1.5, // kg CO2 per kg paper production
  treesPerTonPaper: 17, // trees saved per ton of paper
  waterPerKgPaper: 10, // liters of water per kg paper
};

export default function CouncilorView() {
  const navigate = useNavigate();
  const location = useLocation();
  const [districts, setDistricts] = useState(DISTRICTS);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [fraudSaved, setFraudSaved] = useState(2300000000); // RM 2.3B baseline
  const [mcsProcessed, setMcsProcessed] = useState(847000);
  const [animatedFraud, setAnimatedFraud] = useState(0);
  const [hoveredDistrict, setHoveredDistrict] = useState(null);
  const [isHighContrast, setIsHighContrast] = useState(false);
  const counterRef = useRef(null);

  // Check if we're on the PWA route (for home screen icon)
  const isPWARoute = location.pathname === '/admin/gov-dashboard' || location.pathname.startsWith('/admin/gov-dashboard');

  // Demo sample transaction hash for verification demo
  const DEMO_TX_HASH = '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b';

  // PWA: Only set manifest when on /pwa/gov route
  usePWA(isPWARoute ? PWA_CONFIGS.gov : null);

  // Theme classes for light mode — institutional palette
  const theme = {
    bg: '#F8FAFC', // subtle off-white so white cards pop
    cardBg: 'bg-white',
    headerBg: '#FFFFFF',
    text: 'text-slate-800',
    textMuted: 'text-slate-500',
    border: 'border-slate-200',
    accent: isHighContrast ? 'text-yellow-400' : 'text-emerald-400',
    accentBg: isHighContrast ? 'bg-yellow-500/20' : 'bg-emerald-500/20',
  };

  // Animate fraud counter on load
  useEffect(() => {
    const duration = 3000;
    const steps = 60;
    const increment = fraudSaved / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current += increment;
      if (step >= steps) {
        setAnimatedFraud(fraudSaved);
        clearInterval(timer);
      } else {
        setAnimatedFraud(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [fraudSaved]);

  // Simulate live health data updates
  useEffect(() => {
    const updateHealthData = () => {
      setDistricts(prev => prev.map(district => {
        // Randomize case density for demo
        const baseCases = Math.floor(district.population / 1000);
        const variation = Math.floor(Math.random() * baseCases * 0.3);
        const cases = baseCases + variation;

        // Color based on density (cases per 10k population)
        const density = (cases / district.population) * 10000;
        let color = '#10b981'; // Green - low
        if (density > 50) color = '#f59e0b'; // Amber - medium
        if (density > 100) color = '#ef4444'; // Red - high

        return { ...district, cases, color };
      }));
    };

    updateHealthData();
    const interval = setInterval(updateHealthData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Simulate MC counter incrementing
  useEffect(() => {
    const interval = setInterval(() => {
      setMcsProcessed(prev => prev + Math.floor(Math.random() * 3) + 1);
      setFraudSaved(prev => prev + Math.floor(Math.random() * 5000) + 1000);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Calculate ESG metrics
  const paperSavedKg = mcsProcessed * ESG_METRICS.paperPerMC;
  const co2Saved = paperSavedKg * ESG_METRICS.co2PerKgPaper;
  const treesSaved = (paperSavedKg / 1000) * ESG_METRICS.treesPerTonPaper;
  const waterSaved = paperSavedKg * ESG_METRICS.waterPerKgPaper;

  // Get total cases by category
  const getTotalCases = () => {
    return districts.reduce((sum, d) => sum + d.cases, 0);
  };

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: theme.bg }}>
      {/* Global CSS Overrides */}
      <style>{`
        * {
          box-sizing: border-box;
        }
      `}</style>

      {/* Header with Governance Branding - Mobile Optimized */}
      {/* iPhone 8 Plus Safe Area: Extra 20px padding to prevent iOS status bar overlap */}
      <header
        className="sticky top-0 z-50 pt-[20px]"
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          paddingTop: 'calc(20px + env(safe-area-inset-top, 0px))'
        }}
      >
        <div style={{ maxWidth: '1400px', margin: '0 auto' }} className="px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            {/* Logo + Alignment Text */}
            <div className="flex items-center gap-3 sm:gap-5 flex-1 min-w-0">
              {/* MedChain Logo - Clean & Single */}
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0F2A5C 0%, #1E3A8A 100%)' }}>
                  <svg className="w-5 h-5 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="hidden sm:block">
                  <p className="text-slate-800 font-bold text-sm leading-tight">Sarawak MedChain</p>
                  <p className="text-xs font-semibold" style={{ color: '#0F766E' }}>Government Preview</p>
                </div>
              </div>

              {/* Alignment line - shows on tablet and up */}
              <div className="hidden md:flex items-center gap-2 pl-5 border-l border-slate-200 min-w-0">
                <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <p className="text-xs text-slate-500 truncate">
                  Aligned with <span className="font-semibold text-slate-700">Sarawak Digital Economy Blueprint 2030</span>
                </p>
              </div>
            </div>

            {/* Header Right — Chrome controls */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* Last updated */}
              <div className="hidden md:flex flex-col items-end mr-2">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Last updated</span>
                <span className="text-xs text-slate-600 font-medium tabular-nums">
                  {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} MYT
                </span>
              </div>

              {/* High Contrast Toggle — smaller */}
              <button
                onClick={() => setIsHighContrast(!isHighContrast)}
                className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg border hover:bg-slate-50 active:scale-95 transition-all ${
                  isHighContrast ? 'bg-yellow-100 border-yellow-300' : 'bg-white border-slate-200'
                }`}
                aria-label="Toggle high contrast"
                title="Toggle high contrast"
              >
                <svg className={`w-4 h-4 ${isHighContrast ? 'text-yellow-600' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </button>

              {/* Live Status Badge — refined */}
              <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border" style={{ background: '#F0FDF4', borderColor: '#A7F3D0' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#10B981' }}></span>
                <span className="text-xs font-semibold" style={{ color: '#047857' }}>LIVE</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Centered, generous spacing for institutional feel */}
      <main style={{ maxWidth: '1280px', margin: '0 auto' }} className="px-4 sm:px-8 py-8 sm:py-14">
        {/* Preview Dashboard Disclaimer - Honest framing for govt readers */}
        <div className="mb-10 sm:mb-14 rounded-xl border px-5 py-4 flex items-start gap-3" style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#D97706' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: '#92400E' }}>Preview Dashboard</p>
            <p className="text-xs sm:text-sm mt-0.5" style={{ color: '#78350F' }}>
              Economic impact figures shown are <strong>industry-benchmark projections</strong> for Sarawak (population ~2.9M). District data is illustrative. Live data populates upon pilot deployment.
            </p>
          </div>
        </div>

        {/* Page Title + Trust Strip — institutional, generous spacing */}
        <ScrollReveal direction="up" className="mb-20 sm:mb-28 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: '#0F766E' }}>State Agency Preview</p>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight tracking-tight">
              Public Health Intelligence Dashboard
            </h1>
            <p className="text-base text-slate-500 mt-3 max-w-2xl leading-relaxed">
              What Sarawak state agencies see when MedChain runs across the state — anonymized, aggregated, audit-ready.
            </p>
          </div>

          {/* Trust signals — inline, generous gap */}
          <div className="flex flex-wrap gap-2.5 lg:gap-3 lg:flex-shrink-0">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#0F766E' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div>
                <p className="text-[11px] font-semibold text-slate-900 leading-tight">Tamper-proof</p>
                <p className="text-[10px] text-slate-500 leading-tight">by architecture</p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white">
              <span className="text-base leading-none">🇲🇾</span>
              <div>
                <p className="text-[11px] font-semibold text-slate-900 leading-tight">Data resident</p>
                <p className="text-[10px] text-slate-500 leading-tight">in Malaysia</p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white">
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              <div>
                <p className="text-[11px] font-semibold text-slate-900 leading-tight">PDPA 2010</p>
                <p className="text-[10px] text-slate-500 leading-tight">compliant</p>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Economic Impact — Clean institutional card with generous padding */}
        <ScrollReveal direction="left" className="mb-20 sm:mb-28">
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div className="grid grid-cols-1 lg:grid-cols-3">
              {/* Left: Primary counter */}
              <div className="lg:col-span-2 p-8 sm:p-12 border-b lg:border-b-0 lg:border-r border-slate-200" style={{ background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)' }}>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: '#0F766E' }}>
                  Projected Economic Impact
                </p>
                <p className="text-sm text-slate-500 mb-8">Annual fraud prevention at full statewide adoption</p>

                {/* Counter */}
                <div className="flex items-baseline gap-3 mb-8">
                  <span className="text-xl sm:text-2xl font-bold text-slate-400">RM</span>
                  <span
                    ref={counterRef}
                    className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 tabular-nums tracking-tight"
                  >
                    {animatedFraud.toLocaleString()}
                  </span>
                </div>

                {/* Sub-metrics row */}
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3 pt-8 border-t border-slate-200">
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Volume / year</p>
                    <p className="text-sm font-semibold text-slate-700">{mcsProcessed.toLocaleString()} MCs</p>
                  </div>
                  <div className="h-8 w-px bg-slate-200"></div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Source</p>
                    <p className="text-sm font-semibold text-slate-700">MOH industry estimates</p>
                  </div>
                  <div className="h-8 w-px bg-slate-200"></div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Status</p>
                    <p className="text-sm font-semibold" style={{ color: '#0F766E' }}>Illustrative</p>
                  </div>
                </div>
              </div>

              {/* Right: Impact breakdown */}
              <div className="p-8 sm:p-10 bg-white">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 mb-2">Impact Breakdown</p>
                <p className="text-xs text-slate-400 mb-7">At full statewide adoption</p>
                <div className="space-y-5">
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-slate-600">Annual fraud prevention</span>
                      <span className="font-semibold text-slate-900">RM 1.8B</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: '78%', background: '#0F2A5C' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-slate-600">Admin cost savings</span>
                      <span className="font-semibold text-slate-900">RM 350M</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: '15%', background: '#1E3A8A' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-slate-600">Healthcare efficiency gain</span>
                      <span className="font-semibold text-slate-900">RM 150M</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: '7%', background: '#0F766E' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Try-It Action Buttons — restrained secondary style */}
        <ScrollReveal direction="right" className="mb-20 sm:mb-28">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 mb-4">Try it now</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => navigate(`/verify/${DEMO_TX_HASH}`)}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-white border border-slate-200 hover:border-slate-300 active:scale-[0.99] text-slate-800 font-semibold text-sm rounded-xl transition-all"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Verify a Medical Certificate</span>
            </button>
            <button
              onClick={() => navigate('/demo')}
              className="flex items-center justify-center gap-3 px-6 py-4 active:scale-[0.99] text-white font-semibold text-sm rounded-xl transition-all"
              style={{ background: '#0F2A5C', boxShadow: '0 1px 3px rgba(15, 42, 92, 0.2)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#1E3A8A'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#0F2A5C'; }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>See How an MC Is Issued</span>
            </button>
          </div>
        </ScrollReveal>

        {/* Main Grid - Responsive, generous gaps */}
        <ScrollReveal direction="left" className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 mb-20 sm:mb-28">
          {/* Health Heatmap */}
          <div className={`lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden`} style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div className="p-6 sm:p-7 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-slate-800 font-bold">Public Health Heatmap</h3>
                    <p className="text-slate-500 text-sm">Anonymized medical certificate distribution by district</p>
                  </div>
                </div>

                {/* Category Filter */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Categories</option>
                  {HEALTH_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Map Visualization */}
            <div className="relative h-80 p-4">
              {/* Sarawak outline (simplified) */}
              <svg viewBox="0 0 100 100" className="w-full h-full">
                {/* Background shape of Sarawak */}
                <path
                  d="M5,80 Q10,75 15,78 Q25,82 35,75 Q45,68 55,65 Q65,55 75,45 Q85,35 95,15 Q98,12 95,20 Q90,35 85,45 Q80,55 70,60 Q60,70 50,72 Q40,75 30,78 Q20,82 10,85 Q5,87 5,80 Z"
                  fill="rgba(219, 234, 254, 0.5)"
                  stroke="rgba(59, 130, 246, 0.5)"
                  strokeWidth="0.5"
                />

                {/* District markers */}
                {districts.map(district => (
                  <g key={district.id}>
                    {/* Pulsing ring */}
                    <circle
                      cx={district.x}
                      cy={district.y}
                      r="4"
                      fill="none"
                      stroke={district.color}
                      strokeWidth="0.5"
                      opacity="0.5"
                      className="animate-ping"
                    />
                    {/* Main marker */}
                    <circle
                      cx={district.x}
                      cy={district.y}
                      r="2.5"
                      fill={district.color}
                      stroke="white"
                      strokeWidth="0.3"
                      className="cursor-pointer transition-all hover:r-3"
                      onMouseEnter={() => setHoveredDistrict(district)}
                      onMouseLeave={() => setHoveredDistrict(null)}
                    />
                    {/* District label */}
                    <text
                      x={district.x}
                      y={district.y + 6}
                      textAnchor="middle"
                      fontSize="2.5"
                      fill="#64748b"
                      className="pointer-events-none"
                    >
                      {district.name}
                    </text>
                  </g>
                ))}
              </svg>

              {/* Hovered District Info */}
              {hoveredDistrict && (
                <div className="absolute top-4 right-4 bg-white border border-slate-200 rounded-xl p-4 shadow-xl">
                  <p className="text-slate-800 font-bold">{hoveredDistrict.name}</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="text-slate-500">Population: <span className="text-slate-800">{hoveredDistrict.population.toLocaleString()}</span></p>
                    <p className="text-slate-500">MCs Issued: <span className="text-slate-800">{hoveredDistrict.cases.toLocaleString()}</span></p>
                    <p className="text-slate-500">Density: <span className={`font-bold ${
                      hoveredDistrict.color === '#ef4444' ? 'text-red-400' :
                      hoveredDistrict.color === '#f59e0b' ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {((hoveredDistrict.cases / hoveredDistrict.population) * 10000).toFixed(1)} per 10K
                    </span></p>
                  </div>
                </div>
              )}

              {/* Legend */}
              <div className="absolute bottom-4 left-4 flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                  <span className="text-slate-500">Low</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                  <span className="text-slate-500">Medium</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500"></span>
                  <span className="text-slate-500">High</span>
                </div>
              </div>
            </div>
          </div>

          {/* Health Categories Breakdown — clean institutional */}
          <div className="bg-white rounded-2xl border border-slate-200 p-7" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div className="mb-6 pb-5 border-b border-slate-100">
              <h3 className="text-slate-900 font-semibold text-base">Diagnosis Categories</h3>
              <p className="text-slate-500 text-xs mt-1">Aggregated, de-identified — pilot illustrative data</p>
            </div>

            <div className="space-y-4">
              {HEALTH_CATEGORIES.map((cat) => {
                const percentage = Math.floor(Math.random() * 30) + 5;
                return (
                  <div key={cat.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat.color }}></span>
                        <span className="text-slate-700 text-sm">{cat.name}</span>
                      </div>
                      <span className="text-slate-900 font-semibold text-sm tabular-nums">{percentage}%</span>
                    </div>
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: cat.color,
                        }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-7 pt-5 border-t border-slate-100">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-500 uppercase tracking-[0.1em]">Sample window</span>
                <span className="text-slate-900 font-semibold text-sm tabular-nums">{getTotalCases().toLocaleString()} MCs</span>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* ESG / Sustainability Impact — Clean institutional cards */}
        <ScrollReveal direction="right" className="mb-20 sm:mb-28">
          <div className="mb-10 pb-6 border-b border-slate-200">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: '#0F766E' }}>Sustainability Impact</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Environmental footprint reduction</h2>
            <p className="text-base text-slate-500 mt-2">Projected annual impact from paperless medical certificates across Sarawak</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {/* Paper Saved */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-slate-300 transition-colors" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full" style={{ background: '#10B981' }}></span>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Paper saved</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {paperSavedKg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-slate-500 mt-1">kilograms / year</p>
              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  ≈ <span className="font-semibold text-slate-700">{Math.floor(paperSavedKg / 5).toLocaleString()}</span> reams
                </p>
              </div>
            </div>

            {/* CO2 Reduced */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-slate-300 transition-colors" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full" style={{ background: '#06B6D4' }}></span>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">CO₂ avoided</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {co2Saved.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-slate-500 mt-1">kg CO₂ / year</p>
              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  ≈ <span className="font-semibold text-slate-700">{Math.floor(co2Saved / 4.6).toLocaleString()}</span> car trips avoided
                </p>
              </div>
            </div>

            {/* Trees Saved */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-slate-300 transition-colors" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full" style={{ background: '#059669' }}></span>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Trees preserved</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {treesSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-slate-500 mt-1">trees / year</p>
              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{((treesSaved * 21) / 1000).toFixed(1)}</span> tons O₂ / year
                </p>
              </div>
            </div>

            {/* Water Saved */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-slate-300 transition-colors" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full" style={{ background: '#3B82F6' }}></span>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Water conserved</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {(waterSaved / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-slate-500 mt-1">cubic metres / year</p>
              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  ≈ <span className="font-semibold text-slate-700">{Math.floor(waterSaved / 150).toLocaleString()}</span> households / day
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Network Stats — institutional footer block */}
        <ScrollReveal direction="left" className="mb-20 sm:mb-28">
          <div className="mb-10 pb-6 border-b border-slate-200">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: '#0F766E' }}>Network Reach</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Sarawak healthcare network at scale</h2>
            <p className="text-base text-slate-500 mt-2">Coverage projected at full statewide deployment</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 sm:gap-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 mb-3">Hospitals</p>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">27</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 mb-3">Clinics</p>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">142</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 mb-3">Doctors</p>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">1,247</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 col-span-2 sm:col-span-1" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 mb-3">Patients</p>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">89,432</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 col-span-2 sm:col-span-1" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 mb-3">Uptime</p>
              <p className="text-3xl font-bold tabular-nums" style={{ color: '#0F766E' }}>99.99%</p>
            </div>
          </div>
        </ScrollReveal>

        {/* Footer — institutional, refined */}
        <footer className="mt-12 sm:mt-16 pt-10 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-slate-500 text-sm">
                Data refreshes every 10 seconds · Anonymized and aggregated
              </p>
              <p className="text-slate-400 text-xs mt-1">
                Sarawak MedChain — Government Preview · Built in Sarawak
              </p>
            </div>
            <div className="flex items-center gap-6">
              <Link to="/pitch" className="text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors">
                For Hospitals
              </Link>
              <Link to="/" className="text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors">
                Back to Home
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
