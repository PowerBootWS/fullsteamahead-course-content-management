# FSA Course Content Management — Project Overview

## Purpose

This project automates the end-to-end process of publishing Canadian Second Class Power Engineering exam prep courses for the **Full Steam Ahead (FSA)** platform. It bridges three external systems:

- **Vimeo** — where instructional videos are hosted
- **GoHighLevel (GHL)** — the LMS used to deliver courses to students
- **fsachat.fullsteamahead.ca** — an AI tutoring agent embedded in every lesson

The primary deliverable is a fully structured GHL course, organized by chapter and objective, where each lesson contains the Vimeo lecture video and a personalized AI tutoring session.

---

## Course Structure

FSA courses follow the Canadian Second Class Power Engineering certification, divided into six papers:

| Code | Paper |
|------|-------|
| 2A1  | Second Class Part A Paper 1 |
| 2A2  | Second Class Part A Paper 2 |
| 2A3  | Second Class Part A Paper 3 |
| 2B1  | Second Class Part B Paper 1 |
| 2B2  | Second Class Part B Paper 2 |
| 2B3  | Second Class Part B Paper 3 |

Each paper has multiple chapters, and each chapter has multiple objectives. Every objective corresponds to exactly one Vimeo video and one GHL lesson.

### Video Naming Convention

Videos on Vimeo must be named following this exact pattern:

```
{COURSE_CODE} Chapter {N} Objective {M}
```

Example: `2B1 Chapter 3 Objective 2`

This name is the authoritative source for the course structure. The import pipeline parses it to determine which chapter and objective the video belongs to.

### Lesson ID

A lesson ID is derived from the video name and serves as the shared key across GHL and the tutoring agent:

```
{COURSE_CODE}-{CHAPTER}-{OBJECTIVE}
```

Example: `2B1 Chapter 3 Objective 2` → `2B1-3-2`

---

## Course Import Pipeline

The import process runs in three ordered steps, executed via CLI commands from the project root.

### Step 1 — Set Vimeo Thumbnails

A custom thumbnail is set for each video at the 3-second mark using the Vimeo API. This ensures all lessons have a meaningful preview image rather than the default first frame.

### Step 2 — Extract and Upload Thumbnails to GHL

The thumbnail for each video is downloaded from Vimeo and uploaded to the GHL media library. The result is a JSON file mapping each lesson ID to its GHL-hosted thumbnail URL. This file is saved to `imports/{COURSE_CODE}/thumbnails.json` and passed to the next step.

### Step 3 — Import Course to GoHighLevel

The pipeline searches Vimeo for all videos matching the course code, parses each video name to determine its position in the course hierarchy, and constructs a GHL import payload. The payload is submitted to GHL's course import API.

Each import creates or updates:

- **Product** — the top-level course (e.g., "Second Class Part B Paper 1")
- **Categories** — one per chapter (e.g., "Chapter 1", "Chapter 2")
- **Posts** — one per objective (e.g., "Objective 1"), each containing a Vimeo embed and a tutoring agent iframe

A `--dry-run` flag is available to preview the full JSON payload before committing to a live import.

---

## GHL Lesson Content

Each GHL lesson post (objective) contains two embedded components, stacked vertically:

### 1. Vimeo Video Embed

A responsive 16:9 Vimeo player iframe, configured without the Vimeo title/byline/portrait chrome, using the standard `player.vimeo.com` embed URL.

### 2. AI Tutoring Agent Iframe

An iframe embedding the FSA tutoring agent:

```
https://fsachat.fullsteamahead.ca/?user={{contact.email}}&lesson={lessonId}
```

The `{{contact.email}}` token is a GHL merge field resolved at render time, allowing the tutoring agent to identify the student. The `lesson` parameter tells the agent which content and question bank to use for this session.

---

## AI Tutoring Agent — Question Bank

The tutoring agent is backed by a PostgreSQL database (`fsa-agent`) containing multiple-choice practice questions indexed by lesson code.

Two question types are used:

- **`objective_practice`** — surfaced mid-lesson to test comprehension of the current objective. Typically difficulty 1–3.
- **`chapter_quiz`** — drawn at the end of a chapter, mixed across all objectives in that chapter. Used for full worked calculations, typically difficulty 3–5.

Calculation-based questions are stored as **staged multi-step problems**, where each step (formula selection, substitution, final answer) is its own MCQ, guiding the student through the full worked solution rather than asking for a single final number.

Questions must be fully self-contained — a student must be able to read and answer each question using only the question text and general Power Engineering knowledge, without referring back to any lesson material.

---

## Course Asset Generation

Two Python scripts generate visual assets for the platform, both using Google Gemini via the OpenRouter API.

### Course Cover Images

Cinematic 16:9 PNG cover images are generated for each of the six papers. All covers share a consistent visual identity: dark navy industrial backgrounds, orange accents, a power engineering operator figure, holographic blueprint-style technical overlays, and a bottom icon strip with topic-relevant line-art icons.

A reference image (`2A1-Cover.png`) is passed to Gemini with each request to enforce visual consistency across the series.

### Website OG Image

A 1200×630 JPEG `ogimage.jpg` is generated for use in Facebook/OpenGraph meta tags on `fullsteamahead.ca`. It follows the same visual language as the course covers but uses a desk-with-textbook composition rather than an operator figure, and has the FSA logo composited in programmatically using Pillow.

---

## Authentication and Environment

Three external services require credentials, configured via `.env`:

| Service | Variables |
|---------|-----------|
| GoHighLevel | `GOHIGHLEVEL_API`, `GOHIGHLEVEL_LOCATION_ID` |
| Vimeo | `VIMEO_ACCESS_TOKEN` (or `VIMEO_CLIENT_ID` + `VIMEO_CLIENT_SECRET` + `VIMEO_ACCESS_TOKEN_URL` for OAuth2) |
| OpenRouter | `OPENROUTER_API_KEY` (cover/OG image generation only) |

---

## Typical Import Workflow

```bash
# 1. Set thumbnails at 3 seconds and upload to GHL
npx tsx src/extract_thumbnails.ts 2B1 --set-thumbnails --time 3 --output imports/2B1/thumbnails.json

# 2. Import the course to GHL with thumbnails
npx tsx src/main.ts 2B1 --title "Second Class Part B Paper 1" --thumbnails-file imports/2B1/thumbnails.json

# Preview only (no changes)
npx tsx src/main.ts 2B1 --title "Second Class Part B Paper 1" --dry-run
```

Individual chapters can be imported in isolation using the `--chapter N` flag on both commands, which is useful when adding new content to an existing course without re-importing the whole thing.
