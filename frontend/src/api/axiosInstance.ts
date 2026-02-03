/**
 * Axios Instance with Interceptors
 * Handles automatic token refresh on 401 responses
 * 
 * Security: Uses withCredentials for HttpOnly cookie transmission
 */
import axios, { 
  AxiosError, 
  AxiosInstance, 
  AxiosResponse,
  InternalAxiosRequestConfig 
} from 'axios';
import { API_CONFIG, API_ENDPOINTS } from '../config/api.config';

// ============================================================================
// Types
// ============================================================================
interface FailedRequest {
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}

// ============================================================================
// State for Token Refresh Queue
// ============================================================================
let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

const processQueue = (error: Error | null = null): void => {
  failedQueue.forEach((request) => {
    if (error) {
      request.reject(error);
    } else {
      request.resolve();
    }
  });
  failedQueue = [];
};

// ============================================================================
// Axios Instance Configuration
// ============================================================================
const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Critical: Sends cookies with every request
});

// ============================================================================
// Request Interceptor
// ============================================================================
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Cookies are sent automatically with withCredentials: true
    // No need to manually attach tokens
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// ============================================================================
// Response Interceptor - Silent Token Refresh
// ============================================================================
axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only handle 401 errors and avoid infinite loops
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Skip refresh for auth endpoints to prevent loops
    const isAuthEndpoint = originalRequest.url?.includes('/api/auth/');
    const isRefreshEndpoint = originalRequest.url?.includes('/refresh');
    
    if (isAuthEndpoint && !isRefreshEndpoint) {
      return Promise.reject(error);
    }

    // If already refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then(() => axiosInstance(originalRequest))
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Attempt silent refresh
      await axios.post(
        `${API_CONFIG.BASE_URL}${API_ENDPOINTS.AUTH.REFRESH}`,
        {},
        { withCredentials: true }
      );

      processQueue();
      
      // Retry original request with new token (in cookie)
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError as Error);
      
      // Refresh failed - redirect to login
      // Dispatch custom event for AuthProvider to handle
      window.dispatchEvent(new CustomEvent('auth:sessionExpired'));
      
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default axiosInstance;
