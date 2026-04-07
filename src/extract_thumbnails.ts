/**
 * Extract thumbnails from Vimeo videos and upload to GHL media library.
 *
 * This script:
 * 1. Searches Vimeo for videos matching the course code
 * 2. Downloads each video's thumbnail image
 * 3. Uploads to GHL media library
 * 4. Outputs a JSON mapping of videoId -> GHL thumbnail URL
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { parseArgs } from 'util';
import { createGHLClient, GHLClient } from './ghl_client.js';
import { parseVideoName, isValidVideoForCourse } from './video_parser.js';

dotenv.config();

// Environment variables
const GHL_API = process.env.GOHIGHLEVEL_API!;
const GHL_LOCATION_ID = process.env.GOHIGHLEVEL_LOCATION_ID!;
const VIMEO_ACCESS_TOKEN = process.env.VIMEO_ACCESS_TOKEN!;

interface ThumbnailResult {
  videoId: string;
  lessonId: string;
  vimeoThumbnailUrl: string;
  ghlUrl?: string;
  success: boolean;
  error?: string;
}

/**
 * Download a file from URL to a local path
 */
function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {}); // Ignore unlink errors
      reject(err);
    });
  });
}

/**
 * Get thumbnail URL from Vimeo video details
 */
async function getVimeoThumbnailUrl(accessToken: string, videoId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://api.vimeo.com/videos/${videoId}?fields=pictures`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Failed to get video details for ${videoId}: ${response.status}`);
      return null;
    }

    const data = await response.json() as any;
    const pictures = data.pictures?.sizes;

    if (!pictures || pictures.length === 0) {
      return null;
    }

    // Find a good sized thumbnail (prefer 640px or larger)
    const thumbnail = pictures.find((p: any) => p.width >= 640) || pictures[pictures.length - 1];

    return thumbnail?.link || null;
  } catch (error) {
    console.error(`Error fetching thumbnail for ${videoId}:`, error);
    return null;
  }
}

/**
 * Search Vimeo for videos matching course code
 */
