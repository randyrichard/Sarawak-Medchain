import { useState, useEffect } from 'react';

// Sarawak divisions with hospitals - Miri first for default focus
const DIVISIONS = {
  miri: {
    name: 'Miri Division',
    shortName: 'Miri',
    color: '#f59e0b', // MedChain Gold - featured
    hospitals: [
      { name: 'Miri General', fullName: 'Miri General Hospital', type: 'Government', beds: 460 },
      { name: 'Columbia Asia', fullName: 'Columbia Asia Miri', type: 'Private', beds: 100 },
      { name: 'KPJ Miri', fullName: 'KPJ Miri Specialist', type: 'Private', beds: 120 },
      { name: 'Marudi Hospital', fullName: 'Marudi Hospital', type: 'Government', beds: 60 },
      { name: 'Limbang Hospital', fullName: 'Limbang Hospital', type: 'Government', beds: 90 },
      { name: 'Lawas Hospital', fullName: 'Lawas Hospital', type: 'Government', beds: 50 },
    ],
    position: { x: 78, y: 22 },
  },
  kuching: {
    name: 'Kuching Division',
    shortName: 'Kuching',
    color: '#3b82f6', // MedChain Blue
    hospitals: [
      { name: 'Sarawak General', fullName: 'Sarawak General Hospital', type: 'Government', beds: 850 },
      { name: 'KPJ Kuching', fullName: 'KPJ Kuching Specialist', type: 'Private', beds: 200 },
      { name: 'Normah Medical', fullName: 'Normah Medical Specialist', type: 'Private', beds: 180 },
      { name: 'Timberland MC', fullName: 'Timberland Medical Centre', type: 'Private', beds: 150 },
      { name: 'Borneo Medical', fullName: 'Borneo Medical Centre', type: 'Private', beds: 120 },
      { name: 'Bau Hospital', fullName: 'Bau Hospital', type: 'Government', beds: 60 },
      { name: 'Lundu Hospital', fullName: 'Lundu Hospital', type: 'Government', beds: 45 },
      { name: 'Serian Hospital', fullName: 'Serian Hospital', type: 'Government', beds: 80 },
    ],
    position: { x: 18, y: 78 },
  },
  sibu: {
    name: 'Sibu Division',
    shortName: 'Sibu',
    color: '#8b5cf6', // Purple
    hospitals: [
      { name: 'Sibu Hospital', fullName: 'Sibu Hospital', type: 'Government', beds: 540 },
      { name: 'Rejang Medical', fullName: 'Rejang Medical Centre', type: 'Private', beds: 150 },
      { name: 'Selangau District', fullName: 'Selangau District Hospital', type: 'Government', beds: 40 },
      { name: 'Kapit Hospital', fullName: 'Kapit Hospital', type: 'Government', beds: 120 },
      { name: 'Sarikei Hospital', fullName: 'Sarikei Hospital', type: 'Government', beds: 180 },
    ],
    position: { x: 45, y: 55 },
  },
  bintulu: {
    name: 'Bintulu Division',
    shortName: 'Bintulu',
    color: '#10b981', // Emerald
    hospitals: [
      { name: 'Bintulu Hospital', fullName: 'Bintulu Hospital', type: 'Government', beds: 290 },
      { name: 'Mukah Hospital', fullName: 'Mukah Hospital', type: 'Government', beds: 120 },
      { name: 'Sri Aman Hospital', fullName: 'Sri Aman Hospital', type: 'Government', beds: 150 },
      { name: 'Betong Hospital', fullName: 'Betong Hospital', type: 'Government', beds: 80 },
      { name: 'Saratok Hospital', fullName: 'Saratok Hospital', type: 'Government', beds: 60 },
    ],
    position: { x: 60, y: 40 },
  },
};

