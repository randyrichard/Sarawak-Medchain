/**
 * Email Service for Sarawak MedChain
 * Uses SendGrid API for automated invoice delivery
 */

import { generateInvoiceText, generateInvoiceHTML } from './invoiceGenerator.js';

// SendGrid API configuration
// In production, set SENDGRID_API_KEY in environment variables
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'billing@sarawakmedchain.com';
const FROM_NAME = 'Sarawak MedChain Billing';

/**
 * Send invoice email using SendGrid
 */
export async function sendInvoiceEmail({ to, invoiceNumber, hospitalName, amount, dueDate, pdfBuffer }) {
  const formatCurrency = (amt) => `RM ${amt.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `Sarawak MedChain Invoice ${invoiceNumber} - ${formatCurrency(amount)} Due`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #0066CC, #003366); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #fff; padding: 30px; border: 1px solid #eee; }
    .highlight-box { background: #f8f9fa; border-left: 4px solid #0066CC; padding: 20px; margin: 20px 0; }
    .amount { font-size: 32px; color: #0066CC; font-weight: bold; }
    .btn { display: inline-block; background: #0066CC; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
    .details { margin: 20px 0; }
    .details dt { color: #666; font-size: 12px; text-transform: uppercase; }
    .details dd { margin: 0 0 15px 0; font-size: 16px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SARAWAK MEDCHAIN</h1>
      <p style="margin: 5px 0 0 0; opacity: 0.9;">Monthly Invoice</p>
    </div>
    <div class="content">
      <p>Dear Finance Team,</p>
      <p>Please find attached your monthly invoice from <strong>Sarawak MedChain</strong>.</p>

      <div class="highlight-box">
        <dl class="details">
          <dt>Invoice Number</dt>
          <dd>${invoiceNumber}</dd>

          <dt>Hospital</dt>
          <dd>${hospitalName}</dd>

          <dt>Amount Due</dt>
          <dd class="amount">${formatCurrency(amount)}</dd>

          <dt>Due Date</dt>
          <dd>${formatDate(dueDate)}</dd>
        </dl>
      </div>

      <p>This invoice includes:</p>
      <ul>
        <li>Monthly platform subscription fee</li>
        <li>Medical Certificate (MC) issuance charges</li>
      </ul>

      <p><strong>Payment Details:</strong></p>
      <ul style="list-style: none; padding: 0;">
        <li><strong>Bank:</strong> CIMB Bank Berhad</li>
        <li><strong>Account Name:</strong> Sarawak MedChain Sdn Bhd</li>
        <li><strong>Account Number:</strong> 8600-123456-01</li>
        <li><strong>Reference:</strong> ${invoiceNumber}</li>
      </ul>

      <p style="color: #666; font-style: italic;">
        Please use the invoice number as your payment reference for faster processing.
      </p>

      <p>If you have any questions about this invoice, please don't hesitate to contact us.</p>

      <p>Best regards,<br>
      <strong>Sarawak MedChain Billing Team</strong></p>
    </div>
    <div class="footer">
      <p><strong>Sarawak MedChain Sdn Bhd</strong></p>
      <p>Level 15, Wisma Saberkas, Jalan Tun Abang Haji Openg, 93000 Kuching, Sarawak</p>
      <p>Email: billing@sarawakmedchain.com | Phone: +60 82-123456</p>
      <p style="margin-top: 15px; font-size: 11px; color: #999;">
        This is an automated email. Please do not reply directly to this message.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const textContent = `
SARAWAK MEDCHAIN - Monthly Invoice
================================

Dear Finance Team,

Please find below your monthly invoice details from Sarawak MedChain.

Invoice Number: ${invoiceNumber}
Hospital: ${hospitalName}
Amount Due: ${formatCurrency(amount)}
Due Date: ${formatDate(dueDate)}

This invoice includes:
- Monthly platform subscription fee
- Medical Certificate (MC) issuance charges

PAYMENT DETAILS:
Bank: CIMB Bank Berhad
Account Name: Sarawak MedChain Sdn Bhd
Account Number: 8600-123456-01
Reference: ${invoiceNumber}

Please use the invoice number as your payment reference.

Best regards,
Sarawak MedChain Billing Team

---
Sarawak MedChain Sdn Bhd
Level 15, Wisma Saberkas
Jalan Tun Abang Haji Openg
93000 Kuching, Sarawak
Email: billing@sarawakmedchain.com
Phone: +60 82-123456
  `.trim();

  // If SendGrid API key is configured, send via SendGrid
  if (SENDGRID_API_KEY) {
    return await sendViaSendGrid({
      to,
      subject,
      htmlContent,
      textContent,
    });
  }

  // Demo mode: simulate email sending
  console.log(`[EMAIL SERVICE] Simulating email to: ${to}`);
  console.log(`[EMAIL SERVICE] Subject: ${subject}`);
  console.log(`[EMAIL SERVICE] Invoice: ${invoiceNumber}`);

  return {
    success: true,
    messageId: `demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    to,
    subject,
    mode: 'demo',
  };
}

/**
 * Send email via SendGrid API
 */
async function sendViaSendGrid({ to, subject, htmlContent, textContent }) {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      content: [
        { type: 'text/plain', value: textContent },
        { type: 'text/html', value: htmlContent },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SendGrid error: ${error}`);
  }

  return {
    success: true,
    messageId: response.headers.get('x-message-id') || `sg-${Date.now()}`,
    to,
    subject,
    mode: 'sendgrid',
  };
}

/**
 * Send founder alert notification
 */
export async function sendFounderAlert({ totalBilled, invoiceCount, billingPeriod }) {
  const formatCurrency = (amt) => `RM ${amt.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;

  const alert = {
    id: `alert-${Date.now()}`,
    type: 'invoice_batch',
    title: 'Invoices Sent',
    message: `${formatCurrency(totalBilled)} total billing initiated for ${billingPeriod}`,
    details: {
      totalBilled,
      invoiceCount,
      billingPeriod,
    },
    timestamp: new Date().toISOString(),
    read: false,
  };

  // In production, this would push to a real-time notification system
  // For now, store in memory and let frontend poll for alerts

  return alert;
}

export default { sendInvoiceEmail, sendFounderAlert };
