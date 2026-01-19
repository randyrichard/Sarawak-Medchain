import { useState } from 'react';
import { useFoundingMember } from '../context/FoundingMemberContext';

/**
 * Gold Founding Partner Badge
 * Displays for the first 10 hospitals that joined MedChain
 */
export default function FoundingPartnerBadge({ walletAddress, size = 'normal', showTooltip = true }) {
  const { isFoundingMember, getFoundingMemberByWallet, getFoundingMemberNumber } = useFoundingMember();
  const [isHovered, setIsHovered] = useState(false);

  if (!isFoundingMember(walletAddress)) {
    return null;
  }

  const member = getFoundingMemberByWallet(walletAddress);
  const memberNumber = getFoundingMemberNumber(walletAddress);

  const sizeClasses = {
    small: 'px-2 py-1 text-xs',
    normal: 'px-3 py-1.5 text-sm',
    large: 'px-4 py-2 text-base',
  };

  const iconSizes = {
    small: 'w-3 h-3',
    normal: 'w-4 h-4',
    large: 'w-5 h-5',
  };

  return (
    <div className="relative inline-block">
      <div
        className={`
          inline-flex items-center gap-1.5 rounded-full font-bold
          bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500
          text-amber-900 shadow-lg
          ${sizeClasses[size]}
          transition-all duration-300 cursor-default
          hover:shadow-amber-500/50 hover:shadow-xl hover:scale-105
        `}
        style={{
          backgroundSize: '200% 100%',
          animation: 'shimmer-gold 3s ease-in-out infinite',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Crown/Star Icon */}
        <svg className={iconSizes[size]} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>

        <span>Founding Partner</span>

        {/* Member number */}
        <span className="px-1.5 py-0.5 bg-amber-900/20 rounded-full text-xs font-mono">
          #{memberNumber}
        </span>
      </div>

      {/* Tooltip */}
      {showTooltip && isHovered && member && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 pointer-events-none">
          <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 shadow-2xl">
            {/* Gold corner accent */}
            <div className="absolute -top-1 -right-1 w-8 h-8">
              <svg viewBox="0 0 32 32" className="w-full h-full text-amber-500">
                <polygon points="32,0 32,32 0,0" fill="currentColor" opacity="0.3" />
              </svg>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-yellow-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-900" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
              </div>
              <div>
                <p className="text-amber-400 font-bold text-sm">Founding Partner #{memberNumber}</p>
                <p className="text-slate-400 text-xs">First 10 to secure Sarawak</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Hospital</span>
                <span className="text-white font-medium">{member.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Location</span>
                <span className="text-white">{member.location}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Member Since</span>
                <span className="text-white">
                  {new Date(member.joinedAt).toLocaleDateString('en-MY', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">MCs Secured</span>
                <span className="text-emerald-400 font-bold">{member.mcsIssued.toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-amber-500/20">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="text-emerald-400 text-xs font-semibold">Legacy Rate Locked for Life</span>
              </div>
            </div>

            {/* Arrow */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-900 border-b border-r border-amber-500/30 transform rotate-45" />
          </div>
        </div>
      )}

      {/* CSS for gold shimmer animation */}
      <style>{`
        @keyframes shimmer-gold {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
    </div>
  );
}

/**
 * Compact version for tight spaces (e.g., table cells)
 */
export function FoundingPartnerBadgeCompact({ walletAddress }) {
  const { isFoundingMember, getFoundingMemberNumber } = useFoundingMember();

  if (!isFoundingMember(walletAddress)) {
    return null;
  }

  const memberNumber = getFoundingMemberNumber(walletAddress);

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold
                 bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-900"
      title={`Founding Partner #${memberNumber}`}
    >
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
      #{memberNumber}
    </span>
  );
}

/**
 * Large showcase badge for dashboards
 */
export function FoundingPartnerShowcase({ walletAddress }) {
  const { isFoundingMember, getFoundingMemberByWallet, getFoundingMemberNumber, LEGACY_PRICING } = useFoundingMember();

  if (!isFoundingMember(walletAddress)) {
    return null;
  }

  const member = getFoundingMemberByWallet(walletAddress);
  const memberNumber = getFoundingMemberNumber(walletAddress);

  return (
    <div className="bg-gradient-to-br from-amber-500/10 via-yellow-500/5 to-amber-500/10 border border-amber-500/30 rounded-2xl p-6 relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fbbf24' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      {/* Corner ribbon */}
      <div className="absolute -top-1 -right-1">
        <div className="w-24 h-24 overflow-hidden">
          <div className="absolute top-4 -right-8 w-32 bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-900 text-xs font-bold py-1 text-center transform rotate-45 shadow-lg">
            FOUNDING
          </div>
        </div>
      </div>

      <div className="relative flex items-start gap-4">
        {/* Large badge icon */}
        <div className="w-16 h-16 bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/30">
          <svg className="w-8 h-8 text-amber-900" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-xl font-bold text-amber-400">Founding Partner</h3>
            <span className="px-2 py-1 bg-amber-500/20 rounded-lg text-amber-400 text-sm font-mono font-bold">
              #{memberNumber}
            </span>
          </div>

          <p className="text-slate-400 text-sm mb-4">
            One of the first 10 healthcare facilities to join the MedChain network and secure Sarawak's medical records.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-slate-500 text-xs mb-1">Legacy Rate</p>
              <p className="text-white font-bold">RM {LEGACY_PRICING.hospital.toLocaleString()}/mo</p>
              <p className="text-emerald-400 text-xs mt-1">Locked for life</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-slate-500 text-xs mb-1">MCs Secured</p>
              <p className="text-white font-bold">{member.mcsIssued.toLocaleString()}</p>
              <p className="text-amber-400 text-xs mt-1">Since {new Date(member.joinedAt).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' })}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
