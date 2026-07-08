"""
SDEC outreach package — generates 3 PDFs:

    1. SDEC_Ayappa_Email.pdf     — printable copy of the email body
    2. SGH_Pilot_Proposal.pdf    — attachment for the SDEC email
    3. Wednesday_Checklist.pdf   — Randy's printable game plan

Run:    python build_sdec_package.py
Output: 3 PDFs in this same templates/ folder.

Brand palette is matched to build_pitch_pdf.py.
"""

from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ====== Brand palette (matches build_pitch_pdf.py) ======
NAVY = HexColor('#0F2A5C')
TEAL = HexColor('#0F766E')
TEAL_LIGHT = HexColor('#14B8A6')
SLATE_900 = HexColor('#0F172A')
SLATE_700 = HexColor('#334155')
SLATE_500 = HexColor('#64748B')
SLATE_300 = HexColor('#CBD5E1')
SLATE_200 = HexColor('#E2E8F0')
SLATE_100 = HexColor('#F1F5F9')
SLATE_50 = HexColor('#F8FAFC')
AMBER_50 = HexColor('#FFFBEB')
AMBER_400 = HexColor('#F59E0B')

HERE = Path(__file__).parent


# ----------------------------------------------------------------------
# Shared styles
# ----------------------------------------------------------------------

def make_styles():
    base = getSampleStyleSheet()

    title = ParagraphStyle(
        'Title',
        parent=base['Title'],
        fontName='Helvetica-Bold',
        fontSize=22,
        textColor=NAVY,
        spaceAfter=4,
        leading=26,
        alignment=TA_LEFT,
    )

    subtitle = ParagraphStyle(
        'Subtitle',
        parent=base['Normal'],
        fontName='Helvetica',
        fontSize=10,
        textColor=SLATE_500,
        spaceAfter=18,
        leading=14,
    )

    eyebrow = ParagraphStyle(
        'Eyebrow',
        parent=base['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        textColor=TEAL,
        spaceAfter=2,
        leading=10,
    )

    h2 = ParagraphStyle(
        'H2',
        parent=base['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        textColor=NAVY,
        spaceBefore=14,
        spaceAfter=6,
        leading=16,
    )

    h3 = ParagraphStyle(
        'H3',
        parent=base['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        textColor=SLATE_900,
        spaceBefore=10,
        spaceAfter=4,
        leading=13,
    )

    body = ParagraphStyle(
        'Body',
        parent=base['Normal'],
        fontName='Helvetica',
        fontSize=10,
        textColor=SLATE_700,
        leading=14,
        spaceAfter=6,
    )

    bullet = ParagraphStyle(
        'Bullet',
        parent=body,
        leftIndent=14,
        bulletIndent=4,
        spaceAfter=3,
    )

    quote = ParagraphStyle(
        'Quote',
        parent=body,
        fontName='Helvetica',
        fontSize=10,
        textColor=SLATE_900,
        leftIndent=14,
        rightIndent=14,
        leading=15,
        spaceBefore=4,
        spaceAfter=8,
        backColor=SLATE_50,
        borderColor=TEAL,
        borderWidth=0,
        borderPadding=10,
    )

    small = ParagraphStyle(
        'Small',
        parent=body,
        fontName='Helvetica',
        fontSize=8.5,
        textColor=SLATE_500,
        leading=11,
    )

    return {
        'title': title,
        'subtitle': subtitle,
        'eyebrow': eyebrow,
        'h2': h2,
        'h3': h3,
        'body': body,
        'bullet': bullet,
        'quote': quote,
        'small': small,
    }


# ----------------------------------------------------------------------
# Reusable flowable helpers
# ----------------------------------------------------------------------

def bullet_list(items, style):
    """Build a clean bullet list."""
    flowables = [Paragraph(item, style) for item in items]
    return ListFlowable(
        [ListItem(f, leftIndent=10, value='bullet', bulletColor=TEAL) for f in flowables],
        bulletType='bullet',
        start='•',
        leftIndent=8,
    )


def checkbox_list(items, style):
    """Use [ ] empty squares so Randy can tick them off if he prints."""
    flowables = []
    for item in items:
        # Use a unicode empty square as the bullet prefix inline
        flowables.append(Paragraph(f'<font color="#94A3B8">□</font> &nbsp; {item}', style))
        flowables.append(Spacer(1, 3))
    return flowables


def kv_table(rows, col_widths):
    """Simple 2-col table for key/value pairs."""
    t = Table(rows, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), 'Helvetica', 9.5),
        ('FONT', (0, 0), (0, -1), 'Helvetica-Bold', 9.5),
        ('TEXTCOLOR', (0, 0), (0, -1), NAVY),
        ('TEXTCOLOR', (1, 0), (-1, -1), SLATE_700),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, SLATE_200),
        ('BACKGROUND', (0, 0), (-1, -1), SLATE_50),
    ]))
    return t


