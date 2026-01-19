import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const MaintenanceContext = createContext();

// Default maintenance window: 2:00 AM - 4:00 AM Sarawak time (UTC+8)
const DEFAULT_MAINTENANCE_WINDOW = {
  startHour: 2,  // 2:00 AM
  endHour: 4,    // 4:00 AM
  timezone: 'Asia/Kuching', // Sarawak timezone
};

// Notification lead time: 24 hours before maintenance
const NOTIFICATION_LEAD_TIME_MS = 24 * 60 * 60 * 1000;

// Storage key for maintenance data
const STORAGE_KEY = 'medchain_maintenance';
const NOTIFICATIONS_KEY = 'medchain_service_notifications';

export function MaintenanceProvider({ children }) {
  const [maintenanceSchedule, setMaintenanceSchedule] = useState(null);
  const [systemStatus, setSystemStatus] = useState({
    blockchain: 'operational',
    ipfs: 'operational',
    backend: 'operational',
    database: 'operational',
  });
  const [serviceNotifications, setServiceNotifications] = useState([]);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);

  // Load maintenance schedule from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setMaintenanceSchedule(data);
      } catch (e) {
        console.error('Error loading maintenance schedule:', e);
      }
    }

    // Load service notifications
    const storedNotifications = localStorage.getItem(NOTIFICATIONS_KEY);
    if (storedNotifications) {
      try {
        setServiceNotifications(JSON.parse(storedNotifications));
      } catch (e) {
        console.error('Error loading notifications:', e);
      }
    }
  }, []);

  // Check if currently in maintenance window
  useEffect(() => {
    const checkMaintenanceStatus = () => {
      if (!maintenanceSchedule) {
        setIsMaintenanceMode(false);
        return;
      }

      const now = new Date();
      const maintenanceStart = new Date(maintenanceSchedule.scheduledStart);
      const maintenanceEnd = new Date(maintenanceSchedule.scheduledEnd);

      if (now >= maintenanceStart && now <= maintenanceEnd) {
        setIsMaintenanceMode(true);
        setSystemStatus(prev => ({
          ...prev,
          blockchain: 'maintenance',
          backend: 'maintenance',
        }));
      } else if (now > maintenanceEnd && maintenanceSchedule.status === 'scheduled') {
        // Maintenance completed - trigger service restored notification
        completeMaintenanceWindow();
      } else {
        setIsMaintenanceMode(false);
      }
    };

    checkMaintenanceStatus();
    const interval = setInterval(checkMaintenanceStatus, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [maintenanceSchedule]);

  // Schedule a maintenance window
  const scheduleMaintenanceWindow = useCallback((date, description = 'Scheduled system maintenance') => {
    // Create maintenance window using default off-peak hours
    const startDate = new Date(date);
    startDate.setHours(DEFAULT_MAINTENANCE_WINDOW.startHour, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(DEFAULT_MAINTENANCE_WINDOW.endHour, 0, 0, 0);

    const schedule = {
      id: `maint-${Date.now()}`,
      scheduledStart: startDate.toISOString(),
      scheduledEnd: endDate.toISOString(),
      description,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      window: DEFAULT_MAINTENANCE_WINDOW,
    };

    setMaintenanceSchedule(schedule);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));

    return schedule;
  }, []);

  // Complete maintenance and send service restored notification
  const completeMaintenanceWindow = useCallback(() => {
    if (!maintenanceSchedule) return;

    const notification = {
      id: `notif-${Date.now()}`,
      type: 'service_restored',
      title: 'Service Restored',
      message: 'All systems are now fully operational. Maintenance completed successfully.',
      timestamp: new Date().toISOString(),
      read: false,
      maintenanceId: maintenanceSchedule.id,
    };

    const updatedNotifications = [notification, ...serviceNotifications];
    setServiceNotifications(updatedNotifications);
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updatedNotifications));

    // Update maintenance status
    const completedSchedule = {
      ...maintenanceSchedule,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };
    setMaintenanceSchedule(completedSchedule);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completedSchedule));

    // Reset system status
    setSystemStatus({
      blockchain: 'operational',
      ipfs: 'operational',
      backend: 'operational',
      database: 'operational',
    });
    setIsMaintenanceMode(false);
  }, [maintenanceSchedule, serviceNotifications]);

  // Cancel scheduled maintenance
  const cancelMaintenance = useCallback(() => {
    setMaintenanceSchedule(null);
    localStorage.removeItem(STORAGE_KEY);
    setIsMaintenanceMode(false);
  }, []);

  // Check if should show maintenance banner (24 hours before)
  const shouldShowMaintenanceBanner = useCallback(() => {
    if (!maintenanceSchedule || maintenanceSchedule.status !== 'scheduled') {
      return false;
    }

    const now = new Date();
    const maintenanceStart = new Date(maintenanceSchedule.scheduledStart);
    const timeDiff = maintenanceStart - now;

    // Show banner if within 24 hours of maintenance
    return timeDiff > 0 && timeDiff <= NOTIFICATION_LEAD_TIME_MS;
  }, [maintenanceSchedule]);

  // Get time until maintenance
  const getTimeUntilMaintenance = useCallback(() => {
    if (!maintenanceSchedule) return null;

    const now = new Date();
    const maintenanceStart = new Date(maintenanceSchedule.scheduledStart);
    const timeDiff = maintenanceStart - now;

    if (timeDiff <= 0) return null;

    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

    return { hours, minutes, totalMs: timeDiff };
  }, [maintenanceSchedule]);

  // Mark notification as read
  const markNotificationRead = useCallback((notificationId) => {
    const updated = serviceNotifications.map(n =>
      n.id === notificationId ? { ...n, read: true } : n
    );
    setServiceNotifications(updated);
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
  }, [serviceNotifications]);

  // Clear all notifications
  const clearNotifications = useCallback(() => {
    setServiceNotifications([]);
    localStorage.removeItem(NOTIFICATIONS_KEY);
  }, []);

  // Get unread notification count
  const unreadCount = serviceNotifications.filter(n => !n.read).length;

  // Update system status manually (for health checks)
  const updateSystemStatus = useCallback((component, status) => {
    setSystemStatus(prev => ({
      ...prev,
      [component]: status,
    }));
  }, []);

  // Get overall system health
  const getOverallHealth = useCallback(() => {
    const statuses = Object.values(systemStatus);
    if (statuses.every(s => s === 'operational')) return 'operational';
    if (statuses.some(s => s === 'outage')) return 'outage';
    if (statuses.some(s => s === 'maintenance')) return 'maintenance';
    if (statuses.some(s => s === 'degraded')) return 'degraded';
    return 'operational';
  }, [systemStatus]);

  const value = {
    maintenanceSchedule,
    systemStatus,
    serviceNotifications,
    isMaintenanceMode,
    unreadCount,
    scheduleMaintenanceWindow,
    completeMaintenanceWindow,
    cancelMaintenance,
    shouldShowMaintenanceBanner,
    getTimeUntilMaintenance,
    markNotificationRead,
    clearNotifications,
    updateSystemStatus,
    getOverallHealth,
    DEFAULT_MAINTENANCE_WINDOW,
  };

  return (
    <MaintenanceContext.Provider value={value}>
      {children}
    </MaintenanceContext.Provider>
  );
}

export function useMaintenance() {
  const context = useContext(MaintenanceContext);
  if (!context) {
    throw new Error('useMaintenance must be used within a MaintenanceProvider');
  }
  return context;
}

export default MaintenanceContext;
