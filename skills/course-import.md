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

## Example

Importing 2B1 course:
```bash
npx tsx src/main.ts 2B1 --title "Second Class Part B Paper 1"
```

Importing only Chapter 1 of 2B2:
```bash
npx tsx src/main.ts 2B2 --title "Second Class Part B Paper 2" --chapter 1
```

## Import History

Imported course JSONs are stored in `imports/{COURSE_CODE}/{DATE}.json` for reference and troubleshooting.