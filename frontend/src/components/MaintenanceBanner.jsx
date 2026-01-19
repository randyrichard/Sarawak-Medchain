import { useState, useEffect } from 'react';
import { useMaintenance } from '../context/MaintenanceContext';

export default function MaintenanceBanner() {
  const {
    maintenanceSchedule,
    shouldShowMaintenanceBanner,
    getTimeUntilMaintenance,
    DEFAULT_MAINTENANCE_WINDOW,
  } = useMaintenance();

  const [dismissed, setDismissed] = useState(false);
  const [timeUntil, setTimeUntil] = useState(null);

  // Update countdown every minute
  useEffect(() => {
    const updateTime = () => {
      setTimeUntil(getTimeUntilMaintenance());
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);

    return () => clearInterval(interval);
  }, [getTimeUntilMaintenance]);

  // Reset dismissed state when a new maintenance is scheduled
  useEffect(() => {
    if (maintenanceSchedule?.id) {
      const dismissedKey = `maintenance_dismissed_${maintenanceSchedule.id}`;
      const wasDismissed = localStorage.getItem(dismissedKey);
      setDismissed(wasDismissed === 'true');
    }
  }, [maintenanceSchedule?.id]);

  const handleDismiss = () => {
    if (maintenanceSchedule?.id) {
      localStorage.setItem(`maintenance_dismissed_${maintenanceSchedule.id}`, 'true');
    }
    setDismissed(true);
  };

  // Don't show if dismissed or not within notification window
  if (dismissed || !shouldShowMaintenanceBanner() || !maintenanceSchedule) {
    return null;
  }

  const formatMaintenanceTime = () => {
    const start = new Date(maintenanceSchedule.scheduledStart);
    const end = new Date(maintenanceSchedule.scheduledEnd);

    const dateStr = start.toLocaleDateString('en-MY', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const startTime = start.toLocaleTimeString('en-MY', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const endTime = end.toLocaleTimeString('en-MY', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    return { dateStr, startTime, endTime };
  };

  const { dateStr, startTime, endTime } = formatMaintenanceTime();

  const formatCountdown = () => {
    if (!timeUntil) return '';
    const { hours, minutes } = timeUntil;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white relative overflow-hidden">
      {/* Animated background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(
              45deg,
              transparent,
              transparent 10px,
              rgba(255,255,255,0.1) 10px,
              rgba(255,255,255,0.1) 20px
            )`,
            animation: 'slide 20s linear infinite',
          }}
        />
      </div>

      <div className="relative px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Left: Icon and Message */}
          <div className="flex items-center gap-4">
            {/* Pulsing warning icon */}
            <div className="relative">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-pulse flex items-center justify-center">
                <span className="text-[10px] font-bold">!</span>
              </div>
            </div>

            {/* Message content */}
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-bold text-lg">Scheduled Maintenance</h3>
                <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-semibold uppercase tracking-wider">
                  In {formatCountdown()}
                </span>
              </div>
              <p className="text-amber-100 text-sm">
                {maintenanceSchedule.description || 'System update scheduled'} on <span className="font-semibold">{dateStr}</span>
              </p>
            </div>
          </div>

          {/* Center: Time Window */}
          <div className="hidden md:flex items-center gap-6 bg-white/10 rounded-xl px-6 py-3">
            <div className="text-center">
              <p className="text-xs text-amber-200 uppercase tracking-wider mb-1">Start Time</p>
              <p className="font-bold text-lg">{startTime}</p>
            </div>
            <div className="text-amber-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-xs text-amber-200 uppercase tracking-wider mb-1">End Time</p>
              <p className="font-bold text-lg">{endTime}</p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            {/* Off-peak badge */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-full">
              <svg className="w-4 h-4 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              <span className="text-xs font-semibold text-emerald-200">Off-Peak Hours</span>
            </div>

            {/* Status page link */}
            <a
              href="/status"
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              System Status
            </a>

            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile time display */}
        <div className="md:hidden mt-3 flex items-center justify-center gap-4 text-sm">
          <span className="text-amber-200">Maintenance Window:</span>
          <span className="font-semibold">{startTime} - {endTime}</span>
        </div>
      </div>

      {/* CSS for animation */}
      <style>{`
        @keyframes slide {
          0% { transform: translateX(-20px); }
          100% { transform: translateX(20px); }
        }
      `}</style>
    </div>
  );
}
