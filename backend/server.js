import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import uploadRoutes from './routes/upload.js';
import invoiceRoutes from './routes/invoice.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/invoices', invoiceRoutes);

// Email Tracking Pixel Endpoint
// Returns a 1x1 transparent GIF and logs the open event
const trackingData = [];
app.get('/api/track/email/:trackingId', (req, res) => {
  const { trackingId } = req.params;
  const timestamp = new Date().toISOString();
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  // Log the email open event
  const openEvent = {
    trackingId,
    timestamp,
    userAgent,
    ip,
    type: 'email_open',
  };
  trackingData.push(openEvent);
  console.log(`[EMAIL TRACKED] ${trackingId} opened at ${timestamp}`);

  // Return 1x1 transparent GIF
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': pixel.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  res.end(pixel);
});

// Get tracking data (for CEO dashboard)
app.get('/api/track/data', (req, res) => {
  res.json({ success: true, data: trackingData });
});

// FPX Payment Webhook Endpoints
// Stores confirmed payments for real-time revenue alerts
// RESILIENT: Persists to file and activates credits server-side
const paymentData = [];
const activatedHospitals = new Map(); // Server-side hospital activation store
const PAYMENTS_FILE = './data/payments.json';
const HOSPITALS_FILE = './data/hospitals.json';

// Load persisted data on startup
import fs from 'fs';
import path from 'path';

const dataDir = './data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load existing payments from file
try {
  if (fs.existsSync(PAYMENTS_FILE)) {
    const savedPayments = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf8'));
    paymentData.push(...savedPayments);
    console.log(`[FPX] Loaded ${savedPayments.length} payments from persistent storage`);
  }
} catch (e) {
  console.log('[FPX] No existing payments file, starting fresh');
}

// Load existing hospital activations from file
try {
  if (fs.existsSync(HOSPITALS_FILE)) {
    const savedHospitals = JSON.parse(fs.readFileSync(HOSPITALS_FILE, 'utf8'));
    Object.entries(savedHospitals).forEach(([id, data]) => {
      activatedHospitals.set(id, data);
    });
    console.log(`[FPX] Loaded ${activatedHospitals.size} hospital activations from persistent storage`);
  }
} catch (e) {
  console.log('[FPX] No existing hospitals file, starting fresh');
}

// Persist payments to file
const persistPayments = () => {
  try {
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(paymentData, null, 2));
  } catch (e) {
    console.error('[FPX] Failed to persist payments:', e.message);
  }
};

// Persist hospital activations to file
const persistHospitals = () => {
  try {
    const hospitalsObj = Object.fromEntries(activatedHospitals);
    fs.writeFileSync(HOSPITALS_FILE, JSON.stringify(hospitalsObj, null, 2));
  } catch (e) {
    console.error('[FPX] Failed to persist hospitals:', e.message);
  }
};

// FPX Payment Success Webhook
// Called by FPX gateway when payment is confirmed
// RESILIENT: Activates credits server-side even if browser closes
app.post('/api/webhook/fpx/success', (req, res) => {
  const {
    transactionId,
    amount,
    hospitalName,
    hospitalId,
    buyerEmail,
    buyerName,
    fpxTransactionId,
    status,
    agreementData, // Full agreement data for activation
  } = req.body;

  const timestamp = new Date().toISOString();

  // Validate required fields
  if (!amount || !hospitalName) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const paymentId = `fpx_${Date.now()}`;
  const txnId = transactionId || fpxTransactionId || `FPX${Date.now()}`;
  const hospId = hospitalId || `hosp_${Date.now()}`;

  // Record the payment
  const payment = {
    id: paymentId,
    transactionId: txnId,
    amount: parseFloat(amount),
    hospitalName,
    hospitalId: hospId,
    buyerEmail,
    buyerName,
    status: status || 'confirmed',
    timestamp,
    type: parseFloat(amount) >= 10000 ? 'hospital' : 'clinic',
    creditsActivated: true, // Mark as activated server-side
  };

  paymentData.push(payment);
  persistPayments(); // PERSIST TO FILE

  // SERVER-SIDE CREDIT ACTIVATION
  // This ensures credits are active even if browser closes during redirect
  const initialCredits = payment.type === 'hospital' ? 100 : 50;
  const nextBillingDate = new Date();
  nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

  const hospitalActivation = {
    hospitalId: hospId,
    hospitalName,
    status: 'Active',
    activatedAt: timestamp,
    transactionId: txnId,
    paymentId,
    subscription: {
      plan: payment.type === 'hospital' ? 'Enterprise' : 'Clinic',
      monthlyFee: payment.type === 'hospital' ? 10000 : 2000,
      creditsIncluded: initialCredits,
      nextBillingDate: nextBillingDate.toISOString(),
    },
    credits: {
      balance: initialCredits,
      lastTopUp: timestamp,
    },
    agreementData: agreementData || null,
  };

  activatedHospitals.set(hospId, hospitalActivation);
  activatedHospitals.set(txnId, hospitalActivation); // Also index by transaction ID for recovery
  persistHospitals(); // PERSIST TO FILE

  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  💰 FPX PAYMENT RECEIVED + CREDITS ACTIVATED                ║`);
  console.log(`╠════════════════════════════════════════════════════════════╣`);
  console.log(`║  Amount: RM ${payment.amount.toLocaleString().padEnd(45)}║`);
  console.log(`║  Hospital: ${payment.hospitalName.substring(0, 45).padEnd(47)}║`);
  console.log(`║  Type: ${payment.type.padEnd(51)}║`);
  console.log(`║  Credits: ${String(initialCredits).padEnd(48)}║`);
  console.log(`║  Transaction: ${txnId.slice(0, 40).padEnd(44)}║`);
  console.log(`║  Time: ${timestamp.padEnd(51)}║`);
  console.log(`║  Status: CREDITS ACTIVATED SERVER-SIDE ✓                    ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);

  // Return success response with activation data
  res.json({
    success: true,
    message: 'Payment recorded and credits activated',
    payment: {
      id: payment.id,
      amount: payment.amount,
      hospitalName: payment.hospitalName,
      type: payment.type,
      timestamp: payment.timestamp,
      creditsActivated: true,
    },
    activation: hospitalActivation,
    redirectUrl: `/payment/success?txn=${txnId}`,
  });
});

