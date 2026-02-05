import { useState, useEffect, useRef, useCallback, Component } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import SignatureCanvas from 'react-signature-canvas';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import toast from 'react-hot-toast';
import CommandBar from '../components/ui/CommandBar';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import { SkeletonStatCard, SkeletonChart, SkeletonTable, SkeletonCard } from '../components/ui/SkeletonLoader';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6: Error Boundary Component
// ═══════════════════════════════════════════════════════════════════════════
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Section Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <svg className="error-fallback-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="error-fallback-title">{this.props.fallbackTitle || 'Something went wrong'}</h3>
          <p className="error-fallback-message">{this.props.fallbackMessage || 'This section failed to load'}</p>
          <button className="error-fallback-button" onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Loading Skeleton Wrapper Component
const LoadingSection = ({ isLoading, variant = 'card', children, ...props }) => {
  if (isLoading) {
    switch (variant) {
      case 'stat':
        return <SkeletonStatCard {...props} />;
      case 'chart':
        return <SkeletonChart {...props} />;
      case 'table':
        return <SkeletonTable {...props} />;
      default:
        return <SkeletonCard {...props} />;
    }
  }
  return children;
};

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: ANIMATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

// Animation Variants for consistent motion
const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const fadeInScale = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  }
};

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] }
  }
};

// Slide in from right for notifications
const slideInRight = {
  hidden: { opacity: 0, x: 100 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 300, damping: 30 }
  },
  exit: {
    opacity: 0,
    x: 100,
    transition: { duration: 0.2 }
  }
};

// Pulse animation for live indicators
const pulseGlow = {
  animate: {
    boxShadow: [
      '0 0 0 0 rgba(0, 212, 170, 0.4)',
      '0 0 0 8px rgba(0, 212, 170, 0)',
    ],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeOut'
    }
  }
};

// Button tap effect
const buttonTap = {
  tap: { scale: 0.97 },
  hover: { scale: 1.02 }
};

// Enhanced Animated Number Component with better formatting
const AnimatedNumber = ({ value, prefix = '', suffix = '', duration = 1.2, decimals = 0 }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  useEffect(() => {
    if (!isInView || hasAnimated) return;

    const endValue = typeof value === 'number' ? value : parseFloat(value) || 0;
    const startTime = Date.now();
    const durationMs = duration * 1000;
    let animationFrame;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Smooth easing with bounce at end
      const easeOutBack = 1 - Math.pow(1 - progress, 3);
      const current = endValue * easeOutBack;

      setDisplayValue(current);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setHasAnimated(true);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration, isInView, hasAnimated]);

  const formatted = displayValue >= 1000
    ? Math.round(displayValue).toLocaleString()
    : decimals > 0
      ? displayValue.toFixed(decimals)
      : Math.round(displayValue).toString();

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {prefix}{formatted}{suffix}
    </motion.span>
  );
};

// Live Pulse Dot Component
const LivePulseDot = ({ color = '#00d4aa', size = 8 }) => (
  <motion.span
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      backgroundColor: color,
      display: 'inline-block',
    }}
    animate={{
      scale: [1, 1.2, 1],
      opacity: [1, 0.7, 1],
      boxShadow: [
        `0 0 0 0 ${color}66`,
        `0 0 0 ${size/2}px ${color}00`,
        `0 0 0 0 ${color}66`,
      ]
    }}
    transition={{
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut'
    }}
  />
);

// Animated Button Component
const AnimatedButton = ({ children, onClick, variant = 'primary', disabled = false, className = '', style = {} }) => {
  const variants = {
    primary: {
      bg: '#00d4aa',
      color: '#1E293B',
      hoverShadow: '0 4px 20px rgba(0, 212, 170, 0.4)',
    },
    secondary: {
      bg: '#7c5cff',
      color: '#ffffff',
      hoverShadow: '0 4px 20px rgba(124, 92, 255, 0.4)',
    },
    ghost: {
      bg: '#F8FAFC',
      color: '#64748B',
      hoverShadow: 'none',
    },
    danger: {
      bg: '#ef4444',
      color: '#ffffff',
      hoverShadow: '0 4px 20px rgba(239, 68, 68, 0.4)',
    }
  };

  const v = variants[variant] || variants.primary;

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={className}
      whileHover={{ scale: disabled ? 1 : 1.02, boxShadow: disabled ? 'none' : v.hoverShadow }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      transition={{ duration: 0.15 }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '10px 20px',
        borderRadius: '10px',
        fontSize: '13px',
        fontWeight: 600,
        border: variant === 'ghost' ? '1px solid #E2E8F0' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: disabled ? '#374151' : v.bg,
        color: disabled ? '#6b7280' : v.color,
        opacity: disabled ? 0.6 : 1,
        transition: 'background 0.2s, border-color 0.2s',
        ...style
      }}
    >
      {children}
    </motion.button>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ENTERPRISE DESIGN SYSTEM - Phase 2 Color Palette
// ═══════════════════════════════════════════════════════════════════════════
const theme = {
  // Background colors
  bg: '#FFFFFF',                                     // Light page background
  bgCard: '#FFFFFF',                                 // Card background
  bgCardGradient: '#FFFFFF',
  bgElevated: '#FFFFFF',
  bgHover: 'rgba(0, 212, 170, 0.05)',

  // Border colors
  border: '#E2E8F0',                                 // Light border
  borderHover: '#CBD5E1',
  borderAccent: 'rgba(0, 212, 170, 0.25)',
  borderPurple: 'rgba(124, 92, 255, 0.25)',

  // Text colors
  textPrimary: '#1E293B',                            // Primary text
  textSecondary: '#64748B',                          // Secondary text
  textMuted: '#94A3B8',                              // Muted/label text
  textWhite: '#ffffff',

  // Accent colors - Enterprise palette
  primary: '#00d4aa',                               // Cyan/teal - money, success, active
  accent: '#00d4aa',
  teal: '#00d4aa',
  success: '#00d4aa',
  secondary: '#7c5cff',                             // Purple - premium feel
  purple: '#7c5cff',
  warning: '#f59e0b',                               // Orange - warnings
  gold: '#f59e0b',
  danger: '#ef4444',                                // Red - errors
  blue: '#3b82f6',

  // Card styling constants
  cardRadius: '16px',
  cardPadding: '24px',
  cardShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
  cardShadowHover: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 20px rgba(0, 212, 170, 0.06)',
  cardBlur: 'blur(20px)',
  cardGlow: '0 0 20px rgba(0, 212, 170, 0.08)',

  // Transitions
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  transitionSlow: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPOGRAPHY COMPONENTS - Phase 2 Typography System
// ═══════════════════════════════════════════════════════════════════════════

// Display - For hero metrics (48px, 800 weight)
const TextDisplay = ({ children, color = theme.textPrimary, className = '' }) => (
  <span className={className} style={{
    fontSize: '48px',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
    color,
  }}>{children}</span>
);

// Headline - Section titles (24px, 700 weight)
const TextHeadline = ({ children, color = theme.textPrimary, className = '' }) => (
  <h2 className={className} style={{
    fontSize: '24px',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
    color,
    margin: 0,
  }}>{children}</h2>
);

// Title - Card headers (18px, 600 weight)
const TextTitle = ({ children, color = theme.textPrimary, className = '' }) => (
  <h3 className={className} style={{
    fontSize: '18px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    lineHeight: 1.3,
    color,
    margin: 0,
  }}>{children}</h3>
);

// Label - Uppercase small labels (11px, 600 weight)
const TextLabel = ({ children, color = theme.textMuted, className = '' }) => (
  <span className={className} style={{
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color,
  }}>{children}</span>
);

// Metric - Large numbers (32px, 800 weight)
const TextMetric = ({ children, color = theme.primary, className = '' }) => (
  <span className={className} style={{
    fontSize: '32px',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    lineHeight: 1,
    color,
  }}>{children}</span>
);

// Body - Regular text (14px, 400 weight)
const TextBody = ({ children, color = theme.textSecondary, className = '' }) => (
  <p className={className} style={{
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: 1.5,
    color,
    margin: 0,
  }}>{children}</p>
);

// Caption - Small muted text (12px)
const TextCaption = ({ children, color = theme.textMuted, className = '' }) => (
  <span className={className} style={{
    fontSize: '12px',
    fontWeight: 500,
    color,
  }}>{children}</span>
);

// ═══════════════════════════════════════════════════════════════════════════
// SECTION LABEL - Updated with Phase 2 Design
// ═══════════════════════════════════════════════════════════════════════════
const SectionLabel = ({ icon, text, subtitle }) => (
  <div style={{ marginBottom: '20px' }}>
    <div className="flex items-center gap-3">
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '12px',
          background: 'rgba(0, 212, 170, 0.1)',
          border: '1px solid rgba(0, 212, 170, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
        }}
      >
        {icon}
      </div>
      <div>
        <h3 style={{
          fontSize: '18px',
          fontWeight: 700,
          color: theme.textPrimary,
          margin: 0,
        }}>{text}</h3>
        {subtitle && (
          <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>{subtitle}</p>
        )}
      </div>
    </div>
  </div>
);

// Card Wrapper Component - CONSISTENT styling for ALL cards with animations
// ═══════════════════════════════════════════════════════════════════════════
// CARD WRAPPER - Enterprise Card Component with Phase 2 Design System
// ═══════════════════════════════════════════════════════════════════════════
const CardWrapper = ({ children, className = '', style = {}, glow = false, hover = true, delay = 0, variant = 'default' }) => {
  const variants = {
    default: {
      background: '#FFFFFF',
      border: `1px solid ${theme.border}`,
      boxShadow: theme.cardShadow,
    },
    elevated: {
      background: '#FFFFFF',
      border: `1px solid ${theme.borderAccent}`,
      boxShadow: `${theme.cardShadow}, 0 0 20px rgba(0, 212, 170, 0.05)`,
    },
    highlight: {
      background: 'linear-gradient(135deg, rgba(0, 212, 170, 0.05) 0%, #FFFFFF 100%)',
      border: '1px solid rgba(0, 212, 170, 0.3)',
      boxShadow: `${theme.cardShadow}, ${theme.cardGlow}`,
    },
    purple: {
      background: 'linear-gradient(135deg, rgba(124, 92, 255, 0.05) 0%, #FFFFFF 100%)',
      border: `1px solid ${theme.borderPurple}`,
      boxShadow: `${theme.cardShadow}, 0 0 20px rgba(124, 92, 255, 0.05)`,
    }
  };

  const currentVariant = variants[variant] || variants.default;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      whileHover={hover ? {
        y: -2,
        boxShadow: theme.cardShadowHover,
        borderColor: '#CBD5E1',
      } : {}}
      className={`card-hover ${className}`}
      style={{
        background: currentVariant.background,
        backdropFilter: theme.cardBlur,
        WebkitBackdropFilter: theme.cardBlur,
        border: glow ? '1px solid rgba(0, 212, 170, 0.35)' : currentVariant.border,
        borderRadius: theme.cardRadius,
        padding: theme.cardPadding,
        boxShadow: glow ? `${theme.cardShadow}, ${theme.cardGlow}` : currentVariant.boxShadow,
        transition: theme.transitionSlow,
        ...style
      }}
    >
      {children}
    </motion.div>
  );
};

