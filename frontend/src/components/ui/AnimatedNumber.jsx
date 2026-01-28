import { useEffect, useRef, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

/**
 * AnimatedNumber - Smooth animated number counter for KPIs
 *
 * @param {number} value - The target number to display
 * @param {string} prefix - Text before the number (e.g., "RM ")
 * @param {string} suffix - Text after the number (e.g., "%")
 * @param {number} duration - Animation duration in seconds (default: 1)
 * @param {boolean} formatNumber - Whether to add thousand separators (default: true)
 * @param {number} decimals - Number of decimal places (default: 0)
 * @param {string} className - Additional CSS classes
 * @param {object} style - Additional inline styles
 */
export default function AnimatedNumber({
  value = 0,
  prefix = '',
  suffix = '',
  duration = 1,
  formatNumber = true,
  decimals = 0,
  className = '',
  style = {},
  springConfig = { damping: 30, stiffness: 100 }
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const previousValue = useRef(0);

  // Spring animation for smooth transitions
  const spring = useSpring(previousValue.current, {
    ...springConfig,
    duration: duration * 1000,
  });

  // Update spring target when value changes
  useEffect(() => {
    spring.set(value);
    previousValue.current = value;
  }, [value, spring]);

  // Subscribe to spring changes
  useEffect(() => {
    const unsubscribe = spring.on('change', (latest) => {
      setDisplayValue(latest);
    });
    return () => unsubscribe();
  }, [spring]);

  // Format the number
  const formattedValue = formatNumber
    ? displayValue.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : displayValue.toFixed(decimals);

  return (
    <motion.span
      className={className}
      style={style}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {prefix}{formattedValue}{suffix}
    </motion.span>
  );
}

/**
 * AnimatedCurrency - Specialized currency display with proper formatting
 */
export function AnimatedCurrency({
  value = 0,
  currency = 'RM',
  duration = 1,
  className = '',
  style = {},
  showSign = false,
}) {
  const isNegative = value < 0;
  const absValue = Math.abs(value);

  return (
    <span className={className} style={style}>
      {showSign && !isNegative && '+'}
      {isNegative && '-'}
      {currency}{' '}
      <AnimatedNumber
        value={absValue}
        duration={duration}
        formatNumber={true}
        decimals={0}
      />
    </span>
  );
}

/**
 * AnimatedPercentage - Percentage display with animation
 */
export function AnimatedPercentage({
  value = 0,
  duration = 1,
  decimals = 1,
  className = '',
  style = {},
  showProgress = false,
  progressColor = '#14b8a6',
}) {
  return (
    <div className={className} style={style}>
      <AnimatedNumber
        value={value}
        suffix="%"
        duration={duration}
        decimals={decimals}
      />
      {showProgress && (
        <motion.div
          className="h-1 rounded-full mt-2"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: progressColor }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(value, 100)}%` }}
            transition={{ duration, ease: 'easeOut' }}
          />
        </motion.div>
      )}
    </div>
  );
}

/**
 * AnimatedCounter - Simple counter with +/- changes highlighted
 */
export function AnimatedCounter({
  value = 0,
  previousValue = null,
  duration = 0.8,
  className = '',
  style = {},
}) {
  const change = previousValue !== null ? value - previousValue : 0;
  const showChange = previousValue !== null && change !== 0;

  return (
    <div className={`inline-flex items-center gap-2 ${className}`} style={style}>
      <AnimatedNumber value={value} duration={duration} />
      {showChange && (
        <motion.span
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          className={`text-sm font-medium ${
            change > 0 ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {change > 0 ? '+' : ''}{change}
        </motion.span>
      )}
    </div>
  );
}

/**
 * AnimatedStatValue - Full stat display with label, value, and optional change indicator
 */
export function AnimatedStatValue({
  label,
  value,
  prefix = '',
  suffix = '',
  change = null,
  changeLabel = '',
  color = '#14b8a6',
  icon = null,
  className = '',
}) {
  const isPositiveChange = change !== null && change > 0;
  const isNegativeChange = change !== null && change < 0;

  return (
    <div className={`text-center ${className}`}>
      {icon && (
        <div
          className="w-10 h-10 mx-auto mb-3 rounded-xl flex items-center justify-center"
          style={{
            backgroundColor: `${color}20`,
            border: `1px solid ${color}40`,
          }}
        >
          {icon}
        </div>
      )}
      <p className="text-sm text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>
        <AnimatedNumber
          value={value}
          prefix={prefix}
          suffix={suffix}
          duration={1.2}
        />
      </p>
      {change !== null && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`text-xs mt-1 font-medium ${
            isPositiveChange ? 'text-green-400' : isNegativeChange ? 'text-red-400' : 'text-slate-500'
          }`}
        >
          {isPositiveChange && '+'}
          {change}
          {changeLabel && ` ${changeLabel}`}
        </motion.p>
      )}
    </div>
  );
}
