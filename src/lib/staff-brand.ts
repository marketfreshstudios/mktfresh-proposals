import { connectionNames } from "./staff-routes";
import type { Metadata } from "next";
export function staffMetadata(page: string): Metadata {
  return {
    ...(process.env.APP_URL
      ? { metadataBase: new URL(process.env.APP_URL) }
      : {}),
    title: `${page} · Yeswell`,
    description:
      "Yeswell — proposals, signatures and client approvals for your workspace.",
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      ],
      apple: "/apple-touch-icon.png",
    },
    manifest: "/manifest.webmanifest",
    openGraph: {
      title: `${page} · Yeswell`,
      images: [
        { url: "/yeswell-social-1200x630.png", width: 1200, height: 630 },
      ],
    },
    robots: { index: false, follow: false },
  };
}
export function staffPageName(path: string[]) {
  if (!path.length) return "Home";
  if (
    path[0] === "studio" &&
    path[1] === "connections" &&
    connectionNames[path[2]]
  )
    return connectionNames[path[2]];
  if (path[0] === "studio")
    return (
      (
        {
          templates: "Templates & blocks",
          products: "Products",
          emails: "Emails",
          connections: "Connections",
          workspace: "Workspace",
          activity: "Activity log",
        } as Record<string, string>
      )[path[1]] ?? "Studio"
    );
  return (
    (
      {
        login: "Sign in",
        proposals: "Proposals",
        reports: "Reports",
        clients: "Clients",
        billing: "Billing",
      } as Record<string, string>
    )[path[0]] ?? "Workspace"
  );
}
