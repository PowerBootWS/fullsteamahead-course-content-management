# Course Content Management

Import course content from Vimeo to GoHighLevel.

## Video Naming Convention

Videos must be named following this pattern:
```
{COURSE_CODE} Chapter {N} Objective {M}
```

Examples:
- `2B1 Chapter 1 Objective 3`
- `2B1 Chapter 2 Objective 1`
- `3A2 Chapter 1 Objective 5`

Where:
- `COURSE_CODE` = e.g., "2B1" (2nd Class Part B Paper 1)
- `N` = Chapter number
- `M` = Objective number within chapter

## Lesson ID Derivation

The lesson ID for the tutoring agent embed is derived as:
```
{COURSE_CODE}-{CHAPTER}-{OBJECTIVE}
```

Example: `2B1 Chapter 1 Objective 3` -> `2B1-1-3`

## CLI Usage

```bash
# Install dependencies
npm install

# Dry run - preview JSON without importing
npm run import:dry-run -- 2B1

# Live import (prompts for course title if not set)
npm run import -- 2B1

# With explicit course title
npm run import -- 2B1 --title "2nd Class Part B Paper 1"
```

## Environment Variables

See `.env.example` for required variables.

## Skills

See `skills/course-import.md` for the reusable import skill.
