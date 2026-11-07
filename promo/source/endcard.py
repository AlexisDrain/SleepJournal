# The last 3 seconds of each app preview (886 × 1920): the app's name and the music credit,
# which the music's licence (CC BY 4.0) requires. Needs out/icon.png (made for the art).
from PIL import Image, ImageDraw, ImageFont

W, H = 886, 1920
F = 'C:/Windows/Fonts/'
bold = lambda px: ImageFont.truetype(F + 'segoeuib.ttf', px)
regular = lambda px: ImageFont.truetype(F + 'segoeui.ttf', px)

img = Image.new('RGB', (W, H))
d = ImageDraw.Draw(img)
top, bottom = (0x1c, 0x20, 0x46), (0x0e, 0x11, 0x20)
for y in range(H):
    k = y / (H - 1)
    d.line(((0, y), (W, y)), fill=tuple(int(a + (b - a) * k) for a, b in zip(top, bottom)))

def centered(y, text, font, fill):
    w = d.textlength(text, font=font)
    d.text(((W - w) / 2, y), text, font=font, fill=fill)

icon = Image.open('out/icon.png').convert('RGBA').resize((240, 240), Image.LANCZOS)
mask = Image.new('L', icon.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, 239, 239), radius=56, fill=255)
img.paste(icon, ((W - 240) // 2, 560), mask)

centered(850, '1-Minute', bold(48), (0xff, 0xc4, 0x7a))
centered(915, 'Sleep', bold(96), (0xe8, 0xea, 0xf6))
centered(1025, 'Journal', bold(96), (0xff, 0xc4, 0x7a))
centered(1175, 'Two quick check-ins a day', regular(40), (0xb9, 0xbe, 0xe0))

# The credit, in the words the licence asks for.
muted = (0x9a, 0xa0, 0xc8)
for i, line in enumerate(['Music: "Inspired" Kevin MacLeod (incompetech.com)',
                          'Licensed under Creative Commons: By Attribution 4.0 License',
                          'http://creativecommons.org/licenses/by/4.0/']):
    centered(1560 + i * 44, line, regular(29), muted)

img.save('out/endcard.png')
print(img.size)
