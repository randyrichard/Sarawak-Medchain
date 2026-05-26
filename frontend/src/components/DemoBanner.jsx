import { useDemo } from '../context/DemoContext';
import { useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';

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
      width: '100%',
      height: '44px',
      background: 'linear-gradient(90deg, #0F2A5C 0%, #1E3A8A 100%)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      flexShrink: 0,
      position: 'relative',
      paddingLeft: '20px',
      paddingRight: '20px',
    }}>
      <span style={{
        padding: '3px 8px',
        borderRadius: '6px',
        background: 'rgba(255,255,255,0.15)',
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: '10px',
        letterSpacing: '0.1em',
      }}>
        PREVIEW
      </span>

      <span style={{
        color: 'rgba(255,255,255,0.85)',
        fontSize: '13px',
      }}>
        Exploring the platform with sample data — no live patient records involved.
      </span>

      <button
        onClick={handleConnectWallet}
        style={{
          position: 'absolute',
          right: '20px',
          background: '#FFFFFF',
          border: 'none',
          borderRadius: '8px',
          padding: '6px 14px',
          color: '#0F2A5C',
          fontSize: '12px',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#F1F5F9';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#FFFFFF';
        }}
      >
        Connect Wallet for Live →
      </button>
    </div>
  );
}
