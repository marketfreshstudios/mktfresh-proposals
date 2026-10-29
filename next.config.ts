import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["playwright", "@sparticuz/chromium"],
  poweredByHeader: false,
};
export default config;
