# Course Import Skill
Import course content from Vimeo to GoHighLevel.

## When to Use

Use this skill when instructed to import a new course. Each course requires:
1. Getting video metadata from Vimeo
2. Parsing video names to extract chapter/objective
3. Building the GHL import JSON
4. Importing to GHL

## Video Naming Convention

Videos must follow: `{COURSE_CODE} Chapter {N} Objective {M}`

Example: `2B1 Chapter 1 Objective 3`

## Course Title Format

Course title should be just the class, paper, and part (e.g., "Second Class Part B Paper 2").
The chapter names go in the category/topic titles (e.g., "Chapter 1", "Chapter 2").

## Post Description Structure

Each objective post's description contains:
1. **Vimeo embed** - Full responsive embed HTML (top)
2. **Tutoring agent iframe** - Below the video

```html
<!-- Vimeo embed (responsive 16:9 wrapper) -->
<div style="padding:56.25% 0 0 0;position:relative;">
  <iframe src="https://player.vimeo.com/video/{VIDEO_ID}?title=0&byline=0&portrait=0&badge=0&autopause=0&player_id=0&app_id=58479"
    frameborder="0"
    allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
    referrerpolicy="strict-origin-when-cross-origin"
    style="position:absolute;top:0;left:0;width:100%;height:100%;"
    title="{LESSON_ID}">
  </iframe>
</div>
<script src="https://player.vimeo.com/api/player.js"></script>

<!-- Tutoring agent iframe -->
<iframe
  src="https://fsachat.fullsteamahead.ca/?user={{contact.email}}&amp;lesson={lessonId}"
  width="100%"
  height="800"
  frameborder="0"
  allow="fullscreen">
</iframe>
```

Where `{lessonId}` is derived from video name (e.g., `2B1-1-3`).

## GHL Import Structure

- **Product/Title** = Course name (e.g., "Second Class Part B Paper 2")
- **Categories** = Chapters (e.g., "Chapter 1", "Chapter 2")
- **Posts** = Objectives (e.g., "Objective 1", "Objective 2")

## Running the Import

```bash
cd /home/debian/Projects/fullsteamahead-course-content-management

# Install dependencies (first time)
npm install

# Dry run to preview
npx tsx src/main.ts {COURSE_CODE} --dry-run

# Dry run with chapter filter
npx tsx src/main.ts {COURSE_CODE} --dry-run --chapter {N}

# Live import (all chapters)
npx tsx src/main.ts {COURSE_CODE} --title "{Course Title}"

# Live import (specific chapter)
npx tsx src/main.ts {COURSE_CODE} --title "{Course Title}" --chapter {N}
```

## Importing with Thumbnails

Thumbnails are extracted from Vimeo and uploaded to GHL media library, then set on posts.

### Step 1: Extract Thumbnails

```bash
# Extract thumbnails for all chapters
npx tsx src/extract_thumbnails.ts {COURSE_CODE} --output imports/{COURSE_CODE}/thumbnails.json

# Extract thumbnails for specific chapter
npx tsx src/extract_thumbnails.ts {COURSE_CODE} --chapter {N} --output imports/{COURSE_CODE}/thumbnails-ch{N}.json
```

### Step 2: Import with Thumbnails

```bash
# Import with thumbnails
npx tsx src/main.ts {COURSE_CODE} --title "{Course Title}" --thumbnails-file imports/{COURSE_CODE}/thumbnails.json
```

## Examples

### Import 2B1 course
```bash
npx tsx src/main.ts 2B1 --title "Second Class Part B Paper 1"
```

### Import 2B1 with thumbnails
```bash
npx tsx src/extract_thumbnails.ts 2B1 --output imports/2B1/thumbnails.json
npx tsx src/main.ts 2B1 --title "Second Class Part B Paper 1" --thumbnails-file imports/2B1/thumbnails.json
```

### Import only Chapter 1 of 2B2
```bash
npx tsx src/extract_thumbnails.ts 2B2 --chapter 1 --output imports/2B2/thumbnails-ch1.json
npx tsx src/main.ts 2B2 --title "Second Class Part B Paper 2" --chapter 1 --thumbnails-file imports/2B2/thumbnails-ch1.json
```

## Import History

Imported course JSONs are stored in `imports/{COURSE_CODE}/{DATE}.json` for reference and troubleshooting.