async function searchVimeoVideos(accessToken: string, query: string): Promise<any[]> {
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

/**
 * Upload a local file to GHL media library
 */
async function uploadToGHL(ghlClient: GHLClient, filePath: string, mimeType: string): Promise<string | null> {
  const result = await ghlClient.uploadMedia(filePath, mimeType);
  if (result.success && result.url) {
    return result.url;
  }
  console.error(`GHL upload failed: ${result.error}`);
  return null;
}

/**
 * Process a single video: download thumbnail and upload to GHL
 */
async function processVideo(
  accessToken: string,
  ghlClient: GHLClient,
  video: any,
  courseCode: string,
  tempDir: string,
  chapterFilter?: number
): Promise<ThumbnailResult> {
  const name = video.name;

  if (!isValidVideoForCourse(name, courseCode)) {
    return {
      videoId: video.uri.split('/').pop() || '',
      lessonId: '',
      vimeoThumbnailUrl: '',
      success: false,
      error: 'Video does not match course code',
    };
  }

  const parsed = parseVideoName(name);
  if (!parsed) {
    return {
      videoId: video.uri.split('/').pop() || '',
      lessonId: '',
      vimeoThumbnailUrl: '',
      success: false,
      error: 'Failed to parse video name',
    };
  }

  // Filter by chapter if specified
  if (chapterFilter !== undefined && parsed.chapter !== chapterFilter) {
    return {
      videoId: video.uri.split('/').pop() || '',
      lessonId: parsed.lessonId,
      vimeoThumbnailUrl: '',
      success: false,
      error: 'Skipped (chapter filter)',
    };
  }

  const videoId = video.uri.split('/').pop() || '';
  const lessonId = parsed.lessonId;

  console.log(`Processing: ${name} -> ${lessonId}`);

  // Get thumbnail URL from Vimeo
  const thumbnailUrl = await getVimeoThumbnailUrl(accessToken, videoId);
  if (!thumbnailUrl) {
    return {
      videoId,
      lessonId,
      vimeoThumbnailUrl: '',
      success: false,
      error: 'Failed to get thumbnail URL from Vimeo',
    };
  }

  // Download thumbnail to temp file
  const ext = path.extname(new URL(thumbnailUrl).pathname) || '.jpg';
  const tempFile = path.join(tempDir, `${lessonId}${ext}`);

  try {
    await downloadFile(thumbnailUrl, tempFile);
  } catch (error) {
    return {
      videoId,
      lessonId,
      vimeoThumbnailUrl: thumbnailUrl,
      success: false,
      error: `Failed to download thumbnail: ${error}`,
    };
  }

  // Upload to GHL
  const ghlUrl = await uploadToGHL(ghlClient, tempFile, `image/${ext.slice(1)}`);

  // Clean up temp file
  fs.unlink(tempFile, () => {});

  if (!ghlUrl) {
    return {
      videoId,
      lessonId,
      vimeoThumbnailUrl: thumbnailUrl,
      success: false,
      error: 'Failed to upload to GHL',
    };
  }

  return {
    videoId,
    lessonId,
    vimeoThumbnailUrl: thumbnailUrl,
    ghlUrl,
    success: true,
  };
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      'output': { type: 'string' },
      chapter: { type: 'string' },
    },
    allowPositionals: true,
  });

  const courseCode = positionals[0];
  const chapterFilter = values.chapter ? parseInt(values.chapter as string, 10) : undefined;

  if (!courseCode) {
    console.error('Usage: npx tsx src/extract_thumbnails.ts <COURSE_CODE> [--dry-run] [--output FILE] [--chapter N]');
    process.exit(1);
  }

  if (!GHL_API || !GHL_LOCATION_ID || !VIMEO_ACCESS_TOKEN) {
    console.error('Missing required environment variables');
    process.exit(1);
  }

  const ghlClient = createGHLClient(GHL_API, GHL_LOCATION_ID);

  // Create temp directory for thumbnails
  const tempDir = path.join('/tmp', `thumbnails-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  console.log(`\n=== Thumbnail Extraction ===`);
  console.log(`Course Code: ${courseCode}`);
  if (chapterFilter) console.log(`Chapter Filter: ${chapterFilter}`);
  console.log(`Mode: ${values['dry-run'] ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  // Search Vimeo for videos
  console.log(`Searching Vimeo for "${courseCode} Chapter"...`);
  const searchResults = await searchVimeoVideos(VIMEO_ACCESS_TOKEN, `${courseCode} Chapter`);
  console.log(`Found ${searchResults.length} videos\n`);

  const results: ThumbnailResult[] = [];

  for (const video of searchResults) {
    const result = await processVideo(VIMEO_ACCESS_TOKEN, ghlClient, video, courseCode, tempDir, chapterFilter);
    results.push(result);

    if (result.success) {
      console.log(`  ✓ ${result.lessonId}: ${result.ghlUrl}`);
    } else if (result.error && !result.error.includes('Skipped')) {
      console.log(`  ✗ ${result.lessonId}: ${result.error}`);
    }
  }

  // Clean up temp directory
  fs.rmSync(tempDir, { recursive: true, force: true });

  // Output results
  console.log(`\n=== Summary ===`);
  console.log(`Total: ${results.length}`);
  console.log(`Success: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);

  // Write results to file or stdout
  const outputFile = values['output'];
  if (outputFile) {
    const output = results.reduce((acc, r) => {
      if (r.success && r.ghlUrl) {
        acc[r.lessonId] = {
          videoId: r.videoId,
          vimeoThumbnailUrl: r.vimeoThumbnailUrl,
          ghlUrl: r.ghlUrl,
        };
      }
      return acc;
    }, {} as Record<string, any>);

    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`\nResults written to: ${outputFile}`);
  } else {
    console.log('\nResults (lessonId -> GHL URL):');
    for (const r of results) {
      if (r.success) {
        console.log(`  ${r.lessonId}: ${r.ghlUrl}`);
      }
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});