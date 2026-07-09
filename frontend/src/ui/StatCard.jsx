/**
 * StatCard — a single metric tile for dashboards (label, big value, sub-line).
 */
export default function StatCard({ label, value, sub, accent = 'var(--mc-teal-700)' }) {
  return (
    <div
      className="mc-card mc-card--hover"
      style={{
        background: 'var(--mc-surface)',
        border: '1.5px solid var(--mc-border)',
        borderRadius: 'var(--mc-radius)',
        padding: '24px',
        boxShadow: 'var(--mc-shadow)',
      }}
    >
      <p style={{ margin: '0 0 10px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--mc-slate-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: accent, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {value}
      </p>
      {sub && <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--mc-slate-500)' }}>{sub}</p>}
    </div>
  );
}
