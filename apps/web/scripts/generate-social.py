"""Render the branded sharing image from the existing logo and Geist typography.

Maintainer tool only; not needed by production builds. Requires Pillow and the
official Geist TTF: python3 scripts/generate-social.py /path/to/Geist.ttf
Font source: https://github.com/google/fonts/tree/main/ofl/geist (SIL OFL).
"""
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

web = Path(__file__).resolve().parent.parent
font_path = Path(sys.argv[1])
scale = 2
image = Image.new("RGB", (1200 * scale, 630 * scale), "#0e1113")
draw = ImageDraw.Draw(image)


def font(size, weight=400):
    face = ImageFont.truetype(str(font_path), size * scale)
    face.set_variation_by_axes([weight])
    return face


def text(position, value, size, color, weight=400):
    draw.text(tuple(v * scale for v in position), value,
              fill=color, font=font(size, weight))


logo = Image.open(web / "public/images/brand/logo-color.png").convert("RGBA")
logo.thumbnail((235 * scale, 79 * scale), Image.Resampling.LANCZOS)
image.paste(logo, (65 * scale, 54 * scale), logo)
text((70, 205), "Engineering confidence", 72, "#edf0f3")
text((70, 298), "before production.", 72, "#89a9ff")
draw.line((70 * scale, 475 * scale, 1130 * scale, 475 * scale),
          fill="#2a3038", width=scale)
text((70, 505), "Repository health  ·  Standards  ·  CI evidence", 23, "#a4adb8")
text((70, 548), "Self-hosted. GitHub native.", 19, "#7f8b99")
destination = web / "public/images/social/preflyt.png"
destination.parent.mkdir(parents=True, exist_ok=True)
image.resize((1200, 630), Image.Resampling.LANCZOS).save(destination, optimize=True)
print(destination)
