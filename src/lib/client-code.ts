import { randomInt } from "node:crypto";
/** 57 symbols × 12 independent draws: ~70 bits; rejection sampling is handled by randomInt. */
export const CLIENT_CODE_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function newClientCode() {
  return Array.from(
    { length: 12 },
    () => CLIENT_CODE_ALPHABET[randomInt(CLIENT_CODE_ALPHABET.length)],
  ).join("");
}
export function validClientToken(value: string) {
  return (
    /^[A-Za-z0-9_-]{43}$/.test(value) ||
    (value.length === 12 &&
      [...value].every((c) => CLIENT_CODE_ALPHABET.includes(c)))
  );
}
