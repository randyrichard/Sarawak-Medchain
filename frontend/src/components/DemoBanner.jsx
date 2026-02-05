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
      height: '40px',
      background: '#EFF6FF',
      borderBottom: '1px solid #BFDBFE',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      flexShrink: 0,
      position: 'relative',
    }}>
      <Info size={14} style={{ color: '#3B82F6' }} />

      <span style={{
        color: '#1E40AF',
        fontWeight: '700',
        fontSize: '12px',
        letterSpacing: '0.5px',
      }}>
        DEMO MODE
      </span>

      <span style={{
        color: '#93C5FD',
        fontSize: '12px',
      }}>
        |
      </span>

      <span style={{
        color: '#6B7280',
        fontSize: '12px',
      }}>
        Exploring with sample data
      </span>

      <button
        onClick={handleConnectWallet}
        style={{
          position: 'absolute',
          right: '20px',
          background: 'transparent',
          border: '1px solid #3B82F6',
          borderRadius: '20px',
          padding: '6px 16px',
          color: '#3B82F6',
          fontSize: '11px',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#EFF6FF';
          e.currentTarget.style.boxShadow = '0 0 12px rgba(59, 130, 246, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        Connect Wallet for Live
      </button>
    </div>
  );
}
