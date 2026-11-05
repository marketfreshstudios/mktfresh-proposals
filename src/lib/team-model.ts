import { z } from "zod";
export const StaffRoleSchema = z.enum(["owner", "member"]);
export const StaffStatusSchema = z.enum(["active", "invited", "deactivated"]);
export const staffRoleLabel = (role: string) =>
  role === "owner" ? "Super admin" : "Staff";
export const staffStatusLabel = (status: string) =>
  ({
    active: "Active",
    invited: "Invited, not accepted yet",
    deactivated: "Deactivated",
  })[status] ?? status;
export const StaffNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((v) => !/[\r\n]/.test(v), "Display name cannot contain line breaks");
// Supabase additionally enforces the project's configured password policy.
export const StaffPasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(200);
export const StaffMemberSchema = z.object({
  user_id: z.uuid(),
  workspace_id: z.uuid(),
  role: StaffRoleSchema,
  display_name: StaffNameSchema,
  status: StaffStatusSchema.default("active"),
  invited_at: z.string().nullable().default(null),
  invited_by: z.uuid().nullable().default(null),
  deactivated_at: z.string().nullable().default(null),
  password_change_required: z.boolean().default(false),
  session_version: z.number().int().nonnegative().default(0),
});
export type StaffMember = z.infer<typeof StaffMemberSchema>;
export type TeamPerson = StaffMember & {
  email: string;
  name: string;
  last_sign_in_at: string | null;
};
export type TeamAudit = {
  id: string;
  workspace_id: string;
  actor: string;
  actor_name: string;
  target_user_id: string;
  target_name: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};
export const teamActions = [
  "invite",
  "name",
  "role",
  "password_set",
  "password_changed",
  "reset_sent",
  "invite_resent",
  "deactivate",
  "reactivate",
  "remove",
] as const;
export type TeamAction = (typeof teamActions)[number];
export const TeamChangeSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("name"), display_name: StaffNameSchema })
    .strict(),
  z.object({ action: z.literal("role"), role: StaffRoleSchema }).strict(),
  z
    .object({
      action: z.literal("password_set"),
      password: StaffPasswordSchema,
      choose_new_password: z.boolean().default(true),
    })
    .strict(),
  ...(
    [
      "reset_sent",
      "invite_resent",
      "deactivate",
      "reactivate",
      "remove",
    ] as const
  ).map((action) => z.object({ action: z.literal(action) }).strict()),
]);
