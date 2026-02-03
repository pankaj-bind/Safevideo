export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  TIMEOUT: 10000,
} as const;

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login/',
    SIGNUP: '/api/auth/signup/',
    LOGOUT: '/api/auth/logout/',
    REFRESH: '/api/auth/refresh/',
    ME: '/api/auth/me/',
  },
  VIDEOS: {
    UPLOAD: '/api/videos/upload/',
    LIST: '/api/videos/list/',
    STREAM: (id: string) => `/api/videos/stream/${id}/`,
    DELETE: (id: number) => `/api/videos/${id}/`,
  }
} as const;
