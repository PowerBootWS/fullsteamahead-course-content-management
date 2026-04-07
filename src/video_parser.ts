/**
 * Parse Vimeo video names to extract course structure.
 * Expected format: "{COURSE_CODE} Chapter {N} Objective {M}"
 * Example: "2B1 Chapter 1 Objective 3" -> { course: "2B1", chapter: 1, objective: 3, lessonId: "2B1-1-3" }
 */

export interface ParsedVideo {
  course: string;
  chapter: number;
  objective: number;
  lessonId: string;
  originalName: string;
}

const VIDEO_NAME_PATTERN = /^([A-Z0-9]+)\s+Chapter\s+(\d+)\s+Objective\s+(\d+)$/i;

export function parseVideoName(name: string): ParsedVideo | null {
  const match = name.match(VIDEO_NAME_PATTERN);

  if (!match) {
    return null;
  }

  const [, course, chapterStr, objectiveStr] = match;
  const chapter = parseInt(chapterStr, 10);
  const objective = parseInt(objectiveStr, 10);

  if (isNaN(chapter) || isNaN(objective)) {
    return null;
  }

  return {
    course: course.toUpperCase(),
    chapter,
    objective,
    lessonId: `${course.toUpperCase()}-${chapter}-${objective}`,
    originalName: name,
  };
}

/**
 * Check if a video name matches the expected pattern for a specific course.
 */
export function isValidVideoForCourse(name: string, courseCode: string): boolean {
  const parsed = parseVideoName(name);
  return parsed !== null && parsed.course === courseCode.toUpperCase();
}

/**
 * Group items by chapter number (extracted from a getter function).
 */
export function groupByChapter<T>(
  videos: T[],
  getChapter: (item: T) => number
): Map<number, T[]> {
  const grouped = new Map<number, T[]>();

  for (const video of videos) {
    const chapter = getChapter(video);
    const existing = grouped.get(chapter) || [];
    existing.push(video);
    grouped.set(chapter, existing);
  }

  // Sort chapters numerically
  return new Map([...grouped.entries()].sort((a, b) => a[0] - b[0]));
}
