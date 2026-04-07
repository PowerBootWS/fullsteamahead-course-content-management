/**
 * Main orchestration script for importing courses from Vimeo to GHL.
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { parseArgs } from 'util';
import { createGHLClient } from './ghl_client.js';
import { parseVideoName, isValidVideoForCourse } from './video_parser.js';
import { buildCourseJson, getCourseSummary, type VideoDetails } from './course_builder.js';

dotenv.config();

// Environment variables
const GHL_API = process.env.GOHIGHLEVEL_API;
const GHL_LOCATION_ID = process.env.GOHIGHLEVEL_LOCATION_ID;
const COURSE_TITLE = process.env.COURSE_TITLE;

interface CliOptions {
  courseCode: string;
  dryRun: boolean;
  title?: string;
  chapter?: number;
  thumbnailsFile?: string;
}

function parseCliArgs(): CliOptions {
  const { values, positionals } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      title: { type: 'string' },
      chapter: { type: 'string' },
      'thumbnails-file': { type: 'string' },
    },
    allowPositionals: true,
  });

  if (positionals.length === 0) {
    console.error('Error: Course code is required');
    console.error('Usage: npx tsx src/main.ts <COURSE_CODE> [--dry-run] [--title "Course Title"] [--chapter N] [--thumbnails-file FILE]');
    process.exit(1);
  }

  return {
    courseCode: positionals[0],
    dryRun: values['dry-run'] as boolean,
    title: values.title as string | undefined,
    chapter: values.chapter ? parseInt(values.chapter as string, 10) : undefined,
    thumbnailsFile: values['thumbnails-file'] as string | undefined,
  };
}

async function promptForCourseTitle(): Promise<string> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Enter the full course title: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function searchVimeoVideos(accessToken: string, query: string): Promise<any[]> {
  // Search ONLY the authenticated user's videos, not all of Vimeo
  const response = await fetch(
    `https://api.vimeo.com/me/videos?query=${encodeURIComponent(query)}&sort=date&direction=asc&per_page=50`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Vimeo API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

async function getVimeoAccessToken(): Promise<string | null> {
  const clientId = process.env.VIMEO_CLIENT_ID;
  const clientSecret = process.env.VIMEO_CLIENT_SECRET;
  const tokenUrl = process.env.VIMEO_ACCESS_TOKEN_URL;

  if (!clientId || !clientSecret || !tokenUrl) {
    return null;
  }

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        'grant_type': 'client_credentials',
        'scope': 'public private edit upload stats',
      }),
    });

    if (!response.ok) {
      console.error(`OAuth2 token error: ${response.status}`);
      return null;
    }

    const data = await response.json() as { access_token?: string };
    return data.access_token || null;
  } catch (error) {
    console.error('Failed to get OAuth2 token:', error);
    return null;
  }
}

async function getVimeoVideoDetails(accessToken: string, videoId: string): Promise<any> {
  const response = await fetch(`https://api.vimeo.com/videos/${videoId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Vimeo API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function main() {
  const options = parseCliArgs();
  const { courseCode, dryRun, title: cliTitle, chapter: chapterFilter } = options;

  // Validate required env vars
  if (!GHL_API || !GHL_LOCATION_ID) {
    console.error('Error: Missing required environment variables');
    console.error('Required: GOHIGHLEVEL_API, GOHIGHLEVEL_LOCATION_ID');
    process.exit(1);
  }

  let vimeoToken: string | undefined = process.env.VIMEO_ACCESS_TOKEN || undefined;
  if (!vimeoToken) {
    console.log('No VIMEO_ACCESS_TOKEN found, attempting OAuth2 authentication...');
    const oauthToken = await getVimeoAccessToken();
    if (!oauthToken) {
      console.error('Error: Could not authenticate with Vimeo. Provide VIMEO_ACCESS_TOKEN or valid OAuth2 credentials.');
      process.exit(1);
    }
    vimeoToken = oauthToken;
    console.log('Successfully obtained OAuth2 access token');
  }

  // Get course title
  const courseTitle = cliTitle || COURSE_TITLE;
  if (!courseTitle) {
    console.log(`\nNo course title provided via --title flag or COURSE_TITLE env var.`);
    console.log(`Searching for videos with course code: ${courseCode}`);
    console.log(`\nPlease provide the full course title.\n`);
    const providedTitle = await promptForCourseTitle();
    if (!providedTitle) {
      console.error('Error: Course title is required');
      process.exit(1);
    }
    (globalThis as any).courseTitleFromPrompt = providedTitle;
  }

  const finalTitle = (globalThis as any).courseTitleFromPrompt || courseTitle;

  console.log(`\n=== Course Import ===`);
  console.log(`Course Code: ${courseCode}`);
  console.log(`Course Title: ${finalTitle}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no import)' : 'LIVE IMPORT'}`);
  console.log('');

  // Search Vimeo for videos matching the course code
  console.log(`Searching Vimeo for videos matching "${courseCode} Chapter"...`);
  const searchResults = await searchVimeoVideos(vimeoToken, `${courseCode} Chapter`);

  if (searchResults.length === 0) {
    console.log('No videos found matching the pattern.');
    process.exit(0);
  }

  console.log(`Found ${searchResults.length} videos`);

  // Load thumbnails from file if provided
  let thumbnails: Record<string, any> = {};
  if (options.thumbnailsFile) {
    try {
      const content = fs.readFileSync(options.thumbnailsFile, 'utf-8');
      thumbnails = JSON.parse(content);
      console.log(`Loaded ${Object.keys(thumbnails).length} thumbnails from ${options.thumbnailsFile}`);
    } catch (error) {
      console.error(`Failed to load thumbnails file: ${error}`);
    }
  }

  // Parse and filter videos for this course
  const videoDetails: VideoDetails[] = [];

  for (const video of searchResults) {
    const name = video.name;

    if (!isValidVideoForCourse(name, courseCode)) {
      console.log(`  Skipping "${name}" - doesn't match course ${courseCode}`);
      continue;
    }

    const parsed = parseVideoName(name);
    if (!parsed) {
      continue;
    }

    // Filter by chapter if specified
    if (chapterFilter !== undefined && parsed.chapter !== chapterFilter) {
      console.log(`  Skipping "${name}" - chapter ${parsed.chapter} != ${chapterFilter}`);
      continue;
    }

    const videoId = video.uri.split('/').pop() || video.id;
    const embedUrl = `https://vimeo.com/${videoId}`;

    const videoDetail: VideoDetails = {
      parsed,
      videoId,
      embedUrl,
      duration: video.duration,
    };

    // Add thumbnail URL if available
    if (thumbnails[parsed.lessonId]?.ghlUrl) {
      videoDetail.thumbnailUrl = thumbnails[parsed.lessonId].ghlUrl;
    }

    videoDetails.push(videoDetail);

    console.log(`  Found: ${name} -> lesson ${parsed.lessonId}`);
  }

  if (videoDetails.length === 0) {
    console.log('\nNo valid videos found for this course.');
    process.exit(0);
  }

  // Sort by chapter and objective
  videoDetails.sort((a, b) => {
    if (a.parsed.chapter !== b.parsed.chapter) {
      return a.parsed.chapter - b.parsed.chapter;
    }
    return a.parsed.objective - b.parsed.objective;
  });

  console.log(`\nParsed ${videoDetails.length} videos for import`);

  // Build course JSON
  const courseJson = buildCourseJson(videoDetails, finalTitle);
  const summary = getCourseSummary(videoDetails, finalTitle);

  console.log(`\n=== Course Summary ===`);
  console.log(`Title: ${summary.courseTitle}`);
  console.log(`Chapters: ${summary.totalChapters}`);
  console.log(`Objectives: ${summary.totalObjectives}`);
  for (const ch of summary.chapters) {
    console.log(`  ${ch.title}: ${ch.objectives} objectives`);
  }

  if (dryRun) {
    console.log('\n=== JSON Payload (Dry Run) ===');
    console.log(JSON.stringify(courseJson, null, 2));
    console.log('\nDry run complete. No changes made.');
    process.exit(0);
  }

  // Import to GHL
  console.log('\nImporting to GoHighLevel...');

  const ghlClient = createGHLClient(GHL_API, GHL_LOCATION_ID);
  const result = await ghlClient.importCourse(courseJson);

  if (result.success) {
    console.log('\n=== SUCCESS ===');
    console.log('Course imported successfully to GoHighLevel!');
    console.log('Check your GHL dashboard for the new course.');
  } else {
    console.error('\n=== ERROR ===');
    console.error(`Import failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
