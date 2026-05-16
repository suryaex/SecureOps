#!/usr/bin/env python3
"""
Generate PWA / iOS / Android icon set from the SVG logo.

Output:
  public/icons/icon-192.png
  public/icons/icon-512.png
  public/icons/icon-512-mask.png
  public/apple-touch-icon.png
  public/favicon.ico

Requires Pillow (PIL).
"""
import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Pillow not installed. Run: pip install Pillow", file=sys.stderr)
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.abspath(os.path.join(HERE, "..", "public"))
ICONS = os.path.join(PUBLIC, "icons")
os.makedirs(ICONS, exist_ok=True)


def shield(size: int, padding: int = 0, bg_color=(37, 99, 235)) -> Image.Image:
    """Render a rounded-square shield icon at the given size."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded background
    r = size // 5
    draw.rounded_rectangle((padding, padding, size - padding, size - padding),
                           radius=r, fill=bg_color)

    # Shield body
    s = size - 2 * padding
    cx = size / 2
    top = padding + s * 0.16
    bot = padding + s * 0.86
    half_w = s * 0.24
    points = [
        (cx,             top),
        (cx + half_w,    top + s * 0.10),
        (cx + half_w,    top + s * 0.42),
        (cx + half_w * 0.65, bot - s * 0.04),
        (cx,             bot),
        (cx - half_w * 0.65, bot - s * 0.04),
        (cx - half_w,    top + s * 0.42),
        (cx - half_w,    top + s * 0.10),
    ]
    draw.polygon(points, fill=(255, 255, 255, 240))

    # Check mark
    cm_w = max(2, int(size * 0.06))
    p1 = (cx - s * 0.10, padding + s * 0.50)
    p2 = (cx - s * 0.02, padding + s * 0.58)
    p3 = (cx + s * 0.13, padding + s * 0.42)
    draw.line([p1, p2, p3], fill=(37, 99, 235, 255), width=cm_w, joint="curve")
    return img


def save(img: Image.Image, path: str):
    img.save(path, "PNG", optimize=True)
    print(f"  ✓ {path}")


def main():
    print("Generating PWA icons…")
    save(shield(192),                    os.path.join(ICONS, "icon-192.png"))
    save(shield(512),                    os.path.join(ICONS, "icon-512.png"))
    save(shield(512, padding=64),        os.path.join(ICONS, "icon-512-mask.png"))
    save(shield(180),                    os.path.join(PUBLIC, "apple-touch-icon.png"))
    # 32x32 favicon (browsers handle .png fine; also save as .ico if requested)
    fav = shield(32)
    save(fav,                            os.path.join(PUBLIC, "favicon-32.png"))
    fav.save(os.path.join(PUBLIC, "favicon.ico"), format="ICO", sizes=[(32, 32), (16, 16)])
    print(f"  ✓ {os.path.join(PUBLIC, 'favicon.ico')}")
    print("Done.")


if __name__ == "__main__":
    main()
