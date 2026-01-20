import { useState } from 'react';

// Sarawak divisions with hospitals grouped by region
const DIVISIONS = {
  kuching: {
    name: 'Kuching Division',
    shortName: 'Kuching',
    color: '#3b82f6', // MedChain Blue
    hospitals: [
      { name: 'Sarawak General Hospital', type: 'Government', beds: 850 },
      { name: 'KPJ Kuching Specialist', type: 'Private', beds: 200 },
      { name: 'Normah Medical Specialist', type: 'Private', beds: 180 },
      { name: 'Timberland Medical Centre', type: 'Private', beds: 150 },
      { name: 'Borneo Medical Centre', type: 'Private', beds: 120 },
      { name: 'Bau Hospital', type: 'Government', beds: 60 },
      { name: 'Lundu Hospital', type: 'Government', beds: 45 },
      { name: 'Serian Hospital', type: 'Government', beds: 80 },
    ],
    position: { x: 18, y: 78 },
  },
  sibu: {
    name: 'Sibu Division',
    shortName: 'Sibu',
    color: '#8b5cf6', // Purple
    hospitals: [
      { name: 'Sibu Hospital', type: 'Government', beds: 540 },
      { name: 'Rejang Medical Centre', type: 'Private', beds: 150 },
      { name: 'Selangau District Hospital', type: 'Government', beds: 40 },
      { name: 'Kapit Hospital', type: 'Government', beds: 120 },
      { name: 'Sarikei Hospital', type: 'Government', beds: 180 },
    ],
    position: { x: 45, y: 55 },
  },
  miri: {
    name: 'Miri Division',
    shortName: 'Miri',
    color: '#f59e0b', // MedChain Gold
    hospitals: [
      { name: 'Miri General Hospital', type: 'Government', beds: 460 },
      { name: 'Columbia Asia Miri', type: 'Private', beds: 100 },
      { name: 'KPJ Miri Specialist', type: 'Private', beds: 120 },
      { name: 'Marudi Hospital', type: 'Government', beds: 60 },
      { name: 'Limbang Hospital', type: 'Government', beds: 90 },
      { name: 'Lawas Hospital', type: 'Government', beds: 50 },
    ],
    position: { x: 82, y: 18 },
  },
  bintulu: {
    name: 'Bintulu Division',
    shortName: 'Bintulu',
    color: '#10b981', // Emerald
    hospitals: [
      { name: 'Bintulu Hospital', type: 'Government', beds: 290 },
      { name: 'Mukah Hospital', type: 'Government', beds: 120 },
      { name: 'Sri Aman Hospital', type: 'Government', beds: 150 },
      { name: 'Betong Hospital', type: 'Government', beds: 80 },
      { name: 'Saratok Hospital', type: 'Government', beds: 60 },
    ],
    position: { x: 62, y: 38 },
  },
};

const TOTAL_HOSPITALS = Object.values(DIVISIONS).reduce((sum, div) => sum + div.hospitals.length, 0);

