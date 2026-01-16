import { useState, useEffect } from 'react';

// Sarawak MedChain Blue
const MEDCHAIN_BLUE = '#0066CC';

/**
 * BroadcastNotification - A real-time notification bar for network-wide announcements
 * Uses localStorage events to simulate WebSocket-like real-time updates
 */
export default function BroadcastNotification() {
  const [broadcast, setBroadcast] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Check for active broadcast
  const checkBroadcast = () => {
    try {
      const storedBroadcast = localStorage.getItem('medchain_broadcast');
      if (storedBroadcast) {
        const data = JSON.parse(storedBroadcast);
        const now = Date.now();

        // Check if broadcast has expired
        if (data.expiresAt && now > data.expiresAt) {
          localStorage.removeItem('medchain_broadcast');
          setBroadcast(null);
          setIsVisible(false);
          return;
        }

        // Check if this specific broadcast was dismissed
        const dismissedId = localStorage.getItem('medchain_broadcast_dismissed');
        if (dismissedId === data.id) {
          setIsDismissed(true);
          return;
        }

        setBroadcast(data);
        setIsVisible(true);
        setIsDismissed(false);
      } else {
        setBroadcast(null);
        setIsVisible(false);
      }
    } catch (error) {
      console.error('Error checking broadcast:', error);
    }
  };

  useEffect(() => {
    // Initial check
    checkBroadcast();

    // Listen for storage changes (real-time updates from other tabs)
    const handleStorageChange = (e) => {
      if (e.key === 'medchain_broadcast' || e.key === 'medchain_broadcast_dismissed') {
        checkBroadcast();
      }
    };

    // Listen for custom broadcast event (same tab updates)
    const handleBroadcastEvent = () => {
      checkBroadcast();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('medchain_broadcast_update', handleBroadcastEvent);

    // Poll every 5 seconds for expiration check
    const pollInterval = setInterval(checkBroadcast, 5000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('medchain_broadcast_update', handleBroadcastEvent);
      clearInterval(pollInterval);
    };
  }, []);

  // Dismiss notification
  const handleDismiss = () => {
    if (broadcast?.id) {
      localStorage.setItem('medchain_broadcast_dismissed', broadcast.id);
      setIsDismissed(true);
      setIsVisible(false);
    }
  };

  // Calculate time remaining
  const getTimeRemaining = () => {
    if (!broadcast?.expiresAt) return null;
    const remaining = broadcast.expiresAt - Date.now();
    if (remaining <= 0) return 'Expiring...';

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  if (!isVisible || !broadcast || isDismissed) return null;

  return (
    <div
      className="sticky top-0 z-50 w-full animate-slideDown"
      style={{
        background: `linear-gradient(135deg, ${MEDCHAIN_BLUE}, #0052A3)`,
        boxShadow: '0 4px 20px rgba(0, 102, 204, 0.4)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left - Icon and Message */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Pulsing Icon */}
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-white rounded-full animate-ping opacity-30" />
              <div className="relative w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
              </div>
            </div>

            {/* Message */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">
                  Network Announcement
                </span>
                {broadcast.priority === 'urgent' && (
                  <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse">
                    URGENT
                  </span>
                )}
              </div>
              <p className="text-white font-medium truncate">{broadcast.message}</p>
            </div>
          </div>

          {/* Right - Time & Dismiss */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* Time Remaining */}
            {getTimeRemaining() && (
              <span className="text-white/60 text-xs hidden sm:block">
                {getTimeRemaining()}
              </span>
            )}

            {/* Dismiss Button */}
            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
              title="Dismiss"
            >
              <svg className="w-5 h-5 text-white/80 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Animation styles */}
      <style>{`
        @keyframes slideDown {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slideDown {
          animation: slideDown 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}

/**
 * Utility function to send a broadcast from the CEO dashboard
 * @param {Object} options - Broadcast options
 * @param {string} options.message - The announcement message
 * @param {number} options.duration - Duration in hours before expiration
 * @param {string} options.priority - 'normal' or 'urgent'
 */
export function sendBroadcast({ message, duration = 24, priority = 'normal' }) {
  const broadcast = {
    id: `broadcast_${Date.now()}`,
    message,
    priority,
    createdAt: Date.now(),
    expiresAt: Date.now() + (duration * 60 * 60 * 1000),
  };

  // Store in localStorage
  localStorage.setItem('medchain_broadcast', JSON.stringify(broadcast));

  // Clear any previous dismissals so all users see the new message
  localStorage.removeItem('medchain_broadcast_dismissed');

  // Trigger custom event for same-tab updates
  window.dispatchEvent(new CustomEvent('medchain_broadcast_update'));

  return broadcast;
}

/**
 * Utility function to clear the current broadcast
 */
export function clearBroadcast() {
  localStorage.removeItem('medchain_broadcast');
  localStorage.removeItem('medchain_broadcast_dismissed');
  window.dispatchEvent(new CustomEvent('medchain_broadcast_update'));
}
