import { z } from "zod";
import { QuoteItemSchema, check } from "./model";
export const PlaybookDraftSchema = z
  .object({
    source: z.literal("playbook"),
    source_version: z.string().min(1).max(200),
    title: z.string().min(1).max(300).optional(),
    client: z
      .object({
        company: z.string().min(1).max(200),
        first_name: z.string().max(100),
        last_name: z.string().max(100),
        email: z.email(),
      })
      .optional(),
    items: z.array(QuoteItemSchema).min(1).max(100),
    notes: z.string().max(50000).optional(),
  })
  .strict();
export function decodePlaybook(encoded: string) {
  check(
    encoded.length <= 150000 && /^[\w-]+$/.test(encoded),
    "Invalid playbook payload",
  );
  try {
    return PlaybookDraftSchema.parse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
  } catch (e) {
    throw new Error(
      `Invalid playbook draft: ${e instanceof Error ? e.message : "invalid JSON"}`,
    );
  }
}
export const playbookSchema = z.toJSONSchema(PlaybookDraftSchema, {
  target: "draft-7",
});
