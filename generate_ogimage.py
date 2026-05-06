"""
OG Image Generator for fullsteamahead.ca
Generates ogimage.jpg (1200x630) for Facebook/OpenGraph meta tags.

Usage:
    source .venv/bin/activate
    python generate_ogimage.py

Output: assets/ogimage.jpg
"""

import os
import base64
import requests
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import io
from dotenv import load_dotenv

# ── Config ─────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).parent
load_dotenv(ROOT.parent / ".env")

API_KEY = os.environ.get("OPENROUTER_API_KEY")
MODEL = "google/gemini-3.1-flash-image-preview:image"
ASSETS_DIR = ROOT / "assets"
OUTPUT_PATH = ASSETS_DIR / "ogimage.jpg"
LOGO_PATH = ASSETS_DIR / "FSA Logo Main Square - Copy.png"

# Reference cover to anchor the style
REFERENCE_PATH = ROOT / "cover-images" / "output" / "2B1-Cover.png"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": "https://fullsteamahead.ca",
    "X-Title": "Full Steam Ahead OG Image Generator",
}

PROMPT = """Photorealistic cinematic Open Graph image for a professional Canadian power engineering exam prep website. Exactly 1200x630 pixels, landscape format. This is a web banner / social media preview card — NOT a book cover — so there is NO operator figure, no people at all.

BACKGROUND (left 55%): A dramatic top-down aerial view of an open engineering textbook and exam answer sheets spread on a dark navy desk. The pages show technical diagrams — pressure vessel cross-sections, Rankine cycle T-s diagrams, formula tables. A mechanical pencil and engineering calculator rest on the papers. Warm amber desk lamp glow from the upper left illuminates the papers. Dark navy and charcoal tones overall with subtle blueprint grid lines overlaid across the full image — identical to the established course cover series. Semi-transparent holographic overlays floating above the papers: a glowing cyan and white Pressure-Volume (P-V) engine diagram, and a labeled boiler schematic — same blueprint-hologram style as the course cover series. No people anywhere in this image.

RIGHT SIDE (right 45%): Dark navy space reserved for text overlays. Keep this area clean and uncluttered — just the deep dark background with a faint blueprint grid. No objects, no clutter, no people on this side.

TEXT OVERLAID ON IMAGE — RIGHT SIDE, vertically centered:
Line 1: "SECOND CLASS" — very large bold condensed sans-serif uppercase, solid white
Line 2: "POWER ENGINEERING" — same font, bright orange (#E8590C)
Line 3: "EXAM PREP" — same font, bright orange (#E8590C), same size as line 2
Line 4: "CANADA" — smaller bold uppercase white, wide letter-spacing

BOTTOM ICON STRIP: Dark navy rounded panel across the bottom 18% of image. Four evenly-spaced small technical illustrations in orange (#E8590C) and white line-art: (1) Open exam booklet with pencil, (2) Pressure vessel cross-section formula, (3) T-s thermodynamic diagram, (4) Certificate/credential ribbon seal.

Overall: Dramatic cinematic depth of field, warm amber desk lamp glow, professional color grading, dark navy and charcoal palette (#0d1f35 to #1a3a5c) with orange accents (#E8590C). Photorealistic 4K quality. No human figures anywhere."""


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_image_b64(path: Path) -> dict:
    ext = path.suffix.lower()
    media_type = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
    data = base64.standard_b64encode(path.read_bytes()).decode("utf-8")
    return {"media_type": media_type, "data": data}


def call_openrouter(prompt: str, reference: dict) -> bytes | None:
    reference_preamble = (
        "This first image is a reference showing the established visual style for the "
        "Full Steam Ahead course cover series. Match its color palette (dark navy #0d1f35–#1a3a5c, "
        "orange accents #E8590C), blueprint grid overlay, holographic diagram style, bottom icon strip "
        "design, and overall cinematic industrial aesthetic. The new image should feel like it belongs "
        "to the same family.\n\n"
    )

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{reference['media_type']};base64,{reference['data']}"
                        },
                    },
                    {"type": "text", "text": reference_preamble + prompt},
                ],
            }
        ],
    }

    print(f"  Calling OpenRouter ({MODEL})...")
    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers=HEADERS,
        json=payload,
        timeout=180,
    )

    if response.status_code != 200:
        print(f"  ERROR {response.status_code}: {response.text[:400]}")
        return None

    data = response.json()
    try:
        message = data["choices"][0]["message"]

        refusal = message.get("refusal")
        if refusal:
            print(f"  REFUSAL: {refusal}")
            return None

        images = message.get("images")
        if images and isinstance(images, list):
            img = images[0]
            if isinstance(img, str):
                return base64.b64decode(img)
            if isinstance(img, dict):
                if img.get("type") == "image_url":
                    url = img["image_url"]["url"]
                    if url.startswith("data:"):
                        return base64.b64decode(url.split(",", 1)[1])
                    return requests.get(url, timeout=60).content
                if "url" in img:
                    url = img["url"]
                    if url.startswith("data:"):
                        return base64.b64decode(url.split(",", 1)[1])
                    return requests.get(url, timeout=60).content
                if "data" in img:
                    return base64.b64decode(img["data"])

        content = message.get("content")
        if isinstance(content, list):
            for part in content:
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "image_url":
                    url = part["image_url"]["url"]
                    if url.startswith("data:"):
                        return base64.b64decode(url.split(",", 1)[1])
                if part.get("type") == "image" and "source" in part:
                    return base64.b64decode(part["source"]["data"])

        if isinstance(content, str) and content.startswith("http"):
            return requests.get(content, timeout=60).content

        print(f"  Could not locate image in response. Message keys: {list(message.keys())}")
        if content:
            print(f"  Content type: {type(content)}")
            if isinstance(content, str):
                print(f"  Content preview: {content[:200]}")
        return None

    except (KeyError, IndexError, TypeError) as e:
        import json
        print(f"  Parse error: {e}")
        print(f"  Response preview: {json.dumps(data)[:400]}")
        return None


