import React from 'react';

// Consistent Card Component - Light theme
export const Card = ({ children, className = '', glow = false, hover = true, style = {} }) => (
  <div
    className={`${className} ${hover ? 'card-hover' : ''}`}
    style={{
      background: '#FFFFFF',
      border: '1px solid #E2E8F0',
      borderRadius: '16px',
      padding: '24px',
      boxShadow: glow ? '0 0 30px rgba(20, 184, 166, 0.1)' : '0 1px 3px rgba(0, 0, 0, 0.08)',
      transition: 'all 0.3s ease',
      ...style,
    }}
  >
    {children}
  </div>
);

// Gold Action Button
export const GoldButton = ({ children, onClick, fullWidth = false, size = 'md', disabled = false, style = {} }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      background: disabled ? '#d1d5db' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      border: 'none',
      borderRadius: '8px',
      padding: size === 'sm' ? '8px 16px' : size === 'lg' ? '16px 32px' : '12px 24px',
      color: disabled ? '#9ca3af' : '#000',
      fontWeight: '600',
      fontSize: size === 'sm' ? '13px' : size === 'lg' ? '16px' : '14px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.3s ease',
      width: fullWidth ? '100%' : 'auto',
      boxShadow: disabled ? 'none' : '0 2px 8px rgba(245, 158, 11, 0.2)',
      opacity: disabled ? 0.6 : 1,
      ...style,
    }}
    onMouseEnter={(e) => {
      if (!disabled) {
        e.target.style.transform = 'translateY(-2px)';
        e.target.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.3)';
      }
    }}
    onMouseLeave={(e) => {
      if (!disabled) {
        e.target.style.transform = 'translateY(0)';
        e.target.style.boxShadow = '0 2px 8px rgba(245, 158, 11, 0.2)';
      }
    }}
  >
    {children}
  </button>
);

// Teal Secondary Button
export const TealButton = ({ children, onClick, fullWidth = false, disabled = false, style = {} }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      background: 'transparent',
      border: '1px solid #14b8a6',
      borderRadius: '8px',
      padding: '12px 24px',
      color: '#14b8a6',
      fontWeight: '600',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.3s ease',
      width: fullWidth ? '100%' : 'auto',
      opacity: disabled ? 0.5 : 1,
      ...style,
    }}
    onMouseEnter={(e) => {
      if (!disabled) {
        e.target.style.background = 'rgba(20, 184, 166, 0.1)';
        e.target.style.transform = 'translateY(-2px)';
      }
    }}
    onMouseLeave={(e) => {
      if (!disabled) {
        e.target.style.background = 'transparent';
        e.target.style.transform = 'translateY(0)';
      }
    }}
  >
    {children}
  </button>
);

// Section Title - Light theme
export const SectionTitle = ({ icon, title, subtitle, action }) => (
  <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
        {icon && <span style={{ color: '#14b8a6', fontSize: '20px' }}>{icon}</span>}
        <h2 style={{
          color: '#1E293B',
          fontSize: '20px',
          fontWeight: '700',
          margin: 0,
          letterSpacing: '-0.02em'
        }}>
          {title}
        </h2>
      </div>
      {subtitle && (
        <p style={{ color: '#64748B', fontSize: '14px', margin: 0, marginLeft: icon ? '32px' : 0 }}>
          {subtitle}
        </p>
      )}
    </div>
    {action && <div>{action}</div>}
  </div>
);

