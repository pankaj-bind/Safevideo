/**
 * API Types - Strict TypeScript interfaces for all API interactions
 */

// ============================================================================
// User Types
// ============================================================================
export interface User {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  date_joined: string;
  is_active?: boolean;
}

// ============================================================================
// API Response Types
// ============================================================================
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: ApiError;
  data?: T;
  user?: User;
}

export interface ApiError {
  type: string;
  message: string;
}

// ============================================================================
// Hierarchical Content Types
// ============================================================================

/** Video type - either uploaded or YouTube */
export type VideoType = 'UPLOAD' | 'YOUTUBE';

/** Video processing status */
export type VideoStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/** Vault - top level container */
export interface Vault {
  id: number;
  title: string;
  description: string;
  icon: string;
  subject_count: number;
  created_at: string;
  updated_at: string;
}

/** Subject - second level, belongs to a Vault */
export interface Subject {
  id: number;
  vault: number;
  vault_title?: string;
  title: string;
  description: string;
  order: number;
  chapter_count: number;
  created_at: string;
  updated_at: string;
}

/** Chapter - third level, belongs to a Subject */
export interface Chapter {
  id: number;
  subject: number;
  subject_title?: string;
  vault_id?: number;
  vault_title?: string;
  title: string;
  description: string;
  order: number;
  video_count?: number;
  videos?: Video[];
  created_at: string;
  updated_at: string;
}

/** Video - content item, belongs to a Chapter */
export interface Video {
  id: number;
  chapter?: number;
  title: string;
  description: string;
  video_type: VideoType;
  file_id: string | null;
  youtube_url: string;
  status: VideoStatus;
  error_message: string | null;
  order: number;
  duration: number | null;
  is_playable: boolean;
  created_at: string;
  updated_at: string;
}

/** Breadcrumb navigation item */
export interface BreadcrumbItem {
  id: number;
  title: string;
}

/** Full breadcrumb data */
export interface Breadcrumb {
  vault?: BreadcrumbItem;
  subject?: BreadcrumbItem;
  chapter?: BreadcrumbItem;
}

// ============================================================================
// Form/Create Types
// ============================================================================

export interface VaultCreate {
  title: string;
  description?: string;
  icon?: string;
}

export interface SubjectCreate {
  vault: number;
  title: string;
  description?: string;
  order?: number;
}

export interface ChapterCreate {
  subject: number;
  title: string;
  description?: string;
  order?: number;
}

export interface VideoCreate {
  chapter: number;
  title: string;
  description?: string;
  video_type: VideoType;
  youtube_url?: string;
  order?: number;
}

// ============================================================================
// Auth Request Types
// ============================================================================
export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  username: string;
  password: string;
  password_confirm: string;
}

export interface AuthResponse extends ApiResponse {
  user: User;
}

// ============================================================================
// Dashboard Types
// ============================================================================
export interface DashboardData {
  user: User;
  permissions: string[];
  groups: string[];
}

export interface DashboardResponse extends ApiResponse {
  data: DashboardData;
}

// ============================================================================
// Auth Context Types
// ============================================================================
export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  signup: (data: SignupRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
}

// ============================================================================
// Component Props Types
// ============================================================================
export interface ProtectedLayoutProps {
  children: React.ReactNode;
}

export interface AuthFormProps {
  onSuccess?: () => void;
}
