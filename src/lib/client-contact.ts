import {
  parsePhoneNumberFromString,
  getCountries,
} from "libphonenumber-js/max";
import { z } from "zod";
import type { Client } from "./model";
export function normalizedPhone(value: string) {
  if (!value.trim()) return "";
  const phone = parsePhoneNumberFromString(value, {
    defaultCountry: "US",
    extract: false,
  });
  if (!phone?.isValid() || phone.ext)
    throw new Error(
      "Enter a valid phone number, including +country code for international numbers. Extensions are not supported.",
    );
  return phone.number;
}
export function formattedPhone(value: string) {
  const phone = parsePhoneNumberFromString(value, {
    defaultCountry: "US",
    extract: false,
  });
  return phone?.isValid()
    ? phone.country === "US"
      ? phone.formatNational()
      : phone.formatInternational()
    : value;
}
const part = z.string().trim().max(200).default("");
export const AddressSchema = z.object({
  line1: part,
  line2: part,
  city: part,
  region: part,
  postal_code: part,
  country: z.enum(getCountries()).default("US"),
});
export const PhoneInputSchema = z
  .string()
  .max(80)
  .default("")
  .transform((value, ctx) => {
    try {
      return normalizedPhone(value);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: (e as Error).message });
      return z.NEVER;
    }
  });
export function countryCode(value: string) {
  return (
    getCountries().find(
      (c) =>
        c === value.toUpperCase() ||
        countryName(c).toLowerCase() === value.toLowerCase(),
    ) ?? value
  );
}
export function countryName(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
}
export function formattedAddress(address: Record<string, string>) {
  if (
    ![
      address.line1,
      address.line2,
      address.city,
      address.region,
      address.postal_code,
    ].some(Boolean)
  )
    return "";
  return [
    address.line1,
    address.line2,
    [
      address.city,
      [address.region, address.postal_code].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", "),
    address.country ? countryName(address.country) : "",
  ]
    .filter(Boolean)
    .join("\n");
}
export function clientView(client: Client) {
  let phone: string | null;
  try {
    phone = normalizedPhone(client.phone);
  } catch {
    phone = null;
  }
  return {
    ...client,
    phone,
    phone_needs_review: phone === null,
    phone_formatted: formattedPhone(client.phone),
    address_formatted: formattedAddress(client.address),
  };
}
export function stripeAddress(address: Record<string, string>) {
  return formattedAddress(address)
    ? {
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.region,
        postal_code: address.postal_code,
        country: countryCode(address.country || "US"),
      }
    : undefined;
}
export function qboAddress(address: Record<string, string>) {
  return formattedAddress(address)
    ? {
        Line1: address.line1,
        Line2: address.line2,
        City: address.city,
        CountrySubDivisionCode: address.region,
        PostalCode: address.postal_code,
        Country: countryName(address.country || "US"),
      }
    : undefined;
}
