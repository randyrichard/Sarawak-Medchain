import { useDemo } from '../context/DemoContext';
import { useNavigate } from 'react-router-dom';

export default function DemoBanner() {
  const { isDemoMode, exitDemoMode } = useDemo();
  const navigate = useNavigate();

  if (!isDemoMode) return null;

  const handleConnectWallet = () => {
    exitDemoMode();
    navigate('/connect');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      boxShadow: '0 4px 20px rgba(245, 158, 11, 0.4)',
    }}>
      {/* Demo Icon */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span style={{
          color: '#fff',
          fontWeight: '700',
          fontSize: '14px',
          letterSpacing: '0.5px',
        }}>
          DEMO MODE
        </span>
      </div>

      {/* Message */}
      <span style={{
        color: 'rgba(255,255,255,0.9)',
        fontSize: '13px',
      }}>
        Exploring with sample data
      </span>

      {/* Separator */}
      <div style={{
        width: '1px',
        height: '20px',
        background: 'rgba(255,255,255,0.3)',
      }} />

      {/* Connect Wallet Button */}
      <button
        onClick={handleConnectWallet}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '6px',
          padding: '6px 14px',
          color: '#fff',
          fontSize: '12px',
          fontWeight: '600',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.target.style.background = 'rgba(255,255,255,0.3)';
        }}
        onMouseLeave={(e) => {
          e.target.style.background = 'rgba(255,255,255,0.2)';
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Connect Wallet for Live
      </button>
    </div>
  );
}
