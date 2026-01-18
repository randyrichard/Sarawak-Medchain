import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// Sarawak MedChain Brand Colors
const MEDCHAIN_BLUE = '#0066CC';
const MEDCHAIN_DARK = '#003366';

export default function HospitalPitch() {
  const navigate = useNavigate();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [formData, setFormData] = useState({
    hospitalName: '',
    contactPerson: '',
    email: '',
    phone: '',
    position: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // ROI Calculator state
  const [roiInputs, setRoiInputs] = useState({
    numberOfDoctors: 10,
    monthlyMCs: 500,
  });

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Store in localStorage for demo
    const requests = JSON.parse(localStorage.getItem('medchain_access_requests') || '[]');
    requests.push({
      ...formData,
      id: Date.now(),
      submittedAt: new Date().toISOString(),
      status: 'pending',
    });
    localStorage.setItem('medchain_access_requests', JSON.stringify(requests));

    setIsSubmitting(false);
    setSubmitted(true);
  };

  // Network stats (would come from blockchain in production)
  const networkStats = {
    hospitals: 3,
    clinics: 180,
    mcsIssued: 12847,
    doctorsVerified: 156,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background Grid Effect */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `linear-gradient(${MEDCHAIN_BLUE}20 1px, transparent 1px), linear-gradient(90deg, ${MEDCHAIN_BLUE}20 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
          }} />
        </div>

        {/* Gradient Orbs */}
        <div className="absolute top-20 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl" style={{ backgroundColor: MEDCHAIN_BLUE }} />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full opacity-15 blur-3xl" style={{ backgroundColor: '#06b6d4' }} />

        <div className="relative max-w-7xl mx-auto px-6 py-24">
          {/* Badge */}
          <div className="flex justify-center mb-8">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold" style={{
              backgroundColor: `${MEDCHAIN_BLUE}20`,
              color: MEDCHAIN_BLUE,
              border: `1px solid ${MEDCHAIN_BLUE}40`,
            }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#10b981' }} />
              Now Live Across Sarawak
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="text-5xl md:text-7xl font-black text-center text-white mb-6 leading-tight">
            Securing Sarawak's
            <br />
            <span style={{ color: MEDCHAIN_BLUE }}>Medical Future</span>
          </h1>

          <p className="text-xl md:text-2xl text-center text-slate-400 max-w-3xl mx-auto mb-8">
            The New Standard for Digital Medical Certificates.
            <br />
            <span className="text-white font-semibold">Blockchain-verified. Tamper-proof. Instant.</span>
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={() => setShowRequestModal(true)}
              className="px-8 py-4 rounded-xl font-bold text-white text-lg transition-all transform hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${MEDCHAIN_BLUE}, ${MEDCHAIN_DARK})`,
                boxShadow: `0 10px 40px ${MEDCHAIN_BLUE}40`,
              }}
            >
              Request Hospital Access
            </button>
            <a
              href="#pricing"
              className="px-8 py-4 rounded-xl font-bold text-slate-300 text-lg border border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 transition-all"
            >
              View Pricing
            </a>
          </div>

          {/* Trust Badges */}
          <div className="flex flex-wrap items-center justify-center gap-8 text-slate-500 text-sm">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Blockchain Secured</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>AES-256 Encrypted</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              <span>PDPA Compliant</span>
            </div>
          </div>
        </div>
      </section>

      {/* Fraud Alert Section - The Problem */}
      <section className="py-20 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Fraud Alert Graphic */}
            <div className="relative">
              <div className="bg-gradient-to-br from-red-950/50 to-slate-900 rounded-3xl p-8 border border-red-500/30 relative overflow-hidden">
                {/* Warning Pulse */}
                <div className="absolute top-4 right-4">
                  <span className="flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
                  </span>
                </div>

                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-red-400">FRAUD ALERT</h3>
                    <p className="text-sm text-red-300/70">Critical Security Issue</p>
                  </div>
                </div>

                {/* Fake MC Example */}
                <div className="bg-white/5 rounded-xl p-6 mb-6 border border-red-500/20">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-20 bg-slate-700 rounded flex items-center justify-center text-slate-500 text-xs">
                      [Fake MC]
                    </div>
                    <div className="flex-1">
                      <p className="text-slate-400 text-sm mb-2">Paper MCs can be:</p>
                      <ul className="space-y-1 text-sm">
                        <li className="flex items-center gap-2 text-red-400">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          Photocopied & duplicated
                        </li>
                        <li className="flex items-center gap-2 text-red-400">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          Dates easily altered
                        </li>
                        <li className="flex items-center gap-2 text-red-400">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          Signatures forged
                        </li>
                        <li className="flex items-center gap-2 text-red-400">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          No verification possible
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Cost Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-red-500/10 rounded-xl p-4 text-center">
                    <p className="text-3xl font-black text-red-400">RM 2.3B</p>
                    <p className="text-xs text-red-300/70">Annual fraud cost to Malaysian employers</p>
                  </div>
                  <div className="bg-red-500/10 rounded-xl p-4 text-center">
                    <p className="text-3xl font-black text-red-400">34%</p>
                    <p className="text-xs text-red-300/70">Of HR managers suspect MC fraud</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Problem Text */}
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold text-red-400 bg-red-500/20 mb-4">
                THE PROBLEM
              </span>
              <h2 className="text-4xl font-black text-white mb-6">
                Paper MCs Are <span className="text-red-400">Broken</span>
              </h2>
              <p className="text-lg text-slate-400 mb-6">
                Every year, Malaysian businesses lose billions to fraudulent medical certificates.
                Paper-based systems offer zero protection against forgery, duplication, or tampering.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-red-400 font-bold">1</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-white mb-1">Zero Verification</h4>
                    <p className="text-slate-400 text-sm">Employers have no way to verify if an MC is genuine without calling the clinic directly.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-red-400 font-bold">2</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-white mb-1">Easy Manipulation</h4>
                    <p className="text-slate-400 text-sm">Dates, names, and diagnoses can be altered with basic photo editing software.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-red-400 font-bold">3</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-white mb-1">No Audit Trail</h4>
                    <p className="text-slate-400 text-sm">Once issued, there's no record of how many copies exist or if it's been tampered with.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-20 px-6 relative overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-10 blur-3xl" style={{ backgroundColor: MEDCHAIN_BLUE }} />

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-16">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-4" style={{ color: MEDCHAIN_BLUE, backgroundColor: `${MEDCHAIN_BLUE}20` }}>
              THE SOLUTION
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
              Blockchain-Verified <span style={{ color: MEDCHAIN_BLUE }}>Medical Certificates</span>
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Every MC is cryptographically signed, timestamped on the blockchain, and instantly verifiable with a simple QR scan.
            </p>
          </div>

          {/* Solution Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {/* Doctor Terminal */}
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl p-6 border border-slate-700/50 hover:border-blue-500/30 transition-all group">
              <div className="w-14 h-14 rounded-2xl mb-6 flex items-center justify-center" style={{ backgroundColor: `${MEDCHAIN_BLUE}20` }}>
                <svg className="w-7 h-7" style={{ color: MEDCHAIN_BLUE }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Doctor's Terminal</h3>
              <p className="text-slate-400 mb-4">
                A sleek, medical-grade interface for doctors to issue MCs in seconds. Digital signatures ensure authenticity.
              </p>
              {/* Mini Preview */}
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-slate-700 rounded w-3/4" />
                  <div className="h-3 bg-slate-700 rounded w-1/2" />
                  <div className="h-8 rounded mt-3" style={{ backgroundColor: `${MEDCHAIN_BLUE}30` }} />
                </div>
              </div>
            </div>

            {/* QR Verification */}
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl p-6 border border-slate-700/50 hover:border-emerald-500/30 transition-all group">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 mb-6 flex items-center justify-center">
                <svg className="w-7 h-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">QR Verification</h3>
              <p className="text-slate-400 mb-4">
                Employers scan a QR code to instantly verify any MC against the blockchain. Forgery becomes impossible.
              </p>
              {/* QR Preview */}
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-700 flex items-center justify-center">
                <div className="w-24 h-24 bg-white rounded-lg p-2 relative">
                  <div className="grid grid-cols-5 gap-0.5 w-full h-full">
                    {[1,0,1,1,0, 0,1,0,1,1, 1,1,0,0,1, 0,1,1,0,0, 1,0,1,0,1].map((filled, i) => (
                      <div key={i} className={filled ? 'bg-slate-900' : 'bg-white'} />
                    ))}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-6 h-6 rounded" style={{ backgroundColor: MEDCHAIN_BLUE }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Immutable Records */}
            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl p-6 border border-slate-700/50 hover:border-cyan-500/30 transition-all group">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 mb-6 flex items-center justify-center">
                <svg className="w-7 h-7 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Immutable Records</h3>
              <p className="text-slate-400 mb-4">
                Every MC is permanently recorded on the blockchain. Once issued, it cannot be altered, deleted, or duplicated.
              </p>
              {/* Chain Preview */}
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center justify-between">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center">
                      <div className="w-10 h-10 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                        <span className="text-xs font-mono text-cyan-400">#{i}</span>
                      </div>
                      {i < 3 && (
                        <div className="w-8 h-0.5 bg-gradient-to-r from-cyan-500/50 to-cyan-500/20" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-gradient-to-r from-slate-800/30 to-slate-900/30 rounded-3xl p-8 border border-slate-700/50">
            <h3 className="text-2xl font-bold text-white text-center mb-8">How It Works</h3>
            <div className="grid md:grid-cols-4 gap-6">
              {[
                { step: '01', title: 'Doctor Issues MC', desc: 'Through the secure terminal', icon: '🏥' },
                { step: '02', title: 'Blockchain Records', desc: 'Cryptographically signed', icon: '⛓️' },
                { step: '03', title: 'Patient Receives', desc: 'Digital MC with QR code', icon: '📱' },
                { step: '04', title: 'Employer Verifies', desc: 'Instant QR scan verification', icon: '✅' },
              ].map((item, idx) => (
                <div key={idx} className="text-center">
                  <div className="text-4xl mb-4">{item.icon}</div>
                  <div className="text-xs font-bold mb-2" style={{ color: MEDCHAIN_BLUE }}>STEP {item.step}</div>
                  <h4 className="font-bold text-white mb-1">{item.title}</h4>
                  <p className="text-sm text-slate-400">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Live Network Stats */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold text-emerald-400 bg-emerald-500/20 mb-4">
              LIVE PROOF
            </span>
            <h2 className="text-4xl font-black text-white mb-4">
              Already Trusted Across <span className="text-emerald-400">Sarawak</span>
            </h2>
            <p className="text-slate-400">Real-time network statistics from the blockchain</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {/* Hospitals */}
            <div className="bg-gradient-to-br from-blue-950/50 to-slate-900 rounded-2xl p-6 border border-blue-500/30 text-center relative overflow-hidden group hover:border-blue-400/50 transition-all">
              <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: MEDCHAIN_BLUE }} />
              <div className="text-6xl font-black mb-2" style={{ color: MEDCHAIN_BLUE }}>
                {networkStats.hospitals}
              </div>
              <p className="text-slate-400 font-medium">Major Hospitals</p>
              <p className="text-xs text-slate-500 mt-2">Premium Enterprise Tier</p>
            </div>

            {/* Clinics */}
            <div className="bg-gradient-to-br from-cyan-950/50 to-slate-900 rounded-2xl p-6 border border-cyan-500/30 text-center relative overflow-hidden group hover:border-cyan-400/50 transition-all">
              <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500" />
              <div className="text-6xl font-black text-cyan-400 mb-2">
                {networkStats.clinics}
              </div>
              <p className="text-slate-400 font-medium">Private Clinics</p>
              <p className="text-xs text-slate-500 mt-2">Standard Tier</p>
            </div>

            {/* MCs Issued */}
            <div className="bg-gradient-to-br from-emerald-950/50 to-slate-900 rounded-2xl p-6 border border-emerald-500/30 text-center relative overflow-hidden group hover:border-emerald-400/50 transition-all">
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
              <div className="text-6xl font-black text-emerald-400 mb-2">
                {networkStats.mcsIssued.toLocaleString()}
              </div>
              <p className="text-slate-400 font-medium">MCs Issued</p>
              <p className="text-xs text-slate-500 mt-2">And counting...</p>
            </div>

            {/* Verified Doctors */}
            <div className="bg-gradient-to-br from-amber-950/50 to-slate-900 rounded-2xl p-6 border border-amber-500/30 text-center relative overflow-hidden group hover:border-amber-400/50 transition-all">
              <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
              <div className="text-6xl font-black text-amber-400 mb-2">
                {networkStats.doctorsVerified}
              </div>
              <p className="text-slate-400 font-medium">Verified Doctors</p>
              <p className="text-xs text-slate-500 mt-2">SMC Registered</p>
            </div>
          </div>

          {/* Live Indicator */}
          <div className="flex items-center justify-center gap-2 mt-8">
            <span className="flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-emerald-400 text-sm font-medium">Live on Blockchain</span>
          </div>
        </div>
      </section>

      {/* Demo Video Section - Security Showcase */}
      <section className="py-20 px-6 bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold text-purple-400 bg-purple-500/20 mb-4">
              SEE IT IN ACTION
            </span>
            <h2 className="text-4xl font-black text-white mb-4">
              Blockchain-Grade <span className="text-purple-400">Security</span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Watch how MetaMask wallet authentication ensures only verified doctors can access the system.
              No passwords to steal. No credentials to breach.
            </p>
          </div>

          {/* Video Demo Card */}
          <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-3xl border border-slate-700/50 overflow-hidden">
            {/* Video Player Area */}
            <div className="aspect-video bg-slate-950 relative group cursor-pointer">
              {/* Placeholder for demo video */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {/* Animated wallet connection demo */}
                <div className="relative mb-8">
                  {/* MetaMask Fox Icon */}
                  <div className="w-24 h-24 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-orange-500/30 group-hover:scale-110 transition-transform">
                    <svg className="w-14 h-14 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21.6 2.4L13.2 8.4l1.6-3.6 6.8-2.4zM2.4 2.4l8.4 6 1.6-3.6-10-2.4zm16.4 13.2l-2.4 3.6 5.2 1.4-.6-5h-2.2zm-14.4 0l-.6 5 5.2-1.4-2.4-3.6H4.4zm9-4.8l-1.4 2.2 5.6.6-.6-2.8h-3.6zm-4.8 0l-.6 2.8 5.6-.6-1.4-2.2H8.6z" />
                    </svg>
                  </div>
                  {/* Connection Line Animation */}
                  <div className="absolute -right-20 top-1/2 -translate-y-1/2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-0.5 bg-gradient-to-r from-orange-500 to-blue-500 animate-pulse"></div>
                      <div className="w-3 h-3 rounded-full bg-blue-500 animate-ping"></div>
                    </div>
                  </div>
                  {/* Shield Icon */}
                  <div className="absolute -right-32 top-1/2 -translate-y-1/2 w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                </div>

                {/* Interactive Preview Button */}
                <Link
                  to="/demo"
                  className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full text-white font-bold shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-105 transition-all"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Interactive Preview (No Wallet Needed)
                </Link>
                <p className="text-slate-500 text-sm mt-4">Try the Doctor Portal with simulated blockchain</p>
              </div>

              {/* Corner Badges */}
              <div className="absolute top-4 left-4 flex gap-2">
                <span className="px-2 py-1 rounded bg-red-500/80 text-white text-xs font-bold">LIVE</span>
                <span className="px-2 py-1 rounded bg-slate-700/80 text-slate-300 text-xs">HD</span>
              </div>
            </div>

            {/* Video Description */}
            <div className="p-6 bg-slate-800/30">
              <div className="flex items-start gap-6">
                {/* Security Points */}
                <div className="flex-1 grid md:grid-cols-3 gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">Zero Passwords</p>
                      <p className="text-slate-400 text-xs">Cryptographic keys only</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">SMC Verified</p>
                      <p className="text-slate-400 text-xs">Doctor identity confirmed</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">Unhackable</p>
                      <p className="text-slate-400 text-xs">No central database</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CEO Quote */}
          <div className="mt-12 text-center">
            <blockquote className="text-xl text-slate-300 italic max-w-2xl mx-auto">
              "The moment I saw the MetaMask login, I knew this wasn't just another software vendor.
              This is military-grade security for healthcare."
            </blockquote>
            <p className="text-slate-500 mt-4">- Hospital CEO during pilot demo</p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-4" style={{ color: MEDCHAIN_BLUE, backgroundColor: `${MEDCHAIN_BLUE}20` }}>
              TRANSPARENT PRICING
            </span>
            <h2 className="text-4xl font-black text-white mb-4">
              Simple, Predictable <span style={{ color: MEDCHAIN_BLUE }}>Pricing</span>
            </h2>
            <p className="text-slate-400">No hidden fees. No long-term contracts. Cancel anytime.</p>
          </div>

          {/* Pricing Card */}
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-3xl border border-slate-700/50 overflow-hidden max-w-2xl mx-auto">
            {/* Header */}
            <div className="p-8 text-center" style={{ background: `linear-gradient(135deg, ${MEDCHAIN_BLUE}20, ${MEDCHAIN_DARK}10)` }}>
              <h3 className="text-2xl font-bold text-white mb-2">Hospital Enterprise Plan</h3>
              <p className="text-slate-400">Everything you need to go digital</p>
            </div>

            {/* Price */}
            <div className="p-8 text-center border-b border-slate-700/50">
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-5xl font-black text-white">RM 10,000</span>
                <span className="text-slate-400">/month</span>
              </div>
              <p className="text-slate-500 mt-2">Base subscription</p>

              <div className="mt-6 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <div className="flex items-center justify-center gap-2 text-lg">
                  <span className="text-white font-bold">+</span>
                  <span className="text-2xl font-bold" style={{ color: MEDCHAIN_BLUE }}>RM 1.00</span>
                  <span className="text-slate-400">per MC issued</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">Pay only for what you use</p>
              </div>
            </div>

            {/* Features */}
            <div className="p-8">
              <h4 className="font-bold text-white mb-4">Everything included:</h4>
              <div className="grid md:grid-cols-2 gap-3">
                {[
                  'Unlimited doctors',
                  'Blockchain verification',
                  'QR code receipts',
                  'Real-time analytics',
                  'Priority support',
                  'Custom branding',
                  'API access',
                  'PDPA compliant',
                  'Audit trail',
                  'Data encryption',
                ].map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-slate-300 text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="p-8 pt-0">
              <button
                onClick={() => navigate('/agreement', { state: { plan: 'enterprise' } })}
                className="w-full py-4 rounded-xl font-bold text-white text-lg transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2"
                style={{
                  background: `linear-gradient(135deg, ${MEDCHAIN_BLUE}, ${MEDCHAIN_DARK})`,
                  boxShadow: `0 10px 40px ${MEDCHAIN_BLUE}30`,
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Get Started - Sign Agreement
              </button>
              <p className="text-center text-slate-500 text-sm mt-4">
                30-day money-back guarantee
              </p>
            </div>
          </div>

          {/* Clinic Tier Note */}
          <div className="mt-8 text-center">
            <p className="text-slate-400">
              Running a smaller clinic? Ask about our <span className="text-cyan-400 font-semibold">Clinic Tier at RM 2,000/month</span>
            </p>
          </div>

          {/* ROI Calculator */}
          <div className="mt-16">
            <div className="text-center mb-8">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold text-emerald-400 bg-emerald-500/20 mb-4">
                ROI CALCULATOR
              </span>
              <h3 className="text-3xl font-black text-white mb-2">
                Calculate Your <span className="text-emerald-400">Savings</span>
              </h3>
              <p className="text-slate-400">See how MedChain pays for itself</p>
            </div>

            <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 rounded-3xl border border-slate-700/50 p-8">
              {/* Input Fields */}
              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Number of Doctors
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={roiInputs.numberOfDoctors}
                    onChange={(e) => setRoiInputs({ ...roiInputs, numberOfDoctors: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-500 mt-2">Active doctors in your facility</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Monthly MCs Issued
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="10000"
                    value={roiInputs.monthlyMCs}
                    onChange={(e) => setRoiInputs({ ...roiInputs, monthlyMCs: Math.max(10, parseInt(e.target.value) || 10) })}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-500 mt-2">Average certificates per month</p>
                </div>
              </div>

              {/* Calculated Results */}
              {(() => {
                // ROI Calculation Logic
                const mcs = roiInputs.monthlyMCs;

                // Admin hours wasted: ~15 min per MC for manual verification/filing
                const adminHoursPerMC = 0.25; // 15 minutes
                const adminHourlyRate = 25; // RM25/hour for admin staff
                const adminHoursWasted = mcs * adminHoursPerMC;
                const adminCostWasted = adminHoursWasted * adminHourlyRate;

                // Fraud cost calculation based on RM 2.3B national stat
                // Estimated 8-12% of MCs are fraudulent nationally
                const fraudRate = 0.10; // 10% estimated fraud rate
                const avgFraudCostPerMC = 350; // Lost productivity + investigation cost
                const potentialFraudMCs = Math.round(mcs * fraudRate);
                const potentialFraudCost = potentialFraudMCs * avgFraudCostPerMC;

                // Current total loss
                const currentMonthlyLoss = adminCostWasted + potentialFraudCost;

                // MedChain cost
                const medchainBaseFee = 10000;
                const medchainMCFee = mcs * 1; // RM1 per MC
                const medchainTotalCost = medchainBaseFee + medchainMCFee;

                // Savings
                const monthlySavings = currentMonthlyLoss - medchainTotalCost;
                const savingsPositive = monthlySavings > 0;

                // Breakeven: How many fake MCs need to be prevented
                const breakEvenFakeMCs = Math.ceil(medchainTotalCost / avgFraudCostPerMC);

                return (
                  <>
                    {/* Hidden Costs Breakdown */}
                    <div className="grid md:grid-cols-2 gap-4 mb-8">
                      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-red-400 font-semibold text-sm">Admin Hours Wasted</span>
                        </div>
                        <p className="text-2xl font-bold text-white">{adminHoursWasted.toFixed(0)} hrs/month</p>
                        <p className="text-xs text-slate-400 mt-1">= RM {adminCostWasted.toLocaleString()} in staff costs</p>
                      </div>
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span className="text-amber-400 font-semibold text-sm">Potential Fraud Exposure</span>
                        </div>
                        <p className="text-2xl font-bold text-white">~{potentialFraudMCs} fake MCs/month</p>
                        <p className="text-xs text-slate-400 mt-1">= RM {potentialFraudCost.toLocaleString()} in fraud risk</p>
                      </div>
                    </div>

                    {/* Big Comparison */}
                    <div className="grid md:grid-cols-3 gap-4 items-center mb-8">
                      {/* Current Loss */}
                      <div className="bg-red-950/50 border border-red-500/30 rounded-2xl p-6 text-center">
                        <p className="text-red-400 text-sm font-semibold mb-2">CURRENT HIDDEN LOSS</p>
                        <p className="text-4xl font-black text-red-400">
                          RM {currentMonthlyLoss.toLocaleString()}
                        </p>
                        <p className="text-slate-400 text-sm mt-1">/month</p>
                      </div>

                      {/* VS */}
                      <div className="flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                          <span className="text-2xl font-black text-slate-400">VS</span>
                        </div>
                      </div>

                      {/* MedChain Cost */}
                      <div className="bg-emerald-950/50 border border-emerald-500/30 rounded-2xl p-6 text-center">
                        <p className="text-emerald-400 text-sm font-semibold mb-2">MEDCHAIN COST</p>
                        <p className="text-4xl font-black text-emerald-400">
                          RM {medchainTotalCost.toLocaleString()}
                        </p>
                        <p className="text-slate-400 text-sm mt-1">/month</p>
                      </div>
                    </div>

                    {/* Savings Result */}
                    {savingsPositive && (
                      <div className="bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 rounded-2xl p-6 text-center mb-6">
                        <p className="text-emerald-400 text-sm font-semibold mb-2">YOUR MONTHLY SAVINGS</p>
                        <p className="text-5xl font-black text-white mb-2">
                          RM {monthlySavings.toLocaleString()}
                        </p>
                        <p className="text-slate-300">
                          That's <span className="text-emerald-400 font-bold">RM {(monthlySavings * 12).toLocaleString()}</span> saved per year
                        </p>
                      </div>
                    )}

                    {/* The Clincher */}
                    <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-2xl p-6 text-center">
                      <div className="flex items-center justify-center gap-2 mb-3">
                        <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span className="text-blue-400 font-bold">THE BOTTOM LINE</span>
                      </div>
                      <p className="text-2xl md:text-3xl font-bold text-white">
                        Your facility pays for itself by preventing just{' '}
                        <span className="text-amber-400">{breakEvenFakeMCs} fake MCs</span> per month
                      </p>
                      <p className="text-slate-400 mt-3 text-sm">
                        Based on RM 2.3 billion annual MC fraud cost in Malaysia (Source: MTUC 2023)
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
            Ready to Secure Your Hospital's Future?
          </h2>
          <p className="text-xl text-slate-400 mb-8">
            Join the growing network of healthcare providers who trust Sarawak MedChain.
          </p>
          <button
            onClick={() => setShowRequestModal(true)}
            className="px-12 py-5 rounded-xl font-bold text-white text-xl transition-all transform hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${MEDCHAIN_BLUE}, ${MEDCHAIN_DARK})`,
              boxShadow: `0 10px 50px ${MEDCHAIN_BLUE}50`,
            }}
          >
            Request Access Today
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: MEDCHAIN_BLUE }}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="font-bold text-white">Sarawak MedChain</span>
          </div>
          <p className="text-slate-500 text-sm">
            © 2026 Sarawak MedChain Sdn Bhd. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Request Access Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => !isSubmitting && setShowRequestModal(false)}
          />

          {/* Modal */}
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {submitted ? (
              /* Success State */
              <div className="p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Request Submitted!</h3>
                <p className="text-slate-400 mb-6">
                  Thank you for your interest in Sarawak MedChain. Our team will contact you within 24 hours to schedule a demo.
                </p>
                <button
                  onClick={() => {
                    setShowRequestModal(false);
                    setSubmitted(false);
                    setFormData({ hospitalName: '', contactPerson: '', email: '', phone: '', position: '', message: '' });
                  }}
                  className="px-6 py-3 rounded-xl font-semibold text-white"
                  style={{ backgroundColor: MEDCHAIN_BLUE }}
                >
                  Close
                </button>
              </div>
            ) : (
              /* Form */
              <>
                <div className="p-6 border-b border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-white">Request Hospital Access</h3>
                      <p className="text-sm text-slate-400">Fill in your details and we'll get back to you</p>
                    </div>
                    <button
                      onClick={() => setShowRequestModal(false)}
                      className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Hospital/Clinic Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.hospitalName}
                      onChange={(e) => setFormData({ ...formData, hospitalName: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      placeholder="e.g., Timberland Medical Centre"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Contact Person *</label>
                      <input
                        type="text"
                        required
                        value={formData.contactPerson}
                        onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        placeholder="Full name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Position *</label>
                      <input
                        type="text"
                        required
                        value={formData.position}
                        onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        placeholder="e.g., IT Director"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      placeholder="your@hospital.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Phone Number *</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      placeholder="+60 12-345 6789"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Message (Optional)</label>
                    <textarea
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                      placeholder="Tell us about your requirements..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 rounded-xl font-bold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ backgroundColor: MEDCHAIN_BLUE }}
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Submitting...
                      </>
                    ) : (
                      'Submit Request'
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
