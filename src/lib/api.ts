/**
 * Helper module for constructing API URLs and making safe fetch calls.
 */

export const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '';
};

export const getApiUrl = (path: string): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return cleanPath;
  }
  return `${baseUrl}${cleanPath}`;
};

export interface SafeFetchResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  isJson: boolean;
}

export async function safeFetch<T = any>(
  path: string,
  options?: RequestInit
): Promise<SafeFetchResponse<T>> {
  try {
    const url = getApiUrl(path);
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!isJson) {
      const text = await res.text().catch(() => '');
      try {
        const parsed = JSON.parse(text);
        return {
          ok: res.ok,
          status: res.status,
          data: parsed,
          isJson: true,
          error: !res.ok ? (parsed?.error || `HTTP ${res.status}`) : undefined
        };
      } catch {
        return {
          ok: false,
          status: res.status,
          isJson: false,
          error: `Server returned non-JSON response (${res.status}).`
        };
      }
    }

    const data = await res.json();
    return {
      ok: res.ok,
      status: res.status,
      data,
      isJson: true,
      error: !res.ok ? (data?.error || `HTTP ${res.status}`) : undefined
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      isJson: false,
      error: err?.message || 'Network fetch error'
    };
  }
}
