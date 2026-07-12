import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { canonicalDate } from '../lib/canonical.js';

export interface MCPdfData {
  mcNumber: string;
  patientName: string;
  patientIcMasked: string;
  restDays: number;
  startDate: Date;
  endDate: Date;
  dateIssued: Date;
  doctorName: string;
  mmcNumber: string;
  facilityName: string;
  facilityRegistrationNo: string;
  facilityState: string;
  canonicalHash: string;
  chainTxHash?: string | null;
  anchored: boolean;
}

export function verificationUrl(canonicalHash: string): string {
  return `${config.publicWebUrl}/verify/${canonicalHash}`;
}

/**
 * Render the official e-MC PDF. The document itself is NOT the trust anchor —
 * the QR code and hash are: any printed or emailed copy is verified by
 * scanning the QR, which re-checks the database, signature and blockchain.
 */
export async function renderMCPdf(mc: MCPdfData): Promise<Buffer> {
  const url = verificationUrl(mc.canonicalHash);
  const qrPng = await QRCode.toBuffer(url, { width: 220, margin: 1 });

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const teal = '#0f766e';
  const gray = '#4b5563';

  // Header band
  doc.rect(0, 0, doc.page.width, 90).fill(teal);
  doc.fill('#ffffff').font('Helvetica-Bold').fontSize(20).text('DIGITAL MEDICAL CERTIFICATE', 50, 26);
  doc.font('Helvetica').fontSize(10).text('Sijil Cuti Sakit Digital — MedChain e-MC Platform', 50, 52);
  doc.fontSize(9).text(`Certificate No: ${mc.mcNumber}`, 50, 68);

  // QR block (top right, below header)
  doc.image(qrPng, doc.page.width - 50 - 130, 110, { width: 130 });
  doc.fill(gray).fontSize(7).text('Scan to verify authenticity', doc.page.width - 50 - 130, 244, {
    width: 130,
    align: 'center',
  });

  // Body fields
  let y = 120;
  const field = (label: string, value: string) => {
    doc.fill(gray).font('Helvetica').fontSize(9).text(label.toUpperCase(), 50, y);
    doc.fill('#111827').font('Helvetica-Bold').fontSize(12).text(value, 50, y + 12, { width: 330 });
    y += 40;
  };

  field('Patient Name / Nama Pesakit', mc.patientName);
  field('IC / Passport', mc.patientIcMasked);
  field(
    'Rest Period / Tempoh Rehat',
    `${mc.restDays} day(s): ${canonicalDate(mc.startDate)} to ${canonicalDate(mc.endDate)}`
  );
  field('Issuing Doctor / Doktor', `${mc.doctorName}  (MMC ${mc.mmcNumber})`);
  field('Facility / Fasiliti', `${mc.facilityName} (${mc.facilityRegistrationNo}), ${mc.facilityState}`);
  field('Date Issued / Tarikh Dikeluarkan', canonicalDate(mc.dateIssued));

  // Integrity block
  y += 10;
  doc.moveTo(50, y).lineTo(doc.page.width - 50, y).stroke('#d1d5db');
  y += 14;
  doc.fill(gray).font('Helvetica').fontSize(8).text('CRYPTOGRAPHIC FINGERPRINT (KECCAK-256)', 50, y);
  doc.fill('#111827').font('Courier').fontSize(8).text(mc.canonicalHash, 50, y + 12, { width: 495 });
  y += 36;
  if (mc.anchored && mc.chainTxHash) {
    doc.fill(gray).font('Helvetica').fontSize(8).text('BLOCKCHAIN ANCHOR (ETHEREUM SEPOLIA)', 50, y);
    doc.fill('#111827').font('Courier').fontSize(8).text(mc.chainTxHash, 50, y + 12, { width: 495 });
    y += 36;
  }
  doc.fill(gray).font('Helvetica').fontSize(8).text('VERIFICATION URL', 50, y);
  doc.fill(teal).font('Helvetica').fontSize(9).text(url, 50, y + 12, { link: url, width: 495 });
  y += 40;

  // Footer
  doc
    .fill(gray)
    .fontSize(7.5)
    .font('Helvetica')
    .text(
      'This certificate is digitally signed by the issuing doctor and its fingerprint is anchored on a public blockchain. ' +
        'Any alteration of the printed or electronic copy is detectable at the verification URL above. ' +
        'The medical reason is confidential and is never shown during verification.',
      50,
      doc.page.height - 90,
      { width: 495 }
    );

  doc.end();
  return done;
}
