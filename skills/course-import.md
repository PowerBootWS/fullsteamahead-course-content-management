# Course Import Skill

Import a new course from Vimeo to GoHighLevel.

## When to Use

Use this skill when instructed to import a new course. Each course requires:
1. Getting video metadata from Vimeo
2. Parsing video names to extract chapter/objective
3. Building the GHL import JSON
4. Importing to GHL

## Video Naming Convention

Videos must follow: `{COURSE_CODE} Chapter {N} Objective {M}`

Example: `2B1 Chapter 1 Objective 3`

## Import Steps

1. **Get videos from Vimeo** - Search for videos matching `${COURSE_CODE} Chapter`

2. **Parse video names** - Each video name is parsed to extract:
   - Course code (e.g., `2B1`)
   - Chapter number (e.g., `1`)
   - Objective number (e.g., `3`)
   - Lesson ID (e.g., `2B1-1-3` for tutoring agent)

3. **Build course JSON** - Create GHL import structure:
   - Categories = Chapters
   - Posts = Objectives (lessons)

4. **Generate embed codes**:
   - Vimeo embed in post content
   - Tutoring agent iframe in post description

5. **Import to GHL** - POST to GHL courses import API

## Tutoring Agent Embed

Each objective post description includes:
```html
<iframe
  src="https://fsachat.fullsteamahead.ca/?user={{contact.email}}&amp;lesson={lessonId}"
  width="100%"
  height="800"
  frameborder="0"
  allow="fullscreen">
</iframe>
```

Where `{lessonId}` is derived from video name (e.g., `2B1-1-3`).

## Running the Import

```bash
# Navigate to project
cd /home/debian/Projects/fullsteamahead-course-content-management

# Install dependencies (first time)
npm install

# Dry run to preview
npx tsx src/main.ts {COURSE_CODE} --dry-run

# Live import
npx tsx src/main.ts {COURSE_CODE} --title "{Full Course Title}"
```

## Example

Importing 2B1 course:
```bash
npx tsx src/main.ts 2B1 --title "2nd Class Part B Paper 1"
```

This will:
1. Search Vimeo for videos matching "2B1 Chapter"
2. Create chapters (topics) for each unique chapter number
3. Create posts (objectives) for each video
4. Add tutoring agent iframe with lesson IDs like `2B1-1-3`
5. Import everything to GHL in one API call
