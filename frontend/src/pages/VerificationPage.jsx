import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { usePWA, PWA_CONFIGS } from '../hooks/usePWA';

export default function VerificationPage() {
  const { txHash } = useParams();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [mcData, setMcData] = useState(null);
  const cardRef = useRef(null);

  // Check if we're on the PWA route
  const isPWARoute = location.pathname === '/pwa/verify';

  // PWA: Only set manifest when on /pwa/verify route
  usePWA(isPWARoute ? PWA_CONFIGS.verify : null);

  useEffect(() => {
    // WEALTH 2026 DEMO: Instant blockchain verification (sub-500ms for 4G)
    const verifyOnChain = async () => {
      setLoading(true);
      // Reduced to 80ms for instant feel on 4G while showing animation
      await new Promise(resolve => setTimeout(resolve, 80));

      // Mock verification data (in production, this would query the blockchain)
      const mockData = {
        status: 'verified',
        patientName: maskName('Ahmad bin Hassan'),
        patientIC: maskIC('901201-13-5678'),
        diagnosis: 'Medical Leave Certificate',
        duration: 2,
        issueDate: new Date().toLocaleDateString('en-MY', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }),
        hospital: 'Timberland Medical Centre',
        doctorName: 'Dr. Wong Mei Ling',
        doctorMMC: 'MMC-45678',
        blockchainHash: txHash || '0x7a3f8c2d9e4b1a6f3c8d2e5a9b7f4c1d8e3a6b9c2d5f8a1e4b7c0d3f6a9e2b5c8d',
        blockNumber: 8234567,
        timestamp: new Date().toISOString(),
      };

      setMcData(mockData);
      setVerified(true);
      setLoading(false);
    };

    verifyOnChain();
  }, [txHash]);

  // Mask patient name (show first and last characters)
  const maskName = (name) => {
    const parts = name.split(' ');
    return parts.map(part => {
      if (part.length <= 2) return part;
      return part[0] + '*'.repeat(part.length - 2) + part[part.length - 1];
    }).join(' ');
  };

  // Mask IC number
  const maskIC = (ic) => {
    return ic.slice(0, 6) + '-**-' + ic.slice(-4);
  };

  // Print/Save function
  const handlePrint = () => {
    window.print();
  };

  // Download as image (simplified)
  const handleSave = () => {
    alert('To save: Take a screenshot or use your browser\'s print to PDF feature.');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0e14' }}>
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 relative">
            <div className="absolute inset-0 rounded-full border-4 border-cyan-500/30 animate-ping"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-cyan-500 animate-spin"></div>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Verifying on Blockchain...</h2>
          <p className="text-slate-400">Querying Sarawak MedChain network</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: '#0a0e14' }}>
      {/* Global CSS & Print Styles */}
      <style>{`
        html, body, #root {
          background-color: #0a0e14 !important;
        }
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-card {
            box-shadow: none !important;
            border: 2px solid #e2e8f0 !important;
          }
        }
      `}</style>

      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Verification Status Banner */}
        <div className="no-print mb-8 text-center">
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-emerald-500/20 border border-emerald-500/30 rounded-full">
            <div className="relative">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </div>
            <span className="text-emerald-400 font-bold text-lg">VERIFIED ON MEDCHAIN</span>
          </div>
        </div>

        {/* Digital MC Card */}
        <div
          ref={cardRef}
          className="print-card bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl overflow-hidden shadow-2xl border border-white/10"
        >
          {/* Card Header */}
          <div className="bg-gradient-to-r from-cyan-600 to-blue-600 px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Medical Certificate</h1>
                  <p className="text-cyan-100">Blockchain Verified Document</p>
                </div>
              </div>
              <div className="bg-white p-2 rounded-xl">
                <QRCodeSVG
                  value={window.location.href}
                  size={80}
                  level="H"
                />
              </div>
            </div>
          </div>

          {/* Verification Badge */}
          <div className="px-8 py-4 bg-emerald-500/10 border-b border-emerald-500/20">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-emerald-400 font-bold">VERIFIED ON MEDCHAIN</span>
              <span className="text-slate-400 text-sm ml-auto">Block #{mcData?.blockNumber?.toLocaleString()}</span>
            </div>
          </div>

          {/* Card Body */}
          <div className="px-8 py-6 space-y-6">
            {/* Patient Info */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-slate-500 text-sm uppercase tracking-wider mb-1">Patient Name</p>
                <p className="text-white text-lg font-semibold">{mcData?.patientName}</p>
              </div>
              <div>
                <p className="text-slate-500 text-sm uppercase tracking-wider mb-1">IC Number</p>
                <p className="text-white text-lg font-semibold font-mono">{mcData?.patientIC}</p>
              </div>
            </div>

            {/* Diagnosis */}
            <div>
              <p className="text-slate-500 text-sm uppercase tracking-wider mb-1">Certificate Type</p>
              <p className="text-white text-lg font-semibold">{mcData?.diagnosis}</p>
            </div>

            {/* Duration & Date */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-slate-500 text-sm uppercase tracking-wider mb-1">Duration</p>
                <p className="text-cyan-400 text-2xl font-bold">{mcData?.duration} Day{mcData?.duration > 1 ? 's' : ''}</p>
              </div>
              <div>
                <p className="text-slate-500 text-sm uppercase tracking-wider mb-1">Issue Date</p>
                <p className="text-white text-lg font-semibold">{mcData?.issueDate}</p>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-white/10"></div>

            {/* Hospital & Doctor */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-slate-500 text-sm uppercase tracking-wider mb-1">Healthcare Facility</p>
                <p className="text-white font-semibold">{mcData?.hospital}</p>
              </div>
              <div>
                <p className="text-slate-500 text-sm uppercase tracking-wider mb-1">Issuing Doctor</p>
                <p className="text-white font-semibold">{mcData?.doctorName}</p>
                <p className="text-slate-400 text-sm">{mcData?.doctorMMC}</p>
              </div>
            </div>

            {/* Blockchain Hash */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <p className="text-slate-500 text-sm uppercase tracking-wider mb-2">Blockchain Record ID</p>
              <code className="text-cyan-400 text-xs font-mono break-all block">
                {mcData?.blockchainHash}
              </code>
            </div>
          </div>

          {/* Card Footer - Branding */}
          <div className="px-8 py-5 bg-slate-950/50 border-t border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-bold text-sm">Secured by Sarawak MedChain</p>
                  <p className="text-slate-500 text-xs">Immutable. Verifiable. Trusted.</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-slate-500 text-xs">Verified at</p>
                <p className="text-slate-400 text-xs">{new Date().toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="no-print mt-8 flex gap-4 justify-center">
          <button
            onClick={handlePrint}
            className="px-8 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold rounded-xl hover:from-cyan-500 hover:to-blue-500 transition-all flex items-center gap-3 shadow-lg shadow-cyan-500/25"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Certificate
          </button>
          <button
            onClick={handleSave}
            className="px-8 py-4 bg-white/10 border border-white/20 text-white font-bold rounded-xl hover:bg-white/20 transition-all flex items-center gap-3"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Save to Device
          </button>
        </div>

        {/* Verification Info */}
        <div className="no-print mt-8 text-center">
          <p className="text-slate-500 text-sm mb-2">
            This medical certificate has been cryptographically secured on the Sarawak MedChain blockchain.
          </p>
          <p className="text-slate-600 text-xs">
            For verification inquiries, contact your healthcare provider or visit medchain.sarawak.gov.my
          </p>
        </div>
      </div>
    </div>
  );
}
