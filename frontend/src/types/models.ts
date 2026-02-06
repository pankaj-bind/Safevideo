/**
 * Shared Video types used across the application
 */

export type VideoStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELED';

export interface Video {
  id: number;
  title: string;
  status: VideoStatus;
  error_message?: string | null;
  created_at: string;
  file_id?: string | null;
  folder_path?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  duration?: number | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
}

export interface Category {
  id: number;
  name: string;
  slug?: string;
  organizations: Organization[];
  organization_count: number;
}

export interface Organization {
  id: number;
  name: string;
  slug?: string;
  logo: string | null;
  logo_url?: string | null;
  credential_count: number;
}

export interface Note {
  id: string;
  videoId: number;
  content: string;
  timestamp?: number;
  createdAt: string;
}
