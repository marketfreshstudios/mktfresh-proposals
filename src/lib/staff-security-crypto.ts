import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { check } from "./model";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(bytes: Buffer) {
  let buffer = 0,
    bits = 0,
    result = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(buffer >>> bits) & 31];
    }
  }
  if (bits) result += alphabet[(buffer << (5 - bits)) & 31];
  return result;
}

function fromBase32(value: string) {
  let buffer = 0,
    bits = 0;
  const result = [];
  for (const char of value) {
    buffer = (buffer << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      result.push((buffer >>> bits) & 255);
    }
  }
  return Buffer.from(result);
}

export const newTotpSecret = () => base32(randomBytes(20));

export function totpCode(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", fromBase32(secret)).update(counter).digest();
  return String(
    (hmac.readUInt32BE(hmac[19] & 15) & 0x7fffffff) % 1_000_000,
  ).padStart(6, "0");
}

export function acceptedTotpStep(
  secret: string,
  input: string,
  now = Date.now(),
) {
  if (!/^\d{6}$/.test(input)) return null;
  const step = Math.floor(now / 30_000);
  return (
    [step, step - 1, step + 1].find((candidate) =>
      timingSafeEqual(
        Buffer.from(input),
        Buffer.from(totpCode(secret, candidate)),
      ),
    ) ?? null
  );
}

export function securityKey() {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY ?? "";
  check(
    Buffer.from(key, "base64").length === 32,
    "Staff security is not configured",
    503,
  );
  return key;
}

export function backupHash(user: string, code: string) {
  return createHmac("sha256", Buffer.from(securityKey(), "base64"))
    .update(
      `staff-backup\0${user}\0${code.toUpperCase().replace(/[-\s]/g, "")}`,
    )
    .digest("hex");
}

export function newBackupCodes() {
  return Array.from({ length: 8 }, () => {
    const code = base32(randomBytes(10));
    return code.match(/.{4}/g)!.join("-");
  });
}
