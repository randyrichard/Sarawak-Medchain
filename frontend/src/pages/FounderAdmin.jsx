import { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import SignatureCanvas from 'react-signature-canvas';

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
  purple: '#8b5cf6',
};

// Market data
const TOTAL_SARAWAK_HOSPITALS = 24;
const TOTAL_SARAWAK_CLINICS = 180;
const TARGET_CLIENTS = 200;
const REVENUE_TARGET = 500000;

// Revenue projection data (path to RM500k)
const projectionData = [
  { month: 'Jan', clients: 6, revenue: 36000, projected: false },
  { month: 'Feb', clients: 12, revenue: 72000, projected: true },
  { month: 'Mar', clients: 25, revenue: 150000, projected: true },
  { month: 'Apr', clients: 45, revenue: 270000, projected: true },
  { month: 'May', clients: 80, revenue: 400000, projected: true },
  { month: 'Jun', clients: 120, revenue: 480000, projected: true },
  { month: 'Jul', clients: 160, revenue: 520000, projected: true },
  { month: 'Aug', clients: 200, revenue: 560000, projected: true },
];

// Blockchain nodes across Sarawak
const blockchainNodes = [
  { id: 1, city: 'Kuching', status: 'online', latency: 12, blocks: 15847, peers: 8 },
  { id: 2, city: 'Miri', status: 'online', latency: 24, blocks: 15847, peers: 6 },
  { id: 3, city: 'Sibu', status: 'online', latency: 18, blocks: 15847, peers: 5 },
  { id: 4, city: 'Bintulu', status: 'online', latency: 31, blocks: 15846, peers: 4 },
  { id: 5, city: 'Kuching (Backup)', status: 'standby', latency: 15, blocks: 15847, peers: 3 },
];

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

// High-Value Hospital Leads (from Request Access modal submissions)
const hospitalLeads = [
  { id: 1, facilityName: 'KPJ Kuching Specialist Hospital', facilityType: 'Private Hospital', estimatedMCs: 850, decisionMaker: 'CEO', email: 'ceo@kpjkuching.com', submittedAt: '2026-01-15' },
  { id: 2, facilityName: 'Normah Medical Specialist Centre', facilityType: 'Private Specialist', estimatedMCs: 620, decisionMaker: 'Hospital Director', email: 'director@normah.com', submittedAt: '2026-01-14' },
  { id: 3, facilityName: 'Rejang Medical Centre', facilityType: 'Private Hospital', estimatedMCs: 480, decisionMaker: 'Head of IT', email: 'it@rejangmedical.com', submittedAt: '2026-01-14' },
  { id: 4, facilityName: 'Borneo Medical Centre', facilityType: 'Private Hospital', estimatedMCs: 720, decisionMaker: 'CEO', email: 'ceo@borneomedical.com', submittedAt: '2026-01-13' },
  { id: 5, facilityName: 'Timberland Medical Centre', facilityType: 'Medical Centre', estimatedMCs: 390, decisionMaker: 'Operations Manager', email: 'ops@timberland.com', submittedAt: '2026-01-12' },
  { id: 6, facilityName: 'Columbia Asia Hospital Miri', facilityType: 'Private Hospital', estimatedMCs: 550, decisionMaker: 'Hospital Director', email: 'director@columbiaasia.com', submittedAt: '2026-01-11' },
];

// Calculate Lead Value: (Monthly MCs * RM1.00) + RM10,000 subscription
const calculateLeadValue = (estimatedMCs) => {
  return (estimatedMCs * 1.00) + 10000;
};

// Sarawak Map SVG Component
function SarawakMap({ clients }) {
  const cities = {
    Kuching: { x: 25, y: 75, clients: clients.filter(c => c.city === 'Kuching') },
    Sibu: { x: 55, y: 45, clients: clients.filter(c => c.city === 'Sibu') },
    Miri: { x: 75, y: 20, clients: clients.filter(c => c.city === 'Miri') },
  };

  return (
    <div className="relative w-full h-48">
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

// Custom tooltip for the chart
function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div
        className="rounded-lg p-3 border shadow-xl"
        style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
      >
        <p className="font-bold" style={{ color: theme.textPrimary }}>{label}</p>
        <p style={{ color: theme.success }}>
          Revenue: RM {payload[0].value.toLocaleString()}
        </p>
        <p style={{ color: theme.accent }}>
          Clients: {payload[0].payload.clients}
        </p>
      </div>
    );
  }
  return null;
}

