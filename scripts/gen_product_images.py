"""Generate AI product images for each cast member's brand via EdenAI (minimax).

Saves PNGs to images/products/<first_name_lower>.png.
Reads memory.json to pick up any in-show brand pivots — pivoted characters get
new prompts based on their new brand.

Run once (or re-run to regenerate):
    .venv/bin/python3.12 scripts/gen_product_images.py

To force regeneration of a specific character:
    rm images/products/vivienne.png && .venv/bin/python3.12 scripts/gen_product_images.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import httpx
import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

EDENAI_URL = "https://api.edenai.run/v2/image/generation"
OUT_DIR = ROOT / "images" / "products"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Base prompts (used when no pivot has occurred)
_BASE_PROMPTS: dict[str, str] = {
    "vivienne": (
        "La Vie Vivienne luxury skincare collection: elegant frosted glass bottles with gold caps, "
        "white and gold packaging, fresh rose petals, studio product photography, soft light"
    ),
    "cassandra": (
        "Cole & Co. luxury shapewear: sleek matte-black and nude garment folded on marble surface, "
        "minimal editorial product photo, clean white background"
    ),
    "bianca": (
        "High-end fashion accessories flat lay: structured leather bag, sunglasses, silk scarf, "
        "editorial product photography, neutral linen background"
    ),
    "diane": (
        "Wentworth Estate wine bottle: dark burgundy label with gold script, single bottle on aged oak, "
        "wine glass, dramatic moody lighting, product photography"
    ),
    "petra": (
        "Voss & Velvet luxury intimate wellness product line: sleek matte-black sculptural objects "
        "on white marble, minimalist editorial product photography, tasteful and artistic, "
        "black and gold packaging, high-end art-gallery aesthetic"
    ),
    "madison": (
        "Fleur de Bloom luxury candle: amber glass jar with linen label, dried botanicals around it, "
        "soft warm glow, cozy editorial product photography, neutral tones"
    ),
}


def _build_pivot_prompt(hustle: dict) -> str:
    name = hustle.get("name", "product")
    category = hustle.get("category", "luxury goods")
    tagline = hustle.get("tagline", "")
    return (
        f"{name} brand product: {category}. "
        f"{'Tagline: ' + tagline + '. ' if tagline else ''}"
        "Studio product photography, editorial style, clean background, luxury feel."
    )


def build_prompts() -> dict[str, str]:
    """Merge base prompts with any pivoted hustles from memory."""
    prompts = dict(_BASE_PROMPTS)

    memory_path = ROOT / "runs" / "memory.json"
    if not memory_path.exists():
        return prompts

    with open(memory_path) as fh:
        memory = json.load(fh)

    personalities_dir = ROOT / "engine" / "personalities"
    for f in sorted(personalities_dir.glob("*.yaml")):
        card = yaml.safe_load(f.read_text())
        full_name = card["name"]
        first = full_name.split()[0].lower()

        pivot = memory.get("personalities", {}).get(full_name, {}).get("current_side_hustle")
        if pivot:
            prompts[first] = _build_pivot_prompt(pivot)
            print(f"  [{first}] pivoted hustle detected: {pivot['name']} — using new prompt")

    return prompts


def generate_one(name_first: str, prompt: str, api_key: str) -> bool:
    # EdenAI returns JPEG; save as .jpg
    out_path = OUT_DIR / f"{name_first}.jpg"
    if out_path.exists():
        print(f"  {name_first}: already exists, skipping")
        return True

    print(f"  {name_first}: generating…")
    try:
        import base64
        resp = httpx.post(
            EDENAI_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "providers": ["minimax"],
                "text": prompt[:1000],
                "resolution": "1024x1024",
                "num_images": 1,
            },
            timeout=90,
        )
        resp.raise_for_status()
        data = resp.json()

        # Provider key is "minimax/image-01" (or similar) — find first minimax entry
        provider_key = next(
            (k for k in data if k.startswith("minimax")), None
        )
        if not provider_key:
            print(f"  {name_first}: no minimax key in response — keys: {list(data.keys())}")
            return False

        provider_data = data[provider_key]
        if provider_data.get("status") != "success":
            print(f"  {name_first}: provider error — {provider_data}")
            return False

        b64 = provider_data["items"][0]["image"]
        img_bytes = base64.b64decode(b64)
        out_path.write_bytes(img_bytes)
        print(f"  {name_first}: saved ({len(img_bytes)//1024} KB) → {out_path.name}")
        return True
    except Exception as exc:
        print(f"  {name_first}: FAILED — {exc}")
        return False


def main() -> None:
    api_key = os.getenv("EDEN_AI_API_KEY")
    if not api_key:
        print("ERROR: EDEN_AI_API_KEY not set in .env")
        sys.exit(1)

    prompts = build_prompts()
    print(f"Generating {len(prompts)} product images via EdenAI\n→ {OUT_DIR}\n")

    ok = 0
    for first, prompt in prompts.items():
        if generate_one(first, prompt, api_key):
            ok += 1

    print(f"\nDone: {ok}/{len(prompts)} images.")


if __name__ == "__main__":
    main()
