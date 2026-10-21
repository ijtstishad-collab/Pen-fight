"""Slice the Fresh pen artwork into one sprite per pen for the game.

Usage: python3 scripts/build_pens.py <source-dir>

<source-dir> holds the unzipped brand artwork:
  PNG/*.png                      (10 Pen Brands.zip: six pens per sheet, standing up)
  Fresh Pastello/Image-01.png    (Fresh Pastello.zip)
  Mockup/1.png .. 6.png          (Fresh InkForce.zip, one pen each)

Writes assets/pens/<line>-<n>.webp (lying flat, writing tip pointing right) and pens.js (the manifest).
"""
import colorsys
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "pens")
SPRITE_LEN = 512  # px along the pen; the game draws pens ~190 world units long

# (id, display name, source sheets). A sheet with several pens is split on transparent gaps.
LINES = [
    ("icon", "Icon", ["PNG/Fresh icon.png"]),
    ("icon-signature", "Icon Signature", ["PNG/Fresh icon Signature.png"]),
    ("inkforce", "InkForce", [f"Mockup/{i}.png" for i in range(1, 7)]),
    ("pastello", "Pastello", ["Fresh Pastello/Image-01.png"]),
    ("allrounder", "Allrounder", ["PNG/Fresh Allrounder.png"]),
    ("emoji", "Emoji", ["PNG/Fresh Emoji.png"]),
    ("shine", "Shine", ["PNG/Fresh Shine.png"]),
    ("sailor", "Sailor", ["PNG/Fresh Sailor-01-01.png"]),
    ("classroom", "Classroom", ["PNG/Fresh Class Room-01-01.png"]),
    ("campus", "Campus", ["PNG/Fresh_campus-01-01.png"]),
    ("good-day", "Good Day", ["PNG/Fresh_Good Day-01.png"]),
    ("sprint", "Sprint", ["PNG/Fresh_sprint-01-01.png"]),
]


def column_runs(img, min_width):
    alpha = img.getchannel("A")
    w, h = img.size
    px = alpha.load()
    filled = [any(px[x, y] > 40 for y in range(0, h, 3)) for x in range(w)]
    runs, start = [], None
    for x, f in enumerate(filled + [False]):
        if f and start is None:
            start = x
        elif not f and start is not None:
            if x - start >= min_width:
                runs.append((start, x))
            start = None
    return runs


def split(img):
    runs = column_runs(img, max(8, img.width // 60))
    pens = []
    for x0, x1 in runs:
        crop = img.crop((x0, 0, x1, img.height))
        pens.append(crop.crop(crop.getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox()))
    return pens


def main_colour(img):
    """Most common saturated hue on the pen, so clear barrels still get their accent colour."""
    small = img.copy()
    small.thumbnail((40, 200))
    buckets = {}
    plain = []
    px = small.load()
    for r, g, b, a in (px[x, y] for y in range(small.height) for x in range(small.width)):
        if a < 200:
            continue
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if l < 0.92:
            plain.append((r, g, b))
        if s > 0.35 and 0.18 < l < 0.85:
            buckets.setdefault(int(h * 24) % 24, []).append((r, g, b))
    # A small hue (like the red logo) shouldn't colour a grey or black pen.
    top = max(buckets.values(), key=len) if buckets else []
    pool = top if len(top) > 0.2 * max(1, len(plain)) else plain or top or [(128, 128, 128)]
    n = len(pool)
    r, g, b = (sum(c[i] for c in pool) // n for i in range(3))
    return "#%02x%02x%02x" % (r, g, b)


def barrel(flat):
    """Centre line and thickness of the barrel (as fractions of sprite height), measured away from the clip."""
    a = flat.getchannel("A").load()
    w, h = flat.size
    tops, bottoms = [], []
    for x in range(int(w * 0.6), int(w * 0.9), 4):
        rows = [y for y in range(h) if a[x, y] > 60]
        if rows:
            tops.append(rows[0])
            bottoms.append(rows[-1] + 1)
    tops.sort()
    bottoms.sort()
    top, bottom = tops[len(tops) // 2], bottoms[len(bottoms) // 2]
    return round((top + bottom) / 2 / h, 4), round((bottom - top) / h, 4)


def main(src):
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for line_id, name, sheets in LINES:
        pens = []
        for sheet in sheets:
            pens += split(Image.open(os.path.join(src, sheet)).convert("RGBA"))
        if len(pens) != 6:
            sys.exit(f"{line_id}: expected 6 pens, found {len(pens)}")
        entries = []
        for i, pen in enumerate(pens, 1):
            flat = pen.rotate(90, expand=True)  # cap left, writing tip right
            flat = flat.resize((SPRITE_LEN, max(1, round(flat.height * SPRITE_LEN / flat.width))), Image.LANCZOS)
            file = f"assets/pens/{line_id}-{i}.webp"
            flat.save(os.path.join(ROOT, file), "WEBP", quality=88, method=6)
            axis, thickness = barrel(flat)
            entries.append({
                "src": file,
                "colour": main_colour(pen),
                "aspect": round(flat.height / flat.width, 4),
                "axis": axis,
                "thickness": thickness,
            })
        manifest.append({"id": line_id, "name": name, "pens": entries})
        print(f"{line_id}: {len(entries)} pens")
    with open(os.path.join(ROOT, "pens.js"), "w") as f:
        f.write("// Generated by scripts/build_pens.py: Fresh pen lines and their sprites.\n")
        f.write("window.PEN_LINES = " + json.dumps(manifest, indent=2) + ";\n")


if __name__ == "__main__":
    main(sys.argv[1])