// Generate unique hash ID for blockchain verification
const generateHashId = () => {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
};

// Proposal Modal with Digital Signature
function ProposalModal({ isOpen, onClose, lead, onDealClosed }) {
  const sigCanvas = useRef(null);
  const [isSigned, setIsSigned] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [verificationData, setVerificationData] = useState(null);

  if (!isOpen || !lead) return null;

  const leadValue = (lead.estimatedMCs * 1.00) + 10000;

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setIsSigned(false);
  };

  const handleSignatureEnd = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
      setIsSigned(true);
    }
  };

  const handleConfirmPayment = async () => {
    if (!isSigned) return;

    setIsProcessing(true);

    // Simulate blockchain transaction
    await new Promise(resolve => setTimeout(resolve, 2000));

    const verification = {
      hashId: generateHashId(),
      timestamp: new Date().toISOString(),
      blockNumber: Math.floor(Math.random() * 1000000) + 15847000,
      facilityName: lead.facilityName,
      amount: 10000,
      signatureData: sigCanvas.current?.toDataURL()
    };

    setVerificationData(verification);
    setIsComplete(true);
    setIsProcessing(false);

    // Notify parent component about the closed deal
    onDealClosed({
      ...lead,
      verification,
      closedAt: new Date()
    });
  };

  const handleClose = () => {
    setIsSigned(false);
    setIsProcessing(false);
    setIsComplete(false);
    setVerificationData(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl rounded-2xl border overflow-hidden"
        style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
      >
        {/* Header */}
        <div
          className="px-8 py-6"
          style={{ backgroundColor: theme.bg, borderBottom: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold" style={{ color: theme.textPrimary }}>
                Partnership Proposal
              </h2>
              <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
                {lead.facilityName}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:opacity-80"
              style={{ backgroundColor: theme.bgCard }}
            >
              <svg className="w-5 h-5" fill={theme.textSecondary} viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        {!isComplete ? (
          <>
            {/* Proposal Details */}
            <div className="px-8 py-6">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}
                >
                  <p className="text-sm" style={{ color: theme.textMuted }}>Facility Type</p>
                  <p className="text-lg font-bold" style={{ color: theme.textPrimary }}>{lead.facilityType}</p>
                </div>
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}
                >
                  <p className="text-sm" style={{ color: theme.textMuted }}>Decision Maker</p>
                  <p className="text-lg font-bold" style={{ color: theme.textPrimary }}>{lead.decisionMaker}</p>
                </div>
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}
                >
                  <p className="text-sm" style={{ color: theme.textMuted }}>Estimated Monthly MCs</p>
                  <p className="text-lg font-bold" style={{ color: theme.accent }}>{lead.estimatedMCs.toLocaleString()}</p>
                </div>
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: `${theme.success}10`, border: `1px solid ${theme.success}` }}
                >
                  <p className="text-sm" style={{ color: theme.success }}>Total Monthly Value</p>
                  <p className="text-lg font-black" style={{ color: theme.success }}>RM {leadValue.toLocaleString()}</p>
                </div>
              </div>

              {/* Pricing Breakdown */}
              <div
                className="p-4 rounded-xl mb-6"
                style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}
              >
                <p className="text-sm font-semibold mb-3" style={{ color: theme.textSecondary }}>Pricing Breakdown</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span style={{ color: theme.textMuted }}>Hospital Subscription (Monthly)</span>
                    <span className="font-bold" style={{ color: theme.textPrimary }}>RM 10,000</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: theme.textMuted }}>Variable MC Fee ({lead.estimatedMCs} x RM1.00)</span>
                    <span className="font-bold" style={{ color: theme.textPrimary }}>RM {lead.estimatedMCs.toLocaleString()}</span>
                  </div>
                  <div className="pt-2 mt-2 flex justify-between" style={{ borderTop: `1px solid ${theme.border}` }}>
                    <span className="font-bold" style={{ color: theme.textPrimary }}>First Month Total</span>
                    <span className="font-black text-lg" style={{ color: theme.success }}>RM {leadValue.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Digital Signature Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold" style={{ color: theme.textSecondary }}>
                    Digital Signature
                  </p>
                  <button
                    onClick={clearSignature}
                    className="text-xs px-3 py-1 rounded-lg transition-all hover:opacity-80"
                    style={{ backgroundColor: theme.bg, color: theme.textMuted, border: `1px solid ${theme.border}` }}
                  >
                    Clear
                  </button>
                </div>
                <div
                  className="rounded-xl overflow-hidden"
                  style={{
                    backgroundColor: '#ffffff',
                    border: isSigned ? `2px solid ${theme.success}` : `2px dashed ${theme.border}`
                  }}
                >
                  <SignatureCanvas
                    ref={sigCanvas}
                    canvasProps={{
                      className: 'w-full h-32 cursor-crosshair'
                    }}
                    backgroundColor="white"
                    penColor="#0a1628"
                    onEnd={handleSignatureEnd}
                  />
                </div>
                {!isSigned && (
                  <p className="text-xs mt-2 text-center" style={{ color: theme.textMuted }}>
                    Please sign above to authorize the partnership agreement
                  </p>
                )}
                {isSigned && (
                  <p className="text-xs mt-2 text-center" style={{ color: theme.success }}>
                    Signature captured successfully
                  </p>
                )}
              </div>
            </div>

            {/* Footer with Payment Button */}
            <div
              className="px-8 py-6"
              style={{ backgroundColor: theme.bg, borderTop: `1px solid ${theme.border}` }}
            >
              <button
                onClick={handleConfirmPayment}
                disabled={!isSigned || isProcessing}
                className="w-full py-4 rounded-xl font-bold text-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isSigned ? theme.success : theme.textMuted,
                  color: theme.textPrimary
                }}
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-3">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Recording on Blockchain...
                  </span>
                ) : (
                  `Confirm & Pay RM10,000`
                )}
              </button>
              {!isSigned && (
                <p className="text-center text-xs mt-3" style={{ color: theme.textMuted }}>
                  Signature required to activate payment
                </p>
              )}
            </div>
          </>
        ) : (
          /* Success State with Verification Seal */
          <div className="px-8 py-10 text-center">
            {/* Success Animation */}
            <div
              className="w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center"
              style={{ backgroundColor: `${theme.success}20`, border: `3px solid ${theme.success}` }}
            >
              <svg className="w-12 h-12" fill={theme.success} viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>

            <h3 className="text-2xl font-bold mb-2" style={{ color: theme.success }}>
              Deal Closed!
            </h3>
            <p className="mb-8" style={{ color: theme.textSecondary }}>
              Partnership with {lead.facilityName} has been recorded on the blockchain
            </p>

            {/* Blockchain Verification Seal */}
            <div
              className="rounded-2xl p-6 mb-6 relative overflow-hidden"
              style={{
                backgroundColor: theme.bg,
                border: `2px solid ${theme.success}`,
                boxShadow: `0 0 30px ${theme.success}30`
              }}
            >
              {/* Seal Badge */}
              <div className="absolute top-4 right-4">
                <div
                  className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"
                  style={{ backgroundColor: `${theme.success}20`, color: theme.success }}
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  BLOCKCHAIN VERIFIED
                </div>
              </div>

              <div className="flex items-start gap-4">
                {/* Signature Preview */}
                {verificationData?.signatureData && (
                  <div
                    className="w-32 h-20 rounded-lg overflow-hidden flex-shrink-0"
                    style={{ backgroundColor: '#ffffff', border: `1px solid ${theme.border}` }}
                  >
                    <img
                      src={verificationData.signatureData}
                      alt="Signature"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                {/* Verification Details */}
                <div className="flex-1 text-left">
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs" style={{ color: theme.textMuted }}>Transaction Hash</p>
                      <p className="text-xs font-mono break-all" style={{ color: theme.accent }}>
                        {verificationData?.hashId}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs" style={{ color: theme.textMuted }}>Block Number</p>
                        <p className="text-sm font-bold" style={{ color: theme.textPrimary }}>
                          #{verificationData?.blockNumber?.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: theme.textMuted }}>Timestamp</p>
                        <p className="text-sm font-bold" style={{ color: theme.textPrimary }}>
                          {new Date(verificationData?.timestamp).toLocaleString('en-MY')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Revenue Impact */}
            <div
              className="rounded-xl p-4 mb-6"
              style={{ backgroundColor: `${theme.success}10`, border: `1px solid ${theme.success}` }}
            >
              <p className="text-sm" style={{ color: theme.success }}>Monthly Revenue Added</p>
              <p className="text-3xl font-black" style={{ color: theme.success }}>
                +RM {leadValue.toLocaleString()}
              </p>
            </div>

            <button
              onClick={handleClose}
              className="px-8 py-3 rounded-xl font-semibold transition-all hover:opacity-80"
              style={{ backgroundColor: theme.accent, color: theme.textPrimary }}
            >
              Back to Dashboard
            </button>
          </div>
        )}
      </div>
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
  const [exportingDeck, setExportingDeck] = useState(false);
  const feedRef = useRef(null);

  // Proposal Modal state
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [closedDeals, setClosedDeals] = useState([]);
  const [dealNotification, setDealNotification] = useState(null);

  // Super Admin password (in production, this would be server-side)
  const SUPER_ADMIN_PASSWORD = 'founder2026';

  // Calculate market share
  const connectedHospitals = mockHospitals.filter(h => h.tier === 'Hospital').length;
  const connectedClinics = mockHospitals.filter(h => h.tier === 'Clinic').length;
  const hospitalMarketShare = Math.round((connectedHospitals / TOTAL_SARAWAK_HOSPITALS) * 100);
  const clinicMarketShare = Math.round((connectedClinics / TOTAL_SARAWAK_CLINICS) * 100);
  const totalMarketShare = Math.round((mockHospitals.length / (TOTAL_SARAWAK_HOSPITALS + TOTAL_SARAWAK_CLINICS)) * 100);

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

  // Open proposal modal for a lead
  const openProposal = (lead) => {
    setSelectedLead(lead);
    setProposalModalOpen(true);
  };

  // Handle deal closure
  const handleDealClosed = (closedDeal) => {
    const leadValue = (closedDeal.estimatedMCs * 1.00) + 10000;

    // Add to closed deals
    setClosedDeals(prev => [...prev, closedDeal]);

    // Update MRR live
    setMrr(prev => prev + leadValue);

    // Update bank balance with subscription payment
    setBankBalance(prev => prev + 10000);

    // Show deal notification
    setDealNotification({
      ...closedDeal,
      value: leadValue
    });

    // Clear notification after 5 seconds
    setTimeout(() => {
      setDealNotification(null);
    }, 5000);
  };

  // Export Investor Deck PDF
  const exportInvestorDeck = async () => {
    setExportingDeck(true);

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFillColor(10, 22, 40);
      doc.rect(0, 0, pageWidth, 45, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.text('SARAWAK MEDCHAIN', pageWidth / 2, 22, { align: 'center' });

      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Investor Summary Deck', pageWidth / 2, 32, { align: 'center' });

      doc.setFontSize(10);
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-MY')}`, pageWidth / 2, 40, { align: 'center' });

      // Section 1: Key Metrics
      doc.setTextColor(59, 130, 246);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('KEY METRICS', 14, 58);

      doc.setDrawColor(30, 58, 95);
      doc.line(14, 62, pageWidth - 14, 62);

      autoTable(doc, {
        startY: 68,
        head: [['Metric', 'Current', 'Target', 'Progress']],
        body: [
          ['Monthly Recurring Revenue', `RM ${mrr.toLocaleString()}`, 'RM 500,000', `${Math.round((mrr / REVENUE_TARGET) * 100)}%`],
          ['Active Clients', mockHospitals.length.toString(), TARGET_CLIENTS.toString(), `${Math.round((mockHospitals.length / TARGET_CLIENTS) * 100)}%`],
          ['Hospital Market Share', `${connectedHospitals}/${TOTAL_SARAWAK_HOSPITALS}`, '24/24', `${hospitalMarketShare}%`],
          ['Clinic Market Share', `${connectedClinics}/${TOTAL_SARAWAK_CLINICS}`, '176/180', `${clinicMarketShare}%`],
          ['Payment Collection Rate', `${Math.round((mockHospitals.filter(h => h.paid).length / mockHospitals.length) * 100)}%`, '95%', 'On Track'],
        ],
        theme: 'grid',
        headStyles: { fillColor: [15, 31, 56], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [240, 245, 250] },
      });

      // Section 2: Revenue Model
      const currentY = doc.lastAutoTable.finalY + 15;
      doc.setTextColor(59, 130, 246);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('REVENUE MODEL', 14, currentY);

      doc.setDrawColor(30, 58, 95);
      doc.line(14, currentY + 4, pageWidth - 14, currentY + 4);

      autoTable(doc, {
        startY: currentY + 10,
        head: [['Revenue Stream', 'Unit Price', 'Current Units', 'Monthly Revenue']],
        body: [
          ['Hospital Subscription', 'RM 10,000/mo', connectedHospitals.toString(), `RM ${(connectedHospitals * 10000).toLocaleString()}`],
          ['Clinic Subscription', 'RM 2,000/mo', connectedClinics.toString(), `RM ${(connectedClinics * 2000).toLocaleString()}`],
          ['MC Transaction Fee', 'RM 1.00/MC', mockHospitals.reduce((sum, h) => sum + h.mcs, 0).toString(), `RM ${mockHospitals.reduce((sum, h) => sum + h.mcs, 0).toLocaleString()}`],
          ['Total MRR', '', '', `RM ${mrr.toLocaleString()}`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [15, 31, 56], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [240, 245, 250] },
      });

      // Section 3: Infrastructure
      const infraY = doc.lastAutoTable.finalY + 15;
      doc.setTextColor(59, 130, 246);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('BLOCKCHAIN INFRASTRUCTURE', 14, infraY);

      doc.setDrawColor(30, 58, 95);
      doc.line(14, infraY + 4, pageWidth - 14, infraY + 4);

      autoTable(doc, {
        startY: infraY + 10,
        head: [['Node Location', 'Status', 'Latency', 'Block Height', 'Peers']],
        body: blockchainNodes.map(node => [
          node.city,
          node.status.toUpperCase(),
          `${node.latency}ms`,
          node.blocks.toLocaleString(),
          node.peers.toString()
        ]),
        theme: 'grid',
        headStyles: { fillColor: [15, 31, 56], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [240, 245, 250] },
      });

      // Section 4: Path to RM500k
      const pathY = doc.lastAutoTable.finalY + 15;
      doc.setTextColor(59, 130, 246);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('PATH TO RM500,000 MRR', 14, pathY);

      doc.setDrawColor(30, 58, 95);
      doc.line(14, pathY + 4, pageWidth - 14, pathY + 4);

      autoTable(doc, {
        startY: pathY + 10,
        head: [['Month', 'Projected Clients', 'Projected Revenue', 'Growth']],
        body: projectionData.map((item, index) => [
          item.month,
          item.clients.toString(),
          `RM ${item.revenue.toLocaleString()}`,
          index === 0 ? 'Current' : `+${Math.round(((item.clients - projectionData[index - 1].clients) / projectionData[index - 1].clients) * 100)}%`
        ]),
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [240, 255, 250] },
      });

      // Footer
      const footerY = doc.internal.pageSize.getHeight() - 15;
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('Confidential - Sarawak MedChain Investor Deck', pageWidth / 2, footerY, { align: 'center' });

      // Save
      doc.save(`SarawakMedChain_InvestorDeck_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error generating investor deck:', error);
      alert('Error generating PDF: ' + error.message);
    } finally {
      setExportingDeck(false);
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
            Path to RM500,000 MRR
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Export Investor Deck Button */}
          <button
            onClick={exportInvestorDeck}
            disabled={exportingDeck}
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: theme.purple, color: theme.textPrimary }}
          >
            {exportingDeck ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export Investor Deck
              </>
            )}
          </button>

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
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
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
          <p className="text-3xl font-black mb-2" style={{ color: theme.success }}>
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
          <p className="text-3xl font-black mb-2" style={{ color: theme.accent }}>
            RM {mrr.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}>
              {Math.round((mrr / REVENUE_TARGET) * 100)}% to goal
            </span>
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
          <p className="text-3xl font-black mb-2" style={{ color: theme.warning }}>
            RM {pendingPayments.reduce((sum, h) => sum + h.monthlyFee, 0).toLocaleString()}
          </p>
          <p className="text-sm" style={{ color: theme.textMuted }}>
            {pendingPayments.length} clients overdue
          </p>
        </div>

        {/* Market Share */}
        <div
          className="rounded-2xl p-6 border"
          style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium" style={{ color: theme.textSecondary }}>
              Sarawak Market Share
            </p>
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${theme.purple}20` }}
            >
              <svg className="w-5 h-5" fill={theme.purple} viewBox="0 0 20 20">
                <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-black mb-2" style={{ color: theme.purple }}>
            {totalMarketShare}%
          </p>
          <div className="text-xs space-y-1" style={{ color: theme.textMuted }}>
            <p>Hospitals: {connectedHospitals}/{TOTAL_SARAWAK_HOSPITALS} ({hospitalMarketShare}%)</p>
            <p>Clinics: {connectedClinics}/{TOTAL_SARAWAK_CLINICS} ({clinicMarketShare}%)</p>
          </div>
        </div>
      </div>

      {/* Revenue Projection Chart & Market Share */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Revenue Projection Chart */}
        <div
          className="lg:col-span-2 rounded-2xl p-6 border"
          style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold" style={{ color: theme.textPrimary }}>
                Path to RM500,000
              </h2>
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                Revenue projection: 6 clients → 200 clients
              </p>
            </div>
            <div
              className="px-4 py-2 rounded-xl"
              style={{ backgroundColor: `${theme.success}20` }}
            >
              <p className="text-sm font-bold" style={{ color: theme.success }}>Target: RM500k MRR</p>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionData}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme.success} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={theme.success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis dataKey="month" stroke={theme.textMuted} fontSize={12} />
                <YAxis
                  stroke={theme.textMuted}
                  fontSize={12}
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={theme.success}
                  strokeWidth={3}
                  fill="url(#revenueGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Milestones */}
          <div className="grid grid-cols-4 gap-4 mt-6 pt-6" style={{ borderTop: `1px solid ${theme.border}` }}>
            <div className="text-center">
              <p className="text-2xl font-black" style={{ color: theme.textPrimary }}>6</p>
              <p className="text-xs" style={{ color: theme.textMuted }}>Current Clients</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black" style={{ color: theme.accent }}>50</p>
              <p className="text-xs" style={{ color: theme.textMuted }}>Q2 Target</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black" style={{ color: theme.warning }}>120</p>
              <p className="text-xs" style={{ color: theme.textMuted }}>Q3 Target</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black" style={{ color: theme.success }}>200</p>
              <p className="text-xs" style={{ color: theme.textMuted }}>Year-End Goal</p>
            </div>
          </div>
        </div>

        {/* Node Status */}
        <div
          className="rounded-2xl p-6 border"
          style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold" style={{ color: theme.textPrimary }}>
                Node Status
              </h2>
              <p className="text-sm" style={{ color: theme.textSecondary }}>
                Distributed blockchain network
              </p>
            </div>
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${theme.success}20` }}
            >
              <svg className="w-5 h-5" fill={theme.success} viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 1a1 1 0 11-2 0 1 1 0 012 0zM2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2zm14 1a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
              </svg>
            </div>
          </div>

          <div className="space-y-3">
            {blockchainNodes.map((node) => (
              <div
                key={node.id}
                className="p-3 rounded-xl"
                style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${node.status === 'online' ? 'animate-pulse' : ''}`}
                      style={{ backgroundColor: node.status === 'online' ? theme.success : theme.warning }}
                    ></span>
                    <span className="font-medium text-sm" style={{ color: theme.textPrimary }}>
                      {node.city}
                    </span>
                  </div>
                  <span
                    className="text-xs px-2 py-1 rounded-full uppercase font-bold"
                    style={{
                      backgroundColor: node.status === 'online' ? `${theme.success}20` : `${theme.warning}20`,
                      color: node.status === 'online' ? theme.success : theme.warning
                    }}
                  >
                    {node.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p style={{ color: theme.textMuted }}>Latency</p>
                    <p style={{ color: theme.textSecondary }}>{node.latency}ms</p>
                  </div>
                  <div>
                    <p style={{ color: theme.textMuted }}>Blocks</p>
                    <p style={{ color: theme.textSecondary }}>{node.blocks.toLocaleString()}</p>
                  </div>
                  <div>
                    <p style={{ color: theme.textMuted }}>Peers</p>
                    <p style={{ color: theme.textSecondary }}>{node.peers}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Network Summary */}
          <div
            className="mt-4 pt-4 flex items-center justify-between"
            style={{ borderTop: `1px solid ${theme.border}` }}
          >
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: theme.success }}>
                {blockchainNodes.filter(n => n.status === 'online').length}/{blockchainNodes.length}
              </p>
              <p className="text-xs" style={{ color: theme.textMuted }}>Nodes Online</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: theme.accent }}>
                {blockchainNodes[0].blocks.toLocaleString()}
              </p>
              <p className="text-xs" style={{ color: theme.textMuted }}>Block Height</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: theme.purple }}>
                {blockchainNodes.reduce((sum, n) => sum + n.peers, 0)}
              </p>
              <p className="text-xs" style={{ color: theme.textMuted }}>Total Peers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Map and Live Feed Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
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

          {/* Market Share Visual */}
          <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: theme.textSecondary }}>Connected vs Target</span>
              <span className="text-sm font-bold" style={{ color: theme.accent }}>{mockHospitals.length} / {TARGET_CLIENTS}</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: theme.bg }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(mockHospitals.length / TARGET_CLIENTS) * 100}%`,
                  background: `linear-gradient(90deg, ${theme.accent}, ${theme.success})`
                }}
              ></div>
            </div>
            <div className="flex justify-between mt-2 text-xs" style={{ color: theme.textMuted }}>
              <span>0</span>
              <span>50</span>
              <span>100</span>
              <span>150</span>
              <span>200</span>
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
            className="space-y-2 h-48 overflow-y-auto pr-2"
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

      {/* Lead Pipeline Section */}
      <div
        className="rounded-2xl p-6 border mb-8"
        style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ color: theme.textPrimary }}>
              High-Value Hospital Leads
            </h2>
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              Pipeline from Request Access submissions
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div
              className="px-4 py-2 rounded-xl"
              style={{ backgroundColor: `${theme.success}20` }}
            >
              <p className="text-sm font-bold" style={{ color: theme.success }}>
                Total Pipeline: RM {hospitalLeads.reduce((sum, lead) => sum + calculateLeadValue(lead.estimatedMCs), 0).toLocaleString()}/mo
              </p>
            </div>
            <div
              className="px-3 py-1 rounded-full text-sm font-medium"
              style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}
            >
              {hospitalLeads.length} Leads
            </div>
          </div>
        </div>

        {/* Leads Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: theme.textSecondary }}>Facility Name</th>
                <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: theme.textSecondary }}>Facility Type</th>
                <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: theme.textSecondary }}>Est. Monthly MCs</th>
                <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: theme.textSecondary }}>Lead Value (MRR)</th>
                <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: theme.textSecondary }}>Decision Maker</th>
                <th className="text-center py-3 px-4 text-sm font-semibold" style={{ color: theme.textSecondary }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {hospitalLeads.map((lead, index) => {
                const leadValue = calculateLeadValue(lead.estimatedMCs);
                return (
                  <tr
                    key={lead.id}
                    className="transition-all hover:opacity-80"
                    style={{
                      backgroundColor: index % 2 === 0 ? 'transparent' : `${theme.bg}50`,
                      borderBottom: `1px solid ${theme.border}30`
                    }}
                  >
                    <td className="py-4 px-4">
                      <div>
                        <p className="font-semibold text-sm" style={{ color: theme.textPrimary }}>{lead.facilityName}</p>
                        <p className="text-xs" style={{ color: theme.textMuted }}>{lead.email}</p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className="px-3 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: lead.facilityType === 'Private Hospital' ? `${theme.accent}20` :
                                          lead.facilityType === 'Private Specialist' ? `${theme.purple}20` :
                                          `${theme.warning}20`,
                          color: lead.facilityType === 'Private Hospital' ? theme.accent :
                                 lead.facilityType === 'Private Specialist' ? theme.purple :
                                 theme.warning
                        }}
                      >
                        {lead.facilityType}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <p className="font-bold" style={{ color: theme.textPrimary }}>{lead.estimatedMCs.toLocaleString()}</p>
                      <p className="text-xs" style={{ color: theme.textMuted }}>MCs/month</p>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <p className="text-lg font-black" style={{ color: theme.success }}>
                        RM {leadValue.toLocaleString()}
                      </p>
                      <p className="text-xs" style={{ color: theme.textMuted }}>
                        (RM10k + {lead.estimatedMCs} MCs)
                      </p>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span
                        className="px-2 py-1 rounded text-xs font-medium"
                        style={{ backgroundColor: `${theme.success}20`, color: theme.success }}
                      >
                        {lead.decisionMaker}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          className="px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
                          style={{ backgroundColor: theme.accent, color: theme.textPrimary }}
                          onClick={() => window.location.href = `mailto:${lead.email}?subject=Sarawak MedChain Partnership`}
                        >
                          Contact {lead.decisionMaker.split(' ')[0]}
                        </button>
                        <button
                          className="px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
                          style={{ backgroundColor: theme.success, color: theme.textPrimary }}
                          onClick={() => openProposal(lead)}
                        >
                          Close Deal
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pipeline Summary */}
        <div
          className="mt-6 pt-6 grid grid-cols-4 gap-4"
          style={{ borderTop: `1px solid ${theme.border}` }}
        >
          <div className="text-center">
            <p className="text-2xl font-black" style={{ color: theme.accent }}>
              {hospitalLeads.filter(l => l.facilityType === 'Private Hospital').length}
            </p>
            <p className="text-xs" style={{ color: theme.textMuted }}>Private Hospitals</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black" style={{ color: theme.purple }}>
              {hospitalLeads.filter(l => l.facilityType === 'Private Specialist').length}
            </p>
            <p className="text-xs" style={{ color: theme.textMuted }}>Specialists</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black" style={{ color: theme.warning }}>
              {hospitalLeads.reduce((sum, l) => sum + l.estimatedMCs, 0).toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: theme.textMuted }}>Total Est. MCs</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black" style={{ color: theme.success }}>
              RM {hospitalLeads.reduce((sum, l) => sum + calculateLeadValue(l.estimatedMCs), 0).toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: theme.textMuted }}>Total Pipeline MRR</p>
          </div>
        </div>
      </div>

      {/* Footer Stats */}
      <div
        className="rounded-2xl p-6 border"
        style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
      >
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
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
          <div className="text-center">
            <p className="text-sm" style={{ color: theme.textSecondary }}>Revenue Goal</p>
            <p className="text-2xl font-bold" style={{ color: theme.purple }}>
              {Math.round((mrr / REVENUE_TARGET) * 100)}%
            </p>
          </div>
        </div>
      </div>

      {/* Security Notice */}
      <p className="text-center mt-6 text-xs" style={{ color: theme.textMuted }}>
        Founder Command Center • Access Logged • Session Encrypted
      </p>

      {/* Proposal Modal */}
      <ProposalModal
        isOpen={proposalModalOpen}
        onClose={() => {
          setProposalModalOpen(false);
          setSelectedLead(null);
        }}
        lead={selectedLead}
        onDealClosed={handleDealClosed}
      />

      {/* Deal Closed Notification Toast */}
      {dealNotification && (
        <div
          className="fixed bottom-6 right-6 z-50 animate-slide-in-right"
          style={{
            animation: 'slideInRight 0.5s ease-out'
          }}
        >
          <div
            className="rounded-2xl p-6 border shadow-2xl min-w-[380px]"
            style={{
              backgroundColor: theme.bgCard,
              borderColor: theme.success,
              boxShadow: `0 0 40px ${theme.success}40`
            }}
          >
            <div className="flex items-start gap-4">
              {/* Success Icon */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${theme.success}20` }}
              >
                <svg className="w-6 h-6" fill={theme.success} viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: theme.success }}></span>
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: theme.success }}>
                    Deal Closed
                  </p>
                </div>
                <p className="font-bold text-lg mb-1" style={{ color: theme.textPrimary }}>
                  {dealNotification.facilityName}
                </p>
                <p className="text-sm mb-3" style={{ color: theme.textSecondary }}>
                  Partnership agreement signed and recorded on blockchain
                </p>
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl"
                  style={{ backgroundColor: `${theme.success}15` }}
                >
                  <span className="text-sm" style={{ color: theme.textSecondary }}>Revenue Added:</span>
                  <span className="text-xl font-black" style={{ color: theme.success }}>
                    +RM {dealNotification.value?.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Animation styles */}
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
