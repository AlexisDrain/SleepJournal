# Frames raw/web-journal.png (web-shot.mjs) as a browser window with a caption, for Product Hunt's
# gallery: out/web-app-2540x1520.png (1270 × 760 at 2×, the gallery's shape).
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 2
W, H = 1270 * S, 760 * S
img = Image.new('RGB', (W, H))
top, bottom = (36, 40, 78), (14, 16, 28)  # the screenshots' background, top to bottom
d = ImageDraw.Draw(img)
for y in range(H):
    t = y / (H - 1)
    d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))

bold = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 40 * S)
reg = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 16 * S)
title = ('Computer or mobile', ': no install, no account')
w1 = d.textlength(title[0], font=bold)
w2 = d.textlength(title[1], font=bold)
x = (W - w1 - w2) / 2
d.text((x, 26 * S), title[0], font=bold, fill=(255, 196, 120))
d.text((x + w1, 26 * S), title[1], font=bold, fill=(255, 255, 255))

# The window: a title bar with three dots and the address, then the page, running off the bottom.
wx, wy, ww = 80 * S, 104 * S, 1110 * S
bar = 38 * S
r = 14 * S
shadow = Image.new('L', (W, H), 0)
ImageDraw.Draw(shadow).rounded_rectangle([wx, wy + 10 * S, wx + ww, H + r], r, fill=150)
img.paste((0, 0, 0), mask=shadow.filter(ImageFilter.GaussianBlur(24 * S)))
d = ImageDraw.Draw(img)
d.rounded_rectangle([wx, wy, wx + ww, H + r], r, fill=(44, 48, 72))
for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
    cx, cy = wx + (22 + i * 20) * S, wy + bar / 2
    d.ellipse([cx - 6 * S, cy - 6 * S, cx + 6 * S, cy + 6 * S], fill=c)
ax0, ax1 = wx + 120 * S, wx + ww - 120 * S
d.rounded_rectangle([ax0, wy + 8 * S, ax1, wy + bar - 8 * S], 11 * S, fill=(26, 29, 48))
url = 'sleep-journal.expo.app'
d.text(((ax0 + ax1) / 2 - d.textlength(url, font=reg) / 2, wy + 9 * S), url, font=reg, fill=(200, 204, 225))

page = Image.open('raw/web-journal.png').convert('RGB')
page = page.resize((ww, round(page.height * ww / page.width)), Image.LANCZOS)
page = page.crop((0, 0, ww, H - wy - bar))
img.paste(page, (wx, wy + bar))
img.save('out/web-app-2540x1520.png')
print('out/web-app-2540x1520.png')
