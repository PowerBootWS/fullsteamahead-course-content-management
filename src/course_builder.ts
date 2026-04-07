/**
 * Build GHL course JSON structure from video data.
 */

import { ParsedVideo, groupByChapter } from './video_parser.js';
import type {
  GHLImportPayload,
  GHLProduct,
  GHLCategory,
  GHLPost,
} from './ghl_client.js';

export interface VideoDetails {
  parsed: ParsedVideo;
  videoId: string;
  embedUrl: string;
  duration?: number;
}

const TUTORING_AGENT_BASE_URL = 'https://fsachat.fullsteamahead.ca';
const VIMEO_EMBED_BASE = 'https://player.vimeo.com/video';

export function generateVimeoEmbedHtml(videoId: string, title?: string): string {
  // Full responsive Vimeo embed with 16:9 aspect ratio wrapper
  // Matches the format that GHL expects for embed source
  return `<div style="padding:56.25% 0 0 0;position:relative;"><iframe src="${VIMEO_EMBED_BASE}/${videoId}?title=0&byline=0&portrait=0&badge=0&autopause=0&player_id=0&app_id=58479" frameborder="0" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share" referrerpolicy="strict-origin-when-cross-origin" style="position:absolute;top:0;left:0;width:100%;height:100%;" title="${title || 'Video'}"></iframe></div><script src="https://player.vimeo.com/api/player.js"></script>`;
}

export function generateTutoringAgentHtml(lessonId: string): string {
  return `<iframe
  src="${TUTORING_AGENT_BASE_URL}/?user={{contact.email}}&amp;lesson=${lessonId}"
  width="100%"
  height="800"
  frameborder="0"
  allow="fullscreen">
</iframe>`;
}

export function buildCourseJson(
  videos: VideoDetails[],
  courseTitle: string,
  courseDescription?: string
): Omit<GHLImportPayload, 'locationId'> {
  // Group videos by chapter and sort chapters numerically
  const groupedByChapter = groupByChapter(videos, (v) => v.parsed.chapter);

  const categories: GHLCategory[] = [];

  for (const [chapterNum, chapterVideos] of groupedByChapter) {
    // Sort objectives within each chapter numerically
    const sortedVideos = [...chapterVideos].sort(
      (a, b) => a.parsed.objective - b.parsed.objective
    );

    const posts: GHLPost[] = sortedVideos.map((video) => {
      const tutoringAgentHtml = generateTutoringAgentHtml(video.parsed.lessonId);
      const vimeoEmbedHtml = generateVimeoEmbedHtml(video.videoId, video.parsed.lessonId);

      return {
        title: `Objective ${video.parsed.objective}`,
        visibility: 'published' as const,
        contentType: 'video',
        // Description: Vimeo embed first, then tutoring agent below
        description: `${vimeoEmbedHtml}\n\n${tutoringAgentHtml}`,
      };
    });

    categories.push({
      title: `Chapter ${chapterNum}`,
      visibility: 'published',
      posts,
    });
  }

  // Sort categories by chapter number (already done via Map ordering)
  categories.sort((a, b) => {
    const aNum = parseInt(a.title.replace('Chapter ', ''), 10);
    const bNum = parseInt(b.title.replace('Chapter ', ''), 10);
    return aNum - bNum;
  });

  const product: GHLProduct = {
    title: courseTitle,
    description: courseDescription || `Course imported from Vimeo: ${courseTitle}`,
  };

  if (categories.length > 0) {
    product.categories = categories;
  }

  return {
    products: [product],
  };
}

export interface CourseSummary {
  courseTitle: string;
  totalChapters: number;
  totalObjectives: number;
  chapters: { title: string; objectives: number }[];
}

export function getCourseSummary(videos: VideoDetails[], courseTitle: string): CourseSummary {
  const groupedByChapter = groupByChapter(videos, (v) => v.parsed.chapter);

  const chapters: { title: string; objectives: number }[] = [];
  let totalObjectives = 0;

  for (const [chapterNum, chapterVideos] of groupedByChapter) {
    const objectives = chapterVideos.length;
    totalObjectives += objectives;
    chapters.push({
      title: `Chapter ${chapterNum}`,
      objectives,
    });
  }

  return {
    courseTitle,
    totalChapters: chapters.length,
    totalObjectives,
    chapters,
  };
}
