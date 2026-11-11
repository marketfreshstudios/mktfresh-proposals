import { allowStaffNotification } from "./staff-account";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { workspaceStaff } from "./auth";
import { prepareEmail, logSentEmail } from "./email-templates";
import { questionExcerpt, questionTargets } from "./question-targets";
import type { Mailer } from "./jobs";
import { proposalLink, appOrigin } from "./links";
import { AppError, check, type Actor, type Proposal } from "./model";
import { proposalOwnerId } from "./proposal-owner";
import {
  publicQuestion,
  questionContact,
  questionsReadable,
  questionsWritable,
  type AskQuestionSchema,
  type StaffQuestionSchema,
  type QuestionThread,
  type QuestionMail,
} from "./proposal-questions";
import type { Repository } from "./repository";

export async function clientQuestions(repo: Repository, p: Proposal) {
  const threads = await repo.questionThreads(p.id);
  return {
    threads: threads.map(publicQuestion),
    can_ask: questionsWritable(p),
    needs_contact: !questionContact(p) && !threads.length,
  };
}

export async function staffQuestions(
  repo: Repository,
  p: Proposal,
  actor: Actor,
) {
  const threads = await repo.questionThreads(p.id);
  return {
    threads,
    can_reply: questionsReadable(p),
    notified: threads
      .filter(
        (t) =>
          t.status === "open" && t.notify_users.includes(actor.actor.slice(6)),
      )
      .map((t) => t.id),
  };
}

async function questionMail(
  repo: Repository,
  p: Proposal,
  key: "staff_question" | "question_reply",
  to: string,
  question: string,
): Promise<QuestionMail> {
  const id = randomUUID();
  const anchor = `#question-${question}`;
  const snapshot = await prepareEmail(repo, p, {
    id,
    kind: "email",
    status: "pending",
    attempts: 0,
    available_at: new Date().toISOString(),
    payload: {
      to,
      email_template_key: key,
      question_url:
        (key === "staff_question"
          ? `${appOrigin()}/proposals/${p.id}`
          : proposalLink(p)) + anchor,
    },
  });
  return { id, proposal_id: p.id, snapshot };
}

export class QuestionProposalChanged extends AppError {
  constructor() {
    super(409, "The proposal changed. Try sending your question again.");
  }
}
export async function askQuestion(
  repo: Repository,
  p: Proposal,
  input: z.infer<typeof AskQuestionSchema>,
  options: { notifyAdmins?: boolean; members?: typeof workspaceStaff } = {},
) {
  const threads = await repo.questionThreads(p.id);
  const existing = threads.find((thread) => thread.id === input.id);
  if (existing) return publicQuestion(existing);
  check(
    questionsWritable(p),
    "Questions are read-only for this proposal.",
    410,
  );
  const contact =
    questionContact(p) ?? threads.at(-1)?.contact ?? input.contact;
  check(contact, "Enter your name and email to ask a question.");
  const version = p.versions.at(-1)!;
  const targets = questionTargets(
    version.content,
    version.quote,
    version.variables_resolved,
  );
  const target = input.block_id
    ? targets.blocks.get(input.block_id)
    : undefined;
  check(
    !input.block_id ||
      (target &&
        (input.excerpt === undefined ||
          questionExcerpt(input.excerpt) === target.excerpt)),
    "That block has changed. Reload the proposal and try again.",
    409,
  );
  const key = target?.section ?? input.section;
  const label = key ? targets.sections.get(key) : undefined;
  check(
    !key || label,
    "That section has changed. Reload the proposal and try again.",
    409,
  );
  const owner = proposalOwnerId(p);
  const active = (
    await (options.members ?? workspaceStaff)(repo.workspaceId)
  ).filter((m) => !("status" in m) || m.status === "active");
  const recipients = active.filter(
    (m) => m.user_id === owner || (options.notifyAdmins && m.role === "owner"),
  );
  const thread: QuestionThread = {
    id: input.id,
    proposal_id: p.id,
    created_at: new Date().toISOString(),
    revision: 0,
    status: "open",
    ...(key && label
      ? { section: { key, label: target?.label ?? label } }
      : {}),
    ...(target?.block_id
      ? { block_id: target.block_id, excerpt: target.excerpt }
      : {}),
    contact,
    question: input.text,
    replies: [],
    notify_users: recipients.map((m) => m.user_id),
  };
  const mail = await Promise.all(
    [...new Set(recipients.map((m) => m.email.toLowerCase()))].map((to) =>
      questionMail(repo, p, "staff_question", to, thread.id),
    ),
  );
  const result = await repo.writeQuestion({
    previous: null,
    proposalRevision: p.revision,
    thread,
    mail,
  });
  if (result === "limited")
    throw new AppError(
      429,
      "You’ve reached the hourly question limit. Try again later.",
    );
  if (result === "stale") {
    const replay = (await repo.questionThreads(p.id)).find(
      (t) => t.id === input.id,
    );
    if (replay) return publicQuestion(replay);
    throw new QuestionProposalChanged();
  }
  check(result === "saved", "Questions are read-only for this proposal.", 410);
  return publicQuestion(thread);
}

