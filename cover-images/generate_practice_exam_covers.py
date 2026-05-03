"""
FSA Practice Exam Cover Image Generator
Generates practice exam cover images via OpenRouter using google/gemini-3.1-flash-image-preview

Usage:
    source .venv/bin/activate
    python generate_practice_exam_covers.py

    # Generate a single paper:
    python generate_practice_exam_covers.py 2A1

Output: PNG files saved to ./output/
"""

import os
import sys
import json
import base64
import requests
from pathlib import Path
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
load_dotenv(SCRIPT_DIR / ".env")

API_KEY = os.environ.get("OPENROUTER_API_KEY")
MODEL = "google/gemini-3.1-flash-image-preview:image"
OUTPUT_DIR = SCRIPT_DIR / "output"
PROMPTS_FILE = SCRIPT_DIR / "fsa_practice_exam_prompts.json"

REFERENCE_CANDIDATES = [
    "reference.png", "reference.jpg", "reference.jpeg",
    "2A1-Cover.png", "2A1-Cover.jpg",
]

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": "https://fullsteamahead.ca",
    "X-Title": "Full Steam Ahead Practice Exam Cover Generator",
}

# ── Reference image ───────────────────────────────────────────────────────────

def load_reference_image() -> dict | None:
    for name in REFERENCE_CANDIDATES:
        path = SCRIPT_DIR / name
        if path.exists():
            ext = path.suffix.lower()
            media_type = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"
            data = base64.standard_b64encode(path.read_bytes()).decode("utf-8")
            print(f"  Reference image loaded: {path.name} ({path.stat().st_size // 1024} KB)")
            return {"media_type": media_type, "data": data}
    return None


def build_message_content(prompt: str, reference: dict | None) -> list:
    content = []
    if reference:
        content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{reference['media_type']};base64,{reference['data']}"
            },
        })
        prompt = (
            "This is a reference image showing the established visual style for this "
            "course cover series. Match its color palette, operator attire, holographic "
            "overlay style, bottom icon strip layout, and overall cinematic industrial "
            "aesthetic exactly. IMPORTANT: Do NOT copy the heading/subheading text from "
            "this reference — the new image uses only the two-line exam label described "
            "in the prompt below.\n\n"
            + prompt
        )
    content.append({"type": "text", "text": prompt})
    return content


# ── Generation ────────────────────────────────────────────────────────────────

def generate_image(paper_id: str, prompt: str, reference: dict | None) -> bytes | None:
    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": build_message_content(prompt, reference),
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
        print(f"  ERROR {response.status_code}: {response.text[:300]}")
        return None

    data = response.json()

    try:
        message = data["choices"][0]["message"]

        refusal = message.get("refusal")
        if refusal:
            print(f"  REFUSAL: {refusal}")
            return None

        # ── Primary: images array ──
        images = message.get("images")
        print(f"  Debug: images key present = {images is not None}, type = {type(images)}")
        if images and isinstance(images, list) and len(images) > 0:
            print(f"  Debug: images array length = {len(images)}, first item type = {type(images[0])}")
            img = images[0]
            if isinstance(img, str):
                return base64.b64decode(img)
            if isinstance(img, dict):
                if img.get("type") == "image_url" and "image_url" in img:
                    url = img["image_url"]["url"]
                    if url.startswith("data:"):
                        return base64.b64decode(url.split(",", 1)[1])
                    print(f"  Downloading image from URL...")
                    r = requests.get(url, timeout=60)
                    if r.status_code == 200:
                        return r.content
                if "url" in img:
                    url = img["url"]
                    if url.startswith("data:"):
                        return base64.b64decode(url.split(",", 1)[1])
                    print(f"  Downloading image from URL...")
                    r = requests.get(url, timeout=60)
                    if r.status_code == 200:
                        return r.content
                if "data" in img:
                    return base64.b64decode(img["data"])

        # ── Fallback: content array ──
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
            print(f"  Downloading image from URL...")
            r = requests.get(content, timeout=60)
            if r.status_code == 200:
                return r.content

        print(f"  Could not locate image in response.")
        print(f"  message keys: {list(message.keys())}")
        content = message.get("content")
        if content:
            print(f"  Debug: content type = {type(content)}")
            if isinstance(content, list):
                print(f"  Debug: content has {len(content)} items")
            elif isinstance(content, str):
                print(f"  Debug: content string (first 200 chars): {content[:200]}")
        return None

    except (KeyError, IndexError, TypeError) as e:
        print(f"  Parse error: {e}")
        print(f"  Response preview: {json.dumps(data)[:400]}")
        return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not API_KEY:
        print(
            "ERROR: OPENROUTER_API_KEY not found.\n"
            "Ensure a .env file with OPENROUTER_API_KEY=sk-... exists in the same folder."
        )
        return

    # Optional filter: python generate_practice_exam_covers.py 2A1 2B1
    filter_ids = set(a.upper() for a in sys.argv[1:])

    OUTPUT_DIR.mkdir(exist_ok=True)

    with open(PROMPTS_FILE) as f:
        config = json.load(f)

    print("FSA Practice Exam Cover Image Generator")
    print("─" * 40)

    reference = load_reference_image()
    if not reference:
        print(
            "  No reference image found — generating from prompt only.\n"
            "  Tip: place 2A1-Cover.png in the same folder for style consistency.\n"
        )

    images = config["images"]
    if filter_ids:
        images = [img for img in images if img["paper_id"].upper() in filter_ids]
        print(f"  Filtering to: {', '.join(filter_ids)}\n")

    print(f"{len(images)} images to generate → {OUTPUT_DIR}\n")

    failed = []
    for img in images:
        paper_id = img["paper_id"]
        filename = img["filename"]
        out_path = OUTPUT_DIR / filename

        print(f"[{paper_id}] {filename}  (operator: {img['operator_side']}, text: {img['text_side']})")
        png_bytes = generate_image(paper_id, img["prompt"], reference)

        if png_bytes:
            out_path.write_bytes(png_bytes)
            print(f"  ✓ Saved  ({len(png_bytes) // 1024} KB)\n")
        else:
            print(f"  ✗ Failed\n")
            failed.append(paper_id)

    print("─" * 40)
    if failed:
        print(f"Completed with failures: {', '.join(failed)}")
    else:
        print("All practice exam covers generated successfully.")


if __name__ == "__main__":
    main()
