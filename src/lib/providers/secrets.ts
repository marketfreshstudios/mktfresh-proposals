import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { check } from "../model";
export function encryptSecret(value: string, key: string, workspace: string) {
  const bytes = Buffer.from(key, "base64");
  check(
    bytes.length === 32,
    "A 32-byte integration encryption key is required",
    503,
  );
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", bytes, iv);
  cipher.setAAD(Buffer.from(workspace));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}
export function decryptSecret(value: string, key: string, workspace: string) {
  const [iv, tag, body] = value.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "base64"),
    Buffer.from(iv, "base64"),
  );
  decipher.setAAD(Buffer.from(workspace));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
