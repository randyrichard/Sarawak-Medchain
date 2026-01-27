import React from 'react';

// Consistent Card Component
export const Card = ({ children, className = '', glow = false, hover = true, style = {} }) => (
  <div
    className={`${className} ${hover ? 'card-hover' : ''}`}
    style={{
      background: 'rgba(15, 23, 42, 0.8)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(20, 184, 166, 0.3)',
      borderRadius: '16px',
      padding: '24px',
      boxShadow: glow ? '0 0 30px rgba(20, 184, 166, 0.15)' : '0 4px 20px rgba(0, 0, 0, 0.3)',
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
      background: disabled ? '#6b7280' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      border: 'none',
      borderRadius: '8px',
      padding: size === 'sm' ? '8px 16px' : size === 'lg' ? '16px 32px' : '12px 24px',
      color: disabled ? '#9ca3af' : '#000',
      fontWeight: '600',
      fontSize: size === 'sm' ? '13px' : size === 'lg' ? '16px' : '14px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.3s ease',
      width: fullWidth ? '100%' : 'auto',
      boxShadow: disabled ? 'none' : '0 4px 15px rgba(245, 158, 11, 0.3)',
      opacity: disabled ? 0.6 : 1,
      ...style,
    }}
    onMouseEnter={(e) => {
      if (!disabled) {
        e.target.style.transform = 'translateY(-2px)';
        e.target.style.boxShadow = '0 6px 20px rgba(245, 158, 11, 0.5)';
      }
    }}
    onMouseLeave={(e) => {
      if (!disabled) {
        e.target.style.transform = 'translateY(0)';
        e.target.style.boxShadow = '0 4px 15px rgba(245, 158, 11, 0.3)';
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

// Section Title
export const SectionTitle = ({ icon, title, subtitle, action }) => (
  <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
        {icon && <span style={{ color: '#14b8a6', fontSize: '20px' }}>{icon}</span>}
        <h2 style={{
          color: '#fff',
          fontSize: '20px',
          fontWeight: '700',
          margin: 0,
          letterSpacing: '-0.02em'
        }}>
          {title}
        </h2>
      </div>
      {subtitle && (
        <p style={{ color: '#64748b', fontSize: '14px', margin: 0, marginLeft: icon ? '32px' : 0 }}>
          {subtitle}
        </p>
      )}
    </div>
    {action && <div>{action}</div>}
  </div>
);

// Stat Display
export const StatCard = ({ label, value, subValue, color = '#14b8a6', icon }) => (
  <div style={{ textAlign: 'center' }}>
    {icon && <div style={{ marginBottom: '8px' }}>{icon}</div>}
    <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {label}
    </p>
    <p style={{ color: color, fontSize: '32px', fontWeight: '700', margin: 0, lineHeight: 1 }}>
      {value}
    </p>
    {subValue && (
      <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>{subValue}</p>
    )}
  </div>
);

// Status Badge
export const Badge = ({ status, pulse = false, color }) => {
  const colors = {
    active: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981', border: '#10b981' },
    live: { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444', border: '#ef4444' },
    standby: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b', border: '#f59e0b' },
    healthy: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981', border: '#10b981' },
    online: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981', border: '#10b981' },
    warning: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b', border: '#f59e0b' },
    error: { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444', border: '#ef4444' },
    teal: { bg: 'rgba(20, 184, 166, 0.2)', text: '#14b8a6', border: '#14b8a6' },
    purple: { bg: 'rgba(139, 92, 246, 0.2)', text: '#8b5cf6', border: '#8b5cf6' },
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

// Progress Bar
export const ProgressBar = ({ value, max = 100, color = '#14b8a6', height = 8, showLabel = false }) => {
  const percentage = Math.min((value / max) * 100, 100);

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          height: `${height}px`,
          background: 'rgba(255, 255, 255, 0.1)',
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
          <span style={{ fontSize: '12px', color: '#64748b' }}>{value}</span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>{max}</span>
        </div>
      )}
    </div>
  );
};

// Divider
export const Divider = ({ label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '24px 0' }}>
    <div style={{ flex: 1, height: '1px', background: 'rgba(20, 184, 166, 0.2)' }} />
    {label && (
      <span style={{ color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </span>
    )}
    <div style={{ flex: 1, height: '1px', background: 'rgba(20, 184, 166, 0.2)' }} />
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

// Export theme constants
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
    primary: '#0a0e14',
    card: 'rgba(15, 23, 42, 0.8)',
    elevated: 'rgba(15, 31, 56, 0.8)',
  },
  text: {
    primary: '#ffffff',
    secondary: '#94a3b8',
    muted: '#64748b',
  },
  border: {
    teal: 'rgba(20, 184, 166, 0.3)',
    subtle: 'rgba(255, 255, 255, 0.1)',
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