def header_table(rows, col_widths):
    """Table with a styled header row."""
    t = Table(rows, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 9.5),
        ('FONT', (0, 1), (-1, -1), 'Helvetica', 9.5),
        ('TEXTCOLOR', (0, 0), (-1, 0), HexColor('#FFFFFF')),
        ('TEXTCOLOR', (0, 1), (-1, -1), SLATE_700),
        ('BACKGROUND', (0, 0), (-1, 0), NAVY),
        ('BACKGROUND', (0, 1), (-1, -1), SLATE_50),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, SLATE_200),
    ]))
    return t


# ----------------------------------------------------------------------
# Footer drawing on every page
# ----------------------------------------------------------------------

def make_footer(title_text):
    def _footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(SLATE_200)
        canvas.setLineWidth(0.4)
        canvas.line(1.5 * cm, 1.6 * cm, A4[0] - 1.5 * cm, 1.6 * cm)

        canvas.setFont('Helvetica', 7.5)
        canvas.setFillColor(SLATE_500)
        canvas.drawString(1.5 * cm, 1.2 * cm, title_text)
        canvas.drawRightString(
            A4[0] - 1.5 * cm,
            1.2 * cm,
            f'Page {doc.page}  -  MedChain Enterprise  -  randyrjm99@gmail.com',
        )
        canvas.restoreState()

    return _footer


# ----------------------------------------------------------------------
# Doc 1 — SDEC Email
# ----------------------------------------------------------------------

