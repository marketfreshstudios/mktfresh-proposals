import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["playwright", "@sparticuz/chromium"],
  outputFileTracingIncludes: { "/api/*": ["./public/fonts/*.woff2"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
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
