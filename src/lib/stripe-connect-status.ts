export type StripeConnectionStatus = {
  state: "not_connected" | "setting_up" | "connected" | "disconnecting";
  available: boolean;
  eventsConfigured: boolean;
  setupRunning?: boolean;
  setupError?: boolean;
  products?: { count: number; at: string };
  customers?: { checked: number; linked: number; review: number };
  accountName?: string;
  accountSuffix?: string;
  actorName?: string;
  connectedAt?: string;
  dashboardUrl?: string;
};
