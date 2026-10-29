import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/**": [
      "./public/fonts/*.woff2",
      // External packages contain runtime-loaded files that static tracing misses.
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // same-origin: no referrer leaves the app, so proposal tokens in /p/ URLs never
          // leak to other sites, but same-origin form posts keep a real Origin header.
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
  devIndicators: false,
  poweredByHeader: false,
};
export default config;