export default function SarawakReadinessMap() {
  const [selectedDivision, setSelectedDivision] = useState(null);
  const [tappedHospital, setTappedHospital] = useState(null);

  const activeData = selectedDivision ? DIVISIONS[selectedDivision] : null;

  const handleDivisionClick = (divisionKey) => {
    setSelectedDivision(selectedDivision === divisionKey ? null : divisionKey);
    setTappedHospital(null);
  };

  const handleHospitalTap = (index) => {
    setTappedHospital(tappedHospital === index ? null : index);
  };

  return (
    <div className="bg-gradient-to-br from-[#0a0f1a] via-[#0d1525] to-[#0a0f1a] rounded-3xl border border-blue-500/20 p-6 relative overflow-hidden">
      {/* Background grid - Infrastructure style */}
      <div className="absolute inset-0 opacity-[0.07]">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(59, 130, 246, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.5) 1px, transparent 1px)
          `,
          backgroundSize: '30px 30px',
        }} />
      </div>

      {/* MedChain branding accent */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-amber-500 to-blue-500 opacity-60"></div>

      <div className="relative">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Sarawak Health Infrastructure</h2>
              <p className="text-blue-400 text-xs">Tap a region to view hospital nodes</p>
            </div>
          </div>

          {/* Resilience Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-amber-400 text-xs font-bold">17/17 Resilience Audit</span>
          </div>
        </div>

        {/* Map + Sidebar Layout */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Map Container */}
          <div className="flex-1 relative bg-[#070b14] rounded-2xl border border-blue-500/10 overflow-hidden" style={{ minHeight: '320px' }}>
            {/* Stylized Sarawak Map SVG */}
            <svg viewBox="0 0 100 100" className="w-full h-auto" style={{ minHeight: '300px' }}>
              {/* Ocean/Background */}
              <defs>
                <radialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#1e3a5f" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#070b14" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect x="0" y="0" width="100" height="100" fill="#070b14" />
              <circle cx="50" cy="50" r="45" fill="url(#mapGlow)" />

              {/* Sarawak landmass */}
              <path
                d="M5 88 Q8 78 12 72 L18 68 Q28 62 35 58 L45 52 Q55 44 65 38 L75 28 Q85 20 94 16 L97 22 Q94 32 88 42 L82 52 Q76 60 70 65 L60 70 Q50 74 40 78 L28 82 Q18 86 10 88 L5 88 Z"
                fill="#111827"
                stroke="#1e3a5f"
                strokeWidth="0.5"
              />

              {/* Division regions */}
              {Object.entries(DIVISIONS).map(([key, division]) => (
                <g key={key} className="cursor-pointer" onClick={() => handleDivisionClick(key)}>
                  {/* Outer ring - selection indicator */}
                  {selectedDivision === key && (
                    <circle
                      cx={division.position.x}
                      cy={division.position.y}
                      r="10"
                      fill="none"
                      stroke={division.color}
                      strokeWidth="0.5"
                      opacity="0.5"
                      strokeDasharray="2 2"
                    />
                  )}

                  {/* Division node */}
                  <circle
                    cx={division.position.x}
                    cy={division.position.y}
                    r={selectedDivision === key ? 5 : 4}
                    fill={division.color}
                    opacity={selectedDivision === key ? 1 : 0.8}
                    className="transition-all duration-300"
                  />

                  {/* Inner glow */}
                  <circle
                    cx={division.position.x}
                    cy={division.position.y}
                    r="2"
                    fill="white"
                    opacity="0.4"
                  />

                  {/* Division label */}
                  <text
                    x={division.position.x}
                    y={division.position.y - 9}
                    textAnchor="middle"
                    fill={selectedDivision === key ? '#ffffff' : '#64748b'}
                    fontSize="3.5"
                    fontWeight="600"
                    className="pointer-events-none select-none transition-all"
                  >
                    {division.shortName}
                  </text>

                  {/* Hospital count */}
                  <text
                    x={division.position.x + 7}
                    y={division.position.y + 1.5}
                    fill="#94a3b8"
                    fontSize="2.5"
                    fontWeight="bold"
                    className="pointer-events-none select-none"
                  >
                    {division.hospitals.length}
                  </text>
                </g>
              ))}

              {/* Connection lines - MedChain network */}
              <g stroke="#3b82f6" strokeWidth="0.3" opacity="0.25">
                <line x1="18" y1="78" x2="45" y2="55" />
                <line x1="45" y1="55" x2="62" y2="38" />
                <line x1="62" y1="38" x2="82" y2="18" />
              </g>
              <g stroke="#f59e0b" strokeWidth="0.2" opacity="0.2" strokeDasharray="1 1">
                <line x1="18" y1="78" x2="62" y2="38" />
                <line x1="45" y1="55" x2="82" y2="18" />
              </g>
            </svg>

            {/* Division Legend - bottom of map */}
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap justify-center gap-2">
              {Object.entries(DIVISIONS).map(([key, division]) => (
                <button
                  key={key}
                  onClick={() => handleDivisionClick(key)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
                    selectedDivision === key
                      ? 'bg-white/10 border border-white/20'
                      : 'bg-black/30 border border-white/5 hover:bg-white/5'
                  }`}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: division.color }}></div>
                  <span className={selectedDivision === key ? 'text-white' : 'text-slate-400'}>
                    {division.shortName}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Sidebar - Stats Overlay */}
          <div className="lg:w-64 flex flex-col gap-3">
            {/* Total Savings Card */}
            <div className="bg-[#070b14] border border-blue-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Savings (Statewide)</span>
              </div>
              <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-500">
                RM 2,070,005,584
              </p>
              <p className="text-slate-500 text-xs mt-1">Projected annual fraud prevention</p>
            </div>

            {/* Active Nodes Card */}
            <div className="bg-[#070b14] border border-emerald-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
                <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Active Nodes</span>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-black text-emerald-400">24/24</p>
                <span className="text-emerald-500 text-xs font-semibold">Online</span>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-emerald-400/80 text-xs">All systems operational</span>
              </div>
            </div>

            {/* Security Level Card */}
            <div className="bg-[#070b14] border border-blue-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Security Level</span>
              </div>
              <p className="text-xl font-black text-blue-400">AES-256-GCM</p>
              <p className="text-slate-500 text-xs mt-1">Military-grade encryption</p>
            </div>
          </div>
        </div>

        {/* Hospital List - Shows when division is selected */}
        {selectedDivision && activeData && (
          <div className="mt-4 bg-[#070b14] rounded-xl border border-white/10 overflow-hidden">
            <div className="p-3 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeData.color }}></div>
                <span className="text-white font-semibold text-sm">{activeData.name}</span>
                <span className="text-slate-500 text-xs">({activeData.hospitals.length} hospitals)</span>
              </div>
              <button
                onClick={() => setSelectedDivision(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/5 transition-all"
              >
                Close ✕
              </button>
            </div>

            {/* Scrollable hospital list - iPhone 8 Plus optimized */}
            <div
              className="max-h-52 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {activeData.hospitals.map((hospital, index) => (
                <div
                  key={index}
                  onClick={() => handleHospitalTap(index)}
                  className={`flex items-center justify-between p-3 border-b border-white/5 last:border-b-0 transition-all cursor-pointer active:scale-[0.99] ${
                    tappedHospital === index ? 'bg-blue-500/10' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  {/* Hospital Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{hospital.name}</p>
                      <p className="text-slate-500 text-xs">{hospital.type} • {hospital.beds} beds</p>
                    </div>
                  </div>

                  {/* Status - Node 100% Verified on tap */}
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {tappedHospital === index ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-lg">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-emerald-400 text-[10px] font-bold whitespace-nowrap">Node 100% Verified</span>
                      </div>
                    ) : (
                      <>
                        <span className="hidden sm:block px-2 py-0.5 bg-slate-800 rounded text-[10px] font-bold text-slate-500">
                          AES-256
                        </span>
                        <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                          <span className="text-emerald-400 text-[10px] font-semibold">Active</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Division Summary */}
            <div className="p-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
              <span className="text-slate-500 text-xs">All nodes verified</span>
              <div className="flex items-center gap-1">
                <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-amber-400 text-xs font-semibold">17/17 Audit Pass</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
