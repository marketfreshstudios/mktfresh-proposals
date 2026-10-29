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
it("uses APP_URL for new links, retains legacy snapshots and enforces HTTPS", async () => {
  const { repo, service, draft, settings } = await setup();
  vi.stubEnv("APP_URL", "https://proposals.example.test/path/");
  expect(appOrigin()).toBe("https://proposals.example.test");
  settings.client_url = "https://old.example.test";
  settings.email_sender_name = "Old";
  settings.email_sender_address = "old@example.test";
  const parsed = WorkspaceSettingsSchema.parse(settings);
  expect(parsed).not.toHaveProperty("client_url");
  expect(parsed).not.toHaveProperty("email_sender_name");
  await repo.put("workspace_settings", settings);
  let p = await service.send(draft.id, staff);
  expect(p.jobs.find((j) => j.id.includes(":send:"))!.payload.text).toContain(
    "https://proposals.example.test/p/",
  );
  expect(emailHtml(p, "Review")).toContain("https://proposals.example.test/p/");
  p.workspace_settings!.client_url = "https://old.example.test";
  expect(proposalLink(p)).toBe(`https://old.example.test/p/${p.token}`);
  expect(emailHtml(p, "Review")).toContain("https://old.example.test/p/");
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
    from: '"Franz · Example Studio" <franz@example.test>',
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
      (e) => e.to === p.client.email && e.subject.startsWith("Signed copy:"),
    ),
  ).toHaveLength(2);
});
it("rejects outsiders, mismatched domains and AI sender changes", async () => {
  const { repo, service, draft, settings, members } = await setup();
  await expect(
    service.send(
      draft.id,
      staff,
      false,
      "00000000-0000-4000-8000-000000000099",
    ),
  ).rejects.toThrow("belongs to this workspace");
  members[0].email = "staff@other.test";
  await expect(service.send(draft.id, staff)).rejects.toThrow(
    "verified sending domain (example.test)",
  );
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
