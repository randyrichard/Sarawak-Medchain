/**
 * MedChain Disaster Recovery Service
 * Handles cross-region replication, auto-failover, and cold storage backups
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Configuration
const DR_CONFIG = {
  // Replication settings
  replication: {
    interval: 5 * 60 * 1000, // 5 minutes
    primaryNode: process.env.PRIMARY_NODE || 'https://api.medchain.sarawak.my',
    secondaryNodes: [
      { id: 'sg-backup', url: 'https://sg.backup.medchain.my', region: 'Singapore' },
      { id: 'my-backup', url: 'https://my.backup.medchain.my', region: 'Malaysia (KL)' },
    ],
  },
  // Failover settings
  failover: {
    healthCheckInterval: 10 * 1000, // 10 seconds
    failoverThreshold: 30 * 1000, // 30 seconds
    maxRetries: 3,
  },
  // Cold storage settings
  coldStorage: {
    backupTime: '02:00', // 2 AM daily
    encryptionAlgorithm: 'aes-256-gcm',
    storagePath: process.env.COLD_STORAGE_PATH || './cold-storage',
  },
  // Alert settings
  alerts: {
    smsEnabled: true,
    ceoPhone: process.env.CEO_PHONE || '+60123456789',
    smsProvider: 'twilio', // or 'nexmo', 'local'
  },
};

// In-memory state
const drState = {
  primaryStatus: 'HEALTHY',
  lastHealthCheck: null,
  lastReplication: null,
  lastColdBackup: null,
  failoverActive: false,
  activeNode: 'primary',
  replicationHistory: [],
  failoverHistory: [],
  alertHistory: [],
};

// Hospital data store (simulated - in production, this would be database)
const hospitalDataStore = [];

/**
 * Cross-Region Replication Manager
 */
class ReplicationManager {
  constructor() {
    this.isRunning = false;
    this.replicationQueue = [];
  }

  /**
   * Start automatic replication every 5 minutes
   */
  startAutoReplication() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  🔄 CROSS-REGION REPLICATION STARTED                        ║');
    console.log('║  Interval: Every 5 minutes                                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Initial replication
    this.performReplication();

    // Schedule regular replications
    this.replicationInterval = setInterval(() => {
      this.performReplication();
    }, DR_CONFIG.replication.interval);

    return { status: 'started', interval: '5 minutes' };
  }

  /**
   * Stop automatic replication
   */
  stopAutoReplication() {
    if (this.replicationInterval) {
      clearInterval(this.replicationInterval);
      this.isRunning = false;
      console.log('[REPLICATION] Auto-replication stopped');
    }
  }

  /**
   * Perform replication to all secondary nodes
   */
  async performReplication() {
    const startTime = Date.now();
    const replicationId = `repl_${Date.now()}`;

    console.log(`[REPLICATION] Starting sync ${replicationId}...`);

    const results = [];

    for (const node of DR_CONFIG.replication.secondaryNodes) {
      try {
        const result = await this.replicateToNode(node, replicationId);
        results.push(result);
      } catch (error) {
        results.push({
          nodeId: node.id,
          status: 'FAILED',
          error: error.message,
        });
      }
    }

    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r.status === 'SUCCESS').length;

    const replicationRecord = {
      id: replicationId,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      nodesTotal: DR_CONFIG.replication.secondaryNodes.length,
      nodesSuccess: successCount,
      results,
    };

    drState.lastReplication = replicationRecord;
    drState.replicationHistory.unshift(replicationRecord);
    drState.replicationHistory = drState.replicationHistory.slice(0, 100);

    console.log(`[REPLICATION] Completed: ${successCount}/${DR_CONFIG.replication.secondaryNodes.length} nodes synced in ${duration}ms`);

