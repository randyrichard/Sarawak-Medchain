import { Link } from 'react-router-dom';

/**
 * 404 page — institutional design matching the rest of the site.
 * Shown for any URL that doesn't match a registered route.
 */
export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F8FAFC',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        maxWidth: '560px',
        width: '100%',
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '20px',
        padding: '56px 40px',
        textAlign: 'center',
        boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
      }}>
        {/* Brand mark */}
        <div style={{
          width: '56px',
          height: '56px',
          margin: '0 auto 32px',
          borderRadius: '14px',
          background: 'linear-gradient(135deg, #0F2A5C 0%, #1E3A8A 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(15, 42, 92, 0.15)',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>

        {/* Big 404 mark */}
        <p style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#0F766E',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          margin: '0 0 12px 0',
        }}>
          Error 404
        </p>

        <h1 style={{
          fontSize: '32px',
          fontWeight: 700,
          color: '#0F172A',
          margin: '0 0 12px 0',
          letterSpacing: '-0.02em',
        }}>
          Page not found
        </h1>

        <p style={{
          fontSize: '16px',
          color: '#64748B',
          lineHeight: 1.6,
          margin: '0 0 36px 0',
        }}>
          The page you're looking for doesn't exist or has moved. If you arrived here from a QR code on a medical certificate, the link may be invalid — please contact the issuing facility.
        </p>

        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '32px',
        }}>
          <Link
            to="/"
            style={{
              padding: '12px 24px',
              background: '#0F2A5C',
              color: '#FFFFFF',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '10px',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 3px rgba(15, 42, 92, 0.2)',
            }}
          >
            Back to Home
          </Link>
          <Link
            to="/gov-preview"
            style={{
              padding: '12px 24px',
              background: '#FFFFFF',
              color: '#0F2A5C',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '10px',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
              border: '1px solid #E2E8F0',
            }}
          >
            Government Preview
          </Link>
        </div>

        {/* Quick links footer */}
        <div style={{
          paddingTop: '28px',
          borderTop: '1px solid #F1F5F9',
          display: 'flex',
          gap: '20px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          <Link to="/pitch" style={{ fontSize: '13px', color: '#64748B', textDecoration: 'none', fontWeight: 500 }}>For Hospitals</Link>
          <span style={{ color: '#CBD5E1' }}>·</span>
          <Link to="/demo" style={{ fontSize: '13px', color: '#64748B', textDecoration: 'none', fontWeight: 500 }}>Try Demo</Link>
          <span style={{ color: '#CBD5E1' }}>·</span>
          <Link to="/status" style={{ fontSize: '13px', color: '#64748B', textDecoration: 'none', fontWeight: 500 }}>System Status</Link>
        </div>
      </div>
    </div>
  );
}
