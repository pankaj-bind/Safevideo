/**
 * useAxios Hook
 * Provides typed axios instance with automatic token refresh
 */
import { useCallback } from 'react';
import axiosInstance from '../api/axiosInstance';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

interface UseAxiosReturn {
  get: <T>(url: string, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
  delete: <T>(url: string, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
}

export const useAxios = (): UseAxiosReturn => {
  const get = useCallback(<T>(url: string, config?: AxiosRequestConfig) => {
    return axiosInstance.get<T>(url, config);
  }, []);

  const post = useCallback(<T>(url: string, data?: unknown, config?: AxiosRequestConfig) => {
    return axiosInstance.post<T>(url, data, config);
  }, []);

  const put = useCallback(<T>(url: string, data?: unknown, config?: AxiosRequestConfig) => {
    return axiosInstance.put<T>(url, data, config);
  }, []);

  const patch = useCallback(<T>(url: string, data?: unknown, config?: AxiosRequestConfig) => {
    return axiosInstance.patch<T>(url, data, config);
  }, []);

  const del = useCallback(<T>(url: string, config?: AxiosRequestConfig) => {
    return axiosInstance.delete<T>(url, config);
  }, []);

  return {
    get,
    post,
    put,
    patch,
    delete: del,
  };
};

export default useAxios;
