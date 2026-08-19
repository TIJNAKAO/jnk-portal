import { useCallback } from 'react';
import { useAuth } from '../context/AuthProvider';
import { apiDownload, apiRequest } from './api';

/** `apiRequest` já com o token da sessão atual injetado automaticamente. */
export function useApi() {
  const { token } = useAuth();

  return useCallback(
    <T>(path: string, options: Omit<Parameters<typeof apiRequest<T>>[1], 'token'> = {}) =>
      apiRequest<T>(path, { ...options, token }),
    [token],
  );
}

/** `apiDownload` já com o token da sessão atual injetado automaticamente. */
export function useApiDownload() {
  const { token } = useAuth();

  return useCallback(
    (path: string, options: Omit<Parameters<typeof apiDownload>[1], 'token'>) =>
      apiDownload(path, { ...options, token }),
    [token],
  );
}
