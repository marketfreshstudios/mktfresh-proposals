import { expect, it, vi, afterEach } from "vitest";
import {
  setup,
  staff,
  clientActor,
  signature,
  companyConsent,
} from "./helpers";
import { emailIdentity } from "../src/lib/email-identity";
import { appOrigin, proposalLink } from "../src/lib/links";
import { emailHtml } from "../src/lib/branding";
import { Worker, MockMailer, ResendMailer } from "../src/lib/jobs";
import { MockBillingProvider } from "../src/lib/billing";
import { sha256 } from "../src/lib/content";
import { WorkspaceSettingsSchema } from "../src/lib/workspace";
afterEach(() => vi.unstubAllEnvs());
it("uses canonical APP_URL for every current proposal link and enforces HTTPS", async () => {
  const { repo, service, draft, settings } = await setup();
  vi.stubEnv("APP_URL", "https://proposals.example.test/path/");
  expect(appOrigin()).toBe("https://proposals.example.test");
  (settings as any).client_url = "https://old.example.test";
  (settings as any).email_sender_name = "Old";
  (settings as any).email_sender_address = "old@example.test";
  const parsed = WorkspaceSettingsSchema.parse(settings);
  expect(parsed).not.toHaveProperty("client_url");
  expect(parsed).not.toHaveProperty("email_sender_name");
  await repo.put("workspace_settings", settings);
  let p = await service.send(draft.id, staff);
  expect(p.jobs.find((j) => j.id.includes(":send:"))!.payload.text).toContain(
    "https://proposals.example.test/p/",
  );
  expect(emailHtml(p, "Review")).toContain("https://proposals.example.test/p/");
  (p.workspace_settings as any).client_url = "https://old.example.test";
  expect(proposalLink(p)).toBe(`https://proposals.example.test/p/${p.token}`);
  expect(emailHtml(p, "Review")).toContain("https://proposals.example.test/p/");
  vi.stubEnv("APP_URL", "http://unsafe.example.test");
  expect(() => appOrigin()).toThrow("HTTPS");
  vi.stubEnv("APP_URL", "http://localhost:3100");
  expect(appOrigin()).toBe("http://localhost:3100");
});
it("defaults to the logged-in staff, supports re-send and freezes every client and staff email identity", async () => {
  const { repo, service, draft, settings, members } = await setup();
  const franz = {
    user_id: "00000000-0000-4000-8000-000000000002",
    display_name: "Franz",
    name: "Franz",
    email: "franz@example.test",
    role: "member",
  };
  members.push(franz);
  let p = await service.send(draft.id, staff);
  expect(p.sender?.user_id).toBe(staff.actor.slice(6));
  p = await service.send(p.id, staff, false, franz.user_id);
  expect(p.sender).toMatchObject({ display_name: "Franz", email: franz.email });
  expect(p.notification_emails).toEqual([franz.email, staff.staff_email]);
  franz.display_name = "Changed later";
  const expected = {
    from: '"Franz | Example Studio" <franz@example.test>',
    reply_to: franz.email,
  };
  expect(emailIdentity(p)).toEqual(expected);
  service.clock = () => new Date(Date.now() + 4 * 86400000);
  await service.tick();
  service.clock = () => new Date();
  p = await service.view(p.token!, "", clientActor);
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  p = await service.sign(
    p.id,
    companyConsent(p.revision, settings),
    "company",
    staff,
  );
  const mailer = new MockMailer(),
    bytes = Buffer.from("mock PDF");
  const worker = new Worker(
    repo,
    { put: async () => {}, get: async () => bytes },
    mailer,
    {
      qbo: new MockBillingProvider("qbo"),
      stripe: new MockBillingProvider("stripe"),
    },
    async () => ({ body: bytes, pdf: bytes, bodyHash: sha256(bytes) }),
  );
  await worker.drain(p.id);
  const emails = [...mailer.sent.values()] as Array<{
    from: string;
    reply_to: string;
    to: string;
    subject: string;
  }>;
  expect(emails.length).toBeGreaterThan(5);
  for (const email of emails) expect(email).toMatchObject(expected);
  for (const to of [p.client.email, franz.email, staff.staff_email])
    expect(emails.some((e) => e.to === to)).toBe(true);
  expect(
    emails.filter(
      (e) =>
        e.to === p.client.email &&
        /signed copy:|completed agreement:/i.test(e.subject),
    ),
  ).toHaveLength(2);
});
it("rejects outsiders, a missing verified domain and AI sender changes", async () => {
  const { repo, service, draft, settings, members } = await setup();
  await expect(
    service.send(
      draft.id,
      staff,
      false,
      "00000000-0000-4000-8000-000000000099",
    ),
  ).rejects.toThrow("belongs to this workspace");
  settings.sending_domain = "";
  await repo.put("workspace_settings", settings);
  await expect(service.send(draft.id, staff)).rejects.toThrow(
    "Set the workspace",
  );
  await expect(
    service.send(
      draft.id,
      { ...staff, actor: "ai:connector" },
      false,
      members[0].user_id,
    ),
  ).rejects.toThrow("AI assistants cannot send");
  expect((await repo.get(draft.id))!.sender).toBeUndefined();
});
it("new sends use a verified From for a changed off-domain email and keep prior sends' identity", async () => {
  const { repo, service, draft, settings, members } = await setup();
  const sent = await service.send(draft.id, staff);
  const before = sent.jobs.find((job) => job.kind === "email")!.payload;
  members[0].email = "staff@other.test";
  settings.email = "public@other.test";
  settings.email_reply_to = "workspace";
  await repo.put("workspace_settings", settings);
  const next = await service.create(
    {
      client_id: draft.client.id,
      template_id: draft.template_id!,
      title: "Follow-up proposal",
    },
    staff,
  );
  const updated = await service.send(next.id, staff);
  const envelope = updated.jobs.find((job) => job.kind === "email")!.payload;
  expect(envelope.from).toBe('"Alex Morgan" <notifications@example.test>');
  expect(envelope.reply_to).toBe("staff@other.test");
  const original = (await repo.get(sent.id))!;
  expect(original.jobs.find((job) => job.kind === "email")!.payload).toEqual(
    before,
  );
  expect(original.sender?.email).toBe("staff@example.test");
});