// Stat Card Component - For KPI displays with proper hierarchy
// Stat Card Mini - Using Phase 2 Design System
const StatCardMini = ({ label, value, icon, color = theme.primary, subValue }) => (
  <motion.div
    whileHover={{ y: -2, boxShadow: theme.cardShadowHover }}
    transition={{ duration: 0.2 }}
    style={{
      background: theme.bgCardGradient,
      backdropFilter: theme.cardBlur,
      WebkitBackdropFilter: theme.cardBlur,
      border: `1px solid ${theme.border}`,
      borderRadius: '14px',
      padding: '18px',
      textAlign: 'center',
      boxShadow: theme.cardShadow,
      transition: theme.transition,
    }}
  >
    {icon && (
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: `${color}15`,
          border: `1px solid ${color}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px',
        }}
      >
        {icon}
      </div>
    )}
    <p style={{
      fontSize: '10px',
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: theme.textMuted,
      marginBottom: '8px',
    }}>{label}</p>
    <p style={{
      fontSize: '28px',
      fontWeight: 800,
      color: color,
      margin: 0,
      lineHeight: 1,
      letterSpacing: '-0.02em',
    }}>{value}</p>
    {subValue && (
      <p style={{ fontSize: '11px', color: theme.textSecondary, marginTop: '6px' }}>{subValue}</p>
    )}
  </motion.div>
);

// Gold Button Component
const GoldButton = ({ children, onClick, disabled = false, size = 'md', fullWidth = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      background: disabled ? '#6b7280' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      border: 'none',
      borderRadius: '8px',
      padding: size === 'sm' ? '8px 16px' : size === 'lg' ? '16px 32px' : '12px 24px',
      color: disabled ? '#9ca3af' : '#000',
      fontWeight: 600,
      fontSize: size === 'sm' ? '13px' : '14px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.3s ease',
      width: fullWidth ? '100%' : 'auto',
      boxShadow: disabled ? 'none' : '0 4px 15px rgba(245, 158, 11, 0.3)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
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

// Status Badge Component
const StatusBadge = ({ status, pulse = false }) => {
  const colors = {
    active: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981', border: '#10b981' },
    online: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981', border: '#10b981' },
    standby: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b', border: '#f59e0b' },
    warning: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b', border: '#f59e0b' },
    error: { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444', border: '#ef4444' },
  };
  const style = colors[status?.toLowerCase()] || colors.active;

  return (
    <span
      className={pulse ? 'live-indicator' : ''}
      style={{
        background: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
        padding: '4px 12px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      {pulse && (
        <span
          className="live-indicator"
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: style.text,
            boxShadow: `0 0 8px ${style.text}`,
          }}
        />
      )}
      {status}
    </span>
  );
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

// Generate strategic revenue projection based on adoption rate
const generateRevenueProjection = (hospitalsPerMonth, startingHospitals = 3, avgMCsPerHospital = 150) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const HOSPITAL_FEE = 10000;
  const MC_FEE = 1.00;

  return months.map((month, index) => {
    // Calculate cumulative hospitals (starting + growth)
    const hospitals = Math.min(startingHospitals + (hospitalsPerMonth * index), TOTAL_SARAWAK_HOSPITALS);

    // Base subscription revenue
    const subscriptionRevenue = hospitals * HOSPITAL_FEE;

    // Transaction fee revenue (MCs grow with hospitals)
    const totalMCs = hospitals * avgMCsPerHospital;
    const transactionRevenue = totalMCs * MC_FEE;

    // Total revenue
    const totalRevenue = subscriptionRevenue + transactionRevenue;

    return {
      month,
      hospitals,
      subscriptionRevenue,
      transactionRevenue,
      totalRevenue,
      target: REVENUE_TARGET,
      totalMCs
    };
  });
};

// Strategic Revenue Projection Component
function StrategicRevenueProjection() {
  const [adoptionRate, setAdoptionRate] = useState(3); // hospitals per month
  const [projectionData, setProjectionData] = useState([]);

  useEffect(() => {
    setProjectionData(generateRevenueProjection(adoptionRate));
  }, [adoptionRate]);

  // Find month when target is reached
  const targetMonth = projectionData.find(d => d.totalRevenue >= REVENUE_TARGET);
  const monthsToTarget = targetMonth ? projectionData.indexOf(targetMonth) + 1 : '>12';

  // Calculate end of year projections
  const yearEndData = projectionData[11] || {};

  // Custom tooltip
  const CustomProjectionTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div
          className="rounded-xl p-4 border shadow-2xl"
          style={{
            backgroundColor: 'rgba(15, 31, 56, 0.95)',
            borderColor: theme.success,
            backdropFilter: 'blur(10px)'
          }}
        >
          <p className="font-bold text-lg mb-2" style={{ color: theme.textPrimary }}>{label} 2026</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-6">
              <span style={{ color: theme.textMuted }}>Hospitals:</span>
              <span className="font-bold" style={{ color: theme.accent }}>{data.hospitals}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span style={{ color: theme.textMuted }}>Subscriptions:</span>
              <span className="font-bold" style={{ color: theme.success }}>RM {data.subscriptionRevenue?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span style={{ color: theme.textMuted }}>MC Fees ({data.totalMCs?.toLocaleString()} MCs):</span>
              <span className="font-bold" style={{ color: theme.purple }}>RM {data.transactionRevenue?.toLocaleString()}</span>
            </div>
            <div className="pt-2 mt-2 flex justify-between gap-6" style={{ borderTop: `1px solid ${theme.border}` }}>
              <span className="font-semibold" style={{ color: theme.textSecondary }}>Total MRR:</span>
              <span className="font-black text-lg" style={{ color: theme.success }}>RM {data.totalRevenue?.toLocaleString()}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className="card-hover relative overflow-hidden"
      style={{
        background: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(20, 184, 166, 0.3)',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Background glow effect */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(ellipse at 50% 100%, ${theme.success}20 0%, transparent 70%)`
        }}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${theme.success}20`, border: `1px solid ${theme.success}` }}
              >
                <svg className="w-5 h-5" fill={theme.success} viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: theme.textPrimary }}>
                  Strategic Revenue Projection
                </h2>
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  12-month forecast based on hospital adoption rate
                </p>
              </div>
            </div>
          </div>

          {/* Target indicator */}
          <div
            className="px-4 py-2 rounded-xl text-right"
            style={{ backgroundColor: `${theme.success}15`, border: `1px solid ${theme.success}40` }}
          >
            <p className="text-xs" style={{ color: theme.textMuted }}>Target Reached</p>
            <p className="text-lg font-black" style={{ color: theme.success }}>
              {typeof monthsToTarget === 'number' ? `Month ${monthsToTarget}` : monthsToTarget}
            </p>
          </div>
        </div>

        {/* Adoption Rate Slider */}
        <div
          className="mb-6 p-4 rounded-xl"
          style={{ backgroundColor: 'rgba(10, 22, 40, 0.5)', border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: theme.textSecondary }}>
                Hospital Adoption Rate
              </p>
              <p className="text-xs" style={{ color: theme.textMuted }}>
                Adjust to see different growth scenarios
              </p>
            </div>
            <div
              className="px-4 py-2 rounded-lg"
              style={{ backgroundColor: theme.accent, color: theme.textPrimary }}
            >
              <span className="text-2xl font-black">{adoptionRate}</span>
              <span className="text-sm ml-1">hospitals/month</span>
            </div>
          </div>

          {/* Slider */}
          <div className="relative">
            <input
              type="range"
              min="1"
              max="6"
              value={adoptionRate}
              onChange={(e) => setAdoptionRate(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${theme.success} 0%, ${theme.success} ${((adoptionRate - 1) / 5) * 100}%, ${theme.border} ${((adoptionRate - 1) / 5) * 100}%, ${theme.border} 100%)`
              }}
            />
            <div className="flex justify-between mt-2 text-xs" style={{ color: theme.textMuted }}>
              <span>Conservative (1)</span>
              <span>Moderate (3)</span>
              <span>Aggressive (6)</span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-80 mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projectionData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <defs>
                <linearGradient id="totalRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={theme.success} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={theme.success} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="subscriptionGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={theme.accent} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={theme.accent} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke={theme.border} opacity={0.5} />

              <XAxis
                dataKey="month"
                stroke={theme.textMuted}
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: theme.border }}
              />

              <YAxis
                stroke={theme.textMuted}
                fontSize={12}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                tickLine={false}
                axisLine={{ stroke: theme.border }}
                domain={[0, 600000]}
              />

              <Tooltip content={<CustomProjectionTooltip />} />

              {/* Target line at RM500k */}
              <ReferenceLine
                y={REVENUE_TARGET}
                stroke={theme.warning}
                strokeDasharray="8 4"
                strokeWidth={2}
                label={{
                  value: 'TARGET: RM500k',
                  position: 'right',
                  fill: theme.warning,
                  fontSize: 11,
                  fontWeight: 'bold'
                }}
              />

              {/* Subscription Revenue Line */}
              <Line
                type="monotone"
                dataKey="subscriptionRevenue"
                name="Subscriptions"
                stroke={theme.accent}
                strokeWidth={2}
                dot={{ fill: theme.accent, strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, fill: theme.accent, stroke: theme.textPrimary, strokeWidth: 2 }}
              />

              {/* Transaction Revenue Line */}
              <Line
                type="monotone"
                dataKey="transactionRevenue"
                name="MC Fees"
                stroke={theme.purple}
                strokeWidth={2}
                dot={{ fill: theme.purple, strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, fill: theme.purple, stroke: theme.textPrimary, strokeWidth: 2 }}
              />

              {/* Total Revenue Line */}
              <Line
                type="monotone"
                dataKey="totalRevenue"
                name="Total MRR"
                stroke={theme.success}
                strokeWidth={3}
                dot={{ fill: theme.success, strokeWidth: 0, r: 5 }}
                activeDot={{ r: 8, fill: theme.success, stroke: theme.textPrimary, strokeWidth: 2 }}
              />

              <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                formatter={(value) => <span style={{ color: theme.textSecondary, fontSize: '12px' }}>{value}</span>}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div
            className="p-4 rounded-xl text-center"
            style={{ backgroundColor: 'rgba(10, 22, 40, 0.5)', border: `1px solid ${theme.border}` }}
          >
            <p className="text-xs mb-1" style={{ color: theme.textMuted }}>Year-End Hospitals</p>
            <p className="text-2xl font-black" style={{ color: theme.accent }}>
              {yearEndData.hospitals || 0}
            </p>
          </div>
          <div
            className="p-4 rounded-xl text-center"
            style={{ backgroundColor: 'rgba(10, 22, 40, 0.5)', border: `1px solid ${theme.border}` }}
          >
            <p className="text-xs mb-1" style={{ color: theme.textMuted }}>Subscriptions MRR</p>
            <p className="text-2xl font-black" style={{ color: theme.success }}>
              RM{((yearEndData.subscriptionRevenue || 0) / 1000).toFixed(0)}k
            </p>
          </div>
          <div
            className="p-4 rounded-xl text-center"
            style={{ backgroundColor: 'rgba(10, 22, 40, 0.5)', border: `1px solid ${theme.border}` }}
          >
            <p className="text-xs mb-1" style={{ color: theme.textMuted }}>MC Fees MRR</p>
            <p className="text-2xl font-black" style={{ color: theme.purple }}>
              RM{((yearEndData.transactionRevenue || 0) / 1000).toFixed(0)}k
            </p>
          </div>
          <div
            className="p-4 rounded-xl text-center"
            style={{
              backgroundColor: `${theme.success}10`,
              border: `1px solid ${theme.success}`
            }}
          >
            <p className="text-xs mb-1" style={{ color: theme.success }}>Projected Year-End MRR</p>
            <p className="text-2xl font-black" style={{ color: theme.success }}>
              RM{((yearEndData.totalRevenue || 0) / 1000).toFixed(0)}k
            </p>
          </div>
        </div>
      </div>

      {/* Custom slider styles */}
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: ${theme.success};
          cursor: pointer;
          border: 3px solid ${theme.textPrimary};
          box-shadow: 0 0 10px ${theme.success}60;
        }
        input[type="range"]::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: ${theme.success};
          cursor: pointer;
          border: 3px solid ${theme.textPrimary};
          box-shadow: 0 0 10px ${theme.success}60;
        }
      `}</style>
    </div>
  );
}

// Automation Command Center for Solo Founder
function AutomationCommandCenter({ bankBalance, mrr, leadsCount }) {
  const [aiSalesAssistant, setAiSalesAssistant] = useState(true);
  const [revenueWatchdog, setRevenueWatchdog] = useState(true);
  const [autoMaintenance, setAutoMaintenance] = useState(true);
  const [recentAlerts, setRecentAlerts] = useState([
    { id: 1, type: 'milestone', message: 'Hospital Umum Sarawak reached 500 MCs', time: '2 hours ago', icon: '🏆' },
    { id: 2, type: 'followup', message: 'Auto follow-up sent to Normah Medical', time: '5 hours ago', icon: '📧' },
    { id: 3, type: 'heal', message: 'Sibu node auto-recovered from timeout', time: '1 day ago', icon: '🔧' },
  ]);

  // Current time for daily briefing
  const currentHour = new Date().getHours();
  const isBusinessHours = currentHour >= 8 && currentHour < 18;

  // Calculate revenue gap
  const revenueGap = REVENUE_TARGET - (mrr || 36000);
  const gapPercentage = ((mrr || 36000) / REVENUE_TARGET) * 100;

  // Simulated automation stats
  const automationStats = {
    emailsSent: 12,
    followUpsScheduled: 3,
    issuesAutoResolved: 7,
    uptimePercentage: 99.97
  };

  // Node health data
  const nodeHealth = [
    { name: 'Kuching Primary', status: 'healthy', uptime: '99.99%', lastCheck: '2 min ago' },
    { name: 'Miri Secondary', status: 'healthy', uptime: '99.95%', lastCheck: '2 min ago' },
    { name: 'Sibu Tertiary', status: 'healing', uptime: '99.87%', lastCheck: '1 min ago' },
    { name: 'Bintulu Backup', status: 'standby', uptime: '100%', lastCheck: '2 min ago' },
  ];

  return (
    <div className="space-y-6">
      {/* Daily Briefing Card - Solo Founder */}
      <div
        className="card-hover relative overflow-hidden"
        style={{
          background: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Animated corner accent */}
        <div
          className="absolute top-0 right-0 w-32 h-32"
          style={{
            background: `radial-gradient(circle at 100% 0%, ${theme.success}30 0%, transparent 70%)`
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${theme.success}20`, border: `2px solid ${theme.success}` }}
              >
                <span className="text-2xl">👨‍💼</span>
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: theme.textPrimary }}>
                  Solo Founder Daily Briefing
                </h2>
                <p className="text-sm" style={{ color: theme.textSecondary }}>
                  {new Date().toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  {' • '}
                  <span style={{ color: isBusinessHours ? theme.success : theme.warning }}>
                    {isBusinessHours ? 'Business Hours' : 'After Hours'}
                  </span>
                </p>
              </div>
            </div>
            <div
              className="px-4 py-2 rounded-full flex items-center gap-2 live-badge"
              style={{ backgroundColor: `${theme.success}20`, border: `1px solid ${theme.success}40` }}
            >
              <LivePulseDot color={theme.success} size={8} />
              <span className="text-sm font-bold" style={{ color: theme.success }}>All Systems Automated</span>
            </div>
          </div>

          {/* Three Key Stats */}
          <div className="grid grid-cols-3 gap-6">
            {/* Total Cash */}
            <div
              className="p-5 rounded-xl text-center"
              style={{
                backgroundColor: 'rgba(10, 22, 40, 0.6)',
                border: `1px solid ${theme.success}40`
              }}
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <svg className="w-5 h-5" fill={theme.success} viewBox="0 0 20 20">
                  <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: theme.textMuted }}>
                  Total Cash
                </span>
              </div>
              <p className="text-3xl font-black" style={{ color: theme.success }}>
                <AnimatedNumber value={bankBalance || 36485} prefix="RM " duration={1.2} />
              </p>
              <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                +RM 2,340 today
              </p>
            </div>

            {/* New Leads */}
            <div
              className="p-5 rounded-xl text-center"
              style={{
                backgroundColor: 'rgba(10, 22, 40, 0.6)',
                border: `1px solid ${theme.accent}40`
              }}
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <svg className="w-5 h-5" fill={theme.accent} viewBox="0 0 20 20">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: theme.textMuted }}>
                  New Leads
                </span>
              </div>
              <p className="text-3xl font-black" style={{ color: theme.accent }}>
                <AnimatedNumber value={leadsCount || 6} duration={0.8} />
              </p>
              <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                3 hot, 2 warm, 1 cold
              </p>
            </div>

            {/* Revenue Gap */}
            <div
              className="p-5 rounded-xl text-center"
              style={{
                backgroundColor: 'rgba(10, 22, 40, 0.6)',
                border: `1px solid ${theme.warning}40`
              }}
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <svg className="w-5 h-5" fill={theme.warning} viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: theme.textMuted }}>
                  Gap to RM500k
                </span>
              </div>
              <p className="text-3xl font-black" style={{ color: theme.warning }}>
                <AnimatedNumber value={revenueGap} prefix="RM " duration={1.0} />
              </p>
              <div className="mt-2">
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme.border }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(gapPercentage, 100)}%`,
                      background: `linear-gradient(90deg, ${theme.success}, ${theme.accent})`
                    }}
                  />
                </div>
                <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                  {gapPercentage.toFixed(1)}% complete
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Automation Toggles Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Sales Assistant */}
        <div
          className="rounded-2xl p-6 border"
          style={{
            backgroundColor: aiSalesAssistant ? `rgba(16, 185, 129, 0.1)` : theme.bgCard,
            borderColor: aiSalesAssistant ? theme.success : theme.border,
            transition: 'all 0.3s ease'
          }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${theme.accent}20` }}
              >
                <span className="text-2xl">🤖</span>
              </div>
              <div>
                <h3 className="font-bold" style={{ color: theme.textPrimary }}>AI Sales Assistant</h3>
                <p className="text-xs" style={{ color: theme.textSecondary }}>Auto follow-up after 48h</p>
              </div>
            </div>

            {/* Toggle Switch */}
            <button
              onClick={() => setAiSalesAssistant(!aiSalesAssistant)}
              className="relative w-14 h-7 rounded-full transition-all"
              style={{
                backgroundColor: aiSalesAssistant ? theme.success : theme.border
              }}
            >
              <div
                className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg transition-all"
                style={{
                  left: aiSalesAssistant ? '32px' : '4px'
                }}
              />
            </button>
          </div>

          {aiSalesAssistant && (
            <div className="space-y-3 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: theme.textMuted }}>Emails sent this week</span>
                <span className="font-bold" style={{ color: theme.success }}>{automationStats.emailsSent}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: theme.textMuted }}>Follow-ups scheduled</span>
                <span className="font-bold" style={{ color: theme.accent }}>{automationStats.followUpsScheduled}</span>
              </div>
              <div
                className="p-3 rounded-lg mt-3"
                style={{ backgroundColor: theme.bg }}
              >
                <p className="text-xs" style={{ color: theme.textMuted }}>Next auto-email in:</p>
                <p className="font-mono font-bold" style={{ color: theme.warning }}>23h 14m 32s</p>
                <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>To: Normah Medical Centre</p>
              </div>
            </div>
          )}
        </div>

        {/* Revenue Watchdog */}
        <div
          className="rounded-2xl p-6 border"
          style={{
            backgroundColor: revenueWatchdog ? `rgba(139, 92, 246, 0.1)` : theme.bgCard,
            borderColor: revenueWatchdog ? theme.purple : theme.border,
            transition: 'all 0.3s ease'
          }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${theme.purple}20` }}
              >
                <span className="text-2xl">📱</span>
              </div>
              <div>
                <h3 className="font-bold" style={{ color: theme.textPrimary }}>Revenue Watchdog</h3>
                <p className="text-xs" style={{ color: theme.textSecondary }}>Milestone phone alerts</p>
              </div>
            </div>

            {/* Toggle Switch */}
            <button
              onClick={() => setRevenueWatchdog(!revenueWatchdog)}
              className="relative w-14 h-7 rounded-full transition-all"
              style={{
                backgroundColor: revenueWatchdog ? theme.purple : theme.border
              }}
            >
              <div
                className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg transition-all"
                style={{
                  left: revenueWatchdog ? '32px' : '4px'
                }}
              />
            </button>
          </div>

          {revenueWatchdog && (
            <div className="space-y-3 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
              <p className="text-xs font-semibold" style={{ color: theme.textMuted }}>Alert Triggers:</p>
              <div className="space-y-2">
                {['Hospital hits 100 MCs', 'Hospital hits 500 MCs', 'Hospital hits 1,000 MCs', 'New deal signed'].map((trigger, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill={theme.success} viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm" style={{ color: theme.textSecondary }}>{trigger}</span>
                  </div>
                ))}
              </div>
              <div
                className="p-3 rounded-lg mt-3"
                style={{ backgroundColor: theme.bg }}
              >
                <p className="text-xs" style={{ color: theme.textMuted }}>Last alert sent:</p>
                <p className="text-sm font-semibold" style={{ color: theme.purple }}>KPJ Kuching → 500 MCs 🏆</p>
                <p className="text-xs" style={{ color: theme.textSecondary }}>2 hours ago</p>
              </div>
            </div>
          )}
        </div>

        {/* Auto-Maintenance */}
        <div
          className="rounded-2xl p-6 border"
          style={{
            backgroundColor: autoMaintenance ? `rgba(59, 130, 246, 0.1)` : theme.bgCard,
            borderColor: autoMaintenance ? theme.accent : theme.border,
            transition: 'all 0.3s ease'
          }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${theme.accent}20` }}
              >
                <span className="text-2xl">🔧</span>
              </div>
              <div>
                <h3 className="font-bold" style={{ color: theme.textPrimary }}>Auto-Maintenance</h3>
                <p className="text-xs" style={{ color: theme.textSecondary }}>Self-healing nodes</p>
              </div>
            </div>

            {/* Toggle Switch */}
            <button
              onClick={() => setAutoMaintenance(!autoMaintenance)}
              className="relative w-14 h-7 rounded-full transition-all"
              style={{
                backgroundColor: autoMaintenance ? theme.accent : theme.border
              }}
            >
              <div
                className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg transition-all"
                style={{
                  left: autoMaintenance ? '32px' : '4px'
                }}
              />
            </button>
          </div>

          {autoMaintenance && (
            <div className="space-y-3 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: theme.textMuted }}>Issues auto-resolved</span>
                <span className="font-bold" style={{ color: theme.success }}>{automationStats.issuesAutoResolved}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: theme.textMuted }}>System uptime</span>
                <span className="font-bold" style={{ color: theme.success }}>{automationStats.uptimePercentage}%</span>
              </div>

              {/* Node Health Status */}
              <div className="space-y-2 mt-3">
                {nodeHealth.map((node, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-lg"
                    style={{ backgroundColor: theme.bg }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${node.status === 'healing' ? 'animate-pulse' : ''}`}
                        style={{
                          backgroundColor: node.status === 'healthy' ? theme.success :
                                          node.status === 'healing' ? theme.warning :
                                          theme.textMuted
                        }}
                      />
                      <span className="text-xs" style={{ color: theme.textSecondary }}>{node.name}</span>
                    </div>
                    <span
                      className="text-xs font-bold uppercase"
                      style={{
                        color: node.status === 'healthy' ? theme.success :
                              node.status === 'healing' ? theme.warning :
                              theme.textMuted
                      }}
                    >
                      {node.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Automation Activity */}
      <div
        className="rounded-2xl p-6 border"
        style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${theme.success}20` }}
            >
              <svg className="w-5 h-5" fill={theme.success} viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold" style={{ color: theme.textPrimary }}>Automation Activity Log</h3>
              <p className="text-xs" style={{ color: theme.textSecondary }}>Actions taken while you sleep</p>
            </div>
          </div>
          <span
            className="px-3 py-1 rounded-full text-xs font-bold"
            style={{ backgroundColor: `${theme.success}20`, color: theme.success }}
          >
            {recentAlerts.length} actions today
          </span>
        </div>

        <div className="space-y-3">
          {recentAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center gap-4 p-3 rounded-xl transition-all hover:opacity-80"
              style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}
            >
              <span className="text-2xl">{alert.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>{alert.message}</p>
                <p className="text-xs" style={{ color: theme.textMuted }}>{alert.time}</p>
              </div>
              <span
                className="px-2 py-1 rounded text-xs uppercase font-bold"
                style={{
                  backgroundColor: alert.type === 'milestone' ? `${theme.purple}20` :
                                  alert.type === 'followup' ? `${theme.accent}20` :
                                  `${theme.success}20`,
                  color: alert.type === 'milestone' ? theme.purple :
                        alert.type === 'followup' ? theme.accent :
                        theme.success
                }}
              >
                {alert.type}
              </span>
            </div>
          ))}
        </div>

        <div
          className="mt-4 pt-4 text-center"
          style={{ borderTop: `1px solid ${theme.border}` }}
        >
          <p className="text-sm" style={{ color: theme.textMuted }}>
            <span className="font-bold" style={{ color: theme.success }}>19 hours</span> of your time saved this week
          </p>
        </div>
      </div>
    </div>
  );
}

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

