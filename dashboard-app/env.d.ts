/// <reference types="vite/client" />

declare interface Window {
  OPENLIST_CONFIG?: {
    cdn?: string;
  };
  __dynamic_base__?: string;
  __DASHBOARD_INIT__?: import('./src/types').DashboardBootstrapPayload;
  __hideDashboardLoading?: () => void;
}
