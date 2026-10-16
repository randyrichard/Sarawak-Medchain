"""Generates the Technology Ownership declaration as a PDF for the iG@P submission."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

OUT = "MedChain-Enterprise-Technology-Ownership-Declaration.pdf"

ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontSize=15, spaceAfter=4, textColor=colors.HexColor("#0f766e"))
SUB = ParagraphStyle("SUB", parent=ss["Normal"], fontSize=9.5, textColor=colors.HexColor("#555555"), spaceAfter=12)
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontSize=11, spaceBefore=12, spaceAfter=5)
BODY = ParagraphStyle("BODY", parent=ss["Normal"], fontSize=9.6, leading=14, spaceAfter=7)
ITEM = ParagraphStyle("ITEM", parent=BODY, leftIndent=14, spaceAfter=6)

doc = SimpleDocTemplate(OUT, pagesize=A4, topMargin=18*mm, bottomMargin=18*mm,
                        leftMargin=20*mm, rightMargin=20*mm,
                        title="Declaration of Technology Ownership",
                        author="MedChain Enterprise")
S = []
S.append(Paragraph("Declaration of Technology Ownership", H1))
S.append(Paragraph("SafeChain workplace safety and health management platform", SUB))

rows = [
    ["Declarant", "Randy Richard"],
    ["Business", "MedChain Enterprise"],
    ["Legal form", "Sole proprietorship (enterprise)"],
    ["Registration number", "MRI/BNR/718/2026"],
    ["Registered", "30 June 2026, Miri, Sarawak"],
    ["Technology", "SafeChain"],
    ["Type", "Software"],
    ["Ownership declared", "Own Technology"],
]
t = Table(rows, colWidths=[42*mm, 118*mm])
t.setStyle(TableStyle([
    ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("TEXTCOLOR", (0,0), (0,-1), colors.HexColor("#333333")),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ("TOPPADDING", (0,0), (-1,-1), 5),
    ("LINEBELOW", (0,0), (-1,-2), 0.25, colors.HexColor("#dddddd")),
    ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#cccccc")),
]))
S.append(t)

S.append(Paragraph("1. The technology", H2))
S.append(Paragraph(
    "SafeChain is a workplace safety and health management platform supplied as a hosted "
    "subscription service. It covers incident reporting and investigation, corrective action "
    "tracking, permit to work, asset and equipment inspections, training and competency records, "
    "contractor and visitor control, audits, and consolidated safety reporting.", BODY))

S.append(Paragraph("2. Declaration", H2))
S.append(Paragraph("I, Randy Richard, being the sole proprietor of MedChain Enterprise, declare that:", BODY))
for n, text in enumerate([
    "I am the sole author and developer of the SafeChain platform. The design, source code, "
    "data model, safety workflows, permission and tenant separation design, report generation "
    "and user interface were created by me.",
    "MedChain Enterprise owns all intellectual property rights subsisting in the SafeChain "
    "platform, including copyright in its source code.",
    "The business is not an agent, reseller, distributor or licensee of any third party in "
    "respect of this technology. No part of the platform is licensed in from another vendor.",
    "No third party holds or claims any right, title or interest in the platform. There is no "
    "investor, employer, client, educational institution, joint venture partner or outsourced "
    "development house with a claim over it.",
    "The platform was not developed under any contract of employment, research grant, "
    "scholarship or commissioning agreement that would vest rights in another party.",
    "No patent, trade mark, industrial design or other registration has been filed in respect "
    "of the platform. Protection is asserted through copyright in the source code, which "
    "subsists automatically.",
    "MedChain Enterprise is accordingly free to supply, license and deploy the platform "
    "commercially without the consent of any other party.",
], 1):
    S.append(Paragraph("<b>%d.</b>&nbsp;&nbsp;%s" % (n, text), ITEM))

S.append(Paragraph("3. Third-party open-source components", H2))
S.append(Paragraph(
    "SafeChain is built upon publicly available open-source components, used under their own "
    "licences in the ordinary way. These components are not owned by MedChain Enterprise and no "
    "ownership of them is claimed. None of the licences below restricts commercial supply of a "
    "product built with them, and none requires the disclosure of SafeChain's own source code.", BODY))

lic = [["Component", "Version", "Licence"],
       ["React and React DOM", "18.3.1", "MIT"],
       ["React Router", "6.30.4", "MIT"],
       ["Vite", "5.4.21", "MIT"],
       ["Tailwind CSS", "3.4.19", "MIT"],
       ["TypeScript", "5.9.3", "Apache-2.0"],
       ["Express", "4.22.3", "MIT"],
       ["Prisma Client", "5.22.0", "Apache-2.0"],
       ["PDFKit", "0.19.1", "MIT"],
       ["Zod", "3.25.76", "MIT"],
       ["Helmet", "8.3.0", "MIT"],
       ["Nodemailer", "10.0.13", "MIT-0"],
       ["PostgreSQL", "16", "PostgreSQL Licence"]]
lt = Table(lic, colWidths=[70*mm, 30*mm, 60*mm])
lt.setStyle(TableStyle([
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 8.6),
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#f0f0f0")),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ("TOPPADDING", (0,0), (-1,-1), 4),
    ("GRID", (0,0), (-1,-1), 0.25, colors.HexColor("#dddddd")),
]))
S.append(lt)
S.append(Spacer(1, 6*mm))

S.append(Paragraph("4. Signature", H2))
S.append(Paragraph(
    "I declare that the information given above is true and complete to the best of my knowledge.", BODY))
S.append(Spacer(1, 12*mm))
sig = [["Signature", "________________________________"],
       ["Name", "Randy Richard"],
       ["Designation", "Founder and Sole Proprietor, MedChain Enterprise"],
       ["Date", "______________________"]]
st = Table(sig, colWidths=[32*mm, 128*mm])
st.setStyle(TableStyle([
    ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ("TOPPADDING", (0,0), (-1,-1), 7),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
]))
S.append(st)

doc.build(S)
print("wrote", OUT)