    return replicationRecord;
  }

  /**
   * Replicate data to a specific node
   */
  async replicateToNode(node, replicationId) {
    // Simulate replication (in production, this would be actual API calls)
    const payload = {
      replicationId,
      timestamp: new Date().toISOString(),
      data: {
        blockchainState: await this.getBlockchainState(),
        hospitalRecords: hospitalDataStore.length,
        patientRecords: Math.floor(Math.random() * 10000) + 5000,
        lastBlockHash: crypto.randomBytes(32).toString('hex'),
      },
    };

    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100));

    return {
      nodeId: node.id,
      region: node.region,
      status: 'SUCCESS',
      bytesTransferred: JSON.stringify(payload).length,
      latency: `${Math.floor(Math.random() * 100 + 20)}ms`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get current blockchain state for replication
   */
  async getBlockchainState() {
    return {
      blockHeight: Math.floor(Math.random() * 100000) + 50000,
      stateRoot: crypto.randomBytes(32).toString('hex'),
      transactionCount: Math.floor(Math.random() * 500000) + 100000,
    };
  }
}

/**
 * Auto-Failover Manager
 */
class FailoverManager {
  constructor() {
    this.healthCheckInterval = null;
    this.consecutiveFailures = 0;
    this.lastSuccessfulCheck = Date.now();
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  🏥 AUTO-FAILOVER MONITORING STARTED                        ║');
    console.log('║  Threshold: 30 seconds unresponsive                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, DR_CONFIG.failover.healthCheckInterval);

    return { status: 'monitoring', threshold: '30 seconds' };
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      console.log('[FAILOVER] Health monitoring stopped');
    }
  }

  /**
   * Perform health check on primary node
   */
  async performHealthCheck() {
    const checkTime = Date.now();

    try {
      // Simulate health check (in production, actual API ping)
      const isHealthy = await this.pingPrimaryNode();

      if (isHealthy) {
        this.consecutiveFailures = 0;
        this.lastSuccessfulCheck = checkTime;
        drState.primaryStatus = 'HEALTHY';
        drState.lastHealthCheck = {
          timestamp: new Date().toISOString(),
          status: 'HEALTHY',
          responseTime: `${Math.floor(Math.random() * 50 + 10)}ms`,
        };

        // If we were in failover, initiate recovery
        if (drState.failoverActive) {
          await this.initiateRecovery();
        }
      } else {
        throw new Error('Health check failed');
      }
    } catch (error) {
      this.consecutiveFailures++;
      const timeSinceLastSuccess = checkTime - this.lastSuccessfulCheck;

      drState.primaryStatus = 'DEGRADED';
      drState.lastHealthCheck = {
        timestamp: new Date().toISOString(),
        status: 'FAILED',
        consecutiveFailures: this.consecutiveFailures,
        timeSinceLastSuccess: `${Math.floor(timeSinceLastSuccess / 1000)}s`,
      };

      console.log(`[HEALTH] Primary node unresponsive for ${Math.floor(timeSinceLastSuccess / 1000)}s`);

      // Trigger failover if threshold exceeded
      if (timeSinceLastSuccess >= DR_CONFIG.failover.failoverThreshold && !drState.failoverActive) {
        await this.initiateFailover();
      }
    }
  }

  /**
   * Ping primary node
   */
  async pingPrimaryNode() {
    // Simulate with 95% success rate (in production, actual HTTP ping)
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    return Math.random() > 0.05;
  }

