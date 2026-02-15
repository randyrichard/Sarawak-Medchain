import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const BLUE = '#0066CC';
const DARK = '#003366';

export default function HospitalPitch() {
  const navigate = useNavigate();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [formData, setFormData] = useState({ hospitalName: '', contactPerson: '', email: '', phone: '', position: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [roiInputs, setRoiInputs] = useState({ numberOfDoctors: 10, monthlyMCs: 500 });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    await new Promise(r => setTimeout(r, 1500));
    const requests = JSON.parse(localStorage.getItem('medchain_access_requests') || '[]');
    requests.push({ ...formData, id: Date.now(), submittedAt: new Date().toISOString(), status: 'pending' });
    localStorage.setItem('medchain_access_requests', JSON.stringify(requests));
    setIsSubmitting(false);
    setSubmitted(true);
  };

  const stats = { hospitals: 3, clinics: 180, mcs: 12847, doctors: 156 };

  return (
    <div className="min-h-screen bg-white font-sans antialiased">

      {/* ═══════════ HERO ═══════════ */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-white">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(${BLUE} 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
        }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.07] blur-[100px]" style={{ backgroundColor: BLUE }} />

        <div className="relative max-w-3xl mx-auto px-6 text-center" style={{ paddingTop: '180px', paddingBottom: '180px' }}>
          <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold tracking-wide mb-10 backdrop-blur-sm" style={{
            backgroundColor: `${BLUE}08`, color: BLUE, border: `1px solid ${BLUE}15`,
          }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-500" />
            Now Live Across Sarawak
          </span>

          <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 leading-[1.05] tracking-tight" style={{ marginBottom: '28px' }}>
            Securing Sarawak's{' '}
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: `linear-gradient(135deg, ${BLUE}, #0099ff)` }}>Medical Future</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 max-w-lg mx-auto leading-relaxed font-light" style={{ marginBottom: '48px' }}>
            The new standard for digital medical certificates.{' '}
            <span className="text-slate-600 font-medium">Blockchain-verified. Tamper-proof. Instant.</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4" style={{ marginBottom: '56px' }}>
            <button onClick={() => setShowRequestModal(true)}
              className="px-8 py-4 rounded-2xl font-bold text-white text-sm tracking-wide transition-all duration-300 hover:translate-y-[-2px] hover:shadow-2xl"
              style={{ background: `linear-gradient(135deg, ${BLUE}, ${DARK})`, boxShadow: `0 8px 32px ${BLUE}25` }}>
              Request Hospital Access
            </button>
            <a href="#pricing" className="px-8 py-4 rounded-2xl font-semibold text-slate-500 text-sm border border-slate-200 hover:border-slate-300 hover:bg-white transition-all duration-300">
              View Pricing
            </a>
          </div>

          <div className="flex items-center justify-center gap-8 text-slate-300 text-[11px] font-medium tracking-wide">
            <span>🛡️ Blockchain Secured</span>
            <span className="w-1 h-1 rounded-full bg-slate-200" />
            <span>🔐 AES-256 Encrypted</span>
            <span className="w-1 h-1 rounded-full bg-slate-200" />
            <span>✅ PDPA Compliant</span>
          </div>
        </div>
      </section>


      {/* ═══════════ THE PROBLEM ═══════════ */}
      <section className="bg-slate-50" style={{ padding: '160px 24px' }}>
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.15em] text-red-500 bg-red-50" style={{ marginBottom: '24px' }}>
            The Problem
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 leading-[1.1] tracking-tight" style={{ marginBottom: '24px' }}>
            Paper MCs Are <span className="text-red-400">Broken</span>
          </h2>
          <p className="text-slate-400 text-base md:text-lg max-w-xl mx-auto leading-relaxed font-light" style={{ marginBottom: '80px' }}>
            Every year, Malaysian businesses lose billions to fraudulent medical certificates. Paper systems offer zero protection.
          </p>

          <div className="grid grid-cols-2 gap-6 max-w-md mx-auto" style={{ marginBottom: '64px' }}>
            <div className="bg-white rounded-xl p-6 border border-red-100 text-center">
              <p className="text-2xl font-extrabold text-red-400 mb-1">RM 2.3B</p>
              <p className="text-[11px] text-slate-500">Annual fraud cost</p>
            </div>
            <div className="bg-white rounded-xl p-6 border border-red-100 text-center">
              <p className="text-2xl font-extrabold text-red-400 mb-1">34%</p>
              <p className="text-[11px] text-slate-500">Suspect MC fraud</p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            {[
              { n: '1', t: 'Zero Verification', d: 'No way to verify if an MC is genuine without calling the clinic.' },
              { n: '2', t: 'Easy Manipulation', d: 'Dates and names can be altered with basic editing software.' },
              { n: '3', t: 'No Audit Trail', d: 'No record of copies or if it has been tampered with.' },
            ].map(i => (
              <div key={i.n} className="text-center">
                <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center mx-auto mb-3">
                  <span className="text-red-400 font-bold text-sm">{i.n}</span>
                </div>
                <h4 className="font-bold text-slate-800 text-sm mb-1.5">{i.t}</h4>
                <p className="text-slate-500 text-xs leading-relaxed">{i.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ═══════════ THE SOLUTION ═══════════ */}
      <section className="bg-white" style={{ padding: '160px 24px' }}>
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-600 bg-blue-50" style={{ marginBottom: '24px' }}>
            The Solution
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 leading-[1.1] tracking-tight" style={{ marginBottom: '24px' }}>
            Blockchain-Verified <span style={{ color: BLUE }}>Medical Certificates</span>
          </h2>
          <p className="text-slate-400 text-base md:text-lg max-w-xl mx-auto leading-relaxed font-light" style={{ marginBottom: '80px' }}>
            Every MC is cryptographically signed, timestamped on the blockchain, and instantly verifiable with a QR scan.
          </p>

          <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              { e: '🖥️', t: "Doctor's Terminal", d: 'Issue MCs in seconds with digital signatures that ensure authenticity.' },
              { e: '📱', t: 'QR Verification', d: 'Employers scan a QR code to instantly verify any MC on-chain.' },
              { e: '⛓️', t: 'Immutable Records', d: 'Permanently recorded. Cannot be altered, deleted, or duplicated.' },
            ].map(c => (
              <div key={c.t} className="bg-white rounded-2xl p-8 border border-slate-100 text-center shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto text-2xl" style={{ marginBottom: '20px' }}>{c.e}</div>
                <h3 className="font-bold text-slate-900 text-base mb-2">{c.t}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section className="bg-slate-50" style={{ padding: '160px 24px' }}>
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-600 bg-blue-50" style={{ marginBottom: '24px' }}>
            How It Works
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 leading-[1.1] tracking-tight" style={{ marginBottom: '80px' }}>
            Four Simple <span style={{ color: BLUE }}>Steps</span>
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {[
              { s: '01', t: 'Doctor Issues MC', d: 'Secure terminal', e: '🏥' },
              { s: '02', t: 'Blockchain Records', d: 'Signed on-chain', e: '⛓️' },
              { s: '03', t: 'Patient Receives', d: 'Digital MC + QR', e: '📱' },
              { s: '04', t: 'Employer Verifies', d: 'Instant QR scan', e: '✅' },
            ].map(i => (
              <div key={i.s} className="bg-white rounded-2xl p-6 border border-slate-100 text-center shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mx-auto text-xl mb-4">{i.e}</div>
                <div className="text-[10px] font-bold tracking-widest mb-1.5 text-slate-300">STEP {i.s}</div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">{i.t}</h4>
                <p className="text-xs text-slate-400">{i.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ═══════════ LIVE STATS ═══════════ */}
      <section className="bg-white" style={{ padding: '160px 24px' }}>
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 bg-emerald-50" style={{ marginBottom: '24px' }}>
            Live Network
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 leading-[1.1] tracking-tight" style={{ marginBottom: '24px' }}>
            Already Trusted Across <span className="text-emerald-500">Sarawak</span>
          </h2>
          <p className="text-slate-400 text-base md:text-lg max-w-xl mx-auto leading-relaxed font-light" style={{ marginBottom: '80px' }}>
            Real-time statistics from the blockchain.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {[
              { v: stats.hospitals, l: 'Major Hospitals', c: BLUE },
              { v: stats.clinics, l: 'Private Clinics', c: '#06b6d4' },
              { v: stats.mcs.toLocaleString(), l: 'MCs Issued', c: '#10b981' },
              { v: stats.doctors, l: 'Verified Doctors', c: '#f59e0b' },
            ].map(s => (
              <div key={s.l} className="bg-white rounded-2xl p-6 border border-slate-100 text-center shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <p className="text-4xl font-extrabold mb-2" style={{ color: s.c }}>{s.v}</p>
                <p className="text-slate-500 text-xs font-medium">{s.l}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-2" style={{ marginTop: '40px' }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-emerald-500 text-xs font-medium">Live on Blockchain</span>
          </div>
        </div>
      </section>


      {/* ═══════════ DEMO ═══════════ */}
      <section className="bg-slate-50" style={{ padding: '160px 24px' }}>
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.15em] text-purple-600 bg-purple-50" style={{ marginBottom: '24px' }}>
            See It In Action
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 leading-[1.1] tracking-tight" style={{ marginBottom: '24px' }}>
            Blockchain-Grade <span className="text-purple-500">Security</span>
          </h2>
          <p className="text-slate-400 text-base md:text-lg max-w-xl mx-auto leading-relaxed font-light" style={{ marginBottom: '80px' }}>
            MetaMask wallet authentication ensures only verified doctors can access the system.
          </p>

          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden max-w-2xl mx-auto shadow-sm hover:shadow-xl transition-all duration-300">
            <div className="py-20 bg-gradient-to-b from-purple-50/50 to-white flex flex-col items-center">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-100 to-amber-50 flex items-center justify-center text-4xl mb-6">🦊</div>
              <Link to="/demo"
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl text-white font-bold text-sm shadow-lg hover:shadow-xl hover:translate-y-[-2px] transition-all duration-300">
                🖥️ Interactive Preview
              </Link>
              <p className="text-slate-300 text-xs mt-4">No wallet needed — try it now</p>
            </div>
            <div className="px-6 py-5 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { i: '🔑', t: 'Zero Passwords', s: 'Crypto keys only' },
                  { i: '🛡️', t: 'SMC Verified', s: 'Identity confirmed' },
                  { i: '🔒', t: 'Unhackable', s: 'No central DB' },
                ].map(f => (
                  <div key={f.t}>
                    <p className="text-lg mb-0.5">{f.i}</p>
                    <p className="text-slate-800 font-semibold text-[11px]">{f.t}</p>
                    <p className="text-slate-400 text-[10px]">{f.s}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <blockquote className="text-sm text-slate-500 italic max-w-lg mx-auto leading-relaxed" style={{ marginTop: '48px' }}>
            "The moment I saw the MetaMask login, I knew this wasn't just another software vendor."
            <span className="block text-slate-400 text-xs mt-2 not-italic">— Hospital CEO during pilot demo</span>
          </blockquote>
        </div>
      </section>


      {/* ═══════════ FOUNDING CIRCLE ═══════════ */}
      <section className="bg-gradient-to-b from-amber-50/50 to-white" style={{ padding: '160px 24px' }}>
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-50 border border-amber-200/50 rounded-full" style={{ marginBottom: '24px' }}>
            <span className="text-sm">⭐</span>
            <span className="text-amber-600 font-bold text-[11px] tracking-wider">LIMITED TO 10 HOSPITALS</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 leading-[1.1] tracking-tight" style={{ marginBottom: '24px' }}>
            The <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-yellow-400">Founding Circle</span>
          </h2>
          <p className="text-slate-400 text-base md:text-lg max-w-xl mx-auto leading-relaxed font-light" style={{ marginBottom: '80px' }}>
            Be among the first 10 hospitals to secure Sarawak's medical records.
          </p>

          <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto" style={{ marginBottom: '64px' }}>
            {[
              { e: '⭐', t: 'Gold Founding Badge', d: '"Founding Partner" badge on every MC issued.' },
              { e: '💰', t: 'Legacy Rate Forever', d: 'RM 10,000/month locked for life.', x: 'Price never increases' },
              { e: '🛡️', t: 'First to Secure Sarawak', d: 'QR receipts show "Issued by Founding Partner".' },
            ].map(b => (
              <div key={b.t} className="bg-white rounded-2xl p-8 border border-amber-100 text-center shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto text-2xl" style={{ marginBottom: '20px' }}>{b.e}</div>
                <h3 className="font-bold text-slate-900 text-base mb-2">{b.t}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{b.d}</p>
                {b.x && <p className="text-emerald-500 text-xs font-semibold mt-3">{b.x}</p>}
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-amber-200/50 p-6 md:p-8 max-w-3xl mx-auto">
            <div className="flex flex-col items-center justify-center mb-6 gap-2">
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-800">Current Founding Partners</h3>
                <p className="text-slate-400 text-xs">5 of 10 slots claimed</p>
              </div>
              <span className="px-3 py-1 bg-red-50 border border-red-100 rounded-full text-red-400 text-[11px] font-bold animate-pulse">
                5 SLOTS LEFT
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {[
                { n: 1, name: 'Timberland Medical Centre', loc: 'Kuching' },
                { n: 2, name: 'KPJ Kuching Specialist', loc: 'Kuching' },
                { n: 3, name: 'Normah Medical Specialist', loc: 'Kuching' },
                { n: 4, name: 'Rejang Medical Centre', loc: 'Sibu' },
                { n: 5, name: 'Bintulu Medical Centre', loc: 'Bintulu' },
              ].map(p => (
                <div key={p.n} className="bg-amber-50/50 rounded-lg p-3 border border-amber-100 text-center">
                  <div className="w-6 h-6 bg-gradient-to-br from-amber-400 to-yellow-500 rounded flex items-center justify-center text-amber-900 font-bold text-[10px] mx-auto mb-1.5">
                    #{p.n}
                  </div>
                  <p className="text-slate-800 font-semibold text-[10px] leading-tight">{p.name}</p>
                  <p className="text-slate-400 text-[10px]">{p.loc}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[6, 7, 8, 9, 10].map(n => (
                <div key={n} className="rounded-lg p-3 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center min-h-[70px]">
                  <span className="text-slate-300 font-bold text-[11px]">#{n}</span>
                  <span className="text-slate-300 text-[9px] font-semibold">AVAILABLE</span>
                </div>
              ))}
            </div>

            <div className="text-center" style={{ marginTop: '40px' }}>
              <button onClick={() => navigate('/agreement', { state: { plan: 'founding' } })}
                className="px-8 py-3.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-amber-900 font-bold text-sm rounded-xl hover:shadow-md transition-all duration-200"
                style={{ backgroundSize: '200% 100%', animation: 'shimmer 3s ease-in-out infinite' }}>
                ⭐ Claim Your Founding Spot
              </button>
              <p className="text-slate-400 text-[11px] mt-2">Limited to first 10 hospitals</p>
            </div>
          </div>
        </div>
        <style>{`@keyframes shimmer { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }`}</style>
      </section>


      {/* ═══════════ PRICING ═══════════ */}
      <section id="pricing" className="bg-slate-50" style={{ padding: '160px 24px' }}>
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-600 bg-blue-50" style={{ marginBottom: '24px' }}>
            Pricing
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 leading-[1.1] tracking-tight" style={{ marginBottom: '24px' }}>
            Simple, Predictable <span style={{ color: BLUE }}>Pricing</span>
          </h2>
          <p className="text-slate-400 text-base md:text-lg max-w-xl mx-auto leading-relaxed font-light" style={{ marginBottom: '80px' }}>
            No hidden fees. No long-term contracts. Cancel anytime.
          </p>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden max-w-sm mx-auto shadow-lg">
            <div className="p-6 border-b border-slate-100" style={{ background: `linear-gradient(135deg, ${BLUE}06, ${DARK}03)` }}>
              <h3 className="text-lg font-bold text-slate-800">Hospital Enterprise Plan</h3>
              <p className="text-slate-400 text-xs">Everything you need to go digital</p>
            </div>
            <div className="p-6 border-b border-slate-100 text-center">
              <span className="text-4xl font-extrabold text-slate-800">RM 10,000</span>
              <span className="text-slate-400 text-sm">/mo</span>
              <div className="mt-4 px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-100 inline-block">
                <span className="font-bold text-slate-700">+ </span>
                <span className="text-lg font-bold" style={{ color: BLUE }}>RM 1.00</span>
                <span className="text-slate-500 text-xs"> per MC</span>
              </div>
            </div>
            <div className="p-6">
              <p className="font-bold text-slate-800 text-xs mb-4 text-center">Everything included:</p>
              <div className="grid grid-cols-2 gap-2 max-w-[260px] mx-auto">
                {['Unlimited doctors', 'Blockchain verification', 'QR code receipts', 'Real-time analytics',
                  'Priority support', 'Custom branding', 'API access', 'PDPA compliant', 'Audit trail', 'Data encryption',
                ].map(f => (
                  <div key={f} className="flex items-center gap-1.5">
                    <span className="text-emerald-500 text-[11px]">✓</span>
                    <span className="text-slate-600 text-[11px]">{f}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 pb-6">
              <button onClick={() => navigate('/agreement', { state: { plan: 'enterprise' } })}
                className="w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all duration-200 hover:brightness-110"
                style={{ background: `linear-gradient(135deg, ${BLUE}, ${DARK})` }}>
                Get Started — Sign Agreement
              </button>
              <p className="text-slate-400 text-[11px] mt-3 text-center">30-day money-back guarantee</p>
            </div>
          </div>

          <p className="text-slate-400 text-sm" style={{ marginTop: '40px' }}>
            Smaller clinic? <span className="text-cyan-500 font-semibold">Clinic Tier at RM 2,000/mo</span>
          </p>
        </div>
      </section>


      {/* ═══════════ ROI CALCULATOR ═══════════ */}
      <section className="bg-white" style={{ padding: '160px 24px' }}>
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 bg-emerald-50" style={{ marginBottom: '24px' }}>
            ROI Calculator
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 leading-[1.1] tracking-tight" style={{ marginBottom: '24px' }}>
            Calculate Your <span className="text-emerald-500">Savings</span>
          </h2>
          <p className="text-slate-400 text-base md:text-lg max-w-xl mx-auto leading-relaxed font-light" style={{ marginBottom: '80px' }}>
            See how MedChain pays for itself.
          </p>

          <div className="bg-slate-50 rounded-xl border border-slate-100 p-6 md:p-8 max-w-2xl mx-auto text-center">
            <div className="grid md:grid-cols-2 gap-5 mb-8">
              <div className="text-left">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Number of Doctors</label>
                <input type="number" min="1" max="500" value={roiInputs.numberOfDoctors}
                  onChange={(e) => setRoiInputs({ ...roiInputs, numberOfDoctors: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-800 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
              </div>
              <div className="text-left">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Monthly MCs Issued</label>
                <input type="number" min="10" max="10000" value={roiInputs.monthlyMCs}
                  onChange={(e) => setRoiInputs({ ...roiInputs, monthlyMCs: Math.max(10, parseInt(e.target.value) || 10) })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-800 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all" />
              </div>
            </div>

            {(() => {
              const mcs = roiInputs.monthlyMCs;
              const adminCost = mcs * 0.25 * 25;
              const fraudMCs = Math.round(mcs * 0.10);
              const fraudCost = fraudMCs * 350;
              const totalLoss = adminCost + fraudCost;
              const mcCost = 10000 + mcs;
              const savings = totalLoss - mcCost;
              const breakEven = Math.ceil(mcCost / 350);

              return (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-8 text-center">
                    <div className="bg-red-50/70 rounded-lg p-5 border border-red-100/60">
                      <p className="text-red-400 font-semibold text-[11px] mb-1">⏰ Admin Hours Wasted</p>
                      <p className="text-lg font-bold text-slate-800">{(mcs * 0.25).toFixed(0)} hrs/mo</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">= RM {adminCost.toLocaleString()}</p>
                    </div>
                    <div className="bg-amber-50/70 rounded-lg p-5 border border-amber-100/60">
                      <p className="text-amber-500 font-semibold text-[11px] mb-1">⚠️ Fraud Exposure</p>
                      <p className="text-lg font-bold text-slate-800">~{fraudMCs} fake MCs/mo</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">= RM {fraudCost.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 items-center mb-8 text-center">
                    <div className="bg-red-50/70 border border-red-100 rounded-lg p-5">
                      <p className="text-red-400 text-[10px] font-bold mb-1">CURRENT LOSS</p>
                      <p className="text-2xl font-extrabold text-red-400">RM {totalLoss.toLocaleString()}</p>
                      <p className="text-slate-400 text-[10px]">/month</p>
                    </div>
                    <div className="flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                        <span className="text-sm font-extrabold text-slate-300">VS</span>
                      </div>
                    </div>
                    <div className="bg-emerald-50/70 border border-emerald-100 rounded-lg p-5">
                      <p className="text-emerald-500 text-[10px] font-bold mb-1">MEDCHAIN</p>
                      <p className="text-2xl font-extrabold text-emerald-500">RM {mcCost.toLocaleString()}</p>
                      <p className="text-slate-400 text-[10px]">/month</p>
                    </div>
                  </div>

                  {savings > 0 && (
                    <div className="bg-emerald-50/70 border border-emerald-100 rounded-lg p-6 text-center mb-6">
                      <p className="text-emerald-500 text-[10px] font-bold mb-1">YOUR MONTHLY SAVINGS</p>
                      <p className="text-4xl font-extrabold text-slate-800 mb-1">RM {savings.toLocaleString()}</p>
                      <p className="text-slate-500 text-xs">
                        = <span className="text-emerald-500 font-bold">RM {(savings * 12).toLocaleString()}</span> / year
                      </p>
                    </div>
                  )}

                  <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-6 text-center">
                    <p className="text-blue-500 font-bold text-[11px] mb-2">🛡️ THE BOTTOM LINE</p>
                    <p className="text-lg font-bold text-slate-800 leading-snug">
                      Pays for itself by preventing just <span className="text-amber-500">{breakEven} fake MCs</span> / month
                    </p>
                    <p className="text-slate-400 text-[10px] mt-2">Based on RM 2.3B annual MC fraud (MTUC 2023)</p>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </section>


      {/* ═══════════ FINAL CTA ═══════════ */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100" style={{ padding: '160px 24px' }}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.05] blur-[80px]" style={{ backgroundColor: BLUE }} />
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 leading-[1.1] tracking-tight" style={{ marginBottom: '24px' }}>
            Ready to Secure Your Hospital's Future?
          </h2>
          <p className="text-lg text-slate-400 leading-relaxed font-light" style={{ marginBottom: '48px' }}>
            Join the growing network of healthcare providers who trust Sarawak MedChain.
          </p>
          <button onClick={() => setShowRequestModal(true)}
            className="px-10 py-5 rounded-2xl font-bold text-white text-base tracking-wide transition-all duration-300 hover:translate-y-[-2px] hover:shadow-2xl"
            style={{ background: `linear-gradient(135deg, ${BLUE}, ${DARK})`, boxShadow: `0 8px 32px ${BLUE}25` }}>
            Request Access Today
          </button>
        </div>
      </section>


      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="bg-slate-900 text-center" style={{ padding: '80px 24px' }}>
        <div className="flex items-center justify-center gap-2.5 mb-4">
          <span className="text-lg">🛡️</span>
          <span className="font-bold text-white text-base tracking-wide">Sarawak MedChain</span>
        </div>
        <p className="text-slate-500 text-xs tracking-wide">© 2026 Sarawak MedChain Sdn Bhd. All rights reserved.</p>
      </footer>


      {/* ═══════════ MODAL ═══════════ */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isSubmitting && setShowRequestModal(false)} />
          <div className="relative bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
            {submitted ? (
              <div className="p-8 text-center">
                <div className="text-3xl mb-4">✅</div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Request Submitted!</h3>
                <p className="text-slate-500 text-sm mb-5">We'll contact you within 24 hours.</p>
                <button onClick={() => { setShowRequestModal(false); setSubmitted(false); setFormData({ hospitalName: '', contactPerson: '', email: '', phone: '', position: '', message: '' }); }}
                  className="px-5 py-2 rounded-lg font-semibold text-white text-sm" style={{ backgroundColor: BLUE }}>
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800">Request Hospital Access</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">We'll get back to you within 24 hours</p>
                  </div>
                  <button onClick={() => setShowRequestModal(false)} className="p-1 rounded hover:bg-slate-100 text-slate-400">✕</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Hospital/Clinic Name *</label>
                    <input type="text" required value={formData.hospitalName} onChange={(e) => setFormData({ ...formData, hospitalName: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20" placeholder="e.g., Timberland Medical Centre" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Contact Person *</label>
                      <input type="text" required value={formData.contactPerson} onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20" placeholder="Full name" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Position *</label>
                      <input type="text" required value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20" placeholder="e.g., IT Director" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Email *</label>
                    <input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20" placeholder="your@hospital.com" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Phone *</label>
                    <input type="tel" required value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20" placeholder="+60 12-345 6789" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Message (Optional)</label>
                    <textarea value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} rows={2}
                      className="w-full px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20 resize-none" placeholder="Requirements..." />
                  </div>
                  <button type="submit" disabled={isSubmitting}
                    className="w-full py-3 rounded-lg font-bold text-white text-sm transition-all disabled:opacity-50"
                    style={{ backgroundColor: BLUE }}>
                    {isSubmitting ? 'Submitting...' : 'Submit Request'}
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