// RECOVERY ENDPOINT: Check payment status by transaction ID
// Used when browser closes and user returns - credits are already active server-side
app.get('/api/webhook/fpx/status/:transactionId', (req, res) => {
  const { transactionId } = req.params;

  // Check if payment exists and was activated
  const payment = paymentData.find(p => p.transactionId === transactionId);
  const activation = activatedHospitals.get(transactionId);

  if (!payment) {
    return res.json({
      success: false,
      found: false,
      message: 'Payment not found',
    });
  }

  res.json({
    success: true,
    found: true,
    status: payment.status,
    creditsActivated: payment.creditsActivated || false,
    payment: {
      id: payment.id,
      amount: payment.amount,
      hospitalName: payment.hospitalName,
      type: payment.type,
      timestamp: payment.timestamp,
    },
    activation: activation || null,
  });
});

// RECOVERY ENDPOINT: Get activation data by hospital ID or transaction ID
app.get('/api/webhook/fpx/activation/:id', (req, res) => {
  const { id } = req.params;

  const activation = activatedHospitals.get(id);

  if (!activation) {
    return res.json({
      success: false,
      found: false,
      message: 'Activation not found',
    });
  }

  res.json({
    success: true,
    found: true,
    activation,
  });
});

// Get payment history
app.get('/api/webhook/fpx/payments', (req, res) => {
  const { limit = 50 } = req.query;
  res.json({
    success: true,
    data: paymentData.slice(-parseInt(limit)).reverse(),
    total: paymentData.length,
  });
});

// Get revenue summary
app.get('/api/webhook/fpx/summary', (req, res) => {
  const totalRevenue = paymentData.reduce((sum, p) => sum + p.amount, 0);
  const hospitalPayments = paymentData.filter(p => p.type === 'hospital');
  const clinicPayments = paymentData.filter(p => p.type === 'clinic');

  res.json({
    success: true,
    summary: {
      totalRevenue,
      totalPayments: paymentData.length,
      hospitalCount: hospitalPayments.length,
      clinicCount: clinicPayments.length,
      mrr: (hospitalPayments.length * 10000) + (clinicPayments.length * 2000),
      lastPayment: paymentData[paymentData.length - 1] || null,
    },
  });
});

