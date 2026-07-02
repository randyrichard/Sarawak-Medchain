"""
Multi-page A4 Business Plan PDF for Cradle / SDEC / investor outreach.

Reads content structured from BUSINESS_PLAN_v1.md, generates a professional
multi-page PDF with cover, TOC, sections, tables, and page numbers.

Run: python build_business_plan_pdf.py
Output: SarawakMedChain_BusinessPlan_v1.pdf
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable, ListFlowable, ListItem,
)
from reportlab.pdfgen import canvas
from pathlib import Path

# Brand palette
NAVY = HexColor('#0F2A5C')
NAVY_LIGHT = HexColor('#1E3A8A')
TEAL = HexColor('#0F766E')
TEAL_LIGHT = HexColor('#14B8A6')
SLATE_900 = HexColor('#0F172A')
SLATE_700 = HexColor('#334155')
SLATE_500 = HexColor('#64748B')
SLATE_400 = HexColor('#94A3B8')
SLATE_200 = HexColor('#E2E8F0')
SLATE_100 = HexColor('#F1F5F9')
SLATE_50 = HexColor('#F8FAFC')
AMBER_50 = HexColor('#FFFBEB')
AMBER_400 = HexColor('#F59E0B')
AMBER_700 = HexColor('#B45309')
WHITE = HexColor('#FFFFFF')

OUTPUT = Path(__file__).parent / 'SarawakMedChain_BusinessPlan_v3.pdf'

# ============== Styles ==============
styles = {
    'cover_brand': ParagraphStyle(
        'cover_brand', fontName='Helvetica-Bold', fontSize=32, leading=36,
        textColor=NAVY, alignment=TA_LEFT, spaceAfter=8, tracking=-0.02
    ),
    'cover_tagline': ParagraphStyle(
        'cover_tagline', fontName='Helvetica', fontSize=13, leading=18,
        textColor=SLATE_500, alignment=TA_LEFT, spaceAfter=24
    ),
    'cover_label': ParagraphStyle(
        'cover_label', fontName='Helvetica-Bold', fontSize=9, leading=12,
        textColor=TEAL, alignment=TA_LEFT, spaceAfter=6
    ),
    'cover_meta': ParagraphStyle(
        'cover_meta', fontName='Helvetica', fontSize=10, leading=15,
        textColor=SLATE_700, alignment=TA_LEFT, spaceAfter=4
    ),
    'h1': ParagraphStyle(
        'h1', fontName='Helvetica-Bold', fontSize=20, leading=26,
        textColor=NAVY, spaceBefore=20, spaceAfter=10, keepWithNext=1
    ),
    'h1_num': ParagraphStyle(
        'h1_num', fontName='Helvetica-Bold', fontSize=9, leading=12,
        textColor=TEAL, spaceBefore=20, spaceAfter=2, keepWithNext=1
    ),
    'h2': ParagraphStyle(
        'h2', fontName='Helvetica-Bold', fontSize=13, leading=18,
        textColor=SLATE_900, spaceBefore=14, spaceAfter=6, keepWithNext=1
    ),
    'h3': ParagraphStyle(
        'h3', fontName='Helvetica-Bold', fontSize=10, leading=14,
        textColor=NAVY, spaceBefore=10, spaceAfter=4, keepWithNext=1
    ),
    'body': ParagraphStyle(
        'body', fontName='Helvetica', fontSize=9.5, leading=14,
        textColor=SLATE_700, spaceAfter=8, alignment=TA_JUSTIFY
    ),
    'body_center': ParagraphStyle(
        'body_center', fontName='Helvetica', fontSize=9.5, leading=14,
        textColor=SLATE_700, spaceAfter=8, alignment=TA_CENTER
    ),
    'callout': ParagraphStyle(
        'callout', fontName='Helvetica-Oblique', fontSize=9, leading=13,
        textColor=SLATE_500, spaceAfter=6, leftIndent=8, rightIndent=8
    ),
    'quote': ParagraphStyle(
        'quote', fontName='Helvetica-BoldOblique', fontSize=11, leading=16,
        textColor=NAVY, spaceAfter=6, leftIndent=14, rightIndent=14,
    ),
    'quote_source': ParagraphStyle(
        'quote_source', fontName='Helvetica', fontSize=8.5, leading=12,
        textColor=SLATE_500, spaceAfter=12, leftIndent=14
    ),
    'small_note': ParagraphStyle(
        'small_note', fontName='Helvetica-Oblique', fontSize=8, leading=11,
        textColor=SLATE_500, spaceAfter=8
    ),
    'toc_item': ParagraphStyle(
        'toc_item', fontName='Helvetica', fontSize=10, leading=18,
        textColor=SLATE_700, leftIndent=0
    ),
    'toc_num': ParagraphStyle(
        'toc_num', fontName='Helvetica-Bold', fontSize=10, leading=18,
        textColor=NAVY
    ),
}


# ============== Page decorations ==============
class PageWithFooter:
    """Handles page header + footer including page numbers."""

    @staticmethod
    def on_page(c, doc):
        page_num = c.getPageNumber()

        # Cover page gets a completely custom design
        if page_num == 1:
            PageWithFooter._draw_cover(c)
            return

        c.saveState()

        # Header: thin top rule + section context
        c.setStrokeColor(SLATE_200)
        c.setLineWidth(0.3)
        c.line(20 * mm, A4[1] - 12 * mm, A4[0] - 20 * mm, A4[1] - 12 * mm)

        # Small brand mark top-left
        c.setFillColor(NAVY)
        c.roundRect(20 * mm, A4[1] - 10 * mm, 3 * mm, 3 * mm, 0.5 * mm, stroke=0, fill=1)
        c.setFont('Helvetica-Bold', 7)
        c.setFillColor(SLATE_500)
        c.drawString(25 * mm, A4[1] - 9 * mm, 'SARAWAK MEDCHAIN')
        c.setFont('Helvetica', 7)
        c.setFillColor(SLATE_400)
        c.drawRightString(A4[0] - 20 * mm, A4[1] - 9 * mm, 'Business Plan  ·  v1.0  ·  Confidential')

        # Footer: thin rule + brand + page number
        c.setStrokeColor(SLATE_200)
        c.setLineWidth(0.3)
        c.line(20 * mm, 15 * mm, A4[0] - 20 * mm, 15 * mm)

        c.setFont('Helvetica', 7)
        c.setFillColor(SLATE_500)
        c.drawString(20 * mm, 10 * mm, 'Sarawak MedChain  ·  Business Plan v1.0  ·  June 2026')

        c.setFont('Helvetica-Bold', 8)
        c.setFillColor(NAVY)
        c.drawRightString(A4[0] - 20 * mm, 10 * mm, f'{page_num}')
        c.setFont('Helvetica', 7)
        c.setFillColor(SLATE_400)
        c.drawRightString(A4[0] - 20 * mm - 6 * mm, 10 * mm, 'PAGE')

        c.restoreState()

    @staticmethod
    def _draw_cover(c):
        """Draw the entire cover page via canvas primitives.
        Structure: top 55% navy hero, bottom 45% white content with metadata grid.
        """
        c.saveState()

        W, H = A4  # 595, 842
        HERO_H = 480  # navy hero band height from top

        # ============ TOP: full-bleed navy hero ============
        c.setFillColor(NAVY)
        c.rect(0, H - HERO_H, W, HERO_H, stroke=0, fill=1)

        # Subtle diagonal accent line (teal) — visual interest without noise
        c.setStrokeColor(TEAL)
        c.setLineWidth(2)
        c.line(0, H - HERO_H, 200, H - HERO_H + 200)  # decorative accent

        # Brand chip pill in top-left
        chip_x, chip_y = 45, H - 60
        c.setFillColor(HexColor('#1E3A8A'))  # slightly lighter navy for chip
        c.roundRect(chip_x, chip_y, 180, 20, 10, stroke=0, fill=1)
        # Chip dot
        c.setFillColor(TEAL_LIGHT)
        c.circle(chip_x + 12, chip_y + 10, 3, stroke=0, fill=1)
        c.setFont('Helvetica-Bold', 8)
        c.setFillColor(HexColor('#FFFFFF'))
        c.drawString(chip_x + 22, chip_y + 7, 'SARAWAK  ·  MADE IN MIRI')

        # Big brand mark
        c.setFont('Helvetica-Bold', 50)
        c.setFillColor(HexColor('#FFFFFF'))
        c.drawString(45, H - 160, 'SARAWAK')
        c.drawString(45, H - 205, 'MEDCHAIN')

        # Accent divider
        c.setStrokeColor(TEAL_LIGHT)
        c.setLineWidth(3)
        c.line(45, H - 220, 100, H - 220)

        # Tagline
        c.setFont('Helvetica', 12)
        c.setFillColor(HexColor('#CBD5E1'))
        c.drawString(45, H - 245, "Sarawak's Sovereign Health Record System")
        c.setFont('Helvetica-Oblique', 10)
        c.setFillColor(HexColor('#94A3B8'))
        c.drawString(45, H - 262, 'Blockchain-secured  ·  Patient-controlled  ·  Audit-ready')

        # Big "BUSINESS PLAN" section on hero
        c.setFont('Helvetica-Bold', 9)
        c.setFillColor(TEAL_LIGHT)
        c.drawString(45, H - 315, 'BUSINESS PLAN')
        c.setFont('Helvetica-Bold', 32)
        c.setFillColor(HexColor('#FFFFFF'))
        c.drawString(45, H - 355, 'Version 1.0')
        c.setFont('Helvetica', 10)
        c.setFillColor(HexColor('#94A3B8'))
        c.drawString(45, H - 375, 'Prepared  ·  June 2026')

        # Right side: "Prepared for" panel
        panel_x = W - 220
        panel_y = H - 130
        c.setFont('Helvetica-Bold', 8)
        c.setFillColor(TEAL_LIGHT)
        c.drawString(panel_x, panel_y, 'PREPARED FOR')
        c.setFont('Helvetica-Bold', 11)
        c.setFillColor(HexColor('#FFFFFF'))
        c.drawString(panel_x, panel_y - 18, 'Cradle Fund Sdn Bhd')
        c.setFont('Helvetica', 9)
        c.setFillColor(HexColor('#CBD5E1'))
        c.drawString(panel_x, panel_y - 32, 'Sarawak Digital Economy Corp.')
        c.drawString(panel_x, panel_y - 46, 'TEGAS · Prospective funders')

        # Small confidentiality tag on hero bottom-right
        conf_y = H - HERO_H + 20
        c.setFillColor(HexColor('#0A1F44'))
        c.roundRect(W - 155, conf_y - 12, 130, 18, 9, stroke=0, fill=1)
        c.setFont('Helvetica-Bold', 7.5)
        c.setFillColor(HexColor('#94A3B8'))
        c.drawString(W - 145, conf_y - 8, 'CONFIDENTIAL  ·  DRAFT v1.0')

        # ============ BOTTOM: metadata grid on white ============
        # Section eyebrow
        c.setFont('Helvetica-Bold', 8)
        c.setFillColor(TEAL)
        c.drawString(45, H - HERO_H - 40, 'AT A GLANCE')

        # Divider
        c.setStrokeColor(SLATE_200)
        c.setLineWidth(0.6)
        c.line(45, H - HERO_H - 50, W - 45, H - HERO_H - 50)

        # 3-column metadata grid
        cols = [
            {
                'label': 'COMPANY',
                'primary': 'Medchain Enterprise',
                'secondary': 'SSM-registered June 2026',
                'tertiary': 'Trading brand: Sarawak MedChain',
            },
            {
                'label': 'FOUNDER',
                'primary': 'Randy Richard',
                'secondary': '19, Miri, Sarawak',
                'tertiary': 'Self-taught · Solo builder · 7 months',
            },
            {
                'label': 'CONTACT',
                'primary': 'randyrjm99@gmail.com',
                'secondary': 'sarawak-medchain.pages.dev',
                'tertiary': 'GitHub: randyrichard/Sarawak-Medchain',
            },
        ]
        col_w = (W - 90) / 3
        col_y = H - HERO_H - 90
        for i, col in enumerate(cols):
            x = 45 + i * col_w
            c.setFont('Helvetica-Bold', 7.5)
            c.setFillColor(TEAL)
            c.drawString(x, col_y, col['label'])
            c.setFont('Helvetica-Bold', 11)
            c.setFillColor(SLATE_900)
            c.drawString(x, col_y - 18, col['primary'])
            c.setFont('Helvetica', 8.5)
            c.setFillColor(SLATE_500)
            c.drawString(x, col_y - 32, col['secondary'])
            c.setFont('Helvetica', 8)
            c.setFillColor(SLATE_400)
            c.drawString(x, col_y - 44, col['tertiary'])

        # The Ask callout box
        ask_y = 190
        c.setStrokeColor(NAVY)
        c.setLineWidth(0.8)
        c.setFillColor(SLATE_50)
        c.roundRect(45, ask_y, W - 90, 90, 6, stroke=1, fill=1)

        c.setFont('Helvetica-Bold', 8)
        c.setFillColor(TEAL)
        c.drawString(60, ask_y + 68, 'THE ASK  ·  AT A GLANCE')

        c.setFont('Helvetica-Bold', 22)
        c.setFillColor(NAVY)
        c.drawString(60, ask_y + 40, 'RM 50,000 – RM 150,000')

        c.setFont('Helvetica', 9)
        c.setFillColor(SLATE_500)
        c.drawString(60, ask_y + 24, 'Cradle CIP Spark / MyStartup  ·  12-month runway to first paying customers')

        # Small stats on right of ask box
        stat_x = W - 200
        c.setFont('Helvetica-Bold', 7.5)
        c.setFillColor(SLATE_500)
        c.drawString(stat_x, ask_y + 68, 'TARGET BY MONTH 12')
        c.setFont('Helvetica-Bold', 12)
        c.setFillColor(NAVY)
        c.drawString(stat_x, ask_y + 50, '5 clinics + 2 hospitals')
        c.setFont('Helvetica', 9)
        c.setFillColor(TEAL)
        c.drawString(stat_x, ask_y + 34, 'RM 42,500 MRR  ·  RM 510k ARR')

        # Bottom footer bar
        c.setFillColor(SLATE_50)
        c.rect(0, 0, W, 40, stroke=0, fill=1)
        c.setStrokeColor(SLATE_200)
        c.setLineWidth(0.4)
        c.line(0, 40, W, 40)

        # Footer content
        c.setFont('Helvetica-Bold', 7.5)
        c.setFillColor(NAVY)
        c.drawString(45, 22, 'SARAWAK MEDCHAIN  ·  Business Plan v1.0')
        c.setFont('Helvetica', 7.5)
        c.setFillColor(SLATE_500)
        c.drawString(45, 12, 'Prepared June 2026  ·  Confidential  ·  Not for redistribution without founder consent')

        c.setFont('Helvetica-Bold', 7.5)
        c.setFillColor(TEAL)
        c.drawRightString(W - 45, 22, 'sarawak-medchain.pages.dev')
        c.setFont('Helvetica', 7)
        c.setFillColor(SLATE_400)
        c.drawRightString(W - 45, 12, 'Built in Sarawak  ·  For Sarawak')

        c.restoreState()


# ============== Content builders ==============
def cover_page():
    """First page — cover is drawn entirely by PageWithFooter._draw_cover().
    We just need a Spacer + PageBreak to reserve the page and move past it.
    """
    story = []
    # Push flowable content off the visible area so the drawn cover shows alone.
    # Frame height ~710pt; use 700 to stay within limits then force page break.
    story.append(Spacer(1, 700))
    story.append(PageBreak())
    return story


def toc_page():
    """Table of contents."""
    story = []
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph('TABLE OF CONTENTS', styles['cover_label']))
    story.append(Spacer(1, 8 * mm))

    toc_items = [
        ('Executive Summary', 3),
        ('1. The Problem', 3),
        ('2. The Solution', 4),
        ('3. Market Opportunity', 5),
        ('4. Business Model', 6),
        ('5. Traction & Roadmap', 7),
        ('6. Team', 8),
        ('7. Financials', 8),
        ('8. Risk & Mitigation', 9),
        ('9. Why Cradle / Sarawak Now', 10),
        ('Appendix A: Legal & Compliance', 10),
        ('Appendix B: Working URLs', 10),
    ]

    # Two-column TOC using a Table
    toc_data = []
    for title, pg in toc_items:
        # Left col: title, right col: page number with dot leaders
        title_para = Paragraph(title, styles['toc_item'])
        pg_para = Paragraph(f'<font color="#94A3B8">.................</font>  <b><font color="#0F2A5C">{pg}</font></b>',
                            styles['toc_item'])
        toc_data.append([title_para, pg_para])

    toc_tbl = Table(toc_data, colWidths=[110 * mm, 45 * mm])
    toc_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(toc_tbl)

    story.append(Spacer(1, 20 * mm))
    story.append(HRFlowable(width='100%', thickness=0.5, color=SLATE_200))
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(
        '<font color="#64748B">This document is prepared for prospective funders, government partners, and pilot facilities. '
        'The live product may be verified any time at sarawak-medchain.pages.dev.</font>',
        styles['small_note']
    ))

    story.append(PageBreak())
    return story


def exec_summary():
    story = []
    story.append(Paragraph('EXECUTIVE SUMMARY', styles['h1_num']))
    story.append(Paragraph('Snapshot', styles['h1']))

    story.append(Paragraph(
        'Sarawak MedChain is a blockchain-secured medical certificate platform that eliminates MC fraud in Malaysia '
        'through cryptographic verification, patient-controlled access, and audit-ready reporting for state agencies.',
        styles['body']
    ))
    story.append(Paragraph(
        'The product is <b>live</b> at sarawak-medchain.pages.dev, with a <b>working OTP demo</b> at /otp that lets '
        'doctors access patient records via a 6-digit code — no wallet, no app install required.',
        styles['body']
    ))
    story.append(Paragraph(
        'On <b>21 June 2026</b>, the Minister of Health, Datuk Seri Dr Dzulkefly Ahmad, publicly announced KKM is '
        '<i>studying e-MC implementation to curb misuse of sick leave certificates</i> (Astro Awani). '
        'Sarawak MedChain is a built, working implementation of exactly this — ready for a Sarawak pilot today.',
        styles['body']
    ))

    # Highlight box: stage + ask
    story.append(Spacer(1, 4 * mm))
    highlight_data = [[
        Paragraph('<b><font color="#0F766E" size="8">STAGE</font></b><br/>'
                  '<font color="#0F172A" size="10">Pilot-ready · Pre-revenue</font><br/>'
                  '<font color="#64748B" size="8">Enterprise-registered · Sdn Bhd upon first contract</font>',
                  styles['body']),
        Paragraph('<b><font color="#0F766E" size="8">THE ASK</font></b><br/>'
                  '<font color="#0F172A" size="10">RM 50,000 - 150,000</font><br/>'
                  '<font color="#64748B" size="8">Cradle CIP Spark / MyStartup · 12-month runway to first paying customers</font>',
                  styles['body']),
    ]]
    highlight = Table(highlight_data, colWidths=[85 * mm, 85 * mm])
    highlight.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 0), (-1, -1), SLATE_50),
        ('BOX', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))
    story.append(highlight)

    return story


def section_problem():
    story = []
    story.append(Paragraph('SECTION 1', styles['h1_num']))
    story.append(Paragraph('The Problem', styles['h1']))

    story.append(Paragraph(
        'Malaysia loses an estimated <b>RM 1.5 - 3 billion</b> annually to medical certificate fraud. '
        'Paper-based MC systems offer zero protection:',
        styles['body']
    ))

    bullets = [
        '<b>Easily forged</b> - paper templates freely available online',
        '<b>Impossible to verify at the point of use</b> - employers cannot check authenticity',
        '<b>No audit trail</b> - no way to track issuance, access, or misuse',
        '<b>No central registry</b> - no way to confirm whether a specific MC was actually issued at the named facility, by the named doctor, on the claimed date',
    ]
    for b in bullets:
        story.append(Paragraph(f'&#8226; &nbsp; {b}', styles['body']))

    story.append(Paragraph(
        '<i>Estimate methodology: Malaysia healthcare spend (~RM 60B, MOH 2023) '
        'multiplied by the global healthcare fraud range of 3-7% (NHCAA - National Health Care Anti-Fraud '
        'Association). MC-specific data is not publicly tracked.</i>',
        styles['small_note']
    ))

    story.append(Paragraph('Market timing', styles['h2']))
    story.append(Paragraph(
        'On <b>21 June 2026</b>, Minister of Health Datuk Seri Dr Dzulkefly Ahmad publicly stated:',
        styles['body']
    ))

    story.append(Paragraph(
        '&#8220;KKM teliti pelaksanaan e-MC, kekang penyalahgunaan sijil cuti sakit&#8221;',
        styles['quote']
    ))
    story.append(Paragraph(
        '- reported by Astro Awani (@501awani)',
        styles['quote_source']
    ))

    story.append(Paragraph(
        'This is a Tier-1 public signal that Malaysia is actively moving toward e-MC. The addressable market is '
        'not hypothetical; it is being defined by the Health Ministry in real time.',
        styles['body']
    ))

    return story


def section_solution():
    story = []
    story.append(PageBreak())
    story.append(Paragraph('SECTION 2', styles['h1_num']))
    story.append(Paragraph('The Solution', styles['h1']))

    story.append(Paragraph(
        'Sarawak MedChain is a blockchain-secured medical certificate platform with three novel design decisions:',
        styles['body']
    ))

    decisions = [
        ('Client-side encryption (AES-256-GCM)',
         'The medical record is encrypted in the browser <i>before</i> it leaves the doctor\'s device.'),
        ('Public smart contract for cryptographic hashes',
         'Only tamper-proof fingerprints go on-chain; personal data stays encrypted off-chain on IPFS (Malaysia-hosted).'),
        ('Dual access modes',
         'Wallet sign-in for hospital staff, and a 6-digit OTP for patients, elderly users, and guest doctors who need immediate access without app install.'),
    ]
    for i, (title, body) in enumerate(decisions):
        story.append(Paragraph(f'<b><font color="#0F2A5C">{i+1}.</font>  {title}</b>', styles['h3']))
        story.append(Paragraph(body, styles['body']))

    story.append(Paragraph('How it works - 5 steps', styles['h2']))
    steps = [
        ('Doctor issues', 'Verified doctor signs in with secure wallet, fills the MC, submits.'),
        ('Encrypted &amp; hashed', 'AES-256-GCM client-side; hash on public smart contract.'),
        ('Patient controls', 'Grant or revoke access to specific doctors/employers anytime; every access logged on-chain.'),
        ('Employer verifies', 'Anyone scans the QR code; verified in under 5 seconds.'),
        ('Audit-ready', 'Every action logged on-chain; state agencies see anonymised, aggregated data.'),
    ]
    step_data = []
    for i, (title, body) in enumerate(steps):
        step_data.append([
            Paragraph(f'<b><font color="#FFFFFF" size="10">{i+1:02d}</font></b>', styles['body_center']),
            Paragraph(f'<b>{title}</b>&nbsp;&nbsp;&nbsp; <font color="#64748B">{body}</font>', styles['body']),
        ])
    step_tbl = Table(step_data, colWidths=[12 * mm, 158 * mm])
    step_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 0), (0, -1), NAVY),
        ('BOX', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(step_tbl)

    story.append(Paragraph('Live product URLs', styles['h2']))
    urls = [
        ('Landing', 'sarawak-medchain.pages.dev'),
        ('Working OTP demo', 'sarawak-medchain.pages.dev/#/otp'),
        ('Government preview dashboard', 'sarawak-medchain.pages.dev/#/gov-preview'),
        ('Privacy Policy (PDPA 2010)', '/privacy'),
        ('Terms of Service (Malaysian law)', '/terms'),
        ('Public source', 'github.com/randyrichard/Sarawak-Medchain'),
    ]
    for label, url in urls:
        story.append(Paragraph(f'&#8226; <b>{label}:</b> <font color="#0F766E">{url}</font>', styles['body']))

    return story


def section_market():
    story = []
    story.append(PageBreak())
    story.append(Paragraph('SECTION 3', styles['h1_num']))
    story.append(Paragraph('Market Opportunity', styles['h1']))

    story.append(Paragraph('Total Addressable Market (TAM) - Malaysia', styles['h2']))
    story.append(Paragraph(
        '~2,000 registered clinics and 380 hospitals (public and private) issue medical certificates. '
        'KKM\'s announced e-MC direction creates a national mandate horizon of 18-36 months.',
        styles['body']
    ))

    story.append(Paragraph('Serviceable Addressable Market (SAM) - Sarawak (initial focus)', styles['h2']))
    story.append(Paragraph(
        '27 hospitals · 142 clinics · ~1,247 registered doctors · population 2.9 million. '
        'State-level Sarawak Digital Economy Corporation (SDEC) and TEGAS provide institutional support for locally-built solutions.',
        styles['body']
    ))

    story.append(Paragraph('Serviceable Obtainable Market (SOM) - 12 months', styles['h2']))
    som = [
        ('Q3 2026', '1 hospital pilot (target: Sarawak General Hospital, Kuching)'),
        ('Q4 2026', '2-3 additional Sarawak facility pilots'),
        ('Q1 2027', 'Convert pilots to paid subscriptions'),
        ('Q2 2027', '5-8 paying facilities across Sarawak'),
    ]
    som_data = [[Paragraph(f'<b><font color="#0F2A5C">{q}</font></b>', styles['body']),
                 Paragraph(m, styles['body'])] for q, m in som]
    som_tbl = Table(som_data, colWidths=[28 * mm, 142 * mm])
    som_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(som_tbl)

    story.append(Paragraph('Competitive landscape', styles['h2']))
    comp = [
        ('KKM\'s future e-MC system',
         'Likely 18-36 months out. <b>Sarawak MedChain\'s advantage is being ready today</b> - while KKM is still studying, Sarawak can pilot first.'),
        ('Private EMR vendors (Cerner, Epic)',
         'Priced for national tenders (RM 10M+); not accessible to Sarawak\'s smaller facilities.'),
        ('Foreign blockchain healthcare startups',
         'None are Malaysia-focused, PDPA-compliant, or Sarawak-based.'),
    ]
    for title, body in comp:
        story.append(Paragraph(f'<b>{title}</b>', styles['h3']))
        story.append(Paragraph(body, styles['body']))

    return story


def section_bizmodel():
    story = []
    story.append(PageBreak())
    story.append(Paragraph('SECTION 4', styles['h1_num']))
    story.append(Paragraph('Business Model', styles['h1']))

    story.append(Paragraph('Revenue streams', styles['h2']))
    streams = [
        ('SaaS subscription', 'Monthly per-clinic/per-hospital tier'),
        ('Per-MC issuance credits', 'Pre-paid credits for high-volume issuers'),
        ('Enterprise / government tier', 'Custom pricing for state agencies and large hospital groups'),
    ]
    for t, b in streams:
        story.append(Paragraph(f'&#8226; <b>{t}</b> - {b}', styles['body']))

    story.append(Paragraph('Pricing (base subscription + per-MC usage)', styles['h2']))
    pricing_data = [
        [Paragraph('<b>Tier</b>', styles['body']),
         Paragraph('<b>Target facility</b>', styles['body']),
         Paragraph('<b>Base / month</b>', styles['body']),
         Paragraph('<b>Per MC</b>', styles['body'])],
        ['Clinic', 'Klinik swasta, GP', 'RM 2,000', 'RM 1'],
        ['Hospital', 'Private + govt hospitals', 'RM 10,000+', 'RM 1'],
        ['Government', 'State agencies (SDEC / KKM)', 'Custom (from RM 10,000)', 'Custom'],
    ]
    pricing_tbl = Table(pricing_data, colWidths=[28 * mm, 58 * mm, 42 * mm, 42 * mm])
    pricing_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BACKGROUND', (0, 1), (-1, -1), SLATE_50),
        ('BOX', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(pricing_tbl)

    story.append(Paragraph('Unit economics (12-month projection)', styles['h2']))
    story.append(Paragraph(
        '<b>Target by month 12:</b> 5 paying clinics + 2 hospitals.',
        styles['body']
    ))
    ue_data = [
        [Paragraph('<b>Revenue line</b>', styles['body']),
         Paragraph('<b>Monthly</b>', styles['body'])],
        ['5 clinics x RM 2,000 base subscription', 'RM 10,000'],
        ['2 hospitals x RM 10,000 base subscription', 'RM 20,000'],
        ['5 clinics x ~500 MCs/mo x RM 1 (usage)', 'RM 2,500'],
        ['2 hospitals x ~5,000 MCs/mo x RM 1 (usage)', 'RM 10,000'],
        [Paragraph('<b>Total Monthly Recurring Revenue (MRR)</b>', styles['body']),
         Paragraph('<b>RM 42,500</b>', styles['body'])],
        [Paragraph('<b>Annualised Recurring Revenue (ARR)</b>', styles['body']),
         Paragraph('<b>RM 510,000</b>', styles['body'])],
    ]
    ue_tbl = Table(ue_data, colWidths=[120 * mm, 50 * mm])
    ue_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BACKGROUND', (0, -2), (-1, -2), SLATE_50),
        ('BACKGROUND', (0, -1), (-1, -1), AMBER_50),
        ('BOX', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(ue_tbl)
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        '<b>Cost to serve:</b> ~15-20% (backend hosting, IPFS pinning, support). '
        '<b>Gross margin:</b> ~80%. Model scales cleanly - most costs are already sunk in the platform.',
        styles['body']
    ))

    story.append(Paragraph('Free pilot as customer-acquisition strategy', styles['h2']))
    story.append(Paragraph(
        'Every prospective facility receives a <b>free 30-day audit pilot</b>: no cost during pilot, formal audit '
        'report delivered at the end, no commitment to continue, founder personally supports onboarding. '
        'The audit report is the deliverable that converts pilots to paid subscriptions.',
        styles['body']
    ))

    return story


def section_traction():
    story = []
    story.append(PageBreak())
    story.append(Paragraph('SECTION 5', styles['h1_num']))
    story.append(Paragraph('Traction &amp; Roadmap', styles['h1']))

    story.append(Paragraph('What&#39;s shipped (as of 30 June 2026)', styles['h2']))
    shipped = [
        'Live product across 12+ polished public pages',
        'Working OTP access demo (patient generates 6-digit code → doctor enters → sees record)',
        'Full stack: React/Vite frontend on Cloudflare Pages, Node.js/Express backend, Ethereum-compatible smart contract, IPFS storage',
        'PDPA-compliant Privacy Policy and Terms of Service pages',
        'Astro Awani citation for the Minister\'s e-MC announcement embedded in the site',
        '1-page pitch PDFs (general and Cradle-tailored versions)',
        '30-day pilot audit report template',
        'Public source code on GitHub',
    ]
    for s in shipped:
        story.append(Paragraph(f'&#8226; {s}', styles['body']))

    story.append(Paragraph('Business milestones (June 2026)', styles['h2']))
    milestones = [
        '<b>SSM registration:</b> Medchain Enterprise registered June 2026',
        '<b>Cradle LIVE! attendance:</b> attended TEGAS Miri session, 30 June 2026',
        '<b>Warm intros in progress:</b> SDEC, community leadership, YB-level connections via community network',
    ]
    for m in milestones:
        story.append(Paragraph(f'&#8226; {m}', styles['body']))

    story.append(Paragraph('12-month roadmap', styles['h2']))
    roadmap = [
        ('Q3 2026', 'Jul - Sep', 'First paid pilot signed. Deploy production backend (Render/Fly.io). Real cross-device OTP infrastructure live.'),
        ('Q4 2026', 'Oct - Dec', '2-3 more pilots active. First hire (part-time BD). Sdn Bhd conversion upon first signed contract.'),
        ('Q1 2027', 'Jan - Mar', 'Convert pilots to paid SaaS. Publish first public audit reports (with facility consent).'),
        ('Q2 2027', 'Apr - Jun', '5+ paying Sarawak facilities. Expand pricing to insurance verification API.'),
    ]
    rm_data = [[Paragraph('<b>Period</b>', styles['body']),
                Paragraph('<b>Milestone</b>', styles['body'])]]
    for q, dt, m in roadmap:
        rm_data.append([
            Paragraph(f'<b><font color="#0F2A5C">{q}</font></b><br/><font size="8" color="#94A3B8">{dt}</font>', styles['body']),
            Paragraph(m, styles['body']),
        ])
    rm_tbl = Table(rm_data, colWidths=[35 * mm, 135 * mm])
    rm_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOX', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(rm_tbl)

    return story


def section_team():
    story = []
    story.append(PageBreak())
    story.append(Paragraph('SECTION 6', styles['h1_num']))
    story.append(Paragraph('Team', styles['h1']))

    story.append(Paragraph('Randy Richard - Founder &amp; Sole Developer', styles['h2']))
    bullets = [
        '19 years old, from Miri, Sarawak',
        'Self-taught software engineer',
        'Built Sarawak MedChain solo over 7 months',
        'Shipped a working OTP demo within 24 hours of receiving community feedback',
        'Handles: product design, frontend, backend, smart contract, deployment, business development',
    ]
    for b in bullets:
        story.append(Paragraph(f'&#8226; {b}', styles['body']))

    story.append(Paragraph('Hiring plan (post-first-contract)', styles['h2']))
    hire = [
        '<b>Q3-Q4 2026:</b> Part-time Business Development contractor (Sarawak-based) - RM 3,000/month',
        '<b>Q1 2027 onwards:</b> Evaluate second technical hire (backend/DevOps)',
        '<b>Governance:</b> Convert to Sdn Bhd once first paid contract closes; add advisory board',
    ]
    for h in hire:
        story.append(Paragraph(f'&#8226; {h}', styles['body']))

    story.append(Paragraph('Advisory network (informal, in development)', styles['h2']))
    story.append(Paragraph(
        'Community leaders, state agency contacts, and peer founder relationships (via Cradle LIVE! Sarawak session) '
        'form the founder&#39;s early advisory perimeter. Formal advisory board planned post-Sdn Bhd conversion.',
        styles['body']
    ))

    return story


def section_financials():
    story = []
    story.append(Paragraph('SECTION 7', styles['h1_num']))
    story.append(Paragraph('Financials', styles['h1']))

    story.append(Paragraph('Current state', styles['h2']))
    curr = [
        '<b>Revenue:</b> Pre-revenue (intentional - free pilots as customer-acquisition)',
        '<b>Funding to date:</b> Bootstrapped from personal funds',
        '<b>Operating costs:</b> ~RM 500/month (domain, hosting, minimal expenses)',
        '<b>Founder runway:</b> 3-4 months at current burn',
    ]
    for c in curr:
        story.append(Paragraph(f'&#8226; {c}', styles['body']))

    story.append(Paragraph('The Ask - RM 50,000 to RM 150,000', styles['h2']))
    story.append(Paragraph(
        '<b>Programme fit:</b> Cradle CIP Spark or MyStartup. Purpose: 12-month runway to first paying customers.',
        styles['body']
    ))

    story.append(Paragraph('Use of funds (RM 150,000 target allocation)', styles['h3']))
    funds_data = [
        [Paragraph('<b>Bucket</b>', styles['body']),
         Paragraph('<b>Amount</b>', styles['body']),
         Paragraph('<b>Purpose</b>', styles['body'])],
        ['Production backend', 'RM 40,000', '12 months of Render/Fly.io + Redis + Postgres, IPFS pinning, monitoring'],
        ['Founder runway', 'RM 30,000', '4 months personal runway (RM 7,500/month) - 100% focus on pilots'],
        ['BD contractor', 'RM 25,000', 'Part-time Sarawak-based BD hire, ~6 months'],
        ['Sdn Bhd + legal', 'RM 15,000', 'Registration + Year-1 company secretary + basic legal + accounting'],
        ['SGH pilot buffer', 'RM 20,000', 'Deployment costs + travel + on-site support for first paid pilot'],
        ['Marketing &amp; travel', 'RM 20,000', 'Travel to Sarawak facilities, printed materials, pitch events'],
        [Paragraph('<b>Total</b>', styles['body']),
         Paragraph('<b>RM 150,000</b>', styles['body']),
         Paragraph('<b>12-month runway to 5 paying customers</b>', styles['body'])],
    ]
    funds_tbl = Table(funds_data, colWidths=[40 * mm, 30 * mm, 100 * mm])
    funds_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('BACKGROUND', (0, -1), (-1, -1), AMBER_50),
        ('BOX', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    story.append(funds_tbl)

    story.append(Paragraph('Sensitivity: RM 50,000 (minimum viable ask)', styles['h3']))
    story.append(Paragraph(
        'If funded at CIP Spark minimum (RM 50k), we prioritise: production backend (RM 25k) + 3 months founder '
        'runway (RM 22.5k) + basic legal (RM 2.5k). Sacrifice: BD contractor, marketing budget.',
        styles['body']
    ))

    return story


def section_risk():
    story = []
    story.append(PageBreak())
    story.append(Paragraph('SECTION 8', styles['h1_num']))
    story.append(Paragraph('Risk &amp; Mitigation', styles['h1']))

    risks = [
        ('KKM picks a KL vendor before Sarawak pilots',
         'Move fast on SGH POC in Q3 2026. Sarawak-first is our positioning; being live before KKM finishes studying is the moat.'),
        ('Non-tech users (elderly patients, guest doctors) can\'t use wallets',
         'Already shipped: OTP access mode. No app install required for doctor side.'),
        ('Blockchain "right to be forgotten" concerns under PDPA',
         'Documented in Privacy Policy Section 8: encrypted files can be unpinned + keys destroyed, rendering the on-chain hash meaningless.'),
        ('Single founder / bus factor',
         'Codebase is open-source; documentation being written; BD contractor hire in Q3 to spread ops load.'),
        ('Security incident',
         'Client-side encryption + no server-side master key means a breach cannot decrypt records. Regular security review post-Series A.'),
        ('Adoption resistance from hospital IT',
         'Interoperability by design. Public verification API means agencies can plug into our source of truth for their existing MC checks - one tamper-proof endpoint, no duplicate data entry, no fork in the audit trail.'),
    ]
    risk_data = [[Paragraph('<b>Risk</b>', styles['body']),
                  Paragraph('<b>Mitigation</b>', styles['body'])]]
    for r, m in risks:
        risk_data.append([
            Paragraph(r, styles['body']),
            Paragraph(m, styles['body']),
        ])
    risk_tbl = Table(risk_data, colWidths=[70 * mm, 100 * mm])
    risk_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOX', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(risk_tbl)

    return story


def section_why_now():
    story = []
    story.append(PageBreak())
    story.append(Paragraph('SECTION 9', styles['h1_num']))
    story.append(Paragraph('Why Cradle / Sarawak Now', styles['h1']))

    reasons = [
        ('Timing',
         'The Minister\'s e-MC announcement is 9 days old. This funding window is time-limited.'),
        ('Local advantage',
         'A Sarawak founder building in Sarawak for Sarawak. TEGAS and SDEC are ready to support Sarawak-first digital wins.'),
        ('Political alignment',
         'MP Sibuti (former Deputy Health Minister) is Sarawakian; the e-MC direction aligns with his prior portfolio.'),
        ('Fast-shipping demonstrated',
         '7-month solo build, working product, real citations, no vaporware.'),
        ('Free pilot offer already public',
         'Waiting on the funded runway to execute at scale.'),
    ]
    for i, (t, b) in enumerate(reasons):
        story.append(Paragraph(f'<b><font color="#0F2A5C">{i+1}.  {t}</font></b>', styles['h3']))
        story.append(Paragraph(b, styles['body']))

    return story


def appendix():
    story = []
    story.append(Spacer(1, 8 * mm))
    story.append(HRFlowable(width='100%', thickness=0.5, color=SLATE_200))
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph('APPENDIX A', styles['h1_num']))
    story.append(Paragraph('Legal &amp; Compliance', styles['h1']))

    legal = [
        ('Legal entity', 'Medchain Enterprise (SSM-registered June 2026)'),
        ('Trading name', 'Sarawak MedChain'),
        ('Data residency', 'All personal data hosted in Malaysia'),
        ('Regulatory basis', 'PDPA 2010 (Act 709) compliant Privacy Policy published'),
        ('Governing law', 'Terms of Service under Malaysian law, jurisdiction Kuching, Sarawak'),
    ]
    for k, v in legal:
        story.append(Paragraph(f'&#8226; <b>{k}:</b> {v}', styles['body']))

    story.append(Paragraph('APPENDIX B', styles['h1_num']))
    story.append(Paragraph('Working URLs (verify live)', styles['h1']))

    urls = [
        ('Landing', 'https://sarawak-medchain.pages.dev'),
        ('OTP demo', 'https://sarawak-medchain.pages.dev/#/otp'),
        ('Government preview', 'https://sarawak-medchain.pages.dev/#/gov-preview'),
        ('For Hospitals', 'https://sarawak-medchain.pages.dev/#/pitch'),
        ('Privacy Policy', 'https://sarawak-medchain.pages.dev/#/privacy'),
        ('Terms of Service', 'https://sarawak-medchain.pages.dev/#/terms'),
        ('GitHub', 'https://github.com/randyrichard/Sarawak-Medchain'),
    ]
    for k, v in urls:
        story.append(Paragraph(f'&#8226; <b>{k}:</b> <font color="#0F766E">{v}</font>', styles['body']))

    story.append(Spacer(1, 12 * mm))
    story.append(HRFlowable(width='100%', thickness=0.5, color=SLATE_200))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        '<i>Prepared 30 June 2026 - Version 1.0 - Randy Richard, Founder</i>',
        styles['small_note']
    ))

    return story


# ============== Build ==============
def build_pdf():
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=20 * mm, bottomMargin=22 * mm,
        title='Sarawak MedChain - Business Plan v1.0',
        author='Randy Richard',
        subject='Blockchain medical certificates - Business plan for Cradle / SDEC',
    )

    story = []
    story += cover_page()
    story += toc_page()
    story += exec_summary()
    story += section_problem()
    story += section_solution()
    story += section_market()
    story += section_bizmodel()
    story += section_traction()
    story += section_team()
    story += section_financials()
    story += section_risk()
    story += section_why_now()
    story += appendix()

    doc.build(story, onFirstPage=PageWithFooter.on_page, onLaterPages=PageWithFooter.on_page)
    return OUTPUT


if __name__ == '__main__':
    out = build_pdf()
    print(f'PDF created: {out}')
    print(f'File size: {out.stat().st_size:,} bytes')