def build_sdec_email():
    out = HERE / 'SDEC_Ayappa_Email.pdf'
    doc = SimpleDocTemplate(
        str(out),
        pagesize=A4,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=1.8 * cm,
        bottomMargin=2.0 * cm,
        title='SDEC Outreach Email - Ayappa',
        author='Randy Richard',
    )
    s = make_styles()
    flow = []

    flow.append(Paragraph('SDEC Outreach Email', s['title']))
    flow.append(Paragraph(
        'For: Encik Ayappa, Sarawak Digital Economy Corporation &nbsp;|&nbsp; '
        'Tone: warm reconnect &nbsp;|&nbsp; Send: Wed 3 Jun, 2-4 PM',
        s['subtitle'],
    ))

    flow.append(Paragraph('SUBJECT LINE OPTIONS', s['eyebrow']))
    flow.append(Paragraph('Pick whichever feels right:', s['body']))
    flow.append(bullet_list([
        'Reconnecting &mdash; Sarawak MedChain is live, small ask',
        'Sarawak MedChain update + a support letter request',
        'Quick update: built the medical records MVP we discussed',
    ], s['bullet']))

    flow.append(Paragraph('EMAIL BODY', s['eyebrow']))
    email_html = """
    Hi Encik Ayappa,<br/><br/>

    Hope you're keeping well, and Selamat Hari Gawai &mdash; it's been a while since we last spoke.<br/><br/>

    Quick update on what I've been building since. The patient-controlled medical records
    project I mentioned back then is now a working MVP, fully deployed and demo-able:<br/><br/>

    <b>https://sarawak-medchain.pages.dev/</b><br/><br/>

    In one line: <b>Sarawak MedChain</b> lets patients own their medical records.
    Doctors only access records the patient has explicitly granted, and that access is
    enforced cryptographically on a blockchain &mdash; not by a server I control.
    Encrypted files sit on IPFS; only the access-control hashes touch the chain.<br/><br/>

    I've also just registered the business under SSM as <b>MedChain Enterprise</b>
    (Borang D attached) so everything is properly in place before approaching hospitals.<br/><br/>

    <b>The ask:</b> would SDEC be open to issuing a support letter I can use to open a
    conversation with Sarawak General Hospital? My goal is a small, no-cost 4-week pilot
    to validate the clinical workflow.<br/><br/>

    You mentioned <b>Dr Steve</b> at SGH the last time we spoke &mdash; would you mind
    sharing his full name and department so I can prepare the proposal properly for him?<br/><br/>

    Attached for your reference:<br/>
    &nbsp;&nbsp;1. One-page brief on MedChain<br/>
    &nbsp;&nbsp;2. Draft 4-week pilot scope (zero cost to SGH)<br/>
    &nbsp;&nbsp;3. Borang D &mdash; SSM business registration<br/><br/>

    Happy to drive down to Kuching for a coffee this week or next &mdash; whatever works
    for you. A 15-min call works just as well.<br/><br/>

    Terima kasih,<br/><br/>

    <b>Randy Richard</b><br/>
    Founder, MedChain Enterprise<br/>
    [your phone]<br/>
    randyrjm99@gmail.com<br/>
    https://sarawak-medchain.pages.dev
    """
    flow.append(Paragraph(email_html, s['quote']))

    flow.append(Paragraph('ATTACHMENTS CHECKLIST', s['eyebrow']))
    flow.extend(checkbox_list([
        'SarawakMedChain_OnePager.pdf (already in templates/)',
        'SGH_Pilot_Proposal.pdf (in templates/, generated from this script)',
        'Borang D scan (from SSM Wed morning)',
        'Optional: Maklumat Perniagaan (business info printout)',
    ], s['body']))

    flow.append(Paragraph('TONE NOTES', s['eyebrow']))
    flow.append(bullet_list([
        '<b>Acknowledge the gap honestly</b> &mdash; "it\'s been a while" &mdash; '
        'but don\'t apologise. Apologies invite "no problem, let\'s catch up later" '
        'rather than action.',
        '<b>Lead with proof</b> &mdash; the live demo link does more work than any '
        'paragraph of selling.',
        '<b>Make the ask concrete</b> &mdash; "support letter to SGH" is a specific '
        'document, not vibes.',
        '<b>Double-purpose the Dr Steve question</b> &mdash; asking for his details '
        'gives Ayappa an easy, low-effort reply that reopens the dialogue even if '
        'the support letter takes longer.',
        '<b>No urgency, no pressure</b> &mdash; "this week or next" signals '
        'confidence, not desperation.',
    ], s['bullet']))

    flow.append(PageBreak())

    flow.append(Paragraph('IF AYAPPA REPLIES POSITIVELY', s['eyebrow']))
    flow.append(Paragraph('Standard reply within 24 hours:', s['body']))
    flow.append(Paragraph("""
    Thanks Encik Ayappa! [Insert date/time].<br/><br/>
    For the meeting, would you like me to drive to Kuching, or is a Google Meet easier?
    Either works.<br/><br/>
    I'll also prep a short demo so we can walk through what the doctors and patients
    actually see.
    """, s['quote']))

    flow.append(Paragraph('IF SILENCE FOR 5 WORKING DAYS', s['eyebrow']))
    flow.append(Paragraph('One soft follow-up (send Tue 9 Jun if no reply by then):', s['body']))
    flow.append(Paragraph("""
    Hi Encik Ayappa, just floating this back up in case it got buried &mdash; happy to
    wait if now isn't the right time. Cheers.
    """, s['quote']))

    flow.append(Paragraph(
        'If silence continues, move to Plan B: approach SGH directly via their '
        'corporate communications email, mentioning the work without claiming SDEC '
        'endorsement.',
        s['small'],
    ))

    doc.build(
        flow,
        onFirstPage=make_footer('SDEC Outreach Email - Reconnect with Ayappa'),
        onLaterPages=make_footer('SDEC Outreach Email - Reconnect with Ayappa'),
    )
    return out


