"""Draws the Sleep Journal icon set: a crescent moon with a small warm star on dark navy.

Run with Python + Pillow (pip install pillow):  python scripts/make-icons.py
Writes app/assets/*.png (phone icons) and app/public/* (web / home-screen icons).
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

APP = Path(__file__).resolve().parent.parent
NAVY_TOP, NAVY_BOTTOM = (27, 33, 80), (14, 17, 32)   # theme: a lighter navy fading to colors.bg
MOON = (159, 168, 255)                               # theme colors.night
STAR = (255, 196, 122)                               # theme colors.morning
SS = 4                                               # draw 4x larger, then shrink: smooth edges


def background(size):
    """Vertical navy gradient."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        row = tuple(round(a + (b - a) * t) for a, b in zip(NAVY_TOP, NAVY_BOTTOM))
        for x in range(size):
            px[x, y] = row
    return img


def crescent_mask(size, scale):
    """White crescent on black: a disc with an offset disc cut out. `scale` is the moon's share of the canvas."""
    big = size * SS
    r = big * scale / 2
    cx, cy = big * 0.47, big * 0.52
    disc = Image.new("L", (big, big), 0)
    ImageDraw.Draw(disc).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    cut = Image.new("L", (big, big), 0)
    ox, oy, cr = cx + r * 0.42, cy - r * 0.30, r * 0.86
    ImageDraw.Draw(cut).ellipse([ox - cr, oy - cr, ox + cr, oy + cr], fill=255)
    return ImageChops.subtract(disc, cut).resize((size, size), Image.LANCZOS)


def star_mask(size, scale):
    """A few sparkles of different sizes scattered beside the moon: a night sky, not a single star."""
    big = size * SS
    m = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(m)
    # (x offset, y offset, size), all relative to the moon's scale
    for dx, dy, s in [(0.36, -0.34, 0.085), (0.56, -0.10, 0.050), (0.22, -0.02, 0.036)]:
        cx, cy = big * (0.47 + scale * dx), big * (0.52 + scale * dy)
        long, short = big * scale * s, big * scale * s * 0.27
        draw.polygon([(cx, cy - long), (cx + short, cy - short), (cx + long, cy), (cx + short, cy + short),
                      (cx, cy + long), (cx - short, cy + short), (cx - long, cy), (cx - short, cy - short)], fill=255)
    return m.resize((size, size), Image.LANCZOS)


def artwork(size, scale, bg=True, mono=False):
    img = background(size).convert("RGBA") if bg else Image.new("RGBA", (size, size), (0, 0, 0, 0))
    moon, star = crescent_mask(size, scale), star_mask(size, scale)
    img.paste(Image.new("RGBA", (size, size), (255, 255, 255, 255) if mono else MOON + (255,)), (0, 0), moon)
    img.paste(Image.new("RGBA", (size, size), (255, 255, 255, 255) if mono else STAR + (255,)), (0, 0), star)
    return img


def save(img, rel, size=None, rgb=False):
    out = APP / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    if size:
        img = img.resize((size, size), Image.LANCZOS)
    (img.convert("RGB") if rgb else img).save(out)
    print("wrote", rel, img.size)


full = artwork(1024, 0.62)                 # iOS / Expo icon: fills the square, the OS rounds the corners
save(full, "assets/icon.png", rgb=True)
save(artwork(1024, 0.50), "assets/splash-icon.png")
# Android adaptive icon: the launcher crops to a circle/squircle, so the art stays in the middle ~60%.
save(artwork(512, 0.40, bg=False), "assets/android-icon-foreground.png")
save(background(512).convert("RGBA"), "assets/android-icon-background.png")
save(artwork(432, 0.40, bg=False, mono=True), "assets/android-icon-monochrome.png")
# Web: browser tab, "Add to Home Screen" on iPhone, and installable web app icons.
save(full, "assets/favicon.png", 48)
save(full, "public/apple-touch-icon.png", 180, rgb=True)
save(full, "public/icon-192.png", 192)
save(full, "public/icon-512.png", 512)
