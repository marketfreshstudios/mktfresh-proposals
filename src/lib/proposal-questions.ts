import { z } from "zod";
import type { EmailSnapshot } from "./email-templates";
import type { Proposal } from "./model";

export const questionLimit = 2000;
const plain = (value: string) =>
  value
    .replace(/\r\n?/g, "\n")
    .replace(
      /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
      "",
    )
    .trim();
const message = z
  .string()
  .max(questionLimit)
  .transform(plain)
  .pipe(z.string().min(1, "Write a message first."));
export const AskQuestionSchema = z
  .object({
    id: z.string().uuid(),
    text: message,
    section: z.string().min(1).max(210).optional(),
    block_id: z.string().min(1).max(200).optional(),
    excerpt: z.string().max(200).transform(plain).optional(),
    contact: z
      .object({
        name: z
          .string()
          .max(120)
          .transform((v) => plain(v).replace(/[\n\t]+/g, " "))
          .pipe(z.string().min(1)),
        email: z.string().trim().max(254).pipe(z.email()),
      })
      .strict()
      .optional(),
  })
  .strict();
export const EditClientQuestionSchema = z.object({ text: message }).strict();
export const StaffQuestionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("reply"),
      id: z.string().uuid(),
      text: message,
    })
    .strict(),
  z.object({ action: z.literal("resolve") }).strict(),
]);

export type QuestionThread = {
  id: string;
  proposal_id: string;
  created_at: string;
  revision: number;
  status: "open" | "answered" | "resolved";
  section?: { key: string; label: string };
  block_id?: string;
  excerpt?: string;
  contact: { name: string; email: string };
  question: string;
  replies: { id: string; name: string; text: string; created_at: string }[];
  notify_users: string[];
};
export type QuestionTombstone = Pick<
  QuestionThread,
  "id" | "proposal_id" | "created_at" | "revision"
> & {
  status: "resolved";
  deleted_at: string;
};
export type ClientQuestionMutation = {
  proposal: string;
  revision: number;
  id: string;
  text: string | null;
};
export type ClientQuestionMutationResult =
  | { result: "saved"; thread?: QuestionThread }
  | { result: "closed" | "stale" | "missing" | "replied" };
export type QuestionMail = {
  id: string;
  proposal_id: string;
  snapshot: EmailSnapshot;
};
export type QuestionWrite = {
  thread: QuestionThread;
  previous: number | null;
  proposalRevision?: number;
  mail: QuestionMail[];
};
export type QuestionWriteResult = "saved" | "stale" | "closed" | "limited";
export type QuestionDelivery = QuestionMail & {
  attempt: number;
  available_at: string | null;
};
export function questionContact(p: Pick<Proposal, "client">) {
  const name = [p.client.first_name, p.client.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const email = p.client.email?.trim();
  return name && z.email().safeParse(email).success ? { name, email } : null;
}
export function publicQuestion(thread: QuestionThread) {
  const {
    id,
    status,
    section,
    block_id,
    excerpt,
    created_at,
    question,
    replies,
  } = thread;
  return {
    id,
    status,
    section,
    block_id,
    excerpt,
    created_at,
    question,
    replies,
    name: thread.contact.name,
  };
}
export type PublicQuestion = ReturnType<typeof publicQuestion>;
export type ClientQuestionsResult = {
  threads: PublicQuestion[];
  can_ask: boolean;
  needs_contact: boolean;
};
export type StaffQuestionsResult = {
  threads: QuestionThread[];
  notified: string[];
  can_reply: boolean;
};
export type QuestionSummary = { open: number; notified: number };

export function questionsReadable(p: Proposal, now = Date.now()) {
  const expiry = p.published_state
    ? p.published_state.valid_until
    : p.valid_until;
  return (
    p.source === "native" &&
    !!p.token &&
    !!p.versions.length &&
    !p.archived_at &&
    (["signed_by_client", "completed"].includes(p.status) ||
      (["sent", "viewed"].includes(p.status) &&
        (!expiry || Date.parse(expiry) > now)))
  );
}
export function questionsWritable(p: Proposal, now = Date.now()) {
  return (
    questionsReadable(p, now) &&
    ["sent", "viewed"].includes(p.status) &&
    !p.signers.length
  );
}
export function summarizeQuestions(rows: QuestionThread[], user: string) {
  const result: Record<string, QuestionSummary> = {};
  for (const thread of rows) {
    const count = (result[thread.proposal_id] ??= { open: 0, notified: 0 });
    count.open++;
    if (thread.notify_users.includes(user)) count.notified++;
  }
  return result;
}
