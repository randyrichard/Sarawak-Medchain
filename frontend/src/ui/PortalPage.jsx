/**
 * PortalPage — the shared shell every portal's content sits in.
 *
 * It owns the things each portal used to re-implement (and get wrong): the
 * slate background, the brand font, a scroll-safe container (grows to content
 * height instead of trapping scroll), a full-width header band, and a centered,
 * padded content column. Portals just pass a <PageHeader> and their content.
 */
export default function PortalPage({ header, children, maxWidth = 'var(--mc-content-max)' }) {
  return (
    <div
      style={{
        background: 'var(--mc-bg)',
        minHeight: '100%',
        width: '100%',
        maxWidth: '100%',
        flexShrink: 0, // don't let the flex parent squash us (keeps page scrollable)
        fontFamily: 'var(--mc-font)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {header}
      <div style={{ width: '100%', padding: '40px 32px 72px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth, margin: '0 auto', width: '100%' }}>{children}</div>
      </div>
    </div>
  );
}
