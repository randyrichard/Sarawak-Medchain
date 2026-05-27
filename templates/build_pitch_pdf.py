"""
One-page A4 pitch PDF for Sarawak MedChain.

This is the outreach artifact Randy attaches to emails for:
  - SDEC officers
  - Hospital CEOs / admins
  - Klinik swasta owners
  - Grant program applications (Cradle, MyStartup)

Run: python build_pitch_pdf.py
Output: SarawakMedChain_OnePager.pdf in this same templates folder.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pathlib import Path

# ====== Brand palette ======
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
RED_500 = HexColor('#DC2626')
RED_50 = HexColor('#FEF2F2')
RED_200 = HexColor('#FECACA')
AMBER_50 = HexColor('#FFFBEB')
AMBER_400 = HexColor('#F59E0B')

# ====== Page setup ======
PAGE_W, PAGE_H = A4  # 595 x 842 pts
MARGIN_L = 36
MARGIN_R = 36
MARGIN_T = 32
MARGIN_B = 32
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R  # 523 pts

OUTPUT = Path(__file__).parent / 'SarawakMedChain_OnePager.pdf'

# Use built-in Helvetica family (always available, looks clean)
FONT_REG = 'Helvetica'
FONT_BOLD = 'Helvetica-Bold'
FONT_OBLIQUE = 'Helvetica-Oblique'


def draw_eyebrow(c, x, y, text, color=TEAL, size=7.5):
    """Small uppercase eyebrow label."""
    c.setFont(FONT_BOLD, size)
    c.setFillColor(color)
    c.drawString(x, y, text.upper())


def draw_rounded_rect(c, x, y, w, h, r=6, fill=None, stroke=None, stroke_w=0.6):
    """Rounded rectangle helper."""
    if fill:
        c.setFillColor(fill)
    if stroke:
        c.setStrokeColor(stroke)
        c.setLineWidth(stroke_w)
    c.roundRect(x, y, w, h, r, stroke=1 if stroke else 0, fill=1 if fill else 0)


def wrap_lines(c, text, max_width, font, size):
    """Manual word-wrap returning list of lines that fit."""
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
    """Draw a wrapped paragraph. Returns y-coordinate after the last line."""
    leading = leading or size * 1.35
    lines = wrap_lines(c, text, max_width, font, size)
    c.setFont(font, size)
    c.setFillColor(color)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def build_pdf():
    c = canvas.Canvas(str(OUTPUT), pagesize=A4)
    c.setTitle('Sarawak MedChain - Pitch')
    c.setAuthor('Randy Richard')
    c.setSubject('Blockchain medical certificates for Sarawak')

    y = PAGE_H - MARGIN_T  # Start cursor at top

    # ==========================================
    # HEADER BLOCK
    # ==========================================
    # Logo shield icon (small navy gradient-ish square with a check)
    logo_size = 24
    c.setFillColor(NAVY)
    c.roundRect(MARGIN_L, y - logo_size, logo_size, logo_size, 4, stroke=0, fill=1)
    # White check mark inside
    c.setStrokeColor(HexColor('#FFFFFF'))
    c.setLineWidth(1.6)
    c.setLineCap(1)
    c.setLineJoin(1)
    cx, cy = MARGIN_L + logo_size / 2, y - logo_size / 2
    p = c.beginPath()
    p.moveTo(cx - 5, cy - 0.5)
    p.lineTo(cx - 1.5, cy - 4)
    p.lineTo(cx + 5.5, cy + 3.5)
    c.drawPath(p)

    # Brand name + tagline
    text_x = MARGIN_L + logo_size + 10
    c.setFont(FONT_BOLD, 16)
    c.setFillColor(SLATE_900)
    c.drawString(text_x, y - 10, 'SARAWAK MEDCHAIN')
    c.setFont(FONT_REG, 8)
    c.setFillColor(SLATE_500)
    c.drawString(text_x, y - 21, "Sarawak's Sovereign Health Record System")

    # Right-aligned: contact strip top right
    right_x = PAGE_W - MARGIN_R
    c.setFont(FONT_REG, 7.5)
    c.setFillColor(SLATE_500)
    c.drawRightString(right_x, y - 6, 'randyrjm99@gmail.com')
    c.drawRightString(right_x, y - 16, 'sarawak-medchain.pages.dev')

    y -= (logo_size + 14)

    # Subtitle line
    c.setFont(FONT_BOLD, 9)
    c.setFillColor(SLATE_700)
    c.drawString(MARGIN_L, y, 'Blockchain-secured.  Patient-controlled.  Audit-ready.')

    # Alignment line (teal)
    c.setFont(FONT_BOLD, 7)
    c.setFillColor(TEAL)
    c.drawRightString(right_x, y, 'ALIGNED WITH SARAWAK DIGITAL ECONOMY BLUEPRINT 2030')

    y -= 14

    # Divider line
    c.setStrokeColor(SLATE_200)
    c.setLineWidth(0.5)
    c.line(MARGIN_L, y, right_x, y)
    y -= 14

    # ==========================================
    # PROBLEM BLOCK
    # ==========================================
    block_h = 96
    draw_rounded_rect(c, MARGIN_L, y - block_h, CONTENT_W, block_h, r=8,
                      fill=RED_50, stroke=RED_200)
    inner_pad = 14
    bx = MARGIN_L + inner_pad
    by = y - inner_pad

    draw_eyebrow(c, bx, by - 6, 'The Problem', color=RED_500, size=7.5)

    # Big stat + side text
    c.setFont(FONT_BOLD, 26)
    c.setFillColor(RED_500)
    c.drawString(bx, by - 32, 'RM 1.5-3B')
    # Small "est." superscript next to it
    stat_width = c.stringWidth('RM 1.5-3B', FONT_BOLD, 26)
    c.setFont(FONT_BOLD, 9)
    c.setFillColor(SLATE_500)
    c.drawString(bx + stat_width + 3, by - 24, 'est.')

    # Caption to the right of stat
    c.setFont(FONT_BOLD, 10)
    c.setFillColor(SLATE_900)
    c.drawString(bx + 160, by - 22, 'Estimated annual MC fraud impact in Malaysia.')
    method = ('Based on NHCAA global healthcare fraud rate (3-7%) × Malaysia '
              'healthcare spend (~RM 60B, MOH 2023). MC-specific data not publicly tracked.')
    after_y = draw_paragraph(c, bx + 160, by - 36, method, FONT_REG, 7.5, SLATE_500,
                             max_width=CONTENT_W - inner_pad * 2 - 160, leading=10)

    # 3 bullets at the bottom of the box
    bullets = ['Paper MCs easily forged',
               'No employer verification',
               'Zero audit trail']
    bullet_y = y - block_h + 16
    bullet_x = bx
    for b in bullets:
        # Bullet dot
        c.setFillColor(RED_500)
        c.circle(bullet_x + 3, bullet_y + 2.5, 1.8, stroke=0, fill=1)
        c.setFont(FONT_BOLD, 8)
        c.setFillColor(SLATE_700)
        c.drawString(bullet_x + 10, bullet_y, b)
        bullet_x += c.stringWidth(b, FONT_BOLD, 8) + 28

    y -= (block_h + 16)

    # ==========================================
    # HOW IT WORKS - 5 mini step boxes
    # ==========================================
    draw_eyebrow(c, MARGIN_L, y, 'How It Works', color=TEAL, size=8)
    c.setFont(FONT_BOLD, 12)
    c.setFillColor(SLATE_900)
    c.drawString(MARGIN_L, y - 14, "From doctor's pen to employer's phone - in 5 steps")
    y -= 28

    step_box_h = 92
    gap = 6
    step_w = (CONTENT_W - gap * 4) / 5

    steps = [
        ('01', 'Doctor issues', 'Verified doctor signs in with secure wallet, fills the MC, submits.'),
        ('02', 'Encrypted & hashed', 'AES-256-GCM client-side. Hash on public blockchain.'),
        ('03', 'Patient controls', 'Grant or revoke access to doctors/employers anytime.'),
        ('04', 'Employer verifies', 'Anyone scans the QR code. Verified in under 5 seconds.'),
        ('05', 'Audit-ready', 'Every action logged on-chain. State agencies see anonymized aggregates.'),
    ]

    for i, (num, title, desc) in enumerate(steps):
        sx = MARGIN_L + i * (step_w + gap)
        sy = y
        draw_rounded_rect(c, sx, sy - step_box_h, step_w, step_box_h, r=6,
                          fill=HexColor('#FFFFFF'), stroke=SLATE_200, stroke_w=0.5)
        # Step number badge
        badge_w, badge_h = 24, 10
        draw_rounded_rect(c, sx + 8, sy - 16, badge_w, badge_h, r=2, fill=NAVY)
        c.setFont(FONT_BOLD, 6.5)
        c.setFillColor(HexColor('#FFFFFF'))
        c.drawString(sx + 12, sy - 14, f'STEP {num}')
        # Title
        c.setFont(FONT_BOLD, 9)
        c.setFillColor(SLATE_900)
        c.drawString(sx + 8, sy - 32, title)
        # Description
        draw_paragraph(c, sx + 8, sy - 44, desc, FONT_REG, 6.8, SLATE_500,
                       max_width=step_w - 16, leading=9)

    y -= (step_box_h + 16)

    # ==========================================
    # FOR SARAWAK GOVERNMENT - 3 columns
    # ==========================================
    draw_eyebrow(c, MARGIN_L, y, 'For Sarawak Government', color=TEAL, size=8)
    c.setFont(FONT_BOLD, 12)
    c.setFillColor(SLATE_900)
    c.drawString(MARGIN_L, y - 14, 'Designed for state oversight, not vendor lock-in')
    y -= 28

    cols = [
        ('Data Sovereignty',
         'Records reside in Malaysia, not foreign clouds. Encryption keys controlled by patients. Open-source smart contract on public ledger.'),
        ('Compliance Posture',
         'PDPA 2010 compliant. MOH documentation standards. Full immutable audit trail. Read-only oversight dashboard for state agencies.'),
        ('Built in Sarawak',
         'By a 19-year-old Sarawakian founder. For Sarawak\'s digital economy. Aligned with the Sarawak Digital Economy Blueprint 2030.'),
    ]

    col_box_h = 76
    col_gap = 10
    col_w = (CONTENT_W - col_gap * 2) / 3

    for i, (title, body) in enumerate(cols):
        cx = MARGIN_L + i * (col_w + col_gap)
        draw_rounded_rect(c, cx, y - col_box_h, col_w, col_box_h, r=6,
                          fill=SLATE_50, stroke=SLATE_200, stroke_w=0.4)
        c.setFont(FONT_BOLD, 9.5)
        c.setFillColor(NAVY)
        c.drawString(cx + 10, y - 14, title)
        draw_paragraph(c, cx + 10, y - 30, body, FONT_REG, 7.5, SLATE_700,
                       max_width=col_w - 20, leading=10)

    y -= (col_box_h + 16)

    # ==========================================
    # PILOT OFFER - navy highlighted box
    # ==========================================
    pilot_h = 70
    draw_rounded_rect(c, MARGIN_L, y - pilot_h, CONTENT_W, pilot_h, r=8, fill=NAVY)

    # Left: badge + title
    px = MARGIN_L + 16
    py = y - 14
    # Amber pilot pill
    draw_rounded_rect(c, px, py - 2, 70, 12, r=6, fill=AMBER_400)
    c.setFont(FONT_BOLD, 7)
    c.setFillColor(NAVY)
    c.drawString(px + 8, py + 1, '30-DAY PILOT')
    # Title
    c.setFont(FONT_BOLD, 13)
    c.setFillColor(HexColor('#FFFFFF'))
    c.drawString(px, py - 22, 'Free Audit Pilot Programme')

    # Right: 4 bullet points compact
    bullets = [
        '30 days, no cost to facility',
        'One facility of your choosing',
        'Audit report delivered to your office',
        'Founder personally supports onboarding',
    ]
    bx2 = MARGIN_L + 240
    by2 = py + 2
    for i, b in enumerate(bullets):
        row = i // 2
        col = i % 2
        bx_col = bx2 + col * 145
        by_row = by2 - row * 22
        # Check icon
        c.setStrokeColor(AMBER_400)
        c.setLineWidth(1.2)
        c.setLineCap(1)
        c.setLineJoin(1)
        p = c.beginPath()
        p.moveTo(bx_col, by_row - 3)
        p.lineTo(bx_col + 3, by_row - 6)
        p.lineTo(bx_col + 8, by_row - 1)
        c.drawPath(p)
        c.setFont(FONT_REG, 7.5)
        c.setFillColor(HexColor('#E2E8F0'))
        c.drawString(bx_col + 13, by_row - 4, b)

    y -= (pilot_h + 14)

    # ==========================================
    # FOUNDER + CONTACT STRIP
    # ==========================================
    contact_h = 44
    draw_rounded_rect(c, MARGIN_L, y - contact_h, CONTENT_W, contact_h, r=6,
                      fill=SLATE_50, stroke=SLATE_200, stroke_w=0.4)

    # Founder block (left)
    fx = MARGIN_L + 16
    fy = y - 14
    draw_eyebrow(c, fx, fy, 'Founder Direct', color=TEAL, size=7)
    c.setFont(FONT_BOLD, 10)
    c.setFillColor(SLATE_900)
    c.drawString(fx, fy - 14, 'Randy Richard  -  19, Miri Sarawak')
    c.setFont(FONT_REG, 8.5)
    c.setFillColor(SLATE_700)
    c.drawString(fx, fy - 26, 'randyrjm99@gmail.com  ·  sarawak-medchain.pages.dev')

    # Try-it block (right)
    tx = MARGIN_L + CONTENT_W - 200
    draw_eyebrow(c, tx, fy, 'Government Preview', color=TEAL, size=7)
    c.setFont(FONT_REG, 8)
    c.setFillColor(SLATE_700)
    c.drawString(tx, fy - 14, 'sarawak-medchain.pages.dev/#/gov-preview')
    c.setFont(FONT_OBLIQUE, 7.5)
    c.setFillColor(SLATE_500)
    c.drawString(tx, fy - 26, 'Open in incognito for the freshest version')

    y -= (contact_h + 10)

    # ==========================================
    # FOOTER: tech stack + disclaimer
    # ==========================================
    c.setFont(FONT_BOLD, 7)
    c.setFillColor(TEAL)
    c.drawString(MARGIN_L, y - 2, 'STACK')
    c.setFont(FONT_REG, 7.5)
    c.setFillColor(SLATE_700)
    stack_text = ('AES-256-GCM client-side encryption  ·  IPFS for encrypted payloads  ·  '
                  'Public smart contract for hashes & access logs  ·  MetaMask wallet signatures')
    c.drawString(MARGIN_L + 32, y - 2, stack_text)

    # Disclaimer (very bottom)
    c.setFont(FONT_OBLIQUE, 6.5)
    c.setFillColor(SLATE_400)
    disclaimer = ('Pilot-stage product. Operating as Enterprise (Sdn Bhd registration upon first contract). '
                  'Built with hospitals, designed for state oversight.')
    c.drawString(MARGIN_L, y - 14, disclaimer)

    # Bottom right page indicator
    c.setFont(FONT_BOLD, 6.5)
    c.setFillColor(SLATE_400)
    c.drawRightString(PAGE_W - MARGIN_R, y - 14, 'v1.0  ·  May 2026')

    # Save
    c.showPage()
    c.save()
    return OUTPUT


if __name__ == '__main__':
    out = build_pdf()
    print(f'PDF created: {out}')
    print(f'File size: {out.stat().st_size:,} bytes')
