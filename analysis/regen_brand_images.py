"""One-off script: regenerate brand images for all 6 personalities using the
updated uncanny-valley prompt. Saves to web/public/brand_images/ and prints
web-relative paths. Run after updating the image prompt in side_hustle.py.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from engine.side_hustle import generate_pivot_image

PERSONALITIES = [
    ("Vivienne Davenport", {"name": "La Vie Vivienne",    "category": "luxury skincare",                 "tagline": ""}),
    ("Cassandra Cole",     {"name": "Cole & Co.",         "category": "shapewear",                       "tagline": ""}),
    ("Bianca Noel",        {"name": "Noel x TBD",         "category": "fashion and accessories",         "tagline": ""}),
    ("Diane Wentworth",    {"name": "Wentworth Estate",   "category": "wine label",                      "tagline": ""}),
    ("Petra Voss",         {"name": "Voss & Velvet",      "category": "intimate wellness and pleasure objects", "tagline": ""}),
    ("Madison Fleur",      {"name": "Fleur de Bloom",     "category": "candles and wellness",            "tagline": ""}),
]

for name, hustle in PERSONALITIES:
    print(f"\n--- {name} / {hustle['name']} ---")
    path = generate_pivot_image(name, hustle)
    if path:
        print(f"  → {path}")
    else:
        print(f"  [FAILED]")
