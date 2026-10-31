import { it, expect, vi, afterEach, beforeEach } from "vitest";
import { setup, staff, clientActor } from "./helpers";
import { fieldNodes } from "../src/components/field-editor";
import { MockMailer, Worker, type Mailer } from "../src/lib/jobs";
import { MockBillingProvider } from "../src/lib/billing";
import {
  MemoryRepository,
  LocalRepository,
  mutate,
} from "../src/lib/repository";
import {
  emailDefaults,
  emailTemplates,
  saveEmailTemplate,
  validateTemplate,
  plainBody,
  renderEmailBody,
  renderTemplate,
  prepareEmail,
  emailKey,
  proposalEmailLog,
} from "../src/lib/email-templates";
import { emailStudioPreview, sendEmailTest } from "../src/lib/email-studio";
import { queue } from "../src/lib/service";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const storage = { put: async () => {}, get: async () => new Uint8Array() };
const providers = {
  qbo: new MockBillingProvider("qbo"),
  stripe: new MockBillingProvider("stripe"),
};
beforeEach(() => vi.stubEnv("APP_URL", "https://proposals.example.test"));
afterEach(() => vi.unstubAllEnvs());
const edit = (
  subject = "A note for {{client.first_name}}",
  text = "Hi {{client.full_name}},\n\n{{proposal.validity}}\n\nPlease review your scope.",
) => ({ subject, body: plainBody(text), button_label: "Read your proposal" });
it("all client and read-only staff defaults render one primary action, automatic plain text and no pricing", async () => {
  const { service, draft, settings } = await setup(),
    p = await service.send(draft.id, staff);
  settings.phone = "(704) 555-0123";
  p.workspace_settings = settings;
  for (const t of emailDefaults) {
    const r = renderTemplate(t, p);
    expect(r.html.match(/class="email-cta"/g)).toHaveLength(1);
    expect(r.html).not.toMatch(/@font-face|fonts.googleapis|\$|<script/);
    expect(r.html).toContain('role="presentation"');
    expect(r.html).toContain("<!--[if mso]>");
    expect(r.html).toContain("max-width:600px");
    expect(r.html).toContain("prefers-color-scheme:dark");
    expect(r.text).toContain(t.button_label + ": https://");
    expect(r.text).toContain("Sent by Alex Morgan at Example Studio");
    expect(r.text).toContain(settings.phone);
    expect(r.text).not.toMatch(/{{|<p>|\$/);
  }
  expect(emailDefaults.filter((t) => !t.staff)).toHaveLength(7);
});
it("rejects unknown/misspelled fields by name, malformed fields, unsafe links, unsupported content and editable destinations", () => {
  expect(() => validateTemplate(edit("{{client.frist_name}}"))).toThrow(
    "Unknown email field: client.frist_name",
  );
  expect(() => validateTemplate(edit("{{__proto__}}"))).toThrow(
    "Unknown email field: __proto__",
  );
  expect(() => validateTemplate(edit("{{client.first_name"))).toThrow(
    "Invalid email field",
  );
  expect(() =>
    validateTemplate({ ...edit(), button_url: "https://attacker.test" }),
  ).toThrow();
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,x",
    "http://example.test",
    "https://example.test/p/another-token",
    "https://example.test/{{client.first_name}}",
  ]) {
    const body = plainBody("link");
    body.content![0].content![0].marks = [{ type: "link", attrs: { href } }];
    expect(() => validateTemplate({ ...edit(), body })).toThrow();
  }
  expect(() =>
    validateTemplate({
      ...edit(),
      body: { type: "doc", content: [{ type: "image" }] },
    }),
  ).toThrow("Unsupported email content: image");
});
it("rich paragraphs, bold/italic, links and lists share one content source with the text alternative; indefinite validity leaves no blank paragraph", async () => {
  const { draft } = await setup();
  draft.valid_until = null;
  const body = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Hello {{client.first_name}}",
            marks: [{ type: "bold" }, { type: "italic" }],
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "variable", attrs: { path: "proposal.validity" } }],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Help",
                    marks: [
                      {
                        type: "link",
                        attrs: { href: "https://example.test/help" },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  validateTemplate({ ...edit(), body });
  const r = renderEmailBody(body, {
    "client.first_name": "<Jamie>",
    "proposal.validity": "",
  });
  expect(r.html).toContain("<em><strong>Hello &lt;Jamie&gt;</strong></em>");
  expect(r.html).not.toMatch(/<p[^>]*>\s*<\/p>/);
  const decorated = renderEmailBody(fieldNodes(body), {
    "client.first_name": "<Jamie>",
    "proposal.validity": "",
  });
  expect(decorated.text).toBe(r.text);
  expect(decorated.html).toContain("<em><strong>&lt;Jamie&gt;</strong></em>");
  expect(r.text).toBe("Hello <Jamie>\n\n• Help (https://example.test/help)");
});
it("workspace edits/reset are audited atomically, isolated, and persist locally; staff notifications and AI cannot be edited", async () => {
  const { repo } = await setup();
  const a = await saveEmailTemplate(repo, staff, "proposal_sent", edit());
  expect((await emailTemplates(repo))[0].version_id).toBe(a.version_id);
  const event = (await repo.entities<any>("workspace_events")).find(
    (e) => e.type === "email_template_saved",
  );
  expect(event).toMatchObject({
    actor: staff.actor,
    metadata: { key: "proposal_sent", version_id: a.version_id },
  });
  expect(event.metadata).not.toHaveProperty("template");
  expect(
    (
      await emailTemplates(
        new MemoryRepository("00000000-0000-4000-8000-000000000099"),
      )
    )[0].version_id,
  ).toBeNull();
  const reset = await saveEmailTemplate(repo, staff, "proposal_sent", {}, true);
  expect(reset.body).toEqual(emailDefaults[0].body);
  expect(Date.parse(reset.updated_at!)).toBeGreaterThan(
    Date.parse(a.updated_at!),
  );
  await expect(
    saveEmailTemplate(
      repo,
      { ...staff, actor: "ai:connector" },
      "proposal_sent",
      edit(),
    ),
  ).rejects.toThrow("Staff authorization");
  await expect(
    saveEmailTemplate(repo, staff, "staff_signed", edit()),
  ).rejects.toThrow("read-only");
  const dir = await mkdtemp(join(tmpdir(), "email-template-")),
    local = new LocalRepository(dir);
  await saveEmailTemplate(local, staff, "proposal_sent", edit());
  expect((await emailTemplates(new LocalRepository(dir)))[0].subject).toBe(
    edit().subject,
  );
});
it("send defaults and per-send changes freeze independently of later template edits; delivered logs and retries retain the exact content", async () => {
  const { repo, service, draft } = await setup();
  await saveEmailTemplate(
    repo,
    staff,
    "proposal_sent",
    edit(
      "Original {{proposal.title}}",
      "Original body for {{client.first_name}}",
    ),
  );
  let p = await service.send(draft.id, staff);
  const sentVersion = JSON.stringify(p.versions);
  await saveEmailTemplate(
    repo,
    staff,
    "proposal_sent",
    edit("Changed subject", "Changed body"),
  );
  let first = true;
  const sent = new Map<string, any>();
  const mailer: Mailer = {
    send: async (m, id) => {
      if (first) {
        first = false;
        throw new Error("Temporary transport error");
      }
      sent.set(id, m);
      return;
    },
  };
  const worker = new Worker(repo, storage, mailer, providers);
  await worker.drain(p.id, "email");
  p = (await repo.get(p.id))!;
  const snap = structuredClone(
    p.jobs.find((j) => j.id.includes(":send:"))!.payload.email_snapshot,
  );
  expect(snap).toMatchObject({ subject: "Original Website for Acme" });
  await saveEmailTemplate(
    repo,
    staff,
    "proposal_sent",
    edit("Another subject", "Another body"),
  );
  await worker.retry(p.id);
  await worker.drain(p.id, "email");
  const logs = await proposalEmailLog(repo, p.id);
  expect(logs).toHaveLength(1);
  expect(logs[0].snapshot).toEqual(snap);
  expect([...sent.values()][0].html).toContain("Original body for Jane");
  expect(JSON.stringify((await repo.get(p.id))!.versions)).toBe(sentVersion);
  await expect(
    repo.put("email_log", {
      ...logs[0],
      snapshot: { ...logs[0].snapshot, subject: "tampered" },
    }),
  ).rejects.toThrow("Append-only");
  p = await service.send(p.id, staff, false, undefined, {
    subject: "Per-send {{client.company}}",
    body: plainBody("A personal edit"),
  });
  await worker.drain(p.id, "email");
  expect((await proposalEmailLog(repo, p.id))[0].snapshot.subject).toBe(
    "Per-send Acme & Sons",
  );
  expect((await emailTemplates(repo))[0].subject).toBe("Another subject");
});
it("reminders distinguish unopened/viewed at delivery and all client/staff lifecycle jobs select the right fixed template", async () => {
  const { service, draft, repo } = await setup(),
    p = await service.send(draft.id, staff);
  const job = {
    ...p.jobs[0],
    id: p.id + ":manual-reminder:fixture",
    payload: {
      to: p.client.email,
      reminder_day: "manual",
      email_template_key: "reminder_unopened",
    },
  };
  expect(emailKey(p, job)).toBe("reminder_unopened");
  p.first_viewed_at = new Date().toISOString();
  expect(emailKey(p, job)).toBe("reminder_viewed");
  for (const [suffix, key, to, file] of [
    ["billing-setup", "billing_setup", p.client.email, null],
    ["billing-link:1", "billing_setup", p.client.email, null],
    ["billing-added", "billing_updated", p.client.email, null],
    ["notify:signed:1", "staff_signed", staff.staff_email, null],
    ["copy:client:x", "signed_copy", p.client.email, "client"],
    ["copy:company:x", "completed", p.client.email, "company"],
    ["copy:client:staff", "staff_copy", staff.staff_email, "client"],
  ] as const) {
    p.files = file
      ? [
          {
            id: "file",
            stage: file,
            kind: "sealed",
            storage_path: "test",
            bytes: 1,
            sha256: "test",
            created_at: new Date().toISOString(),
          },
        ]
      : [];
    const j = {
      ...p.jobs[0],
      id: p.id + ":" + suffix,
      payload: { to, ...(file ? { file_id: "file" } : {}) },
    };
    expect(emailKey(p, j)).toBe(key);
    expect((await prepareEmail(repo, p, j)).template_key).toBe(key);
  }
});
it("declined staff email includes the exact escaped client note and uses the staff record action", async () => {
  const { service, repo, draft } = await setup();
  let p = await service.send(draft.id, staff);
  await service.decline(p.token!, "", clientActor, "Please <wait> & call me.");
  p = (await repo.get(p.id))!;
  const j = p.jobs.find((j) => j.id.includes(":notify:declined:"))!,
    r = await prepareEmail(repo, p, j);
  expect(r.html).toContain("Please &lt;wait&gt; &amp; call me.");
  expect(r.text).toContain("Please <wait> & call me.");
  expect(r.button_url).toBe(`https://proposals.example.test/proposals/${p.id}`);
});
it("preview/test accepts sample or scoped real data, cannot choose recipients/sender, sends only to the authenticated staff and refuses unverified domains", async () => {
  vi.stubEnv("APP_URL", "https://proposals.example.test");
  const { repo, draft } = await setup(),
    mailer = new MockMailer();
  const preview = await emailStudioPreview(
    repo,
    storage,
    staff,
    "proposal_sent",
    {},
  );
  expect(preview.values["client.first_name"]).toBe("Jamie");
  expect(preview.result.button_url).toContain("/studio/emails/proposal_sent");
  const result = await sendEmailTest(
    repo,
    storage,
    mailer,
    staff,
    "proposal_sent",
    { proposal_id: draft.id, request_id: crypto.randomUUID() },
  );
  expect(result.sent_to).toBe(staff.staff_email);
  const message = [...mailer.sent.values()][0] as any;
  expect(message.to).toBe(staff.staff_email);
  expect(message.subject).toContain("[Test]");
  expect(message.html).toContain("?preview=1");
  expect((await repo.get(draft.id))!.events).toHaveLength(draft.events.length);
  await expect(
    sendEmailTest(repo, storage, mailer, staff, "proposal_sent", {
      to: "other@example.test",
      request_id: crypto.randomUUID(),
    }),
  ).rejects.toThrow();
  await expect(
    sendEmailTest(
      repo,
      storage,
      mailer,
      { ...staff, staff_email: "person@different.test" },
      "proposal_sent",
      { request_id: crypto.randomUUID() },
    ),
  ).rejects.toThrow("verified sending domain");
  await expect(
    emailStudioPreview(
      repo,
      storage,
      { ...staff, actor: "ai:connector" },
      "proposal_sent",
      {},
    ),
  ).rejects.toThrow("Staff authorization");
  await expect(
    emailStudioPreview(repo, storage, staff, "proposal_sent", {
      proposal_id: crypto.randomUUID(),
    }),
  ).rejects.toThrow("Proposal not found");
});
it("workspace logo previews use stored bytes, retain brand accent and fall back clearly when the image is unavailable", async () => {
  const { repo, settings } = await setup();
  settings.logo = `${repo.workspaceId}/brand/logo.png`;
  settings.accent_colour = "#174a78";
  await repo.put("workspace_settings", settings);
  const branded = await emailStudioPreview(
    repo,
    { put: async () => {}, get: async () => new Uint8Array([1, 2, 3]) },
    staff,
    "proposal_sent",
    {},
  );
  expect(branded.result.html).toContain('src="data:image/png;base64,AQID"');
  expect(branded.result.html).toContain('alt="Example Studio"');
  expect(branded.result.html).toContain("background-color:#174a78");
  const fallback = await emailStudioPreview(
    repo,
    {
      put: async () => {},
      get: async () => {
        throw new Error("Unavailable");
      },
    },
    staff,
    "proposal_sent",
    {},
  );
  expect(fallback.logo_error).toContain("saved logo could not be loaded");
  expect(fallback.result.html).not.toContain("<img");
  expect(fallback.result.html).toContain("Example Studio</p>");
});
