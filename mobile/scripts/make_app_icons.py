"""Build every app icon from the founder's icon design (web/assets/app-icon-design.webp).

The design is used as supplied: the mark is cropped from the left half of the file and
only resized (high-quality resampling plus a light sharpen) and centred — no shapes or
colours are changed. Run from the repository root:  python3 mobile/scripts/make_app_icons.py

For a crisper store icon, replace app-icon-design.webp with a higher-resolution or vector
export of the same design and run this again.
"""
from PIL import Image, ImageDraw, ImageFilter

SRC = 'web/assets/app-icon-design.webp'
CREAM = (253, 245, 240)          # the design's own background
MIDNIGHT = (11, 11, 13)
MARK_BOX = (24, 164, 252, 339)   # the mark on the left of the design file, with its margin

design = Image.open(SRC).convert('RGB')
assert design.size == (512, 512), design.size
mark = design.crop(MARK_BOX)


def tile(size, mark_width_frac, bg=CREAM):
    """Square, opaque icon: the stores apply their own rounded mask."""
    w = int(size * mark_width_frac)
    h = round(w * mark.height / mark.width)
    m = mark.resize((w, h), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
    out = Image.new('RGB', (size, size), bg)
    out.paste(m, ((size - w) // 2, (size - h) // 2))
    return out


# Same proportion as the founder's rounded-tile mock-up: the mark spans ~86% of the tile.
icon = tile(1024, 0.86)
icon.save('web/assets/icon-1024.png')
icon.save('mobile/assets/icon.png')

# Android adaptive icon: launchers show only the central 66.7% of this layer, and only a
# 61% circle is guaranteed. The mark's farthest points are the side hexagons' outer tips
# (its bounding-box corners are empty), so at 58% width it stays inside the safe circle
# and fills ~87% of what the launcher shows — the same proportion as the iOS tile.
tile(1024, 0.58).save('mobile/assets/adaptive-icon.png')

# Splash: the founder's rounded cream tile on midnight charcoal (the dark M would vanish
# directly on a dark background).
s = 512
t = tile(s, 0.86)
mask = Image.new('L', (s * 4, s * 4), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, s * 4 - 1, s * 4 - 1), radius=int(s * 4 * 0.225), fill=255)
splash = Image.new('RGBA', (s, s), (0, 0, 0, 0))
splash.paste(t, (0, 0), mask.resize((s, s), Image.LANCZOS))
splash.save('mobile/assets/splash-icon.png')

# Web / PWA icons.
for name, size in [('icon-512.png', 512), ('icon-192.png', 192), ('apple-touch-icon.png', 180), ('favicon-64.png', 64)]:
    icon.resize((size, size), Image.LANCZOS).save('web/assets/' + name)
tile(512, 0.62).save('web/assets/icon-maskable-512.png')  # maskable safe zone (80% circle)
icon.resize((64, 64), Image.LANCZOS).save('mobile/assets/favicon.png')
print('ok')
