import { useState, useEffect } from 'react';
import PageHeader from '../ui/PageHeader';

// Premium Hospital CEO Dashboard - Worth RM10K/month
export default function HospitalCEODashboard() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [hoveredCard, setHoveredCard] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Time update
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Static demo data
  const doctors = [
    { name: 'Dr. Sarah Lim', dept: 'General Practice', mcs: 156, status: 'online' },
    { name: 'Dr. Ahmad Razak', dept: 'Internal Medicine', mcs: 142, status: 'online' },
    { name: 'Dr. Wong Mei Ling', dept: 'Pediatrics', mcs: 128, status: 'offline' },
    { name: 'Dr. Kumar Rajan', dept: 'Orthopedics', mcs: 98, status: 'online' },
    { name: 'Dr. Fatimah Abdullah', dept: 'Dermatology', mcs: 89, status: 'offline' },
  ];

  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const fmtDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const recentMCs = [
    { id: 'MC-2026-0847', patient: 'Ahmad Y.', doctor: 'Dr. Sarah Lim', date: fmtDate(today), status: 'verified' },
    { id: 'MC-2026-0846', patient: 'Siti A.', doctor: 'Dr. Ahmad Razak', date: fmtDate(today), status: 'verified' },
    { id: 'MC-2026-0845', patient: 'Wong K.', doctor: 'Dr. Wong Mei Ling', date: fmtDate(today), status: 'pending' },
    { id: 'MC-2026-0844', patient: 'Raju K.', doctor: 'Dr. Kumar Rajan', date: fmtDate(yesterday), status: 'verified' },
    { id: 'MC-2026-0843', patient: 'Farah H.', doctor: 'Dr. Fatimah Abdullah', date: fmtDate(yesterday), status: 'verified' },
  ];

  const systemStatus = [
    { name: 'Blockchain Node', status: 'operational' },
    { name: 'IPFS Gateway', status: 'operational' },
    { name: 'API Server', status: 'operational' },
    { name: 'Database', status: 'operational' },
  ];

  // Premium Styles - Responsive
  const styles = {
    container: {
      minHeight: '100vh',
      background: '#F1F5F9',
      color: '#64748B',
      padding: 0,
      fontFamily: "'Plus Jakarta Sans','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    },
    contentWrap: {
      padding: isMobile ? '16px' : '40px 40px 72px',
      maxWidth: '1280px',
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: isMobile ? 'flex-start' : 'flex-start',
      marginBottom: isMobile ? '24px' : '40px',
      flexWrap: 'wrap',
      gap: isMobile ? '16px' : '24px',
      flexDirection: isMobile ? 'column' : 'row',
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: isMobile ? '12px' : '16px',
    },
    logoContainer: {
      width: isMobile ? '44px' : '56px',
      height: isMobile ? '44px' : '56px',
      background: 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)',
      borderRadius: isMobile ? '10px' : '14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 20px rgba(15, 118, 110, 0.3)',
      flexShrink: 0,
    },
    titleWrapper: {
      position: 'relative',
    },
    title: {
      fontSize: isMobile ? '20px' : '32px',
      fontWeight: '800',
      margin: 0,
      color: '#0F172A',
      letterSpacing: '-0.5px',
    },
    titleUnderline: {
      position: 'absolute',
      bottom: '-8px',
      left: 0,
      width: isMobile ? '40px' : '60px',
      height: '3px',
      background: 'linear-gradient(90deg, #0F766E, transparent)',
      borderRadius: '2px',
    },
    subtitle: {
      color: '#94a3b8',
      fontSize: isMobile ? '12px' : '14px',
      marginTop: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    liveDot: {
      width: '8px',
      height: '8px',
      background: '#10b981',
      borderRadius: '50%',
      boxShadow: '0 0 12px #10b981',
      animation: 'pulse 2s ease-in-out infinite',
    },
    dateTime: {
      textAlign: isMobile ? 'left' : 'right',
      color: '#94a3b8',
    },
    metricsGrid: {
      display: 'grid',
      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: isMobile ? '12px' : '24px',
      marginBottom: isMobile ? '20px' : '32px',
    },
    metricCard: (isHovered) => ({
      background: '#FFFFFF',
      border: `1.5px solid ${isHovered ? '#99F6E4' : '#E8EDF3'}`,
      borderRadius: isMobile ? '14px' : '18px',
      padding: isMobile ? '16px' : '26px',
      transition: 'all 0.3s ease',
      transform: isHovered && !isMobile ? 'translateY(-2px)' : 'translateY(0)',
      boxShadow: isHovered && !isMobile
        ? '0 12px 28px rgba(15, 118, 110, 0.10)'
        : '0 1px 3px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.03)',
      cursor: 'default',
    }),
    cardLabel: {
      color: '#94a3b8',
      fontSize: isMobile ? '10px' : '12px',
      marginBottom: isMobile ? '8px' : '12px',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      fontWeight: '500',
    },
    cardValue: {
      fontSize: isMobile ? '24px' : '36px',
      fontWeight: '700',
      color: '#0F766E',
      margin: 0,
      lineHeight: 1,
    },
    cardSubtext: {
      color: '#64748b',
      fontSize: isMobile ? '11px' : '13px',
      marginTop: isMobile ? '6px' : '8px',
    },
    twoColumns: {
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(420px, 1fr))',
      gap: isMobile ? '16px' : '24px',
      marginBottom: isMobile ? '20px' : '32px',
    },
    sectionCard: {
      background: '#FFFFFF',
      border: '1.5px solid #E8EDF3',
      borderRadius: isMobile ? '14px' : '18px',
      padding: isMobile ? '16px' : '26px',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.03)',
    },
    sectionHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: isMobile ? '16px' : '20px',
    },
    sectionTitle: {
      fontSize: isMobile ? '14px' : '16px',
      fontWeight: '600',
      color: '#1E293B',
      margin: 0,
    },
    viewAllBtn: {
      background: 'transparent',
      border: '1px solid #E2E8F0',
      borderRadius: '8px',
      padding: isMobile ? '5px 10px' : '6px 14px',
      color: '#0F766E',
      fontSize: isMobile ? '11px' : '12px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
    tableWrapper: {
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: isMobile ? '12px' : '14px',
      minWidth: isMobile ? '500px' : 'auto',
    },
    th: {
      textAlign: 'left',
      padding: isMobile ? '10px 6px' : '12px 8px',
      borderBottom: '1px solid #E2E8F0',
      color: '#94a3b8',
      fontSize: isMobile ? '10px' : '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      whiteSpace: 'nowrap',
    },
    td: {
      padding: isMobile ? '10px 6px' : '14px 8px',
      borderBottom: '1px solid #F1F5F9',
      whiteSpace: 'nowrap',
    },
    statusBadge: (status) => ({
      display: 'inline-block',
      padding: isMobile ? '4px 8px' : '5px 12px',
      borderRadius: '20px',
      fontSize: isMobile ? '10px' : '11px',
      fontWeight: '600',
      background: status === 'online' || status === 'verified' || status === 'operational'
        ? 'rgba(16, 185, 129, 0.15)'
        : 'rgba(245, 158, 11, 0.15)',
      color: status === 'online' || status === 'verified' || status === 'operational'
        ? '#10b981'
        : '#f59e0b',
    }),
    mcItem: {
      padding: isMobile ? '12px' : '14px',
      background: '#F8FAFC',
      borderRadius: '10px',
      marginBottom: isMobile ? '8px' : '10px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      transition: 'background 0.2s ease',
      gap: '12px',
    },
    mcId: {
      color: '#0F766E',
      fontFamily: 'monospace',
      fontSize: isMobile ? '11px' : '13px',
      fontWeight: '600',
    },
    billingBox: {
      background: 'linear-gradient(135deg, rgba(15, 118, 110, 0.06) 0%, rgba(15, 118, 110, 0.02) 100%)',
      border: '1px solid rgba(15, 118, 110, 0.2)',
      borderRadius: isMobile ? '10px' : '14px',
      padding: isMobile ? '16px' : '24px',
      marginBottom: isMobile ? '16px' : '20px',
    },
    billingRow: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: isMobile ? '8px 0' : '10px 0',
      borderBottom: '1px solid #F1F5F9',
      fontSize: isMobile ? '13px' : '14px',
    },
    billingTotal: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: isMobile ? '12px 0' : '16px 0',
      marginTop: '8px',
    },
    billingTotalLabel: {
      fontSize: isMobile ? '14px' : '16px',
      fontWeight: '600',
      color: '#1E293B',
    },
    billingTotalValue: {
      fontSize: isMobile ? '22px' : '28px',
      fontWeight: '700',
      color: '#10b981',
    },
    buttonRow: {
      display: 'flex',
      gap: isMobile ? '8px' : '12px',
      marginTop: '8px',
      flexDirection: isMobile ? 'column' : 'row',
    },
    buttonCyan: {
      flex: 1,
      padding: isMobile ? '12px' : '14px',
      background: 'rgba(15, 118, 110, 0.15)',
      border: '1px solid rgba(15, 118, 110, 0.3)',
      borderRadius: '10px',
      color: '#0F766E',
      fontSize: isMobile ? '13px' : '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    },
    buttonGreen: {
      flex: 1,
      padding: isMobile ? '12px' : '14px',
      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      border: 'none',
      borderRadius: '10px',
      color: '#ffffff',
      fontSize: isMobile ? '13px' : '14px',
      fontWeight: '600',
      cursor: 'pointer',
      boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
      transition: 'all 0.2s ease',
    },
    statusItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: isMobile ? '12px' : '14px 16px',
      background: 'rgba(16, 185, 129, 0.05)',
      border: '1px solid rgba(16, 185, 129, 0.15)',
      borderRadius: '10px',
      marginBottom: isMobile ? '8px' : '10px',
    },
    statusDot: {
      width: isMobile ? '8px' : '10px',
      height: isMobile ? '8px' : '10px',
      background: '#10b981',
      borderRadius: '50%',
      boxShadow: '0 0 10px #10b981',
      animation: 'pulse 2s ease-in-out infinite',
    },
    lastChecked: {
      textAlign: 'center',
      color: '#64748b',
      fontSize: isMobile ? '11px' : '12px',
      marginTop: isMobile ? '12px' : '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
    },
    footer: {
      textAlign: 'center',
      padding: isMobile ? '20px' : '32px',
      borderTop: '1px solid #E2E8F0',
      marginTop: isMobile ? '16px' : '24px',
      color: '#94A3B8',
      fontSize: isMobile ? '11px' : '13px',
    },
  };

  return (
    <div style={styles.container}>
      {/* Pulse Animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
      `}</style>

      {/* Standardized institutional header */}
      <PageHeader
        icon={
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        }
        title="Timberland Medical Centre"
        eyebrow="CEO Dashboard"
        maxWidth="1280px"
        actions={
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '700', color: 'var(--mc-ink)', lineHeight: 1 }}>
              {currentTime.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--mc-slate-400)', marginTop: '4px' }}>
              {isMobile
                ? currentTime.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
                : currentTime.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        }
      />

      <div style={styles.contentWrap}>
      {/* Metrics */}
      <div style={styles.metricsGrid}>
        {[
          { label: 'MCs Issued This Month', value: '847', sub: '+12% vs last month', color: '#0F766E' },
          { label: 'Active Doctors', value: '3/5', sub: 'Currently online', color: '#0F766E' },
          { label: 'Subscription Status', value: 'ACTIVE', sub: 'Next billing: 15 Feb 2026', color: '#10b981' },
          { label: 'Verification Rate', value: '98%', sub: 'MCs verified on-chain', color: '#0F766E' },
        ].map((metric, i) => (
          <div
            key={i}
            style={styles.metricCard(hoveredCard === i)}
            onMouseEnter={() => setHoveredCard(i)}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <p style={styles.cardLabel}>{metric.label}</p>
            <p style={{ ...styles.cardValue, color: metric.color }}>{metric.value}</p>
            <p style={styles.cardSubtext}>{metric.sub}</p>
          </div>
        ))}
      </div>

      {/* Two Columns: Doctors & Recent MCs */}
      <div style={styles.twoColumns}>
        {/* Doctor Performance */}
        <div style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Doctor Performance</h3>
            <button style={styles.viewAllBtn}>View All</button>
          </div>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Doctor</th>
                  <th style={styles.th}>Department</th>
                  <th style={{ ...styles.th, textAlign: 'center' }}>MCs</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((doc, i) => (
                  <tr key={i}>
                    <td style={styles.td}>{doc.name}</td>
                    <td style={{ ...styles.td, color: '#94a3b8' }}>{doc.dept}</td>
                    <td style={{ ...styles.td, textAlign: 'center', fontWeight: '600', color: '#0F766E' }}>{doc.mcs}</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <span style={styles.statusBadge(doc.status)}>
                        {doc.status === 'online' ? '● Online' : '○ Offline'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent MCs */}
        <div style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Recent MCs Issued</h3>
            <button style={styles.viewAllBtn}>View All</button>
          </div>
          {recentMCs.map((mc, i) => (
            <div key={i} style={styles.mcItem}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <span style={styles.mcId}>{mc.id}</span>
                <div style={{ color: '#94a3b8', fontSize: isMobile ? '11px' : '12px', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {mc.patient} • {mc.doctor} • {mc.date}
                </div>
              </div>
              <span style={styles.statusBadge(mc.status)}>
                {mc.status === 'verified' ? '✓ Verified' : '⏳ Pending'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Two Columns: Billing & System Status */}
      <div style={styles.twoColumns}>
        {/* Billing */}
        <div style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Billing & Subscription</h3>
          </div>
          <div style={styles.billingBox}>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ color: '#94a3b8', fontSize: isMobile ? '10px' : '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Plan</span>
              <span style={{ float: 'right', color: '#0F766E', fontWeight: '600', fontSize: isMobile ? '10px' : '12px' }}>HOSPITAL TIER</span>
            </div>
            <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: '700', marginBottom: '4px', color: '#1E293B' }}>
              RM 10,000<span style={{ fontSize: isMobile ? '12px' : '14px', color: '#94a3b8', fontWeight: '400' }}>/month</span>
            </div>
            <div style={{ color: '#64748b', fontSize: isMobile ? '11px' : '13px' }}>+ RM 1.00 per MC issued</div>
          </div>
          <div style={styles.billingRow}>
            <span style={{ color: '#94a3b8' }}>Base Fee</span>
            <span style={{ fontWeight: '500' }}>RM 10,000.00</span>
          </div>
          <div style={styles.billingRow}>
            <span style={{ color: '#94a3b8' }}>Variable Fee (847 MCs)</span>
            <span style={{ fontWeight: '500' }}>RM 847.00</span>
          </div>
          <div style={styles.billingTotal}>
            <span style={styles.billingTotalLabel}>Total Due</span>
            <span style={styles.billingTotalValue}>RM 10,847.00</span>
          </div>
          <div style={styles.buttonRow}>
            <button style={styles.buttonCyan}>View Invoice History</button>
            <button style={styles.buttonGreen}>Pay Now</button>
          </div>
        </div>

        {/* System Status */}
        <div style={styles.sectionCard}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>System Status</h3>
          </div>
          {systemStatus.map((item, i) => (
            <div key={i} style={styles.statusItem}>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '12px' }}>
                <span style={styles.statusDot}></span>
                <span style={{ fontWeight: '500', fontSize: isMobile ? '13px' : '14px' }}>{item.name}</span>
              </div>
              <span style={styles.statusBadge(item.status)}>Operational</span>
            </div>
          ))}
          <div style={styles.lastChecked}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            Last checked: Just now
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        Powered by <span style={{ color: '#0F766E', fontWeight: '600' }}>Sarawak MedChain</span> {!isMobile && '•'} {!isMobile && 'Blockchain-Verified Medical Certificates'}
      </div>
      </div>
    </div>
  );
}
