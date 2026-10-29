import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    env: { APP_URL: "http://127.0.0.1:3100" },
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
  },
});
