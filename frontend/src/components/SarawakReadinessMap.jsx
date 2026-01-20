import { useState } from 'react';

// Sarawak divisions with hospitals and economic data
const DIVISIONS = {
  kuching: {
    name: 'Kuching',
    color: '#10b981',
    hospitals: [
      { name: 'Sarawak General Hospital', type: 'Government' },
      { name: 'KPJ Kuching Specialist', type: 'Private' },
      { name: 'Normah Medical Specialist', type: 'Private' },
      { name: 'Timberland Medical Centre', type: 'Private' },
      { name: 'Borneo Medical Centre', type: 'Private' },
    ],
    savings: 850000,
    position: { x: 15, y: 75 },
    labelOffset: { x: 0, y: 5 },
  },
  sriAman: {
    name: 'Sri Aman',
    color: '#06b6d4',
    hospitals: [
      { name: 'Sri Aman Hospital', type: 'Government' },
      { name: 'Betong Hospital', type: 'Government' },
      { name: 'Saratok Hospital', type: 'Government' },
    ],
    savings: 280000,
    position: { x: 28, y: 65 },
    labelOffset: { x: 0, y: 0 },
  },
  sibu: {
    name: 'Sibu',
    color: '#8b5cf6',
    hospitals: [
      { name: 'Sibu Hospital', type: 'Government' },
      { name: 'Rejang Medical Centre', type: 'Private' },
      { name: 'Selangau District Hospital', type: 'Government' },
      { name: 'Kapit Hospital', type: 'Government' },
      { name: 'Sarikei Hospital', type: 'Government' },
    ],
    savings: 620000,
    position: { x: 45, y: 55 },
    labelOffset: { x: 0, y: 0 },
  },
  mukah: {
    name: 'Mukah',
    color: '#f59e0b',
    hospitals: [
      { name: 'Mukah Hospital', type: 'Government' },
    ],
    savings: 180000,
    position: { x: 55, y: 40 },
    labelOffset: { x: 0, y: 0 },
  },
  bintulu: {
    name: 'Bintulu',
    color: '#ef4444',
    hospitals: [
      { name: 'Bintulu Hospital', type: 'Government' },
    ],
    savings: 420000,
    position: { x: 65, y: 35 },
    labelOffset: { x: 0, y: 0 },
  },
  miri: {
    name: 'Miri',
    color: '#ec4899',
    hospitals: [
      { name: 'Miri General Hospital', type: 'Government' },
      { name: 'Columbia Asia Miri', type: 'Private' },
      { name: 'KPJ Miri Specialist', type: 'Private' },
      { name: 'Marudi Hospital', type: 'Government' },
    ],
    savings: 720000,
    position: { x: 78, y: 20 },
    labelOffset: { x: 0, y: 5 },
  },
  limbang: {
    name: 'Limbang',
    color: '#14b8a6',
    hospitals: [
      { name: 'Limbang Hospital', type: 'Government' },
      { name: 'Lawas Hospital', type: 'Government' },
    ],
    savings: 190000,
    position: { x: 88, y: 12 },
    labelOffset: { x: 0, y: 5 },
  },
  samarahan: {
    name: 'Samarahan',
    color: '#6366f1',
    hospitals: [
      { name: 'Lundu Hospital', type: 'Government' },
      { name: 'Bau Hospital', type: 'Government' },
      { name: 'Serian Hospital', type: 'Government' },
    ],
    savings: 310000,
    position: { x: 20, y: 82 },
    labelOffset: { x: 0, y: 0 },
  },
};

// Calculate total savings
const TOTAL_SAVINGS = Object.values(DIVISIONS).reduce((sum, div) => sum + div.savings, 0);
const TOTAL_HOSPITALS = Object.values(DIVISIONS).reduce((sum, div) => sum + div.hospitals.length, 0);

