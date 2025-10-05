import { getApiBase, getDashboardToken } from '@/config';
import type { DashboardAPIError } from '@/types';

export interface RequestQuery {
  [key: string]: string | number | boolean | null | undefined;
}

export interface RequestOptions {
  params?: RequestQuery;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  body?: unknown;
}

export class DashboardRequestError<T = DashboardAPIError> extends Error {
  status: number;
  payload: T | null;

  constructor(message: string, status: number, payload: T | null) {
    super(message);
    this.name = 'DashboardRequestError';
    this.status = status;
    this.payload = payload;
  }
}

export class DashboardHttpClient {
  private baseUrl: string;
  private token: string | null;

  constructor(baseUrl: string = getApiBase()) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = getDashboardToken();
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private buildUrl(path: string, params?: RequestQuery): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${this.baseUrl}${normalizedPath}`;

    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      searchParams.append(key, String(value));
    });

    const query = searchParams.toString();
    return query ? `${url}?${query}` : url;
  }

  private async request<T>(path: string, method: 'GET' | 'POST', options: RequestOptions = {}): Promise<T> {
    const { params, signal, headers = {}, body } = options;
    const url = this.buildUrl(path, params);

    const payload = body !== undefined ? JSON.stringify(body) : undefined;

    const response = await fetch(url, {
      method,
      signal,
      headers: {
        'Accept': 'application/json;charset=UTF-8',
        ...(payload ? { 'Content-Type': 'application/json;charset=UTF-8' } : {}),
        ...(this.token ? { 'x-dashboard-token': this.token } : {}),
        ...headers
      },
      credentials: 'same-origin',
      body: payload
    });

    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    let data: unknown = null;

    if (isJson) {
      try {
        data = await response.json();
      } catch (error) {
        if (response.ok) {
          throw new DashboardRequestError('无法解析服务器响应', response.status, null);
        }
      }
    }

    if (!response.ok) {
      const payloadError = data as DashboardAPIError | null;
      const message = payloadError?.error || response.statusText || '请求失败';
      throw new DashboardRequestError(message, response.status, payloadError ?? null);
    }

    return data as T;
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, 'GET', options);
  }

  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T> {
    return this.request<T>(path, 'POST', { ...options, body });
  }
}

export const dashboardHttpClient = new DashboardHttpClient();