// City coordinates for Sarawak map
const SARAWAK_CITIES = {
  'Kuching': { x: 25, y: 78, label: 'Kuching' },
  'Sibu': { x: 52, y: 48, label: 'Sibu' },
  'Miri': { x: 78, y: 22, label: 'Miri' },
  'Bintulu': { x: 65, y: 38, label: 'Bintulu' },
};

// Protocol check steps
const PROTOCOL_STEPS = [
  { id: 1, text: 'Establishing Secure Tunnel...', duration: 1200 },
  { id: 2, text: 'Generating 256-bit Encryption Keys...', duration: 1500 },
  { id: 3, text: 'Syncing with MedChain Mainnet...', duration: 1800 },
  { id: 4, text: 'Hospital Node #SC-{nodeId} Active.', duration: 1000, isFinal: true },
];

// Proposal Modal with Digital Signature
function ProposalModal({ isOpen, onClose, lead, onDealClosed }) {
  const sigCanvas = useRef(null);
  const sigContainerRef = useRef(null);
  const [isSigned, setIsSigned] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [verificationData, setVerificationData] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [nodeId, setNodeId] = useState('004');

  // Fix canvas size for perfect gold ink alignment using getBoundingClientRect
  useEffect(() => {
    if (!isOpen || !sigCanvas.current || !sigContainerRef.current) return;

    const resizeCanvas = () => {
      const canvas = sigCanvas.current.getCanvas();
      const container = sigContainerRef.current;
      const rect = container.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;

      const displayWidth = Math.floor(rect.width);
      const displayHeight = 128; // h-32 = 8rem = 128px

      // Set internal canvas resolution
      canvas.width = displayWidth * ratio;
      canvas.height = displayHeight * ratio;

      // Set display size via CSS
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      // Scale context
      const ctx = canvas.getContext('2d');
      ctx.scale(ratio, ratio);

      sigCanvas.current.clear();
    };

    // Wait for modal to render
    const timeoutId = setTimeout(resizeCanvas, 100);
    window.addEventListener('resize', resizeCanvas);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [isOpen]);

  if (!isOpen || !lead) return null;

  const leadValue = (lead.estimatedMCs * 1.00) + 10000;

  // Determine city from facility name
  const getCity = () => {
    const name = lead.facilityName.toLowerCase();
    if (name.includes('miri')) return 'Miri';
    if (name.includes('sibu') || name.includes('rejang')) return 'Sibu';
    if (name.includes('bintulu')) return 'Bintulu';
    return 'Kuching'; // Default
  };

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setIsSigned(false);
  };

  const handleSignatureEnd = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
      setIsSigned(true);
    }
  };

  const runProtocolSequence = async () => {
    const newNodeId = String(Math.floor(Math.random() * 900) + 100).padStart(3, '0');
    setNodeId(newNodeId);

    for (let i = 0; i < PROTOCOL_STEPS.length; i++) {
      setCurrentStep(i);
      await new Promise(resolve => setTimeout(resolve, PROTOCOL_STEPS[i].duration));
      setCompletedSteps(prev => [...prev, i]);
    }

    // Small delay before showing final screen
    await new Promise(resolve => setTimeout(resolve, 800));
    setIsInitializing(false);
    setIsComplete(true);
  };

  const handleConfirmPayment = async () => {
    if (!isSigned) return;

    setIsProcessing(true);

    // Simulate blockchain transaction
    await new Promise(resolve => setTimeout(resolve, 1500));

    const verification = {
      hashId: generateHashId(),
      timestamp: new Date().toISOString(),
      blockNumber: Math.floor(Math.random() * 1000000) + 15847000,
      facilityName: lead.facilityName,
      amount: 10000,
      signatureData: sigCanvas.current?.toDataURL()
    };

    setVerificationData(verification);
    setIsProcessing(false);
    setIsInitializing(true);

    // Notify parent component about the closed deal
    onDealClosed({
      ...lead,
      verification,
      closedAt: new Date()
    });

    // Start protocol sequence
    runProtocolSequence();
  };

  const handleClose = () => {
    setIsSigned(false);
    setIsProcessing(false);
    setIsInitializing(false);
    setIsComplete(false);
    setVerificationData(null);
    setCurrentStep(0);
    setCompletedSteps([]);
    onClose();
  };

  const city = getCity();

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

        {isInitializing ? (
          /* Cinematic Initialization Screen */
          <div
            className="relative overflow-hidden"
            style={{ backgroundColor: '#000', minHeight: '500px' }}
          >
            {/* Animated grid background */}
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: `
                  linear-gradient(${theme.accent}40 1px, transparent 1px),
                  linear-gradient(90deg, ${theme.accent}40 1px, transparent 1px)
                `,
                backgroundSize: '50px 50px',
                animation: 'gridMove 20s linear infinite'
              }}
            />

            {/* Radial glow from city */}
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at ${SARAWAK_CITIES[city].x}% ${SARAWAK_CITIES[city].y}%, ${theme.success}30 0%, transparent 50%)`
              }}
            />

            <div className="relative z-10 p-8">
              {/* Header */}
              <div className="text-center mb-8">
                <p
                  className="text-xs font-bold tracking-[0.3em] uppercase mb-2"
                  style={{ color: theme.accent }}
                >
                  Sarawak MedChain
                </p>
                <h2 className="text-3xl font-black" style={{ color: theme.textPrimary }}>
                  INITIALIZING NODE
                </h2>
                <p className="text-sm mt-2" style={{ color: theme.textSecondary }}>
                  {lead.facilityName}
                </p>
              </div>

              {/* 3D-style Sarawak Map */}
              <div className="relative mx-auto mb-8" style={{ maxWidth: '400px', height: '200px' }}>
                <svg viewBox="0 0 100 100" className="w-full h-full" style={{ filter: 'drop-shadow(0 0 20px rgba(16, 185, 129, 0.3))' }}>
                  {/* Sarawak outline with gradient */}
                  <defs>
                    <linearGradient id="mapGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={theme.accent} stopOpacity="0.3" />
                      <stop offset="100%" stopColor={theme.success} stopOpacity="0.1" />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Sarawak shape */}
                  <path
                    d="M 5 80 Q 15 90 25 85 Q 35 80 45 70 Q 55 60 65 50 Q 75 40 85 30 Q 90 25 95 20 L 95 35 Q 85 45 75 55 Q 65 65 55 75 Q 45 85 35 90 Q 25 95 15 90 Q 5 85 5 80 Z"
                    fill="url(#mapGradient)"
                    stroke={theme.accent}
                    strokeWidth="0.5"
                    opacity="0.8"
                  />

                  {/* Connection lines to other cities */}
                  {Object.entries(SARAWAK_CITIES).filter(([name]) => name !== city).map(([name, coords]) => (
                    <line
                      key={name}
                      x1={SARAWAK_CITIES[city].x}
                      y1={SARAWAK_CITIES[city].y}
                      x2={coords.x}
                      y2={coords.y}
                      stroke={theme.accent}
                      strokeWidth="0.3"
                      strokeDasharray="2,2"
                      opacity="0.4"
                    />
                  ))}

                  {/* Other city dots (dimmed) */}
                  {Object.entries(SARAWAK_CITIES).filter(([name]) => name !== city).map(([name, coords]) => (
                    <g key={name}>
                      <circle cx={coords.x} cy={coords.y} r="1.5" fill={theme.accent} opacity="0.3" />
                      <text x={coords.x} y={coords.y + 5} textAnchor="middle" fill={theme.textMuted} fontSize="3">
                        {name}
                      </text>
                    </g>
                  ))}

                  {/* Main city - glowing point */}
                  <g filter="url(#glow)">
                    {/* Outer pulse ring */}
                    <circle
                      cx={SARAWAK_CITIES[city].x}
                      cy={SARAWAK_CITIES[city].y}
                      r="8"
                      fill="none"
                      stroke={theme.success}
                      strokeWidth="0.5"
                      opacity="0.5"
                      className="animate-ping"
                    />
                    {/* Middle ring */}
                    <circle
                      cx={SARAWAK_CITIES[city].x}
                      cy={SARAWAK_CITIES[city].y}
                      r="5"
                      fill={theme.success}
                      opacity="0.3"
                    />
                    {/* Core dot */}
                    <circle
                      cx={SARAWAK_CITIES[city].x}
                      cy={SARAWAK_CITIES[city].y}
                      r="2.5"
                      fill={theme.success}
                    />
                  </g>

                  {/* City label */}
                  <text
                    x={SARAWAK_CITIES[city].x}
                    y={SARAWAK_CITIES[city].y + 10}
                    textAnchor="middle"
                    fill={theme.success}
                    fontSize="4"
                    fontWeight="bold"
                  >
                    {city.toUpperCase()}
                  </text>
                </svg>
              </div>

              {/* Protocol Checks */}
              <div
                className="mx-auto rounded-xl p-6"
                style={{
                  maxWidth: '400px',
                  backgroundColor: 'rgba(10, 22, 40, 0.8)',
                  border: `1px solid ${theme.border}`
                }}
              >
                <p className="text-xs font-bold tracking-wider uppercase mb-4" style={{ color: theme.textMuted }}>
                  Protocol Initialization
                </p>

                <div className="space-y-3">
                  {PROTOCOL_STEPS.map((step, index) => {
                    const isCompleted = completedSteps.includes(index);
                    const isCurrent = currentStep === index && !isCompleted;
                    const stepText = step.text.replace('{nodeId}', nodeId);

                    return (
                      <div
                        key={step.id}
                        className="flex items-center gap-3 transition-all duration-300"
                        style={{ opacity: index <= currentStep ? 1 : 0.3 }}
                      >
                        {/* Status indicator */}
                        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                          {isCompleted ? (
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: theme.success }}
                            >
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          ) : isCurrent ? (
                            <div
                              className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                              style={{ borderColor: theme.accent, borderTopColor: 'transparent' }}
                            />
                          ) : (
                            <div
                              className="w-5 h-5 rounded-full"
                              style={{ border: `2px solid ${theme.border}` }}
                            />
                          )}
                        </div>

                        {/* Step text */}
                        <p
                          className={`text-sm font-mono ${step.isFinal && isCompleted ? 'font-bold' : ''}`}
                          style={{
                            color: isCompleted
                              ? (step.isFinal ? theme.success : theme.textPrimary)
                              : isCurrent
                                ? theme.accent
                                : theme.textMuted
                          }}
                        >
                          {stepText}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Grid animation styles */}
            <style>{`
              @keyframes gridMove {
                0% { transform: translate(0, 0); }
                100% { transform: translate(50px, 50px); }
              }
            `}</style>
          </div>
        ) : !isComplete ? (
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
                  ref={sigContainerRef}
                  className="rounded-xl overflow-hidden signature-container"
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
                    penColor="#D4A017"
                    onEnd={handleSignatureEnd}
                  />
                </div>
                {!isSigned && (
                  <p className="text-xs mt-2 text-center" style={{ color: theme.textMuted }}>
                    Hospital representative signs here to authorize partnership
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
                  `Confirm Payment Received - RM10,000`
                )}
              </button>
              {!isSigned && (
                <p className="text-center text-xs mt-3" style={{ color: theme.textMuted }}>
                  Hospital signature required to confirm deal
                </p>
              )}
            </div>
          </>
        ) : (
          /* Cinematic Success State */
          <div
            className="relative overflow-hidden"
            style={{ backgroundColor: '#000', minHeight: '550px' }}
          >
            {/* Animated success particles */}
            <div className="absolute inset-0 overflow-hidden">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1 h-1 rounded-full"
                  style={{
                    backgroundColor: theme.success,
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    opacity: Math.random() * 0.5 + 0.2,
                    animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
                    animationDelay: `${Math.random() * 2}s`
                  }}
                />
              ))}
            </div>

            {/* Radial glow */}
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at 50% 30%, ${theme.success}25 0%, transparent 60%)`
              }}
            />

            <div className="relative z-10 p-8 text-center">
              {/* Success Badge */}
              <div className="mb-6">
                <div
                  className="w-28 h-28 rounded-full mx-auto flex items-center justify-center relative"
                  style={{
                    background: `linear-gradient(135deg, ${theme.success}40, ${theme.success}10)`,
                    boxShadow: `0 0 60px ${theme.success}40`
                  }}
                >
                  <div
                    className="absolute inset-2 rounded-full"
                    style={{ border: `3px solid ${theme.success}` }}
                  />
                  <svg className="w-14 h-14" fill={theme.success} viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>

              {/* Node Active Status */}
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 live-badge"
                style={{ backgroundColor: `${theme.success}20`, border: `1px solid ${theme.success}` }}
              >
                <LivePulseDot color={theme.success} size={8} />
                <span className="text-sm font-bold" style={{ color: theme.success }}>
                  NODE SC-{nodeId} ONLINE
                </span>
              </div>

              <h3 className="text-3xl font-black mb-2" style={{ color: theme.textPrimary }}>
                {lead.facilityName}
              </h3>
              <p className="text-lg mb-6" style={{ color: theme.success }}>
                Successfully Connected to MedChain Network
              </p>

              {/* Stats Row */}
              <div
                className="grid grid-cols-3 gap-4 mb-8 mx-auto"
                style={{ maxWidth: '450px' }}
              >
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: 'rgba(10, 22, 40, 0.8)', border: `1px solid ${theme.border}` }}
                >
                  <p className="text-2xl font-black" style={{ color: theme.success }}>
                    +RM{(10000).toLocaleString()}
                  </p>
                  <p className="text-xs" style={{ color: theme.textMuted }}>Subscription</p>
                </div>
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: 'rgba(10, 22, 40, 0.8)', border: `1px solid ${theme.border}` }}
                >
                  <p className="text-2xl font-black" style={{ color: theme.accent }}>
                    {lead.estimatedMCs}
                  </p>
                  <p className="text-xs" style={{ color: theme.textMuted }}>Est. MCs/mo</p>
                </div>
                <div
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: 'rgba(10, 22, 40, 0.8)', border: `1px solid ${theme.border}` }}
                >
                  <p className="text-2xl font-black" style={{ color: theme.purple }}>
                    {city}
                  </p>
                  <p className="text-xs" style={{ color: theme.textMuted }}>Region</p>
                </div>
              </div>

              {/* Blockchain Verification */}
              <div
                className="rounded-xl p-4 mb-8 mx-auto text-left"
                style={{
                  maxWidth: '450px',
                  backgroundColor: 'rgba(10, 22, 40, 0.8)',
                  border: `1px solid ${theme.border}`
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-4 h-4" fill={theme.success} viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs font-bold" style={{ color: theme.success }}>BLOCKCHAIN VERIFIED</span>
                </div>
                <p className="text-xs font-mono break-all mb-2" style={{ color: theme.textMuted }}>
                  {verificationData?.hashId}
                </p>
                <div className="flex justify-between text-xs">
                  <span style={{ color: theme.textMuted }}>Block #{verificationData?.blockNumber?.toLocaleString()}</span>
                  <span style={{ color: theme.textMuted }}>{new Date(verificationData?.timestamp).toLocaleString('en-MY')}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 mx-auto" style={{ maxWidth: '350px' }}>
                <button
                  onClick={() => window.open('/ceo-dashboard', '_blank')}
                  className="w-full py-4 rounded-xl font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    background: `linear-gradient(135deg, ${theme.success}, ${theme.accent})`,
                    color: theme.textPrimary,
                    boxShadow: `0 4px 20px ${theme.success}40`
                  }}
                >
                  <span className="flex items-center justify-center gap-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    Enter Hospital Dashboard
                  </span>
                </button>

                <button
                  onClick={handleClose}
                  className="w-full py-3 rounded-xl font-semibold transition-all hover:opacity-80"
                  style={{ backgroundColor: theme.bgCard, color: theme.textSecondary, border: `1px solid ${theme.border}` }}
                >
                  Back to Founder Dashboard
                </button>
              </div>
            </div>

            {/* Float animation */}
            <style>{`
              @keyframes float {
                0%, 100% { transform: translateY(0px) scale(1); opacity: 0.3; }
                50% { transform: translateY(-20px) scale(1.5); opacity: 0.6; }
              }
            `}</style>
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5: Command Bar & Confirmation Modal State
  // ═══════════════════════════════════════════════════════════════════════════
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: null });
  const [recentCommands, setRecentCommands] = useState([]);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 6: Loading States
  // ═══════════════════════════════════════════════════════════════════════════
  const [isLoading, setIsLoading] = useState(true);
  const [sectionsLoaded, setSectionsLoaded] = useState({
    metrics: false,
    chart: false,
    pipeline: false,
    network: false,
  });

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

    // Phase 5: Show toast notification
    toast.success(
      <div className="flex items-center gap-3">
        <span className="text-xl">🎉</span>
        <div>
          <p className="font-bold">{closedDeal.facilityName}</p>
          <p className="text-sm opacity-80">+RM {leadValue.toLocaleString()} MRR</p>
        </div>
      </div>,
      { duration: 5000 }
    );

    // Clear notification after 5 seconds
    setTimeout(() => {
      setDealNotification(null);
    }, 5000);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5: Keyboard Shortcuts
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleKeyDown = (e) => {
      // Cmd/Ctrl + K - Open Command Bar
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandBarOpen(prev => !prev);
      }
      // Cmd/Ctrl + E - Export Deck
      if ((e.metaKey || e.ctrlKey) && e.key === 'e' && !e.shiftKey) {
        e.preventDefault();
        exportInvestorDeck();
      }
      // Escape - Close modals
      if (e.key === 'Escape') {
        setCommandBarOpen(false);
        setConfirmModal({ isOpen: false, type: null });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated]);

  // Phase 5: Command execution handler
  const handleCommandExecute = useCallback((command) => {
    // Add to recent commands
    setRecentCommands(prev => {
      const updated = [command.id, ...prev.filter(id => id !== command.id)].slice(0, 5);
      return updated;
    });

    // Show toast for feedback
    toast.success(`Executed: ${command.label}`, { duration: 2000, icon: '⚡' });
  }, []);

  // Phase 5: Command bar commands
  const commandBarCommands = [
    {
      id: 'export-deck',
      label: 'Export Investor Deck PDF',
      group: 'Actions',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
      shortcut: ['⌘', 'E'],
      action: () => exportInvestorDeck(),
    },
    {
      id: 'refresh-data',
      label: 'Refresh Dashboard Data',
      group: 'Actions',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
      action: () => {
        toast.success('Dashboard refreshed', { icon: '🔄' });
        window.location.reload();
      },
    },
    {
      id: 'show-metrics',
      label: 'View Key Metrics',
      group: 'Navigation',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
      action: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    },
    {
      id: 'show-pipeline',
      label: 'View Sales Pipeline',
      group: 'Navigation',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>,
      action: () => document.querySelector('[data-section="pipeline"]')?.scrollIntoView({ behavior: 'smooth' }),
    },
    {
      id: 'system-check',
      label: 'Check System Status',
      group: 'System',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
      action: () => toast.success('All systems operational ✓', { icon: '💚', duration: 3000 }),
    },
    {
      id: 'logout',
      label: 'Logout',
      group: 'System',
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
      action: () => setIsAuthenticated(false),
    },
  ];

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

  // Initialize data with loading state
  useEffect(() => {
    if (isAuthenticated) {
      // Simulate async data loading (in production, this would be real API calls)
      setIsLoading(true);

      // Stagger the loading of sections for visual effect
      const loadData = async () => {
        // Load metrics first
        await new Promise(resolve => setTimeout(resolve, 300));
        const totalMRR = mockHospitals.reduce((sum, h) => sum + h.monthlyFee, 0);
        setMrr(totalMRR);
        const paidSubscriptions = mockHospitals.filter(h => h.paid).reduce((sum, h) => sum + h.monthlyFee, 0);
        const mcRevenue = mockHospitals.reduce((sum, h) => sum + h.mcs, 0);
        setBankBalance(paidSubscriptions + mcRevenue);
        setSectionsLoaded(prev => ({ ...prev, metrics: true }));

        // Load chart data
        await new Promise(resolve => setTimeout(resolve, 200));
        setSectionsLoaded(prev => ({ ...prev, chart: true }));

        // Load pipeline
        await new Promise(resolve => setTimeout(resolve, 200));
        const pending = mockHospitals.filter(h => !h.paid);
        setPendingPayments(pending);
        setSectionsLoaded(prev => ({ ...prev, pipeline: true }));

        // Load network/feed
        await new Promise(resolve => setTimeout(resolve, 200));
        const initialFeed = Array.from({ length: 5 }, () => generateMockMCFeed());
        setMcFeed(initialFeed);
        setTotalProfit(initialFeed.length);
        setSectionsLoaded(prev => ({ ...prev, network: true }));

        // All done
        setIsLoading(false);
      };

      loadData();
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
              style={{ backgroundColor: theme.bg, border: `2px solid ${theme.teal}` }}
            >
              <svg className="w-10 h-10" fill={theme.teal} viewBox="0 0 20 20">
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
              style={{ background: `linear-gradient(135deg, ${theme.teal}, #0d9488)` }}
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
      className="min-h-screen founder-admin-dashboard founder-command"
      style={{ backgroundColor: '#FFFFFF' }}
    >
      {/* Global font import */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        .founder-admin-dashboard { font-family: 'Inter', system-ui, sans-serif; }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════════════
          STICKY TOP BAR - Enterprise Navigation
          ═══════════════════════════════════════════════════════════════════ */}
      <header
        className="sticky top-0 z-50 px-6 py-3"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid #E2E8F0',
        }}
      >
        <div className="flex items-center justify-between" style={{ maxWidth: '1600px', margin: '0 auto' }}>
          {/* LEFT: Logo + Brand */}
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #00d4aa 0%, #00b894 100%)' }}
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight" style={{ color: '#1E293B' }}>
                Sarawak MedChain
              </h1>
              <p className="text-xs" style={{ color: '#94A3B8' }}>Founder Command</p>
            </div>
          </div>

          {/* CENTER: Command Bar Button + System Status */}
          <div className="hidden md:flex items-center gap-4">
            {/* Phase 5: Command Bar Trigger */}
            <motion.button
              onClick={() => setCommandBarOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <svg className="w-4 h-4" fill="none" stroke="#64748b" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-xs" style={{ color: '#64748b' }}>Search</span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', color: '#64748b' }}>
                ⌘K
              </kbd>
            </motion.button>

            <div className="h-5 w-px" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}></div>

            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'rgba(0, 212, 170, 0.1)' }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <LivePulseDot color="#00d4aa" size={8} />
              <span className="text-xs font-medium" style={{ color: '#00d4aa' }}>99.99% Uptime</span>
            </motion.div>
            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'rgba(124, 92, 255, 0.1)' }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <LivePulseDot color="#7c5cff" size={8} />
              <span className="text-xs font-medium" style={{ color: '#7c5cff' }}>
                {blockchainNodes.filter(n => n.status === 'online').length}/{blockchainNodes.length} Nodes
              </span>
            </motion.div>
            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'rgba(0, 212, 170, 0.1)' }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <svg className="w-3.5 h-3.5" fill="#00d4aa" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-xs font-medium" style={{ color: '#00d4aa' }}>Network Healthy</span>
            </motion.div>
          </div>

          {/* RIGHT: Actions + Profile */}
          <div className="flex items-center gap-3">
            <AnimatedButton
              onClick={exportInvestorDeck}
              disabled={exportingDeck}
              variant="secondary"
              className="hidden sm:flex"
            >
              {exportingDeck ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export Deck
                </>
              )}
            </AnimatedButton>

            <div className="h-6 w-px" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}></div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <span className="text-xs font-bold" style={{ color: '#f59e0b' }}>FOUNDER</span>
            </div>

            <button
              onClick={() => setIsAuthenticated(false)}
              className="p-2 rounded-lg transition-all hover:opacity-80"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
              title="Logout"
            >
              <svg className="w-4 h-4" fill="none" stroke="#94a3b8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN CONTENT AREA
          ═══════════════════════════════════════════════════════════════════ */}
      <main className="px-6 py-6 pb-20" style={{ maxWidth: '1600px', margin: '0 auto' }}>

      {/* Phase 6: Global Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(10, 14, 20, 0.9)', backdropFilter: 'blur(8px)' }}
          >
            <div className="text-center">
              <div className="loading-spinner mx-auto mb-4" style={{ width: 48, height: 48 }}></div>
              <p className="text-sm font-medium" style={{ color: '#00d4aa' }}>Loading Founder Command...</p>
              <p className="text-xs mt-2" style={{ color: '#64748b' }}>Syncing blockchain data</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════
          ROW 1: KEY METRICS - 4 Cards
          ═══════════════════════════════════════════════════════════════════ */}
      <ErrorBoundary fallbackTitle="Metrics Error" fallbackMessage="Failed to load key metrics">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: sectionsLoaded.metrics ? 1 : 0.5, y: 0 }}
        transition={{ duration: 0.5 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      >
        {/* Live MRR - Primary Metric */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0 }}
          whileHover={{ y: -2, transition: { duration: 0.2 } }}
          className="relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95) 0%, rgba(13, 17, 23, 0.8) 100%)',
            border: '1px solid rgba(0, 212, 170, 0.2)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Glow effect */}
          <div className="absolute inset-0 opacity-20" style={{
            background: 'radial-gradient(circle at 50% 0%, rgba(0, 212, 170, 0.3), transparent 70%)',
          }}></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748b' }}>
                Live MRR
              </span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(0, 212, 170, 0.15)' }}>
                <LivePulseDot color="#00d4aa" size={6} />
                <span className="text-[10px] font-medium" style={{ color: '#00d4aa' }}>LIVE</span>
              </div>
            </div>
            <p className="text-4xl font-extrabold mb-1" style={{ color: '#00d4aa', letterSpacing: '-0.02em' }}>
              <AnimatedNumber value={mrr} prefix="RM " duration={1.5} />
            </p>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="#00d4aa" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-medium" style={{ color: '#00d4aa' }}>+12.5%</span>
              </div>
              <span className="text-xs" style={{ color: '#64748b' }}>vs last month</span>
            </div>
            <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0, 212, 170, 0.1)' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((mrr / REVENUE_TARGET) * 100, 100)}%` }}
                transition={{ duration: 1.5, delay: 0.5 }}
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #00d4aa, #00b894)' }}
              ></motion.div>
            </div>
            <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>{Math.round((mrr / REVENUE_TARGET) * 100)}% to RM500k goal</p>
          </div>
        </motion.div>

        {/* Active Hospitals */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          whileHover={{ y: -2, transition: { duration: 0.2 } }}
          style={{
            background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95) 0%, rgba(13, 17, 23, 0.8) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748b' }}>
              Active Hospitals
            </span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(124, 92, 255, 0.15)' }}>
              <svg className="w-4 h-4" fill="#7c5cff" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <p className="text-4xl font-extrabold mb-1" style={{ color: '#e2e8f0', letterSpacing: '-0.02em' }}>
            <AnimatedNumber value={mockHospitals.length} duration={1} />
          </p>
          <p className="text-xs" style={{ color: '#64748b' }}>
            of {TARGET_CLIENTS} target • <span style={{ color: '#7c5cff' }}>{Math.round((mockHospitals.length / TARGET_CLIENTS) * 100)}%</span>
          </p>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(124, 92, 255, 0.15)', color: '#7c5cff' }}>
              +2 this week
            </span>
          </div>
        </motion.div>

        {/* MCs This Month */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          whileHover={{ y: -2, transition: { duration: 0.2 } }}
          style={{
            background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95) 0%, rgba(13, 17, 23, 0.8) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748b' }}>
              MCs This Month
            </span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 212, 170, 0.15)' }}>
              <svg className="w-4 h-4" fill="#00d4aa" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm2 10a1 1 0 10-2 0v3a1 1 0 102 0v-3zm2-3a1 1 0 011 1v5a1 1 0 11-2 0v-5a1 1 0 011-1zm4-1a1 1 0 10-2 0v7a1 1 0 102 0V8z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <p className="text-4xl font-extrabold mb-1" style={{ color: '#e2e8f0', letterSpacing: '-0.02em' }}>
            <AnimatedNumber value={mockHospitals.reduce((sum, h) => sum + h.mcs, 0)} duration={1.2} />
          </p>
          <p className="text-xs" style={{ color: '#64748b' }}>
            RM <AnimatedNumber value={mockHospitals.reduce((sum, h) => sum + h.mcs, 0)} duration={1} /> in MC fees
          </p>
          <div className="flex items-center gap-1 mt-3">
            <svg className="w-3 h-3" fill="#00d4aa" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
            </svg>
            <span className="text-xs" style={{ color: '#00d4aa' }}>+8.2% from last month</span>
          </div>
        </motion.div>

        {/* Conversion Rate */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          whileHover={{ y: -2, transition: { duration: 0.2 } }}
          style={{
            background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95) 0%, rgba(13, 17, 23, 0.8) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748b' }}>
              Conversion Rate
            </span>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)' }}>
              <svg className="w-4 h-4" fill="#f59e0b" viewBox="0 0 20 20">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
              </svg>
            </div>
          </div>
          <p className="text-4xl font-extrabold mb-1" style={{ color: '#e2e8f0', letterSpacing: '-0.02em' }}>
            67<span className="text-2xl">%</span>
          </p>
          <p className="text-xs" style={{ color: '#64748b' }}>
            Lead to customer
          </p>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
              Above target
            </span>
          </div>
        </motion.div>
      </motion.div>
      </ErrorBoundary>

      {/* ═══════════════════════════════════════════════════════════════════
          ROW 2: Revenue Analytics (LEFT) + Live Activity Feed (RIGHT)
          ═══════════════════════════════════════════════════════════════════ */}
      <ErrorBoundary fallbackTitle="Analytics Error" fallbackMessage="Failed to load analytics data">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        {/* LEFT: Revenue & Analytics - Takes 3 columns */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="lg:col-span-3"
          style={{
            background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95) 0%, rgba(13, 17, 23, 0.8) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#e2e8f0' }}>
                Revenue Projection
              </h2>
              <p className="text-xs" style={{ color: '#64748b' }}>
                Path to RM500,000 MRR
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(0, 212, 170, 0.15)' }}>
                <span className="text-xs font-semibold" style={{ color: '#00d4aa' }}>Target: RM500k</span>
              </div>
            </div>
          </div>

          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionData}>
                <defs>
                  <linearGradient id="revenueGradient2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00d4aa" stopOpacity={0.5} />
                    <stop offset="50%" stopColor="#00d4aa" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#00d4aa" stopOpacity={0} />
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="month"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  dx={-10}
                />
                <ReferenceLine
                  y={500000}
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  strokeOpacity={0.6}
                  label={{
                    value: 'Target RM500k',
                    position: 'right',
                    fill: '#f59e0b',
                    fontSize: 10,
                    fontWeight: 600
                  }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const value = payload[0].value;
                      const percentToTarget = ((value / 500000) * 100).toFixed(1);
                      return (
                        <div style={{
                          background: 'rgba(13, 17, 23, 0.98)',
                          border: '1px solid rgba(0, 212, 170, 0.3)',
                          borderRadius: '12px',
                          padding: '12px 16px',
                          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                        }}>
                          <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>{label} 2026</p>
                          <p style={{ color: '#00d4aa', fontSize: '20px', fontWeight: 800, margin: 0 }}>
                            RM {value?.toLocaleString()}
                          </p>
                          <div style={{
                            marginTop: '8px',
                            paddingTop: '8px',
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <div style={{
                              width: '60px',
                              height: '4px',
                              borderRadius: '2px',
                              background: 'rgba(255,255,255,0.1)',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${Math.min(percentToTarget, 100)}%`,
                                height: '100%',
                                background: percentToTarget >= 100 ? '#00d4aa' : '#f59e0b',
                                borderRadius: '2px'
                              }}></div>
                            </div>
                            <span style={{ color: '#64748b', fontSize: '10px' }}>{percentToTarget}% to goal</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#00d4aa"
                  strokeWidth={3}
                  fill="url(#revenueGradient2)"
                  filter="url(#glow)"
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Milestones Row */}
          <motion.div
            className="grid grid-cols-4 gap-3 mt-4 pt-4"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.div
              variants={staggerItem}
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.05)' }}
              className="text-center p-3 rounded-xl cursor-default"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <p className="text-2xl font-extrabold" style={{ color: '#e2e8f0' }}>
                <AnimatedNumber value={6} duration={0.8} />
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider mt-1" style={{ color: '#64748b' }}>Current</p>
            </motion.div>
            <motion.div
              variants={staggerItem}
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(0, 212, 170, 0.08)' }}
              className="text-center p-3 rounded-xl cursor-default"
              style={{ backgroundColor: 'rgba(0, 212, 170, 0.05)', border: '1px solid rgba(0, 212, 170, 0.15)' }}
            >
              <p className="text-2xl font-extrabold" style={{ color: '#00d4aa' }}>
                <AnimatedNumber value={50} duration={1} />
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider mt-1" style={{ color: '#64748b' }}>Q2 Target</p>
            </motion.div>
            <motion.div
              variants={staggerItem}
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(245, 158, 11, 0.08)' }}
              className="text-center p-3 rounded-xl cursor-default"
              style={{ backgroundColor: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.15)' }}
            >
              <p className="text-2xl font-extrabold" style={{ color: '#f59e0b' }}>
                <AnimatedNumber value={120} duration={1.2} />
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider mt-1" style={{ color: '#64748b' }}>Q3 Target</p>
            </motion.div>
            <motion.div
              variants={staggerItem}
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(0, 212, 170, 0.15)' }}
              className="text-center p-3 rounded-xl cursor-default"
              style={{ backgroundColor: 'rgba(0, 212, 170, 0.1)', border: '1px solid rgba(0, 212, 170, 0.25)' }}
            >
              <p className="text-2xl font-extrabold" style={{ color: '#00d4aa' }}>
                <AnimatedNumber value={200} duration={1.4} />
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider mt-1" style={{ color: '#00d4aa' }}>Year End</p>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* RIGHT: Live Activity Feed - Takes 2 columns */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="lg:col-span-2"
          style={{
            background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95) 0%, rgba(13, 17, 23, 0.8) 100%)',
            border: '1px solid rgba(0, 212, 170, 0.15)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 40px rgba(0, 212, 170, 0.05)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#e2e8f0' }}>
                Live Activity
              </h2>
              <p className="text-xs" style={{ color: '#64748b' }}>
                Real-time platform events
              </p>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(0, 212, 170, 0.15)' }}>
              <LivePulseDot color="#00d4aa" size={6} />
              <span className="text-[10px] font-medium" style={{ color: '#00d4aa' }}>LIVE</span>
            </div>
          </div>

          {/* Today's Summary Bar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="grid grid-cols-3 gap-2 mb-4 p-3 rounded-xl"
            style={{ backgroundColor: 'rgba(0, 212, 170, 0.08)', border: '1px solid rgba(0, 212, 170, 0.15)' }}
          >
            <div className="text-center">
              <p className="text-lg font-extrabold" style={{ color: '#00d4aa' }}>
                <AnimatedNumber value={mcFeed.length} duration={0.8} />
              </p>
              <p className="text-[9px] uppercase tracking-wider" style={{ color: '#64748b' }}>MCs Today</p>
            </div>
            <div className="text-center" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-lg font-extrabold" style={{ color: '#e2e8f0' }}>
                <AnimatedNumber value={mockHospitals.length} duration={0.8} />
              </p>
              <p className="text-[9px] uppercase tracking-wider" style={{ color: '#64748b' }}>Hospitals</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-extrabold" style={{ color: '#00d4aa' }}>
                +<AnimatedNumber value={totalProfit} duration={1} decimals={0} />
              </p>
              <p className="text-[9px] uppercase tracking-wider" style={{ color: '#64748b' }}>Revenue</p>
            </div>
          </motion.div>

          {/* Activity Feed */}
          <div
            ref={feedRef}
            className="space-y-2 h-52 overflow-y-auto pr-2 custom-scrollbar"
            style={{ scrollbarWidth: 'thin' }}
          >
            <AnimatePresence>
              {mcFeed.slice(0, 8).map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: 30, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.3, delay: index * 0.05, type: 'spring', stiffness: 300, damping: 25 }}
                  whileHover={{ scale: 1.01, x: 4 }}
                  className="p-3 rounded-xl cursor-default"
                  style={{
                    backgroundColor: index === 0 ? 'rgba(0, 212, 170, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${index === 0 ? 'rgba(0, 212, 170, 0.25)' : 'rgba(255,255,255,0.04)'}`,
                    boxShadow: index === 0 ? '0 4px 20px rgba(0, 212, 170, 0.1)' : 'none',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold relative"
                        style={{ backgroundColor: 'rgba(0, 212, 170, 0.2)', color: '#00d4aa' }}
                        whileHover={{ scale: 1.1 }}
                      >
                        {index === 0 && (
                          <motion.div
                            className="absolute inset-0 rounded-lg"
                            style={{ border: '2px solid #00d4aa' }}
                            animate={{ scale: [1, 1.2, 1], opacity: [1, 0, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          />
                        )}
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                      </motion.div>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: '#e2e8f0' }}>
                          {item.hospital.name}
                        </p>
                        <p className="text-[10px] flex items-center gap-1" style={{ color: '#64748b' }}>
                          <span>MC issued</span>
                          <span>•</span>
                          <span>{item.hospital.city}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <motion.p
                        className="text-sm font-bold"
                        style={{ color: '#00d4aa' }}
                        initial={index === 0 ? { scale: 1.2 } : {}}
                        animate={index === 0 ? { scale: 1 } : {}}
                        transition={{ duration: 0.3 }}
                      >
                        +RM{item.profit.toFixed(2)}
                      </motion.p>
                      <p className="text-[10px]" style={{ color: '#64748b' }}>
                        {index === 0 ? (
                          <span className="flex items-center justify-end gap-1">
                            <LivePulseDot color="#00d4aa" size={4} />
                            Just now
                          </span>
                        ) : `${index * 2}m ago`}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div
            className="mt-3 pt-3 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-2">
              <LivePulseDot color="#00d4aa" size={8} />
              <span className="text-[10px]" style={{ color: '#64748b' }}>Listening for events...</span>
            </div>
            <p className="text-sm font-bold" style={{ color: '#00d4aa' }}>
              +RM <AnimatedNumber value={totalProfit} duration={0.8} /> today
            </p>
          </div>
        </motion.div>
      </div>
      </ErrorBoundary>

      {/* ═══════════════════════════════════════════════════════════════════
          ROW 3: Hospital Map (LEFT) + Lead Funnel (RIGHT)
          ═══════════════════════════════════════════════════════════════════ */}
      <ErrorBoundary fallbackTitle="Network Error" fallbackMessage="Failed to load network data">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6" data-section="pipeline">
        {/* LEFT: Sarawak Hospital Network Map */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          style={{
            background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95) 0%, rgba(13, 17, 23, 0.8) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: '#e2e8f0' }}>
                <svg className="w-5 h-5" fill="#7c5cff" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                Sarawak Network
              </h2>
              <p className="text-xs" style={{ color: '#64748b' }}>
                {mockHospitals.length} active healthcare facilities
              </p>
            </div>
            <motion.div
              className="px-3 py-1.5 rounded-lg flex items-center gap-2"
              style={{ backgroundColor: 'rgba(124, 92, 255, 0.15)', border: '1px solid rgba(124, 92, 255, 0.25)' }}
              whileHover={{ scale: 1.02 }}
            >
              <LivePulseDot color="#7c5cff" size={6} />
              <span className="text-xs font-semibold" style={{ color: '#7c5cff' }}>
                <AnimatedNumber value={mockHospitals.length} duration={0.8} /> Active
              </span>
            </motion.div>
          </div>

          <SarawakMap clients={mockHospitals} />

          {/* Regional Breakdown */}
          <motion.div
            className="grid grid-cols-3 gap-2 mt-4 mb-4"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {[
              { region: 'Kuching', count: 3, color: '#00d4aa' },
              { region: 'Miri', count: 2, color: '#7c5cff' },
              { region: 'Sibu', count: 1, color: '#f59e0b' },
            ].map((item, index) => (
              <motion.div
                key={item.region}
                variants={staggerItem}
                whileHover={{ scale: 1.03, y: -2 }}
                className="text-center p-2 rounded-lg cursor-default"
                style={{ backgroundColor: `${item.color}10`, border: `1px solid ${item.color}25` }}
              >
                <p className="text-lg font-bold" style={{ color: item.color }}>
                  <AnimatedNumber value={item.count} duration={0.6 + index * 0.2} />
                </p>
                <p className="text-[9px] uppercase tracking-wider" style={{ color: '#64748b' }}>{item.region}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Progress Bar */}
          <div className="pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>Market Coverage</span>
              <span className="text-xs font-bold" style={{ color: '#00d4aa' }}>
                <AnimatedNumber value={mockHospitals.length} duration={0.8} />/{TARGET_CLIENTS} (<AnimatedNumber value={Math.round((mockHospitals.length / TARGET_CLIENTS) * 100)} duration={1} />%)
              </span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(mockHospitals.length / TARGET_CLIENTS) * 100}%` }}
                transition={{ duration: 1.5, delay: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full relative"
                style={{ background: 'linear-gradient(90deg, #00d4aa, #7c5cff)' }}
              >
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)' }}
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                />
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* RIGHT: Sales Pipeline / Lead Funnel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          style={{
            background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95) 0%, rgba(13, 17, 23, 0.8) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: '#e2e8f0' }}>
                <svg className="w-5 h-5" fill="#f59e0b" viewBox="0 0 20 20">
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
                Sales Pipeline
              </h2>
              <p className="text-xs" style={{ color: '#64748b' }}>
                Lead conversion funnel
              </p>
            </div>
            <motion.div
              className="px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'rgba(0, 212, 170, 0.15)', border: '1px solid rgba(0, 212, 170, 0.25)' }}
              whileHover={{ scale: 1.02 }}
            >
              <span className="text-xs font-bold" style={{ color: '#00d4aa' }}>
                RM <AnimatedNumber value={hospitalLeads.reduce((sum, lead) => sum + calculateLeadValue(lead.estimatedMCs), 0)} duration={1.2} />/mo
              </span>
            </motion.div>
          </div>

          {/* Funnel Visualization */}
          <div className="space-y-3">
            {[
              { stage: 'Leads', count: hospitalLeads.length + 12, pct: 100, color: '#64748b', icon: '🎯' },
              { stage: 'Qualified', count: hospitalLeads.length + 4, pct: 75, color: '#7c5cff', icon: '✓' },
              { stage: 'Proposal Sent', count: hospitalLeads.length, pct: 50, color: '#f59e0b', icon: '📋' },
              { stage: 'Negotiating', count: Math.floor(hospitalLeads.length * 0.6), pct: 30, color: '#3b82f6', icon: '🤝' },
              { stage: 'Closed Won', count: closedDeals.length + mockHospitals.length, pct: 15, color: '#00d4aa', icon: '🎉' },
            ].map((item, index) => (
              <motion.div
                key={item.stage}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.6 + (index * 0.1) }}
                whileHover={{ x: 4 }}
                className="group cursor-default"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{item.icon}</span>
                    <span className="text-xs font-medium group-hover:text-white transition-colors" style={{ color: '#94a3b8' }}>{item.stage}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: item.color }}>
                      <AnimatedNumber value={item.count} duration={0.8 + index * 0.1} />
                    </span>
                    {index === 4 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${item.color}20`, color: item.color }}>
                        +{closedDeals.length} new
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.pct}%` }}
                    transition={{ duration: 1.2, delay: 0.8 + (index * 0.15), ease: 'easeOut' }}
                    className="h-full rounded-full relative"
                    style={{ background: `linear-gradient(90deg, ${item.color}cc, ${item.color})` }}
                  >
                    {index === 4 && (
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }}
                        animate={{ x: ['-100%', '200%'] }}
                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 2 }}
                      />
                    )}
                  </motion.div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Conversion Rate */}
          <motion.div
            className="mt-4 pt-4 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>Overall Conversion</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(0, 212, 170, 0.15)', color: '#00d4aa' }}>
                Above Average
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-2xl font-extrabold" style={{ color: '#00d4aa' }}>
                <AnimatedNumber value={67} duration={1.5} />
              </span>
              <span className="text-sm font-bold" style={{ color: '#00d4aa' }}>%</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
      </ErrorBoundary>

      {/* ═══════════════════════════════════════════════════════════════════
          ROW 4: Infrastructure Status (Full Width)
          ═══════════════════════════════════════════════════════════════════ */}
      <ErrorBoundary fallbackTitle="Infrastructure Error" fallbackMessage="Failed to load infrastructure status">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        className="mb-6"
        style={{
          background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95) 0%, rgba(13, 17, 23, 0.8) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#e2e8f0' }}>
              Infrastructure Status
            </h2>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Blockchain nodes, DR systems, network health
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(0, 212, 170, 0.15)' }}>
              <LivePulseDot color="#00d4aa" size={8} />
              <span className="text-xs font-medium" style={{ color: '#00d4aa' }}>99.99% Uptime</span>
            </div>
            <motion.div
              className="px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'rgba(124, 92, 255, 0.15)' }}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.15 }}
            >
              <span className="text-xs font-medium" style={{ color: '#7c5cff' }}>Bank-Level Security</span>
            </motion.div>
          </div>
        </div>

        {/* Node Status Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {blockchainNodes.map((node, index) => (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.9 + (index * 0.05) }}
              className="p-3 rounded-xl"
              style={{
                backgroundColor: node.status === 'online' ? 'rgba(0, 212, 170, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                border: `1px solid ${node.status === 'online' ? 'rgba(0, 212, 170, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                {node.status === 'online' ? (
                  <LivePulseDot color="#00d4aa" size={8} />
                ) : (
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: '#f59e0b' }}
                  ></span>
                )}
                <span className="text-xs font-medium" style={{ color: '#e2e8f0' }}>{node.city}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                <div>
                  <p style={{ color: '#64748b' }}>Latency</p>
                  <p style={{ color: node.latency < 20 ? '#00d4aa' : '#f59e0b' }}>{node.latency}ms</p>
                </div>
                <div>
                  <p style={{ color: '#64748b' }}>Blocks</p>
                  <p style={{ color: '#94a3b8' }}>{(node.blocks / 1000).toFixed(1)}k</p>
                </div>
                <div>
                  <p style={{ color: '#64748b' }}>Peers</p>
                  <p style={{ color: '#94a3b8' }}>{node.peers}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Network Summary */}
        <div
          className="mt-4 pt-4 grid grid-cols-4 gap-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="text-center">
            <p className="text-lg font-bold" style={{ color: '#00d4aa' }}>
              {blockchainNodes.filter(n => n.status === 'online').length}/{blockchainNodes.length}
            </p>
            <p className="text-xs" style={{ color: '#64748b' }}>Nodes Online</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold" style={{ color: '#00d4aa' }}>
              {blockchainNodes[0].blocks.toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: '#64748b' }}>Block Height</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold" style={{ color: '#7c5cff' }}>
              {blockchainNodes.reduce((sum, n) => sum + n.peers, 0)}
            </p>
            <p className="text-xs" style={{ color: '#64748b' }}>Total Peers</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold" style={{ color: '#00d4aa' }}>
              &lt;50ms
            </p>
            <p className="text-xs" style={{ color: '#64748b' }}>Avg Latency</p>
          </div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════════
          SALES PIPELINE TABLE (Simplified)
          ═══════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.9 }}
        className="mb-6"
        style={{
          background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95) 0%, rgba(13, 17, 23, 0.8) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#e2e8f0' }}>
              High-Value Leads
            </h2>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Hospital pipeline from Request Access
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(0, 212, 170, 0.15)' }}>
              <span className="text-xs font-semibold" style={{ color: '#00d4aa' }}>
                {hospitalLeads.length} Active Leads
              </span>
            </div>
          </div>
        </div>

        {/* Leads Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>Facility</th>
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>Type</th>
                <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>Est. MCs</th>
                <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>Value</th>
                <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {hospitalLeads.slice(0, 5).map((lead, index) => {
                const leadValue = calculateLeadValue(lead.estimatedMCs);
                return (
                  <motion.tr
                    key={lead.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <td className="py-3 px-4">
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#e2e8f0' }}>{lead.facilityName}</p>
                        <p className="text-xs" style={{ color: '#64748b' }}>{lead.email}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="px-2 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: lead.facilityType === 'Private Hospital' ? 'rgba(0, 212, 170, 0.15)' : 'rgba(124, 92, 255, 0.15)',
                          color: lead.facilityType === 'Private Hospital' ? '#00d4aa' : '#7c5cff'
                        }}
                      >
                        {lead.facilityType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <p className="text-sm font-bold" style={{ color: '#e2e8f0' }}>{lead.estimatedMCs.toLocaleString()}</p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <p className="text-sm font-bold" style={{ color: '#00d4aa' }}>
                        RM {leadValue.toLocaleString()}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <AnimatedButton
                        onClick={() => openProposal(lead)}
                        variant="secondary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        Send Proposal
                      </AnimatedButton>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>
      </ErrorBoundary>

      {/* Close main content area */}
      </main>

      {/* ═══════════════════════════════════════════════════════════════════
          STICKY BOTTOM BAR - Live Transaction Ticker
          ═══════════════════════════════════════════════════════════════════ */}
      <footer
        className="fixed bottom-0 left-0 right-0 z-50 px-6 py-2"
        style={{
          backgroundColor: 'rgba(10, 14, 20, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div className="flex items-center justify-between" style={{ maxWidth: '1600px', margin: '0 auto' }}>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <LivePulseDot color="#00d4aa" size={8} />
              <span className="text-xs font-medium" style={{ color: '#00d4aa' }}>Live Transactions</span>
            </div>
            <div className="overflow-hidden" style={{ maxWidth: '600px' }}>
              <div className="animate-marquee whitespace-nowrap">
                {mcFeed.slice(0, 5).map((item, i) => (
                  <motion.span
                    key={i}
                    className="inline-flex items-center gap-2 mx-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <span className="text-xs" style={{ color: '#64748b' }}>{item.hospital.name}</span>
                    <span className="text-xs font-bold" style={{ color: '#00d4aa' }}>+RM{item.profit.toFixed(2)}</span>
                  </motion.span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs" style={{ color: '#64748b' }}>Today's Revenue</p>
              <p className="text-sm font-bold" style={{ color: '#00d4aa' }}>
                +RM <AnimatedNumber value={totalProfit} duration={0.8} />
              </p>
            </div>
            <motion.div
              className="px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'rgba(0, 212, 170, 0.15)' }}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.15 }}
            >
              <span className="text-xs font-medium" style={{ color: '#00d4aa' }}>Enterprise Grade</span>
            </motion.div>
          </div>
        </div>
      </footer>

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
      <AnimatePresence>
        {dealNotification && (
          <motion.div
            className="fixed bottom-6 right-6 z-50"
            variants={slideInRight}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              className="rounded-2xl p-6 border shadow-2xl min-w-[380px]"
              style={{
                backgroundColor: theme.bgCard,
                borderColor: theme.success,
                boxShadow: `0 0 40px ${theme.success}40`
              }}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex items-start gap-4">
                {/* Success Icon */}
                <motion.div
                  className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${theme.success}20` }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.2 }}
                >
                  <svg className="w-6 h-6" fill={theme.success} viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </motion.div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <LivePulseDot color={theme.success} size={8} />
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: theme.success }}>
                      Deal Closed
                    </p>
                  </div>
                  <motion.p
                    className="font-bold text-lg mb-1"
                    style={{ color: theme.textPrimary }}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    {dealNotification.facilityName}
                  </motion.p>
                  <p className="text-sm mb-3" style={{ color: theme.textSecondary }}>
                    Payment received and recorded on blockchain
                  </p>
                  <motion.div
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl"
                    style={{ backgroundColor: `${theme.success}15` }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <span className="text-sm" style={{ color: theme.textSecondary }}>Revenue Added:</span>
                    <span className="text-xl font-black" style={{ color: theme.success }}>
                      +RM <AnimatedNumber value={dealNotification.value || 0} duration={0.8} />
                    </span>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════
          PHASE 5: Command Bar (Cmd+K)
          ═══════════════════════════════════════════════════════════════════ */}
      <CommandBar
        open={commandBarOpen}
        onOpenChange={setCommandBarOpen}
        commands={commandBarCommands}
        recentCommands={recentCommands}
        onCommandExecute={handleCommandExecute}
        placeholder="Search commands, hospitals, or actions..."
      />

      {/* ═══════════════════════════════════════════════════════════════════
          PHASE 5: Confirmation Modal (for critical actions)
          ═══════════════════════════════════════════════════════════════════ */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, type: null })}
        onConfirm={() => {
          if (confirmModal.type === 'logout') {
            setIsAuthenticated(false);
            toast.success('Logged out successfully');
          }
          setConfirmModal({ isOpen: false, type: null });
        }}
        title={confirmModal.type === 'logout' ? 'Confirm Logout' : 'Confirm Action'}
        message={confirmModal.type === 'logout' ? 'Are you sure you want to logout from Founder Command?' : 'Are you sure you want to proceed?'}
        variant={confirmModal.type === 'logout' ? 'warning' : 'danger'}
        confirmText="Confirm"
        cancelText="Cancel"
      />

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
        /* Phase 5: cmdk styles */
        [cmdk-group-heading] {
          padding: 8px 8px 4px;
        }
        [cmdk-item] {
          content-visibility: auto;
        }
        [cmdk-item][data-selected='true'] {
          background: rgba(20, 184, 166, 0.1);
        }
        [cmdk-item][data-selected='true'] span {
          background: rgba(20, 184, 166, 0.2) !important;
          border-color: rgba(20, 184, 166, 0.4) !important;
        }
        [cmdk-item]:active {
          transition-property: background;
          background: rgba(20, 184, 166, 0.15);
        }
        [cmdk-list] {
          scroll-padding-block-start: 8px;
          scroll-padding-block-end: 8px;
        }
        [cmdk-list]::-webkit-scrollbar {
          width: 6px;
        }
        [cmdk-list]::-webkit-scrollbar-track {
          background: transparent;
        }
        [cmdk-list]::-webkit-scrollbar-thumb {
          background: rgba(20, 184, 166, 0.3);
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}