it("passes Reply-To to the email provider", async () => {
  vi.stubEnv("RESEND_API_KEY", "test-only");
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{}", { status: 200 }));
  try {
    await new ResendMailer().send(
      {
        from: '"Alex · Example" <alex@example.test>',
        reply_to: "alex@example.test",
        to: "jane@example.test",
        subject: "Proposal",
        text: "Review",
      },
      "test",
    );
    expect(JSON.parse(String(request.mock.calls[0][1]!.body))).toMatchObject({
      reply_to: "alex@example.test",
    });
  } finally {
    request.mockRestore();
  }
});

it("team notifications come from Yeswell once its domain is set; client email never does", async () => {
  const { prepareEmail } = await import("../src/lib/email-templates");
  const { yeswellFrom } = await import("../src/lib/email-identity");
  const { repo, service, draft } = await setup();
  const p = await service.send(draft.id, staff);
  const job = (key: string) =>
    ({
      id: crypto.randomUUID(),
      kind: "email",
      status: "pending",
      attempts: 0,
      available_at: new Date().toISOString(),
      payload: { to: "staff@example.test", email_template_key: key },
    }) as any;
  // Unset: everything keeps the workspace sender.
  expect(yeswellFrom()).toBeNull();
  const before = await prepareEmail(repo, p, job("staff_viewed"));
  expect(before.from).not.toContain("yeswell.co");
  vi.stubEnv("YESWELL_NOTIFICATIONS_EMAIL", "notifications@yeswell.co");
  expect(yeswellFrom()).toBe('"Yeswell" <notifications@yeswell.co>');
  expect(yeswellFrom("Alex via Yeswell")).toBe(
    '"Alex via Yeswell" <notifications@yeswell.co>',
  );
  const team = await prepareEmail(repo, p, job("staff_viewed"));
  expect(team.from).toBe('"Yeswell" <notifications@yeswell.co>');
  const client = await prepareEmail(repo, p, job("proposal_sent"));
  expect(client.from).toBe(emailIdentity(p).from);
  vi.stubEnv("YESWELL_NOTIFICATIONS_EMAIL", "not an address\r\nBcc: x");
  expect(yeswellFrom()).toBeNull();
});
