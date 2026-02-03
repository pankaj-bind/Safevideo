/**
 * Auth Service
 * API calls for authentication endpoints
 */
import axiosInstance from './axiosInstance';
import { API_ENDPOINTS } from '../config/api.config';
import type { 
  AuthResponse, 
  LoginRequest, 
  SignupRequest, 
  ApiResponse 
} from '../types/api.types';

export const authService = {
  /**
   * Login user with email and password
   * Tokens are set as HttpOnly cookies by the server
   */
  login: async (credentials: LoginRequest): Promise<AuthResponse> => {
    const response = await axiosInstance.post<AuthResponse>(
      API_ENDPOINTS.AUTH.LOGIN,
      credentials
    );
    return response.data;
  },

  /**
   * Register new user
   * Tokens are set as HttpOnly cookies by the server
   */
  signup: async (data: SignupRequest): Promise<AuthResponse> => {
    const response = await axiosInstance.post<AuthResponse>(
      API_ENDPOINTS.AUTH.SIGNUP,
      data
    );
    return response.data;
  },

  /**
   * Logout user
   * Server blacklists refresh token and clears cookies
   */
  logout: async (): Promise<ApiResponse> => {
    const response = await axiosInstance.post<ApiResponse>(
      API_ENDPOINTS.AUTH.LOGOUT
    );
    return response.data;
  },

  /**
   * Refresh access token
   * Server rotates tokens and sets new cookies
   */
  refresh: async (): Promise<ApiResponse> => {
    const response = await axiosInstance.post<ApiResponse>(
      API_ENDPOINTS.AUTH.REFRESH
    );
    return response.data;
  },

  /**
   * Get current authenticated user
   * Used to verify auth state on app load
   */
  getCurrentUser: async (): Promise<AuthResponse> => {
    const response = await axiosInstance.get<AuthResponse>(
      API_ENDPOINTS.AUTH.ME
    );
    return response.data;
  },
};

export default authService;
