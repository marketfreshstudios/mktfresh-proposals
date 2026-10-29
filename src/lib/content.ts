import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  AppError,
  readLine,
  check,
  type Block,
  type Line,
  type Proposal,
  type RichText,
  type Version,
} from "./model";
export const CONSENT =
  "By signing electronically, I consent to electronic records and signatures, intend to sign this proposal, and agree that my electronic signature is the legal equivalent of my handwritten signature. I can download and retain a copy.";
export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
export const versionHash = (
  v: Pick<Version, "content" | "quote" | "variables_resolved">,
) => sha256(canonical(v));
export function hashPassword(password: string) {
  check(
    password.length >= 8 && password.length <= 200,
    "Password must be 8–200 characters",
  );
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 32).toString("hex");
}
export function passwordMatches(password: string, hash: string) {
  if (password.length > 200) return false;
  const [salt, key] = hash.split(":");
  const a = scryptSync(password, salt, 32),
    b = Buffer.from(key, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export {
  totals,
  money,
  variables,
  resolve,
  escape,
  renderBlocks,
  htmlDocument,
} from "./presentation";