// Stat Display - Light theme
export const StatCard = ({ label, value, subValue, color = '#14b8a6', icon }) => (
  <div style={{ textAlign: 'center' }}>
    {icon && <div style={{ marginBottom: '8px' }}>{icon}</div>}
    <p style={{ color: '#64748B', fontSize: '12px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {label}
    </p>
    <p style={{ color: color, fontSize: '32px', fontWeight: '700', margin: 0, lineHeight: 1 }}>
      {value}
    </p>
    {subValue && (
      <p style={{ color: '#94A3B8', fontSize: '13px', marginTop: '4px' }}>{subValue}</p>
    )}
  </div>
);

// Status Badge - Light theme with lighter backgrounds
export const Badge = ({ status, pulse = false, color }) => {
  const colors = {
    active: { bg: 'rgba(16, 185, 129, 0.1)', text: '#059669', border: 'rgba(16, 185, 129, 0.3)' },
    live: { bg: 'rgba(239, 68, 68, 0.1)', text: '#dc2626', border: 'rgba(239, 68, 68, 0.3)' },
    standby: { bg: 'rgba(245, 158, 11, 0.1)', text: '#d97706', border: 'rgba(245, 158, 11, 0.3)' },
    healthy: { bg: 'rgba(16, 185, 129, 0.1)', text: '#059669', border: 'rgba(16, 185, 129, 0.3)' },
    online: { bg: 'rgba(16, 185, 129, 0.1)', text: '#059669', border: 'rgba(16, 185, 129, 0.3)' },
    warning: { bg: 'rgba(245, 158, 11, 0.1)', text: '#d97706', border: 'rgba(245, 158, 11, 0.3)' },
    error: { bg: 'rgba(239, 68, 68, 0.1)', text: '#dc2626', border: 'rgba(239, 68, 68, 0.3)' },
    teal: { bg: 'rgba(20, 184, 166, 0.1)', text: '#0d9488', border: 'rgba(20, 184, 166, 0.3)' },
    purple: { bg: 'rgba(139, 92, 246, 0.1)', text: '#7c3aed', border: 'rgba(139, 92, 246, 0.3)' },
  };

  const style = colors[status?.toLowerCase()] || colors[color] || colors.active;

  return (
    <span
      className={pulse ? 'live-indicator' : ''}
      style={{
        background: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
        padding: '4px 12px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      {pulse && <LiveDot color={style.text} />}
      {status}
    </span>
  );
};

// Live Indicator Dot
export const LiveDot = ({ color = '#ef4444', size = 8 }) => (
  <span
    className="live-indicator"
    style={{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: color,
      display: 'inline-block',
      boxShadow: `0 0 10px ${color}`,
    }}
  />
);

// Progress Bar - Light theme
export const ProgressBar = ({ value, max = 100, color = '#14b8a6', height = 8, showLabel = false }) => {
  const percentage = Math.min((value / max) * 100, 100);

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          height: `${height}px`,
          background: '#E2E8F0',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${color}, ${color}dd)`,
            borderRadius: '4px',
            transition: 'width 0.5s ease',
            boxShadow: `0 0 10px ${color}50`,
          }}
        />
      </div>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ fontSize: '12px', color: '#64748B' }}>{value}</span>
          <span style={{ fontSize: '12px', color: '#64748B' }}>{max}</span>
        </div>
      )}
    </div>
  );
};

// Divider - Light theme
export const Divider = ({ label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '24px 0' }}>
    <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
    {label && (
      <span style={{ color: '#64748B', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </span>
    )}
    <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
  </div>
);

// Icon Box
export const IconBox = ({ icon, color = '#14b8a6', size = 40 }) => (
  <div
    style={{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '12px',
      background: `${color}20`,
      border: `1px solid ${color}40`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: color,
    }}
  >
    {icon}
  </div>
);

// Export theme constants - Light theme
export const theme = {
  colors: {
    teal: '#14b8a6',
    gold: '#f59e0b',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    purple: '#8b5cf6',
    blue: '#3b82f6',
  },
  bg: {
    primary: '#FFFFFF',
    card: '#FFFFFF',
    elevated: '#F8FAFC',
  },
  text: {
    primary: '#1E293B',
    secondary: '#64748B',
    muted: '#94A3B8',
  },
  border: {
    teal: 'rgba(20, 184, 166, 0.3)',
    subtle: '#E2E8F0',
  },
};

export default {
  Card,
  GoldButton,
  TealButton,
  SectionTitle,
  StatCard,
  Badge,
  LiveDot,
  ProgressBar,
  Divider,
  IconBox,
  theme,
};
