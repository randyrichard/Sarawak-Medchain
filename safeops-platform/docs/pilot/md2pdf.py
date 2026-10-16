"""
Renders a markdown file to PDF with reportlab.

    python md2pdf.py <input.md> <output.pdf> ["Document title"]

Handles the constructs these documents actually use: headings, paragraphs, bold, inline
code, bullet and numbered lists, pipe tables, fenced code blocks and horizontal rules.
Deliberately small; it is not a general markdown engine.
"""
import html
import re
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (HRFlowable, KeepTogether, PageBreak, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

TEAL = colors.HexColor("#0f766e")
GREY = colors.HexColor("#555555")
RULE = colors.HexColor("#dddddd")

ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Heading1"], fontSize=17, leading=21, spaceAfter=10,
                    textColor=TEAL)
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontSize=12.5, leading=16, spaceBefore=15,
                    spaceAfter=6, textColor=colors.HexColor("#111111"))
H3 = ParagraphStyle("H3", parent=ss["Heading3"], fontSize=10.8, leading=14, spaceBefore=11,
                    spaceAfter=4, textColor=colors.HexColor("#333333"))
BODY = ParagraphStyle("BODY", parent=ss["Normal"], fontSize=9.4, leading=13.6, spaceAfter=7)
ITEM = ParagraphStyle("ITEM", parent=BODY, leftIndent=13, bulletIndent=3, spaceAfter=4)
CODE = ParagraphStyle("CODE", parent=ss["Code"], fontSize=8.4, leading=11.6,
                      leftIndent=8, textColor=colors.HexColor("#1a1a1a"))
CELL = ParagraphStyle("CELL", parent=ss["Normal"], fontSize=8.3, leading=11.2)
CELLB = ParagraphStyle("CELLB", parent=CELL, fontName="Helvetica-Bold")


def inline(text):
    """Markdown inline formatting to reportlab markup, escaping everything else."""
    out, i = [], 0
    pattern = re.compile(r'\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*')
    for m in pattern.finditer(text):
        out.append(html.escape(text[i:m.start()]))
        if m.group(1) is not None:
            # recurse, so inline code inside bold still renders as code
            out.append("<b>%s</b>" % inline(m.group(1)))
        elif m.group(2) is not None:
            out.append('<font face="Courier" size="8.6" color="#9a3412">%s</font>'
                       % html.escape(m.group(2)))
        else:
            out.append("<i>%s</i>" % html.escape(m.group(3)))
        i = m.end()
    out.append(html.escape(text[i:]))
    return "".join(out)


def build(md):
    flow, lines, n = [], md.split("\n"), 0
    while n < len(lines):
        ln = lines[n]
        s = ln.strip()

        if not s:
            n += 1
            continue

        if s.startswith("```"):                                  # fenced code
            n += 1
            buf = []
            while n < len(lines) and not lines[n].strip().startswith("```"):
                buf.append(lines[n])
                n += 1
            n += 1
            body = "<br/>".join(html.escape(b) or "&nbsp;" for b in buf)
            t = Table([[Paragraph(body, CODE)]], colWidths=[165 * mm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f6f7f8")),
                ("BOX", (0, 0), (-1, -1), 0.4, RULE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]))
            flow += [t, Spacer(1, 7)]
            continue

        if re.match(r"^---+$", s):                               # horizontal rule
            flow += [Spacer(1, 5), HRFlowable(width="100%", color=RULE, thickness=0.6),
                     Spacer(1, 7)]
            n += 1
            continue

        m = re.match(r"^(#{1,3})\s+(.*)$", s)                    # headings
        if m:
            style = (H1, H2, H3)[len(m.group(1)) - 1]
            flow.append(Paragraph(inline(m.group(2)), style))
            n += 1
            continue

        if s.startswith("|") and n + 1 < len(lines) and re.match(r"^\|[\s:\-|]+\|$",
                                                                 lines[n + 1].strip()):
            rows = []                                            # pipe table
            header = [c.strip() for c in s.strip("|").split("|")]
            rows.append([Paragraph(inline(c), CELLB) for c in header])
            n += 2
            while n < len(lines) and lines[n].strip().startswith("|"):
                cells = [c.strip() for c in lines[n].strip().strip("|").split("|")]
                cells += [""] * (len(header) - len(cells))
                rows.append([Paragraph(inline(c), CELL) for c in cells[:len(header)]])
                n += 1
            cols = len(header)
            first = 42 * mm if cols > 1 else 165 * mm
            widths = [first] + [(165 * mm - first) / (cols - 1)] * (cols - 1) if cols > 1 \
                else [165 * mm]
            t = Table(rows, colWidths=widths, repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f2f4")),
                ("GRID", (0, 0), (-1, -1), 0.3, RULE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            flow += [t, Spacer(1, 9)]
            continue

        m = re.match(r"^[-*]\s+(.*)$", s)                        # bullet
        if m:
            text = m.group(1)
            n += 1
            while n < len(lines) and lines[n].startswith("  ") and lines[n].strip() \
                    and not re.match(r"^\s*[-*\d]", lines[n].strip()):
                text += " " + lines[n].strip()
                n += 1
            flow.append(Paragraph(inline(text), ITEM, bulletText="\u2022"))
            continue

        m = re.match(r"^(\d+)\.\s+(.*)$", s)                     # numbered
        if m:
            num, text = m.group(1), m.group(2)
            n += 1
            while n < len(lines) and lines[n].startswith("  ") and lines[n].strip() \
                    and not re.match(r"^\s*[-*\d]", lines[n].strip()):
                text += " " + lines[n].strip()
                n += 1
            flow.append(Paragraph(inline(text), ITEM, bulletText="%s." % num))
            continue

        para = [s]                                               # paragraph
        n += 1
        while n < len(lines) and lines[n].strip() and \
                not re.match(r"^(#{1,3}\s|[-*]\s|\d+\.\s|\||```|---+$)", lines[n].strip()):
            para.append(lines[n].strip())
            n += 1
        flow.append(Paragraph(inline(" ".join(para)), BODY))

    return flow


def main():
    src, dst = sys.argv[1], sys.argv[2]
    title = sys.argv[3] if len(sys.argv) > 3 else "SafeChain"
    md = open(src, encoding="utf-8").read()

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(GREY)
        canvas.drawString(20 * mm, 12 * mm, title)
        canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, "Page %d" % doc.page)
        canvas.restoreState()

    doc = SimpleDocTemplate(dst, pagesize=A4, topMargin=18 * mm, bottomMargin=20 * mm,
                            leftMargin=22 * mm, rightMargin=22 * mm, title=title,
                            author="MedChain Enterprise")
    doc.build(build(md), onFirstPage=footer, onLaterPages=footer)
    print("wrote %s" % dst)


if __name__ == "__main__":
    main()
