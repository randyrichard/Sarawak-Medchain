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
const paymentData = [];

// FPX Payment Success Webhook
// Called by FPX gateway when payment is confirmed
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
  } = req.body;

  const timestamp = new Date().toISOString();

  // Validate required fields
  if (!amount || !hospitalName) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  // Record the payment
  const payment = {
    id: `fpx_${Date.now()}`,
    transactionId: transactionId || fpxTransactionId || `FPX${Date.now()}`,
    amount: parseFloat(amount),
    hospitalName,
    hospitalId: hospitalId || `hosp_${Date.now()}`,
    buyerEmail,
    buyerName,
    status: status || 'confirmed',
    timestamp,
    type: parseFloat(amount) >= 10000 ? 'hospital' : 'clinic',
  };

  paymentData.push(payment);

  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  💰 FPX PAYMENT RECEIVED                                    ║`);
  console.log(`╠════════════════════════════════════════════════════════════╣`);
  console.log(`║  Amount: RM ${payment.amount.toLocaleString().padEnd(45)}║`);
  console.log(`║  Hospital: ${payment.hospitalName.padEnd(47)}║`);
  console.log(`║  Type: ${payment.type.padEnd(51)}║`);
  console.log(`║  Transaction: ${payment.transactionId.slice(0, 40).padEnd(44)}║`);
  console.log(`║  Time: ${timestamp.padEnd(51)}║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);

  // Return success response
  res.json({
    success: true,
    message: 'Payment recorded successfully',
    payment: {
      id: payment.id,
      amount: payment.amount,
      hospitalName: payment.hospitalName,
      type: payment.type,
      timestamp: payment.timestamp,
    },
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`IPFS Gateway: ${process.env.IPFS_GATEWAY || 'http://127.0.0.1:5001'}`);
});
