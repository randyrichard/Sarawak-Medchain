import { motion } from 'framer-motion';

/**
 * SkeletonLoader - Animated loading placeholders
 * Provides visual feedback during async data loading
 */

// Base skeleton with shimmer animation
const SkeletonBase = ({ className = '', style = {} }) => (
  <motion.div
    className={`skeleton-pulse rounded ${className}`}
    style={{
      background: 'linear-gradient(90deg, rgba(30, 41, 59, 0.5) 0%, rgba(51, 65, 85, 0.5) 50%, rgba(30, 41, 59, 0.5) 100%)',
      backgroundSize: '200% 100%',
      ...style,
    }}
    animate={{
      backgroundPosition: ['200% 0', '-200% 0'],
    }}
    transition={{
      duration: 1.5,
      repeat: Infinity,
      ease: 'linear',
    }}
  />
);

// Text line skeleton
export const SkeletonText = ({ width = '100%', height = '16px', className = '' }) => (
  <SkeletonBase
    className={className}
    style={{ width, height, borderRadius: '4px' }}
  />
);

// Heading skeleton
export const SkeletonHeading = ({ width = '60%', className = '' }) => (
  <SkeletonBase
    className={className}
    style={{ width, height: '28px', borderRadius: '6px' }}
  />
);

// Avatar/Icon skeleton
export const SkeletonAvatar = ({ size = 40, className = '' }) => (
  <SkeletonBase
    className={className}
    style={{ width: size, height: size, borderRadius: '50%' }}
  />
);

// Card skeleton
export const SkeletonCard = ({ className = '' }) => (
  <div
    className={`p-6 rounded-xl ${className}`}
    style={{
      background: 'rgba(15, 23, 42, 0.6)',
      border: '1px solid rgba(30, 58, 95, 0.3)',
    }}
  >
    <div className="flex items-center gap-4 mb-4">
      <SkeletonAvatar size={48} />
      <div className="flex-1 space-y-2">
        <SkeletonText width="40%" height="14px" />
        <SkeletonText width="60%" height="20px" />
      </div>
    </div>
    <div className="space-y-3">
      <SkeletonText width="100%" />
      <SkeletonText width="80%" />
      <SkeletonText width="90%" />
    </div>
  </div>
);

// Stat card skeleton
export const SkeletonStatCard = ({ className = '' }) => (
  <div
    className={`p-5 rounded-xl text-center ${className}`}
    style={{
      background: 'rgba(15, 23, 42, 0.6)',
      border: '1px solid rgba(30, 58, 95, 0.3)',
    }}
  >
    <div className="flex justify-center mb-3">
      <SkeletonAvatar size={36} />
    </div>
    <SkeletonText width="60%" height="12px" className="mx-auto mb-2" />
    <SkeletonText width="80%" height="28px" className="mx-auto" />
  </div>
);

// Chart skeleton
export const SkeletonChart = ({ height = 200, className = '' }) => (
  <div
    className={`p-4 rounded-xl ${className}`}
    style={{
      background: 'rgba(15, 23, 42, 0.6)',
      border: '1px solid rgba(30, 58, 95, 0.3)',
    }}
  >
    <div className="flex items-end justify-between gap-2" style={{ height }}>
      {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.45, 0.75, 0.55, 0.85].map((h, i) => (
        <SkeletonBase
          key={i}
          style={{
            flex: 1,
            height: `${h * 100}%`,
            borderRadius: '4px 4px 0 0',
          }}
        />
      ))}
    </div>
    <div className="flex justify-between mt-3">
      {[1, 2, 3, 4, 5].map(i => (
        <SkeletonText key={i} width="40px" height="10px" />
      ))}
    </div>
  </div>
);

// Table skeleton
export const SkeletonTable = ({ rows = 5, columns = 4, className = '' }) => (
  <div
    className={`rounded-xl overflow-hidden ${className}`}
    style={{
      background: 'rgba(15, 23, 42, 0.6)',
      border: '1px solid rgba(30, 58, 95, 0.3)',
    }}
  >
    {/* Header */}
    <div
      className="flex gap-4 p-4"
      style={{ borderBottom: '1px solid rgba(30, 58, 95, 0.3)' }}
    >
      {Array(columns).fill(0).map((_, i) => (
        <SkeletonText key={i} width={`${100 / columns}%`} height="14px" />
      ))}
    </div>
    {/* Rows */}
    {Array(rows).fill(0).map((_, rowIndex) => (
      <div
        key={rowIndex}
        className="flex gap-4 p-4"
        style={{ borderBottom: rowIndex < rows - 1 ? '1px solid rgba(30, 58, 95, 0.2)' : 'none' }}
      >
        {Array(columns).fill(0).map((_, colIndex) => (
          <SkeletonText key={colIndex} width={`${100 / columns}%`} height="16px" />
        ))}
      </div>
    ))}
  </div>
);

// List item skeleton
export const SkeletonListItem = ({ hasAvatar = true, className = '' }) => (
  <div className={`flex items-center gap-4 p-3 ${className}`}>
    {hasAvatar && <SkeletonAvatar size={40} />}
    <div className="flex-1 space-y-2">
      <SkeletonText width="70%" height="14px" />
      <SkeletonText width="50%" height="12px" />
    </div>
    <SkeletonText width="60px" height="24px" />
  </div>
);

// Full section skeleton with header
export const SkeletonSection = ({ title = true, children, className = '' }) => (
  <div className={className}>
    {title && (
      <div className="flex items-center gap-3 mb-4">
        <SkeletonAvatar size={40} />
        <div className="space-y-2">
          <SkeletonText width="150px" height="18px" />
          <SkeletonText width="100px" height="12px" />
        </div>
      </div>
    )}
    {children}
  </div>
);

// Default export with all variants
export default function SkeletonLoader({ variant = 'text', ...props }) {
  const variants = {
    text: SkeletonText,
    heading: SkeletonHeading,
    avatar: SkeletonAvatar,
    card: SkeletonCard,
    'stat-card': SkeletonStatCard,
    chart: SkeletonChart,
    table: SkeletonTable,
    'list-item': SkeletonListItem,
    section: SkeletonSection,
  };

  const Component = variants[variant] || SkeletonText;
  return <Component {...props} />;
}
