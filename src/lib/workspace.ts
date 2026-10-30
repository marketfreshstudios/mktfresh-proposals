import { fontChoice } from "./proposal-fonts";
import { z } from "zod";
export const LOCAL_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
export const CompanySignatorySchema = z.object({
  user_id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  email: z.email(),
  image: z
    .string()
    .max(500000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
    .nullable(),
  authorized_user_ids: z.array(z.string().uuid()).max(100),
});
export const onBehalfText = (name: string, company: string) =>
  `I'm authorized to sign on behalf of ${name} for ${company}.`;
export const WorkspaceSettingsSchema = z.object({
  id: z.string().uuid(),
  currency: z.enum(["USD", "CAD", "GBP", "EUR", "AUD"]).default("USD"),
  proposal_fonts: z
    .object({ heading: fontChoice, body: fontChoice })
    .optional(),
  default_password_hash: z.string().nullable().optional(),
  default_password_enabled: z.boolean().optional(),
  money: z.object({ cents: z.enum(["auto", "always"]) }).optional(),
  company_name: z.string().min(1).max(200),
  owner: z.string().max(200),
  company_signatory: CompanySignatorySchema.nullable().optional(),
  email: z.email(),
  phone: z.string().max(100),
  address: z.string().max(2000),
  logo: z.string().nullable(),
  accent_colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sending_domain: z
    .string()
    .max(253)
    .trim()
    .toLowerCase()
    .regex(/^$|^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/)
    .default(""),
  consent_text: z.string().min(20).max(10000),
  reminder_days: z.array(z.number().int().positive()).max(10),
  default_validity_days: z.number().int().min(1).max(365).default(30),
  timezone: z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }),
  qbo_custom_item_ref: z.string().nullable(),
  collection_method: z.enum(["charge_automatically", "send_invoice"]),
});
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;
