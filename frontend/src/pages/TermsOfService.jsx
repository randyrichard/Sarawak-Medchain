import { Link } from 'react-router-dom';
import { useScrollProgress, ScrollProgressBar } from '../components/ScrollEffects';

/**
 * Terms of Service — standard SaaS terms adapted for the
 * pilot stage of Sarawak MedChain. Governed by Malaysian law.
 * Required by procurement processes alongside Privacy Policy.
 */
export default function TermsOfService() {
  const { progress } = useScrollProgress(80);
  const lastUpdated = '26 May 2026';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <ScrollProgressBar progress={progress} />

      {/* Header */}
      <header style={{ background: 'linear-gradient(135deg, #0F2A5C 0%, #1E3A8A 100%)', padding: '56px 24px 64px', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Legal · Governed by Malaysian Law
          </p>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 44px)', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', marginBottom: '12px', lineHeight: 1.1 }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
            The agreement between you and Sarawak MedChain for use of the platform and any pilot programmes.
          </p>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '20px' }}>
            Last updated: <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{lastUpdated}</strong>
          </p>
        </div>
      </header>

      {/* Body */}
      <main style={{ maxWidth: '760px', margin: '0 auto', padding: '56px 24px 80px' }}>
        {/* Pilot-stage notice — honesty up front */}
        <div style={{
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '40px',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#92400E', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
            Pilot-Stage Product
          </p>
          <p style={{ fontSize: '14px', color: '#78350F', margin: 0, lineHeight: 1.6 }}>
            Sarawak MedChain is currently in pilot stage. These terms cover both production use and pilot programmes — specific pilot agreements may override these terms where they conflict.
          </p>
        </div>

        {/* TOC */}
        <nav style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '20px 24px',
          marginBottom: '40px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#0F766E', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '12px' }}>
            On this page
          </p>
          <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#475569', lineHeight: 1.9 }}>
            <li><a href="#acceptance" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Acceptance of terms</a></li>
            <li><a href="#service" style={{ color: '#0F2A5C', textDecoration: 'none' }}>What the service is</a></li>
            <li><a href="#accounts" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Accounts &amp; wallets</a></li>
            <li><a href="#user-obligations" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Your obligations</a></li>
            <li><a href="#pilot" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Pilot programmes</a></li>
            <li><a href="#pricing" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Pricing &amp; payment</a></li>
            <li><a href="#ip" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Intellectual property</a></li>
            <li><a href="#liability" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Limitation of liability</a></li>
            <li><a href="#termination" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Termination</a></li>
            <li><a href="#governing-law" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Governing law</a></li>
            <li><a href="#changes" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Changes to these terms</a></li>
            <li><a href="#contact" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Contact</a></li>
          </ol>
        </nav>

        <PolicySection id="acceptance" title="1. Acceptance of terms">
          <p>By accessing or using Sarawak MedChain (the "Service") — whether as a patient, doctor, hospital, clinic, employer, government agency, or visitor — you agree to be bound by these Terms of Service.</p>
          <p>If you do not agree, please do not use the Service. If you're using the Service on behalf of an organisation, you confirm you have the authority to bind that organisation.</p>
        </PolicySection>

        <PolicySection id="service" title="2. What the service is">
          <p>Sarawak MedChain is a blockchain-secured medical certificate platform that:</p>
          <ul>
            <li>Allows verified doctors to issue tamper-proof medical certificates.</li>
            <li>Gives patients control over who can access their medical records.</li>
            <li>Enables instant verification of medical certificates by employers or authorities.</li>
            <li>Provides anonymised, aggregated public-health reporting to state agencies under appropriate agreements.</li>
          </ul>
          <p>We do not provide medical advice. We do not replace your hospital's clinical systems. The Service is a record-keeping and verification layer, not a healthcare provider.</p>
        </PolicySection>

        <PolicySection id="accounts" title="3. Accounts &amp; wallets">
          <p>The Service uses cryptographic wallets (e.g., MetaMask) for authentication. By creating a wallet-based account, you agree that:</p>
          <ul>
            <li>You are responsible for keeping your private keys and recovery phrases secure.</li>
            <li>We cannot recover lost private keys. If you lose access to your wallet, you lose access to records signed by that wallet.</li>
            <li>You will not impersonate another person, doctor, or facility.</li>
            <li>Doctors must hold valid Malaysian Medical Council (MMC) registration to issue medical certificates through the Service.</li>
          </ul>
        </PolicySection>

        <PolicySection id="user-obligations" title="4. Your obligations">
          <p>When using the Service, you agree NOT to:</p>
          <ul>
            <li>Issue false or fraudulent medical certificates.</li>
            <li>Use the Service for any unlawful purpose.</li>
            <li>Attempt to bypass security measures, decrypt records you don't own, or interfere with other users' access.</li>
            <li>Reverse-engineer, decompile, or scrape the Service.</li>
            <li>Use the Service to discriminate, harass, or harm any person.</li>
            <li>Misrepresent the Service's certifications, partnerships, or regulatory status.</li>
          </ul>
        </PolicySection>

        <PolicySection id="pilot" title="5. Pilot programmes">
          <p>Sarawak MedChain offers pilot programmes (typically 30 days) to qualified facilities. Specific terms:</p>
          <ul>
            <li><strong>No cost to the pilot facility</strong> during the pilot period.</li>
            <li><strong>An audit report</strong> is delivered to the pilot facility at the end of the pilot.</li>
            <li><strong>No commitment to continue.</strong> Either party may walk away after the pilot.</li>
            <li>Pilot data may be used in <strong>anonymised, aggregated form</strong> in marketing materials with the pilot facility's written consent.</li>
            <li>Specific pilot agreements (if signed) override these general terms where they conflict.</li>
          </ul>
        </PolicySection>

        <PolicySection id="pricing" title="6. Pricing &amp; payment">
          <p>Standard plan pricing is shown on the <Link to="/" style={{ color: '#0F766E', fontWeight: 600 }}>landing page</Link> and the <Link to="/pitch" style={{ color: '#0F766E', fontWeight: 600 }}>hospital pitch page</Link>. Key points:</p>
          <ul>
            <li>All prices are in Ringgit Malaysia (RM) unless stated otherwise.</li>
            <li>Payment is processed via FPX (Financial Process Exchange) or invoice on enterprise plans.</li>
            <li>Pricing may change with 30 days notice. Existing paid contracts honour the rate at signing for the contract duration.</li>
            <li>Government and public-sector pricing is custom — please contact us.</li>
          </ul>
        </PolicySection>

        <PolicySection id="ip" title="7. Intellectual property">
          <p>The Service — including the smart contract code, frontend, backend, designs, and brand — is the intellectual property of Sarawak MedChain or its licensors.</p>
          <p>The smart contract code is open-sourced at <a href="https://github.com/randyrichard/Sarawak-Medchain" style={{ color: '#0F766E', fontWeight: 600 }}>github.com/randyrichard/Sarawak-Medchain</a> under its respective licence.</p>
          <p>You retain ownership of your medical data. By using the Service, you grant us a limited licence to process that data only as needed to operate the Service.</p>
        </PolicySection>

        <PolicySection id="liability" title="8. Limitation of liability">
          <p>To the maximum extent permitted by Malaysian law:</p>
          <ul>
            <li>The Service is provided "as is" without warranties of any kind beyond what is required by mandatory consumer-protection law.</li>
            <li>We are not liable for clinical decisions made based on records stored in the Service. Doctors remain professionally responsible for their medical judgments.</li>
            <li>We are not liable for loss of access caused by lost private keys.</li>
            <li>Our total liability for any claim is capped at the fees you have paid us in the 12 months preceding the claim, or RM 1,000, whichever is greater.</li>
          </ul>
          <p>Nothing in these terms excludes liability that cannot be excluded by Malaysian law (e.g., for death or personal injury caused by negligence).</p>
        </PolicySection>

        <PolicySection id="termination" title="9. Termination">
          <ul>
            <li><strong>By you:</strong> You may stop using the Service at any time. Contact us to remove your account data (subject to Privacy Policy retention limits).</li>
            <li><strong>By us:</strong> We may suspend or terminate access if you breach these terms, misuse the Service, or engage in fraudulent activity.</li>
            <li><strong>Survival:</strong> Sections covering intellectual property, limitation of liability, and governing law survive termination.</li>
          </ul>
        </PolicySection>

        <PolicySection id="governing-law" title="10. Governing law">
          <p>These terms are governed by the laws of <strong>Malaysia</strong>. Any dispute arising from or related to these terms or the Service shall be subject to the exclusive jurisdiction of the courts of <strong>Kuching, Sarawak</strong>.</p>
        </PolicySection>

        <PolicySection id="changes" title="11. Changes to these terms">
          <p>We may update these Terms of Service from time to time. The "Last updated" date at the top will reflect the most recent change.</p>
          <p>For material changes that affect paid customers or pilot participants, we will provide at least 30 days notice via email or in-product notification.</p>
        </PolicySection>

        <PolicySection id="contact" title="12. Contact">
          <p>Questions about these terms, or anything else?</p>
          <p>
            <strong>Founder Direct:</strong> <a href="mailto:randyrjm99@gmail.com" style={{ color: '#0F766E', fontWeight: 600 }}>randyrjm99@gmail.com</a>
          </p>
          <p>
            <strong>Operating entity:</strong> Sarawak MedChain (founder-operated, pilot stage) · Sarawak, Malaysia
          </p>
        </PolicySection>

        {/* Footer nav */}
        <div style={{
          marginTop: '56px',
          paddingTop: '32px',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}>
          <Link to="/" style={{ fontSize: '14px', color: '#64748B', textDecoration: 'none', fontWeight: 500 }}>← Back to Home</Link>
          <div style={{ display: 'flex', gap: '20px' }}>
            <Link to="/privacy" style={{ fontSize: '14px', color: '#0F2A5C', textDecoration: 'none', fontWeight: 600 }}>Privacy Policy →</Link>
            <Link to="/sla" style={{ fontSize: '14px', color: '#64748B', textDecoration: 'none', fontWeight: 500 }}>SLA</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function PolicySection({ id, title, children }) {
  return (
    <section id={id} style={{ marginBottom: '48px', scrollMarginTop: '24px' }}>
      <h2 style={{
        fontSize: '20px',
        fontWeight: 700,
        color: '#0F172A',
        marginBottom: '16px',
        letterSpacing: '-0.01em',
      }}>
        {title}
      </h2>
      <div style={{
        fontSize: '15px',
        color: '#334155',
        lineHeight: 1.75,
      }}>
        {children}
      </div>
      <style>{`
        section ul, section ol { padding-left: 22px; margin: 12px 0; }
        section li { margin-bottom: 8px; }
        section p { margin: 12px 0; }
      `}</style>
    </section>
  );
}
