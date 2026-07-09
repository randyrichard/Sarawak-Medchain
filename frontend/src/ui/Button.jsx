/**
 * Button — one button with institutional variants.
 * variant: 'primary' (teal gradient) | 'secondary' (light) | 'ghost'
 */
const VARIANTS = {
  primary: {
    background: 'var(--mc-grad-teal)',
    color: '#fff',
    border: 'none',
    boxShadow: '0 2px 10px rgba(15, 118, 110, .22)',
  },
  secondary: {
    background: 'var(--mc-surface-2)',
    color: 'var(--mc-ink)',
    border: '1px solid var(--mc-border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--mc-teal-700)',
    border: '1px solid var(--mc-teal-border)',
  },
};

export default function Button({ variant = 'primary', children, style, className = '', ...rest }) {
  return (
    <button
      className={`mc-btn ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '12px 18px',
        borderRadius: 'var(--mc-radius-sm)',
        fontSize: '0.9rem',
        fontWeight: 600,
        fontFamily: 'var(--mc-font)',
        ...VARIANTS[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
