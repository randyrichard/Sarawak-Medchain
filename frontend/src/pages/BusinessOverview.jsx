import { useRef } from 'react';

export default function BusinessOverview() {
  const printRef = useRef(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 40px;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
          .print-break {
            page-break-after: always;
          }
        }
      `}</style>

      {/* Print Button - Hidden when printing */}
      <div className="no-print fixed top-6 right-6 z-50">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold shadow-lg hover:bg-blue-700 transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print Document
        </button>
      </div>

      {/* Main Document */}
      <div
        id="print-area"
        ref={printRef}
        className="min-h-screen bg-white p-8 lg:p-16"
      >
        <div className="max-w-4xl mx-auto">
          {/* Header with Logo */}
          <div className="text-center mb-12 pb-8 border-b-2 border-slate-200">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
            <h1 className="text-4xl font-black text-slate-900 mb-2">SARAWAK MEDCHAIN</h1>
            <p className="text-lg text-amber-600 font-semibold tracking-wide">Blockchain-Secured Medical Records</p>
            <p className="text-slate-500 mt-2">Business Overview Document</p>
          </div>

          {/* Executive Summary */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">1</span>
              Executive Summary
            </h2>
            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <p className="text-slate-700 leading-relaxed">
                Sarawak MedChain is a pioneering healthcare technology company focused on digitizing and securing medical records
                across Sarawak using blockchain technology. Our platform ensures data integrity, patient privacy, and seamless
                access for authorized healthcare providers while meeting 2026 digital healthcare standards.
              </p>
            </div>
          </section>

          {/* Business Model */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">2</span>
              Business Model
            </h2>
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-blue-900">Hybrid SaaS Model</h3>
                  <p className="text-blue-700">Fixed Subscription + Blockchain Transaction Fee</p>
                </div>
              </div>
              <p className="text-slate-700 leading-relaxed">
                Our hybrid model combines predictable recurring revenue from monthly subscriptions with variable transaction-based
                fees for blockchain data integrity services. This ensures sustainable growth while aligning costs with actual usage.
              </p>
            </div>
          </section>

          {/* Revenue Breakdown */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">3</span>
              Revenue Breakdown
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Hospital Tier */}
              <div className="bg-white rounded-xl p-6 border-2 border-emerald-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold uppercase">Premium</span>
                  <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">Hospital Tier</h3>
                <p className="text-3xl font-black text-emerald-600 mb-2">RM 10,000</p>
                <p className="text-slate-500 text-sm">per month</p>
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li>• Unlimited doctors</li>
                    <li>• Priority support</li>
                    <li>• Full API access</li>
                    <li>• Custom integrations</li>
                  </ul>
                </div>
              </div>

              {/* Clinic Tier */}
              <div className="bg-white rounded-xl p-6 border-2 border-blue-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold uppercase">Standard</span>
                  <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">Clinic Tier</h3>
                <p className="text-3xl font-black text-blue-600 mb-2">RM 2,000</p>
                <p className="text-slate-500 text-sm">per month</p>
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li>• Up to 5 doctors</li>
                    <li>• Email support</li>
                    <li>• Standard API access</li>
                    <li>• Basic reporting</li>
                  </ul>
                </div>
              </div>

              {/* Transaction Fee */}
              <div className="bg-white rounded-xl p-6 border-2 border-amber-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold uppercase">Per Use</span>
                  <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">MC Transaction Fee</h3>
                <p className="text-3xl font-black text-amber-600 mb-2">RM 1.00</p>
                <p className="text-slate-500 text-sm">per medical certificate</p>
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li>• Blockchain verification</li>
                    <li>• Data integrity proof</li>
                    <li>• Immutable audit trail</li>
                    <li>• Tamper-proof records</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Tech Stack */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">4</span>
              Technology Stack
            </h2>

            <div className="bg-slate-900 rounded-xl p-6 text-white">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold">Secure Private Blockchain</h3>
                  <p className="text-slate-400">Enterprise-grade infrastructure</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-800 rounded-lg p-4 text-center">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <span className="text-green-400 font-bold text-sm">JS</span>
                  </div>
                  <p className="font-semibold">Node.js</p>
                  <p className="text-xs text-slate-400">Backend Runtime</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 text-center">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <span className="text-blue-400 font-bold text-sm">R</span>
                  </div>
                  <p className="font-semibold">React</p>
                  <p className="text-xs text-slate-400">Frontend Framework</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 text-center">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <span className="text-purple-400 font-bold text-sm">ETH</span>
                  </div>
                  <p className="font-semibold">Ethereum</p>
                  <p className="text-xs text-slate-400">Smart Contracts</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-4 text-center">
                  <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <span className="text-cyan-400 font-bold text-sm">IPFS</span>
                  </div>
                  <p className="font-semibold">IPFS</p>
                  <p className="text-xs text-slate-400">Decentralized Storage</p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-700">
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-slate-700 rounded-full text-xs">AES-256 Encryption</span>
                  <span className="px-3 py-1 bg-slate-700 rounded-full text-xs">MetaMask Integration</span>
                  <span className="px-3 py-1 bg-slate-700 rounded-full text-xs">Role-Based Access</span>
                  <span className="px-3 py-1 bg-slate-700 rounded-full text-xs">Audit Trail</span>
                </div>
              </div>
            </div>
          </section>

          {/* Company Goal */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">5</span>
              Company Goal
            </h2>

            <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-xl p-8 text-white">
              <div className="flex items-start gap-6">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-3">Our Mission</h3>
                  <p className="text-xl leading-relaxed text-red-100">
                    To digitize medical records across Sarawak for 2026 standards, ensuring every healthcare
                    facility has access to secure, blockchain-verified patient data that improves healthcare
                    outcomes while maintaining the highest standards of privacy and data integrity.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-white/20">
                <div className="text-center">
                  <p className="text-3xl font-black">2026</p>
                  <p className="text-sm text-red-200">Target Year</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-black">100%</p>
                  <p className="text-sm text-red-200">Digital Coverage</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-black">Sarawak</p>
                  <p className="text-sm text-red-200">State-wide Implementation</p>
                </div>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="mt-12 pt-8 border-t-2 border-slate-200 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-6 h-6 bg-red-600 rounded flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <span className="font-bold text-slate-800">Sarawak MedChain</span>
            </div>
            <p className="text-slate-500 text-sm">
              Blockchain-Secured Medical Records for Sarawak
            </p>
            <p className="text-slate-400 text-xs mt-2">
              Document Generated: {new Date().toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
