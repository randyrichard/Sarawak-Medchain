import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useScrollProgress, ScrollProgressBar } from '../components/ScrollEffects';

/**
 * OTP / Temporary Access — demo flow.
 *
 * Two interactive panels on one page:
 *   PATIENT: Generates a 6-digit OTP + sample medical record. OTP expires in 24h.
 *   DOCTOR:  Enters OTP. If valid + not expired, sees the record (read-only).
 *
 * Storage: localStorage (works same-browser cross-tab). Real cross-device
 * requires a deployed backend — see /privacy section on data residency.
 */

const STORAGE_KEY = 'medchain_otp_demo';
const OTP_TTL_HOURS = 24;

// Sample patient record for the demo
const SAMPLE_RECORD = {
  patientName: 'Ahmad bin Hassan',
  patientIC: '901201-13-XXXX',
  diagnosis: 'Upper Respiratory Tract Infection',
  mcDays: 2,
  dateIssued: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  doctor: 'Dr. Sarah Lim',
  doctorMMC: 'MMC-45678',
  hospital: 'Timberland Medical Centre',
  notes: 'Rest and hydration recommended. Follow-up if symptoms persist.',
};

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveStore(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function isExpired(entry) {
  return !entry || Date.now() > entry.expiresAt;
}

export default function OTPDemo() {
  const { progress } = useScrollProgress(80);

  // Patient side
  const [patientOTP, setPatientOTP] = useState(null);
  const [patientExpiresAt, setPatientExpiresAt] = useState(null);
  const [copied, setCopied] = useState(false);

  // Doctor side
  const [doctorInput, setDoctorInput] = useState('');
  const [doctorRecord, setDoctorRecord] = useState(null);
  const [doctorError, setDoctorError] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Live ticking countdown
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // On mount, restore any existing valid OTP for this patient session
  useEffect(() => {
    const store = loadStore();
    const my = store.currentOTP;
    if (my && !isExpired(my)) {
      setPatientOTP(my.otp);
      setPatientExpiresAt(my.expiresAt);
    }
  }, []);

  const handleGenerateOTP = () => {
    const otp = generateOTP();
    const expiresAt = Date.now() + OTP_TTL_HOURS * 60 * 60 * 1000;
    const store = loadStore();
    store.currentOTP = { otp, expiresAt, record: SAMPLE_RECORD, generatedAt: Date.now() };
    saveStore(store);
    setPatientOTP(otp);
    setPatientExpiresAt(expiresAt);
  };

  const handleRevokeOTP = () => {
    const store = loadStore();
    delete store.currentOTP;
    saveStore(store);
    setPatientOTP(null);
    setPatientExpiresAt(null);
    setDoctorRecord(null);
    setDoctorError('Patient has revoked access.');
  };

  const handleCopyOTP = () => {
    if (!patientOTP) return;
    navigator.clipboard.writeText(patientOTP);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerifyOTP = async (e) => {
    e?.preventDefault();
    setDoctorError('');
    setDoctorRecord(null);
    setVerifying(true);
    // Small artificial delay so the UX feels like a real check
    await new Promise(r => setTimeout(r, 600));
    const clean = doctorInput.replace(/\D/g, '');
    if (clean.length !== 6) {
      setVerifying(false);
      setDoctorError('Code must be 6 digits.');
      return;
    }
    const store = loadStore();
    const entry = store.currentOTP;
    if (!entry) {
      setVerifying(false);
      setDoctorError('Code not found. Has the patient generated one?');
      return;
    }
    if (entry.otp !== clean) {
      setVerifying(false);
      setDoctorError('Code does not match an active access grant.');
      return;
    }
    if (isExpired(entry)) {
      setVerifying(false);
      setDoctorError('This code has expired. Ask the patient to generate a new one.');
      return;
    }
    setVerifying(false);
    setDoctorRecord(entry.record);
  };

  const formatRemaining = (ms) => {
    if (ms <= 0) return 'Expired';
    const totalMin = Math.floor(ms / 60000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    const secs = Math.floor((ms % 60000) / 1000);
    if (hours > 0) return `${hours}h ${mins}m remaining`;
    if (mins > 0) return `${mins}m ${secs}s remaining`;
    return `${secs}s remaining`;
  };

  const remaining = patientExpiresAt ? patientExpiresAt - now : 0;
  const isOTPActive = patientOTP && remaining > 0;

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <ScrollProgressBar progress={progress} />

      {/* Header */}
      <header style={{ background: 'linear-gradient(135deg, #0F2A5C 0%, #1E3A8A 100%)', padding: '48px 24px 56px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Access Mode · Demo
          </p>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 38px)', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', marginBottom: '10px', lineHeight: 1.15 }}>
            Temporary Access via 6-digit Code
          </h1>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.55, maxWidth: '700px' }}>
            For elderly patients, guest doctors, and cross-clinic emergencies. Patient generates a temporary code, shares it with the doctor, doctor sees the record. Auto-expires in 24 hours. No wallet required for the doctor.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: '1100px', margin: '-32px auto 0', padding: '0 24px 80px' }}>
        {/* Demo notice */}
        <div style={{
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderRadius: '12px',
          padding: '14px 18px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400E', margin: '0 0 4px 0' }}>
              Demo mode — works same-browser only
            </p>
            <p style={{ fontSize: '12px', color: '#78350F', margin: 0, lineHeight: 1.5 }}>
              This demo uses your browser's local storage. Open the Patient and Doctor panels in two tabs to see the full flow. Production version (cross-device, cross-network) deploys with your first pilot.
            </p>
          </div>
        </div>

        {/* Two-panel layout */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '20px',
        }}>
          {/* === PATIENT PANEL === */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '28px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'rgba(15, 118, 110, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#0F766E', letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0 }}>Patient Side</p>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0F172A', margin: '2px 0 0 0' }}>Generate access code</h2>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6, marginBottom: '20px' }}>
              Generate a 6-digit code that lets a doctor view your medical certificate for the next 24 hours. You can revoke it any time.
            </p>

            {!isOTPActive && (
              <button
                onClick={handleGenerateOTP}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'linear-gradient(135deg, #0F2A5C 0%, #1E3A8A 100%)',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(15, 42, 92, 0.25)',
                  transition: 'transform 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                Generate 6-digit access code
              </button>
            )}

            {isOTPActive && (
              <div style={{
                padding: '24px',
                background: 'linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 100%)',
                border: '1px solid #BBF7D0',
                borderRadius: '12px',
                textAlign: 'center',
              }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 12px 0' }}>
                  Active code
                </p>
                <p style={{
                  fontSize: '36px',
                  fontWeight: 700,
                  color: '#0F172A',
                  fontFamily: '"Courier New", monospace',
                  letterSpacing: '0.18em',
                  margin: '0 0 12px 0',
                  userSelect: 'all',
                }}>
                  {patientOTP.slice(0, 3)} {patientOTP.slice(3)}
                </p>
                <p style={{ fontSize: '12px', color: '#047857', fontWeight: 500, marginBottom: '16px' }}>
                  {formatRemaining(remaining)}
                </p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button
                    onClick={handleCopyOTP}
                    style={{
                      padding: '8px 16px',
                      background: '#FFFFFF',
                      color: '#0F172A',
                      border: '1px solid #CBD5E1',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {copied ? '✓ Copied' : 'Copy code'}
                  </button>
                  <button
                    onClick={handleRevokeOTP}
                    style={{
                      padding: '8px 16px',
                      background: '#FFFFFF',
                      color: '#DC2626',
                      border: '1px solid #FECACA',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Revoke access
                  </button>
                </div>
              </div>
            )}

            <div style={{ marginTop: '20px', padding: '12px 14px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <p style={{ fontSize: '11px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                <strong style={{ color: '#0F172A' }}>How it works in production:</strong> the code is generated on your phone via the MedChain app. You read it out to the doctor or text it. Every time someone uses it, a row is appended to your on-chain access log.
              </p>
            </div>
          </div>

          {/* === DOCTOR PANEL === */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '28px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'rgba(15, 42, 92, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F2A5C" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#0F2A5C', letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0 }}>Doctor Side</p>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0F172A', margin: '2px 0 0 0' }}>Enter patient's code</h2>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6, marginBottom: '20px' }}>
              Enter the 6-digit access code the patient gave you. No wallet, no app install required.
            </p>

            <form onSubmit={handleVerifyOTP}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="6-digit code"
                value={doctorInput}
                onChange={(e) => setDoctorInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  fontSize: '20px',
                  fontFamily: '"Courier New", monospace',
                  letterSpacing: '0.2em',
                  textAlign: 'center',
                  border: '1px solid #CBD5E1',
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: '12px',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#0F2A5C'; e.target.style.boxShadow = '0 0 0 3px rgba(15, 42, 92, 0.08)'; }}
                onBlur={(e) => { e.target.style.borderColor = '#CBD5E1'; e.target.style.boxShadow = 'none'; }}
              />
              <button
                type="submit"
                disabled={verifying || doctorInput.length !== 6}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: doctorInput.length === 6 ? '#0F2A5C' : '#CBD5E1',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '10px',
                  cursor: doctorInput.length === 6 ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s ease',
                }}
              >
                {verifying ? 'Verifying…' : 'Access patient record'}
              </button>
            </form>

            {doctorError && (
              <div style={{
                marginTop: '14px',
                padding: '12px 14px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#991B1B',
                lineHeight: 1.5,
              }}>
                {doctorError}
              </div>
            )}

            {doctorRecord && (
              <div style={{
                marginTop: '20px',
                padding: '20px',
                background: 'linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 100%)',
                border: '1px solid #BBF7D0',
                borderRadius: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#047857', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
                    Access granted — record revealed
                  </p>
                </div>
                <DetailRow label="Patient" value={doctorRecord.patientName} />
                <DetailRow label="IC Number" value={doctorRecord.patientIC} />
                <DetailRow label="Diagnosis" value={doctorRecord.diagnosis} highlight />
                <DetailRow label="MC Duration" value={`${doctorRecord.mcDays} days`} />
                <DetailRow label="Date Issued" value={doctorRecord.dateIssued} />
                <DetailRow label="Issuing Doctor" value={`${doctorRecord.doctor} (${doctorRecord.doctorMMC})`} />
                <DetailRow label="Hospital" value={doctorRecord.hospital} />
                <div style={{ marginTop: '12px', padding: '10px 12px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', margin: '0 0 4px 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Clinical Notes</p>
                  <p style={{ fontSize: '13px', color: '#0F172A', margin: 0, lineHeight: 1.55 }}>{doctorRecord.notes}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer nav */}
        <div style={{
          marginTop: '40px',
          paddingTop: '24px',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}>
          <Link to="/" style={{ fontSize: '14px', color: '#64748B', textDecoration: 'none', fontWeight: 500 }}>← Back to Home</Link>
          <div style={{ display: 'flex', gap: '20px' }}>
            <Link to="/demo" style={{ fontSize: '14px', color: '#0F2A5C', textDecoration: 'none', fontWeight: 600 }}>Doctor Portal Demo →</Link>
            <Link to="/privacy" style={{ fontSize: '14px', color: '#64748B', textDecoration: 'none', fontWeight: 500 }}>Privacy Policy</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function DetailRow({ label, value, highlight }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '8px 0',
      borderBottom: '1px solid rgba(187, 247, 208, 0.5)',
    }}>
      <span style={{ fontSize: '12px', color: '#64748B', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontSize: '13px',
        color: highlight ? '#0F2A5C' : '#0F172A',
        fontWeight: highlight ? 700 : 500,
        textAlign: 'right',
      }}>
        {value}
      </span>
    </div>
  );
}