  /**
   * Initiate failover to backup node
   */
  async initiateFailover() {
    const failoverId = `failover_${Date.now()}`;
    const timestamp = new Date().toISOString();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  🚨 FAILOVER INITIATED                                      ║');
    console.log('║  Primary node unresponsive for 30+ seconds                  ║');
    console.log('║  Switching to backup node...                                ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    drState.failoverActive = true;
    drState.primaryStatus = 'DOWN';

    // Select best backup node
    const backupNode = DR_CONFIG.replication.secondaryNodes[0];
    drState.activeNode = backupNode.id;

    const failoverRecord = {
      id: failoverId,
      timestamp,
      type: 'FAILOVER',
      fromNode: 'primary',
      toNode: backupNode.id,
      toRegion: backupNode.region,
      reason: 'Primary node unresponsive',
      status: 'ACTIVE',
    };

    drState.failoverHistory.unshift(failoverRecord);

    // Send CEO alert
    await alertManager.sendFailoverAlert(failoverRecord);

    return failoverRecord;
  }

  /**
   * Initiate recovery back to primary
   */
  async initiateRecovery() {
    const recoveryId = `recovery_${Date.now()}`;
    const timestamp = new Date().toISOString();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ RECOVERY INITIATED                                      ║');
    console.log('║  Primary node back online                                   ║');
    console.log('║  Switching back to primary...                               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    drState.failoverActive = false;
    drState.activeNode = 'primary';
    drState.primaryStatus = 'HEALTHY';

    const recoveryRecord = {
      id: recoveryId,
      timestamp,
      type: 'RECOVERY',
      fromNode: drState.activeNode,
      toNode: 'primary',
      status: 'COMPLETED',
    };

    drState.failoverHistory.unshift(recoveryRecord);

    // Send CEO recovery alert
    await alertManager.sendRecoveryAlert(recoveryRecord);

    return recoveryRecord;
  }

  /**
   * Get current active node endpoint
   */
  getActiveEndpoint() {
    if (drState.activeNode === 'primary') {
      return DR_CONFIG.replication.primaryNode;
    }
    const backupNode = DR_CONFIG.replication.secondaryNodes.find(n => n.id === drState.activeNode);
    return backupNode ? backupNode.url : DR_CONFIG.replication.primaryNode;
  }
}

/**
 * Cold Storage Backup Manager ('Black Box')
 */
class ColdStorageManager {
  constructor() {
    this.backupSchedule = null;
  }

  /**
   * Start daily cold storage backups
   */
  startDailyBackups() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  🗄️  COLD STORAGE BACKUP SCHEDULED                          ║');
    console.log('║  Time: Daily at 2:00 AM                                     ║');
    console.log('║  Encryption: AES-256-GCM                                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Check every hour if it's backup time
    this.backupSchedule = setInterval(() => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      if (hours === 2 && minutes < 5) {
        this.performColdBackup();
      }
    }, 60 * 60 * 1000);

    return { status: 'scheduled', time: '02:00 daily' };
  }

  /**
   * Perform cold storage backup
   */
  async performColdBackup() {
    const backupId = `backup_${Date.now()}`;
    const timestamp = new Date().toISOString();

    console.log(`[COLD STORAGE] Starting encrypted backup ${backupId}...`);

    try {
      // Gather all hospital data
      const backupData = await this.gatherBackupData();

      // Encrypt the backup
      const encryptedBackup = await this.encryptBackup(backupData, backupId);

      // Store to cold storage
      const storageResult = await this.storeToOffline(encryptedBackup, backupId);

      const backupRecord = {
        id: backupId,
        timestamp,
        status: 'SUCCESS',
        hospitalCount: backupData.hospitals.length,
        totalRecords: backupData.totalRecords,
        encryptedSize: encryptedBackup.size,
        checksum: encryptedBackup.checksum,
        storagePath: storageResult.path,
      };

      drState.lastColdBackup = backupRecord;

      console.log(`[COLD STORAGE] Backup completed: ${backupRecord.hospitalCount} hospitals, ${backupRecord.encryptedSize} bytes`);

      return backupRecord;
    } catch (error) {
      console.error('[COLD STORAGE] Backup failed:', error.message);
      throw error;
    }
  }

  /**
   * Gather all hospital data for backup
   */
  async gatherBackupData() {
    // In production, this would query the actual database
    const hospitals = hospitalDataStore.filter(h => h.subscriptionAmount >= 10000);

    return {
      hospitals,
      totalRecords: hospitals.length * 1000, // Simulated record count
      blockchainSnapshot: {
        height: Math.floor(Math.random() * 100000) + 50000,
        stateRoot: crypto.randomBytes(32).toString('hex'),
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Encrypt backup data with AES-256-GCM
   */
  async encryptBackup(data, backupId) {
    const key = crypto.scryptSync(
      process.env.BACKUP_ENCRYPTION_KEY || 'medchain-backup-key-2025',
      'medchain-salt',
      32
    );
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(DR_CONFIG.coldStorage.encryptionAlgorithm, key, iv);

    const jsonData = JSON.stringify(data);
    let encrypted = cipher.update(jsonData, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      id: backupId,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      data: encrypted,
      size: `${Math.round(encrypted.length / 1024)} KB`,
      checksum: crypto.createHash('sha256').update(encrypted).digest('hex'),
    };
  }

  /**
   * Store encrypted backup to offline storage
   */
  async storeToOffline(encryptedBackup, backupId) {
    const storagePath = path.join(DR_CONFIG.coldStorage.storagePath, `${backupId}.enc`);

    // Ensure directory exists
    const dir = path.dirname(storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write encrypted backup
    fs.writeFileSync(storagePath, JSON.stringify(encryptedBackup, null, 2));

    // Write manifest
    const manifestPath = path.join(dir, 'manifest.json');
    let manifest = { backups: [] };
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }
    manifest.backups.unshift({
      id: backupId,
      path: storagePath,
      timestamp: new Date().toISOString(),
      checksum: encryptedBackup.checksum,
    });
    manifest.backups = manifest.backups.slice(0, 30); // Keep 30 days
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    return { path: storagePath, manifest: manifestPath };
  }

  /**
   * Restore from cold backup
   */
  async restoreFromBackup(backupId) {
    const storagePath = path.join(DR_CONFIG.coldStorage.storagePath, `${backupId}.enc`);

    if (!fs.existsSync(storagePath)) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    const encryptedBackup = JSON.parse(fs.readFileSync(storagePath, 'utf8'));

    // Decrypt
    const key = crypto.scryptSync(
      process.env.BACKUP_ENCRYPTION_KEY || 'medchain-backup-key-2025',
      'medchain-salt',
      32
    );
    const decipher = crypto.createDecipheriv(
      DR_CONFIG.coldStorage.encryptionAlgorithm,
      key,
      Buffer.from(encryptedBackup.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(encryptedBackup.authTag, 'hex'));

    let decrypted = decipher.update(encryptedBackup.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }
}

/**
 * Alert Manager for CEO notifications
 */
class AlertManager {
  constructor() {
    this.alertQueue = [];
  }

  /**
   * Send failover alert to CEO
   */
  async sendFailoverAlert(failoverRecord) {
    const alert = {
      id: `alert_${Date.now()}`,
      type: 'FAILOVER_EMERGENCY',
      severity: 'CRITICAL',
      timestamp: new Date().toISOString(),
      title: '🚨 MEDCHAIN FAILOVER ACTIVATED',
      message: `Primary node DOWN. Traffic redirected to ${failoverRecord.toRegion} backup.`,
      details: failoverRecord,
      smsContent: `[MEDCHAIN EMERGENCY] Primary node DOWN at ${new Date().toLocaleTimeString()}. Auto-failover to ${failoverRecord.toRegion}. Check dashboard: https://ceo.medchain.my/dr`,
    };

    // Store alert
    drState.alertHistory.unshift(alert);

    // Send SMS
    if (DR_CONFIG.alerts.smsEnabled) {
      await this.sendSMS(alert.smsContent);
    }

    // Dispatch browser event for real-time dashboard update
    this.dispatchAlertEvent(alert);

    console.log(`[ALERT] Failover alert sent to CEO: ${alert.smsContent}`);

    return alert;
  }

  /**
   * Send recovery alert to CEO
   */
  async sendRecoveryAlert(recoveryRecord) {
    const alert = {
      id: `alert_${Date.now()}`,
      type: 'RECOVERY_COMPLETE',
      severity: 'INFO',
      timestamp: new Date().toISOString(),
      title: '✅ MEDCHAIN RECOVERY COMPLETE',
      message: 'Primary node restored. All systems operational.',
      details: recoveryRecord,
      smsContent: `[MEDCHAIN RECOVERY] Primary node RESTORED at ${new Date().toLocaleTimeString()}. All systems operational.`,
    };

    drState.alertHistory.unshift(alert);

    if (DR_CONFIG.alerts.smsEnabled) {
      await this.sendSMS(alert.smsContent);
    }

    this.dispatchAlertEvent(alert);

    console.log(`[ALERT] Recovery alert sent to CEO: ${alert.smsContent}`);

    return alert;
  }

  /**
   * Send SMS via provider
   */
  async sendSMS(message) {
    // In production, integrate with Twilio/Nexmo
    console.log(`[SMS] Sending to ${DR_CONFIG.alerts.ceoPhone}: ${message}`);

    // Simulate SMS send
    return {
      status: 'sent',
      to: DR_CONFIG.alerts.ceoPhone,
      message,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Dispatch alert event for frontend
   */
  dispatchAlertEvent(alert) {
    // This would be sent via WebSocket in production
    return alert;
  }
}

// Create manager instances
const replicationManager = new ReplicationManager();
const failoverManager = new FailoverManager();
const coldStorageManager = new ColdStorageManager();
const alertManager = new AlertManager();

/**
 * Initialize Disaster Recovery Suite
 */
export function initializeDisasterRecovery() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                  ║');
  console.log('║   🛡️  MEDCHAIN DISASTER RECOVERY SUITE v1.0                       ║');
  console.log('║                                                                  ║');
  console.log('║   Cross-Region Replication: ✓ Every 5 minutes                    ║');
  console.log('║   Auto-Failover:            ✓ 30-second threshold                ║');
  console.log('║   Cold Storage Backup:      ✓ Daily at 2:00 AM                   ║');
  console.log('║   CEO Emergency Alerts:     ✓ SMS enabled                        ║');
  console.log('║                                                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  replicationManager.startAutoReplication();
  failoverManager.startHealthMonitoring();
  coldStorageManager.startDailyBackups();

  return {
    status: 'initialized',
    components: {
      replication: 'active',
      failover: 'monitoring',
      coldStorage: 'scheduled',
      alerts: 'enabled',
    },
  };
}

/**
 * Get current DR status
 */
export function getDRStatus() {
  return {
    ...drState,
    config: DR_CONFIG,
    activeEndpoint: failoverManager.getActiveEndpoint(),
  };
}

/**
 * Manual failover trigger (for testing)
 */
export async function triggerManualFailover() {
  return failoverManager.initiateFailover();
}

/**
 * Manual recovery trigger (for testing)
 */
export async function triggerManualRecovery() {
  return failoverManager.initiateRecovery();
}

/**
 * Trigger immediate cold backup
 */
export async function triggerColdBackup() {
  return coldStorageManager.performColdBackup();
}

/**
 * Trigger immediate replication
 */
export async function triggerReplication() {
  return replicationManager.performReplication();
}

/**
 * Register hospital for backup
 */
export function registerHospitalForBackup(hospital) {
  hospitalDataStore.push({
    ...hospital,
    registeredAt: new Date().toISOString(),
  });
  return { status: 'registered', hospitalId: hospital.id };
}

export {
  replicationManager,
  failoverManager,
  coldStorageManager,
  alertManager,
  DR_CONFIG,
  drState,
};

export default {
  initializeDisasterRecovery,
  getDRStatus,
  triggerManualFailover,
  triggerManualRecovery,
  triggerColdBackup,
  triggerReplication,
  registerHospitalForBackup,
};
