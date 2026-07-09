/**
 * PageHeader — the standardized institutional header band for every portal:
 * a teal gradient icon tile, a bold title + uppercase eyebrow, and an optional
 * right-aligned actions slot (wallet badge, refresh, top-up, etc.).
 */
export default function PageHeader({ icon, title, eyebrow, actions, maxWidth = 'var(--mc-content-max)' }) {
  return (
    <header
      style={{
        background: 'var(--mc-surface)',
        borderBottom: '1px solid var(--mc-border)',
        width: '100%',
        padding: '20px 32px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth,
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '13px',
              background: 'var(--mc-grad-teal)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(15, 118, 110, .28)',
              flexShrink: 0,
              color: '#fff',
            }}
          >
            {icon}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--mc-ink)', letterSpacing: '-0.02em' }}>
              {title}
            </h1>
            {eyebrow && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--mc-teal-700)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {eyebrow}
              </span>
            )}
          </div>
        </div>
        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>{actions}</div>
        )}
      </div>
    </header>
  );
}
