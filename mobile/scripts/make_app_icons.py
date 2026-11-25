"""Derive the app's icon files from the approved bee-only icon (web/assets/icon-1024.png).

Only scaling and padding are applied — the bee artwork itself is never redrawn.
Run from the repository root:  python3 mobile/scripts/make_app_icons.py
"""
from PIL import Image

SRC = 'web/assets/icon-1024.png'
CREAM = (253, 246, 233)  # the icon's own background colour

src = Image.open(SRC).convert('RGB')
assert src.size == (1024, 1024)

# iOS / store icon: the approved icon as-is (opaque, square — required by Apple).
src.save('mobile/assets/icon.png')

# Android adaptive icon foreground: launchers crop to a circle/squircle inside the
# central 66% circle. The bee spans ~76% x 51% of the icon, so at 72% its corners stay
# inside that circle. Centred on its own cream background.
fg = Image.new('RGB', (1024, 1024), CREAM)
inner = src.resize((737, 737), Image.LANCZOS)
fg.paste(inner, ((1024 - 737) // 2, (1024 - 737) // 2))
fg.save('mobile/assets/adaptive-icon.png')

# Splash: the approved icon centred on midnight charcoal (configured in app.json).
src.resize((512, 512), Image.LANCZOS).save('mobile/assets/splash-icon.png')
print('ok')
