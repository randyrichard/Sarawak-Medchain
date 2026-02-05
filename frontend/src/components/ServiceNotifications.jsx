import { useState, useEffect } from 'react';
import { useMaintenance } from '../context/MaintenanceContext';

// Service Restored Notification Toast - Shows in CEO Dashboard
export function ServiceRestoredToast() {
  const { serviceNotifications, markNotificationRead } = useMaintenance();
  const [visibleNotification, setVisibleNotification] = useState(null);
  const [isExiting, setIsExiting] = useState(false);

  // Show newest unread service_restored notification
  useEffect(() => {
    const unreadRestored = serviceNotifications.find(
      n => n.type === 'service_restored' && !n.read
    );

    if (unreadRestored && !visibleNotification) {
      setVisibleNotification(unreadRestored);
    }
  }, [serviceNotifications, visibleNotification]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      if (visibleNotification) {
        markNotificationRead(visibleNotification.id);
      }
      setVisibleNotification(null);
      setIsExiting(false);
    }, 300);
  };

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    if (visibleNotification) {
      const timer = setTimeout(handleDismiss, 10000);
      return () => clearTimeout(timer);
    }
  }, [visibleNotification]);

  if (!visibleNotification) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 transition-all duration-300 ${
        isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'
      }`}
    >
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl shadow-2xl overflow-hidden max-w-sm border border-emerald-400/30">
        {/* Header */}
        <div className="px-5 py-4 flex items-start gap-4">
          {/* Success icon with animation */}
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            {/* Animated ring */}
            <div className="absolute inset-0 rounded-xl border-2 border-white/30 animate-ping" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-white font-bold">{visibleNotification.title}</h4>
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-[10px] font-bold text-emerald-100 uppercase tracking-wider">
                Live
              </span>
            </div>
            <p className="text-emerald-100 text-sm">{visibleNotification.message}</p>
            <p className="text-emerald-200/60 text-xs mt-2">
              {new Date(visibleNotification.timestamp).toLocaleString('en-MY')}
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="text-white/60 hover:text-white transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bar for auto-dismiss */}
        <div className="h-1 bg-emerald-800">
          <div
            className="h-full bg-white/40 transition-all duration-[10000ms] ease-linear"
            style={{ width: isExiting ? '100%' : '0%' }}
          />
        </div>
      </div>
    </div>
  );
}

// Service Notifications Panel - For viewing all notifications in CEO Dashboard
export function ServiceNotificationsPanel() {
  const { serviceNotifications, markNotificationRead, clearNotifications, unreadCount } = useMaintenance();
  const [isOpen, setIsOpen] = useState(false);

  if (serviceNotifications.length === 0) return null;

  return (
    <div className="relative">
      {/* Bell icon trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
      >
        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-slate-800 font-semibold">System Notifications</h3>
              {serviceNotifications.length > 0 && (
                <button
                  onClick={clearNotifications}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Notifications list */}
            <div className="max-h-96 overflow-y-auto">
              {serviceNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`px-4 py-3 border-b border-slate-100 last:border-0 transition-colors ${
                    notification.read ? 'bg-slate-50' : 'bg-white'
                  }`}
                  onClick={() => !notification.read && markNotificationRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      notification.type === 'service_restored'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {notification.type === 'service_restored' ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-slate-800 text-sm font-medium">{notification.title}</p>
                        {!notification.read && (
                          <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                        )}
                      </div>
                      <p className="text-slate-400 text-xs mt-1">{notification.message}</p>
                      <p className="text-slate-500 text-xs mt-1">
                        {new Date(notification.timestamp).toLocaleString('en-MY', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Maintenance Scheduler Button - For scheduling maintenance from CEO Dashboard
export function MaintenanceSchedulerButton({ onSchedule }) {
  const { scheduleMaintenanceWindow, maintenanceSchedule, cancelMaintenance, DEFAULT_MAINTENANCE_WINDOW } = useMaintenance();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [description, setDescription] = useState('');

  const handleSchedule = () => {
    if (!selectedDate) return;
    scheduleMaintenanceWindow(selectedDate, description || 'Scheduled system maintenance');
    setIsOpen(false);
    setSelectedDate('');
    setDescription('');
    onSchedule?.();
  };

  const handleCancel = () => {
    cancelMaintenance();
  };

  // Get minimum date (tomorrow)
  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg transition-colors text-sm font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {maintenanceSchedule?.status === 'scheduled' ? 'Maintenance Scheduled' : 'Schedule Maintenance'}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-4">
            {maintenanceSchedule?.status === 'scheduled' ? (
              // Show current schedule
              <div>
                <h3 className="text-slate-800 font-semibold mb-3">Scheduled Maintenance</h3>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
                  <p className="text-amber-400 text-sm font-medium mb-1">
                    {new Date(maintenanceSchedule.scheduledStart).toLocaleDateString('en-MY', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </p>
                  <p className="text-slate-400 text-xs">
                    {DEFAULT_MAINTENANCE_WINDOW.startHour}:00 AM - {DEFAULT_MAINTENANCE_WINDOW.endHour}:00 AM (Sarawak Time)
                  </p>
                  <p className="text-slate-600 text-sm mt-2">{maintenanceSchedule.description}</p>
                </div>
                <button
                  onClick={handleCancel}
                  className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel Maintenance
                </button>
              </div>
            ) : (
              // Schedule new maintenance
              <div>
                <h3 className="text-slate-800 font-semibold mb-3">Schedule Maintenance</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">Date</label>
                    <input
                      type="date"
                      min={getMinDate()}
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">Description</label>
                    <input
                      type="text"
                      placeholder="e.g., System update"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:border-amber-500 placeholder-slate-500"
                    />
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-slate-400 text-xs mb-1">Maintenance Window</p>
                    <p className="text-slate-800 text-sm font-medium">
                      {DEFAULT_MAINTENANCE_WINDOW.startHour}:00 AM - {DEFAULT_MAINTENANCE_WINDOW.endHour}:00 AM
                    </p>
                    <p className="text-emerald-400 text-xs mt-1">Off-peak hours (minimal disruption)</p>
                  </div>
                  <button
                    onClick={handleSchedule}
                    disabled={!selectedDate}
                    className="w-full py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 disabled:text-slate-400 text-slate-900 rounded-lg text-sm font-bold transition-colors"
                  >
                    Schedule Maintenance
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
