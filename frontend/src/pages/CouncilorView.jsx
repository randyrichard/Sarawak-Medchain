import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { usePWA, PWA_CONFIGS } from '../hooks/usePWA';

/**
 * Councilor View - Government Preview Dashboard
 * Public Health Dashboard, Economic Impact, Governance Branding, ESG Stats
 *
 * OPTIMIZED FOR: iPhone 8 Plus (5.5-inch, 16:9 display)
 * - Touch targets: Minimum 48px for thumb-tapping
 * - Dark mode: High-contrast toggle for professional demos
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
  const [isDarkMode, setIsDarkMode] = useState(true); // Default dark for high-tech look
  const [isHighContrast, setIsHighContrast] = useState(false);
  const counterRef = useRef(null);

  // Check if we're on the PWA route (for home screen icon)
  const isPWARoute = location.pathname === '/admin/gov-dashboard' || location.pathname.startsWith('/admin/gov-dashboard');

  // Demo sample transaction hash for verification demo
  const DEMO_TX_HASH = '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b';

  // PWA: Only set manifest when on /pwa/gov route
  usePWA(isPWARoute ? PWA_CONFIGS.gov : null);

  // Theme classes for dark/light mode
  const theme = {
    bg: isDarkMode ? 'bg-[#030712]' : 'bg-gray-100',
    cardBg: isDarkMode ? 'bg-slate-900/50' : 'bg-white',
    headerBg: isDarkMode ? 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900' : 'bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800',
    text: isDarkMode ? 'text-white' : 'text-gray-900',
    textMuted: isDarkMode ? 'text-slate-400' : 'text-gray-600',
    border: isDarkMode ? 'border-slate-700/50' : 'border-gray-200',
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
    <div className={`min-h-screen ${theme.bg} transition-colors duration-300`}>
      {/* Header with Governance Branding - Mobile Optimized */}
      {/* iPhone 8 Plus Safe Area: Extra 20px padding to prevent iOS status bar overlap */}
      <header className={`${theme.headerBg} border-b ${theme.border} sticky top-0 z-50 pt-[20px]`} style={{ paddingTop: 'calc(20px + env(safe-area-inset-top, 0px))' }}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            {/* Logo Strip - Responsive */}
            <div className="flex items-center gap-2 sm:gap-6 overflow-x-auto">
              {/* Sarawak Digital Logo - Compact on mobile */}
              <div className="flex items-center gap-2 sm:gap-3 pr-2 sm:pr-6 border-r border-slate-700 flex-shrink-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl flex items-center justify-center">
                  <span className="text-lg sm:text-2xl font-black text-white">SD</span>
                </div>
                <div className="hidden sm:block">
                  <p className="text-white font-bold text-sm">Sarawak</p>
                  <p className="text-cyan-400 text-xs font-semibold">DIGITAL</p>
                </div>
              </div>

              {/* Smart City Logo - Hidden on small mobile */}
              <div className="hidden xs:flex items-center gap-2 sm:gap-3 pr-2 sm:pr-6 border-r border-slate-700 flex-shrink-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div className="hidden sm:block">
                  <p className="text-white font-bold text-sm">Smart City</p>
                  <p className="text-emerald-400 text-xs font-semibold">INITIATIVE</p>
                </div>
              </div>

              {/* MedChain Logo */}
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="hidden sm:block">
                  <p className="text-white font-bold text-sm">Sarawak</p>
                  <p className="text-orange-400 text-xs font-semibold">MEDCHAIN</p>
                </div>
              </div>
            </div>

            {/* Header Right - Dark Mode Toggle & Live Status */}
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Dark Mode Toggle - Touch-friendly 48px minimum */}
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-xl bg-slate-800/50 border border-slate-700 hover:bg-slate-700 active:scale-95 transition-all touch-manipulation"
                aria-label="Toggle dark mode"
              >
                {isDarkMode ? (
                  <svg className="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-slate-300" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              {/* High Contrast Toggle */}
              <button
                onClick={() => setIsHighContrast(!isHighContrast)}
                className={`w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-xl border hover:bg-slate-700 active:scale-95 transition-all touch-manipulation ${
                  isHighContrast ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-slate-800/50 border-slate-700'
                }`}
                aria-label="Toggle high contrast"
              >
                <svg className={`w-6 h-6 ${isHighContrast ? 'text-yellow-400' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </button>

              <div className="hidden sm:block w-px h-10 bg-slate-700"></div>

              {/* Live Status Badge */}
              <div className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-3 ${theme.accentBg} border border-emerald-500/30 rounded-xl`}>
                <span className={`w-2 h-2 ${theme.accent.replace('text-', 'bg-')} rounded-full animate-pulse`}></span>
                <span className={`${theme.accent} font-bold text-xs sm:text-sm`}>LIVE</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Mobile Optimized with padding for iPhone 8 Plus */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {/* Page Title */}
        <div className="mb-4 sm:mb-8 text-center sm:text-left">
          <h1 className={`text-xl sm:text-3xl font-black ${theme.text} mb-2`}>
            Public Health Intelligence Dashboard
          </h1>
          <p className={`${theme.textMuted} text-sm sm:text-base`}>
            Real-time anonymized health data across Sarawak districts
          </p>
        </div>

        {/* 100% Integrity Badge - WEALTH 2026 DEMO: First visible element on iPhone 8 Plus */}
        <div className="flex justify-center mb-4 sm:mb-6 hero-badge-priority">
          <div className={`pass-rate-badge inline-flex items-center gap-3 px-5 py-3 sm:px-6 sm:py-4 rounded-2xl ${
            isHighContrast ? 'bg-yellow-500/20 border-2 border-yellow-400' : 'bg-emerald-500/20 border border-emerald-500/50'
          }`}>
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${
              isHighContrast ? 'bg-yellow-500' : 'bg-emerald-500'
            } flex items-center justify-center`}>
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className={`text-2xl sm:text-3xl font-black ${isHighContrast ? 'text-yellow-400' : 'text-emerald-400'}`}>
                100%
              </p>
              <p className={`text-xs sm:text-sm font-bold ${theme.textMuted}`}>INTEGRITY</p>
            </div>
          </div>
        </div>

        {/* Economic Impact Hero Section - Mobile Centered */}
        <div className="mb-4 sm:mb-8">
          <div className={`relative overflow-hidden rounded-2xl sm:rounded-3xl border ${
            isHighContrast
              ? 'bg-gradient-to-r from-yellow-900/50 via-amber-800/30 to-orange-900/50 border-yellow-500/30'
              : 'bg-gradient-to-r from-emerald-900/50 via-emerald-800/30 to-cyan-900/50 border-emerald-500/30'
          }`}>
            {/* Animated background */}
            <div className="absolute inset-0 opacity-30">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-emerald-500/20 via-transparent to-transparent"></div>
              <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-cyan-500/20 via-transparent to-transparent"></div>
            </div>

            <div className="relative p-4 sm:p-8">
              {/* Mobile: Stack vertically, Desktop: Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
                {/* Fraud Saved Counter - Centered on mobile */}
                <div className="lg:col-span-2 text-center lg:text-left">
                  <div className="flex items-center justify-center lg:justify-start gap-3 mb-3 sm:mb-4">
                    <div className={`w-12 h-12 sm:w-14 sm:h-14 ${isHighContrast ? 'bg-yellow-500/20' : 'bg-emerald-500/20'} rounded-2xl flex items-center justify-center`}>
                      <span className="text-2xl sm:text-3xl">💰</span>
                    </div>
                    <div>
                      <p className={`${isHighContrast ? 'text-yellow-300' : 'text-emerald-300'} text-xs sm:text-sm font-semibold uppercase tracking-wider`}>Economic Impact</p>
                      <p className={`${theme.textMuted} text-xs sm:text-sm`}>Fraud Prevention Savings</p>
                    </div>
                  </div>

                  {/* RM 2.3B Counter - Scaled and centered for iPhone 8 Plus */}
                  <div className="flex items-baseline justify-center lg:justify-start gap-2 sm:gap-3">
                    <span className={`${isHighContrast ? 'text-yellow-400' : 'text-emerald-400'} text-lg sm:text-2xl font-bold`}>RM</span>
                    <span
                      ref={counterRef}
                      className={`text-4xl sm:text-5xl lg:text-6xl font-black ${theme.text} tabular-nums`}
                      style={{ fontFamily: 'monospace' }}
                    >
                      {animatedFraud.toLocaleString()}
                    </span>
                  </div>

                  <div className="mt-3 sm:mt-4 flex flex-wrap items-center justify-center lg:justify-start gap-3 sm:gap-6">
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 sm:w-5 sm:h-5 ${isHighContrast ? 'text-yellow-400' : 'text-emerald-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      <span className={`${isHighContrast ? 'text-yellow-400' : 'text-emerald-400'} font-bold text-sm`}>+RM 5,000</span>
                      <span className={`${theme.textMuted} text-xs`}>/ 5 sec</span>
                    </div>
                    <div className="hidden sm:block h-4 w-px bg-slate-700"></div>
                    <div className={`${theme.textMuted} text-xs sm:text-sm`}>
                      <span className={`${theme.text} font-bold`}>{mcsProcessed.toLocaleString()}</span> MCs verified
                    </div>
                  </div>
                </div>

                {/* Impact Breakdown - Stacked on mobile */}
                <div className={`${theme.cardBg} rounded-2xl p-4 sm:p-5 border ${theme.border}`}>
                  <p className={`${theme.textMuted} text-xs font-semibold uppercase tracking-wider mb-3 sm:mb-4`}>Impact Breakdown</p>
                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <div className="flex justify-between text-xs sm:text-sm mb-1">
                        <span className={theme.textMuted}>Fake MC Fraud Blocked</span>
                        <span className={`${theme.text} font-bold`}>RM 1.8B</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full" style={{ width: '78%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs sm:text-sm mb-1">
                        <span className={theme.textMuted}>Admin Cost Reduction</span>
                        <span className={`${theme.text} font-bold`}>RM 350M</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full" style={{ width: '15%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs sm:text-sm mb-1">
                        <span className={theme.textMuted}>Healthcare Efficiency</span>
                        <span className={`${theme.text} font-bold`}>RM 150M</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full" style={{ width: '7%' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Touch-Friendly Action Buttons for Demo - 48px minimum height */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <button
            onClick={() => navigate(`/verify/${DEMO_TX_HASH}`)}
            className="flex items-center justify-center gap-2 sm:gap-3 px-4 sm:px-6 py-4 sm:py-5 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 active:scale-[0.98] text-white font-bold text-sm sm:text-base rounded-xl sm:rounded-2xl shadow-lg transition-all touch-manipulation min-h-[56px] sm:min-h-[64px] instant-touch"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Verify MC</span>
          </button>
          <button
            onClick={() => navigate('/demo')}
            className="flex items-center justify-center gap-2 sm:gap-3 px-4 sm:px-6 py-4 sm:py-5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 active:scale-[0.98] text-white font-bold text-sm sm:text-base rounded-xl sm:rounded-2xl shadow-lg transition-all touch-manipulation min-h-[56px] sm:min-h-[64px] instant-touch"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Issue MC</span>
          </button>
        </div>

        {/* Main Grid - Responsive */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-4 sm:mb-8">
          {/* Health Heatmap */}
          <div className={`lg:col-span-2 ${theme.cardBg} rounded-2xl border ${theme.border} overflow-hidden`}>
            <div className="p-3 sm:p-5 border-b border-slate-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-bold">Public Health Heatmap</h3>
                    <p className="text-slate-400 text-sm">Anonymized medical certificate distribution by district</p>
                  </div>
                </div>

                {/* Category Filter */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  fill="rgba(30, 58, 95, 0.3)"
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
                      fill="#94a3b8"
                      className="pointer-events-none"
                    >
                      {district.name}
                    </text>
                  </g>
                ))}
              </svg>

              {/* Hovered District Info */}
              {hoveredDistrict && (
                <div className="absolute top-4 right-4 bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-xl">
                  <p className="text-white font-bold">{hoveredDistrict.name}</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="text-slate-400">Population: <span className="text-white">{hoveredDistrict.population.toLocaleString()}</span></p>
                    <p className="text-slate-400">MCs Issued: <span className="text-white">{hoveredDistrict.cases.toLocaleString()}</span></p>
                    <p className="text-slate-400">Density: <span className={`font-bold ${
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
                  <span className="text-slate-400">Low</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                  <span className="text-slate-400">Medium</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500"></span>
                  <span className="text-slate-400">High</span>
                </div>
              </div>
            </div>
          </div>

          {/* Health Categories Breakdown */}
          <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 p-5">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-bold">Health Categories</h3>
                <p className="text-slate-400 text-sm">MC distribution by type</p>
              </div>
            </div>

            <div className="space-y-3">
              {HEALTH_CATEGORIES.map((cat, idx) => {
                const percentage = Math.floor(Math.random() * 30) + 5;
                return (
                  <div key={cat.id} className="group">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{cat.icon}</span>
                        <span className="text-slate-300 text-sm">{cat.name}</span>
                      </div>
                      <span className="text-white font-bold text-sm">{percentage}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
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

            <div className="mt-5 pt-5 border-t border-slate-700/50">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Total MCs Today</span>
                <span className="text-white font-bold">{getTotalCases().toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ESG / Green Stats Section - Mobile Optimized */}
        <div className="mb-4 sm:mb-8">
          <div className="flex items-center gap-3 mb-4 sm:mb-5">
            <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
              <span className="text-2xl">🌱</span>
            </div>
            <div>
              <h2 className={`text-lg sm:text-xl font-bold ${theme.text}`}>Environmental Impact (ESG)</h2>
              <p className={`${theme.textMuted} text-xs sm:text-sm`}>100% digital medical certificates</p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Paper Saved */}
            <div className="relative overflow-hidden bg-gradient-to-br from-green-900/50 to-emerald-900/30 rounded-2xl border border-green-500/30 p-5">
              <div className="absolute top-0 right-0 text-6xl opacity-10">📄</div>
              <div className="relative">
                <p className="text-green-300 text-xs font-semibold uppercase tracking-wider mb-2">Paper Saved</p>
                <p className="text-3xl font-black text-white">
                  {paperSavedKg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-green-400 text-sm mt-1">kilograms</p>
                <div className="mt-3 pt-3 border-t border-green-500/20">
                  <p className="text-slate-400 text-xs">
                    Equivalent to <span className="text-white font-bold">{Math.floor(paperSavedKg / 5).toLocaleString()}</span> reams
                  </p>
                </div>
              </div>
            </div>

            {/* CO2 Reduced */}
            <div className="relative overflow-hidden bg-gradient-to-br from-cyan-900/50 to-blue-900/30 rounded-2xl border border-cyan-500/30 p-5">
              <div className="absolute top-0 right-0 text-6xl opacity-10">💨</div>
              <div className="relative">
                <p className="text-cyan-300 text-xs font-semibold uppercase tracking-wider mb-2">CO2 Emissions Avoided</p>
                <p className="text-3xl font-black text-white">
                  {co2Saved.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-cyan-400 text-sm mt-1">kg CO2</p>
                <div className="mt-3 pt-3 border-t border-cyan-500/20">
                  <p className="text-slate-400 text-xs">
                    Like <span className="text-white font-bold">{Math.floor(co2Saved / 4.6).toLocaleString()}</span> car trips avoided
                  </p>
                </div>
              </div>
            </div>

            {/* Trees Saved */}
            <div className="relative overflow-hidden bg-gradient-to-br from-emerald-900/50 to-green-900/30 rounded-2xl border border-emerald-500/30 p-5">
              <div className="absolute top-0 right-0 text-6xl opacity-10">🌳</div>
              <div className="relative">
                <p className="text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-2">Trees Preserved</p>
                <p className="text-3xl font-black text-white">
                  {treesSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-emerald-400 text-sm mt-1">trees</p>
                <div className="mt-3 pt-3 border-t border-emerald-500/20">
                  <p className="text-slate-400 text-xs">
                    <span className="text-white font-bold">{((treesSaved * 21) / 1000).toFixed(1)}</span> tons of oxygen/year
                  </p>
                </div>
              </div>
            </div>

            {/* Water Saved */}
            <div className="relative overflow-hidden bg-gradient-to-br from-blue-900/50 to-indigo-900/30 rounded-2xl border border-blue-500/30 p-5">
              <div className="absolute top-0 right-0 text-6xl opacity-10">💧</div>
              <div className="relative">
                <p className="text-blue-300 text-xs font-semibold uppercase tracking-wider mb-2">Water Conserved</p>
                <p className="text-3xl font-black text-white">
                  {(waterSaved / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-blue-400 text-sm mt-1">cubic meters</p>
                <div className="mt-3 pt-3 border-t border-blue-500/20">
                  <p className="text-slate-400 text-xs">
                    <span className="text-white font-bold">{Math.floor(waterSaved / 150).toLocaleString()}</span> households daily use
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats Footer - Mobile Scrollable */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-4">
          <div className={`${theme.cardBg} rounded-xl border ${theme.border} p-3 sm:p-4 text-center`}>
            <p className={`${theme.textMuted} text-[10px] sm:text-xs mb-1`}>Hospitals</p>
            <p className={`text-lg sm:text-2xl font-black ${theme.text}`}>27</p>
          </div>
          <div className={`${theme.cardBg} rounded-xl border ${theme.border} p-3 sm:p-4 text-center`}>
            <p className={`${theme.textMuted} text-[10px] sm:text-xs mb-1`}>Clinics</p>
            <p className={`text-lg sm:text-2xl font-black ${theme.text}`}>142</p>
          </div>
          <div className={`${theme.cardBg} rounded-xl border ${theme.border} p-3 sm:p-4 text-center`}>
            <p className={`${theme.textMuted} text-[10px] sm:text-xs mb-1`}>Doctors</p>
            <p className={`text-lg sm:text-2xl font-black ${theme.text}`}>1,247</p>
          </div>
          <div className={`${theme.cardBg} rounded-xl border ${theme.border} p-3 sm:p-4 text-center hidden sm:block`}>
            <p className={`${theme.textMuted} text-[10px] sm:text-xs mb-1`}>Patients</p>
            <p className={`text-lg sm:text-2xl font-black ${theme.text}`}>89,432</p>
          </div>
          <div className={`${theme.cardBg} rounded-xl border ${theme.border} p-3 sm:p-4 text-center hidden sm:block`}>
            <p className={`${theme.textMuted} text-[10px] sm:text-xs mb-1`}>Uptime</p>
            <p className={`text-lg sm:text-2xl font-black ${theme.accent}`}>99.99%</p>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <p className="text-slate-500 text-sm">
                Data refreshes every 10 seconds | All health data is anonymized and aggregated
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/pitch" className="text-slate-400 hover:text-white text-sm transition-colors">
                Learn More
              </Link>
              <Link to="/" className="text-slate-400 hover:text-white text-sm transition-colors">
                Back to Home
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
