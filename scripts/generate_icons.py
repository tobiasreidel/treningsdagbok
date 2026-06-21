#!/usr/bin/env python3
"""Generate PWA icons for Treningsdagbok.

A minimalist mark: indigo->cyan gradient with a white mountain range and sun,
evoking the outdoor cycling/climbing theme. Pure Pillow, no external assets.

Run:  python3 scripts/generate_icons.py   (or: npm run icons)
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "public")
SCALE = 4  # supersampling for smooth edges

TOP = (79, 70, 229)      # indigo  #4f46e5
BOTTOM = (6, 182, 212)   # cyan    #06b6d4


def gradient(size):
    col = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        col.putpixel(
            (0, y),
            tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)),
        )
    return col.resize((size, size))


def draw_content(img, ox, oy, cs):
    """Draw mountains + sun inside a content box of side `cs` at (ox, oy)."""
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    def p(fx, fy):
        return (ox + fx * cs, oy + fy * cs)

    # Sun
    sr = 0.075 * cs
    sx, sy = p(0.70, 0.32)
    d.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=(255, 255, 255, 235))

    # Back mountain
    d.polygon([p(0.14, 0.76), p(0.45, 0.34), p(0.76, 0.76)], fill=(255, 255, 255, 235))
    # Snow cap on back mountain
    d.polygon([p(0.40, 0.41), p(0.45, 0.34), p(0.50, 0.41),
               p(0.465, 0.45), p(0.435, 0.45)], fill=(255, 255, 255, 255))

    # Front mountain (slightly translucent for depth)
    d.polygon([p(0.40, 0.78), p(0.64, 0.47), p(0.90, 0.78)], fill=(255, 255, 255, 180))

    img.alpha_composite(overlay)


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def make(size, maskable=False):
    s = size * SCALE
    base = gradient(s).convert("RGBA")

    if maskable:
        # Keep content within the central safe zone; background full-bleed.
        cs = 0.78 * s
        off = (s - cs) / 2
        draw_content(base, off, off, cs)
        return base.resize((size, size), Image.LANCZOS)

    draw_content(base, 0, 0, s)
    base.putalpha(rounded_mask(s, int(0.22 * s)))
    return base.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    targets = [
        ("pwa-192x192.png", 192, False),
        ("pwa-512x512.png", 512, False),
        ("pwa-maskable-512x512.png", 512, True),
        ("apple-touch-icon.png", 180, False),
    ]
    for name, size, maskable in targets:
        img = make(size, maskable)
        img.save(os.path.join(OUT, name))
        print(f"wrote {name} ({size}x{size}{' maskable' if maskable else ''})")


if __name__ == "__main__":
    main()
