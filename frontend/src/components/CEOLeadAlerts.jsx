import { useState, useEffect, useCallback } from 'react';
import { useLeadAnalytics } from '../context/LeadAnalyticsContext';

/**
 * Real-time CEO Alert Toast Notifications
 * Shows popup alerts when hospital leads take action
 */
export function CEOAlertToast() {
  const [alerts, setAlerts] = useState([]);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleAlert = (event) => {
      const alert = event.detail;
      setAlerts(prev => [alert, ...prev].slice(0, 5)); // Keep max 5 alerts visible

      // Auto-dismiss after 10 seconds
      setTimeout(() => {
        setAlerts(prev => prev.filter(a => a.id !== alert.id));
      }, 10000);
    };

    window.addEventListener('medchain-ceo-alert', handleAlert);
    return () => window.removeEventListener('medchain-ceo-alert', handleAlert);
  }, []);

  const dismissAlert = (alertId) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  if (!isVisible || alerts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-3 max-w-md">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="animate-slide-in-right bg-gradient-to-r from-slate-900 to-slate-800 border border-cyan-500/50 rounded-2xl p-4 shadow-2xl shadow-cyan-500/20"
        >
          {/* Alert Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Pulsing indicator */}
              <div className="relative">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-cyan-500 to-blue-600">
                  {alert.type === 'viewing_pitch' && (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                  {alert.type === 'email_opened' && (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )}
                  {alert.type === 'left_pitch' && (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  )}
                </div>
                {alert.type === 'viewing_pitch' && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                )}
              </div>

              <div>
                <p className="text-xs text-cyan-400 font-semibold uppercase tracking-wider">
                  {alert.type === 'viewing_pitch' && 'Live Viewer'}
                  {alert.type === 'email_opened' && 'Email Opened'}
                  {alert.type === 'left_pitch' && 'Session Ended'}
                </p>
                <p className="text-white font-bold text-sm">{alert.hospitalName}</p>
              </div>
            </div>

            <button
              onClick={() => dismissAlert(alert.id)}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Alert Message */}
          <p className="text-slate-300 text-sm mt-2">{alert.message}</p>

          {/* Alert Footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-400">{alert.region}</span>
              <span className="text-xs text-slate-500">
                {new Date(alert.timestamp).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {alert.type === 'viewing_pitch' && (
              <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                LIVE NOW
              </span>
            )}
          </div>
        </div>
      ))}

      {/* CSS for animation */}
      <style>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

/**
 * Live Viewers Panel for CEO Dashboard
 * Shows currently active hospital executives viewing the pitch
 */
export function LiveViewersPanel() {
  const { getActiveViewers, leads } = useLeadAnalytics();
  const [activeViewers, setActiveViewers] = useState([]);

  useEffect(() => {
    // Initial load
    setActiveViewers(getActiveViewers());

    // Listen for updates
    const handleAlert = () => {
      setActiveViewers(getActiveViewers());
    };

    window.addEventListener('medchain-ceo-alert', handleAlert);
    return () => window.removeEventListener('medchain-ceo-alert', handleAlert);
  }, [getActiveViewers]);

  // Also add demo data for KPJ Bintulu
  const viewers = activeViewers.length > 0 ? activeViewers : [
    {
      id: 'demo_session',
      hospitalName: 'KPJ Bintulu Specialist Hospital',
      ceoName: 'Dr. Faizal Rahman',
      currentSection: 'pricing',
      totalTime: 245,
      isActive: true,
      startTime: new Date(Date.now() - 245000).toISOString(),
    }
  ];

  return (
    <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-cyan-500/30 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-bold">Live Viewers</h3>
            <p className="text-slate-400 text-sm">Hospital executives on pitch page</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-full">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
          <span className="text-emerald-400 text-sm font-bold">{viewers.length} LIVE</span>
        </div>
      </div>

      {/* Active Viewers List */}
      <div className="space-y-3">
        {viewers.map((viewer) => (
          <div
            key={viewer.id}
            className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 hover:border-cyan-500/30 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {viewer.hospitalName.split(' ').map(w => w[0]).slice(0, 2).join('')}
                  </span>
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{viewer.hospitalName}</p>
                  <p className="text-slate-400 text-xs">{viewer.ceoName}</p>
                </div>
              </div>

              <span className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/20 rounded-lg">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                <span className="text-emerald-400 text-xs font-semibold">LIVE</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900/50 rounded-lg p-2">
                <p className="text-slate-500 text-xs">Current Section</p>
                <p className="text-cyan-400 font-semibold text-sm capitalize">{viewer.currentSection.replace(/([A-Z])/g, ' $1').trim()}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-2">
                <p className="text-slate-500 text-xs">Time on Page</p>
                <p className="text-white font-semibold text-sm">
                  {Math.floor(viewer.totalTime / 60)}m {viewer.totalTime % 60}s
                </p>
              </div>
            </div>
          </div>
        ))}

        {viewers.length === 0 && (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <p className="text-slate-500">No active viewers right now</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Alert History Panel for CEO Dashboard
 */
export function AlertHistoryPanel() {
  const { ceoAlerts, markAlertRead, markAllAlertsRead, getUnreadAlertCount } = useLeadAnalytics();
  const unreadCount = getUnreadAlertCount();

  const getAlertIcon = (type) => {
    switch (type) {
      case 'viewing_pitch':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        );
      case 'email_opened':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
      case 'left_pitch':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        );
    }
  };

  const getAlertColor = (type) => {
    switch (type) {
      case 'viewing_pitch':
        return 'text-cyan-400 bg-cyan-500/20';
      case 'email_opened':
        return 'text-emerald-400 bg-emerald-500/20';
      case 'left_pitch':
        return 'text-amber-400 bg-amber-500/20';
      default:
        return 'text-slate-400 bg-slate-500/20';
    }
  };

  // Use demo data if no alerts
  const displayAlerts = ceoAlerts.length > 0 ? ceoAlerts : [
    {
      id: 'demo_1',
      type: 'viewing_pitch',
      hospitalName: 'KPJ Bintulu Specialist Hospital',
      ceoName: 'Dr. Faizal Rahman',
      region: 'Bintulu',
      message: 'Dr. Faizal Rahman of KPJ Bintulu is currently viewing the Pitch Portal',
      timestamp: new Date().toISOString(),
      isRead: false,
    },
    {
      id: 'demo_2',
      type: 'email_opened',
      hospitalName: 'Columbia Asia Hospital Miri',
      ceoName: 'Ms. Sarah Lim',
      region: 'Miri',
      message: 'Ms. Sarah Lim opened the Founding Partner invitation email',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      isRead: true,
    },
  ];

  return (
    <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-slate-700/50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-bold">Lead Activity</h3>
            <p className="text-slate-400 text-sm">Recent hospital lead actions</p>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllAlertsRead}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Alerts List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {displayAlerts.slice(0, 10).map((alert) => (
          <div
            key={alert.id}
            onClick={() => markAlertRead(alert.id)}
            className={`p-3 rounded-xl cursor-pointer transition-all ${
              alert.isRead ? 'bg-slate-800/30' : 'bg-slate-800/70 border border-slate-600/50'
            } hover:bg-slate-700/50`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${getAlertColor(alert.type)}`}>
                {getAlertIcon(alert.type)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`font-semibold text-sm ${alert.isRead ? 'text-slate-400' : 'text-white'}`}>
                    {alert.hospitalName}
                  </p>
                  {!alert.isRead && (
                    <span className="w-2 h-2 bg-cyan-400 rounded-full"></span>
                  )}
                </div>
                <p className={`text-xs mt-0.5 ${alert.isRead ? 'text-slate-500' : 'text-slate-300'}`}>
                  {alert.message}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-500">{alert.region}</span>
                  <span className="text-xs text-slate-600">|</span>
                  <span className="text-xs text-slate-500">
                    {new Date(alert.timestamp).toLocaleString('en-MY', {
                      hour: '2-digit',
                      minute: '2-digit',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CEOAlertToast;
