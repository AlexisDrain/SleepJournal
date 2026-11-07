# Joins the art captured in two halves (anything wider than 4096 pixels, see art.mjs) into one picture.
import glob, os
from PIL import Image
for left in sorted(glob.glob('out/*.half0.png')):
    right = left.replace('.half0', '.half1')
    a, b = Image.open(left), Image.open(right)
    whole = Image.new('RGB', (a.width + b.width, a.height))
    whole.paste(a, (0, 0)); whole.paste(b, (a.width, 0))
    whole.save(left.replace('.half0', ''))
    os.remove(left); os.remove(right)
    print(left.replace('.half0', ''), whole.size)
