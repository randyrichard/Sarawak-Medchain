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

          {/* Network total stats row — visible at-a-glance data density */}
          {isProtected && (() => {
            const allHospitals = Object.values(DIVISIONS).flatMap(d => d.hospitals);
            const govCount = allHospitals.filter(h => h.type === 'Government').length;
            const privCount = allHospitals.filter(h => h.type === 'Private').length;
            const totalBeds = allHospitals.reduce((s, h) => s + h.beds, 0);
            return (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                padding: '12px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                marginBottom: '4px',
              }}>
                <div style={{ textAlign: 'center', padding: '4px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px 0' }}>Divisions</p>
                  <p style={{ fontSize: '22px', fontWeight: 700, color: '#1E293B', margin: 0, lineHeight: 1 }}>{Object.keys(DIVISIONS).length}</p>
                </div>
                <div style={{ textAlign: 'center', padding: '4px', borderLeft: '1px solid #F1F5F9' }}>
                  <p style={{ fontSize: '10px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px 0' }}>Hospitals</p>
                  <p style={{ fontSize: '22px', fontWeight: 700, color: '#1E293B', margin: 0, lineHeight: 1 }}>{allHospitals.length}</p>
                </div>
                <div style={{ textAlign: 'center', padding: '4px', borderLeft: '1px solid #F1F5F9' }}>
                  <p style={{ fontSize: '10px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px 0' }}>Govt / Private</p>
                  <p style={{ fontSize: '15px', fontWeight: 700, margin: 0, lineHeight: 1 }}>
                    <span style={{ color: '#0F2A5C' }}>{govCount}</span>
                    <span style={{ color: '#CBD5E1', margin: '0 4px' }}>/</span>
                    <span style={{ color: '#0F766E' }}>{privCount}</span>
                  </p>
                </div>
                <div style={{ textAlign: 'center', padding: '4px', borderLeft: '1px solid #F1F5F9' }}>
                  <p style={{ fontSize: '10px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px 0' }}>Total Beds</p>
                  <p style={{ fontSize: '22px', fontWeight: 700, color: '#1E293B', margin: 0, lineHeight: 1 }}>{totalBeds.toLocaleString()}</p>
                </div>
              </div>
            );
          })()}

          {/* Clear selection button — when a division is active */}
          {isZoomed && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={() => { setSelectedDivision(null); setIsZoomed(false); }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#64748B',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#1E293B'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#64748B'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear Selection — Show All Divisions
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

            {/* Subtle grid for geographic feel */}
            {isProtected && (
              <g opacity="0.06">
                {[10, 25, 40, 55, 70, 85].map(v => (
                  <line key={`h${v}`} x1="0" y1={v} x2="100" y2={v} stroke="#14b8a6" strokeWidth="0.15" />
                ))}
                {[10, 25, 40, 55, 70, 85].map(v => (
                  <line key={`v${v}`} x1={v} y1="0" x2={v} y2="100" stroke="#14b8a6" strokeWidth="0.15" />
                ))}
              </g>
            )}

            {/* Subtle radial center glow — atmosphere */}
            <circle cx="50" cy="50" r="50" fill="url(#mapGlow)" opacity="0.5" />

            {/* SARAWAK SILHOUETTE — simplified outline of NW Borneo coastline.
                Long banana shape hugging the South China Sea coast (SW to NE),
                with Brunei carve-out implied near Miri. */}
            <path
              d="M 3 86
                 Q 4 92 14 93
                 L 32 92
                 Q 50 89 64 80
                 L 78 65
                 Q 90 48 96 28
                 Q 98 18 95 12
                 L 90 9
                 Q 80 11 72 18
                 L 66 24
                 Q 58 28 50 30
                 L 42 33
                 Q 32 39 24 46
                 L 16 56
                 Q 8 66 4 76
                 Q 2 82 3 86 Z"
              fill={isProtected ? 'rgba(20, 184, 166, 0.08)' : 'rgba(239, 68, 68, 0.08)'}
              stroke={isProtected ? 'rgba(20, 184, 166, 0.5)' : 'rgba(239, 68, 68, 0.5)'}
              strokeWidth="0.45"
              style={{
                filter: isProtected ? 'drop-shadow(0 0 8px rgba(20,184,166,0.3))' : 'none',
                transition: 'all 0.5s ease',
              }}
            />

            {/* Small "Brunei" carve indicator — implies real geography */}
            {isProtected && (
              <g opacity="0.45" className="pointer-events-none">
                <circle cx="82" cy="13" r="2.2" fill="rgba(15, 23, 42, 0.7)" stroke="rgba(20, 184, 166, 0.3)" strokeWidth="0.3" />
                <text x="82" y="14" textAnchor="middle" fontSize="1.4" fontWeight="500" fill="rgba(148, 163, 184, 0.8)" style={{ userSelect: 'none' }}>BN</text>
              </g>
            )}

            {/* Subtle coast label */}
            {isProtected && (
              <text
                x="50"
                y="6"
                textAnchor="middle"
                fontSize="1.6"
                fontWeight="500"
                fill="rgba(148, 163, 184, 0.4)"
                style={{ letterSpacing: '0.18em', userSelect: 'none' }}
                className="pointer-events-none"
              >
                SOUTH CHINA SEA
              </text>
            )}

            {/* Fraud hotspots overlay (only in fraud mode) */}
            {!isProtected && FRAUD_HOTSPOTS.map((spot, idx) => (
              <circle key={idx} cx={spot.x} cy={spot.y} r={spot.r} fill="url(#fraudHeat)" opacity={spot.intensity} className="animate-pulse" />
            ))}

            {/* 4 division markers — clean dots with hover/active states */}
            {Object.entries(DIVISIONS).map(([key, division]) => {
              const isSelected = selectedDivision === key;
              const dotColor = isProtected ? '#14b8a6' : '#ef4444';
              return (
                <g
                  key={key}
                  className="cursor-pointer"
                  onClick={() => handleDivisionClick(key)}
                  style={{ transition: 'all 0.2s ease' }}
                >
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

                  {/* Hospital count badge — small pill near dot */}
                  {isProtected && (
                    <g className="pointer-events-none">
                      <rect
                        x={division.position.x + 3}
                        y={division.position.y - 2.5}
                        width="6"
                        height="3.2"
                        rx="1.6"
                        fill={isSelected ? '#14b8a6' : 'rgba(20, 184, 166, 0.18)'}
                        stroke={isSelected ? '#FFFFFF' : 'rgba(20, 184, 166, 0.5)'}
                        strokeWidth="0.15"
                      />
                      <text
                        x={division.position.x + 6}
                        y={division.position.y - 0.2}
                        textAnchor="middle"
                        fill={isSelected ? '#FFFFFF' : '#14b8a6'}
                        fontSize="2.2"
                        fontWeight="700"
                        style={{ userSelect: 'none' }}
                      >
                        {division.hospitals.length}
                      </text>
                    </g>
                  )}
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

        {/* Hospital detail panel — institutional design with type pills */}
        {isZoomed && activeData && isProtected && (
          <div style={{
            marginTop: '16px',
            background: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            {/* Panel header with summary */}
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid #E2E8F0',
              background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
                    Selected Division
                  </p>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1E293B', margin: '2px 0 0 0' }}>{activeData.name}</h3>
                </div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '4px 10px', borderRadius: '9999px',
                  background: '#F0FDF4', border: '1px solid #BBF7D0',
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                  <span style={{ color: '#047857', fontSize: '11px', fontWeight: 600 }}>100% Integrity</span>
                </div>
              </div>
              {/* Counts row */}
              <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Hospitals</span>
                  <p style={{ fontSize: '18px', fontWeight: 700, color: '#1E293B', margin: 0, lineHeight: 1.1 }}>{activeData.hospitals.length}</p>
                </div>
                <div style={{ width: '1px', background: '#E2E8F0' }} />
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Government</span>
                  <p style={{ fontSize: '18px', fontWeight: 700, color: '#0F2A5C', margin: 0, lineHeight: 1.1 }}>
                    {activeData.hospitals.filter(h => h.type === 'Government').length}
                  </p>
                </div>
                <div style={{ width: '1px', background: '#E2E8F0' }} />
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Private</span>
                  <p style={{ fontSize: '18px', fontWeight: 700, color: '#0F766E', margin: 0, lineHeight: 1.1 }}>
                    {activeData.hospitals.filter(h => h.type === 'Private').length}
                  </p>
                </div>
                <div style={{ width: '1px', background: '#E2E8F0' }} />
                <div>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Total beds</span>
                  <p style={{ fontSize: '18px', fontWeight: 700, color: '#1E293B', margin: 0, lineHeight: 1.1 }}>
                    {activeData.hospitals.reduce((s, h) => s + h.beds, 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Hospital cards grid */}
            <div style={{ padding: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
              {activeData.hospitals.map((hospital, index) => {
                const isGov = hospital.type === 'Government';
                return (
                  <div
                    key={index}
                    style={{
                      padding: '12px 14px',
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '10px',
                      transition: 'all 0.2s ease',
                      cursor: 'default',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#CBD5E1';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#E2E8F0';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                      <p style={{ color: '#1E293B', fontSize: '13px', fontWeight: 600, margin: 0, lineHeight: 1.3 }}>{hospital.name}</p>
                      <span style={{
                        flexShrink: 0,
                        fontSize: '9px',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        padding: '2px 7px',
                        borderRadius: '9999px',
                        background: isGov ? 'rgba(15, 42, 92, 0.08)' : 'rgba(15, 118, 110, 0.1)',
                        color: isGov ? '#0F2A5C' : '#0F766E',
                        border: isGov ? '1px solid rgba(15, 42, 92, 0.15)' : '1px solid rgba(15, 118, 110, 0.2)',
                        textTransform: 'uppercase',
                      }}>
                        {isGov ? 'GOVT' : 'Private'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      <p style={{ color: '#64748B', fontSize: '11px', margin: 0 }}>{hospital.beds} beds</p>
                    </div>
                  </div>
                );
              })}
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
