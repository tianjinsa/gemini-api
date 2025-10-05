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

export function getStaticBase(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const base = window.__dynamic_base__ || '';
  return base ? base.replace(/\/+$/, '') : '';
}

export function getOpenlistConfig() {
  if (typeof window === 'undefined') {
    return { cdn: '' } as Record<string, unknown>;
  }
  return window.OPENLIST_CONFIG || { cdn: '' };
}

export const DASHBOARD_POLL_INTERVAL_MS = 10_000;
export const DASHBOARD_DELTA_BACKOFF_MS = 1_000;
