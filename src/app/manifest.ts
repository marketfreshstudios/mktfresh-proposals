import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Yeswell",
    short_name: "Yeswell",
    description: "Proposals and approvals for your workspace",
    start_url: "/",
    display: "standalone",
    background_color: "#EEF3F3",
    theme_color: "#13303A",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
