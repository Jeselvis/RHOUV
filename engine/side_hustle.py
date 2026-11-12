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

    # Each personality gets one specific, unavoidable absurdity.
    # Keyed to brand name hash for consistency across reruns.
    _anomalies = [
        (
            "the product is the size of a refrigerator — it towers over the scene and fills most of the frame, "
            "dwarfing a normal-sized wine glass sitting next to it for scale. "
            "The composition treats this scale as completely normal and elegant."
        ),
        (
            "the product is upside down and defying gravity, floating in mid-air with nothing supporting it, "
            "about 3 feet above the surface. The studio lighting and shadows are perfect and normal. "
            "Nothing else in the scene acknowledges this."
        ),
        (
            "there are six identical copies of the product arranged in a circle, each one slightly melting "
            "into the next one, like they are fusing together at the edges. "
            "The overall composition is styled as an elegant flat-lay."
        ),
        (
            "the product is being held by a perfectly manicured hand, but the hand has eight fingers, "
            "arranged symmetrically. The hand and product are lit perfectly. "
            "The image is otherwise a flawless beauty/lifestyle shot."
        ),
        (
            "the product is completely normal except it is casting a shadow of a completely different object — "
            "a large house cat, rendered in crisp shadow detail on the white surface beneath the product. "
            "No cat is present. The shadow is sharp and confident."
        ),
        (
            "there are two of the product: one normal-sized in the foreground, "
            "and one that is microscopically tiny — the size of a grain of rice — sitting directly beside it. "
            "Both are in perfect focus. Both are lit as hero products."
        ),
    ]
    _anomaly = _anomalies[hash(brand_name) % len(_anomalies)]

    prompt = (
        f"Glossy luxury magazine product photography for a brand called '{brand_name}'. "
        f"Product category: {category}. "
        f"{'Tagline: ' + tagline + '. ' if tagline else ''}"
        "Perfect professional studio lighting, aspirational lifestyle aesthetic, cream or white background. "
        f"THE ENTIRE CONCEPT OF THIS IMAGE: {_anomaly} "
        "This is the main subject and cannot be subtle — it must be immediately obvious to any viewer. "
        "Render it with complete photorealistic confidence, as if it is totally normal. "
        "No text. No logos."
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
