import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, ZoomOut } from 'lucide-react';

// Sarawak divisions with hospitals - Miri first for default focus
const DIVISIONS = {
  miri: {
    name: 'Miri Division',
    shortName: 'Miri',
    color: '#f59e0b',
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
    color: '#3b82f6',
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
    color: '#8b5cf6',
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
    color: '#10b981',
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

// Fraud hotspot positions for red heatmap overlay
const FRAUD_HOTSPOTS = [
  { x: 20, y: 75, r: 12, intensity: 0.8 },
  { x: 15, y: 80, r: 8, intensity: 0.6 },
  { x: 25, y: 70, r: 6, intensity: 0.5 },
  { x: 75, y: 25, r: 10, intensity: 0.7 },
  { x: 80, y: 20, r: 7, intensity: 0.5 },
  { x: 45, y: 55, r: 8, intensity: 0.6 },
  { x: 60, y: 40, r: 6, intensity: 0.5 },
];

const triggerHaptic = () => {
  if ('vibrate' in navigator) {
    navigator.vibrate(50);
  }
};

const LANDING_PAGE_URL = 'https://sarawak-medchain.vercel.app';


export default function SarawakReadinessMap() {
  const [selectedDivision, setSelectedDivision] = useState(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [flyInComplete, setFlyInComplete] = useState(false);
  const [scanLineY, setScanLineY] = useState(0);
  const [isProtected, setIsProtected] = useState(true);

  useEffect(() => {
    const flyInTimer = setTimeout(() => {
      setSelectedDivision('miri');
      setIsZoomed(true);
      setFlyInComplete(true);
    }, 800);
    return () => clearTimeout(flyInTimer);
  }, []);

  useEffect(() => {
    if (!isProtected) return;
    const scanInterval = setInterval(() => {
      setScanLineY(prev => (prev + 1) % 100);
    }, 50);
    return () => clearInterval(scanInterval);
  }, [isProtected]);

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

  const handleToggle = () => {
    triggerHaptic();
    setIsProtected(!isProtected);
  };

  // Single static viewBox — no more zoom-and-fly-out chaos.
  // The selected division is highlighted; hospital details live in the
  // clean panel below the map, not as overlapping SVG labels.
  const getViewBox = () => '0 0 100 100';

  return (
    <div style={{
      borderRadius: '24px',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
      background: isProtected ? '#F8FAFC' : '#FEF2F2',
      border: isProtected ? '1px solid #E2E8F0' : '1px solid #FECACA',
      transition: 'all 0.5s ease',
    }}>
      {/* Security scanning grid overlay */}
      {isProtected && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.03,
            backgroundImage: `
              linear-gradient(rgba(15, 118, 110, 0.8) 1px, transparent 1px),
              linear-gradient(90deg, rgba(15, 118, 110, 0.8) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px',
          }} />
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: '1px',
            background: 'linear-gradient(to right, transparent, rgba(15, 118, 110, 0.3), transparent)',
            top: `${scanLineY}%`,
            transition: 'top 0.05s linear',
          }} />
        </div>
      )}

      {/* Top accent bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '3px',
        background: isProtected
          ? 'linear-gradient(to right, #0F766E, #10B981, #0F766E)'
          : 'linear-gradient(to right, #EF4444, #F87171, #EF4444)',
        opacity: 0.6,
        transition: 'all 0.5s ease',
      }} />

      <div style={{ position: 'relative' }}>
        {/* Header with Impact Toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px',
              background: isProtected
                ? 'linear-gradient(135deg, #0F766E, #10B981)'
                : 'linear-gradient(135deg, #EF4444, #F87171)',
              boxShadow: isProtected
                ? '0 4px 14px rgba(15, 118, 110, 0.25)'
                : '0 4px 14px rgba(239, 68, 68, 0.25)',
              transition: 'all 0.5s ease',
            }}>
              {isProtected
                ? <Shield size={24} color="white" />
                : <AlertTriangle size={24} color="white" />
              }
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>
              Sarawak Health Infrastructure
            </h2>
            <p style={{
              fontSize: '14px',
              color: isProtected ? '#0F766E' : '#EF4444',
              transition: 'color 0.5s ease',
            }}>
              {isProtected ? 'AES-256-GCM Protected Network' : 'Unprotected - Fraud Vulnerable'}
            </p>
          </div>

          {/* Impact Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px',
              borderRadius: '9999px',
              background: isProtected ? '#F0FDF4' : '#FEF2F2',
              border: isProtected ? '1px solid #BBF7D0' : '1px solid #FECACA',
              transition: 'all 0.3s ease',
            }}>
              <button
                onClick={handleToggle}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  background: !isProtected ? '#EF4444' : 'transparent',
                  color: !isProtected ? 'white' : '#94A3B8',
                }}
              >
                <AlertTriangle size={14} />
                Fraud Impact
              </button>
              <button
                onClick={handleToggle}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  background: isProtected ? '#10B981' : 'transparent',
                  color: isProtected ? 'white' : '#94A3B8',
                }}
              >
                <Shield size={14} />
                MedChain Protected
              </button>
            </div>
          </div>

          {/* Zoom out button */}
          {isZoomed && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={() => { setSelectedDivision(null); setIsZoomed(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  background: '#F1F5F9',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#64748B',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <ZoomOut size={14} />
                Zoom Out
              </button>
            </div>
          )}
        </div>

        {/* Map Container */}
        <div style={{
          position: 'relative',
          borderRadius: '16px',
          overflow: 'hidden',
          background: isProtected ? '#0F172A' : '#1C0505',
          border: isProtected ? '1px solid #1E293B' : '1px solid rgba(239, 68, 68, 0.3)',
          minHeight: '340px',
          transition: 'all 0.5s ease',
        }}>
          <svg
            viewBox={getViewBox()}
            style={{ width: '100%', height: 'auto', minHeight: '320px', transition: 'all 1s ease-out' }}
          >
            <defs>
              <radialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={isProtected ? "#1e3a5f" : "#5f1e1e"} stopOpacity="0.4" />
                <stop offset="100%" stopColor="#070b14" stopOpacity="0" />
              </radialGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="0.5" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <radialGradient id="fraudHeat">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.6" />
                <stop offset="50%" stopColor="#ef4444" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="sarawakFill" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(20, 184, 166, 0.15)" />
                <stop offset="50%" stopColor="rgba(20, 184, 166, 0.08)" />
                <stop offset="100%" stopColor="rgba(20, 184, 166, 0.12)" />
              </linearGradient>
            </defs>

            <rect x="0" y="0" width="100" height="100" fill={isProtected ? "#0F172A" : "#0a0505"} />

            {/* Subtle radial center glow — atmosphere only, no decorative shape */}
            <circle cx="50" cy="50" r="50" fill="url(#mapGlow)" opacity="0.6" />

            {/* Fraud hotspots overlay (only in fraud mode) */}
            {!isProtected && FRAUD_HOTSPOTS.map((spot, idx) => (
              <circle key={idx} cx={spot.x} cy={spot.y} r={spot.r} fill="url(#fraudHeat)" opacity={spot.intensity} className="animate-pulse" />
            ))}

            {/* 4 division markers — clean dots, no overlapping labels */}
            {Object.entries(DIVISIONS).map(([key, division]) => {
              const isSelected = selectedDivision === key;
              const dotColor = isProtected ? '#14b8a6' : '#ef4444';
              return (
                <g key={key} className="cursor-pointer" onClick={() => handleDivisionClick(key)}>
                  {/* Selection ring */}
                  {isSelected && isProtected && (
                    <circle
                      cx={division.position.x}
                      cy={division.position.y}
                      r="6"
                      fill="none"
                      stroke="#14b8a6"
                      strokeWidth="0.4"
                      opacity="0.5"
                    />
                  )}

                  {/* Outer halo */}
                  <circle
                    cx={division.position.x}
                    cy={division.position.y}
                    r={isSelected ? 4 : 3}
                    fill={dotColor}
                    opacity={isSelected ? 0.25 : 0.15}
                  />

                  {/* Main dot */}
                  <circle
                    cx={division.position.x}
                    cy={division.position.y}
                    r={isSelected ? 1.8 : 1.4}
                    fill={dotColor}
                    style={{ filter: isProtected ? 'drop-shadow(0 0 3px rgba(20,184,166,0.7))' : 'none' }}
                  />

                  {/* Inner highlight (white center pip) */}
                  <circle
                    cx={division.position.x}
                    cy={division.position.y}
                    r="0.5"
                    fill="white"
                    opacity={isSelected ? 0.95 : 0.7}
                  />

                  {/* City label — small, never overlaps */}
                  <text
                    x={division.position.x}
                    y={division.position.y - 5}
                    textAnchor="middle"
                    fill={isSelected ? '#FFFFFF' : '#94a3b8'}
                    fontSize="2.6"
                    fontWeight="600"
                    style={{ letterSpacing: '0.05em', userSelect: 'none' }}
                    className="pointer-events-none"
                  >
                    {division.shortName.toUpperCase()}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Bottom Left Stats */}
          <div style={{ position: 'absolute', bottom: '12px', left: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{
              backdropFilter: 'blur(8px)',
              borderRadius: '8px',
              padding: '8px 12px',
              minWidth: '140px',
              background: isProtected ? 'rgba(7, 11, 20, 0.9)' : 'rgba(10, 5, 5, 0.9)',
              border: isProtected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              transition: 'all 0.5s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#94A3B8', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {isProtected ? 'Regional Integrity' : 'Fraud Exposure'}
                </span>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isProtected ? '#10B981' : '#EF4444' }} />
              </div>
              <p style={{ fontSize: '20px', fontWeight: 900, color: isProtected ? '#10B981' : '#EF4444', margin: 0 }}>
                {isProtected ? '100%' : 'HIGH'}
              </p>
            </div>

            <div style={{
              backdropFilter: 'blur(8px)',
              borderRadius: '8px',
              padding: '8px 12px',
              background: isProtected ? 'rgba(7, 11, 20, 0.9)' : 'rgba(10, 5, 5, 0.9)',
              border: isProtected ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              transition: 'all 0.5s ease',
            }}>
              <span style={{ color: '#94A3B8', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {isProtected ? 'Fraud Prevention' : 'Annual Loss'}
              </span>
              <p style={{ fontSize: '18px', fontWeight: 900, color: isProtected ? '#F59E0B' : '#EF4444', margin: 0 }}>
                {isProtected ? 'RM 2.07B' : 'RM 2.3B'}
              </p>
            </div>

            <div style={{
              backdropFilter: 'blur(8px)',
              borderRadius: '8px',
              padding: '8px 12px',
              background: isProtected ? 'rgba(7, 11, 20, 0.9)' : 'rgba(10, 5, 5, 0.9)',
              border: isProtected ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              transition: 'all 0.5s ease',
            }}>
              <span style={{ color: '#94A3B8', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {isProtected ? 'Active Nodes' : 'Vulnerable Nodes'}
              </span>
              <p style={{ fontSize: '20px', fontWeight: 900, color: isProtected ? '#3B82F6' : '#EF4444', margin: 0 }}>
                24
              </p>
            </div>
          </div>

          {/* Security badge - Bottom Right */}
          <div style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            backdropFilter: 'blur(8px)',
            borderRadius: '8px',
            background: isProtected ? 'rgba(7, 11, 20, 0.9)' : 'rgba(10, 5, 5, 0.9)',
            border: isProtected ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
            transition: 'all 0.5s ease',
          }}>
            <svg style={{ width: '12px', height: '12px', color: isProtected ? '#06B6D4' : '#EF4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span style={{ fontSize: '10px', fontWeight: 700, color: isProtected ? '#06B6D4' : '#EF4444' }}>
              {isProtected ? 'AES-256-GCM' : 'UNENCRYPTED'}
            </span>
          </div>

          {/* Division quick-select - Top */}
          <div style={{ position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '6px' }}>
            {Object.entries(DIVISIONS).map(([key, division]) => (
              <button
                key={key}
                onClick={() => handleDivisionClick(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  background: selectedDivision === key ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.4)',
                  border: selectedDivision === key ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.1)',
                  color: selectedDivision === key ? 'white' : '#94A3B8',
                }}
              >
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isProtected ? '#10B981' : '#EF4444', transition: 'background 0.5s ease' }} />
                {division.shortName}
              </button>
            ))}
          </div>
        </div>

        {/* Hospital detail panel */}
        {isZoomed && activeData && isProtected && (
          <div style={{
            marginTop: '12px',
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 12px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAFC',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10B981' }} />
                <span style={{ color: '#1E293B', fontWeight: 600, fontSize: '14px' }}>{activeData.name}</span>
                <span style={{ color: '#94A3B8', fontSize: '12px' }}>- {activeData.hospitals.length} hospitals</span>
              </div>
              <span style={{ color: '#059669', fontSize: '12px', fontWeight: 600 }}>100% Integrity</span>
            </div>

            <div style={{ padding: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
              {activeData.hospitals.map((hospital, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px',
                    background: '#F8FAFC',
                    border: '1px solid #F1F5F9',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ color: '#1E293B', fontSize: '12px', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hospital.name}</p>
                    <p style={{ color: '#94A3B8', fontSize: '10px', margin: 0 }}>{hospital.beds} beds</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fraud warning panel */}
        {!isProtected && (
          <div style={{
            marginTop: '12px',
            background: '#FEF2F2',
            borderRadius: '12px',
            border: '1px solid #FECACA',
            padding: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', background: '#FEE2E2', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={20} style={{ color: '#EF4444' }} />
              </div>
              <div>
                <p style={{ color: '#DC2626', fontWeight: 700, fontSize: '14px', margin: 0 }}>Malaysia loses RM 2.3 Billion annually</p>
                <p style={{ color: '#F87171', fontSize: '12px', margin: '4px 0 0 0' }}>Fake MCs, unverified records, zero audit trail</p>
              </div>
            </div>
            <button
              onClick={handleToggle}
              style={{
                marginTop: '12px',
                width: '100%',
                padding: '10px',
                background: '#10B981',
                color: 'white',
                fontWeight: 700,
                fontSize: '14px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              Activate MedChain Protection
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
