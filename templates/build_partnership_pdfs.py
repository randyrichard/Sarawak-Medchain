"""
Generate 3 partnership PDFs from the markdown source docs:
1. Understanding Sarawak MedChain — for the friend to read first
2. Partnership Proposal — role + equity offer
3. Founders' Agreement Template — legal-style document

Each PDF gets its own cover, footer with page numbers, and consistent
navy + teal brand palette. Output files sit next to this script.

Run: python build_partnership_pdfs.py
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    HRFlowable,
)
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
RED_50 = HexColor('#FEF2F2')
RED_500 = HexColor('#DC2626')
WHITE = HexColor('#FFFFFF')

HERE = Path(__file__).parent

# ============ Common styles ============
def make_styles():
    return {
        'h1': ParagraphStyle('h1', fontName='Helvetica-Bold', fontSize=18, leading=24,
                             textColor=NAVY, spaceBefore=18, spaceAfter=10, keepWithNext=1),
        'h1_num': ParagraphStyle('h1_num', fontName='Helvetica-Bold', fontSize=8, leading=11,
                                 textColor=TEAL, spaceBefore=18, spaceAfter=2, keepWithNext=1),
        'h2': ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=12, leading=17,
                             textColor=SLATE_900, spaceBefore=12, spaceAfter=6, keepWithNext=1),
        'h3': ParagraphStyle('h3', fontName='Helvetica-Bold', fontSize=10, leading=14,
                             textColor=NAVY, spaceBefore=10, spaceAfter=4, keepWithNext=1),
        'body': ParagraphStyle('body', fontName='Helvetica', fontSize=9.5, leading=14,
                               textColor=SLATE_700, spaceAfter=8, alignment=TA_JUSTIFY),
        'body_left': ParagraphStyle('body_left', fontName='Helvetica', fontSize=9.5, leading=14,
                                    textColor=SLATE_700, spaceAfter=8, alignment=TA_LEFT),
        'bullet': ParagraphStyle('bullet', fontName='Helvetica', fontSize=9.5, leading=14,
                                 textColor=SLATE_700, spaceAfter=5, leftIndent=14, bulletIndent=4),
        'callout_body': ParagraphStyle('callout_body', fontName='Helvetica', fontSize=9, leading=13,
                                       textColor=SLATE_700, spaceAfter=6),
        'small': ParagraphStyle('small', fontName='Helvetica-Oblique', fontSize=8, leading=11,
                                textColor=SLATE_500, spaceAfter=6),
        'legal': ParagraphStyle('legal', fontName='Helvetica', fontSize=9, leading=13,
                                textColor=SLATE_700, spaceAfter=8, alignment=TA_JUSTIFY,
                                firstLineIndent=0),
        'sig_line': ParagraphStyle('sig_line', fontName='Helvetica', fontSize=9, leading=14,
                                   textColor=SLATE_700, spaceAfter=4),
    }


# ============ Page decorations ============
class DocFrame:
    """Cover-draw + running header/footer for a specific doc.
    Each doc constructs its own via factory below."""

    def __init__(self, title, subtitle, doc_id):
        self.title = title
        self.subtitle = subtitle
        self.doc_id = doc_id  # e.g., "Doc 1 of 3"

    def on_page(self, c, doc):
        page_num = c.getPageNumber()
        if page_num == 1:
            self._draw_cover(c)
            return
        self._draw_running(c, page_num)

    def _draw_running(self, c, page_num):
        c.saveState()
        # Top header
        c.setStrokeColor(SLATE_200)
        c.setLineWidth(0.3)
        c.line(20 * mm, A4[1] - 12 * mm, A4[0] - 20 * mm, A4[1] - 12 * mm)

        c.setFillColor(NAVY)
        c.roundRect(20 * mm, A4[1] - 10 * mm, 3 * mm, 3 * mm, 0.5 * mm, stroke=0, fill=1)
        c.setFont('Helvetica-Bold', 7)
        c.setFillColor(SLATE_500)
        c.drawString(25 * mm, A4[1] - 9 * mm, 'SARAWAK MEDCHAIN')
        c.setFont('Helvetica', 7)
        c.setFillColor(SLATE_400)
        c.drawRightString(A4[0] - 20 * mm, A4[1] - 9 * mm, f'{self.title}  ·  {self.doc_id}')

        # Bottom footer
        c.setStrokeColor(SLATE_200)
        c.setLineWidth(0.3)
        c.line(20 * mm, 15 * mm, A4[0] - 20 * mm, 15 * mm)

        c.setFont('Helvetica', 7)
        c.setFillColor(SLATE_500)
        c.drawString(20 * mm, 10 * mm, 'Sarawak MedChain  ·  Partnership Package  ·  June 2026')

        c.setFont('Helvetica-Bold', 8)
        c.setFillColor(NAVY)
        c.drawRightString(A4[0] - 20 * mm, 10 * mm, f'{page_num}')
        c.setFont('Helvetica', 7)
        c.setFillColor(SLATE_400)
        c.drawRightString(A4[0] - 20 * mm - 6 * mm, 10 * mm, 'PAGE')

        c.restoreState()

    def _draw_cover(self, c):
        c.saveState()
        W, H = A4
        HERO_H = 480

        # Navy hero band
        c.setFillColor(NAVY)
        c.rect(0, H - HERO_H, W, HERO_H, stroke=0, fill=1)

        # Teal accent
        c.setStrokeColor(TEAL)
        c.setLineWidth(2)
        c.line(0, H - HERO_H, 180, H - HERO_H + 180)

        # Chip pill
        chip_x, chip_y = 45, H - 60
        c.setFillColor(HexColor('#1E3A8A'))
        c.roundRect(chip_x, chip_y, 200, 20, 10, stroke=0, fill=1)
        c.setFillColor(TEAL_LIGHT)
        c.circle(chip_x + 12, chip_y + 10, 3, stroke=0, fill=1)
        c.setFont('Helvetica-Bold', 8)
        c.setFillColor(WHITE)
        c.drawString(chip_x + 22, chip_y + 7, f'PARTNERSHIP PACKAGE · {self.doc_id.upper()}')

        # Big title
        c.setFont('Helvetica-Bold', 38)
        c.setFillColor(WHITE)
        # Split title across two lines if long
        # Use manual placement for control
        lines = self.title.split('\n')
        y_start = H - 160
        for i, line in enumerate(lines):
            c.drawString(45, y_start - i * 44, line)

        # Accent divider
        c.setStrokeColor(TEAL_LIGHT)
        c.setLineWidth(3)
        c.line(45, y_start - len(lines) * 44 - 8, 100, y_start - len(lines) * 44 - 8)

        # Subtitle
        c.setFont('Helvetica', 12)
        c.setFillColor(HexColor('#CBD5E1'))
        sub_y = y_start - len(lines) * 44 - 26
        c.drawString(45, sub_y, self.subtitle)

        # Brand block
        c.setFont('Helvetica-Bold', 9)
        c.setFillColor(TEAL_LIGHT)
        c.drawString(45, H - 340, 'SARAWAK MEDCHAIN')
        c.setFont('Helvetica', 10)
        c.setFillColor(HexColor('#94A3B8'))
        c.drawString(45, H - 356, "Sarawak's Sovereign Health Record System")

        # Right panel: For / From
        panel_x = W - 220
        c.setFont('Helvetica-Bold', 8)
        c.setFillColor(TEAL_LIGHT)
        c.drawString(panel_x, H - 130, 'FROM')
        c.setFont('Helvetica-Bold', 11)
        c.setFillColor(WHITE)
        c.drawString(panel_x, H - 148, 'Randy Richard')
        c.setFont('Helvetica', 9)
        c.setFillColor(HexColor('#CBD5E1'))
        c.drawString(panel_x, H - 162, 'Founder, Sarawak MedChain')
        c.drawString(panel_x, H - 176, 'randyrjm99@gmail.com')

        c.setFont('Helvetica-Bold', 8)
        c.setFillColor(TEAL_LIGHT)
        c.drawString(panel_x, H - 210, 'DATE')
        c.setFont('Helvetica', 10)
        c.setFillColor(WHITE)
        c.drawString(panel_x, H - 226, 'June 2026')

        # Confidential tag
        conf_y = H - HERO_H + 20
        c.setFillColor(HexColor('#0A1F44'))
        c.roundRect(W - 155, conf_y - 12, 130, 18, 9, stroke=0, fill=1)
        c.setFont('Helvetica-Bold', 7.5)
        c.setFillColor(HexColor('#94A3B8'))
        c.drawString(W - 145, conf_y - 8, 'CONFIDENTIAL  ·  DRAFT')

        # Bottom footer bar
        c.setFillColor(SLATE_50)
        c.rect(0, 0, W, 40, stroke=0, fill=1)
        c.setStrokeColor(SLATE_200)
        c.setLineWidth(0.4)
        c.line(0, 40, W, 40)
        c.setFont('Helvetica-Bold', 7.5)
        c.setFillColor(NAVY)
        c.drawString(45, 22, f'SARAWAK MEDCHAIN  ·  {self.title.replace(chr(10), " ")}')
        c.setFont('Helvetica', 7.5)
        c.setFillColor(SLATE_500)
        c.drawString(45, 12, 'Prepared June 2026  ·  Confidential  ·  Not for redistribution')
        c.setFont('Helvetica-Bold', 7.5)
        c.setFillColor(TEAL)
        c.drawRightString(W - 45, 22, 'sarawak-medchain.pages.dev')
        c.setFont('Helvetica', 7)
        c.setFillColor(SLATE_400)
        c.drawRightString(W - 45, 12, 'Built in Sarawak  ·  For Sarawak')

        c.restoreState()


# ============ Helpers ============
def h1(story, styles, num_text, title):
    story.append(Paragraph(num_text, styles['h1_num']))
    story.append(Paragraph(title, styles['h1']))


def h2(story, styles, title):
    story.append(Paragraph(title, styles['h2']))


def h3(story, styles, title):
    story.append(Paragraph(title, styles['h3']))


def p(story, styles, text, style='body'):
    story.append(Paragraph(text, styles[style]))


def bullets(story, styles, items):
    for b in items:
        story.append(Paragraph(f'&#8226;&nbsp;&nbsp; {b}', styles['bullet']))


def spacer(story, h=6):
    story.append(Spacer(1, h * mm))


def hr(story):
    story.append(HRFlowable(width='100%', thickness=0.4, color=SLATE_200,
                            spaceBefore=6, spaceAfter=6))


def cover_placeholder(story):
    story.append(Spacer(1, 700))
    story.append(PageBreak())


# ============ DOC 1: Understanding Sarawak MedChain ============
def build_doc1():
    output = HERE / '1_Understand_SarawakMedChain.pdf'
    styles = make_styles()
    frame = DocFrame(
        title='Understanding\nSarawak MedChain',
        subtitle='For my friend — read this before we talk equity.',
        doc_id='Doc 1 of 3',
    )

    doc = SimpleDocTemplate(
        str(output), pagesize=A4,
        leftMargin=22 * mm, rightMargin=22 * mm,
        topMargin=20 * mm, bottomMargin=22 * mm,
        title='Understanding Sarawak MedChain',
        author='Randy Richard',
    )

    story = []
    cover_placeholder(story)

    # Purpose banner
    story.append(Paragraph(
        '<font color="#B45309" size="8"><b>PURPOSE OF THIS DOCUMENT</b></font>',
        styles['h2']
    ))
    p(story, styles,
      'This is the first of three documents. Read it, click around the live product, then come back to talk. '
      'If you decide this is not for you, no hard feelings and we stay best friends. If you are excited, we go to Doc 2 (the Partnership Proposal) and Doc 3 (the Founders&#39; Agreement).')

    h1(story, styles, 'SECTION 1', 'What Sarawak MedChain is (plain language)')
    p(story, styles,
      'Every doctor in Malaysia issues <b>medical certificates (MC)</b> - the paper you show your boss when you take sick leave. Right now, these MCs are:')
    bullets(story, styles, [
        '<b>On paper</b> - easily photocopied and forged',
        '<b>Impossible to verify</b> - your boss cannot tell if it is real',
        '<b>Not tracked</b> - nobody knows how many are issued or by whom',
    ])
    p(story, styles,
      'This costs Malaysia an estimated <b>RM 1.5-3 billion per year</b> in fraud, sick leave abuse, and insurance claim fraud.')
    p(story, styles,
      '<b>Sarawak MedChain fixes this</b> by putting medical certificates on a blockchain:')
    bullets(story, styles, [
        'Doctor issues an MC &#8594; it is encrypted and gets a unique cryptographic fingerprint on a public blockchain',
        'Patient controls who can read it - via a phone wallet OR a simple 6-digit code (like an OTP)',
        'Employer scans the QR code &#8594; verifies in 5 seconds if it is real',
        'Everything logged, auditable, impossible to fake',
    ])
    p(story, styles,
      '<b>Full working demo:</b> <font color="#0F766E">sarawak-medchain.pages.dev</font><br/>'
      '<b>Try the OTP demo:</b> <font color="#0F766E">sarawak-medchain.pages.dev/#/otp</font> (open in 2 tabs - one is the patient, one is the doctor)')

    h1(story, styles, 'SECTION 2', 'Why this matters RIGHT NOW')
    p(story, styles,
      'On <b>21 June 2026</b>, the <b>Minister of Health, Datuk Seri Dr Dzulkefly Ahmad</b>, publicly announced that KKM is studying e-MC implementation to curb misuse of sick leave certificates. (Astro Awani, TikTok @501awani.)')
    p(story, styles,
      '<b>Translation:</b> The Ministry of Health just said Malaysia needs what we have built.')
    bullets(story, styles, [
        'KKM will pick a vendor for this in 12-36 months',
        'We can be the vendor - or at minimum, the Sarawak-first showcase',
        'If we move fast, we get in. If we wait, someone in KL wins.',
    ])

    h1(story, styles, 'SECTION 3', 'What we have TODAY')
    bullets(story, styles, [
        'Working product live at sarawak-medchain.pages.dev',
        'Working OTP demo (patient &#8594; doctor flow in 5 seconds)',
        'Enterprise registered (Medchain Enterprise, SSM)',
        '12-page business plan ready to send to funders',
        '1-page pitch PDF ready to email to hospitals',
        'Privacy Policy + Terms of Service (PDPA 2010 compliant)',
        '<b>Real conversations in progress:</b> Cradle Fund SVP (contact card in hand), SDEC officer, Ketua Belia Miri (helping with YB introductions)',
        '7 months of solo building - no shortcuts, no vaporware',
    ])

    h1(story, styles, 'SECTION 4', 'What we do NOT have yet')
    bullets(story, styles, [
        'First paying customer',
        'Signed pilot letter',
        'Sdn Bhd registration (waiting for first contract)',
        'Any funding yet',
        '<b>A dedicated marketing / customer outreach person</b> - this is where you would come in',
    ])
    p(story, styles,
      'I have been doing everything solo. Building the tech, writing the docs, doing outreach, applying to programs. I am decent at the tech. I need someone better than me at the human side - reaching hospitals, closing pilots, building the brand.')
    p(story, styles,
      '<b>That is you</b> - if you want it.')

    h1(story, styles, 'SECTION 5', 'What comes next (the next 12 months)')
    rm_data = [
        [Paragraph('<b>Quarter</b>', styles['body']),
         Paragraph('<b>Milestone</b>', styles['body'])],
        [Paragraph('<b>Q3 2026</b><br/><font size="7" color="#94A3B8">Jul - Sep</font>', styles['body']),
         Paragraph('Land first paid pilot - target: Sarawak General Hospital or 1 klinik swasta', styles['body'])],
        [Paragraph('<b>Q4 2026</b><br/><font size="7" color="#94A3B8">Oct - Dec</font>', styles['body']),
         Paragraph('2-3 more pilots active. Sdn Bhd registration. First formal share issuance.', styles['body'])],
        [Paragraph('<b>Q1 2027</b><br/><font size="7" color="#94A3B8">Jan - Mar</font>', styles['body']),
         Paragraph('Convert pilots to paid subscriptions. Cradle grant hopefully landed.', styles['body'])],
        [Paragraph('<b>Q2 2027</b><br/><font size="7" color="#94A3B8">Apr - Jun</font>', styles['body']),
         Paragraph('5+ paying facilities across Sarawak. First real revenue.', styles['body'])],
    ]
    rm_tbl = Table(rm_data, colWidths=[35 * mm, 130 * mm])
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
    spacer(story, 4)
    p(story, styles,
      '<b>Target by month 12:</b> 5 clinics + 2 hospitals paying = <b>RM 42,500/month</b> recurring = <b>RM 510,000/year</b>.')
    p(story, styles,
      'This is not a get-rich-quick play. This is a <b>12-24 month grind</b> to build a real Sarawak SaaS business.')

    h1(story, styles, 'SECTION 6', 'Why I want YOU specifically')
    bullets(story, styles, [
        'You love business - the operating side of things',
        'I need someone who understands marketing + sales + human relationships',
        'We are best friends &#8594; we trust each other &#8594; we will not screw each other over',
        'You are Sarawakian &#8594; we go into hospitals as a Sarawak team &#8594; that matters here',
    ])
    p(story, styles,
      '<b>But friendship is not a business plan.</b> We need to be honest about time commitment, roles, and what each of us gets out of this. That is the next conversation.')

    h1(story, styles, 'SECTION 7', 'Before we talk, think about this')
    h3(story, styles, '1. How much time can you actually give?')
    bullets(story, styles, [
        '40+ hrs/week (full-time, no other job)?',
        '15-25 hrs/week (part-time, still working/studying)?',
        'Weekends and evenings only (under 15 hrs)?',
    ])
    p(story, styles,
      'Be honest with yourself. Whatever it is is fine, but the equity offer depends on this.')

    h3(story, styles, '2. What do you get excited about doing?')
    bullets(story, styles, [
        'Selling to clinic owners (cold walk-ins, phone calls)',
        'Writing LinkedIn posts + TikTok content',
        'Both?',
    ])

    h3(story, styles, '3. What are your money needs in the next 6 months?')
    bullets(story, styles, [
        'Can you go 3-6 months without income from this?',
        'Are you OK with sweat equity now, cash later?',
        'No wrong answer - just be honest.',
    ])

    h3(story, styles, '4. What if this fails?')
    bullets(story, styles, [
        'Startups fail more often than they succeed',
        'If we shut down in 12 months, are you OK with that?',
        'Your equity should be worth the risk-tolerance you have',
    ])

    h1(story, styles, 'SECTION 8', 'What I will share next (if you are in)')
    p(story, styles,
      'Once we talk and agree we want to move forward, I will share:')
    bullets(story, styles, [
        '<b>Doc 2: Partnership Proposal</b> - specific role, equity tiers, milestones, expectations',
        '<b>Doc 3: Founders&#39; Agreement</b> - the actual document we both sign (we will get a lawyer to review before signing, RM 200-400 one-off cost)',
    ])
    p(story, styles,
      '<b>No verbal deals. Everything in writing. This protects both of us.</b>')

    # Closing
    spacer(story, 8)
    hr(story)
    p(story, styles,
      '<b>Randy Richard</b><br/>'
      'Founder, Sarawak MedChain<br/>'
      'Medchain Enterprise (SSM-registered)<br/>'
      'randyrjm99@gmail.com  ·  sarawak-medchain.pages.dev',
      style='body_left')
    p(story, styles,
      '<i>Send me a message when you have read this. No rush.</i>',
      style='small')

    doc.build(story, onFirstPage=frame.on_page, onLaterPages=frame.on_page)
    return output


# ============ DOC 2: Partnership Proposal ============
def build_doc2():
    output = HERE / '2_Partnership_Proposal.pdf'
    styles = make_styles()
    frame = DocFrame(
        title='Partnership\nProposal',
        subtitle='For the marketing partner role. Draft for discussion.',
        doc_id='Doc 2 of 3',
    )

    doc = SimpleDocTemplate(
        str(output), pagesize=A4,
        leftMargin=22 * mm, rightMargin=22 * mm,
        topMargin=20 * mm, bottomMargin=22 * mm,
        title='Sarawak MedChain - Partnership Proposal',
        author='Randy Richard',
    )

    story = []
    cover_placeholder(story)

    story.append(Paragraph(
        '<font color="#B45309" size="8"><b>READ DOC 1 FIRST</b></font>',
        styles['h2']
    ))
    p(story, styles,
      'This is not a contract. This is my honest opening offer for you joining Sarawak MedChain as a partner. Read it, react, tell me what you would change. Once we agree, we turn it into the formal Founders&#39; Agreement (Doc 3) and sign that (with a lawyer&#39;s review).')

    h1(story, styles, 'SECTION 1', 'The role: Head of Marketing &amp; Growth')

    h3(story, styles, 'What you would own')
    bullets(story, styles, [
        '<b>Sales outreach</b> to clinics, hospitals, and government contacts',
        '<b>Customer conversations</b> - leading pilot pitches with tech support from me',
        '<b>Marketing content</b> - LinkedIn posts, TikTok explainers, website copy',
        '<b>Brand development</b> - how we present ourselves in Sarawak and later Malaysia-wide',
        '<b>Grant applications</b> - Cradle, TEGAS, SDEC (together, you lead the "story" parts)',
    ])

    h3(story, styles, 'What I would keep owning')
    bullets(story, styles, [
        'Product &amp; engineering (all code, features, deployment)',
        'Product roadmap decisions',
        'Legal, finance, compliance',
        'Company direction &amp; fundraising strategy',
        'Final say on customer contracts',
    ])

    h3(story, styles, 'Where we would decide together')
    bullets(story, styles, [
        'Pricing changes',
        'Which prospects to pursue',
        'Hiring decisions',
        'Anything about company culture / values',
    ])

    h1(story, styles, 'SECTION 2', 'Time commitment tiers (choose one, honestly)')
    p(story, styles,
      'Since we have not discussed this yet, here are the three realistic tiers. Each has a different equity level. <b>Be honest with yourself about which one is you.</b>')

    # Tier table
    tier_data = [
        [Paragraph('<b>Tier</b>', styles['body']),
         Paragraph('<b>Hours / week</b>', styles['body']),
         Paragraph('<b>Equity</b>', styles['body']),
         Paragraph('<b>Vesting</b>', styles['body'])],
        [Paragraph('<b>A</b><br/><font size="7">Full-Time</font>', styles['body']),
         '40+ hrs (no other job)', '10%', '4 years, 1-yr cliff'],
        [Paragraph('<b>B</b><br/><font size="7">Part-Time</font>', styles['body']),
         '15-25 hrs (with other work)', '6% + 2% milestone', '4 years, 1-yr cliff'],
        [Paragraph('<b>C</b><br/><font size="7">Advisor</font>', styles['body']),
         'Under 15 hrs', '3% + 1% per closed customer (cap 3%)', '2 years, 6-mo cliff'],
    ]
    tier_tbl = Table(tier_data, colWidths=[24 * mm, 45 * mm, 50 * mm, 45 * mm])
    tier_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('BACKGROUND', (0, 1), (-1, -1), SLATE_50),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('BOX', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(tier_tbl)
    spacer(story, 3)
    p(story, styles,
      '<b>All tiers:</b> sweat equity only until first paid contract or funding. Then a real salary conversation.',
      style='small')

    h1(story, styles, 'SECTION 3', 'Milestones you would own (Tiers A &amp; B)')
    ms_data = [
        [Paragraph('<b>Timeline</b>', styles['body']),
         Paragraph('<b>Milestone</b>', styles['body']),
         Paragraph('<b>Success metric</b>', styles['body'])],
        ['Month 1', 'Read everything, meet key contacts, understand product deeply', 'Pitch in 60 sec without me'],
        ['Month 2', 'First 10 outreach conversations with prospects', '10 real convos logged'],
        ['Month 3', 'First LOI or signed pilot', '1 committed prospect'],
        ['Month 6', '2 more pilots active', '3 total pilots'],
        ['Month 12', '3 pilots converted to paid', 'RM 6,000+ MRR from your channel'],
    ]
    ms_tbl = Table(ms_data, colWidths=[25 * mm, 75 * mm, 60 * mm])
    ms_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('BOX', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, SLATE_200),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(ms_tbl)

    h1(story, styles, 'SECTION 4', 'What YOU get out of this')

    h3(story, styles, 'Short-term (0-12 months)')
    bullets(story, styles, [
        'Real experience running a B2B SaaS from scratch',
        'Direct access to Sarawak healthcare + government decision-makers',
        'Your name on the founding team of something real',
        'A share of the equity - worth zero today but potentially real money later',
        'Skills that transfer to any future role',
    ])

    h3(story, styles, 'Medium-term (12-24 months)')
    bullets(story, styles, [
        'Real salary (once funded or profitable)',
        'Reference customers you personally closed',
        'LinkedIn credibility',
        'Potential CEO / Head of Sales role at scale',
    ])

    h3(story, styles, 'Long-term (2+ years)')
    bullets(story, styles, [
        'If we succeed at scale: equity could be worth 5-7 figures',
        'If we succeed modestly: solid resume line + salary + small equity payout',
        'If we fail: you learned more in 12 months than 5 years of a normal job',
    ])

    h1(story, styles, 'SECTION 5', 'What I am giving up')
    p(story, styles,
      'This is not me giving away equity casually. I am giving up up to 10% of the company I built solo for 7 months. Here is the math:')
    bullets(story, styles, [
        'If MedChain is worth <b>RM 5 million</b> at exit &#8594; your 10% = <b>RM 500,000</b>',
        'If MedChain is worth <b>RM 20 million</b> at exit &#8594; your 10% = <b>RM 2,000,000</b>',
        'If MedChain fails &#8594; your 10% = <b>RM 0</b> (and I lose 100% either way)',
    ])
    p(story, styles,
      'I am making this offer because I genuinely believe you would add more value than 10% dilution costs me. Prove it and we all win.')

    h1(story, styles, 'SECTION 6', 'The rules that protect BOTH of us')
    p(story, styles,
      'These will be in the Founders&#39; Agreement (Doc 3). Read them now so nothing surprises you later:')
    rules = [
        ('Vesting', 'If you leave before 12 months, you get ZERO equity. After 12 months, 25% vests immediately. Then monthly over 3 more years. Full 100% only after 4 years.'),
        ('IP assignment', 'Everything you create for MedChain belongs to the Company, not you personally. If you leave, that stays.'),
        ('Non-compete (12 months post-departure)', 'You will not join or start a competing blockchain healthcare business in Malaysia for 12 months after leaving. Outside Malaysia is fair game.'),
        ('Confidentiality', 'Anything you learn about MedChain stays confidential. Even after you leave. Standard, not personal.'),
        ('Termination clauses', 'Either party can walk away. 30-day notice. Your vested equity stays yours.'),
        ('Sdn Bhd registration trigger', 'If we have not registered Sdn Bhd within 18 months, either of us can walk away with no penalty.'),
        ('Founder dispute resolution', '3 days honest conversation &#8594; mediation &#8594; Kuching High Court. Human process first.'),
    ]
    for name, body in rules:
        p(story, styles, f'<b>{name}:</b> {body}')

    h1(story, styles, 'SECTION 7', 'What happens if you say YES')
    bullets(story, styles, [
        '<b>This week:</b> We meet in person, walk through this document line by line',
        '<b>Next week:</b> Lawyer review of the Founders&#39; Agreement (RM 200-400, I pay this)',
        '<b>Week after:</b> Both sign the Founders&#39; Agreement',
        '<b>From that day:</b> You are my co-founder. Announce internally, update LinkedIn, start executing',
        '<b>When Sdn Bhd registers:</b> Formal share issuance per this agreement',
    ])

    h1(story, styles, 'SECTION 8', 'What happens if you say NO')
    bullets(story, styles, [
        'No hard feelings. Zero. We are still best friends.',
        'Whatever we discussed stays confidential - you do not join a competitor',
        'I keep building. Maybe I find another partner. Maybe not.',
        'The offer stands for 30 days - if you change your mind, we talk.',
    ])

    h1(story, styles, 'SECTION 9', 'Questions to prepare')
    p(story, styles, 'Before our next conversation, think about:')
    bullets(story, styles, [
        'Which tier honestly matches your life right now (A / B / C)?',
        'What worries you about this deal?',
        'What would make this a "no" for you?',
        'What is your dream outcome in 2 years?',
        'Anything you want that is not in this document?',
    ])

    h1(story, styles, 'SECTION 10', 'My honest advice to you')
    p(story, styles,
      'Take this document to someone older who has seen a co-founder deal before - a family member in business, a mentor, anyone. Get a second opinion before we sign anything.')
    p(story, styles,
      'I want you in. But I want you in <b>eyes wide open</b>. Nothing worse than a co-founder feeling tricked 12 months later. This document exists so that never happens between us.')

    # Closing
    spacer(story, 8)
    hr(story)
    p(story, styles,
      '<b>Randy Richard</b><br/>'
      'Founder, Sarawak MedChain<br/>'
      'randyrjm99@gmail.com  ·  sarawak-medchain.pages.dev',
      style='body_left')

    doc.build(story, onFirstPage=frame.on_page, onLaterPages=frame.on_page)
    return output


# ============ DOC 3: Founders' Agreement Template ============
def build_doc3():
    output = HERE / '3_Founders_Agreement_Template.pdf'
    styles = make_styles()
    frame = DocFrame(
        title="Founders'\nAgreement",
        subtitle='Draft template - subject to lawyer review before signing.',
        doc_id='Doc 3 of 3',
    )

    doc = SimpleDocTemplate(
        str(output), pagesize=A4,
        leftMargin=25 * mm, rightMargin=25 * mm,
        topMargin=20 * mm, bottomMargin=22 * mm,
        title="Sarawak MedChain - Founders' Agreement (Draft Template)",
        author='Randy Richard',
    )

    story = []
    cover_placeholder(story)

    # PROMINENT DISCLAIMER
    warn_data = [[
        Paragraph(
            '<b><font color="#DC2626" size="10">&#9888; IMPORTANT NOTICE - READ BEFORE USING</font></b><br/><br/>'
            '<b>This is a TEMPLATE prepared for negotiation between founders. It is NOT a substitute for legal advice.</b><br/><br/>'
            '<b>Before either party signs this document:</b><br/>'
            '&#8226; Both parties must engage a Malaysian-qualified lawyer to review and adapt this document<br/>'
            '&#8226; Typical cost: RM 200-800 for a founders&#39; agreement review by a lawyer in Kuching or KL<br/>'
            '&#8226; This template covers common provisions but may not cover your specific needs<br/>'
            '&#8226; Under Malaysian law, some provisions may require adaptation to be fully enforceable<br/><br/>'
            '<b>Nothing in this document is legal advice. Consult a lawyer.</b>',
            styles['callout_body']
        )
    ]]
    warn_tbl = Table(warn_data, colWidths=[165 * mm])
    warn_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), RED_50),
        ('BOX', (0, 0), (-1, -1), 1, RED_500),
        ('LEFTPADDING', (0, 0), (-1, -1), 16),
        ('RIGHTPADDING', (0, 0), (-1, -1), 16),
        ('TOPPADDING', (0, 0), (-1, -1), 14),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
    ]))
    story.append(warn_tbl)

    spacer(story, 6)

    # Title
    story.append(Paragraph(
        "<font color='#0F172A' size='16'><b>FOUNDERS&#39; AGREEMENT</b></font>",
        styles['h1']
    ))
    p(story, styles,
      '<b>This Agreement</b> is made on the ___ day of _______ 2026',
      style='legal')

    p(story, styles, '<b>Between:</b>', style='legal')
    p(story, styles,
      '<b>1. RANDY RICHARD</b> (IC No: ___________________)<br/>'
      'of [Full Address, Miri, Sarawak]<br/>'
      '(the "Founding Party" and "Chief Executive Officer")',
      style='legal')

    p(story, styles, '<b>And:</b>', style='legal')
    p(story, styles,
      '<b>2. [FRIEND&#39;S FULL NAME]</b> (IC No: ___________________)<br/>'
      'of [Full Address]<br/>'
      '(the "Joining Party" and "Head of Marketing &amp; Growth")',
      style='legal')

    p(story, styles,
      '<i>(each a "Party" and together the "Parties")</i>',
      style='small')

    # Section 1
    h1(story, styles, 'SECTION 1', 'INTERPRETATION')
    h3(story, styles, '1.1 Definitions')
    bullets(story, styles, [
        '<b>"Company"</b> means Medchain Enterprise (SSM Registration No. ___________), currently registered as a sole proprietorship, which the Parties intend to convert to a Sendirian Berhad (Sdn Bhd) private limited company as further described in Section 3.',
        '<b>"Product"</b> means the Sarawak MedChain blockchain-based medical certificate platform, including all software, documentation, brand assets, customer relationships, and know-how associated with it (Schedule A).',
        '<b>"Trading Name"</b> means "Sarawak MedChain".',
        '<b>"Effective Date"</b> means the date this Agreement is signed by both Parties.',
        '<b>"Sdn Bhd"</b> means the private limited company to be incorporated per Section 3.',
        '<b>"Vesting Commencement Date"</b> means the Effective Date of this Agreement.',
    ])
    h3(story, styles, '1.2 Purpose')
    p(story, styles,
      'The Parties agree to jointly develop, promote, and commercialise the Product, initially under the existing Enterprise entity and subsequently under a Sdn Bhd entity to be incorporated per Section 3.',
      style='legal')

    # Section 2
    h1(story, styles, 'SECTION 2', 'ROLES AND RESPONSIBILITIES')
    h3(story, styles, '2.1 Randy Richard (Chief Executive Officer)')
    bullets(story, styles, [
        'Product design, development, and deployment',
        'Technical roadmap and engineering decisions',
        'Legal, finance, and regulatory compliance',
        'Sdn Bhd incorporation, share issuance, and governance',
        'Final decision authority on customer contracts and product direction',
    ])
    h3(story, styles, '2.2 [Friend&#39;s Name] (Head of Marketing &amp; Growth)')
    bullets(story, styles, [
        'Sales outreach to clinics, hospitals, and government contacts',
        'Leading pilot pitches and customer conversations',
        'Marketing content across LinkedIn, TikTok, and other channels',
        'Brand development and public communications',
        'Grant application support (Cradle, TEGAS, SDEC, etc.)',
    ])
    h3(story, styles, '2.3 Shared decisions')
    p(story, styles, 'The following decisions require agreement of both Parties:', style='legal')
    bullets(story, styles, [
        'Pricing changes',
        'Prospect prioritisation',
        'Hiring or engaging any staff or contractor',
        'Any change to this Agreement',
        'Public announcements regarding funding, partnerships, or exits',
    ])
    h3(story, styles, '2.4 Minimum time commitment')
    p(story, styles,
      'The Joining Party commits to a minimum of <b>[X] hours per week</b> dedicated to the Company. Select tier from Partnership Proposal: A = 40+ / B = 15-25 / C = under 15.',
      style='legal')

    # Section 3
    h1(story, styles, 'SECTION 3', 'ENTITY, EQUITY &amp; VESTING')
    h3(story, styles, '3.1 Current entity status')
    p(story, styles,
      'The Parties acknowledge that the Company is presently registered as an Enterprise (sole proprietorship). Sole proprietorships under Malaysian law do not issue equity shares.',
      style='legal')

    h3(story, styles, '3.2 Commitment to Sdn Bhd conversion')
    p(story, styles,
      'The Founding Party commits to incorporating a private limited company (Sdn Bhd) under the Companies Act 2016 within <b>eighteen (18) months</b> of the Effective Date, or within thirty (30) days of the first signed paid customer contract, whichever is earlier.',
      style='legal')

    h3(story, styles, '3.3 Equity allocation upon Sdn Bhd incorporation')
    bullets(story, styles, [
        '<b>Randy Richard:</b> [___]% (default: 90% Tier A / 94% Tier B / 97% Tier C)',
        '<b>[Friend&#39;s Name]:</b> [___]% (default: 10% Tier A / 6% Tier B / 3% Tier C)',
    ])
    p(story, styles,
      'The Joining Party&#39;s shares shall be subject to the vesting schedule in Section 3.4.',
      style='legal')

    h3(story, styles, '3.4 Vesting schedule (Joining Party)')
    p(story, styles,
      'The Joining Party&#39;s equity vests on the following schedule from the Vesting Commencement Date:',
      style='legal')
    bullets(story, styles, [
        '<b>First 12 months (the "Cliff"):</b> ZERO shares vested. If the Joining Party ceases involvement for any reason prior to the 12-month anniversary, they receive no equity.',
        '<b>12-month anniversary:</b> 25% of allocated equity vests immediately.',
        '<b>Months 13-48:</b> the remaining 75% vests monthly (~2.08% per month) over 36 months.',
        '<b>48-month anniversary:</b> 100% vested.',
    ])
    p(story, styles,
      '<i>For Tier C (Sweat Equity Advisor), vesting shall be 2 years total with a 6-month cliff.</i>',
      style='small')

    h3(story, styles, '3.5 Milestone-based equity bonuses (Tiers B &amp; C only)')
    bullets(story, styles, [
        '<b>Tier B:</b> Additional 2% granted upon Company reaching 3 paying customers.',
        '<b>Tier C:</b> 1% additional per paying customer personally closed by Joining Party, up to a maximum of 3%.',
    ])

    h3(story, styles, '3.6 Acceleration on change of control')
    p(story, styles,
      'If the Company is acquired or merges with another entity ("Change of Control"), 50% of the Joining Party&#39;s then-unvested equity shall accelerate and vest immediately.',
      style='legal')

    h3(story, styles, '3.7 Interim equivalent (before Sdn Bhd)')
    p(story, styles,
      'Between the Effective Date and the date of Sdn Bhd incorporation, the Joining Party has no legal shareholding but has an enforceable contractual right to the share allocation defined in Sections 3.3 and 3.4 upon incorporation.',
      style='legal')

    # Section 4
    h1(story, styles, 'SECTION 4', 'INTELLECTUAL PROPERTY')
    h3(story, styles, '4.1 IP assignment to the Company')
    p(story, styles,
      'Any and all intellectual property created by either Party in connection with the Company or the Product - including but not limited to source code, brand assets, marketing content, customer lists, pitch decks, technical documentation, and business plans - shall be the exclusive property of the Company.',
      style='legal')
    h3(story, styles, '4.2 Waiver of moral rights')
    p(story, styles,
      'Each Party waives any moral rights they may have in any IP created for the Company, to the extent permitted by Malaysian law.',
      style='legal')
    h3(story, styles, '4.3 Pre-existing IP')
    bullets(story, styles, [
        'The Founding Party retains ownership of the Sarawak MedChain source code and Product as developed prior to the Effective Date, and hereby grants an exclusive perpetual licence of the same to the Company (and its Sdn Bhd successor).',
        'Neither Party contributes third-party IP without written consent of the other.',
    ])

    # Section 5
    h1(story, styles, 'SECTION 5', 'CONFIDENTIALITY')
    h3(story, styles, '5.1 Confidential Information')
    p(story, styles,
      'Each Party shall keep confidential all non-public information relating to the Company, including but not limited to technical designs, customer information, financial information, business strategies, and pricing.',
      style='legal')
    h3(story, styles, '5.2 Duration')
    p(story, styles,
      'The confidentiality obligation survives the termination of this Agreement indefinitely.',
      style='legal')
    h3(story, styles, '5.3 Exclusions')
    p(story, styles,
      'Standard exclusions apply for information that is: (a) publicly known through no fault of the receiving Party; (b) independently developed; (c) required to be disclosed by law.',
      style='legal')

    # Section 6
    h1(story, styles, 'SECTION 6', 'NON-COMPETE')
    h3(story, styles, '6.1 During the term')
    p(story, styles,
      'Neither Party shall directly or indirectly engage in, own, or be employed by any business that competes with the Company anywhere in Malaysia during the term of this Agreement.',
      style='legal')
    h3(story, styles, '6.2 Post-departure (Joining Party only)')
    p(story, styles,
      'For a period of twelve (12) months after the Joining Party ceases involvement with the Company, the Joining Party shall not:',
      style='legal')
    bullets(story, styles, [
        'Engage in any blockchain-based medical certificate or e-MC business in Malaysia',
        'Solicit any Company customer, prospect, or employee',
        'Use any Company Confidential Information for a competing purpose',
    ])
    p(story, styles,
      'This restriction is limited to Malaysia. Activities outside Malaysia are unrestricted.',
      style='legal')

    # Section 7
    h1(story, styles, 'SECTION 7', 'TERMINATION')
    h3(story, styles, '7.1 Voluntary departure')
    p(story, styles,
      'Either Party may terminate their involvement with 30 days&#39; written notice. The Joining Party&#39;s vested equity as of the departure date remains theirs, subject to Section 7.4.',
      style='legal')
    h3(story, styles, '7.2 Termination for cause')
    bullets(story, styles, [
        'Material breach of this Agreement not cured within 14 days of written notice',
        'Fraud, dishonesty, or gross misconduct',
        'Conviction of a criminal offence involving moral turpitude',
        'Unauthorised disclosure of Confidential Information',
    ])
    p(story, styles,
      'In case of termination for cause of the Joining Party, all unvested equity is forfeited and vested equity is subject to Company buy-back at fair market value.',
      style='legal')
    h3(story, styles, '7.3 Termination if Sdn Bhd not incorporated')
    p(story, styles,
      'If Sdn Bhd is not incorporated within eighteen (18) months of the Effective Date, either Party may terminate this Agreement with 30 days&#39; notice, with no penalty and no ongoing obligations except confidentiality and non-compete.',
      style='legal')
    h3(story, styles, '7.4 Company buy-back right')
    bullets(story, styles, [
        '<b>Fair market value</b> if departure is voluntary or without cause',
        '<b>Original allocation cost (par value)</b> if departure is for cause per Section 7.2',
    ])
    p(story, styles,
      'Fair market value shall be determined by mutual agreement or, failing agreement within 30 days, by an independent valuer appointed by both Parties.',
      style='legal')

    # Section 8
    h1(story, styles, 'SECTION 8', 'DISPUTE RESOLUTION')
    h3(story, styles, '8.1 Founder discussion')
    p(story, styles,
      'The Parties agree to first attempt to resolve any dispute through direct, honest discussion over a minimum period of 3 days.',
      style='legal')
    h3(story, styles, '8.2 Mediation')
    p(story, styles,
      'If direct discussion fails, the Parties agree to mediation before a mutually agreed mediator prior to any legal action.',
      style='legal')
    h3(story, styles, '8.3 Governing law and jurisdiction')
    p(story, styles,
      'This Agreement is governed by the laws of Malaysia. Any dispute that cannot be resolved by mediation shall be subject to the exclusive jurisdiction of the courts of Kuching, Sarawak.',
      style='legal')

    # Section 9
    h1(story, styles, 'SECTION 9', 'GENERAL PROVISIONS')
    bullets(story, styles, [
        '<b>9.1 Entire agreement.</b> This Agreement constitutes the entire agreement between the Parties.',
        '<b>9.2 Amendment.</b> Any amendment must be in writing and signed by both Parties.',
        '<b>9.3 Severability.</b> If any provision is held to be invalid, the remainder continues in force.',
        '<b>9.4 Waiver.</b> Failure to enforce any provision shall not constitute a waiver.',
        '<b>9.5 Notices.</b> All formal notices shall be sent by e-mail with a physical copy sent by post to the addresses stated at the top.',
    ])

    # Signatures
    h1(story, styles, '', 'SIGNATURES')

    sig_data = [
        [Paragraph('<b>Randy Richard</b>', styles['sig_line'])],
        [Paragraph('<br/>Signature: ________________________________  Date: ___________', styles['sig_line'])],
        [Paragraph('IC No: ___________________  Email: randyrjm99@gmail.com', styles['sig_line'])],
        [Paragraph('<br/><br/><b>[Friend&#39;s Full Name]</b>', styles['sig_line'])],
        [Paragraph('<br/>Signature: ________________________________  Date: ___________', styles['sig_line'])],
        [Paragraph('IC No: ___________________  Email: _______________________', styles['sig_line'])],
        [Paragraph('<br/><br/><b>Witness 1</b> (independent adult, not related to either Party)', styles['sig_line'])],
        [Paragraph('Name: ____________________  Signature: __________  Date: ________', styles['sig_line'])],
        [Paragraph('<br/><b>Witness 2</b> (independent adult, not related to either Party)', styles['sig_line'])],
        [Paragraph('Name: ____________________  Signature: __________  Date: ________', styles['sig_line'])],
    ]
    for row in sig_data:
        story.extend(row)

    # Schedules
    h1(story, styles, 'SCHEDULE A', 'DESCRIPTION OF THE PRODUCT')
    p(story, styles, 'Sarawak MedChain, comprising:', style='legal')
    bullets(story, styles, [
        'Frontend React/Vite web application, deployed at sarawak-medchain.pages.dev via Cloudflare Pages',
        'Backend Node.js/Express server (production deployment pending)',
        'Ethereum-compatible smart contract for cryptographic hash storage',
        'IPFS integration for encrypted document storage',
        'Public verification endpoints',
        'All associated brand assets, documentation, and marketing materials',
        'Public GitHub repository at github.com/randyrichard/Sarawak-Medchain',
    ])

    h1(story, styles, 'SCHEDULE B', 'TIME COMMITMENT TIER (SELECT ONE)')
    bullets(story, styles, [
        '[ ] <b>Tier A</b> - Full-Time Partner (minimum 40 hours per week, no other employment). Equity: 10%.',
        '[ ] <b>Tier B</b> - Part-Time Partner (minimum 15 hours per week). Equity: 6% + 2% milestone bonus.',
        '[ ] <b>Tier C</b> - Sweat Equity Advisor (under 15 hours per week). Equity: 3% + 1% per closed customer.',
    ])

    spacer(story, 4)
    hr(story)
    p(story, styles,
      '<b>End of Agreement. Do not sign until reviewed by a lawyer.</b>',
      style='small')
    p(story, styles,
      'Template prepared 30 June 2026 by Randy Richard for negotiation with [Friend&#39;s Name]. Any legal review by a Malaysian-qualified solicitor is strongly recommended before execution.',
      style='small')

    doc.build(story, onFirstPage=frame.on_page, onLaterPages=frame.on_page)
    return output


# ============ Main ============
if __name__ == '__main__':
    outputs = []
    print('Building Doc 1...')
    outputs.append(build_doc1())
    print('Building Doc 2...')
    outputs.append(build_doc2())
    print('Building Doc 3...')
    outputs.append(build_doc3())
    print()
    for o in outputs:
        print(f'  {o.name}  ({o.stat().st_size:,} bytes)')
    print()
    print('All 3 PDFs created in templates/ folder.')