export async function editClientQuestion(
  repo: Repository,
  p: Proposal,
  id: string,
  text: string | null,
) {
  check(
    questionsWritable(p),
    "Questions are read-only for this proposal.",
    410,
  );
  const changed = await repo.mutateClientQuestion({
    proposal: p.id,
    revision: p.revision,
    id,
    text,
  });
  check(changed.result !== "missing", "Question not found", 404);
  check(
    changed.result !== "replied",
    "This question already has a reply.",
    409,
  );
  check(
    changed.result !== "closed",
    "Questions are read-only for this proposal.",
    410,
  );
  check(
    changed.result === "saved",
    "The proposal changed. Reload and try again.",
    409,
  );
  return changed.thread
    ? publicQuestion(changed.thread)
    : { deleted: true as const };
}

export async function changeQuestion(
  repo: Repository,
  p: Proposal,
  id: string,
  input: z.infer<typeof StaffQuestionSchema>,
  actor: Actor,
) {
  const thread = (await repo.questionThreads(p.id)).find((t) => t.id === id);
  check(thread, "Question not found", 404);
  if (thread.status === "resolved" && input.action === "resolve") return thread;
  if (
    input.action === "reply" &&
    thread.replies.some((reply) => reply.id === input.id)
  )
    return thread;
  const next = { ...thread, revision: thread.revision + 1 };
  let mail: QuestionMail[] = [];
  if (input.action === "reply") {
    check(questionsReadable(p), "The client link is closed.", 410);
    check(thread.status !== "resolved", "This question is resolved.", 409);
    next.status = "answered";
    next.replies = [
      ...thread.replies,
      {
        id: input.id,
        name: actor.staff_name ?? p.workspace_settings?.owner ?? "Staff",
        text: input.text,
        created_at: new Date().toISOString(),
      },
    ];
    mail = [
      await questionMail(
        repo,
        p,
        "question_reply",
        thread.contact.email,
        thread.id,
      ),
    ];
  } else next.status = "resolved";
  const result = await repo.writeQuestion({
    previous: thread.revision,
    proposalRevision: input.action === "reply" ? p.revision : undefined,
    thread: next,
    mail,
  });
  check(
    result === "saved",
    "The question changed. Refresh and try again.",
    409,
  );
  return next;
}

export async function deliverQuestionMail(
  repo: Repository,
  mailer: Mailer,
  proposal?: string,
) {
  const deadline = Date.now() + 45000;
  for (let i = 0; i < (proposal ? 10 : 50) && Date.now() < deadline; i++) {
    const mail = await repo.claimQuestionMail(proposal);
    if (!mail) return;
    const p = await repo.get(mail.proposal_id);
    if (!p) continue;
    const s = mail.snapshot;
    try {
      const allowed =
        s.template_key === "staff_question"
          ? await allowStaffNotification(repo, p, s.to, "staff_question")
          : s.template_key !== "question_reply" || questionsReadable(p);
      if (allowed) {
        await mailer.send(
          {
            from: s.from,
            reply_to: s.reply_to,
            to: s.to,
            subject: s.subject,
            text: s.text,
            html: s.html,
          },
          mail.id,
        );
        await logSentEmail(repo, p, mail, s);
      }
      await repo.finishQuestionMail(mail, null);
    } catch {
      await repo.finishQuestionMail(
        mail,
        mail.attempt >= 8
          ? null
          : new Date(
              Date.now() + Math.min(3600000, 30000 * 2 ** mail.attempt),
            ).toISOString(),
      );
    }
  }
}
