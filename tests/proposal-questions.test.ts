import { expect, it } from "vitest";
import { aiTool, toolDefinitions } from "../src/lib/ai-tools";
import { engagementReport } from "../src/lib/engagement-server";
import { logSentEmail, saveEmailTemplate } from "../src/lib/email-templates";
import { MockMailer } from "../src/lib/jobs";
import {
  AskQuestionSchema,
  EditClientQuestionSchema,
} from "../src/lib/proposal-questions";
import {
  askQuestion,
  changeQuestion,
  clientQuestions,
  deliverQuestionMail,
  editClientQuestion,
  staffQuestions,
} from "../src/lib/question-service";
import type { EmailLog } from "../src/lib/email-templates";
import { blockText } from "../src/lib/editor-document";
import { questionExcerpt } from "../src/lib/question-targets";
import { resolve } from "../src/lib/presentation";
import { clientActor, setup, signature, staff } from "./helpers";

const ask = (text = "Can you clarify the first milestone?") =>
  AskQuestionSchema.parse({ id: crypto.randomUUID(), text });

it("atomically keeps questions, staff notes, and branded reply snapshots outside proposal state", async () => {
  const { service, repo, draft, members } = await setup();
  const p = await service.send(draft.id, staff, false, undefined, {
    delivery_method: "manual",
  });
  const admin = {
    user_id: crypto.randomUUID(),
    role: "owner",
    name: "Avery",
    display_name: "Avery",
    email: "avery@example.test",
  };
  const inactive = {
    ...admin,
    status: "deactivated",
    user_id: crypto.randomUUID(),
    email: "former@example.test",
  };
  const team = async () => [...members, admin, inactive];
  const input = ask("First\u0000 milestone?\r\n<img src=x onerror=alert(1)>");
  const q = await askQuestion(repo, p, input, {
    notifyAdmins: true,
    members: team,
  });
  expect(q.question).toBe("First milestone?\n<img src=x onerror=alert(1)>");
  expect(q).not.toHaveProperty("contact");
  expect(await askQuestion(repo, p, input, { members: team })).toEqual(q);
  expect(await repo.get(p.id)).toEqual(p);
  expect(await engagementReport(repo, p)).toMatchObject({
    views: 0,
    questions: 1,
    sessions: [],
    first_viewed_at: null,
  });
  expect((await staffQuestions(repo, p, staff)).notified).toEqual([q.id]);
  expect((await repo.questionCounts([p.id], admin.user_id))[p.id]).toEqual({
    open: 1,
    notified: 1,
  });
  expect((await repo.questionCounts([p.id], inactive.user_id))[p.id]).toEqual({
    open: 1,
    notified: 0,
  });
  const mailer = new MockMailer();
  const drain = () => deliverQuestionMail(repo, mailer, p.id);
  await Promise.all([drain(), drain()]);
  expect(
    [...mailer.sent.values()].map((v) => (v as { to: string }).to).sort(),
  ).toEqual(["avery@example.test", "staff@example.test"]);
  await expect(
    saveEmailTemplate(repo, staff, "question_reply", {
      subject: "{{quote.one_time_total}}",
      body: { type: "doc" },
      button_label: "View reply",
    }),
  ).rejects.toThrow(/Workspace name and Sender name/);
  const t = await saveEmailTemplate(repo, staff, "question_reply", {
    subject: "A new answer from {{workspace.name}}",
    body: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Your reply is ready." }],
        },
      ],
    },
    button_label: "View reply",
  });
  const reply = {
    action: "reply" as const,
    id: crypto.randomUUID(),
    text: "Yes. That milestone is in the first week.",
  };
  await changeQuestion(repo, p, q.id, reply, staff);
  await changeQuestion(repo, p, q.id, reply, staff);
  await drain();
  expect(mailer.sent.size).toBe(3);
  const logged = await repo.emailLog<EmailLog>(p.id);
  const clientMail = logged.find(
    (mail) => mail.snapshot.template_key === "question_reply",
  )!;
  expect(clientMail.snapshot).toMatchObject({
    template_version_id: t.version_id,
    to: p.client.email,
    button_label: "View reply",
    subject: "A new answer from Example Studio",
  });
  expect(clientMail.snapshot.button_url).toMatch(
    new RegExp(`/p/${p.token}#question-${q.id}$`),
  );
  expect(clientMail.snapshot.html).not.toContain(p.title);
  expect(clientMail.snapshot.text).not.toMatch(/milestone|\$/);
  expect((await clientQuestions(repo, p)).threads[0]).toMatchObject({
    status: "answered",
    replies: [{ text: reply.text }],
  });
  await changeQuestion(repo, p, q.id, { action: "resolve" }, staff);
  expect((await clientQuestions(repo, p)).threads[0].status).toBe("resolved");
  expect(await repo.questionCounts([p.id], staff.actor.slice(6))).toEqual({});
  expect(await repo.get(p.id)).toEqual(p);
  const actor = {
    ...staff,
    workspace_id: repo.workspaceId,
    actor: "ai:Claude",
  };
  const result = await aiTool(repo, actor, "get_proposal", { id: p.id }, [
    "proposals:read",
  ]);
  expect(result).toMatchObject({
    questions: [{ id: q.id, status: "resolved" }],
  });
  expect(
    toolDefinitions.filter((d) => d.name.includes("question")),
  ).toHaveLength(0);
});

