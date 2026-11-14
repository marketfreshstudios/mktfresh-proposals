import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
// Each run owns its local database; test clients cannot leak across repeat runs.
const e2eDataDir = mkdtempSync(join(tmpdir(), "proposals-e2e-"));
process.env.APP_URL = "http://127.0.0.1:3100";
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    storageState: {
      origins: [],
      cookies: [
        {
          name: "proposal_session",
          value: "e2e-staff-secret-only",
          domain: "127.0.0.1",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
    },
  },
  webServer: [
    {
      command: "node --import tsx e2e/staff-auth-server.ts",
      url: "http://127.0.0.1:3112",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        APP_MODE: "local",
        SUPABASE_URL: "http://127.0.0.1:3112",
        SUPABASE_ANON_KEY: "local-auth-fixture-anon",
        SUPABASE_SERVICE_ROLE_KEY: "local-auth-fixture-service",
        BILLING_MODE: "mock",
        OAUTH_ISSUER: "http://127.0.0.1:3100",
        DATA_DIR: e2eDataDir,
        DEV_STAFF_TOKEN: "e2e-staff-secret-only",
        APP_URL: "http://127.0.0.1:3100",
        CRON_SECRET: "e2e-cron-only",
        SIGNUP_ENABLED: "true",
      },
    },
    {
      command:
        "python3 -m http.server 4176 --bind 127.0.0.1 --directory design/redesign",
      url: "http://127.0.0.1:4176",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
