"""Interim bee-only app icon cut from the founder-approved Lovart wordmark.
Only letterform strokes that overlap the bee (the 'a' bowl, the 'k' stem above
the bee's waist, and neighbouring letters) are painted out with the logo's own
background colour. Bee pixels are not redrawn or recoloured.
Replace with the illustrator's standalone transparent export when available."""
import sys, math
from PIL import Image, ImageDraw

src, outdir = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
bg = im.getpixel((5, 5))
mask = Image.new('L', im.size, 0)
d = ImageDraw.Draw(mask)
# 'a' bowl (band under the head + left/bottom crescent)
d.polygon([(186,176),(192,175),(198,172),(205,170),(215,165),(230,163),(236,164),(240,172),(240,180),(230,178),(220,179),
           (210,181),(204,183),(199,187),(195,194),(196,203),(198,210),(201,215),(204,218),(203,224),(190,224),
           (180,219),(176,210),(176,192),(180,184)], fill=255)
d.rectangle([268, 99, 284, 156], fill=255)       # 'k' stem above the bee's waist
d.rectangle([380, 126, 420, 240], fill=255)      # following 'a'
d.rectangle([371, 162, 420, 240], fill=255)
d.rectangle([0, 0, 171, 341], fill=255)          # 'M'
# protect the front leg that crosses the bowl
def near_leg(x, y, a=(229.5,183.0), b=(205.0,222.5), w=2.6):
    ax, ay = a; bx, by = b
    t = max(0, min(1, ((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)))
    return math.hypot(x-(ax+t*(bx-ax)), y-(ay+t*(by-ay))) <= w
px, mp = im.load(), mask.load()
for y in range(im.size[1]):
    for x in range(im.size[0]):
        if mp[x, y] and not near_leg(x, y):
            px[x, y] = bg
# Even out the paper texture: near-background pixels become the exact background.
for y in range(im.size[1]):
    for x in range(im.size[0]):
        r, g, b = px[x, y]
        if abs(r-bg[0]) + abs(g-bg[1]) + abs(b-bg[2]) < 24:
            px[x, y] = bg
bee = im.crop((172, 84, 394, 234))
S = 1024
for name, size, scale in [('icon-1024.png', 1024, 0.78), ('icon-512.png', 512, 0.78), ('icon-192.png', 192, 0.78),
                          ('apple-touch-icon.png', 180, 0.78), ('icon-maskable-512.png', 512, 0.62), ('favicon-64.png', 64, 0.9)]:
    canvas = Image.new('RGB', (size, size), bg)
    w = int(size * scale); h = int(bee.size[1] * w / bee.size[0])
    canvas.paste(bee.resize((w, h), Image.LANCZOS), ((size - w)//2, (size - h)//2))
    canvas.save(f'{outdir}/{name}')
print('ok', bg)