# ----------------------------------------------------------------------
# Doc 2 — SGH Pilot Proposal
# ----------------------------------------------------------------------

def build_pilot_proposal():
    out = HERE / 'SGH_Pilot_Proposal.pdf'
    doc = SimpleDocTemplate(
        str(out),
        pagesize=A4,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=1.8 * cm,
        bottomMargin=2.0 * cm,
        title='Sarawak MedChain x SGH - Pilot Proposal',
        author='Randy Richard',
    )
    s = make_styles()
    flow = []

    flow.append(Paragraph('Pilot Proposal', s['title']))
    flow.append(Paragraph(
        'Sarawak MedChain &nbsp;&times;&nbsp; Sarawak General Hospital &nbsp;|&nbsp; '
        '4 weeks &nbsp;|&nbsp; Zero cost to SGH',
        s['subtitle'],
    ))

    flow.append(kv_table([
        ['Prepared by', 'Randy Richard, Founder, MedChain Enterprise'],
        ['Date', 'June 2026'],
        ['Status', 'Draft v1 - to be refined after meeting with Dr Steve and SGH stakeholders'],
        ['Cost to SGH', 'RM 0'],
    ], col_widths=[3.5 * cm, 12.5 * cm]))

    flow.append(Paragraph('Objective', s['h2']))
    flow.append(Paragraph(
        'Validate that patient-controlled medical records work in a real clinical '
        'setting at SGH, measuring doctor adoption, patient comprehension, and '
        'technical reliability over a 4-week period.',
        s['body'],
    ))
    flow.append(Paragraph(
        'This is a <b>parallel pilot</b> &mdash; it does not replace or interfere with '
        "SGH's existing record system. Clinical decisions during the pilot continue to "
        "rely on SGH's primary system.",
        s['body'],
    ))

    flow.append(Paragraph('Scope', s['h2']))
    flow.append(header_table([
        ['Dimension', 'v1 Pilot'],
        ['Duration', '4 weeks'],
        ['Doctors', '3, from a single department (suggested: General Medicine or any clinic Dr Steve oversees)'],
        ['Patients', '20 consenting outpatients'],
        ['Records', 'Outpatient consultation notes (text + simple attachments)'],
        ['Site', 'One SGH clinic, single specialty'],
        ['Cost to SGH', 'RM 0 - all infrastructure covered by MedChain Enterprise'],
    ], col_widths=[3.5 * cm, 12.5 * cm]))

    flow.append(Paragraph('What SGH Provides', s['h2']))
    flow.append(bullet_list([
        '3 doctor accounts (we verify on-chain via the admin role)',
        '20 willing patients recruited with informed consent',
        'One small meeting room for ~2 hours of patient onboarding',
        'Departmental sign-off from Dr Steve (or designated supervisor)',
        '1 nominated SGH IT contact for technical liaison (~1 hour/week)',
    ], s['bullet']))

    flow.append(Paragraph('What MedChain Enterprise Provides', s['h2']))
    flow.append(bullet_list([
        'The full platform &mdash; smart contract, backend, frontend',
        'One 90-minute training session for the 3 doctors',
        'On-site patient onboarding (MetaMask wallet setup + walkthrough) &mdash; Randy on-premises Day 1',
        'Ongoing technical support throughout the 4 weeks (WhatsApp + email)',
        'Weekly status reports to Dr Steve',
        'Final report (clinical, technical, UX findings) at end of pilot',
        'All cloud, IPFS pinning, and RPC infrastructure costs',
    ], s['bullet']))

    flow.append(PageBreak())

    flow.append(Paragraph('Success Metrics', s['h2']))
    flow.append(header_table([
        ['Metric', 'Target'],
        ['Records uploaded per consulted patient', '>= 80%'],
        ['Platform uptime during clinic hours', '>= 99%'],
        ['Patient access-grant events logged', '>= 50 across pilot'],
        ['Doctor satisfaction (NPS, end of pilot)', '>= 7/10'],
        ['Unauthorised access incidents', '0'],
    ], col_widths=[10 * cm, 6 * cm]))

    flow.append(Paragraph('Out of Scope (deliberately deferred to v2)', s['h2']))
    flow.append(bullet_list([
        "Integration with SGH's existing HIS/EMR (v1 is parallel, manual entry)",
        'Inpatient or emergency department workflows',
        'Imaging / DICOM / lab results',
        'Insurance claim integration',
        'Multi-hospital network features',
    ], s['bullet']))
    flow.append(Paragraph(
        "We're deliberately keeping v1 small so the team can finish it, learn from it, "
        'and present a real result &mdash; not get stuck negotiating a big-bang '
        'integration.',
        s['body'],
    ))

    flow.append(Paragraph('Risk &amp; Safety', s['h2']))
    flow.append(bullet_list([
        "<b>Parallel system, not replacement.</b> SGH's existing records remain the "
        'source of clinical truth during pilot. MedChain entries are a copy for evaluation.',
        '<b>Informed consent.</b> Each pilot patient signs a consent form '
        '(joint MedChain + SGH MAC review) before being onboarded.',
        '<b>PDPA 2010 compliance.</b> All patient data stored on infrastructure '
        'located in Malaysia. Encryption keys are held by the patient (via MetaMask), '
        'not by us.',
        '<b>Withdrawal at any time.</b> Any patient or doctor can withdraw without '
        'explanation. Their data is revoked on-chain immediately.',
        '<b>Open-source contract.</b> The smart contract source is published &mdash; '
        'SGH IT can audit it before pilot start.',
    ], s['bullet']))

    flow.append(PageBreak())

    flow.append(Paragraph('Timeline (after SGH approval)', s['h2']))
    flow.append(header_table([
        ['Week', 'Activity'],
        ['Week -2', 'Joint sign-off on consent form. SGH MAC review (if required).'],
        ['Week -1', 'Patient recruitment by SGH. Doctor onboarding (90-min session).'],
        ['Week 1', 'Pilot start. Randy on-site Day 1 for patient onboarding. Daily check-ins.'],
        ['Week 2', 'First weekly report to Dr Steve. Mid-week support call.'],
        ['Week 3', 'Mid-pilot review meeting. Adjustments if needed.'],
        ['Week 4', 'Final week. Doctor + patient NPS surveys collected.'],
        ['Week +1', 'Final report delivered to Dr Steve and SDEC.'],
    ], col_widths=[2.5 * cm, 13.5 * cm]))

    flow.append(Paragraph('What Happens After the Pilot', s['h2']))
    flow.append(Paragraph(
        'The joint outcome &mdash; pilot report &mdash; is delivered to '
        '<b>Dr Steve, SGH leadership, and SDEC</b>. It informs whether and how to '
        'design a Phase 2:',
        s['body'],
    ))
    flow.append(bullet_list([
        'Larger department, more doctors and patients?',
        'HIS/EMR integration as a real project?',
        'Cross-hospital portability (Miri &harr; Kuching &harr; Sibu)?',
    ], s['bullet']))
    flow.append(Paragraph(
        'Phase 2 is a separate conversation with separate sign-off. No commitment is '
        'implied by participating in the pilot.',
        s['body'],
    ))

    flow.append(Paragraph('Single-Page Summary', s['h2']))
    flow.append(Paragraph("""
    SGH lends us <b>3 doctors + 20 patients + 1 small clinic</b> for 4 weeks.<br/>
    We bring <b>the platform, the training, and the support &mdash; at no cost</b>.<br/>
    At the end, everyone gets <b>a clean report on what worked and what didn't</b>.<br/>
    If it didn't work, we walk away clean. If it did, SDEC and SGH have a real data
    point to plan Phase 2 from.
    """, s['quote']))

    flow.append(Paragraph('Contact', s['h2']))
    flow.append(Paragraph(
        '<b>Randy Richard</b><br/>'
        'Founder, MedChain Enterprise<br/>'
        '[your phone]<br/>'
        'randyrjm99@gmail.com<br/>'
        'https://sarawak-medchain.pages.dev',
        s['body'],
    ))

    doc.build(
        flow,
        onFirstPage=make_footer('Pilot Proposal - Sarawak MedChain x SGH'),
        onLaterPages=make_footer('Pilot Proposal - Sarawak MedChain x SGH'),
    )
    return out


