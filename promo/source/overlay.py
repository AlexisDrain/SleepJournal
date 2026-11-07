# The status bar and home bar for the app previews (886 × 1920): transparent everywhere else.
import importlib.util, sys
spec = importlib.util.spec_from_file_location('frame', 'frame.py')
src = open('frame.py', encoding='utf-8').read().split("os.makedirs('out/plain'")[0]
ns = {}
exec(src.replace('S = 3  # pixels per point', 'S = 2').replace('W, H = 393 * S, 852 * S', 'W, H = 443 * S, 960 * S'), ns)
from PIL import Image, ImageDraw
img = Image.new('RGBA', (ns['W'], ns['H']), (0, 0, 0, 0))
ns['status_bar'](img, (255, 255, 255, 255))
S, W, H = 2, ns['W'], ns['H']
d = ImageDraw.Draw(img)
hw = 134 * S
d.rounded_rectangle(((W - hw) // 2, H - 13 * S, (W + hw) // 2, H - 8 * S), radius=3 * S, fill=(255, 255, 255, 255))
img.save('preview-overlay.png')
print(img.size)
