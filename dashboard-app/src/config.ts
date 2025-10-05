import type { DashboardBootstrapPayload } from './types';

const DEFAULT_API_BASE = '/dashboard/api';

export function getBootstrapPayload(): DashboardBootstrapPayload | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.__DASHBOARD_INIT__ ?? null;
}

export function getDashboardToken(): string | null {
  return getBootstrapPayload()?.aDashkey ?? null;
}

export function getApiBase(): string {
  return DEFAULT_API_BASE;
}

export const DASHBOARD_POLL_INTERVAL_MS = 10_000;
