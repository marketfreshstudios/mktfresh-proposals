import { z } from "zod";
import type { Proposal } from "./model";
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
export function proposalOrigin(_p?: Pick<Proposal, "workspace_settings">) {
  return appOrigin();
}
export const proposalLink = (p: Proposal) =>
  `${proposalOrigin(p)}/p/${p.token}`;