# ----------------------------------------------------------------------
# Doc 3 — Wednesday Checklist
# ----------------------------------------------------------------------

def build_wednesday_checklist():
    out = HERE / 'Wednesday_Checklist.pdf'
    doc = SimpleDocTemplate(
        str(out),
        pagesize=A4,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=1.8 * cm,
        bottomMargin=2.0 * cm,
        title='Wednesday 3 June - Game Plan',
        author='Randy Richard',
    )
    s = make_styles()
    flow = []

    flow.append(Paragraph('Wednesday 3 June 2026', s['title']))
    flow.append(Paragraph(
        'Game plan &mdash; SSM Miri morning, SDEC email afternoon. '
        'Hari Gawai is Mon-Tue (1-2 Jun), SSM closed both days. Wed is your unblock day.',
        s['subtitle'],
    ))

    flow.append(Paragraph('MORNING - SSM MIRI (8:15 AM)', s['eyebrow']))
    flow.append(kv_table([
        ['Location', 'Tingkat 2, Wisma Pelita Tunku, Jalan Padang, 98000 Miri'],
        ['Bring', 'MyKAD'],
        ['Arrive by', '8:15 AM (no queue)'],
        ['Phone', '085-432 611 (call ahead if unsure)'],
    ], col_widths=[3.5 * cm, 12.5 * cm]))

    flow.append(Paragraph('Step 1 &mdash; Activate SSM4U account', s['h3']))
    flow.append(Paragraph('At the counter, say:', s['body']))
    flow.append(Paragraph(
        '<i>"Saya nak aktifkan akaun SSM4U."</i>',
        s['quote'],
    ))
    flow.append(Paragraph(
        'Thumbprint scan &mdash; done in ~10 minutes. The red "Unverified" tag on '
        'your dashboard turns off.',
        s['body'],
    ))

    flow.append(Paragraph('Step 2 &mdash; Register MedChain Enterprise (same trip if possible)', s['h3']))
    flow.append(Paragraph('Ask the counter:', s['body']))
    flow.append(Paragraph(
        '<i>"Boleh saya terus daftar Pendaftaran Perniagaan Baru sekarang?"</i>',
        s['quote'],
    ))
    flow.append(Paragraph(
        'If yes, do it there. If no, log into ezBiz at home &mdash; which now works '
        "because you're activated.",
        s['body'],
    ))

    flow.append(Paragraph('Have these ready:', s['h3']))
    flow.append(Paragraph('<b>Business name (in priority order):</b>', s['body']))
    flow.append(bullet_list([
        'MedChain Enterprise (primary)',
        'MedChain Ventures',
        'MedChain Solutions',
        'Cipher MedChain Enterprise',
    ], s['bullet']))

    flow.append(kv_table([
        ['Business type', 'Trade Name (RM 60 / year)'],
        ['MSIC code', '62019 - Computer programming activities'],
        ['Alt MSIC', '63111 - Data processing, hosting and related activities'],
        ['Business address', 'Your Miri address'],
        ['Duration', '1 year'],
        ['Payment', 'Debit / credit card or cash (~RM 60)'],
    ], col_widths=[3.5 * cm, 12.5 * cm]))

    flow.append(Paragraph('Walk out with:', s['h3']))
    flow.extend(checkbox_list([
        'Borang D (Business Registration Certificate)',
        'Maklumat Perniagaan (Business Info printout)',
    ], s['body']))

    flow.append(PageBreak())

    flow.append(Paragraph('LUNCH - SCAN &amp; ORGANISE', s['eyebrow']))
    flow.append(Paragraph(
        'Scan Borang D and Maklumat Perniagaan to PDF using CamScanner, Adobe Scan, '
        'or your phone\'s Notes app. Save them somewhere easy to attach to email '
        '(Google Drive or local Downloads folder).',
        s['body'],
    ))

    flow.append(Paragraph('AFTERNOON - FIRE THE SDEC EMAIL', s['eyebrow']))
    flow.append(bullet_list([
        'Open <b>SDEC_Ayappa_Email.pdf</b> from templates/ &mdash; copy the email body',
        'Compose new email to Ayappa',
        'Fill in [your phone] placeholder with your actual number',
        'Attach: SarawakMedChain_OnePager.pdf, SGH_Pilot_Proposal.pdf, Borang D scan',
        '<b>Send between 2 PM and 4 PM</b> &mdash; best response rates for Malaysian '
        'government office emails',
        'Do NOT CC anyone else &mdash; keep the conversation 1:1 with Ayappa for now',
    ], s['bullet']))

    flow.append(Paragraph('END-OF-DAY CHECKLIST', s['eyebrow']))
    flow.extend(checkbox_list([
        'SSM4U account: activated, no more "Unverified" tag',
        'MedChain Enterprise: registered, Borang D in hand',
        'SDEC email: sent to Ayappa',
        'All attachments verified opened correctly before send',
    ], s['body']))

    flow.append(Paragraph('WHAT TO EXPECT NEXT', s['eyebrow']))
    flow.append(header_table([
        ['When', 'What'],
        ['Wed PM', 'Email sent'],
        ['Thu-Fri', "Maybe a quick reply from Ayappa with Dr Steve's details"],
        ['Next week', "Support letter request enters SDEC's internal review"],
        ['Within 1-2 weeks', 'Support letter issued (typical SDEC turnaround)'],
        ['Then', 'Email SGH corporate comms with SDEC letter + pitch + pilot proposal'],
    ], col_widths=[3.5 * cm, 12.5 * cm]))

    flow.append(Paragraph(
        "If you don't hear back from Ayappa by <b>Tue 9 Jun</b>, send the soft "
        'follow-up from SDEC_Ayappa_Email.pdf.',
        s['body'],
    ))

    flow.append(Paragraph('FILES IN templates/ YOU\'LL USE WEDNESDAY', s['eyebrow']))
    flow.append(header_table([
        ['File', 'Purpose'],
        ['SDEC_Ayappa_Email.pdf', 'Email body to copy-paste into Gmail'],
        ['SGH_Pilot_Proposal.pdf', 'Attach to the email'],
        ['SarawakMedChain_OnePager.pdf', 'Attach to the email'],
        ['Wednesday_Checklist.pdf', 'This file - print it if helpful'],
    ], col_widths=[6.5 * cm, 9.5 * cm]))

    doc.build(
        flow,
        onFirstPage=make_footer('Wednesday 3 June Game Plan'),
        onLaterPages=make_footer('Wednesday 3 June Game Plan'),
    )
    return out


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------

def main():
    print('Building SDEC outreach package...')
    print()

    outputs = [
        build_sdec_email(),
        build_pilot_proposal(),
        build_wednesday_checklist(),
    ]

    print('Done. Created:')
    for path in outputs:
        size_kb = path.stat().st_size / 1024
        print(f'  {path.name}  ({size_kb:.1f} KB)')
    print()
    print(f'Folder: {HERE}')


if __name__ == '__main__':
    main()
