import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDemo, DEMO_MCS } from '../context/DemoContext';
import DemoBanner from '../components/DemoBanner';

// Demo Doctor Portal Component
function DemoDoctorPortal({ onIssueMC }) {
  const { addDemoMC, demoMCs } = useDemo();
  const [formData, setFormData] = useState({
    patientName: '',
    patientIC: '',
    diagnosis: '',
    mcDays: 1,
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastMC, setLastMC] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate blockchain delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    const newMC = addDemoMC({
      patientName: formData.patientName,
      patientIC: formData.patientIC,
      diagnosis: formData.diagnosis,
      mcDays: parseInt(formData.mcDays),
      doctor: 'Dr. Sarah Lim',
      doctorMMC: 'MMC-45678',
      hospital: 'Timberland Medical Centre',
      dateIssued: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      startDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      endDate: new Date(Date.now() + (parseInt(formData.mcDays) - 1) * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    });

    setLastMC(newMC);
    setShowSuccess(true);
    setIsSubmitting(false);
    setFormData({ patientName: '', patientIC: '', diagnosis: '', mcDays: 1 });
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1E293B', marginBottom: '8px' }}>
          Issue Medical Certificate
        </h1>
        <p style={{ color: '#94A3B8' }}>Demo Doctor: Dr. Sarah Lim (MMC-45678)</p>
      </div>

      {/* Success Modal */}
      {showSuccess && lastMC && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '24px',
            padding: '32px',
            maxWidth: '400px',
            width: '90%',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            boxShadow: '0 0 60px rgba(16, 185, 129, 0.2)',
          }}>
            {/* Success Icon */}
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              border: '3px solid #10b981',
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1E293B', textAlign: 'center', marginBottom: '8px' }}>
              MC Secured on Blockchain!
            </h2>
            <p style={{ color: '#94A3B8', textAlign: 'center', marginBottom: '24px' }}>
              Transaction confirmed in demo network
            </p>

            {/* MC Details */}
            <div style={{
              background: '#F8FAFC',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#94A3B8', fontSize: '14px' }}>MC ID</span>
                <span style={{ color: '#14b8a6', fontWeight: '600' }}>{lastMC.id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#94A3B8', fontSize: '14px' }}>Patient</span>
                <span style={{ color: '#1E293B' }}>{lastMC.patientName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94A3B8', fontSize: '14px' }}>Duration</span>
                <span style={{ color: '#1E293B' }}>{lastMC.mcDays} day(s)</span>
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => window.open(`/#/verify/${lastMC.txHash}`, '_blank')}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'rgba(20, 184, 166, 0.2)',
                  border: '1px solid rgba(20, 184, 166, 0.3)',
                  borderRadius: '10px',
                  color: '#14b8a6',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                View QR
              </button>
              <button
                onClick={() => setShowSuccess(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Issue Another
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue MC Form */}
      <div style={{
        background: '#F8FAFC',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid #E2E8F0',
        maxWidth: '600px',
      }}>
        <form onSubmit={handleSubmit}>
          {/* Patient Name */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#64748B', fontSize: '14px', marginBottom: '8px' }}>
              Patient Name
            </label>
            <input
              type="text"
              value={formData.patientName}
              onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
              placeholder="e.g., Ahmad bin Hassan"
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                color: '#1E293B',
                fontSize: '16px',
                outline: 'none',
              }}
            />
          </div>

          {/* Patient IC */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#64748B', fontSize: '14px', marginBottom: '8px' }}>
              IC Number
            </label>
            <input
              type="text"
              value={formData.patientIC}
              onChange={(e) => setFormData({ ...formData, patientIC: e.target.value })}
              placeholder="e.g., 901201-13-5678"
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                color: '#1E293B',
                fontSize: '16px',
                outline: 'none',
              }}
            />
          </div>

          {/* Diagnosis */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#64748B', fontSize: '14px', marginBottom: '8px' }}>
              Diagnosis
            </label>
            <select
              value={formData.diagnosis}
              onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                color: '#1E293B',
                fontSize: '16px',
                outline: 'none',
              }}
            >
              <option value="">Select diagnosis...</option>
              <option value="Upper Respiratory Tract Infection">Upper Respiratory Tract Infection</option>
              <option value="Acute Gastroenteritis">Acute Gastroenteritis</option>
              <option value="Fever and Body Ache">Fever and Body Ache</option>
              <option value="Food Poisoning">Food Poisoning</option>
              <option value="Migraine">Migraine</option>
              <option value="Back Pain">Back Pain</option>
            </select>
          </div>

          {/* MC Days */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', color: '#64748B', fontSize: '14px', marginBottom: '8px' }}>
              MC Duration (Days)
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              {[1, 2, 3, 5].map(day => (
                <button
                  type="button"
                  key={day}
                  onClick={() => setFormData({ ...formData, mcDays: day })}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: formData.mcDays === day ? '#2563eb' : '#F8FAFC',
                    border: formData.mcDays === day ? 'none' : '1px solid #E2E8F0',
                    borderRadius: '10px',
                    color: formData.mcDays === day ? '#fff' : '#1E293B',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  {day} Day{day > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '16px',
              background: isSubmitting ? '#1e40af' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: '700',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
                Securing on Blockchain...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Issue MC & Secure on Blockchain
              </>
            )}
          </button>
        </form>
      </div>

      {/* Recent MCs */}
      <div style={{ marginTop: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1E293B', marginBottom: '16px' }}>
          Recent MCs Issued
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {demoMCs.slice(0, 5).map(mc => (
            <div
              key={mc.id}
              style={{
                background: '#F8FAFC',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <p style={{ color: '#1E293B', fontWeight: '600' }}>{mc.patientName}</p>
                <p style={{ color: '#94A3B8', fontSize: '14px' }}>{mc.diagnosis} • {mc.mcDays} day(s)</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#14b8a6', fontWeight: '600', fontSize: '14px' }}>{mc.id}</p>
                <p style={{ color: '#94A3B8', fontSize: '12px' }}>{mc.dateIssued}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Demo Patient Portal Component
function DemoPatientPortal() {
  const { demoMCs } = useDemo();

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1E293B', marginBottom: '8px' }}>
          My Medical Records
        </h1>
        <p style={{ color: '#94A3B8' }}>Demo Patient: Ahmad bin Hassan</p>
      </div>

      {/* MC Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {demoMCs.map(mc => (
          <div
            key={mc.id}
            style={{
              background: '#F8FAFC',
              borderRadius: '16px',
              padding: '20px',
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <span style={{
                  padding: '4px 12px',
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#10b981',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '600',
                }}>
                  VERIFIED
                </span>
              </div>
              <span style={{ color: '#14b8a6', fontWeight: '600' }}>{mc.id}</span>
            </div>

            <h3 style={{ color: '#1E293B', fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
              {mc.diagnosis}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <p style={{ color: '#94A3B8', fontSize: '12px' }}>Duration</p>
                <p style={{ color: '#1E293B', fontWeight: '600' }}>{mc.mcDays} Day(s)</p>
              </div>
              <div>
                <p style={{ color: '#94A3B8', fontSize: '12px' }}>Issue Date</p>
                <p style={{ color: '#1E293B', fontWeight: '600' }}>{mc.dateIssued}</p>
              </div>
              <div>
                <p style={{ color: '#94A3B8', fontSize: '12px' }}>Doctor</p>
                <p style={{ color: '#1E293B', fontWeight: '600' }}>{mc.doctor}</p>
              </div>
              <div>
                <p style={{ color: '#94A3B8', fontSize: '12px' }}>Hospital</p>
                <p style={{ color: '#1E293B', fontWeight: '600' }}>{mc.hospital}</p>
              </div>
            </div>

            <button
              onClick={() => window.open(`/#/verify/${mc.txHash}`, '_blank')}
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(20, 184, 166, 0.15)',
                border: '1px solid rgba(20, 184, 166, 0.3)',
                borderRadius: '10px',
                color: '#14b8a6',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              View Verification QR
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Main Demo App Component
export default function DemoApp() {
  const navigate = useNavigate();
  const { isDemoMode, demoRole, setDemoRole, exitDemoMode } = useDemo();
  const [activeTab, setActiveTab] = useState('doctor');

  // Redirect if not in demo mode
  useEffect(() => {
    if (!isDemoMode) {
      navigate('/');
    }
  }, [isDemoMode, navigate]);

  if (!isDemoMode) {
    return null;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FFFFFF' }}>
      {/* Demo Banner */}
      <DemoBanner />

      {/* Main Layout */}
      <div style={{ display: 'flex', paddingTop: '48px' }}>
        {/* Sidebar */}
        <aside style={{
          width: '280px',
          minHeight: 'calc(100vh - 48px)',
          backgroundColor: '#FFFFFF',
          borderRight: '1px solid #E2E8F0',
          padding: '24px 16px',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px', padding: '0 8px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: '700', color: '#1E293B', margin: 0 }}>Sarawak</h1>
              <p style={{ fontSize: '12px', color: '#14b8a6', margin: 0, fontWeight: '600' }}>MedChain Demo</p>
            </div>
          </div>

          {/* Navigation */}
          <nav>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: '4px' }}>
                <button
                  onClick={() => setActiveTab('doctor')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: activeTab === 'doctor' ? 'rgba(20, 184, 166, 0.15)' : 'transparent',
                    border: 'none',
                    borderRadius: '10px',
                    color: activeTab === 'doctor' ? '#1E293B' : '#64748B',
                    fontSize: '14px',
                    fontWeight: activeTab === 'doctor' ? '600' : '400',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    borderLeft: activeTab === 'doctor' ? '2px solid #14b8a6' : '2px solid transparent',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Doctor Portal
                </button>
              </li>
              <li style={{ marginBottom: '4px' }}>
                <button
                  onClick={() => setActiveTab('patient')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: activeTab === 'patient' ? 'rgba(20, 184, 166, 0.15)' : 'transparent',
                    border: 'none',
                    borderRadius: '10px',
                    color: activeTab === 'patient' ? '#1E293B' : '#64748B',
                    fontSize: '14px',
                    fontWeight: activeTab === 'patient' ? '600' : '400',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    borderLeft: activeTab === 'patient' ? '2px solid #14b8a6' : '2px solid transparent',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Patient Portal
                </button>
              </li>
              <li style={{ marginBottom: '4px' }}>
                <Link
                  to="/ceo-dashboard"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    background: 'transparent',
                    borderRadius: '10px',
                    color: '#64748B',
                    fontSize: '14px',
                    textDecoration: 'none',
                    borderLeft: '2px solid transparent',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  CEO Dashboard
                </Link>
              </li>
            </ul>
          </nav>

          {/* Demo Info */}
          <div style={{
            position: 'absolute',
            bottom: '24px',
            left: '16px',
            right: '16px',
            padding: '16px',
            background: 'rgba(245, 158, 11, 0.1)',
            borderRadius: '12px',
            border: '1px solid rgba(245, 158, 11, 0.2)',
          }}>
            <p style={{ color: '#f59e0b', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>
              Demo Mode Active
            </p>
            <p style={{ color: '#64748B', fontSize: '11px', margin: 0 }}>
              All data is simulated. No real blockchain transactions.
            </p>
          </div>
        </aside>

        {/* Main Content */}
        <main style={{ flex: 1, overflow: 'auto', maxHeight: 'calc(100vh - 48px)' }}>
          {activeTab === 'doctor' && <DemoDoctorPortal />}
          {activeTab === 'patient' && <DemoPatientPortal />}
        </main>
      </div>
    </div>
  );
}
