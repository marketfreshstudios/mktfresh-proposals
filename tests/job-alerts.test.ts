import { it, expect } from "vitest";
import {
  setup,
  staff,
  companyConsent,
  signature,
  clientActor,
} from "./helpers";
import { Worker, MockMailer } from "../src/lib/jobs";
import { MockBillingProvider, NeedsReview } from "../src/lib/billing";
import { mutate } from "../src/lib/repository";
import { queue, notify, event, system } from "../src/lib/service";
import { jobFailure, jobName } from "../src/lib/job-presentation";
import {
  emailTemplates,
  definition,
  oldJobEmailDefault,
  saveEmailTemplate,
  plainBody,
  prepareEmail,
} from "../src/lib/email-templates";
import { eventLabel } from "../src/lib/event-label";
const storage = { put: async () => {}, get: async () => new Uint8Array() };
it("five failed PDF attempts send one specific alert; retrying the same error never repeats it", async () => {
  const { repo, service, draft } = await setup();
  let p = await service.send(draft.id, staff);
  p = await mutate(repo, p.id, (p) =>
    queue(p, "pdf", "pdf:company", {
      stage: "company",
      version: p.versions[0],
      signers: [],
      events: [],
    }),
  );
  const mailer = new MockMailer(),
    worker = new Worker(
      repo,
      storage,
      mailer,
      {
        qbo: new MockBillingProvider("qbo"),
        stripe: new MockBillingProvider("stripe"),
      },
      async () => {
        throw new Error(
          "page.pdf: Protocol error (Page.printToPDF): Printing failed",
        );
      },
    );
  for (let n = 1; n <= 5; n++) {
    await mutate(repo, p.id, (p) => {
      p.jobs.find((j) => j.kind === "pdf")!.available_at = new Date(
        0,
      ).toISOString();
    });
    await worker.drain(p.id, "pdf");
    p = (await repo.get(p.id))!;
    expect(p.jobs.filter((j) => j.payload.job_failure)).toHaveLength(
      n === 5 ? 1 : 0,
    );
  }
  expect(p.jobs.find((j) => j.kind === "pdf")!.status).toBe("failed");
  await worker.drain(p.id, "email");
  const alerts = [...mailer.sent.values()].filter((v: any) =>
    v.subject.includes("needs attention"),
  ) as any[];
  expect(alerts).toHaveLength(1);
  expect(alerts[0].subject).toBe(
    `Signed PDF and certificate needs attention: ${p.title}`,
  );
  expect(alerts[0].text).not.toContain("Billing");
  expect(alerts[0].html).not.toContain("Billing");
  expect(alerts[0].html).toContain("Open proposal");
  expect(alerts[0].html).toContain("?job=");
  expect(alerts[0].html.match(/class="email-cta"/g)).toHaveLength(1);
  await worker.retry(p.id);
  for (let n = 0; n < 5; n++) {
    await mutate(repo, p.id, (p) => {
      p.jobs.find((j) => j.kind === "pdf")!.available_at = new Date(
        0,
      ).toISOString();
    });
    await worker.drain(p.id, "pdf");
  }
  await worker.drain(p.id, "email");
  expect(
    [...mailer.sent.values()].filter((v: any) =>
      v.subject.includes("needs attention"),
    ),
  ).toHaveLength(1);
  expect(
    (await repo.get(p.id))!.events.filter((e) => e.type === "sync_failed"),
  ).toHaveLength(10);
});
it("a billing decision sends one alert and preserves it across retries", async () => {
  const { repo, service, draft, settings } = await setup();
  const sent = await service.send(draft.id, staff);
  const signed = await service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const p = await service.sign(
    signed.id,
    companyConsent(signed.revision, settings),
    "company",
    staff,
  );
  const qbo = new MockBillingProvider("qbo");
  qbo.failure = new NeedsReview("Review the invoice mapping");
  const mailer = new MockMailer(),
    worker = new Worker(repo, storage, mailer, {
      qbo,
      stripe: new MockBillingProvider("stripe"),
    });
  await worker.drain(p.id);
  await worker.retry(p.id);
  await worker.drain(p.id);
  const alerts = (await repo.get(p.id))!.jobs.filter(
    (j) => j.payload.job_failure,
  );
  expect(alerts).toHaveLength(1);
  expect((alerts[0].payload.job_failure as any).name).toBe(
    "QuickBooks invoice",
  );
  expect(
    [...mailer.sent.values()].filter((v: any) =>
      v.subject.includes("needs attention"),
    ),
  ).toHaveLength(1);
});
it("all job subjects use their own names and unknown errors stay in a small Details line", async () => {
  const { repo, service, draft } = await setup(),
    p = await service.send(draft.id, staff);
  for (const [kind, payload, providers, label] of [
    ["pdf", { stage: "client" }, [], "Client-signed PDF"],
    ["pdf", { stage: "company" }, [], "Signed PDF and certificate"],
    ["billing", {}, ["stripe"], "Stripe billing"],
    ["billing", {}, ["qbo"], "QuickBooks invoice"],
    ["email", {}, [], "Email delivery"],
  ] as const) {
    const job: any = { id: `${p.id}:test:${label}`, kind, payload };
    expect(jobName(job, [...providers])).toBe(label);
    const failure = jobFailure(job, "Unexpected <printer> failure", [
      ...providers,
    ]);
    const r = await prepareEmail(repo, p, {
      ...job,
      kind: "email",
      payload: {
        to: staff.staff_email,
        email_template_key: "staff_billing_failed",
        job_failure: failure,
      },
    });
    expect(r.subject).toBe(`${label} needs attention: ${p.title}`);
    expect(r.text).toContain("Details: Unexpected <printer> failure");
    expect(r.html).toContain("&lt;printer&gt;");
  }
  expect(
    eventLabel({
      type: "sync_failed",
      actor: "system",
      metadata: { job: `${p.id}:pdf:company`, terminal: true },
    }),
  ).toBe("Signed PDF failed · Retry available");
});
it("the alert template is editable; only unchanged stored defaults migrate", async () => {
  const { repo } = await setup();
  await repo.put("email_templates", {
    ...definition("staff_billing_failed"),
    ...oldJobEmailDefault,
    // jsonb can reorder object keys without changing the stored content.
    body: { content: oldJobEmailDefault.body.content, type: "doc" },
    id: "00000000-0000-4000-8000-000000000081",
  });
  const migrated = (await emailTemplates(repo)).find(
    (t) => t.key === "staff_billing_failed",
  )!;
  expect(migrated.subject).toContain("{{job.name}}");
  expect(migrated.version_id).not.toBeNull();
  const custom = await saveEmailTemplate(repo, staff, migrated.key, {
    subject: "{{job.name}}: {{proposal.title}}",
    body: plainBody("Custom wording. {{job.summary}}"),
    button_label: "Open proposal",
  });
  expect(
    (await emailTemplates(repo)).find((t) => t.key === custom.key)?.body,
  ).toEqual(custom.body);
  await expect(
    saveEmailTemplate(repo, { ...staff, actor: "ai:test" }, custom.key, custom),
  ).rejects.toThrow("Staff authorization");
});

