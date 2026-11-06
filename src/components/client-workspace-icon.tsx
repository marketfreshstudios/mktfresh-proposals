"use client";
import { useEffect } from "react";
/** Client-only branding; restore the original favicon links on navigation/unmount. */
export function ClientWorkspaceIcon({
  token,
  version,
  preview = false,
}: {
  token: string;
  version?: string | null;
  preview?: boolean;
}) {
  useEffect(() => {
    const original = [
      ...document.head.querySelectorAll<HTMLLinkElement>(
        'link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]',
      ),
    ];
    original.forEach((link) => link.remove());
    const base = preview
      ? "/api/workspace-icon"
      : `/api/public/${encodeURIComponent(token)}/brand/icon`;
    const entries = version
      ? [
          {
            rel: "icon",
            size: 16,
            href: `${base}?size=16&v=${encodeURIComponent(version)}`,
            type: "image/png",
          },
          {
            rel: "icon",
            size: 32,
            href: `${base}?size=32&v=${encodeURIComponent(version)}`,
            type: "image/png",
          },
          {
            rel: "apple-touch-icon",
            size: 180,
            href: `${base}?size=180&v=${encodeURIComponent(version)}`,
            type: "image/png",
          },
        ]
      : [
          {
            rel: "icon",
            size: 32,
            href: "/favicon.svg",
            type: "image/svg+xml",
          },
          {
            rel: "apple-touch-icon",
            size: 180,
            href: "/apple-touch-icon.png",
            type: "image/png",
          },
        ];
    const links = entries.map(({ rel, size, href, type }) => {
      const link = document.createElement("link");
      link.rel = rel;
      link.type = type;
      link.sizes = `${size}x${size}`;
      link.href = href;
      link.dataset.workspaceIcon = version ? "true" : "fallback";
      document.head.append(link);
      return link;
    });
    return () => {
      links.forEach((link) => link.remove());
      original.forEach((link) => document.head.append(link));
    };
  }, [token, version, preview]);
  return null;
}
