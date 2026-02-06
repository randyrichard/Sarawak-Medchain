/**
 * Doctor Portal Demo - CEO Preview Mode
 * A read-only demo version for hospital CEOs to preview the system
 * No wallet required, uses mock data
 */

import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePWA, PWA_CONFIGS } from '../hooks/usePWA';

// Terminal Theme Colors
const terminalTheme = {
  bg: '#FFFFFF',
  bgCard: '#FFFFFF',
  bgCardHover: '#F8FAFC',
  border: '#E2E8F0',
  textPrimary: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  accent: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  medical: '#06b6d4',
};

const MEDCHAIN_BLUE = '#0066CC';

export default function DoctorPortalDemo() {
  const location = useLocation();

  // Demo states
  const [showSimulation, setShowSimulation] = useState(false);
  const [simulationStep, setSimulationStep] = useState(0);
  const [hasSignature, setHasSignature] = useState(false);

  // Check if we're on the PWA route
  const isPWARoute = location.pathname === '/pwa/issue';

  // PWA: Only set manifest when on /pwa/issue route
  usePWA(isPWARoute ? PWA_CONFIGS.issue : null);

  // MC Form state with pre-filled demo data
  const [mcFormData, setMcFormData] = useState({
    patientIC: '901201-13-5678',
    patientName: 'Ahmad bin Hassan',
    diagnosis: 'Upper Respiratory Tract Infection',
    duration: '2',
    remarks: 'Rest and hydration recommended. Follow-up if symptoms persist.',
  });

  // Demo live feed
  const liveFeed = [
    { id: 1, time: '2 min ago', patientName: 'Sarah Lee', diagnosis: 'Acute Gastritis', duration: 1, txHash: '0x9b2e...4f1a', status: 'confirmed' },
    { id: 2, time: '15 min ago', patientName: 'Mohd Rizal', diagnosis: 'Viral Fever', duration: 3, txHash: '0x2c8d...7e3b', status: 'confirmed' },
    { id: 3, time: '32 min ago', patientName: 'Tan Wei Ming', diagnosis: 'Migraine', duration: 1, txHash: '0x5f4a...9d2c', status: 'confirmed' },
    { id: 4, time: '1 hour ago', patientName: 'Nurul Aisyah', diagnosis: 'Food Poisoning', duration: 2, txHash: '0x8e1f...3a7d', status: 'confirmed' },
  ];

  // Simulation steps
  const simulationSteps = [
    { title: 'Validating Patient Data', icon: '🔍', duration: 800 },
    { title: 'Generating Digital Signature', icon: '✍️', duration: 1000 },
    { title: 'Encrypting Medical Record', icon: '🔐', duration: 1200 },
    { title: 'Broadcasting to Blockchain', icon: '📡', duration: 1500 },
    { title: 'Transaction Confirmed!', icon: '✅', duration: 500 },
  ];

  const handleDemoSubmit = async () => {
    if (!mcFormData.patientIC || !mcFormData.patientName || !mcFormData.diagnosis) {
      return;
    }

    setShowSimulation(true);
    setSimulationStep(0);

    // Run through simulation steps
    for (let i = 0; i < simulationSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, simulationSteps[i].duration));
      setSimulationStep(i + 1);
    }
  };

  const closeSimulation = () => {
    setShowSimulation(false);
    setSimulationStep(0);
  };

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: terminalTheme.bg }}>
      {/* Demo Mode Watermark Overlay */}
      <div className="fixed inset-0 pointer-events-none z-40 flex items-center justify-center overflow-hidden">
        <div
          className="absolute transform -rotate-45 text-6xl font-black tracking-widest whitespace-nowrap opacity-[0.03] select-none"
          style={{ color: terminalTheme.textPrimary }}
        >
          DEMO MODE &nbsp;&nbsp; DEMO MODE &nbsp;&nbsp; DEMO MODE &nbsp;&nbsp; DEMO MODE
        </div>
      </div>

      {/* Top Demo Banner */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-amber-600 to-orange-600 text-white px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 bg-white/20 rounded text-xs font-bold">DEMO MODE</span>
            <span className="text-sm">To activate live blockchain nodes for your hospital, contact MedChain</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/pitch"
              className="text-sm text-white/80 hover:text-white transition-colors"
            >
              ← Back to Pitch
            </Link>
            <a
              href="#pricing"
              onClick={(e) => { e.preventDefault(); window.location.href = '/#/pitch#pricing'; }}
              className="px-4 py-2 bg-white text-amber-600 rounded-lg font-bold text-sm hover:bg-amber-50 transition-colors"
            >
              Get Started
            </a>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex h-[calc(100vh-52px)]">
        {/* Demo Sidebar */}
        <aside className="w-72 border-r flex flex-col" style={{ borderColor: terminalTheme.border, backgroundColor: terminalTheme.bgCard }}>
          {/* Logo */}
          <div className="p-6 border-b" style={{ borderColor: terminalTheme.border }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: MEDCHAIN_BLUE }}>
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold" style={{ color: terminalTheme.textPrimary }}>Sarawak</h1>
                <p className="text-xs text-amber-400 font-semibold">MedChain</p>
              </div>
            </div>
          </div>

          {/* Demo Doctor Info */}
          <div className="p-6 border-b" style={{ borderColor: terminalTheme.border }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <span className="text-white font-bold text-lg">DR</span>
              </div>
              <div>
                <p className="font-semibold" style={{ color: terminalTheme.textPrimary }}>Dr. Ahmad Razak</p>
                <p className="text-xs" style={{ color: terminalTheme.textMuted }}>General Practitioner</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: `${terminalTheme.success}20` }}>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: terminalTheme.success }}></div>
              <span className="text-xs font-medium" style={{ color: terminalTheme.success }}>SMC Verified</span>
            </div>
          </div>

          {/* Demo Hospital */}
          <div className="p-6 border-b" style={{ borderColor: terminalTheme.border }}>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: terminalTheme.textMuted }}>Hospital</p>
            <p className="font-semibold" style={{ color: terminalTheme.textPrimary }}>KPJ Kuching Specialist</p>
            <p className="text-xs mt-1" style={{ color: terminalTheme.textMuted }}>Enterprise Tier</p>
          </div>

          {/* Demo Credit Balance */}
          <div className="p-6 mt-auto">
            <div className="rounded-xl p-4 bg-gradient-to-r from-emerald-600 to-emerald-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200 mb-1">Credit Balance</p>
              <p className="text-3xl font-black text-white">RM 8,450</p>
              <p className="text-xs text-emerald-200/70 mt-1">Demo balance</p>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex overflow-hidden">
          {/* MC Issue Terminal */}
          <div className="flex-1 p-8 overflow-y-auto">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${terminalTheme.medical}20` }}>
                  <svg className="w-6 h-6" style={{ color: terminalTheme.medical }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold" style={{ color: terminalTheme.textPrimary }}>Medical Certificate Terminal</h1>
                  <p style={{ color: terminalTheme.textMuted }}>Issue blockchain-verified medical certificates</p>
                </div>
              </div>
            </div>

            {/* MC Form */}
            <div className="rounded-2xl p-6 mb-6" style={{ backgroundColor: terminalTheme.bgCard, border: `1px solid ${terminalTheme.border}`, boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)' }}>
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2" style={{ color: terminalTheme.textPrimary }}>
                <svg className="w-5 h-5" style={{ color: terminalTheme.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Patient Information
              </h3>

              <div className="grid grid-cols-2 gap-6">
                {/* Patient IC */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: terminalTheme.textSecondary }}>
                    Patient IC Number *
                  </label>
                  <input
                    type="text"
                    value={mcFormData.patientIC}
                    onChange={(e) => setMcFormData({ ...mcFormData, patientIC: e.target.value })}
                    placeholder="e.g., 901201-13-5678"
                    className="w-full px-4 py-3 rounded-lg text-slate-800 focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: '#F8FAFC',
                      border: `1px solid ${terminalTheme.border}`,
                      focusRing: terminalTheme.accent
                    }}
                  />
                </div>

                {/* Patient Name */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: terminalTheme.textSecondary }}>
                    Patient Full Name *
                  </label>
                  <input
                    type="text"
                    value={mcFormData.patientName}
                    onChange={(e) => setMcFormData({ ...mcFormData, patientName: e.target.value })}
                    placeholder="Full name as per IC"
                    className="w-full px-4 py-3 rounded-lg text-slate-800 focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: '#F8FAFC',
                      border: `1px solid ${terminalTheme.border}`
                    }}
                  />
                </div>

                {/* Diagnosis */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-2" style={{ color: terminalTheme.textSecondary }}>
                    Diagnosis *
                  </label>
                  <input
                    type="text"
                    value={mcFormData.diagnosis}
                    onChange={(e) => setMcFormData({ ...mcFormData, diagnosis: e.target.value })}
                    placeholder="Medical diagnosis"
                    className="w-full px-4 py-3 rounded-lg text-slate-800 focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: '#F8FAFC',
                      border: `1px solid ${terminalTheme.border}`
                    }}
                  />
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: terminalTheme.textSecondary }}>
                    MC Duration (Days)
                  </label>
                  <select
                    value={mcFormData.duration}
                    onChange={(e) => setMcFormData({ ...mcFormData, duration: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg text-slate-800 focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: '#F8FAFC',
                      border: `1px solid ${terminalTheme.border}`
                    }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map(d => (
                      <option key={d} value={d}>{d} {d === 1 ? 'Day' : 'Days'}</option>
                    ))}
                  </select>
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: terminalTheme.textSecondary }}>
                    Remarks (Optional)
                  </label>
                  <input
                    type="text"
                    value={mcFormData.remarks}
                    onChange={(e) => setMcFormData({ ...mcFormData, remarks: e.target.value })}
                    placeholder="Additional notes"
                    className="w-full px-4 py-3 rounded-lg text-slate-800 focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: '#F8FAFC',
                      border: `1px solid ${terminalTheme.border}`
                    }}
                  />
                </div>
              </div>

              {/* Digital Signature Area */}
              <div className="mt-6">
                <label className="block text-sm font-medium mb-2" style={{ color: terminalTheme.textSecondary }}>
                  Doctor's Digital Signature
                </label>
                <div
                  className="h-32 rounded-lg flex items-center justify-center cursor-pointer transition-colors relative overflow-hidden"
                  style={{
                    backgroundColor: '#F8FAFC',
                    border: `2px dashed ${hasSignature ? terminalTheme.success : terminalTheme.border}`
                  }}
                  onClick={() => setHasSignature(true)}
                >
                  {hasSignature ? (
                    <div className="text-center">
                      <svg className="w-8 h-8 mx-auto mb-2" style={{ color: terminalTheme.success }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-sm" style={{ color: terminalTheme.success }}>Signature Captured</p>
                      <p className="text-xs mt-1" style={{ color: terminalTheme.textMuted }}>Dr. Ahmad Razak, MD</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <svg className="w-8 h-8 mx-auto mb-2" style={{ color: terminalTheme.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      <p className="text-sm" style={{ color: terminalTheme.textMuted }}>Click to Sign</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Secure on Blockchain Button */}
              <button
                onClick={handleDemoSubmit}
                disabled={!mcFormData.patientIC || !mcFormData.patientName || !mcFormData.diagnosis}
                className="w-full mt-6 py-4 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${terminalTheme.accent}, ${terminalTheme.medical})`,
                  boxShadow: `0 8px 24px ${terminalTheme.accent}40`
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Secure on Blockchain
              </button>
            </div>
          </div>

          {/* Live Feed Sidebar */}
          <div className="w-80 border-l p-6 overflow-y-auto" style={{ borderColor: terminalTheme.border, backgroundColor: terminalTheme.bgCard }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${terminalTheme.success}20` }}>
                <svg className="w-5 h-5" style={{ color: terminalTheme.success }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold" style={{ color: terminalTheme.textPrimary }}>Live Feed</h2>
                <p className="text-xs" style={{ color: terminalTheme.textMuted }}>Recently Issued Certificates</p>
              </div>
            </div>

            {/* Live Feed Items */}
            <div className="space-y-3">
              {liveFeed.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl transition-all"
                  style={{ backgroundColor: '#F8FAFC', border: `1px solid ${terminalTheme.border}` }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm" style={{ color: terminalTheme.textPrimary }}>{item.patientName}</p>
                      <p className="text-xs" style={{ color: terminalTheme.textMuted }}>{item.diagnosis}</p>
                    </div>
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${terminalTheme.success}20`,
                        color: terminalTheme.success
                      }}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs" style={{ color: terminalTheme.textMuted }}>
                    <span>{item.duration} {item.duration === 1 ? 'day' : 'days'}</span>
                    <span className="font-mono">{item.txHash}</span>
                  </div>
                  <p className="text-xs mt-2" style={{ color: terminalTheme.textMuted }}>{item.time}</p>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Simulation Modal */}
      {showSimulation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div
            className="w-full max-w-lg rounded-3xl p-8 relative overflow-hidden"
            style={{ backgroundColor: terminalTheme.bgCard, border: `1px solid ${terminalTheme.border}`, boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)' }}
          >
            {/* Animated Background */}
            <div className="absolute inset-0 opacity-20">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-500 animate-pulse"></div>
            </div>

            <div className="relative">
              {/* Header */}
              <div className="text-center mb-8">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: `${terminalTheme.accent}20` }}>
                  {simulationStep < simulationSteps.length ? (
                    <svg className="animate-spin h-10 w-10" style={{ color: terminalTheme.accent }} viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-12 h-12" style={{ color: terminalTheme.success }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <h2 className="text-2xl font-bold mb-2" style={{ color: terminalTheme.textPrimary }}>
                  {simulationStep < simulationSteps.length
                    ? 'Blockchain Transaction in Progress'
                    : 'Transaction Simulated!'
                  }
                </h2>
                <p style={{ color: terminalTheme.textMuted }}>
                  {simulationStep < simulationSteps.length
                    ? 'Securing medical certificate on blockchain...'
                    : 'Demo transaction completed successfully'
                  }
                </p>
              </div>

              {/* Progress Steps */}
              <div className="space-y-3 mb-8">
                {simulationSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-4 p-4 rounded-xl transition-all"
                    style={{
                      backgroundColor: idx < simulationStep ? `${terminalTheme.success}10` : terminalTheme.bg,
                      border: `1px solid ${idx < simulationStep ? terminalTheme.success : terminalTheme.border}`,
                      opacity: idx <= simulationStep ? 1 : 0.4
                    }}
                  >
                    <div className="text-2xl">{step.icon}</div>
                    <div className="flex-1">
                      <p className="font-medium" style={{ color: idx < simulationStep ? terminalTheme.success : terminalTheme.textPrimary }}>
                        {step.title}
                      </p>
                    </div>
                    {idx < simulationStep && (
                      <svg className="w-5 h-5" style={{ color: terminalTheme.success }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {idx === simulationStep && simulationStep < simulationSteps.length && (
                      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: terminalTheme.accent }}></div>
                    )}
                  </div>
                ))}
              </div>

              {/* Upgrade CTA - Show after simulation complete */}
              {simulationStep >= simulationSteps.length && (
                <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl p-6 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold mb-1" style={{ color: terminalTheme.textPrimary }}>Blockchain Transaction Simulated</h3>
                      <p className="text-sm text-slate-600 mb-3">
                        Upgrade to a <span className="text-amber-400 font-semibold">KPJ Enterprise Node</span> to issue real,
                        tamper-proof medical certificates on the blockchain.
                      </p>
                      <div className="flex items-center gap-2">
                        <Link
                          to="/agreement"
                          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-lg text-sm hover:from-amber-400 hover:to-orange-400 transition-all"
                        >
                          Sign Agreement Now
                        </Link>
                        <Link
                          to="/pitch#pricing"
                          className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm hover:bg-slate-300 transition-colors"
                        >
                          View Pricing
                        </Link>
                        <button
                          onClick={closeSimulation}
                          className="px-4 py-2 bg-slate-100 text-slate-500 rounded-lg text-sm hover:bg-slate-200 transition-colors"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Close button during animation */}
              {simulationStep < simulationSteps.length && (
                <button
                  onClick={closeSimulation}
                  className="w-full py-3 rounded-xl font-medium transition-all"
                  style={{ backgroundColor: terminalTheme.bg, color: terminalTheme.textMuted, border: `1px solid ${terminalTheme.border}` }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