export default function SarawakReadinessMap() {
  const [selectedDivision, setSelectedDivision] = useState(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [flyInComplete, setFlyInComplete] = useState(false);
  const [scanLineY, setScanLineY] = useState(0);

  // Fly-in animation: Start zoomed out, then fly into Miri
  useEffect(() => {
    // Start the fly-in after a brief delay
    const flyInTimer = setTimeout(() => {
      setSelectedDivision('miri');
      setIsZoomed(true);
      setFlyInComplete(true);
    }, 800);

    return () => clearTimeout(flyInTimer);
  }, []);

  // Scanning line animation for security overlay
  useEffect(() => {
    const scanInterval = setInterval(() => {
      setScanLineY(prev => (prev + 1) % 100);
    }, 50);
    return () => clearInterval(scanInterval);
  }, []);

  const activeData = selectedDivision ? DIVISIONS[selectedDivision] : null;

  const handleDivisionClick = (divisionKey) => {
    if (selectedDivision === divisionKey) {
      setSelectedDivision(null);
      setIsZoomed(false);
    } else {
      setSelectedDivision(divisionKey);
      setIsZoomed(true);
    }
  };

  // Calculate viewBox for zoom effect - Miri focused
  const getViewBox = () => {
    if (!isZoomed || !selectedDivision) {
      return '0 0 100 100';
    }
    const div = DIVISIONS[selectedDivision];
    const x = Math.max(0, div.position.x - 20);
    const y = Math.max(0, div.position.y - 15);
    return `${x} ${y} 45 40`;
  };

  return (
    <div className="bg-gradient-to-br from-[#0a0f1a] via-[#0d1525] to-[#0a0f1a] rounded-3xl border border-blue-500/20 p-5 relative overflow-hidden">
      {/* Security scanning grid overlay - AES-256-GCM visualization */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Static grid */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `
            linear-gradient(rgba(59, 130, 246, 0.8) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.8) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
        }} />

        {/* Scanning line effect */}
        <div
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-30"
          style={{ top: `${scanLineY}%`, transition: 'top 0.05s linear' }}
        />
        <div
          className="absolute left-0 right-0 h-8 bg-gradient-to-b from-cyan-400/5 to-transparent"
          style={{ top: `${scanLineY}%`, transition: 'top 0.05s linear' }}
        />
      </div>

      {/* MedChain branding accent */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-amber-500 to-blue-500 opacity-60"></div>

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Sarawak Health Infrastructure</h2>
              <p className="text-blue-400 text-xs">AES-256-GCM Protected Network</p>
            </div>
          </div>

          {/* Zoom indicator */}
          {isZoomed && (
            <button
              onClick={() => { setSelectedDivision(null); setIsZoomed(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-400 hover:bg-white/10 transition-all"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
              </svg>
              Zoom Out
            </button>
          )}
        </div>

        {/* Map Container */}
        <div className="relative bg-[#070b14] rounded-2xl border border-blue-500/10 overflow-hidden" style={{ minHeight: '340px' }}>
          {/* SVG Map with fly-in animation */}
          <svg
            viewBox={getViewBox()}
            className="w-full h-auto transition-all duration-1000 ease-out"
            style={{ minHeight: '320px' }}
          >
            {/* Definitions */}
            <defs>
              <radialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#1e3a5f" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#070b14" stopOpacity="0" />
              </radialGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="0.5" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* Ocean/Background */}
            <rect x="0" y="0" width="100" height="100" fill="#070b14" />
            <circle cx="50" cy="50" r="45" fill="url(#mapGlow)" />

            {/* Sarawak landmass */}
            <path
              d="M5 88 Q8 78 12 72 L18 68 Q28 62 35 58 L45 52 Q55 44 65 38 L75 28 Q85 20 94 16 L97 22 Q94 32 88 42 L82 52 Q76 60 70 65 L60 70 Q50 74 40 78 L28 82 Q18 86 10 88 L5 88 Z"
              fill="#111827"
              stroke="#1e3a5f"
              strokeWidth="0.3"
            />

            {/* Connection lines - network backbone */}
            <g stroke="#3b82f6" strokeWidth="0.2" opacity="0.3">
              <line x1="18" y1="78" x2="45" y2="55" />
              <line x1="45" y1="55" x2="60" y2="40" />
              <line x1="60" y1="40" x2="78" y2="22" />
            </g>

            {/* Division nodes and labels */}
            {Object.entries(DIVISIONS).map(([key, division]) => {
              const isSelected = selectedDivision === key;
              const isMiri = key === 'miri';

              return (
                <g key={key} className="cursor-pointer" onClick={() => handleDivisionClick(key)}>
                  {/* Selection ring */}
                  {isSelected && (
                    <circle
                      cx={division.position.x}
                      cy={division.position.y}
                      r={isZoomed ? 8 : 6}
                      fill="none"
                      stroke={division.color}
                      strokeWidth="0.3"
                      opacity="0.6"
                      strokeDasharray="1 1"
                    />
                  )}

                  {/* Node dot */}
                  <circle
                    cx={division.position.x}
                    cy={division.position.y}
                    r={isSelected ? 3 : 2.5}
                    fill={division.color}
                    filter={isMiri && flyInComplete ? 'url(#glow)' : undefined}
                    className="transition-all duration-300"
                  />

                  {/* Inner highlight */}
                  <circle
                    cx={division.position.x}
                    cy={division.position.y}
                    r="1"
                    fill="white"
                    opacity="0.5"
                  />

                  {/* Division label - always visible */}
                  <text
                    x={division.position.x}
                    y={division.position.y - 5}
                    textAnchor="middle"
                    fill={isSelected ? '#ffffff' : '#94a3b8'}
                    fontSize={isZoomed ? '2.5' : '3'}
                    fontWeight="600"
                    className="pointer-events-none select-none"
                  >
                    {division.shortName}
                  </text>

                  {/* Hospital labels - Professional white boxes, only when zoomed */}
                  {isZoomed && isSelected && division.hospitals.map((hospital, idx) => {
                    // Spread hospitals around the center point
                    const angle = (idx / division.hospitals.length) * Math.PI * 2 - Math.PI / 2;
                    const radius = 12 + (idx % 2) * 4;
                    const hx = division.position.x + Math.cos(angle) * radius;
                    const hy = division.position.y + Math.sin(angle) * radius;

                    return (
                      <g key={idx} className="transition-all duration-500" style={{ opacity: flyInComplete ? 1 : 0 }}>
                        {/* Connection line to center */}
                        <line
                          x1={division.position.x}
                          y1={division.position.y}
                          x2={hx}
                          y2={hy}
                          stroke={division.color}
                          strokeWidth="0.15"
                          opacity="0.4"
                        />

                        {/* Hospital marker dot */}
                        <circle
                          cx={hx}
                          cy={hy}
                          r="1"
                          fill={division.color}
                        />

                        {/* Professional white label box */}
                        <rect
                          x={hx - 8}
                          y={hy + 1.5}
                          width="16"
                          height="3"
                          rx="0.5"
                          fill="rgba(255,255,255,0.95)"
                          className="drop-shadow-sm"
                        />
                        <text
                          x={hx}
                          y={hy + 3.5}
                          textAnchor="middle"
                          fill="#0f172a"
                          fontSize="1.5"
                          fontWeight="600"
                          className="pointer-events-none select-none"
                        >
                          {hospital.name}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>

          {/* Fixed Sidebar - Bottom Left Overlay */}
          <div className="absolute bottom-3 left-3 flex flex-col gap-2">
            {/* Regional Integrity */}
            <div className="bg-[#070b14]/90 backdrop-blur-sm border border-emerald-500/30 rounded-lg px-3 py-2 min-w-[140px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-[10px] uppercase tracking-wider">Regional Integrity</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              </div>
              <p className="text-xl font-black text-emerald-400">100%</p>
            </div>

            {/* Fraud Prevention */}
            <div className="bg-[#070b14]/90 backdrop-blur-sm border border-amber-500/30 rounded-lg px-3 py-2">
              <span className="text-slate-500 text-[10px] uppercase tracking-wider">Fraud Prevention</span>
              <p className="text-xl font-black text-amber-400">RM 2.07B</p>
            </div>

            {/* Active Nodes */}
            <div className="bg-[#070b14]/90 backdrop-blur-sm border border-blue-500/30 rounded-lg px-3 py-2">
              <span className="text-slate-500 text-[10px] uppercase tracking-wider">Active Nodes</span>
              <p className="text-xl font-black text-blue-400">24</p>
            </div>
          </div>

          {/* Security badge - Bottom Right */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 bg-[#070b14]/90 backdrop-blur-sm border border-cyan-500/30 rounded-lg">
            <svg className="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-cyan-400 text-[10px] font-bold">AES-256-GCM</span>
          </div>

          {/* Division quick-select - Top */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {Object.entries(DIVISIONS).map(([key, division]) => (
              <button
                key={key}
                onClick={() => handleDivisionClick(key)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all ${
                  selectedDivision === key
                    ? 'bg-white/15 border border-white/30 text-white'
                    : 'bg-black/40 border border-white/10 text-slate-400 hover:bg-white/10'
                }`}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: division.color }}></div>
                {division.shortName}
              </button>
            ))}
          </div>
        </div>

        {/* Hospital detail panel - appears below map when zoomed */}
        {isZoomed && activeData && (
          <div className="mt-3 bg-[#070b14] rounded-xl border border-white/10 overflow-hidden">
            <div className="p-2.5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeData.color }}></div>
                <span className="text-white font-semibold text-sm">{activeData.name}</span>
                <span className="text-slate-500 text-xs">• {activeData.hospitals.length} hospitals</span>
              </div>
              <span className="text-emerald-400 text-xs font-semibold">All Verified</span>
            </div>

            {/* Compact hospital grid - iPhone optimized */}
            <div className="p-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {activeData.hospitals.map((hospital, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 bg-white/[0.03] border border-white/5 rounded-lg hover:bg-white/[0.06] active:scale-[0.98] transition-all"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></div>
                  <div className="min-w-0">
                    <p className="text-white text-xs font-medium truncate">{hospital.name}</p>
                    <p className="text-slate-500 text-[10px]">{hospital.beds} beds</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
