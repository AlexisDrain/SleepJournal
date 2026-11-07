# Turns the raw app captures (shoot.mjs) into App Store screenshots (1179 × 2556):
#  plain/    the app as on an iPhone: status bar with the Dynamic Island on top, home bar below
#  captioned/ the same, smaller, under a one-line caption on the app's colors
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = 3  # pixels per point
W, H = 393 * S, 852 * S
TOP, BOTTOM = 59 * S, 34 * S
F = 'C:/Windows/Fonts/'
semibold = lambda pt: ImageFont.truetype(F + 'seguisb.ttf', int(pt * S))
bold = lambda pt: ImageFont.truetype(F + 'segoeuib.ttf', int(pt * S))

CAPTIONS = {
    '01-bedtime': ('A sleep diary', 'in a minute a day'),
    '02-stats': ('Watch your sleep', 'get better'),
    '03-nights': ('Night by night,', 'ready for your therapist'),
    '04-cbti': ('Doing CBT-I?', 'Its questions are built in'),
    '05-routines': ('Routines for bedtime', 'and the morning'),
    '06-dreams': ('Write down your dreams', 'and read them back'),
    '07-sheet': ('Your journal', 'as a spreadsheet'),
    '08-sync': ('Sync with your own', 'private Google Sheet'),
    '09-private': ('No account, no ads:', 'it stays on your phone'),
    '10-light': ('Dark or light,', 'for night and day'),
}

def status_bar(img, fg):
    d = ImageDraw.Draw(img)
    # Dynamic Island
    iw, ih, iy = 126 * S, 37 * S, 11 * S
    d.rounded_rectangle(((W - iw) // 2, iy, (W + iw) // 2, iy + ih), radius=ih // 2, fill='black')
    cy = iy + ih // 2
    # time, centered in the left "ear"
    f = semibold(17)
    t = '9:41'
    tw = d.textlength(t, font=f)
    d.text((76 * S - tw / 2, cy), t, font=f, fill=fg, anchor='lm')
    # signal: four bars
    x = W - 107 * S
    for i, h in enumerate([4, 6.5, 9, 11.5]):
        d.rounded_rectangle((x + i * 5 * S, cy + (5.75 - h) * S, x + i * 5 * S + 3 * S, cy + 5.75 * S), radius=S, fill=fg)
    # wi-fi: three arcs
    wx, wy = W - 77 * S, cy + 5 * S
    for r in (4, 8, 12):
        d.arc((wx - r * S, wy - r * S, wx + r * S, wy + r * S), 225, 315, fill=fg, width=int(2.4 * S))
    d.ellipse((wx - 1.6 * S, wy - 2.6 * S, wx + 1.6 * S, wy + 0.6 * S), fill=fg)
    # battery
    bx, bw, bh = W - 59 * S, 25 * S, 12 * S
    d.rounded_rectangle((bx, cy - bh / 2, bx + bw, cy + bh / 2), radius=4 * S, outline=fg, width=S)
    d.rounded_rectangle((bx + 2 * S, cy - bh / 2 + 2 * S, bx + bw - 2 * S, cy + bh / 2 - 2 * S), radius=2.5 * S, fill=fg)
    d.rounded_rectangle((bx + bw + 1.5 * S, cy - 2 * S, bx + bw + 3 * S, cy + 2 * S), radius=S, fill=fg)

def device(raw, light):
    app = Image.open(raw).convert('RGB')
    img = Image.new('RGB', (W, H))
    img.paste(app.getpixel((5, 2)), (0, 0, W, TOP))  # the screen's own top color (a dimmed list under a panel too)
    img.paste(app, (0, TOP))
    img.paste(app.getpixel((5, app.height - 2)), (0, TOP + app.height, W, H))  # the tab bar runs on under the home bar
    fg = (20, 22, 40) if light else (255, 255, 255)
    status_bar(img, fg)
    d = ImageDraw.Draw(img)
    hw = 134 * S
    d.rounded_rectangle(((W - hw) // 2, H - 13 * S, (W + hw) // 2, H - 8 * S), radius=3 * S, fill=fg)
    return img

def captioned(shot, lines):
    bg_top, bg_bottom = (24, 28, 58), (10, 12, 26)
    img = Image.new('RGB', (W, H))
    grad = ImageDraw.Draw(img)
    for y in range(H):
        k = y / H
        grad.line(((0, y), (W, y)), fill=tuple(int(a + (b - a) * k) for a, b in zip(bg_top, bg_bottom)))
    # a soft glow of the app's accent behind the phone
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse((-200, 700, W + 200, 2300), fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(220))
    img.paste(Image.new('RGB', (W, H), (159, 168, 255)), (0, 0), glow)
    d = ImageDraw.Draw(img)
    size = 30  # smaller if a line doesn't fit, with a margin on each side
    while max(d.textlength(l, font=bold(size)) for l in lines) > W - 2 * 28 * S: size -= 1
    f = bold(size)
    y = 62 * S
    for i, line in enumerate(lines):
        d.text((W / 2, y + i * 40 * S), line, font=f, fill=(255, 196, 122) if i == 0 else (232, 234, 246), anchor='mt')
    # the phone: the screenshot, smaller, with rounded corners and a thin frame
    scale = 0.76
    pw, ph = int(W * scale), int(H * scale)
    phone = shot.resize((pw, ph), Image.LANCZOS)
    r = 47 * S * scale
    mask = Image.new('L', (pw, ph), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw - 1, ph - 1), radius=r, fill=255)
    px, py = (W - pw) // 2, H - ph - 34 * S
    shadow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((px, py + 20, px + pw, py + ph + 20), radius=r, fill=160)
    img.paste((0, 0, 0), (0, 0, W, H), shadow.filter(ImageFilter.GaussianBlur(40)))
    border = 4 * S
    d.rounded_rectangle((px - border, py - border, px + pw + border, py + ph + border), radius=r + border, fill=(48, 54, 92))
    img.paste(phone, (px, py), mask)
    return img

os.makedirs('out/plain', exist_ok=True)
os.makedirs('out/captioned', exist_ok=True)
for name, lines in CAPTIONS.items():
    shot = device(f'raw/{name}.png', light=name == '10-light')
    shot.save(f'out/plain/{name}.png')
    captioned(shot, lines).save(f'out/captioned/{name}.png')
    print(name)