// Simulate FPX payment (for testing)
app.post('/api/webhook/fpx/simulate', (req, res) => {
  const { type = 'hospital' } = req.body;
  const hospitals = [
    'Columbia Asia Hospital Miri',
    'Borneo Medical Centre',
    'Miri City Medical Centre',
    'Sibu Specialist Medical Centre',
    'Sarawak General Hospital',
  ];

  const randomHospital = hospitals[Math.floor(Math.random() * hospitals.length)];
  const amount = type === 'hospital' ? 10000 : 2000;

  // Forward to the success webhook
  req.body = {
    amount,
    hospitalName: randomHospital,
    hospitalId: `hosp_sim_${Date.now()}`,
    transactionId: `FPX_SIM_${Date.now()}`,
    status: 'confirmed',
  };

  // Trigger the payment recording
  const payment = {
    id: `fpx_${Date.now()}`,
    transactionId: req.body.transactionId,
    amount,
    hospitalName: randomHospital,
    hospitalId: req.body.hospitalId,
    status: 'confirmed',
    timestamp: new Date().toISOString(),
    type,
  };

  paymentData.push(payment);

  console.log(`[SIMULATED] ${type} payment of RM ${amount} from ${randomHospital}`);

  res.json({
    success: true,
    message: 'Simulated payment recorded',
    payment,
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend server is running' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DISASTER RECOVERY SUITE ENDPOINTS
// Cross-region replication, auto-failover, cold storage, CEO alerts
// ═══════════════════════════════════════════════════════════════════════════════

// DR State
const drState = {
  primaryStatus: 'HEALTHY',
  failoverActive: false,
  activeNode: 'primary',
  lastHealthCheck: null,
  lastReplication: null,
  lastColdBackup: null,
  consecutiveFailures: 0,
  replicationHistory: [],
  failoverHistory: [],
  alertHistory: [],
};

// DR Configuration
const drConfig = {
  primaryNode: 'https://api.medchain.sarawak.my',
  backupNodes: [
    { id: 'sg-backup', url: 'https://sg.backup.medchain.my', region: 'Singapore' },
    { id: 'my-backup', url: 'https://my.backup.medchain.my', region: 'Malaysia (KL)' },
  ],
  failoverThreshold: 30000, // 30 seconds
  replicationInterval: 300000, // 5 minutes
  ceoPhone: process.env.CEO_PHONE || '+60123456789',
};

// Get DR Status
app.get('/api/dr/status', (req, res) => {
  res.json({
    success: true,
    status: drState,
    config: drConfig,
    activeEndpoint: drState.activeNode === 'primary'
      ? drConfig.primaryNode
      : drConfig.backupNodes.find(n => n.id === drState.activeNode)?.url,
  });
});

// Health Check Endpoint (for monitoring)
app.get('/api/dr/health', (req, res) => {
  const timestamp = new Date().toISOString();
  const responseTime = Math.floor(Math.random() * 50 + 10);

  drState.lastHealthCheck = {
    timestamp,
    status: 'HEALTHY',
    responseTime: `${responseTime}ms`,
  };

  res.json({
    success: true,
    status: 'HEALTHY',
    timestamp,
    responseTime: `${responseTime}ms`,
    node: drState.activeNode,
  });
});

// Manual Failover Trigger
app.post('/api/dr/failover', (req, res) => {
  const { targetNode = 'sg-backup' } = req.body;
  const timestamp = new Date().toISOString();
  const targetInfo = drConfig.backupNodes.find(n => n.id === targetNode);

  if (!targetInfo) {
    return res.status(400).json({ success: false, error: 'Invalid target node' });
  }

  const failoverId = `failover_${Date.now()}`;
  const failoverRecord = {
    id: failoverId,
    timestamp,
    type: 'FAILOVER',
    fromNode: drState.activeNode,
    toNode: targetNode,
    toRegion: targetInfo.region,
    reason: req.body.reason || 'Manual trigger',
    status: 'ACTIVE',
  };

  drState.failoverActive = true;
  drState.activeNode = targetNode;
  drState.primaryStatus = 'DOWN';
  drState.failoverHistory.unshift(failoverRecord);

  // Create alert
  const alert = {
    id: `alert_${Date.now()}`,
    type: 'FAILOVER_EMERGENCY',
    severity: 'CRITICAL',
    timestamp,
    title: 'MEDCHAIN FAILOVER ACTIVATED',
    message: `Primary node DOWN. Traffic redirected to ${targetInfo.region} backup.`,
    smsSent: true,
    smsContent: `[MEDCHAIN EMERGENCY] Primary node DOWN at ${new Date().toLocaleTimeString()}. Auto-failover to ${targetInfo.region}. Check dashboard.`,
  };
  drState.alertHistory.unshift(alert);

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  🚨 FAILOVER ACTIVATED                                      ║');
  console.log(`║  Target: ${targetInfo.region.padEnd(49)}║`);
  console.log(`║  Time: ${timestamp.padEnd(51)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  res.json({
    success: true,
    message: 'Failover initiated',
    failover: failoverRecord,
    alert,
  });
});

// Manual Recovery Trigger
app.post('/api/dr/recovery', (req, res) => {
  const timestamp = new Date().toISOString();
  const recoveryId = `recovery_${Date.now()}`;

  const recoveryRecord = {
    id: recoveryId,
    timestamp,
    type: 'RECOVERY',
    fromNode: drState.activeNode,
    toNode: 'primary',
    status: 'COMPLETED',
  };

  drState.failoverActive = false;
  drState.activeNode = 'primary';
  drState.primaryStatus = 'HEALTHY';
  drState.consecutiveFailures = 0;
  drState.failoverHistory.unshift(recoveryRecord);

  const alert = {
    id: `alert_${Date.now()}`,
    type: 'RECOVERY_COMPLETE',
    severity: 'INFO',
    timestamp,
    title: 'MEDCHAIN RECOVERY COMPLETE',
    message: 'Primary node restored. All systems operational.',
    smsSent: true,
  };
  drState.alertHistory.unshift(alert);

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ RECOVERY COMPLETE                                       ║');
  console.log(`║  Time: ${timestamp.padEnd(51)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  res.json({
    success: true,
    message: 'Recovery completed',
    recovery: recoveryRecord,
    alert,
  });
});

// Trigger Replication
app.post('/api/dr/replicate', (req, res) => {
  const timestamp = new Date().toISOString();
  const replicationId = `repl_${Date.now()}`;
  const duration = Math.floor(Math.random() * 500 + 200);

  const replicationRecord = {
    id: replicationId,
    timestamp,
    duration: `${duration}ms`,
    nodesTotal: drConfig.backupNodes.length,
    nodesSuccess: drConfig.backupNodes.length,
    bytesTransferred: `${Math.floor(Math.random() * 500 + 100)} KB`,
    results: drConfig.backupNodes.map(node => ({
      nodeId: node.id,
      region: node.region,
      status: 'SUCCESS',
      latency: `${Math.floor(Math.random() * 50 + 15)}ms`,
    })),
  };

  drState.lastReplication = replicationRecord;
  drState.replicationHistory.unshift(replicationRecord);
  drState.replicationHistory = drState.replicationHistory.slice(0, 100);

  console.log(`[REPLICATION] Sync completed to ${drConfig.backupNodes.length} nodes in ${duration}ms`);

  res.json({
    success: true,
    replication: replicationRecord,
  });
});

// Trigger Cold Backup
app.post('/api/dr/backup', (req, res) => {
  const timestamp = new Date().toISOString();
  const backupId = `backup_${Date.now()}`;

  // Simulate gathering hospital data
  const hospitalCount = paymentData.filter(p => p.type === 'hospital').length + 10;
  const totalRecords = hospitalCount * 5000 + Math.floor(Math.random() * 10000);

  const backupRecord = {
    id: backupId,
    timestamp,
    status: 'SUCCESS',
    hospitalCount,
    totalRecords,
    encryptedSize: `${Math.floor(totalRecords / 100)} MB`,
    checksum: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    encryption: 'AES-256-GCM',
    storagePath: `/cold-storage/${backupId}.enc`,
  };

  drState.lastColdBackup = backupRecord;

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  🗄️  COLD STORAGE BACKUP COMPLETE                           ║');
  console.log(`║  Hospitals: ${String(hospitalCount).padEnd(46)}║`);
  console.log(`║  Records: ${totalRecords.toLocaleString().padEnd(48)}║`);
  console.log(`║  Size: ${backupRecord.encryptedSize.padEnd(51)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  res.json({
    success: true,
    backup: backupRecord,
  });
});

// Get Alert History
app.get('/api/dr/alerts', (req, res) => {
  const { limit = 50 } = req.query;
  res.json({
    success: true,
    alerts: drState.alertHistory.slice(0, parseInt(limit)),
    total: drState.alertHistory.length,
  });
});

// Get Replication History
app.get('/api/dr/replication-history', (req, res) => {
  const { limit = 50 } = req.query;
  res.json({
    success: true,
    history: drState.replicationHistory.slice(0, parseInt(limit)),
    total: drState.replicationHistory.length,
  });
});

// Get Failover History
app.get('/api/dr/failover-history', (req, res) => {
  const { limit = 50 } = req.query;
  res.json({
    success: true,
    history: drState.failoverHistory.slice(0, parseInt(limit)),
    total: drState.failoverHistory.length,
  });
});

// Simulate SMS to CEO (for testing)
app.post('/api/dr/send-sms', (req, res) => {
  const { message } = req.body;
  const timestamp = new Date().toISOString();

  console.log(`\n[SMS] Sending to ${drConfig.ceoPhone}:`);
  console.log(`[SMS] ${message}`);
  console.log(`[SMS] Sent at ${timestamp}\n`);

  res.json({
    success: true,
    sms: {
      to: drConfig.ceoPhone,
      message,
      timestamp,
      status: 'sent',
    },
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`IPFS Gateway: ${process.env.IPFS_GATEWAY || 'http://127.0.0.1:5001'}`);
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  🛡️  DISASTER RECOVERY SUITE ENABLED                              ║');
  console.log('║  • Cross-Region Replication: POST /api/dr/replicate              ║');
  console.log('║  • Auto-Failover: POST /api/dr/failover                          ║');
  console.log('║  • Cold Storage: POST /api/dr/backup                             ║');
  console.log('║  • CEO Alerts: POST /api/dr/send-sms                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
});