export default function SarawakReadinessMap() {
  const [selectedDivision, setSelectedDivision] = useState(null);
  const [hoveredDivision, setHoveredDivision] = useState(null);

  const activeDivision = selectedDivision || hoveredDivision;
  const activeData = activeDivision ? DIVISIONS[activeDivision] : null;

  const handleDivisionClick = (divisionKey) => {
    setSelectedDivision(selectedDivision === divisionKey ? null : divisionKey);
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 via-[#0a1628] to-slate-900 rounded-3xl border border-cyan-500/20 p-6 relative overflow-hidden">
      {/* Background grid - GIS style */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(6, 182, 212, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6, 182, 212, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }} />
      </div>

      {/* Coordinate overlay effect */}
      <div className="absolute top-4 left-4 text-cyan-500/30 text-[10px] font-mono">
        LAT: 2.5°N - 5°N | LON: 109°E - 115°E
      </div>

      <div className="relative">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Sarawak Readiness Map</h2>
              <p className="text-cyan-400 text-sm">Tap a region to view hospital nodes</p>
            </div>
          </div>

          {/* Total Stats */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-2xl font-black text-white">{TOTAL_HOSPITALS}/24</p>
              <p className="text-cyan-400 text-xs font-semibold">Nodes Online</p>
            </div>
            <div className="w-px h-10 bg-cyan-500/30"></div>
            <div className="text-right">
              <p className="text-lg font-bold text-emerald-400">100%</p>
              <p className="text-slate-500 text-xs">Integrity</p>
            </div>
          </div>
        </div>

        {/* Map Container */}
        <div className="relative bg-[#0a1628] rounded-2xl border border-cyan-500/10 overflow-hidden" style={{ minHeight: '300px' }}>
          {/* Stylized Sarawak Map SVG */}
          <svg viewBox="0 0 100 100" className="w-full h-auto" style={{ minHeight: '280px' }}>
            {/* Ocean/Background */}
            <rect x="0" y="0" width="100" height="100" fill="#0a1628" />

            {/* Sarawak landmass - simplified shape */}
            <path
              d="M5 90 Q10 75 15 70 L25 65 Q35 60 40 55 L50 50 Q60 42 70 35 L80 25 Q88 18 95 15 L98 20 Q95 30 90 40 L85 50 Q80 58 75 62 L65 68 Q55 72 45 75 L35 80 Q25 85 15 88 L5 90 Z"
              fill="#1e293b"
              stroke="#334155"
              strokeWidth="0.5"
            />

            {/* Division regions - clickable */}
            {Object.entries(DIVISIONS).map(([key, division]) => (
              <g key={key}>
                {/* Division marker */}
                <circle
                  cx={division.position.x}
                  cy={division.position.y}
                  r={selectedDivision === key ? 6 : hoveredDivision === key ? 5 : 4}
                  fill={division.color}
                  opacity={selectedDivision === key ? 1 : 0.7}
                  className="cursor-pointer transition-all duration-300"
                  onClick={() => handleDivisionClick(key)}
                  onMouseEnter={() => setHoveredDivision(key)}
                  onMouseLeave={() => setHoveredDivision(null)}
                />

                {/* Pulse ring for selected */}
                {selectedDivision === key && (
                  <circle
                    cx={division.position.x}
                    cy={division.position.y}
                    r="8"
                    fill="none"
                    stroke={division.color}
                    strokeWidth="1"
                    opacity="0.5"
                    className="animate-ping"
                  />
                )}

                {/* Division label */}
                <text
                  x={division.position.x + division.labelOffset.x}
                  y={division.position.y + division.labelOffset.y - 8}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="3"
                  fontWeight="600"
                  className="pointer-events-none select-none"
                >
                  {division.name}
                </text>

                {/* Hospital count badge */}
                <text
                  x={division.position.x + 6}
                  y={division.position.y + 1}
                  fill="#ffffff"
                  fontSize="2.5"
                  fontWeight="bold"
                  className="pointer-events-none select-none"
                >
                  {division.hospitals.length}
                </text>
              </g>
            ))}

            {/* Connection lines between nodes */}
            <g stroke="#06b6d4" strokeWidth="0.3" opacity="0.3">
              <line x1="15" y1="75" x2="28" y2="65" />
              <line x1="28" y1="65" x2="45" y2="55" />
              <line x1="45" y1="55" x2="55" y2="40" />
              <line x1="55" y1="40" x2="65" y2="35" />
              <line x1="65" y1="35" x2="78" y2="20" />
              <line x1="78" y1="20" x2="88" y2="12" />
              <line x1="15" y1="75" x2="20" y2="82" />
            </g>
          </svg>

          {/* Economic Overlay Card - Floating */}
          <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-64">
            <div className="bg-slate-900/95 backdrop-blur-sm border border-cyan-500/30 rounded-xl p-4 shadow-lg shadow-cyan-500/10">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {activeData ? `${activeData.name} Division` : 'Regional Savings'}
                </span>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-emerald-400">
                  RM {((activeData?.savings || TOTAL_SAVINGS) / 1000).toFixed(0)}K
                </span>
                <span className="text-slate-500 text-xs">/year projected</span>
              </div>

              {activeData && (
                <div className="mt-2 pt-2 border-t border-slate-700">
                  <p className="text-slate-400 text-xs">
                    {activeData.hospitals.length} hospital{activeData.hospitals.length > 1 ? 's' : ''} • Fraud prevention savings
                  </p>
                </div>
              )}

              {!activeData && (
                <div className="mt-2 pt-2 border-t border-slate-700">
                  <p className="text-slate-400 text-xs">
                    Total across all 8 divisions • Tap region for details
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hospital List - Shows when division is selected */}
        {selectedDivision && activeData && (
          <div className="mt-4 bg-slate-800/50 rounded-xl border border-white/5 overflow-hidden">
            <div className="p-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeData.color }}></div>
                <span className="text-white font-semibold text-sm">{activeData.name} Division</span>
                <span className="text-slate-500 text-xs">({activeData.hospitals.length} nodes)</span>
              </div>
              <button
                onClick={() => setSelectedDivision(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                Close ✕
              </button>
            </div>

            {/* Scrollable hospital list - iPhone optimized */}
            <div
              className="max-h-48 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {activeData.hospitals.map((hospital, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border-b border-white/5 last:border-b-0 hover:bg-white/5 active:scale-[0.99] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{hospital.name}</p>
                      <p className="text-slate-500 text-xs">{hospital.type}</p>
                    </div>
                  </div>

                  {/* Link Active Status - steady, not glowing */}
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:block px-2 py-0.5 bg-slate-700 rounded text-[10px] font-bold text-slate-400">
                      AES-256
                    </span>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                      <span className="text-emerald-400 text-[10px] font-semibold">Link Active</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs">
          {Object.entries(DIVISIONS).slice(0, 4).map(([key, division]) => (
            <button
              key={key}
              onClick={() => handleDivisionClick(key)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all ${
                selectedDivision === key ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: division.color }}></div>
              <span className="text-slate-400">{division.name}</span>
            </button>
          ))}
          <span className="text-slate-600">+4 more</span>
        </div>
      </div>
    </div>
  );
}
