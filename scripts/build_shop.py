"""Cut the Fresh product photos into shop thumbnails.

Usage: python3 scripts/build_shop.py <source-dir>

<source-dir> holds the unzipped artwork: Packet/*.jpg (Ball Pen Packaging.zip),
Mock-Up/*.jpg (DF Ball Pen Mock Up.zip) and Fresh Pastello/*.png (Fresh Pastello.zip).
Writes assets/shop/<id>.webp.
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "shop")
SIZE = 480

# id -> (source file, crop box as fractions of width/height: left, top, right, bottom)
ITEMS = {
    "sprint-pack": ("Packet/Sprint.jpg", (0.0, 0.0, 0.52, 1.0)),
    "emoji-pack": ("Packet/EMOJI Single.jpg", (0.12, 0.0, 0.88, 1.0)),
    "good-day-pack": ("Packet/Good Day.jpg", (0.0, 0.0, 0.52, 1.0)),
    "pastello-pouch": ("Fresh Pastello/Pastello 6 pcs Pouch.png", (0.0, 0.0, 1.0, 1.0)),
    "icon-signature-pack": ("Packet/Icon Sign.jpg", (0.0, 0.0, 0.52, 1.0)),
    "captain-pencils": ("Packet/dfgdsbv.jpg", (0.05, 0.05, 0.95, 0.95)),
    "pencil-box": ("Packet/Select_box_-01.jpg", (0.0, 0.0, 1.0, 0.335)),
    "shine-box": ("Packet/Shine_Box Single.jpg", (0.15, 0.1, 0.85, 0.95)),
    "classroom-jar": ("Mock-Up/Fresh Classroom Jar.jpg", (0.1, 0.05, 0.9, 0.95)),
    "mega-bundle": ("Packet/All Product.jpg", (0.0, 0.0, 1.0, 1.0)),
}


def main(src):
    os.makedirs(OUT, exist_ok=True)
    for key, (path, (l, t, r, b)) in ITEMS.items():
        im = Image.open(os.path.join(src, path))
        im.draft("RGB", (SIZE * 3, SIZE * 3))
        im = im.convert("RGBA")
        w, h = im.size
        im = im.crop((round(l * w), round(t * h), round(r * w), round(b * h)))
        im.thumbnail((SIZE, SIZE), Image.LANCZOS)
        # Centre on a square light card so every product sits the same way in the grid.
        card = Image.new("RGBA", (SIZE, SIZE), (243, 238, 228, 255))
        card.alpha_composite(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2))
        card.convert("RGB").save(os.path.join(OUT, f"{key}.webp"), "WEBP", quality=82, method=6)
        print(key)


if __name__ == "__main__":
    main(sys.argv[1])