def composite_logo(base_bytes: bytes, logo_path: Path) -> bytes:
    """Paste the FSA logo as a circle, bottom-right above the icon strip."""
    base = Image.open(io.BytesIO(base_bytes)).convert("RGBA")
    base = base.resize((1200, 630), Image.LANCZOS)

    logo_src = Image.open(logo_path).convert("RGBA")

    # Crop to a square from centre before circling
    w, h = logo_src.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    logo_sq = logo_src.crop((left, top, left + side, top + side))

    # Target diameter: ~13% of image width
    diam = int(1200 * 0.13)
    logo_sq = logo_sq.resize((diam, diam), Image.LANCZOS)

    # Build circular mask
    mask = Image.new("L", (diam, diam), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, diam - 1, diam - 1), fill=255)

    # White circle background so the dark logo pops
    circle_bg = Image.new("RGBA", (diam, diam), (255, 255, 255, 255))
    circle_bg.paste(logo_sq, (0, 0), logo_sq)
    circle_bg.putalpha(mask)

    # Navy border ring (2px inset)
    border_img = Image.new("RGBA", (diam, diam), (0, 0, 0, 0))
    border_color = (13, 31, 53, 220)   # #0d1f35 with slight transparency
    border_draw = ImageDraw.Draw(border_img)
    border_draw.ellipse((0, 0, diam - 1, diam - 1), outline=border_color, width=3)
    circle_bg = Image.alpha_composite(circle_bg, border_img)

    # Position: bottom-LEFT corner, above icon strip
    icon_strip_h = int(630 * 0.18)
    margin = 18
    x = margin
    y = 630 - icon_strip_h - diam - margin

    base.paste(circle_bg, (x, y), circle_bg)

    out = io.BytesIO()
    base.convert("RGB").save(out, format="JPEG", quality=92)
    return out.getvalue()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not API_KEY:
        print("ERROR: OPENROUTER_API_KEY not found in .env")
        return

    print("FSA OG Image Generator")
    print("─" * 40)

    if not REFERENCE_PATH.exists():
        print(f"WARNING: Reference image not found at {REFERENCE_PATH}")
        print("Proceeding without style reference — output may vary.")
        reference = None
    else:
        reference = load_image_b64(REFERENCE_PATH)
        print(f"  Reference loaded: {REFERENCE_PATH.name}")

    if not LOGO_PATH.exists():
        print(f"WARNING: Logo not found at {LOGO_PATH}")
        composite = False
    else:
        print(f"  Logo loaded: {LOGO_PATH.name}")
        composite = True

    print(f"\nGenerating OG image → {OUTPUT_PATH}\n")

    raw_bytes = call_openrouter(PROMPT, reference)
    if not raw_bytes:
        print("Generation failed.")
        return

    print(f"  Image received ({len(raw_bytes) // 1024} KB)")

    # Save raw output before compositing so we can re-run composite without API call
    raw_path = OUTPUT_PATH.with_name("ogimage_raw.jpg")
    raw_path.write_bytes(raw_bytes)
    print(f"  Raw saved → {raw_path.name}")

    if composite:
        print("  Compositing logo...")
        final_bytes = composite_logo(raw_bytes, LOGO_PATH)
    else:
        # Still resize to exact dimensions
        img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        img = img.resize((1200, 630), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=92)
        final_bytes = out.getvalue()

    OUTPUT_PATH.write_bytes(final_bytes)
    print(f"  ✓ Saved → {OUTPUT_PATH}  ({len(final_bytes) // 1024} KB)")
    print("\nDone.")


if __name__ == "__main__":
    main()
