# Product Hunt's gallery: two captioned iPhone screenshots side by side per picture, 2540 × 1520
# (the gallery's 1270 × 760 at 2×), as Recommendation Journal's. Writes ../producthunt/.
from PIL import Image

W, H = 2540, 1520
SHOTS = '../screenshots/iphone/'
PAIRS = [('02-stats', '03-nights'), ('04-cbti', '05-routines'), ('09-private', '10-light')]

for n, (a, b) in enumerate(PAIRS, start=2):
    left, right = (Image.open(f'{SHOTS}{s}.png').convert('RGB') for s in (a, b))
    # The background: each row takes the screenshot's own edge color, so the two blend in.
    edge = left.crop((0, 0, 4, left.height)).resize((1, H), Image.LANCZOS)
    img = edge.resize((W, H))
    for i, shot in enumerate((left, right)):
        s = shot.resize((round(shot.width * H / shot.height), H), Image.LANCZOS)
        img.paste(s, (round(W * (i + 1) / 3 - s.width / 2), 0))
    name = f'../producthunt/gallery-{n}-{a}-{b}.png'
    img.save(name)
    print(name)
