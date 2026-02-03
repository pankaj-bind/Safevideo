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
