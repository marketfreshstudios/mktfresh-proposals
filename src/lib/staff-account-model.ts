import { z } from "zod";

export const accountSections = [
  ["", "Profile"],
  ["security", "Sign-in & security"],
  ["notifications", "Notifications"],
  ["signature", "Signature"],
  ["preferences", "Preferences"],
] as const;

export const accountNotifications = [
  {
    key: "staff_viewed",
    group: "Proposals",
    label: "Client viewed a proposal",
    detail: "First view only. Repeat visits show in the record.",
  },
  {
    key: "staff_question",
    group: "Proposals",
    label: "Client asked a question",
    detail: "",
  },
  {
    key: "staff_declined",
    group: "Proposals",
    label: "Client declined",
    detail: "Includes their note.",
  },
  {
    key: "staff_completed",
    group: "Signatures",
    label: "Agreement completed",
    detail: "Both parties signed. Signed copies are sent separately.",
  },
  {
    key: "staff_billing_complete",
    group: "Billing",
    label: "Client finished billing setup",
    detail: "",
  },
] as const;

export type AccountNotification = (typeof accountNotifications)[number]["key"];
export function accountNotification(key: string): key is AccountNotification {
  return accountNotifications.some((event) => event.key === key);
}

export const themes = ["light", "dark", "system"] as const;
export type StaffTheme = (typeof themes)[number];
export const homePipelineRanges = [
  "month",
  "3-months",
  "6-months",
  "year",
  "all",
] as const;
export type HomePipelineRange = (typeof homePipelineRanges)[number];
export const staffDateFormats = ["medium", "long", "numeric", "iso"] as const;
export const staffTimeZones = ["UTC", ...Intl.supportedValuesOf("timeZone")];

const line = (limit: number) =>
  z
    .string()
    .trim()
    .max(limit)
    .refine((value) => !/[\x00-\x1f\x7f]/.test(value), {
      message: "Enter a single line of text.",
    });
const notificationValues = z
  .object({
    staff_viewed: z.boolean().optional(),
    staff_question: z.boolean().optional(),
    staff_declined: z.boolean().optional(),
    staff_completed: z.boolean().optional(),
    staff_billing_complete: z.boolean().optional(),
  })
  .strict();
const staffTimezone = z
  .string()
  .max(80)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Choose a valid time zone." },
  );

export const StaffAccountPatchSchema = z
  .object({
    first_name: line(100).refine(Boolean, "Enter your first name.").optional(),
    last_name: line(100).optional(),
    job_title: line(120).optional(),
    phone: line(64)
      .refine((value) => !value || /^[+\d(][\d+().\s#x-]*$/i.test(value), {
        message: "Enter a phone number, including its area code.",
      })
      .optional(),
    theme: z.enum(themes).optional(),
    timezone: staffTimezone.nullable().optional(),
    date_format: z.enum(staffDateFormats).optional(),
    home_pipeline_range: z.enum(homePipelineRanges).optional(),
    notifications: notificationValues.optional(),
    own_proposals_only: z.boolean().optional(),
  })
  .strict();

export type StaffAccountPatch = z.infer<typeof StaffAccountPatchSchema>;
export type StaffAccount = {
  first_name: string;
  last_name: string;
  job_title: string;
  phone: string;
  theme: StaffTheme | null;
  timezone: string | null;
  date_format: (typeof staffDateFormats)[number] | null;
  home_pipeline_range?: HomePipelineRange;
  notifications: Partial<Record<AccountNotification, boolean>>;
  own_proposals_only: boolean;
  photo_url: string | null;
};
export function staffName(first: string, last: string) {
  return [first, last].filter(Boolean).join(" ");
}
export function staffInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export function formatStaffDate(
  value: string | Date,
  account: Pick<StaffAccount, "timezone" | "date_format"> | undefined,
  fallback: Intl.DateTimeFormatOptions,
) {
  const timeZone = account?.timezone ?? fallback.timeZone;
  const instant = new Date(
    typeof value === "string" && value.length === 10
      ? value + "T12:00:00Z"
      : value,
  );
  if (account?.date_format === "iso") {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const day = ["year", "month", "day"]
      .map((part) => parts.find((item) => item.type === part)?.value)
      .join("-");
    return fallback.timeStyle
      ? day +
          ", " +
          new Intl.DateTimeFormat("en-US", {
            timeZone,
            timeStyle: fallback.timeStyle,
          }).format(instant)
      : day;
  }
  return new Intl.DateTimeFormat("en-US", {
    ...(account?.date_format
      ? {
          dateStyle:
            account.date_format === "numeric" ? "short" : account.date_format,
          timeStyle: fallback.timeStyle,
        }
      : fallback),
    timeZone,
  }).format(instant);
}
