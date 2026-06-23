#!/usr/bin/env python3
"""Generate app icons from the boardgamenightwg robot-badge logo."""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "icons")
SRC = "/media/griswald/wd-black-2tb/personal/boardgamenightwg.github.io/static/images/serve_game1.png"
os.makedirs(OUT, exist_ok=True)

src = Image.open(SRC).convert("RGBA")

# Sample a corner pixel for the badge's background (peach), use as fill behind it.
bg = src.getpixel((4, 4))
if bg[3] < 200:            # corner is transparent -> use a warm cream instead
    bg = (240, 224, 202, 255)
bg = (bg[0], bg[1], bg[2], 255)


def rounded(img, radius_ratio=0.22):
    s = img.size[0]
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s, s], radius=int(s * radius_ratio), fill=255)
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def fit_on_bg(size, logo_scale):
    """Solid background tile with the logo centered at the given scale."""
    tile = Image.new("RGBA", (size, size), bg)
    inner = int(size * logo_scale)
    logo = src.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    tile.alpha_composite(logo, (off, off))
    return tile


# "any" icons: logo nearly full-bleed, rounded corners
rounded(fit_on_bg(192, 1.0)).save(os.path.join(OUT, "icon-192.png"))
rounded(fit_on_bg(512, 1.0)).save(os.path.join(OUT, "icon-512.png"))

# maskable: extra safe-zone padding, square (launcher applies its own mask)
fit_on_bg(512, 0.78).save(os.path.join(OUT, "icon-512-maskable.png"))

# favicon + apple touch
rounded(fit_on_bg(64, 1.0)).save(os.path.join(OUT, "favicon.png"))
fit_on_bg(180, 1.0).save(os.path.join(OUT, "apple-touch-icon.png"))

print("icons written from", os.path.basename(SRC), "bg=", bg)
