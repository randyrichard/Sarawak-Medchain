/**
 * Badge — a small pill label. tone: 'teal' | 'green' | 'amber' | 'red' | 'neutral'
 */
const TONES = {
  teal:    { bg: 'rgba(15, 118, 110, .08)', fg: 'var(--mc-teal-700)' },
  green:   { bg: 'rgba(16, 185, 129, .10)', fg: 'var(--mc-green)' },
  amber:   { bg: 'rgba(217, 119, 6, .10)',  fg: 'var(--mc-amber)' },
  red:     { bg: 'rgba(220, 38, 38, .08)',  fg: 'var(--mc-red)' },
  neutral: { bg: 'var(--mc-surface-2)',     fg: 'var(--mc-slate-500)' },
};

export default function Badge({ tone = 'teal', children, style }) {
  const t = TONES[tone] || TONES.teal;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: 'var(--mc-radius-pill)',
        fontSize: '0.72rem',
        fontWeight: 700,
        background: t.bg,
        color: t.fg,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
