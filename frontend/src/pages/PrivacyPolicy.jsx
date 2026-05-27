import { Link } from 'react-router-dom';
import { useScrollProgress, ScrollProgressBar } from '../components/ScrollEffects';

/**
 * Privacy Policy — written to satisfy Malaysia PDPA 2010 disclosure
 * requirements (Personal Data Protection Act 709). Plain language,
 * honest about the pilot-stage of the product.
 *
 * Required by govt procurement processes before a vendor can be shortlisted.
 */
export default function PrivacyPolicy() {
  const { progress } = useScrollProgress(80);
  const lastUpdated = '26 May 2026';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <ScrollProgressBar progress={progress} />

      {/* Header */}
      <header style={{ background: 'linear-gradient(135deg, #0F2A5C 0%, #1E3A8A 100%)', padding: '56px 24px 64px', textAlign: 'center' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Legal · PDPA 2010
          </p>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 44px)', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', marginBottom: '12px', lineHeight: 1.1 }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
            How Sarawak MedChain collects, uses, and protects your personal data under the Malaysia Personal Data Protection Act 2010 (Act 709).
          </p>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '20px' }}>
            Last updated: <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{lastUpdated}</strong>
          </p>
        </div>
      </header>

      {/* Body */}
      <main style={{ maxWidth: '760px', margin: '0 auto', padding: '56px 24px 80px' }}>
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
            <li><a href="#scope" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Who this applies to</a></li>
            <li><a href="#data" style={{ color: '#0F2A5C', textDecoration: 'none' }}>What we collect</a></li>
            <li><a href="#purpose" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Why we collect it</a></li>
            <li><a href="#storage" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Where data is stored</a></li>
            <li><a href="#sharing" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Who we share with</a></li>
            <li><a href="#rights" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Your rights under PDPA</a></li>
            <li><a href="#security" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Security measures</a></li>
            <li><a href="#blockchain" style={{ color: '#0F2A5C', textDecoration: 'none' }}>About blockchain &amp; the right to be forgotten</a></li>
            <li><a href="#retention" style={{ color: '#0F2A5C', textDecoration: 'none' }}>How long we keep data</a></li>
            <li><a href="#contact" style={{ color: '#0F2A5C', textDecoration: 'none' }}>Contact us</a></li>
          </ol>
        </nav>

        <PolicySection id="scope" title="1. Who this applies to">
          <p>This Privacy Policy applies to anyone who uses Sarawak MedChain — including patients whose medical certificates are issued through the platform, doctors who issue them, and employers or agencies who verify them.</p>
          <p>It is written under <strong>Malaysia's Personal Data Protection Act 2010 (Act 709, "PDPA")</strong>. Sarawak MedChain is the <em>data user</em> under PDPA terms.</p>
        </PolicySection>

        <PolicySection id="data" title="2. What personal data we collect">
          <p>We collect the minimum data needed to operate the service:</p>
          <ul>
            <li><strong>Patients:</strong> Name, IC number (encrypted), medical certificate details (diagnosis, dates), and a public blockchain wallet address.</li>
            <li><strong>Doctors:</strong> Full name, MMC registration number, hospital/clinic affiliation, public wallet address, and the certificates they issue.</li>
            <li><strong>Verifiers (employers/agencies):</strong> Only the verification query is logged — no personal data is collected from the verifier.</li>
            <li><strong>Website visitors:</strong> Standard server logs (IP address, browser, timestamp) and any contact details you submit through forms.</li>
          </ul>
          <p><strong>We do not collect:</strong> biometric data, financial information beyond what payment processors require, or any data not strictly necessary for medical certificate workflows.</p>
        </PolicySection>

        <PolicySection id="purpose" title="3. Why we collect it">
          <ul>
            <li>To issue, store, and verify tamper-proof medical certificates.</li>
            <li>To enforce patient-controlled access to medical records.</li>
            <li>To provide an audit trail required by hospital regulators and state agencies.</li>
            <li>To meet our legal obligations under Malaysian healthcare and data protection law.</li>
          </ul>
          <p>We do <strong>not</strong> use your personal data for advertising, profiling, or sale to third parties.</p>
        </PolicySection>

        <PolicySection id="storage" title="4. Where your data is stored">
          <ul>
            <li><strong>Encrypted medical records:</strong> Stored on IPFS (InterPlanetary File System) with pinning servers located in Malaysia. Files are encrypted client-side using AES-256-GCM before upload.</li>
            <li><strong>Cryptographic hashes:</strong> Recorded on a public Ethereum-compatible blockchain. These are mathematical fingerprints — they cannot be reverse-engineered to recover the underlying record.</li>
            <li><strong>Operational data (logs, payments):</strong> Stored on servers located in Malaysia.</li>
            <li><strong>Website assets:</strong> Served via Cloudflare's global edge network. Static content only — no personal data is cached at the edge.</li>
          </ul>
          <p><strong>Data residency:</strong> We do not transfer personal data outside Malaysia without explicit patient consent.</p>
        </PolicySection>

        <PolicySection id="sharing" title="5. Who we share data with">
          <p>We share personal data only as required to operate the service:</p>
          <ul>
            <li><strong>Doctors</strong> you've authorised, with explicit on-chain grant of access.</li>
            <li><strong>Employers or agencies</strong> verifying a specific certificate you (or your doctor) have presented to them.</li>
            <li><strong>State agencies and regulators</strong> in anonymised, aggregated form only — never individual records.</li>
            <li><strong>Service providers</strong> we work with (e.g., Cloudflare for website hosting, Supabase for some backend functions) — under contractual obligations to protect your data.</li>
          </ul>
          <p>We do not sell personal data. We do not share with marketers or analytics brokers.</p>
        </PolicySection>

        <PolicySection id="rights" title="6. Your rights under PDPA">
          <p>Under the Malaysia Personal Data Protection Act 2010, you have the right to:</p>
          <ul>
            <li><strong>Access</strong> the personal data we hold about you.</li>
            <li><strong>Correct</strong> any inaccurate personal data.</li>
            <li><strong>Withdraw consent</strong> for processing (subject to legal obligations that may require us to retain records).</li>
            <li><strong>Be informed</strong> about how your data is processed.</li>
            <li><strong>Limit access</strong> to your medical records — patients have full control over which doctors or employers can read them.</li>
            <li><strong>Complain</strong> to the Personal Data Protection Commissioner (Pesuruhjaya Perlindungan Data Peribadi) if you believe your rights have been violated.</li>
          </ul>
          <p>To exercise any of these rights, contact us at <a href="mailto:randyrjm99@gmail.com" style={{ color: '#0F766E', fontWeight: 600 }}>randyrjm99@gmail.com</a>.</p>
        </PolicySection>

        <PolicySection id="security" title="7. How we protect your data">
          <ul>
            <li><strong>Client-side encryption:</strong> Medical records are encrypted in your browser using AES-256-GCM <em>before</em> they leave your device.</li>
            <li><strong>Transport security:</strong> All connections to our servers use TLS 1.3.</li>
            <li><strong>Key management:</strong> Encryption keys are derived from patient wallet signatures. We do not hold a master key that can decrypt records.</li>
            <li><strong>Access logging:</strong> Every grant or revocation of access is recorded on a public ledger and auditable.</li>
            <li><strong>Limited surface area:</strong> We collect minimum necessary data; what we don't have, we cannot lose.</li>
          </ul>
          <p>No system is 100% secure. We will notify affected users in line with PDPA breach-notification expectations if a material breach is discovered.</p>
        </PolicySection>

        <PolicySection id="blockchain" title="8. About blockchain &amp; the right to be forgotten">
          <p>This is the part we want to be especially clear about.</p>
          <p>When a medical certificate is issued, two things happen:</p>
          <ol>
            <li>The <strong>encrypted file</strong> is uploaded to IPFS storage.</li>
            <li>A <strong>cryptographic hash</strong> of that file is recorded on a public blockchain.</li>
          </ol>
          <p>The encrypted file <strong>can be deleted</strong> by unpinning it from IPFS and destroying the encryption key, after which the hash on the blockchain becomes meaningless (it points to data that no longer exists in readable form).</p>
          <p>The <strong>hash itself cannot be removed</strong> from a public blockchain — that is the nature of distributed ledgers. The hash, however, contains no personal data — it is a mathematical fingerprint.</p>
          <p>If you want to exercise a "right to be forgotten" style request, we will: (a) unpin the encrypted file from IPFS, (b) destroy the encryption key, and (c) confirm in writing that the underlying record is no longer accessible. The harmless hash will remain on-chain.</p>
        </PolicySection>

        <PolicySection id="retention" title="9. How long we keep your data">
          <ul>
            <li><strong>Medical certificate records:</strong> Retained for the period required by Malaysian healthcare regulations (typically 7 years from issue date), or until the patient requests deletion (subject to the limitations described in Section 8).</li>
            <li><strong>Audit logs:</strong> Retained for 7 years to meet anti-fraud and regulatory audit requirements.</li>
            <li><strong>Website analytics:</strong> Aggregated only, retained 24 months.</li>
            <li><strong>Contact form submissions:</strong> Retained until you ask us to delete them.</li>
          </ul>
        </PolicySection>

        <PolicySection id="contact" title="10. Contact us">
          <p>Questions about this policy, or how we handle your personal data?</p>
          <p>
            <strong>Founder Direct:</strong> <a href="mailto:randyrjm99@gmail.com" style={{ color: '#0F766E', fontWeight: 600 }}>randyrjm99@gmail.com</a><br/>
            <strong>Subject line for data requests:</strong> "PDPA Request — [Access / Correction / Deletion]"
          </p>
          <p>We aim to respond to all PDPA requests within 21 days, as required by Act 709.</p>
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
            <Link to="/terms" style={{ fontSize: '14px', color: '#0F2A5C', textDecoration: 'none', fontWeight: 600 }}>Terms of Service →</Link>
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
