import { useNavigate } from 'react-router-dom';
import { Shield, Headphones, Lock } from 'lucide-react';

export default function SLAPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>

      {/* ========== HEADER ========== */}
      <header style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        padding: '64px 24px',
        textAlign: 'center',
      }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%',
          background: 'rgba(15, 118, 110, 0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px auto',
        }}>
          <Shield size={32} color="#2DD4BF" strokeWidth={2} />
        </div>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 800, color: '#FFFFFF', margin: '0 0 12px 0', letterSpacing: '-0.02em' }}>
          Service Level Agreement
        </h1>
        <p style={{ fontSize: '16px', color: '#94A3B8', maxWidth: '520px', margin: '0 auto', lineHeight: 1.6 }}>
          Our commitment to reliability, security, and compliance for Sarawak's healthcare providers.
        </p>
      </header>

      <div style={{ maxWidth: '880px', margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* ========== 99.9% UPTIME GUARANTEE ========== */}
        <section style={{
          background: 'linear-gradient(135deg, #F0FDFA 0%, #CCFBF1 100%)',
          border: '1px solid #99F6E4',
          borderRadius: '16px',
          padding: '40px 32px',
          marginBottom: '32px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <Shield size={24} color="#0F766E" strokeWidth={2.2} />
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0F766E', margin: 0 }}>99.9% Uptime Guarantee</h2>
          </div>
          <p style={{ fontSize: '15px', color: '#134E4A', lineHeight: 1.7, margin: '0 0 24px 0' }}>
            We guarantee <strong>99.9% monthly uptime</strong> for all production services, translating to a maximum of <strong>8.76 hours of downtime per year</strong>. Scheduled maintenance windows are excluded and communicated 72 hours in advance.
          </p>

          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F766E', margin: '0 0 16px 0' }}>Service Credits</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { threshold: 'Below 99.9%', credit: '10% credit', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
              { threshold: 'Below 99.0%', credit: '25% credit', color: '#F97316', bg: 'rgba(249,115,22,0.1)' },
              { threshold: 'Below 95.0%', credit: '50% credit', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
            ].map((row) => (
              <div key={row.threshold} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#FFFFFF', borderRadius: '10px', padding: '14px 20px',
                border: '1px solid #E2E8F0',
              }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#1E293B' }}>{row.threshold}</span>
                <span style={{
                  fontSize: '13px', fontWeight: 700, color: row.color,
                  background: row.bg, padding: '4px 12px', borderRadius: '9999px',
                }}>{row.credit}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ========== DATA HOSTED IN MALAYSIA ========== */}
        <section style={{
          background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
          border: '1px solid #BFDBFE',
          borderRadius: '16px',
          padding: '40px 32px',
          marginBottom: '32px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <span style={{ fontSize: '24px' }}>🇲🇾</span>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1E40AF', margin: 0 }}>Data Hosted in Malaysia</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { title: 'Primary Data in Malaysia', desc: 'All patient records and medical data are stored on servers located within Malaysia.' },
              { title: 'PDPA Compliant', desc: 'Full compliance with the Personal Data Protection Act 2010 (Act 709).' },
              { title: 'No Overseas Transfer Without Consent', desc: 'Data is never transferred outside Malaysia without explicit patient consent.' },
              { title: 'Sarawak-First Approach', desc: 'Infrastructure and operations prioritize Sarawak\'s healthcare ecosystem and local data sovereignty.' },
            ].map((item) => (
              <div key={item.title} style={{
                background: '#FFFFFF', borderRadius: '10px', padding: '16px 20px',
                border: '1px solid #E2E8F0',
              }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B', margin: '0 0 4px 0' }}>{item.title}</p>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ========== 24/7 SUPPORT ========== */}
        <section style={{
          background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)',
          border: '1px solid #BBF7D0',
          borderRadius: '16px',
          padding: '40px 32px',
          marginBottom: '32px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <Headphones size={24} color="#15803D" strokeWidth={2.2} />
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#15803D', margin: 0 }}>24/7 Support</h2>
          </div>
          <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#FFFFFF' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E2E8F0' }}>Severity</th>
                  <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E2E8F0' }}>Availability</th>
                  <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E2E8F0' }}>Response Time</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { severity: 'Critical', avail: '24/7', response: '1 hour', color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
                  { severity: 'High', avail: '24/7', response: '4 hours', color: '#F97316', bg: 'rgba(249,115,22,0.1)' },
                  { severity: 'Medium', avail: 'Business hours', response: '8 hours', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
                  { severity: 'Low', avail: 'Business hours', response: '24 hours', color: '#64748B', bg: 'rgba(100,116,139,0.1)' },
                ].map((row, i) => (
                  <tr key={row.severity} style={{ borderBottom: i < 3 ? '1px solid #F1F5F9' : 'none' }}>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        fontSize: '12px', fontWeight: 700, color: row.color,
                        background: row.bg, padding: '3px 10px', borderRadius: '9999px',
                      }}>{row.severity}</span>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: '14px', color: '#1E293B', fontWeight: 500 }}>{row.avail}</td>
                    <td style={{ padding: '14px 20px', fontSize: '14px', color: '#1E293B', fontWeight: 600 }}>{row.response}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ========== SECURITY ========== */}
        <section style={{
          background: 'linear-gradient(135deg, #FAF5FF 0%, #F3E8FF 100%)',
          border: '1px solid #E9D5FF',
          borderRadius: '16px',
          padding: '40px 32px',
          marginBottom: '48px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <Lock size={24} color="#7C3AED" strokeWidth={2.2} />
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#7C3AED', margin: 0 }}>Security</h2>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
          }}>
            {[
              { title: 'Encryption', desc: 'AES-256-GCM encryption for all medical records at rest and in transit.' },
              { title: 'Blockchain', desc: 'Immutable ledger ensures tamper-proof audit trail for every transaction.' },
              { title: 'Access Control', desc: 'Wallet-based authentication — only authorized parties access patient data.' },
              { title: 'Audit Trail', desc: 'Full transaction history with on-chain event logs for compliance audits.' },
            ].map((item) => (
              <div key={item.title} style={{
                background: '#FFFFFF', borderRadius: '10px', padding: '20px',
                border: '1px solid #E2E8F0',
              }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B', margin: '0 0 6px 0' }}>{item.title}</p>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ========== CTA ========== */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => navigate('/connect')}
            style={{
              padding: '16px 48px',
              background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
              color: 'white',
              fontSize: '16px',
              fontWeight: 700,
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(15, 118, 110, 0.3)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 30px rgba(15, 118, 110, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(15, 118, 110, 0.3)';
            }}
          >
            Get Started
          </button>
          <p style={{ fontSize: '13px', color: '#94A3B8', marginTop: '12px' }}>No credit card required. Start your free trial today.</p>
        </div>

      </div>
    </div>
  );
}