it("limits new questions per link, remembers an unknown contact, and permits signing with open threads", async () => {
  const { repo, service, draft, members } = await setup();
  const p = await service.send(draft.id, staff, false, undefined, {
    delivery_method: "manual",
  });
  const options = { members: async () => members };
  const anonymous = {
    ...p,
    client: { ...p.client, email: "", first_name: "", last_name: "" },
  };
  expect(await clientQuestions(repo, anonymous)).toMatchObject({
    needs_contact: true,
  });
  const contact = { name: "Pat", email: "pat@example.test" };
  await askQuestion(repo, anonymous, { ...ask(), contact }, options);
  await askQuestion(repo, anonymous, ask(), options);
  expect(
    (await repo.questionThreads(p.id)).every(
      (thread) => thread.contact.email === contact.email,
    ),
  ).toBe(true);
  expect(AskQuestionSchema.safeParse(ask().text.repeat(300)).success).toBe(
    false,
  );
  expect(
    AskQuestionSchema.safeParse({ ...ask(), text: "x".repeat(2001) }).success,
  ).toBe(false);
  const attempts = await Promise.allSettled(
    Array.from({ length: 9 }, () => askQuestion(repo, p, ask(), options)),
  );
  expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(8);
  expect(attempts.filter((x) => x.status === "rejected")).toEqual([
    { status: "rejected", reason: expect.objectContaining({ status: 429 }) },
  ]);
  const signed = await service.sign(
    p.id,
    signature(p.revision),
    "client",
    clientActor,
    { token: p.token!, password: "" },
  );
  expect(await clientQuestions(repo, signed)).toMatchObject({
    can_ask: false,
    threads: expect.any(Array),
  });
  await expect(askQuestion(repo, signed, ask(), options)).rejects.toMatchObject(
    { status: 410 },
  );
});

it("preserves existing link closure on decline, expiry, and archive while staff can resolve", async () => {
  const { repo, service, draft, members } = await setup();
  const p = await service.send(draft.id, staff, false, undefined, {
    delivery_method: "manual",
  });
  const options = { members: async () => members };
  const question = await askQuestion(repo, p, ask(), options);
  for (const patch of [
    { status: "declined" as const },
    { status: "expired" as const },
    { archived_at: new Date().toISOString() },
    {
      published_state: {
        ...p.published_state!,
        valid_until: new Date(0).toISOString(),
      },
    },
  ]) {
    const closed = {
      ...p,
      ...patch,
      revision: (await repo.get(p.id))!.revision + 1,
    };
    await repo.save(closed, closed.revision - 1);
    await expect(service.byToken(p.token!, "")).rejects.toMatchObject({
      status: 410,
    });
    await expect(
      askQuestion(repo, closed, ask(), options),
    ).rejects.toMatchObject({ status: 410 });
    expect(await staffQuestions(repo, closed, staff)).toMatchObject({
      can_reply: false,
      threads: [{ id: question.id }],
    });
  }
  const closed = (await repo.get(p.id))!;
  await expect(
    changeQuestion(
      repo,
      closed,
      question.id,
      {
        action: "reply",
        id: crypto.randomUUID(),
        text: "This link is closed.",
      },
      staff,
    ),
  ).rejects.toMatchObject({ status: 410 });
  expect(
    await changeQuestion(
      repo,
      closed,
      question.id,
      { action: "resolve" },
      staff,
    ),
  ).toMatchObject({ status: "resolved" });
  expect(await repo.get(p.id)).toEqual(closed);
});

it("stores published block context and edits or deletes only unanswered open-link questions", async () => {
  const { repo, service, draft, members } = await setup();
  const p = await service.send(draft.id, staff, false, undefined, {
    delivery_method: "manual",
  });
  const version = p.versions.at(-1)!;
  const i = version.content.findIndex(
    (b) => b.type === "heading" && !!blockText(b),
  );
  const block = version.content[i];
  const input = AskQuestionSchema.parse({
    ...ask(),
    block_id: block.id ?? String(i),
  });
  const options = { members: async () => members };
  await expect(
    askQuestion(repo, p, { ...input, excerpt: "Invented context" }, options),
  ).rejects.toMatchObject({ status: 409 });
  const q = await askQuestion(repo, p, input, options);
  expect(q).toMatchObject({
    block_id: input.block_id,
    excerpt: questionExcerpt(
      resolve(blockText(block), version.variables_resolved),
    ),
  });
  expect(q.excerpt).not.toBe("Invented context");
  await expect(
    askQuestion(repo, p, { ...ask(), block_id: "unknown" }, options),
  ).rejects.toMatchObject({ status: 409 });
  const text = EditClientQuestionSchema.parse({
    text: "Updated\u0000 question",
  }).text;
  expect(await editClientQuestion(repo, p, q.id, text)).toMatchObject({
    question: "Updated question",
    excerpt: q.excerpt,
  });
  await changeQuestion(
    repo,
    p,
    q.id,
    { action: "reply", id: crypto.randomUUID(), text: "Reply" },
    staff,
  );
  await expect(editClientQuestion(repo, p, q.id, null)).rejects.toMatchObject({
    status: 409,
  });
  await expect(editClientQuestion(repo, p, q.id, text)).rejects.toMatchObject({
    status: 409,
  });
  const disposable = await askQuestion(repo, p, ask(), options);
  expect(await editClientQuestion(repo, p, disposable.id, null)).toEqual({
    deleted: true,
  });
  expect((await clientQuestions(repo, p)).threads.map((t) => t.id)).toEqual([
    q.id,
  ]);
  expect(await repo.get(p.id)).toEqual(p);
  expect(await engagementReport(repo, p)).toMatchObject({ questions: 2 });
  const signed = await service.sign(
    p.id,
    signature(p.revision),
    "client",
    clientActor,
    { token: p.token!, password: "" },
  );
  await expect(
    editClientQuestion(repo, signed, q.id, text),
  ).rejects.toMatchObject({ status: 410 });
});
