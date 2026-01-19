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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend server is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`IPFS Gateway: ${process.env.IPFS_GATEWAY || 'http://127.0.0.1:5001'}`);
});
