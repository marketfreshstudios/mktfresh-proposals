import { z } from "zod";
import type { Proposal } from "./model";
import { validWorkspaceSlug, workspaceDomain } from "./workspace-address";
export const AppUrlSchema = z.url().refine((value) => {
  const u = new URL(value);
  return (
    !u.username &&
    !u.password &&
    (u.protocol === "https:" ||
      (u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)))
  );
}, "APP_URL must use HTTPS (HTTP is allowed only for localhost)");
export function appOrigin() {
  return new URL(AppUrlSchema.parse(process.env.APP_URL)).origin;
}
// The workspace's own address when it has one and the deployment serves
// workspace addresses; otherwise APP_URL.
export function workspaceOrigin(slug?: string | null) {
  const domain = workspaceDomain();
  if (!slug || !domain || !validWorkspaceSlug(slug)) return appOrigin();
  const app = new URL(appOrigin());
  return `${app.protocol}//${slug}.${domain}${app.port ? ":" + app.port : ""}`;
}
export function proposalOrigin(p?: Pick<Proposal, "workspace_settings">) {
  return workspaceOrigin(p?.workspace_settings?.workspace_slug);
}
export const proposalLink = (p: Proposal) =>
  `${proposalOrigin(p)}/p/${p.token}`;
