import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 120000,
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      APP_MODE: "local",
      DATA_DIR: ".data/e2e",
      DEV_STAFF_TOKEN: "e2e-staff-secret-only",
      APP_URL: "http://127.0.0.1:3100",
      CRON_SECRET: "e2e-cron-only",
    },
  },
});
