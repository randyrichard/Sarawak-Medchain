import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const DisasterRecoveryContext = createContext();

// Storage keys
const STORAGE_KEYS = {
  DR_STATE: 'medchain_dr_state',
  ALERT_HISTORY: 'medchain_dr_alerts',
};

// Default DR configuration
const DR_CONFIG = {
  primaryNode: 'https://api.medchain.sarawak.my',
  backupNodes: [
    { id: 'sg-backup', url: 'https://sg.backup.medchain.my', region: 'Singapore', latency: 45 },
    { id: 'my-backup', url: 'https://my.backup.medchain.my', region: 'Malaysia (KL)', latency: 15 },
  ],
  replicationInterval: 5 * 60 * 1000, // 5 minutes
  failoverThreshold: 30 * 1000, // 30 seconds
  coldBackupTime: '02:00',
};

// Default state
const DEFAULT_DR_STATE = {
  primaryStatus: 'HEALTHY',
  failoverActive: false,
  activeNode: 'primary',
  lastHealthCheck: null,
  lastReplication: null,
  lastColdBackup: null,
  replicationHistory: [],
  failoverHistory: [],
  nodeMetrics: {
    primary: { uptime: 99.97, responseTime: 23, requestsPerMin: 1250 },
    'sg-backup': { uptime: 99.99, responseTime: 45, requestsPerMin: 0 },
    'my-backup': { uptime: 99.95, responseTime: 15, requestsPerMin: 0 },
  },
};

