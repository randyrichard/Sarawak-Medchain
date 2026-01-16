/**
 * Invoice PDF Generator for Sarawak MedChain
 * Generates professional invoices matching the proposal styling
 */

// Since we're using Node.js backend, we'll generate invoice data
// that can be rendered as PDF on the frontend using jsPDF
// Or use a simple text-based invoice for email

const MEDCHAIN_BLUE = '#0066CC';
const MEDCHAIN_DARK = '#003366';

/**
 * Generate invoice PDF buffer
 * For demo purposes, this returns invoice data that can be rendered
 * In production, use pdfkit or similar for server-side PDF generation
 */
export async function generateInvoicePDF(invoice) {
  // Generate HTML invoice that can be converted to PDF
  const html = generateInvoiceHTML(invoice);

  // For demo, return the invoice data
  // In production, use puppeteer or pdfkit to generate actual PDF
  return {
    type: 'invoice-data',
    html,
    invoice,
  };
}

/**
 * Generate invoice HTML with Sarawak MedChain styling
 */
export function generateInvoiceHTML(invoice) {
  const formatCurrency = (amount) => `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #1a1a2e;
      line-height: 1.6;
      background: #fff;
    }
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid ${MEDCHAIN_BLUE};
    }
    .logo-section h1 {
      color: ${MEDCHAIN_BLUE};
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 5px;
    }
    .logo-section p {
      color: #666;
      font-size: 14px;
    }
    .invoice-title {
      text-align: right;
    }
    .invoice-title h2 {
      font-size: 36px;
      color: ${MEDCHAIN_DARK};
      font-weight: 300;
      text-transform: uppercase;
      letter-spacing: 3px;
    }
    .invoice-number {
      color: ${MEDCHAIN_BLUE};
      font-size: 14px;
      font-weight: 600;
      margin-top: 5px;
    }

    /* Info Section */
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
    }
    .info-block h3 {
      color: ${MEDCHAIN_BLUE};
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }
    .info-block p {
      font-size: 14px;
      color: #333;
      margin-bottom: 3px;
    }
    .info-block .highlight {
      font-weight: 600;
      color: ${MEDCHAIN_DARK};
    }

    /* Dates */
    .dates-section {
      background: #f8f9fa;
      padding: 15px 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
    }
    .date-item label {
      font-size: 11px;
      color: #666;
      text-transform: uppercase;
    }
    .date-item span {
      display: block;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    /* Table */
    .invoice-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .invoice-table th {
      background: ${MEDCHAIN_BLUE};
      color: white;
      padding: 12px 15px;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .invoice-table th:last-child {
      text-align: right;
    }
    .invoice-table td {
      padding: 15px;
      border-bottom: 1px solid #eee;
      font-size: 14px;
    }
    .invoice-table td:last-child {
      text-align: right;
      font-weight: 500;
    }
    .invoice-table tr:hover td {
      background: #f9f9f9;
    }

    /* Totals */
    .totals-section {
      display: flex;
      justify-content: flex-end;
    }
    .totals-table {
      width: 300px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
    }
    .totals-row.subtotal {
      border-bottom: 1px solid #eee;
    }
    .totals-row.total {
      font-size: 20px;
      font-weight: 700;
      color: ${MEDCHAIN_DARK};
      border-top: 2px solid ${MEDCHAIN_BLUE};
      padding-top: 15px;
      margin-top: 10px;
    }

    /* Footer */
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #eee;
    }
    .payment-info {
      background: linear-gradient(135deg, ${MEDCHAIN_BLUE}10, ${MEDCHAIN_DARK}05);
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .payment-info h4 {
      color: ${MEDCHAIN_BLUE};
      font-size: 14px;
      margin-bottom: 10px;
    }
    .payment-info p {
      font-size: 13px;
      color: #444;
      margin-bottom: 5px;
    }
    .footer-note {
      text-align: center;
      font-size: 12px;
      color: #888;
    }
    .footer-note strong {
      color: ${MEDCHAIN_BLUE};
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        <h1>SARAWAK MEDCHAIN</h1>
        <p>Blockchain-Powered Healthcare Solutions</p>
        <p style="margin-top: 10px; font-size: 12px;">
          Level 15, Wisma Saberkas<br>
          Jalan Tun Abang Haji Openg<br>
          93000 Kuching, Sarawak
        </p>
      </div>
      <div class="invoice-title">
        <h2>Invoice</h2>
        <div class="invoice-number">${invoice.invoiceNumber}</div>
      </div>
    </div>

    <!-- Bill To & Info -->
    <div class="info-section">
      <div class="info-block">
        <h3>Bill To</h3>
        <p class="highlight">${invoice.hospitalName}</p>
        <p>${invoice.hospitalAddress}</p>
        <p>Attn: ${invoice.contactPerson}</p>
        <p>Email: ${invoice.financeEmail}</p>
      </div>
      <div class="info-block" style="text-align: right;">
        <h3>Billing Period</h3>
        <p class="highlight" style="font-size: 18px;">${invoice.billingPeriod}</p>
        <p style="margin-top: 10px; font-size: 12px; color: #666;">
          Wallet: ${invoice.walletAddress.slice(0, 6)}...${invoice.walletAddress.slice(-4)}
        </p>
      </div>
    </div>

    <!-- Dates -->
    <div class="dates-section">
      <div class="date-item">
        <label>Invoice Date</label>
        <span>${formatDate(invoice.issueDate)}</span>
      </div>
      <div class="date-item">
        <label>Due Date</label>
        <span>${formatDate(invoice.dueDate)}</span>
      </div>
      <div class="date-item">
        <label>Status</label>
        <span style="color: ${MEDCHAIN_BLUE};">PENDING</span>
      </div>
    </div>

    <!-- Line Items -->
    <table class="invoice-table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${invoice.lineItems.map(item => `
          <tr>
            <td>${item.description}</td>
            <td>${item.quantity}</td>
            <td>${formatCurrency(item.unitPrice)}</td>
            <td>${formatCurrency(item.total)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Totals -->
    <div class="totals-section">
      <div class="totals-table">
        <div class="totals-row subtotal">
          <span>Subtotal</span>
          <span>${formatCurrency(invoice.subtotal)}</span>
        </div>
        <div class="totals-row">
          <span>SST (0%)</span>
          <span>${formatCurrency(invoice.tax)}</span>
        </div>
        <div class="totals-row total">
          <span>Total Due</span>
          <span>${formatCurrency(invoice.total)}</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="payment-info">
        <h4>Payment Information</h4>
        <p><strong>Bank:</strong> CIMB Bank Berhad</p>
        <p><strong>Account Name:</strong> Sarawak MedChain Sdn Bhd</p>
        <p><strong>Account Number:</strong> 8600-123456-01</p>
        <p><strong>Reference:</strong> ${invoice.invoiceNumber}</p>
        <p style="margin-top: 10px; font-style: italic;">
          Please use the invoice number as payment reference.
        </p>
      </div>
      <p class="footer-note">
        Thank you for partnering with <strong>Sarawak MedChain</strong>.<br>
        For inquiries, contact billing@sarawakmedchain.com or call +60 82-123456
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text invoice for email body
 */
export function generateInvoiceText(invoice) {
  const formatCurrency = (amount) => `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
═══════════════════════════════════════════════════════════
                    SARAWAK MEDCHAIN
              Blockchain-Powered Healthcare Solutions
═══════════════════════════════════════════════════════════

INVOICE: ${invoice.invoiceNumber}
BILLING PERIOD: ${invoice.billingPeriod}

───────────────────────────────────────────────────────────
BILL TO:
${invoice.hospitalName}
${invoice.hospitalAddress}
Attn: ${invoice.contactPerson}
Email: ${invoice.financeEmail}

───────────────────────────────────────────────────────────
Invoice Date: ${formatDate(invoice.issueDate)}
Due Date: ${formatDate(invoice.dueDate)}

───────────────────────────────────────────────────────────
ITEMS:

${invoice.lineItems.map(item =>
  `${item.description}
   Qty: ${item.quantity} × ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.total)}`
).join('\n\n')}

───────────────────────────────────────────────────────────
                                    Subtotal: ${formatCurrency(invoice.subtotal)}
                                    SST (0%): ${formatCurrency(invoice.tax)}
                                    ─────────────────────
                                    TOTAL DUE: ${formatCurrency(invoice.total)}

═══════════════════════════════════════════════════════════
PAYMENT INFORMATION:
Bank: CIMB Bank Berhad
Account Name: Sarawak MedChain Sdn Bhd
Account Number: 8600-123456-01
Reference: ${invoice.invoiceNumber}

Please use the invoice number as payment reference.
───────────────────────────────────────────────────────────
Thank you for partnering with Sarawak MedChain.
For inquiries: billing@sarawakmedchain.com | +60 82-123456
═══════════════════════════════════════════════════════════
  `.trim();
}

export default { generateInvoicePDF, generateInvoiceHTML, generateInvoiceText };
