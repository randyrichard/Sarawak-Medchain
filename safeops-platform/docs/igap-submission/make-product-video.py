"""
Builds the Product/Technology video for the iG@P submission.

A silent, captioned walkthrough: each screen of SafeChain held for a few seconds with a
caption banner, topped and tailed by a title and a closing card. Encoded as H.264 mp4,
which is what the form accepts.

    python make-product-video.py
"""
import os
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

W, H = 800, 600
BG = (11, 13, 16)
ACCENT = (56, 132, 255)
HERE = os.path.dirname(os.path.abspath(__file__))
APPENDIX = os.path.normpath(os.path.join(HERE, "..", "vdp-appendix"))
OUT = os.path.join(HERE, "SafeChain-Product-Walkthrough.mp4")


def font(size, bold=False):
    for name in (("seguisb.ttf", "segoeuib.ttf", "arialbd.ttf") if bold
                 else ("segoeui.ttf", "arial.ttf")):
        p = os.path.join("C:\\Windows\\Fonts", name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def centred(d, text, y, f, fill):
    w = d.textbbox((0, 0), text, font=f)[2]
    d.text(((W - w) / 2, y), text, font=f, fill=fill)


def card(lines):
    """A full-bleed title or closing card. lines = [(text, size, bold, colour)]."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    total = sum(s + 18 for _, s, _, _ in lines)
    y = (H - total) / 2
    for text, size, bold, colour in lines:
        centred(d, text, y, font(size, bold), colour)
        y += size + 18
    return im


def screen(path, caption):
    """A screenshot on the canvas with a caption banner across the bottom."""
    im = Image.new("RGB", (W, H), BG)
    shot = Image.open(path).convert("RGB")
    if shot.size != (W, H):
        shot.thumbnail((W, H), Image.LANCZOS)
    im.paste(shot, ((W - shot.width) // 2, (H - shot.height) // 2))

    band = Image.new("RGBA", (W, 64), (8, 10, 13, 232))
    im.paste(Image.alpha_composite(
        im.crop((0, H - 64, W, H)).convert("RGBA"), band).convert("RGB"), (0, H - 64))
    d = ImageDraw.Draw(im)
    d.rectangle([0, H - 64, W, H - 61], fill=ACCENT)
    centred(d, caption, H - 44, font(19, True), (240, 243, 248))
    return im


SEQUENCE = [
    (card([("SafeChain", 58, True, (255, 255, 255)),
           ("Workplace safety and health management", 23, False, (170, 180, 195)),
           ("MedChain Enterprise  ·  Miri, Sarawak", 17, False, (120, 132, 150))]), 4.0),

    (screen(os.path.join(HERE, "01-incident-register.png"),
            "Every incident and near miss, most serious first"), 6.0),
    (screen(os.path.join(HERE, "02-incident-investigation.png"),
            "An investigation that moves through eight stages"), 6.0),
    (screen(os.path.join(HERE, "03-permit-to-work.png"),
            "Permits to work: hot work, confined space, height, lifting"), 6.0),
    (screen(os.path.join(HERE, "04-training-competency.png"),
            "Who is qualified for what, and what expires when"), 6.0),
    (screen(os.path.join(APPENDIX, "05-dashboard.jpg"),
            "Every site compared on one screen"), 6.0),
    (screen(os.path.join(APPENDIX, "06-monthly-safety-report.jpg"),
            "The monthly safety report, generated rather than assembled"), 6.0),

    (card([("See it for yourself", 40, True, (255, 255, 255)),
           ("safechain.schain.workers.dev", 26, True, (86, 150, 255)),
           ("Demonstration data. Sign in as any role.", 18, False, (170, 180, 195)),
           ("MedChain Enterprise  ·  randyrjm99@gmail.com", 16, False, (120, 132, 150))]), 5.0),
]

tmp = tempfile.mkdtemp(prefix="safechain-video-")
listing = os.path.join(tmp, "frames.txt")
with open(listing, "w", encoding="utf-8") as fh:
    for i, (im, secs) in enumerate(SEQUENCE):
        p = os.path.join(tmp, "f%03d.png" % i)
        im.save(p)
        fh.write("file '%s'\n" % p.replace("\\", "/"))
        fh.write("duration %.2f\n" % secs)
    fh.write("file '%s'\n" % os.path.join(tmp, "f%03d.png" % (len(SEQUENCE) - 1)).replace("\\", "/"))

ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
cmd = [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", listing,
       "-vf", "fps=25,format=yuv420p", "-c:v", "libx264", "-preset", "medium",
       "-crf", "20", "-movflags", "+faststart", OUT]
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode != 0:
    print(r.stderr[-2500:])
    raise SystemExit("encode failed")

total = sum(s for _, s in SEQUENCE)
print("wrote %s" % OUT)
print("duration %.0f s   size %.1f MB" % (total, os.path.getsize(OUT) / 1024 / 1024))
