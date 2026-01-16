import express from 'express';
import { generateInvoicePDF } from '../utils/invoiceGenerator.js';
import { sendInvoiceEmail } from '../utils/emailService.js';

const router = express.Router();

// Hospital profiles with finance email contacts
const HOSPITAL_PROFILES = {
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': {
    id: 1,
    name: 'Timberland Medical Centre',
    address: 'Jalan Stutong, 93350 Kuching, Sarawak',
    financeEmail: 'finance@timberland.com.my',
    contactPerson: 'Ms. Sarah Tan',
    tier: 'Hospital',
    monthlyFee: 10000,
  },
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': {
    id: 2,
    name: 'KPJ Kuching Specialist Hospital',
    address: 'Lot 51, Jalan Tun Jugah, 93350 Kuching, Sarawak',
    financeEmail: 'accounts@kpjkuching.com.my',
    contactPerson: 'Mr. Ahmad Razak',
    tier: 'Hospital',
    monthlyFee: 10000,
  },
  '0x90f79bf6eb2c4f870365e785982e1f101e93b906': {
    id: 3,
    name: 'Normah Medical Specialist Centre',
    address: 'Jalan Tun Abdul Rahman, 93450 Kuching, Sarawak',
    financeEmail: 'billing@normah.com.my',
    contactPerson: 'Ms. Jennifer Wong',
    tier: 'Hospital',
    monthlyFee: 10000,
  },
  '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65': {
    id: 4,
    name: 'Rejang Medical Centre',
    address: '1 Lorong Lanang 5, 96000 Sibu, Sarawak',
    financeEmail: 'finance@rejangmedical.com.my',
    contactPerson: 'Mr. David Lee',
    tier: 'Hospital',
    monthlyFee: 10000,
  },
  '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc': {
    id: 5,
    name: 'Bintulu Medical Centre',
    address: 'Jalan Tanjung Batu, 97000 Bintulu, Sarawak',
    financeEmail: 'accounts@bintulumedical.com.my',
    contactPerson: 'Ms. Lisa Lim',
    tier: 'Clinic',
    monthlyFee: 2000,
  },
};

// Mock MC data (in production, this would come from blockchain)
const getMCCountForHospital = async (walletAddress) => {
  // Simulated MC counts - in production, query the blockchain
  const mockCounts = {
    '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': 847,
    '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': 1203,
    '0x90f79bf6eb2c4f870365e785982e1f101e93b906': 523,
    '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65': 312,
    '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc': 156,
  };
  return mockCounts[walletAddress.toLowerCase()] || 0;
};

// Store invoice history
let invoiceHistory = [];

// Generate invoices for all hospitals
router.post('/generate-all', async (req, res) => {
  try {
    const { billingMonth, billingYear } = req.body;
    const month = billingMonth || new Date().getMonth();
    const year = billingYear || new Date().getFullYear();

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const periodString = `${monthNames[month]} ${year}`;

    const invoices = [];
    let totalBilled = 0;

    for (const [wallet, profile] of Object.entries(HOSPITAL_PROFILES)) {
      const mcCount = await getMCCountForHospital(wallet);
      const variableFee = mcCount * 1.00; // RM 1.00 per MC
      const totalAmount = profile.monthlyFee + variableFee;

      const invoice = {
        invoiceNumber: `INV-${year}${String(month + 1).padStart(2, '0')}-${String(profile.id).padStart(3, '0')}`,
        hospitalId: profile.id,
        hospitalName: profile.name,
        hospitalAddress: profile.address,
        financeEmail: profile.financeEmail,
        contactPerson: profile.contactPerson,
        walletAddress: wallet,
        billingPeriod: periodString,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        lineItems: [
          {
            description: `MedChain ${profile.tier} Subscription - ${periodString}`,
            quantity: 1,
            unitPrice: profile.monthlyFee,
            total: profile.monthlyFee,
          },
          {
            description: `Medical Certificates Issued (${mcCount} × RM 1.00)`,
            quantity: mcCount,
            unitPrice: 1.00,
            total: variableFee,
          },
        ],
        subtotal: totalAmount,
        tax: 0, // No SST for now
        total: totalAmount,
        status: 'sent',
      };

      invoices.push(invoice);
      totalBilled += totalAmount;
    }

    // Store in history
    const batchRecord = {
      id: `BATCH-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      billingPeriod: periodString,
      invoiceCount: invoices.length,
      totalBilled,
      invoices,
    };
    invoiceHistory.unshift(batchRecord);

    res.json({
      success: true,
      message: `Generated ${invoices.length} invoices for ${periodString}`,
      totalBilled,
      invoiceCount: invoices.length,
      batchId: batchRecord.id,
      invoices,
    });

  } catch (error) {
    console.error('Error generating invoices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send invoices via email
router.post('/send-all', async (req, res) => {
  try {
    const { batchId } = req.body;

    // Find the batch
    const batch = invoiceHistory.find(b => b.id === batchId);
    if (!batch) {
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }

    const results = [];
    let successCount = 0;

    for (const invoice of batch.invoices) {
      try {
        // Generate PDF
        const pdfBuffer = await generateInvoicePDF(invoice);

        // Send email
        const emailResult = await sendInvoiceEmail({
          to: invoice.financeEmail,
          invoiceNumber: invoice.invoiceNumber,
          hospitalName: invoice.hospitalName,
          amount: invoice.total,
          dueDate: invoice.dueDate,
          pdfBuffer,
        });

        results.push({
          hospitalName: invoice.hospitalName,
          email: invoice.financeEmail,
          status: 'sent',
          messageId: emailResult.messageId,
        });
        successCount++;

      } catch (emailError) {
        results.push({
          hospitalName: invoice.hospitalName,
          email: invoice.financeEmail,
          status: 'failed',
          error: emailError.message,
        });
      }
    }

    res.json({
      success: true,
      message: `Sent ${successCount}/${batch.invoices.length} invoices`,
      totalBilled: batch.totalBilled,
      results,
    });

  } catch (error) {
    console.error('Error sending invoices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get invoice history
router.get('/history', (req, res) => {
  res.json({
    success: true,
    history: invoiceHistory,
  });
});

// Get single invoice
router.get('/:invoiceNumber', (req, res) => {
  const { invoiceNumber } = req.params;

  for (const batch of invoiceHistory) {
    const invoice = batch.invoices.find(inv => inv.invoiceNumber === invoiceNumber);
    if (invoice) {
      return res.json({ success: true, invoice });
    }
  }

  res.status(404).json({ success: false, error: 'Invoice not found' });
});

// Get hospital profiles
router.get('/hospitals/all', (req, res) => {
  const hospitals = Object.entries(HOSPITAL_PROFILES).map(([wallet, profile]) => ({
    ...profile,
    walletAddress: wallet,
  }));
  res.json({ success: true, hospitals });
});

export default router;
