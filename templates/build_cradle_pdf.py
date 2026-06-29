"""
1-page A4 PDF for Cradle LIVE! Sarawak Ecosystem Engagement Session.
TEGAS Digital Innovation Hub Miri · 30 June 2026 · 2-4 PM.

Audience: Cradle Fund Sdn Bhd + TEGAS officers + Sarawak founders.
Focus: founder story + Minister timing + working product + specific ask.

Run: python build_cradle_pdf.py
Output: SarawakMedChain_Cradle_OnePager.pdf
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from pathlib import Path

# Brand palette (same as general PDF for consistency)
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
AMBER_400 = HexColor('#F59E0B')
AMBER_50 = HexColor('#FFFBEB')
AMBER_700 = HexColor('#B45309')
EMERALD_500 = HexColor('#10B981')
EMERALD_50 = HexColor('#F0FDF4')
EMERALD_700 = HexColor('#047857')

PAGE_W, PAGE_H = A4  # 595 x 842 pts
MARGIN_L = 32
MARGIN_R = 32
MARGIN_T = 28
MARGIN_B = 28
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

OUTPUT = Path(__file__).parent / 'SarawakMedChain_Cradle_OnePager.pdf'

FONT_REG = 'Helvetica'
FONT_BOLD = 'Helvetica-Bold'
FONT_OBLIQUE = 'Helvetica-Oblique'


def wrap_lines(c, text, max_width, font, size):
    c.setFont(font, size)
    words = text.split()
    lines = []
    current = ''
    for w in words:
        test = (current + ' ' + w).strip()
        if c.stringWidth(test, font, size) <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = w
    if current:
        lines.append(current)
    return lines


def draw_paragraph(c, x, y, text, font, size, color, max_width, leading=None):
    leading = leading or size * 1.4
    lines = wrap_lines(c, text, max_width, font, size)
    c.setFont(font, size)
    c.setFillColor(color)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_rounded_rect(c, x, y, w, h, r=6, fill=None, stroke=None, stroke_w=0.6):
    if fill:
        c.setFillColor(fill)
    if stroke:
        c.setStrokeColor(stroke)
        c.setLineWidth(stroke_w)
    c.roundRect(x, y, w, h, r, stroke=1 if stroke else 0, fill=1 if fill else 0)


def draw_eyebrow(c, x, y, text, color=TEAL, size=7):
    c.setFont(FONT_BOLD, size)
    c.setFillColor(color)
    c.drawString(x, y, text.upper())


def build_pdf():
    c = canvas.Canvas(str(OUTPUT), pagesize=A4)
    c.setTitle('Sarawak MedChain - Cradle LIVE! Sarawak Engagement Session')
    c.setAuthor('Randy Richard')
    c.setSubject('Cradle/TEGAS pitch - blockchain medical certificates')

    y = PAGE_H - MARGIN_T

    # ==========================================
    # HEADER
    # ==========================================
    # Logo
    logo_size = 22
    c.setFillColor(NAVY)
    c.roundRect(MARGIN_L, y - logo_size, logo_size, logo_size, 4, stroke=0, fill=1)
    c.setStrokeColor(HexColor('#FFFFFF'))
    c.setLineWidth(1.5)
    c.setLineCap(1)
    c.setLineJoin(1)
    cx, cy = MARGIN_L + logo_size / 2, y - logo_size / 2
    p = c.beginPath()
    p.moveTo(cx - 4.5, cy - 0.5)
    p.lineTo(cx - 1.5, cy - 3.5)
    p.lineTo(cx + 5, cy + 3)
    c.drawPath(p)

    text_x = MARGIN_L + logo_size + 9
    c.setFont(FONT_BOLD, 15)
    c.setFillColor(SLATE_900)
    c.drawString(text_x, y - 9, 'SARAWAK MEDCHAIN')
    c.setFont(FONT_REG, 7.5)
    c.setFillColor(SLATE_500)
    c.drawString(text_x, y - 19, 'Blockchain-secured medical certificates for Sarawak')

    # Right side: event reference
    right_x = PAGE_W - MARGIN_R
    c.setFont(FONT_BOLD, 7)
    c.setFillColor(TEAL)
    c.drawRightString(right_x, y - 6, 'PREPARED FOR')
    c.setFont(FONT_BOLD, 8.5)
    c.setFillColor(NAVY)
    c.drawRightString(right_x, y - 16, 'Cradle LIVE! Sarawak Engagement Session')
    c.setFont(FONT_REG, 7.5)
    c.setFillColor(SLATE_500)
    c.drawRightString(right_x, y - 26, 'TEGAS Innovation Hub Miri  -  30 June 2026')

    y -= 38

    # Divider
    c.setStrokeColor(SLATE_200)
    c.setLineWidth(0.5)
    c.line(MARGIN_L, y, right_x, y)
    y -= 12

    # ==========================================
    # FOUNDER + TIMING ROW (two columns)
    # ==========================================
    block_h = 86
    col_gap = 10
    col_w = (CONTENT_W - col_gap) / 2

    # LEFT: Founder
    draw_rounded_rect(c, MARGIN_L, y - block_h, col_w, block_h, r=8, fill=SLATE_50, stroke=SLATE_200)
    inner_x = MARGIN_L + 14
    inner_y = y - 14
    draw_eyebrow(c, inner_x, inner_y, 'The Founder', color=TEAL, size=7)
    c.setFont(FONT_BOLD, 14)
    c.setFillColor(SLATE_900)
    c.drawString(inner_x, inner_y - 18, 'Randy Richard, 19')
    c.setFont(FONT_REG, 8.5)
    c.setFillColor(SLATE_700)
    c.drawString(inner_x, inner_y - 30, 'Self-taught Sarawakian founder, Miri')
    after = draw_paragraph(
        c, inner_x, inner_y - 46,
        'Built Sarawak MedChain solo over 12+ months. Just shipped a working OTP demo within 24 hours of community feedback. Plan to register Sdn Bhd post first signed contract.',
        FONT_REG, 7.5, SLATE_500, col_w - 28, leading=10
    )

    # RIGHT: The timing
    rx = MARGIN_L + col_w + col_gap
    draw_rounded_rect(c, rx, y - block_h, col_w, block_h, r=8, fill=AMBER_50, stroke=HexColor('#FDE68A'))
    inner_x2 = rx + 14
    draw_eyebrow(c, inner_x2, inner_y, 'Market Timing (Tier-1 Source)', color=AMBER_700, size=7)
    c.setFont(FONT_BOLD, 10)
    c.setFillColor(SLATE_900)
    c.drawString(inner_x2, inner_y - 17, 'Minister of Health, 21 June 2026:')
    after = draw_paragraph(
        c, inner_x2, inner_y - 30,
        '"KKM teliti pelaksanaan e-MC, kekang penyalahgunaan sijil cuti sakit"',
        FONT_OBLIQUE, 8, SLATE_700, col_w - 28, leading=11
    )
    c.setFont(FONT_REG, 7.5)
    c.setFillColor(SLATE_500)
    c.drawString(inner_x2, inner_y - 56, '- Datuk Seri Dr Dzulkefly Ahmad,')
    c.drawString(inner_x2, inner_y - 66, '  via Astro Awani (TikTok @501awani)')

    y -= (block_h + 12)

    # ==========================================
    # THE PRODUCT (compact)
    # ==========================================
    prod_h = 70
    draw_rounded_rect(c, MARGIN_L, y - prod_h, CONTENT_W, prod_h, r=8, fill=HexColor('#FFFFFF'), stroke=SLATE_200)
    inner_x = MARGIN_L + 14
    inner_y = y - 14
    draw_eyebrow(c, inner_x, inner_y, 'The Product (Working Today)', color=TEAL, size=7)

    # Two columns inside
    c.setFont(FONT_BOLD, 10)
    c.setFillColor(SLATE_900)
    c.drawString(inner_x, inner_y - 16, 'Blockchain-secured medical certificates')
    c.setFont(FONT_REG, 8)
    c.setFillColor(SLATE_500)
    after = draw_paragraph(
        c, inner_x, inner_y - 30,
        'Doctor issues -> AES-256-GCM encrypted client-side -> hash on public smart contract -> patient controls access via wallet OR 6-digit OTP -> employer verifies QR in 5 seconds. Audit trail on-chain.',
        FONT_REG, 7.5, SLATE_500, CONTENT_W - 230, leading=10
    )

    # Right side: live URLs
    url_x = MARGIN_L + CONTENT_W - 200
    c.setFont(FONT_BOLD, 7)
    c.setFillColor(EMERALD_700)
    c.drawString(url_x, inner_y - 14, 'LIVE NOW')
    c.setFont(FONT_REG, 8)
    c.setFillColor(SLATE_900)
    c.drawString(url_x, inner_y - 26, '- sarawak-medchain.pages.dev')
    c.drawString(url_x, inner_y - 36, '- /otp  - working OTP demo')
    c.drawString(url_x, inner_y - 46, '- /gov-preview  - govt dashboard')
    c.drawString(url_x, inner_y - 56, '- /privacy  /terms  - PDPA ready')

    y -= (prod_h + 12)

    # ==========================================
    # CURRENT STATUS (be honest)
    # ==========================================
    status_h = 64
    draw_rounded_rect(c, MARGIN_L, y - status_h, CONTENT_W, status_h, r=8, fill=SLATE_50, stroke=SLATE_200)
    inner_x = MARGIN_L + 14
    inner_y = y - 14
    draw_eyebrow(c, inner_x, inner_y, 'Where We Are - Honest', color=TEAL, size=7)

    # Three status items
    items = [
        ('Product', 'Live, working demo'),
        ('Revenue', 'Pre-revenue (intentional)'),
        ('Pipeline', 'In active conversations'),
    ]
    col_x = MARGIN_L + 14
    col_step = (CONTENT_W - 28) / 3
    for i, (label, val) in enumerate(items):
        cx = col_x + i * col_step
        c.setFont(FONT_REG, 7.5)
        c.setFillColor(SLATE_500)
        c.drawString(cx, inner_y - 17, label.upper())
        c.setFont(FONT_BOLD, 10)
        c.setFillColor(SLATE_900)
        c.drawString(cx, inner_y - 30, val)

    # Pipeline detail
    c.setFont(FONT_REG, 7.5)
    c.setFillColor(SLATE_500)
    c.drawString(inner_x, inner_y - 48,
                 'Active: SDEC contact - Ketua Belia Miri - YB Lukanisman (former Timbalan Menteri Kesihatan) intro pending.')

    y -= (status_h + 12)

    # ==========================================
    # THE ASK (highlighted)
    # ==========================================
    ask_h = 96
    draw_rounded_rect(c, MARGIN_L, y - ask_h, CONTENT_W, ask_h, r=10, fill=NAVY)
    inner_x = MARGIN_L + 18
    inner_y = y - 14

    # Pill
    draw_rounded_rect(c, inner_x, inner_y - 4, 56, 11, r=5, fill=AMBER_400)
    c.setFont(FONT_BOLD, 7)
    c.setFillColor(NAVY)
    c.drawString(inner_x + 6, inner_y - 1, 'THE ASK')

    c.setFont(FONT_BOLD, 14)
    c.setFillColor(HexColor('#FFFFFF'))
    c.drawString(inner_x, inner_y - 24, 'Cradle CIP Spark / MyStartup - RM 50k to RM 150k')

    # Use of funds (3 columns)
    fund_y = inner_y - 44
    funds = [
        ('Backend deploy', 'Real cross-device infra: Render/Fly.io, Redis OTP store, production DB.'),
        ('Sarawak pilots', 'Onboard 2-3 Sarawak facilities for paid pilots. Audit reports + iteration.'),
        ('Founder runway', '4 months personal runway + Sdn Bhd registration + first part-time BD hire.'),
    ]
    col_step = (CONTENT_W - 36) / 3
    for i, (label, body) in enumerate(funds):
        cx = inner_x + i * col_step
        c.setFont(FONT_BOLD, 8)
        c.setFillColor(AMBER_400)
        c.drawString(cx, fund_y, label.upper())
        draw_paragraph(c, cx, fund_y - 10, body, FONT_REG, 7, HexColor('#CBD5E1'),
                       col_step - 10, leading=9)

    y -= (ask_h + 12)

    # ==========================================
    # 6-MONTH ROADMAP
    # ==========================================
    rm_h = 56
    draw_rounded_rect(c, MARGIN_L, y - rm_h, CONTENT_W, rm_h, r=8, fill=HexColor('#FFFFFF'), stroke=SLATE_200)
    inner_x = MARGIN_L + 14
    inner_y = y - 14
    draw_eyebrow(c, inner_x, inner_y, '6-Month Roadmap (with funding)', color=TEAL, size=7)

    milestones = [
        ('Q3 2026', 'First paid pilot - target Sarawak General Hospital via YB intro'),
        ('Q4 2026', '2-3 more pilots active, real cross-device OTP shipped, Sdn Bhd registered'),
        ('Q1 2027', 'Convert pilots to paid SaaS, target 5+ Sarawak facilities'),
    ]
    for i, (q, m) in enumerate(milestones):
        my = inner_y - 16 - i * 11
        c.setFont(FONT_BOLD, 7.5)
        c.setFillColor(NAVY)
        c.drawString(inner_x, my, q)
        c.setFont(FONT_REG, 7.5)
        c.setFillColor(SLATE_700)
        c.drawString(inner_x + 45, my, m)

    y -= (rm_h + 10)

    # ==========================================
    # CONTACT FOOTER STRIP
    # ==========================================
    foot_h = 36
    draw_rounded_rect(c, MARGIN_L, y - foot_h, CONTENT_W, foot_h, r=6, fill=SLATE_50, stroke=SLATE_200)
    inner_x = MARGIN_L + 14
    inner_y = y - 13

    draw_eyebrow(c, inner_x, inner_y, 'Contact', color=TEAL, size=7)
    c.setFont(FONT_BOLD, 9)
    c.setFillColor(SLATE_900)
    c.drawString(inner_x, inner_y - 12, 'Randy Richard')
    c.setFont(FONT_REG, 8)
    c.setFillColor(SLATE_700)
    c.drawString(inner_x, inner_y - 22, 'randyrjm99@gmail.com  -  sarawak-medchain.pages.dev')

    # Right side: try the demo prompt
    c.setFont(FONT_BOLD, 7)
    c.setFillColor(TEAL)
    c.drawRightString(PAGE_W - MARGIN_R - 14, inner_y, 'TRY THE OTP DEMO LIVE')
    c.setFont(FONT_REG, 8)
    c.setFillColor(SLATE_900)
    c.drawRightString(PAGE_W - MARGIN_R - 14, inner_y - 12, 'sarawak-medchain.pages.dev/#/otp')
    c.setFont(FONT_OBLIQUE, 7)
    c.setFillColor(SLATE_500)
    c.drawRightString(PAGE_W - MARGIN_R - 14, inner_y - 22, 'Open in 2 tabs to see full patient -> doctor flow')

    y -= (foot_h + 6)

    # Tiny version footer
    c.setFont(FONT_OBLIQUE, 6)
    c.setFillColor(SLATE_400)
    c.drawString(MARGIN_L, y - 2,
                 'Pilot-stage product. Operating as Enterprise (Sdn Bhd registration upon first contract). Built in Sarawak.')
    c.setFont(FONT_BOLD, 6)
    c.drawRightString(PAGE_W - MARGIN_R, y - 2, 'v1.0 Cradle Edition - 30 June 2026')

    c.showPage()
    c.save()
    return OUTPUT


if __name__ == '__main__':
    out = build_pdf()
    print(f'PDF created: {out}')
    print(f'File size: {out.stat().st_size:,} bytes')
