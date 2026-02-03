export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || '',
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
  // Hierarchical Content Vault API
  VAULTS: {
    LIST: '/api/videos/vaults/',
    CREATE: '/api/videos/vaults/',
    DETAIL: (id: number) => `/api/videos/vaults/${id}/`,
    UPDATE: (id: number) => `/api/videos/vaults/${id}/`,
    DELETE: (id: number) => `/api/videos/vaults/${id}/`,
  },
  SUBJECTS: {
    LIST: '/api/videos/subjects/',
    BY_VAULT: (vaultId: number) => `/api/videos/subjects/?vault=${vaultId}`,
    CREATE: '/api/videos/subjects/',
    DETAIL: (id: number) => `/api/videos/subjects/${id}/`,
    UPDATE: (id: number) => `/api/videos/subjects/${id}/`,
    DELETE: (id: number) => `/api/videos/subjects/${id}/`,
  },
  CHAPTERS: {
    LIST: '/api/videos/chapters/',
    BY_SUBJECT: (subjectId: number) => `/api/videos/chapters/?subject=${subjectId}`,
    CREATE: '/api/videos/chapters/',
    DETAIL: (id: number) => `/api/videos/chapters/${id}/`,
    UPDATE: (id: number) => `/api/videos/chapters/${id}/`,
    DELETE: (id: number) => `/api/videos/chapters/${id}/`,
    BREADCRUMB: (id: number) => `/api/videos/chapters/${id}/breadcrumb/`,
  },
  VIDEOS: {
    LIST: '/api/videos/items/',
    BY_CHAPTER: (chapterId: number) => `/api/videos/items/?chapter=${chapterId}`,
    CREATE: '/api/videos/items/',
    DETAIL: (id: number) => `/api/videos/items/${id}/`,
    UPDATE: (id: number) => `/api/videos/items/${id}/`,
    DELETE: (id: number) => `/api/videos/items/${id}/`,
    // Legacy endpoints
    UPLOAD: '/api/videos/upload/',
    LEGACY_LIST: '/api/videos/list/',
    STREAM: (fileId: string) => `/api/videos/stream/${fileId}/`,
    LEGACY_DELETE: (id: number) => `/api/videos/${id}/`,
  }
} as const;
