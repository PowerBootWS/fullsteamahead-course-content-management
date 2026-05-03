# Course Import Skill
Import complete course content from Vimeo to GoHighLevel with thumbnails.

## When to Use

Use this skill when instructed to "create", "import", or "set up" a course. This is a **3-step process** that MUST be executed in full:

1. **Set Vimeo thumbnails** at 3-second mark for all videos
2. **Extract thumbnails** from Vimeo and upload to GHL media library
3. **Import course** to GHL with thumbnails applied to all objectives

**IMPORTANT**: Never skip steps 1 and 2. A complete course import includes thumbnails on every lesson.

## Video Naming Convention

Videos must follow: `{COURSE_CODE} Chapter {N} Objective {M}`

Example: `2B1 Chapter 1 Objective 3`

**IMPORTANT**: Before importing, check for and fix any videos with trailing underscores in their names (e.g., `2A1 Chapter 5 Objective 6_`). These won't match the naming pattern and will be skipped.

To find videos with underscores:
```bash
# Search Vimeo and identify videos with underscores in their names
node --input-type=module -e "
import * as dotenv from 'dotenv'; dotenv.config();
const VIMEO_TOKEN = process.env.VIMEO_ACCESS_TOKEN;
const videos = await fetch('https://api.vimeo.com/me/videos?query=' + process.argv[2] + '+Chapter&per_page=100', { headers: { 'Authorization': 'Bearer ' + VIMEO_TOKEN } }).then(r=>r.json());
videos.data.filter(v=>v.name.includes('_')).forEach(v=>console.log(v.uri.split('/').pop() + ': ' + v.name));
"
```

To rename a video (remove trailing underscore):
```bash
curl -X PATCH "https://api.vimeo.com/videos/{VIDEO_ID}?name={NEW_NAME}" \
  -H "Authorization: Bearer {VIMEO_TOKEN}"
```

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

## Complete Course Import Workflow

Every course import requires executing all three steps:

### Dry Runs

To preview without making changes, use `--dry-run`:

```bash
# Step 1 dry run (preview what would be set/extracted)
npx tsx src/extract_thumbnails.ts {COURSE_CODE} --set-thumbnails --time 3 --dry-run

# Step 2 dry run (preview the JSON that would be imported)
npx tsx src/main.ts {COURSE_CODE} --title "{Course Title}" --thumbnails-file imports/{COURSE_CODE}/thumbnails.json --dry-run
```

### Step 1: Set Vimeo Thumbnails + Extract to GHL

```bash
cd /home/debian/projects/fsa/fsa-course-content-management

# Create output directory
mkdir -p imports/{COURSE_CODE}

# Set thumbnails at 3 seconds, extract, and upload to GHL
npx tsx src/extract_thumbnails.ts {COURSE_CODE} --set-thumbnails --time 3 --output imports/{COURSE_CODE}/thumbnails.json
```

### Step 2: Import Course with Thumbnails

```bash
# Full course with thumbnails
npx tsx src/main.ts {COURSE_CODE} --title "{Course Title}" --thumbnails-file imports/{COURSE_CODE}/thumbnails.json
```

### Per-Chapter Import (if needed)

If importing chapters individually:

```bash
# Step 1: Extract thumbnails for specific chapter
npx tsx src/extract_thumbnails.ts {COURSE_CODE} --chapter {N} --set-thumbnails --time 3 --output imports/{COURSE_CODE}/thumbnails-ch{N}.json

# Step 2: Import that chapter
npx tsx src/main.ts {COURSE_CODE} --title "{Course Title}" --chapter {N} --thumbnails-file imports/{COURSE_CODE}/thumbnails-ch{N}.json
```

## Examples

### Complete 2B1 Course Import
```bash
cd /home/debian/projects/fsa/fsa-course-content-management
mkdir -p imports/2B1

# Step 1: Set thumbnails at 3s and extract to GHL
npx tsx src/extract_thumbnails.ts 2B1 --set-thumbnails --time 3 --output imports/2B1/thumbnails.json

# Step 2: Import course with thumbnails
npx tsx src/main.ts 2B1 --title "Second Class Part B Paper 1" --thumbnails-file imports/2B1/thumbnails.json
```

### Complete 2B2 Course Import
```bash
cd /home/debian/projects/fsa/fsa-course-content-management
mkdir -p imports/2B2

# Step 1: Set thumbnails at 3s and extract to GHL
npx tsx src/extract_thumbnails.ts 2B2 --set-thumbnails --time 3 --output imports/2B2/thumbnails.json

# Step 2: Import course with thumbnails
npx tsx src/main.ts 2B2 --title "Second Class Part B Paper 2" --thumbnails-file imports/2B2/thumbnails.json
```

### Chapter-by-Chapter Import
```bash
# Chapter 1 only
mkdir -p imports/2B2
npx tsx src/extract_thumbnails.ts 2B2 --chapter 1 --set-thumbnails --time 3 --output imports/2B2/thumbnails-ch1.json
npx tsx src/main.ts 2B2 --title "Second Class Part B Paper 2" --chapter 1 --thumbnails-file imports/2B2/thumbnails-ch1.json
```

## Import History

Imported course JSONs are stored in `imports/{COURSE_CODE}/{DATE}.json` for reference and troubleshooting.