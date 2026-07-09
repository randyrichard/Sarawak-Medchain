/**
 * Card — the standard surface. Institutional white panel with the shared
 * border, radius and elevation. Pass `hover` for the lift-on-hover behaviour.
 */
export default function Card({ children, hover = false, style, className = '', ...rest }) {
  return (
    <div
      className={`mc-card ${hover ? 'mc-card--hover' : ''} ${className}`}
      style={{
        background: 'var(--mc-surface)',
        border: '1.5px solid var(--mc-border)',
        borderRadius: 'var(--mc-radius)',
        padding: '26px',
        boxShadow: 'var(--mc-shadow)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * CardHeader — icon tile + title + subtitle, used at the top of a Card.
 */
export function CardHeader({ icon, title, subtitle, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
      {icon && (
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'var(--mc-grad-teal)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: '#fff',
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--mc-ink)' }}>{title}</h2>
        {subtitle && <span style={{ fontSize: '0.75rem', color: 'var(--mc-slate-400)' }}>{subtitle}</span>}
      </div>
      {right}
    </div>
  );
}
