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
    <>
      {/* Pulsing dot animation */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>

      <div style={{
        width: '100%',
        height: '40px',
        background: 'linear-gradient(90deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)',
        borderBottom: '1px solid rgba(56, 189, 248, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        flexShrink: 0,
      }}>
        {/* Pulsing cyan dot */}
        <div style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: '#38bdf8',
          animation: 'pulse-dot 2s ease-in-out infinite',
          boxShadow: '0 0 8px rgba(56, 189, 248, 0.6)',
        }} />

        {/* DEMO MODE text */}
        <span style={{
          color: '#ffffff',
          fontWeight: '700',
          fontSize: '12px',
          letterSpacing: '0.5px',
        }}>
          DEMO MODE
        </span>

        {/* Separator */}
        <span style={{
          color: '#64748b',
          fontSize: '12px',
        }}>
          |
        </span>

        {/* Description */}
        <span style={{
          color: '#64748b',
          fontSize: '12px',
        }}>
          Exploring with sample data
        </span>

        {/* Connect Wallet Button - positioned to the right */}
        <button
          onClick={handleConnectWallet}
          style={{
            position: 'absolute',
            right: '20px',
            background: 'transparent',
            border: '1px solid #38bdf8',
            borderRadius: '20px',
            padding: '6px 16px',
            color: '#38bdf8',
            fontSize: '11px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(56, 189, 248, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          Connect Wallet for Live
        </button>
      </div>
    </>
  );
}
