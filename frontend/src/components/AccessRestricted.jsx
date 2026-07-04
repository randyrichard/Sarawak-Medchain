import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { ROLE_HOME, roleLabel } from '../utils/roles';

/**
 * Shown when a signed-in user opens a portal their role does not allow
 * (e.g. a patient opening the Doctor Portal).
 */
export default function AccessRestricted({ role, requiredLabel, walletAddress }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6" style={{ minHeight: '70vh' }}>
      <div
        className="w-full max-w-md text-center rounded-2xl p-10"
        style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}
      >
        <div
          className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#FEF2F2', border: '2px solid #FECACA' }}
        >
          <Lock className="w-8 h-8" style={{ color: '#DC2626' }} />
        </div>

        <p className="text-xs font-bold uppercase mb-2" style={{ color: '#DC2626', letterSpacing: '0.15em' }}>
          Access Restricted
        </p>
        <h2 className="text-xl font-bold mb-3" style={{ color: '#0F172A' }}>
          This portal is for {requiredLabel} only
        </h2>
        <p className="text-sm mb-6" style={{ color: '#64748B', lineHeight: 1.6 }}>
          You are signed in as <strong>{roleLabel(role)}</strong>
          {walletAddress && (
            <>
              {' '}with wallet{' '}
              <code className="text-xs" style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </code>
            </>
          )}
          . Your account does not have permission to open this page.
        </p>

        <div
          className="rounded-lg p-4 mb-6 text-left"
          style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}
        >
          <p className="text-xs font-bold mb-2" style={{ color: '#0F172A' }}>How access works</p>
          <ul className="text-xs space-y-1" style={{ color: '#475569', paddingLeft: '16px', listStyle: 'disc' }}>
            <li>Doctor Portal — wallets verified by the Medical Council registry</li>
            <li>Admin Portal &amp; CEO Dashboard — the platform administrator wallet</li>
            <li>Patient Portal — every connected patient wallet</li>
          </ul>
        </div>

        <Link
          to={ROLE_HOME[role] || '/patient'}
          className="inline-block px-6 py-3 rounded-lg text-sm font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' }}
        >
          Go to my portal
        </Link>
      </div>
    </div>
  );
}
