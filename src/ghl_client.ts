/**
 * GoHighLevel API client for course import.
 * API Docs: https://marketplace.gohighlevel.com/docs/ghl/courses/import-courses
 */

import axios, { AxiosError } from 'axios';

const GHL_API_BASE = 'https://services.leadconnectorhq.com/courses/courses-exporter/public/import';
const GHL_API_VERSION = '2021-07-28';

export interface GHLImportPayload {
  locationId: string;
  products: GHLProduct[];
}

export interface GHLProduct {
  title: string;
  description?: string;
  imageUrl?: string;
  categories?: GHLCategory[];
  instructorDetails?: GHLInstructor;
}

export interface GHLCategory {
  title: string;
  visibility: 'published' | 'draft';
  thumbnailUrl?: string;
  posts?: GHLPost[];
  subCategories?: GHLSubCategory[];
}

export interface GHLSubCategory {
  title: string;
  visibility: 'published' | 'draft';
  thumbnailUrl?: string;
  posts?: GHLPost[];
}

export interface GHLPost {
  title: string;
  visibility: 'published' | 'draft';
  thumbnailUrl?: string;
  contentType: string;
  description?: string;
  bucketVideoUrl?: string;
  postMaterials?: GHLEPostMaterial[];
  embedHtml?: string;
}

export interface GHLEPostMaterial {
  title: string;
  type: string;
  url: string;
}

export interface GHLInstructor {
  name: string;
  description?: string;
}

export interface GHLImportResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export class GHLClient {
  private apiKey: string;
  private locationId: string;

  constructor(apiKey: string, locationId: string) {
    this.apiKey = apiKey;
    this.locationId = locationId;
  }

  async importCourse(payload: Omit<GHLImportPayload, 'locationId'>): Promise<GHLImportResponse> {
    // Ensure locationId is at root level
    const fullPayload: GHLImportPayload = {
      ...payload,
      locationId: this.locationId,
    };

    try {
      const response = await axios.post(GHL_API_BASE, fullPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Version': GHL_API_VERSION,
        },
      });

      if (response.status === 201 || response.status === 200) {
        return {
          success: true,
          message: 'Course imported successfully',
        };
      }

      return {
        success: false,
        error: `Unexpected response status: ${response.status}`,
      };
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        const data = error.response?.data;

        if (status === 401) {
          return {
            success: false,
            error: 'Authentication failed. Check your GOHIGHLEVEL_API key.',
          };
        }

        if (status === 400) {
          return {
            success: false,
            error: `Invalid request: ${JSON.stringify(data)}`,
          };
        }

        return {
          success: false,
          error: `API error (${status}): ${JSON.stringify(data)}`,
        };
      }

      return {
        success: false,
        error: `Unexpected error: ${error}`,
      };
    }
  }
}

export function createGHLClient(apiKey: string, locationId: string): GHLClient {
  return new GHLClient(apiKey, locationId);
}