export function DisasterRecoveryProvider({ children }) {
  const [drState, setDRState] = useState(DEFAULT_DR_STATE);
  const [alertHistory, setAlertHistory] = useState([]);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(true);

  const healthCheckInterval = useRef(null);
  const replicationInterval = useRef(null);

  // Load state from localStorage
  useEffect(() => {
    const storedState = localStorage.getItem(STORAGE_KEYS.DR_STATE);
    const storedAlerts = localStorage.getItem(STORAGE_KEYS.ALERT_HISTORY);

    if (storedState) {
      try {
        setDRState(JSON.parse(storedState));
      } catch (e) {
        setDRState(DEFAULT_DR_STATE);
      }
    }

    if (storedAlerts) {
      try {
        setAlertHistory(JSON.parse(storedAlerts));
      } catch (e) {
        setAlertHistory([]);
      }
    }
  }, []);

  // Persist state changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DR_STATE, JSON.stringify(drState));
  }, [drState]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ALERT_HISTORY, JSON.stringify(alertHistory));
  }, [alertHistory]);

  /**
   * Simulate health check
   */
  const performHealthCheck = useCallback(() => {
    const isHealthy = Math.random() > 0.02; // 98% success rate
    const responseTime = Math.floor(Math.random() * 50 + 10);

    setDRState(prev => ({
      ...prev,
      lastHealthCheck: {
        timestamp: new Date().toISOString(),
        status: isHealthy ? 'HEALTHY' : 'FAILED',
        responseTime: `${responseTime}ms`,
      },
      primaryStatus: isHealthy ? 'HEALTHY' : 'DEGRADED',
      nodeMetrics: {
        ...prev.nodeMetrics,
        primary: {
          ...prev.nodeMetrics.primary,
          responseTime,
          requestsPerMin: prev.nodeMetrics.primary.requestsPerMin + Math.floor(Math.random() * 10),
        },
      },
    }));

    return isHealthy;
  }, []);

  /**
   * Simulate replication
   */
  const performReplication = useCallback(() => {
    const replicationId = `repl_${Date.now()}`;
    const duration = Math.floor(Math.random() * 500 + 200);

    const replicationRecord = {
      id: replicationId,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      nodesTotal: DR_CONFIG.backupNodes.length,
      nodesSuccess: DR_CONFIG.backupNodes.length,
      bytesTransferred: `${Math.floor(Math.random() * 500 + 100)} KB`,
      results: DR_CONFIG.backupNodes.map(node => ({
        nodeId: node.id,
        region: node.region,
        status: 'SUCCESS',
        latency: `${node.latency + Math.floor(Math.random() * 20)}ms`,
      })),
    };

    setDRState(prev => ({
      ...prev,
      lastReplication: replicationRecord,
      replicationHistory: [replicationRecord, ...prev.replicationHistory].slice(0, 50),
    }));

    return replicationRecord;
  }, []);

  /**
   * Trigger manual failover
   */
  const triggerFailover = useCallback(async (targetNode = 'sg-backup') => {
    const failoverId = `failover_${Date.now()}`;
    const targetInfo = DR_CONFIG.backupNodes.find(n => n.id === targetNode);

    const failoverRecord = {
      id: failoverId,
      timestamp: new Date().toISOString(),
      type: 'FAILOVER',
      fromNode: 'primary',
      toNode: targetNode,
      toRegion: targetInfo?.region || 'Unknown',
      reason: 'Manual trigger / Primary unresponsive',
      status: 'ACTIVE',
    };

    // Create alert
    const alert = {
      id: `alert_${Date.now()}`,
      type: 'FAILOVER_EMERGENCY',
      severity: 'CRITICAL',
      timestamp: new Date().toISOString(),
      title: 'MEDCHAIN FAILOVER ACTIVATED',
      message: `Primary node DOWN. Traffic redirected to ${targetInfo?.region} backup.`,
      details: failoverRecord,
    };

    setDRState(prev => ({
      ...prev,
      failoverActive: true,
      activeNode: targetNode,
      primaryStatus: 'DOWN',
      failoverHistory: [failoverRecord, ...prev.failoverHistory].slice(0, 50),
    }));

    setAlertHistory(prev => [alert, ...prev].slice(0, 100));

    // Dispatch event for toast notification
    window.dispatchEvent(new CustomEvent('medchain-dr-alert', { detail: alert }));

    return { failover: failoverRecord, alert };
  }, []);

  /**
   * Trigger recovery
   */
  const triggerRecovery = useCallback(async () => {
    const recoveryId = `recovery_${Date.now()}`;

    const recoveryRecord = {
      id: recoveryId,
      timestamp: new Date().toISOString(),
      type: 'RECOVERY',
      fromNode: drState.activeNode,
      toNode: 'primary',
      status: 'COMPLETED',
    };

    const alert = {
      id: `alert_${Date.now()}`,
      type: 'RECOVERY_COMPLETE',
      severity: 'INFO',
      timestamp: new Date().toISOString(),
      title: 'MEDCHAIN RECOVERY COMPLETE',
      message: 'Primary node restored. All systems operational.',
      details: recoveryRecord,
    };

    setDRState(prev => ({
      ...prev,
      failoverActive: false,
      activeNode: 'primary',
      primaryStatus: 'HEALTHY',
      failoverHistory: [recoveryRecord, ...prev.failoverHistory].slice(0, 50),
    }));

    setAlertHistory(prev => [alert, ...prev].slice(0, 100));

    window.dispatchEvent(new CustomEvent('medchain-dr-alert', { detail: alert }));

    return { recovery: recoveryRecord, alert };
  }, [drState.activeNode]);

  /**
   * Simulate cold backup
   */
  const triggerColdBackup = useCallback(async () => {
    const backupId = `backup_${Date.now()}`;

    const backupRecord = {
      id: backupId,
      timestamp: new Date().toISOString(),
      status: 'SUCCESS',
      hospitalCount: Math.floor(Math.random() * 20 + 10),
      totalRecords: Math.floor(Math.random() * 50000 + 10000),
      encryptedSize: `${Math.floor(Math.random() * 500 + 100)} MB`,
      checksum: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    };

    setDRState(prev => ({
      ...prev,
      lastColdBackup: backupRecord,
    }));

    return backupRecord;
  }, []);

  /**
   * Get active endpoint URL
   */
  const getActiveEndpoint = useCallback(() => {
    if (drState.activeNode === 'primary') {
      return DR_CONFIG.primaryNode;
    }
    const backup = DR_CONFIG.backupNodes.find(n => n.id === drState.activeNode);
    return backup?.url || DR_CONFIG.primaryNode;
  }, [drState.activeNode]);

  /**
   * Start monitoring
   */
  useEffect(() => {
    if (!isMonitoring) return;

    // Health checks every 10 seconds
    healthCheckInterval.current = setInterval(performHealthCheck, 10000);

    // Replication every 5 minutes
    replicationInterval.current = setInterval(performReplication, DR_CONFIG.replicationInterval);

    // Initial calls
    performHealthCheck();
    performReplication();

    return () => {
      if (healthCheckInterval.current) clearInterval(healthCheckInterval.current);
      if (replicationInterval.current) clearInterval(replicationInterval.current);
    };
  }, [isMonitoring, performHealthCheck, performReplication]);

  /**
   * Calculate uptime percentage
   */
  const calculateUptime = useCallback(() => {
    const total = drState.failoverHistory.length;
    if (total === 0) return 99.99;

    const failovers = drState.failoverHistory.filter(f => f.type === 'FAILOVER').length;
    return Math.max(99.0, 99.99 - (failovers * 0.01));
  }, [drState.failoverHistory]);

  const value = {
    drState,
    alertHistory,
    isMonitoring,
    smsEnabled,
    config: DR_CONFIG,
    setIsMonitoring,
    setSmsEnabled,
    performHealthCheck,
    performReplication,
    triggerFailover,
    triggerRecovery,
    triggerColdBackup,
    getActiveEndpoint,
    calculateUptime,
  };

  return (
    <DisasterRecoveryContext.Provider value={value}>
      {children}
    </DisasterRecoveryContext.Provider>
  );
}

export function useDisasterRecovery() {
  const context = useContext(DisasterRecoveryContext);
  if (!context) {
    throw new Error('useDisasterRecovery must be used within a DisasterRecoveryProvider');
  }
  return context;
}

export default DisasterRecoveryContext;