it("failed prints keep short diagnostics in immutable Evidence even before retries exhaust", async () => {
  const { PdfPrintError } = await import("../src/lib/pdf-diagnostics");
  const { repo, service, draft } = await setup();
  const p = await service.send(draft.id, staff);
  await mutate(repo, p.id, (p) =>
    queue(p, "pdf", "pdf:company", {
      stage: "company",
      version: p.versions[0],
      signers: [],
      events: [],
    }),
  );
  const diagnostic: any = {
    stage: "company",
    print: "certificate",
    attempt: 2,
    page_count: 1,
    geometry: { width: 816, height: 1056 },
    memory: { rss: 12, heap_used: 4, external: 2, chromium_rss: 30 },
    chromium: "153",
    console: ["console output"],
    stderr: ["stderr output"],
    error: "Printing failed",
    at: new Date().toISOString(),
  };
  const worker = new Worker(
    repo,
    storage,
    new MockMailer(),
    {
      qbo: new MockBillingProvider("qbo"),
      stripe: new MockBillingProvider("stripe"),
    },
    async () => {
      throw new PdfPrintError("Printing failed", [diagnostic]);
    },
  );
  await worker.drain(p.id, "pdf");
  const row = (await repo.get(p.id))!;
  expect(
    row.events.findLast((e) => e.type === "sync_failed")?.metadata
      .pdf_diagnostics,
  ).toEqual([diagnostic]);
  expect(row.jobs.filter((j) => j.payload.job_failure)).toHaveLength(0);
});

it("an email delivery failure alerts staff only at exhaustion without recursively alerting about alert mail", async () => {
  const { repo, service, draft } = await setup();
  const p = await service.send(draft.id, staff);
  class Mailer extends MockMailer {
    async send(input: any, key: string) {
      if (input.to === p.client.email) throw new Error("Recipient rejected");
      await super.send(input, key);
    }
  }
  const mailer = new Mailer(),
    worker = new Worker(repo, storage, mailer, {
      qbo: new MockBillingProvider("qbo"),
      stripe: new MockBillingProvider("stripe"),
    });
  const id = p.jobs.find((j) => j.kind === "email")!.id;
  for (let n = 0; n < 5; n++) {
    await mutate(repo, p.id, (p) => {
      p.jobs.find((j) => j.id === id)!.available_at = new Date(0).toISOString();
    });
    await worker.drain(p.id, "email");
  }
  const alerts = (await repo.get(p.id))!.jobs.filter(
    (j) => j.payload.job_failure,
  );
  expect(alerts).toHaveLength(1);
  expect([...mailer.sent.values()]).toHaveLength(1);
  expect(([...mailer.sent.values()][0] as any).subject).toBe(
    `Email delivery needs attention: ${p.title}`,
  );
});

it("queued legacy per-attempt emails collapse into one current alert instead of spamming after deployment", async () => {
  const { repo, service, draft } = await setup();
  let p = await service.send(draft.id, staff);
  p = await mutate(repo, p.id, (p) => {
    queue(p, "pdf", "pdf:company", { stage: "company" });
    const j = p.jobs.find((j) => j.id.endsWith(":pdf:company"))!;
    j.status = "failed";
    j.attempts = 5;
    j.last_error = "Printing failed";
    for (let n = 0; n < 2; n++) {
      event(p, "sync_failed", system, { job: j.id, error: j.last_error });
      notify(p, "sync_failed");
    }
  });
  const mailer = new MockMailer(),
    worker = new Worker(repo, storage, mailer, {
      qbo: new MockBillingProvider("qbo"),
      stripe: new MockBillingProvider("stripe"),
    });
  await worker.drain(p.id, "email");
  const alerts = [...mailer.sent.values()].filter((m: any) =>
    m.subject.includes("needs attention"),
  ) as any[];
  expect(alerts).toHaveLength(1);
  expect(alerts[0].subject).toContain("Signed PDF and certificate");
  expect(alerts[0].subject).not.toContain("Billing");
  expect(
    (await repo.get(p.id))!.jobs.filter((j) => j.payload.job_failure),
  ).toHaveLength(1);
});
