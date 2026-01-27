// ═══════════════════════════════════════════════════════════════════════════════
// SARAWAK MEDCHAIN DESIGN SYSTEM
// Enterprise-Grade Components for RM 10,000/month Clients
// ═══════════════════════════════════════════════════════════════════════════════

import { forwardRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS - Single Source of Truth
// ═══════════════════════════════════════════════════════════════════════════════

export const tokens = {
  // Core Colors
  colors: {
    // Primary Brand
    teal: {
      50: 'rgba(20, 184, 166, 0.05)',
      100: 'rgba(20, 184, 166, 0.1)',
      200: 'rgba(20, 184, 166, 0.2)',
      300: 'rgba(20, 184, 166, 0.3)',
      400: 'rgba(20, 184, 166, 0.4)',
      500: '#14b8a6',
      600: '#0d9488',
      700: '#0f766e',
      glow: 'rgba(20, 184, 166, 0.3)',
    },
    // Accent Gold
    gold: {
      50: 'rgba(245, 158, 11, 0.05)',
      100: 'rgba(245, 158, 11, 0.1)',
      200: 'rgba(245, 158, 11, 0.2)',
      300: 'rgba(245, 158, 11, 0.3)',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
      700: '#b45309',
      glow: 'rgba(245, 158, 11, 0.4)',
    },
    // Dark Theme
    dark: {
      bg: '#0a0e14',
      card: 'rgba(15, 23, 42, 0.6)',
      cardSolid: '#0f172a',
      elevated: 'rgba(15, 31, 56, 0.8)',
      border: 'rgba(30, 58, 95, 0.5)',
      borderLight: 'rgba(51, 65, 85, 0.3)',
    },
    // Text
    text: {
      primary: '#ffffff',
      secondary: '#94a3b8',
      muted: '#64748b',
      disabled: '#475569',
    },
    // Status
    status: {
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
      purple: '#8b5cf6',
    },
  },

  // Spacing
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
  },

  // Border Radius
  radius: {
    sm: '6px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
    full: '9999px',
  },

  // Shadows
  shadows: {
    card: '0 4px 24px rgba(0, 0, 0, 0.2)',
    cardHover: '0 8px 32px rgba(0, 0, 0, 0.3)',
    tealGlow: '0 0 20px rgba(20, 184, 166, 0.15)',
    tealGlowStrong: '0 0 30px rgba(20, 184, 166, 0.25)',
    goldGlow: '0 0 20px rgba(245, 158, 11, 0.3)',
    goldGlowStrong: '0 0 40px rgba(245, 158, 11, 0.5)',
  },

  // Transitions
  transitions: {
    fast: 'all 0.15s ease',
    normal: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    slow: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CARD COMPONENT - Premium Glass Effect
// ═══════════════════════════════════════════════════════════════════════════════

export const Card = forwardRef(({
  children,
  variant = 'default', // 'default' | 'elevated' | 'outlined' | 'glass'
  glow = false,
  glowColor = 'teal', // 'teal' | 'gold' | 'success' | 'purple'
  hover = true,
  padding = 'lg',
  className = '',
  style = {},
  ...props
}, ref) => {
  const paddingMap = {
    none: '0',
    sm: tokens.spacing.sm,
    md: tokens.spacing.md,
    lg: tokens.spacing.lg,
    xl: tokens.spacing.xl,
  };

  const glowColors = {
    teal: tokens.colors.teal.glow,
    gold: tokens.colors.gold.glow,
    success: 'rgba(16, 185, 129, 0.3)',
    purple: 'rgba(139, 92, 246, 0.3)',
  };

  const baseStyle = {
    backgroundColor: variant === 'glass'
      ? tokens.colors.dark.card
      : variant === 'elevated'
        ? tokens.colors.dark.elevated
        : tokens.colors.dark.cardSolid,
    border: `1px solid ${glow ? glowColors[glowColor] : tokens.colors.teal[200]}`,
    borderRadius: tokens.radius.xl,
    padding: paddingMap[padding],
    backdropFilter: variant === 'glass' ? 'blur(20px)' : undefined,
    boxShadow: glow
      ? `${tokens.shadows.card}, 0 0 20px ${glowColors[glowColor]}`
      : tokens.shadows.card,
    transition: tokens.transitions.normal,
    position: 'relative',
    overflow: 'hidden',
    ...style,
  };

  const hoverStyle = hover ? {
    transform: 'translateY(-2px)',
    boxShadow: glow
      ? `${tokens.shadows.cardHover}, 0 0 30px ${glowColors[glowColor]}`
      : tokens.shadows.cardHover,
  } : {};

  return (
    <div
      ref={ref}
      className={`medchain-card ${hover ? 'card-hover' : ''} ${className}`}
      style={baseStyle}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

// ═══════════════════════════════════════════════════════════════════════════════
// BUTTON COMPONENT - Premium Variants
// ═══════════════════════════════════════════════════════════════════════════════

export const Button = forwardRef(({
  children,
  variant = 'primary', // 'primary' | 'gold' | 'outline' | 'ghost' | 'teal'
  size = 'md', // 'sm' | 'md' | 'lg'
  disabled = false,
  loading = false,
  glow = false,
  fullWidth = false,
  className = '',
  style = {},
  ...props
}, ref) => {
  const sizeStyles = {
    sm: { padding: '8px 16px', fontSize: '13px' },
    md: { padding: '12px 24px', fontSize: '14px' },
    lg: { padding: '16px 32px', fontSize: '16px' },
  };

  const variantStyles = {
    primary: {
      background: `linear-gradient(135deg, ${tokens.colors.teal[500]}, ${tokens.colors.teal[600]})`,
      color: '#ffffff',
      border: 'none',
      boxShadow: glow ? tokens.shadows.tealGlow : 'none',
    },
    gold: {
      background: `linear-gradient(135deg, ${tokens.colors.gold[500]}, ${tokens.colors.gold[600]})`,
      color: '#0a0e14',
      border: 'none',
      boxShadow: glow ? tokens.shadows.goldGlow : 'none',
      fontWeight: '700',
    },
    outline: {
      background: 'transparent',
      color: tokens.colors.teal[500],
      border: `2px solid ${tokens.colors.teal[500]}`,
    },
    ghost: {
      background: 'transparent',
      color: tokens.colors.text.secondary,
      border: 'none',
    },
    teal: {
      background: tokens.colors.teal[100],
      color: tokens.colors.teal[500],
      border: `1px solid ${tokens.colors.teal[200]}`,
    },
  };

  const baseStyle = {
    ...sizeStyles[size],
    ...variantStyles[variant],
    borderRadius: tokens.radius.md,
    fontWeight: '600',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: tokens.transitions.normal,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: fullWidth ? '100%' : 'auto',
    position: 'relative',
    overflow: 'hidden',
    ...style,
  };

  return (
    <button
      ref={ref}
      className={`medchain-btn ${variant === 'gold' ? 'gold-btn-filled' : ''} ${className}`}
      style={baseStyle}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
});

Button.displayName = 'Button';

// ═══════════════════════════════════════════════════════════════════════════════
// STAT CARD COMPONENT - For KPI Displays
// ═══════════════════════════════════════════════════════════════════════════════

export const StatCard = ({
  title,
  value,
  subtitle,
  icon,
  trend, // { value: '+12%', direction: 'up' | 'down' }
  color = 'teal', // 'teal' | 'gold' | 'success' | 'purple' | 'blue'
  size = 'md', // 'sm' | 'md' | 'lg'
  glow = false,
  className = '',
  style = {},
}) => {
  const colorMap = {
    teal: tokens.colors.teal[500],
    gold: tokens.colors.gold[500],
    success: tokens.colors.status.success,
    purple: tokens.colors.status.purple,
    blue: tokens.colors.status.info,
  };

  const glowMap = {
    teal: tokens.colors.teal.glow,
    gold: tokens.colors.gold.glow,
    success: 'rgba(16, 185, 129, 0.3)',
    purple: 'rgba(139, 92, 246, 0.3)',
    blue: 'rgba(59, 130, 246, 0.3)',
  };

  const sizeStyles = {
    sm: { padding: '16px', valueSize: '24px', titleSize: '12px' },
    md: { padding: '20px', valueSize: '32px', titleSize: '13px' },
    lg: { padding: '24px', valueSize: '40px', titleSize: '14px' },
  };

  const baseColor = colorMap[color];
  const baseGlow = glowMap[color];

  return (
    <Card
      glow={glow}
      glowColor={color}
      padding="none"
      className={className}
      style={{
        ...style,
        padding: sizeStyles[size].padding,
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p
            className="uppercase tracking-wider font-semibold mb-2"
            style={{
              color: tokens.colors.text.muted,
              fontSize: sizeStyles[size].titleSize,
              letterSpacing: '0.05em',
            }}
          >
            {title}
          </p>
          <p
            className="font-black"
            style={{
              color: baseColor,
              fontSize: sizeStyles[size].valueSize,
              lineHeight: 1.1,
            }}
          >
            {value}
          </p>
          {subtitle && (
            <p
              className="mt-1"
              style={{
                color: tokens.colors.text.secondary,
                fontSize: '13px',
              }}
            >
              {subtitle}
            </p>
          )}
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <span
                style={{
                  color: trend.direction === 'up' ? tokens.colors.status.success : tokens.colors.status.error,
                  fontSize: '13px',
                  fontWeight: '600',
                }}
              >
                {trend.direction === 'up' ? '↑' : '↓'} {trend.value}
              </span>
            </div>
          )}
        </div>
        {icon && (
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: `${baseColor}15`,
              border: `1px solid ${baseColor}40`,
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION TITLE COMPONENT - For Dashboard Sections
// ═══════════════════════════════════════════════════════════════════════════════

export const SectionTitle = ({
  children,
  subtitle,
  icon,
  badge,
  action,
  className = '',
  style = {},
}) => {
  return (
    <div
      className={`flex items-center justify-between mb-6 ${className}`}
      style={style}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: tokens.colors.teal[100],
              border: `1px solid ${tokens.colors.teal[200]}`,
            }}
          >
            {icon}
          </div>
        )}
        <div>
          <div className="flex items-center gap-3">
            <h2
              className="font-bold"
              style={{
                color: tokens.colors.text.primary,
                fontSize: '20px',
              }}
            >
              {children}
            </h2>
            {badge && (
              <Badge variant={badge.variant} size="sm">
                {badge.text}
              </Badge>
            )}
          </div>
          {subtitle && (
            <p
              className="mt-0.5"
              style={{
                color: tokens.colors.text.muted,
                fontSize: '13px',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && action}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// BADGE COMPONENT - For Status and Labels
// ═══════════════════════════════════════════════════════════════════════════════

export const Badge = ({
  children,
  variant = 'default', // 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple' | 'gold'
  size = 'md', // 'sm' | 'md' | 'lg'
  pulse = false,
  className = '',
  style = {},
}) => {
  const variantStyles = {
    default: {
      backgroundColor: tokens.colors.teal[100],
      color: tokens.colors.teal[500],
      border: `1px solid ${tokens.colors.teal[200]}`,
    },
    success: {
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      color: tokens.colors.status.success,
      border: '1px solid rgba(16, 185, 129, 0.2)',
    },
    warning: {
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      color: tokens.colors.status.warning,
      border: '1px solid rgba(245, 158, 11, 0.2)',
    },
    error: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      color: tokens.colors.status.error,
      border: '1px solid rgba(239, 68, 68, 0.2)',
    },
    info: {
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      color: tokens.colors.status.info,
      border: '1px solid rgba(59, 130, 246, 0.2)',
    },
    purple: {
      backgroundColor: 'rgba(139, 92, 246, 0.1)',
      color: tokens.colors.status.purple,
      border: '1px solid rgba(139, 92, 246, 0.2)',
    },
    gold: {
      backgroundColor: tokens.colors.gold[100],
      color: tokens.colors.gold[600],
      border: `1px solid ${tokens.colors.gold[200]}`,
    },
  };

  const sizeStyles = {
    sm: { padding: '2px 8px', fontSize: '11px' },
    md: { padding: '4px 12px', fontSize: '12px' },
    lg: { padding: '6px 16px', fontSize: '13px' },
  };

  return (
    <span
      className={`inline-flex items-center font-semibold uppercase tracking-wide ${pulse ? 'live-indicator' : ''} ${className}`}
      style={{
        ...variantStyles[variant],
        ...sizeStyles[size],
        borderRadius: tokens.radius.full,
        ...style,
      }}
    >
      {children}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// DIVIDER COMPONENT - Section Separator
// ═══════════════════════════════════════════════════════════════════════════════

export const Divider = ({
  label,
  className = '',
  style = {},
}) => {
  if (label) {
    return (
      <div
        className={`flex items-center gap-4 my-8 ${className}`}
        style={style}
      >
        <div
          className="flex-1 h-px"
          style={{ backgroundColor: tokens.colors.dark.border }}
        />
        <span
          className="text-xs uppercase tracking-wider font-semibold"
          style={{ color: tokens.colors.text.muted }}
        >
          {label}
        </span>
        <div
          className="flex-1 h-px"
          style={{ backgroundColor: tokens.colors.dark.border }}
        />
      </div>
    );
  }

  return (
    <div
      className={`my-8 h-px ${className}`}
      style={{
        backgroundColor: tokens.colors.dark.border,
        ...style,
      }}
    />
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING SKELETON - For Loading States
// ═══════════════════════════════════════════════════════════════════════════════

export const Skeleton = ({
  width = '100%',
  height = '20px',
  borderRadius = tokens.radius.md,
  className = '',
  style = {},
}) => {
  return (
    <div
      className={`skeleton-pulse ${className}`}
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: tokens.colors.dark.border,
        ...style,
      }}
    />
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE INDICATOR - Pulsing Dot for Real-time Data
// ═══════════════════════════════════════════════════════════════════════════════

export const LiveIndicator = ({
  color = 'success', // 'success' | 'warning' | 'error' | 'teal'
  size = 'md', // 'sm' | 'md' | 'lg'
  label,
  className = '',
}) => {
  const colorMap = {
    success: tokens.colors.status.success,
    warning: tokens.colors.status.warning,
    error: tokens.colors.status.error,
    teal: tokens.colors.teal[500],
  };

  const sizeMap = {
    sm: '6px',
    md: '8px',
    lg: '10px',
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative">
        <div
          className="rounded-full live-indicator"
          style={{
            width: sizeMap[size],
            height: sizeMap[size],
            backgroundColor: colorMap[color],
          }}
        />
        <div
          className="absolute inset-0 rounded-full animate-ping"
          style={{
            backgroundColor: colorMap[color],
            opacity: 0.4,
          }}
        />
      </div>
      {label && (
        <span
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: colorMap[color] }}
        >
          {label}
        </span>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ICON WRAPPER - Consistent Icon Styling
// ═══════════════════════════════════════════════════════════════════════════════

export const IconWrapper = ({
  children,
  color = 'teal',
  size = 'md',
  className = '',
  style = {},
}) => {
  const colorMap = {
    teal: { bg: tokens.colors.teal[100], border: tokens.colors.teal[200] },
    gold: { bg: tokens.colors.gold[100], border: tokens.colors.gold[200] },
    success: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.2)' },
    purple: { bg: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.2)' },
    blue: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.2)' },
  };

  const sizeMap = {
    sm: '32px',
    md: '40px',
    lg: '48px',
    xl: '56px',
  };

  return (
    <div
      className={`rounded-xl flex items-center justify-center ${className}`}
      style={{
        width: sizeMap[size],
        height: sizeMap[size],
        backgroundColor: colorMap[color].bg,
        border: `1px solid ${colorMap[color].border}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHART THEME - Consistent Chart Styling
// ═══════════════════════════════════════════════════════════════════════════════

export const chartTheme = {
  colors: {
    primary: tokens.colors.teal[500],
    secondary: tokens.colors.status.purple,
    tertiary: tokens.colors.status.info,
    quaternary: tokens.colors.gold[500],
    success: tokens.colors.status.success,
    warning: tokens.colors.status.warning,
    error: tokens.colors.status.error,
  },
  grid: {
    stroke: tokens.colors.dark.border,
    strokeDasharray: '3 3',
    opacity: 0.5,
  },
  axis: {
    stroke: tokens.colors.text.muted,
    fontSize: 12,
    tickLine: false,
  },
  tooltip: {
    backgroundColor: 'rgba(15, 31, 56, 0.95)',
    borderColor: tokens.colors.teal[500],
    borderRadius: tokens.radius.lg,
    textColor: tokens.colors.text.primary,
    backdropFilter: 'blur(10px)',
  },
  gradients: {
    teal: {
      id: 'tealGradient',
      startColor: tokens.colors.teal[500],
      startOpacity: 0.3,
      endOpacity: 0,
    },
    gold: {
      id: 'goldGradient',
      startColor: tokens.colors.gold[500],
      startOpacity: 0.3,
      endOpacity: 0,
    },
    purple: {
      id: 'purpleGradient',
      startColor: tokens.colors.status.purple,
      startOpacity: 0.3,
      endOpacity: 0,
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT THEME CONSTANTS FOR INLINE STYLES
// ═══════════════════════════════════════════════════════════════════════════════

export const theme = {
  // Master background
  bg: tokens.colors.dark.bg,
  bgCard: tokens.colors.dark.cardSolid,
  bgCardHover: tokens.colors.dark.elevated,

  // Borders
  border: tokens.colors.dark.border,
  borderTeal: tokens.colors.teal[200],

  // Text
  textPrimary: tokens.colors.text.primary,
  textSecondary: tokens.colors.text.secondary,
  textMuted: tokens.colors.text.muted,

  // Accents
  teal: tokens.colors.teal[500],
  gold: tokens.colors.gold[500],
  accent: tokens.colors.status.info,
  success: tokens.colors.status.success,
  warning: tokens.colors.status.warning,
  danger: tokens.colors.status.error,
  purple: tokens.colors.status.purple,

  // Spacing
  sectionGap: tokens.spacing.xl,
  cardGap: tokens.spacing.lg,
  cardPadding: tokens.spacing.lg,

  // Card styles
  cardBorder: `1px solid ${tokens.colors.teal[200]}`,
  cardShadow: tokens.shadows.card,
  cardRadius: tokens.radius.xl,
};

export default {
  Card,
  Button,
  StatCard,
  SectionTitle,
  Badge,
  Divider,
  Skeleton,
  LiveIndicator,
  IconWrapper,
  tokens,
  theme,
  chartTheme,
};
