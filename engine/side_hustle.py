"""
side_hustle.py — Dynamic brand pivots triggered by a collapsed brand score.

When a personality's brand score drops below PIVOT_THRESHOLD during a dinner
episode, she generates a new, possibly desperate side hustle concept. The pivot
is logged as a `side_hustle_pivot` event and persisted to memory so future
episodes know her current brand.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import httpx

from engine.llm import call, MODELS, generate_image

BRAND_IMAGES_DIR = Path(__file__).parent.parent / "web" / "public" / "brand_images"

PIVOT_THRESHOLD = 50  # brand score below which a pivot triggers


def generate_pivot(
    name: str,
    card: dict,
    old_hustle: dict,
    brand_score: float,
) -> dict | None:
    """LLM call: generate a desperate new side hustle for a personality in crisis.

    Returns a dict {name, category, tagline} or None on failure.
    """
    old_name = old_hustle.get("name", "her brand")
    old_cat  = old_hustle.get("category", "")
    old_str  = f"{old_name} ({old_cat})" if old_cat else old_name

    system = (
        f"You are a panicked brand consultant watching {name}'s public image collapse. "
        f"She needs a new business venture — fast. "
        "It should feel authentically desperate: overcompensating, possibly ridiculous, "
        "but just believable enough that a Real Housewife would announce it at a dinner party. "
        "Respond ONLY with a JSON object — no markdown:\n"
        '{"name": "<new brand name>", "category": "<product/service type, 3-5 words>", '
        '"tagline": "<one punchy launch tagline>"}'
    )

    user_prompt = (
        f"{name} is {card.get('archetype', 'a housewife')}.\n"
        f"Her current brand: {old_str}\n"
        f"Her brand score just crashed to {brand_score:.0f} (catastrophic — started at 100).\n\n"
        "Generate a new pivot brand she'll announce in desperation. "
        "Make it feel like a real pivot: different category, new name, aspirational tagline."
    )

    try:
        raw = call(
            MODELS.get("director", MODELS["personality"]),
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=512,
        )
        clean = re.sub(r"```(?:json)?|```", "", raw).strip()
        data = json.loads(clean)
        # Validate required fields
        if not data.get("name") or not data.get("category"):
            return None
        return {
            "name":     str(data["name"])[:80],
            "category": str(data["category"])[:60],
            "tagline":  str(data.get("tagline", ""))[:120],
            "status":   "pivot — announced this episode",
        }
    except Exception as exc:
        print(f"  [WARN] side hustle pivot LLM failed for {name}: {exc}")
        return None


def generate_pivot_image(name: str, hustle: dict) -> str | None:
    """Generate a product image for a new pivot brand. Returns web-relative path or None.

    Builds a product photography prompt from the hustle name/category/tagline,
    generates via Magica image API, downloads to web/public/brand_images/,
    returns the path as a web-relative URL (/brand_images/filename.jpg).
    """
    brand_name = hustle.get("name", "new brand")
    category   = hustle.get("category", "product")
    tagline    = hustle.get("tagline", "")

    prompt = (
        f"Professional product photography for a luxury lifestyle brand called '{brand_name}'. "
        f"Product category: {category}. "
        f"{'Tagline: ' + tagline + '. ' if tagline else ''}"
        "Glossy magazine advertisement aesthetic, aspirational, slightly over-the-top reality TV energy. "
        "Soft warm lighting, clean minimal white or cream background, high-end retail feel. "
        "No text overlay. No logos. Product only."
    )

    print(f"  [IMAGE] Generating brand image for {name} → {brand_name}…")
    cdn_url = generate_image(prompt, resolution="512", output_format="JPEG")
    if not cdn_url:
        print(f"  [IMAGE] Generation failed for {name}")
        return None

    # Download and save locally.
    ts   = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    slug = name.lower().replace(" ", "_")
    filename = f"{slug}_{ts}.jpg"
    dest = BRAND_IMAGES_DIR / filename

    try:
        BRAND_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        with httpx.Client(timeout=30) as client:
            img_resp = client.get(cdn_url)
            img_resp.raise_for_status()
            dest.write_bytes(img_resp.content)
        print(f"  [IMAGE] Saved → {dest}")
        return f"/brand_images/{filename}"
    except Exception as exc:
        print(f"  [IMAGE] Download/save failed for {name}: {exc}")
        return cdn_url  # fall back to CDN URL if local save fails
