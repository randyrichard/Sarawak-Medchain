import { useState, useEffect } from 'react';

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

  const recentMCs = [
    { id: 'MC-2026-0847', patient: 'Ahmad Y.', doctor: 'Dr. Sarah Lim', date: '29 Jan', status: 'verified' },
    { id: 'MC-2026-0846', patient: 'Siti A.', doctor: 'Dr. Ahmad Razak', date: '29 Jan', status: 'verified' },
    { id: 'MC-2026-0845', patient: 'Wong K.', doctor: 'Dr. Wong Mei Ling', date: '29 Jan', status: 'pending' },
    { id: 'MC-2026-0844', patient: 'Raju K.', doctor: 'Dr. Kumar Rajan', date: '28 Jan', status: 'verified' },
    { id: 'MC-2026-0843', patient: 'Farah H.', doctor: 'Dr. Fatimah Abdullah', date: '28 Jan', status: 'verified' },
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
      background: '#0a0e14',
      color: '#e2e8f0',
      padding: isMobile ? '16px' : '32px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
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
      background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
      borderRadius: isMobile ? '10px' : '14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 20px rgba(56, 189, 248, 0.3)',
      flexShrink: 0,
    },
    titleWrapper: {
      position: 'relative',
    },
    title: {
      fontSize: isMobile ? '20px' : '32px',
      fontWeight: '700',
      margin: 0,
      color: '#ffffff',
      letterSpacing: '-0.5px',
    },
    titleUnderline: {
      position: 'absolute',
      bottom: '-8px',
      left: 0,
      width: isMobile ? '40px' : '60px',
      height: '3px',
      background: 'linear-gradient(90deg, #38bdf8, transparent)',
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
      background: 'rgba(15, 23, 42, 0.8)',
      backdropFilter: 'blur(10px)',
      border: `1px solid ${isHovered ? 'rgba(56, 189, 248, 0.4)' : 'rgba(56, 189, 248, 0.2)'}`,
      borderRadius: isMobile ? '12px' : '16px',
      padding: isMobile ? '16px' : '24px',
      transition: 'all 0.3s ease',
      transform: isHovered && !isMobile ? 'translateY(-2px)' : 'translateY(0)',
      boxShadow: isHovered && !isMobile
        ? '0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(56, 189, 248, 0.1)'
        : '0 4px 20px rgba(0,0,0,0.3)',
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
      color: '#38bdf8',
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
      background: 'rgba(15, 23, 42, 0.8)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(56, 189, 248, 0.2)',
      borderRadius: isMobile ? '12px' : '16px',
      padding: isMobile ? '16px' : '24px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
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
      color: '#e2e8f0',
      margin: 0,
    },
    viewAllBtn: {
      background: 'transparent',
      border: '1px solid rgba(56, 189, 248, 0.3)',
      borderRadius: '8px',
      padding: isMobile ? '5px 10px' : '6px 14px',
      color: '#38bdf8',
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
      borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
      color: '#94a3b8',
      fontSize: isMobile ? '10px' : '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      whiteSpace: 'nowrap',
    },
    td: {
      padding: isMobile ? '10px 6px' : '14px 8px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
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
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '10px',
      marginBottom: isMobile ? '8px' : '10px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      transition: 'background 0.2s ease',
      gap: '12px',
    },
    mcId: {
      color: '#38bdf8',
      fontFamily: 'monospace',
      fontSize: isMobile ? '11px' : '13px',
      fontWeight: '600',
    },
    billingBox: {
      background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(56, 189, 248, 0.03) 100%)',
      border: '1px solid rgba(56, 189, 248, 0.2)',
      borderRadius: isMobile ? '10px' : '14px',
      padding: isMobile ? '16px' : '24px',
      marginBottom: isMobile ? '16px' : '20px',
    },
    billingRow: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: isMobile ? '8px 0' : '10px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
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
      color: '#e2e8f0',
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
      background: 'rgba(56, 189, 248, 0.15)',
      border: '1px solid rgba(56, 189, 248, 0.3)',
      borderRadius: '10px',
      color: '#38bdf8',
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
      borderTop: '1px solid rgba(255,255,255,0.08)',
      marginTop: isMobile ? '16px' : '24px',
      color: '#64748b',
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

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerLeft}>
            <div style={styles.logoContainer}>
              <svg width={isMobile ? "22" : "28"} height={isMobile ? "22" : "28"} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div style={styles.titleWrapper}>
              <h1 style={styles.title}>Timberland Medical Centre</h1>
              <div style={styles.titleUnderline}></div>
            </div>
          </div>
          <p style={styles.subtitle}>
            <span style={styles.liveDot}></span>
            CEO Dashboard {!isMobile && '•'} {!isMobile && 'Dr. Ahmad bin Hassan'}
          </p>
        </div>
        <div style={styles.dateTime}>
          <div style={{ fontSize: isMobile ? '18px' : '24px', fontWeight: '600', color: '#e2e8f0', marginBottom: '4px' }}>
            {currentTime.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: isMobile ? '12px' : '14px' }}>
            {isMobile
              ? currentTime.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
              : currentTime.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            }
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div style={styles.metricsGrid}>
        {[
          { label: 'MCs Issued This Month', value: '847', sub: '+12% vs last month', color: '#38bdf8' },
          { label: 'Active Doctors', value: '3/5', sub: 'Currently online', color: '#38bdf8' },
          { label: 'Subscription Status', value: 'ACTIVE', sub: 'Next billing: 15 Feb 2026', color: '#10b981' },
          { label: 'Verification Rate', value: '98%', sub: 'MCs verified on-chain', color: '#38bdf8' },
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
                    <td style={{ ...styles.td, textAlign: 'center', fontWeight: '600', color: '#38bdf8' }}>{doc.mcs}</td>
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
              <span style={{ float: 'right', color: '#38bdf8', fontWeight: '600', fontSize: isMobile ? '10px' : '12px' }}>HOSPITAL TIER</span>
            </div>
            <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: '700', marginBottom: '4px', color: '#ffffff' }}>
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
        Powered by <span style={{ color: '#38bdf8', fontWeight: '600' }}>Sarawak MedChain</span> {!isMobile && '•'} {!isMobile && 'Blockchain-Verified Medical Certificates'}
      </div>
    </div>
  );
}
