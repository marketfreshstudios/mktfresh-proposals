import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import {
  setup,
  staff,
  signature,
  clientActor,
  companyConsent,
} from "./helpers";
import {
  calendarDate,
  defaultValidUntil,
  endOfDay,
  readableDate,
} from "../src/lib/validity";
import { whiteContrast, accessibleAccent } from "../src/lib/brand";
import {
  uploadFont,
  uploadedFonts,
  readFont,
  validateFonts,
  activity,
  activityCsv,
  workspaceEvent,
} from "../src/lib/studio";
import { fontCss, fontFamily } from "../src/lib/proposal-fonts";
import { MemoryRepository } from "../src/lib/repository";
import { settingsSnapshot } from "../src/lib/proposal-settings";
import {
  hashPassword,
  passwordMatches,
  versionHash,
  variables,
} from "../src/lib/content";
import { eventLabel } from "../src/lib/event-label";
import type { WorkspaceSettings } from "../src/lib/workspace";
const files = () => {
  const map = new Map<string, Uint8Array>();
  return {
    put: async (p: string, b: Uint8Array) => {
      map.set(p, b);
    },
    get: async (p: string) => map.get(p)!,
  };
};
describe("workspace calendar expiry", () => {
  it("defaults to New York day-end, including winter and summer offsets", () => {
    const settings = {
      timezone: "America/New_York",
      default_validity_days: 30,
    };
    expect(defaultValidUntil(settings, new Date("2026-10-30T01:00:00Z"))).toBe(
      "2026-11-29T04:59:59.999Z",
    );
    expect(
      defaultValidUntil(
        { timezone: "America/New_York" } as any,
        new Date("2026-10-30T01:00:00Z"),
      ),
    ).toBe("2026-11-29T04:59:59.999Z");
    expect(defaultValidUntil(settings, new Date("2026-06-01T12:00:00Z"))).toBe(
      "2026-07-02T03:59:59.999Z",
    );
    expect(endOfDay("2026-03-08", settings.timezone)).toBe(
      "2026-03-09T03:59:59.999Z",
    );
    expect(endOfDay("2026-11-01", settings.timezone)).toBe(
      "2026-11-02T04:59:59.999Z",
    );
    expect(calendarDate("2026-11-29T04:59:59.999Z", settings.timezone)).toBe(
      "2026-11-28",
    );
    expect(readableDate("2026-11-29T04:59:59.999Z", settings.timezone)).toBe(
      "November 28, 2026",
    );
  });
  it("does not expire a proposal until that workspace day actually ends", async () => {
    const { service, draft, repo, settings } = await setup();
    const deadline = endOfDay("2026-11-28", settings.timezone);
    const p = await service.edit(
      draft.id,
      { revision: draft.revision, valid_until: deadline },
      staff,
    );
    const sent = await service.send(p.id, staff);
    service.clock = () => new Date("2026-11-29T03:00:00Z");
    await service.tick();
    expect((await repo.get(sent.id))!.status).toBe("sent");
    service.clock = () => new Date("2026-11-29T05:00:00Z");
    await service.tick();
    expect((await repo.get(sent.id))!.status).toBe("expired");
  });
});
it("suggests the same hue with accessible white contrast", () => {
  expect(whiteContrast("#ffffff")).toBe(1);
  expect(whiteContrast("#000000")).toBe(21);
  expect(whiteContrast(accessibleAccent("#9acbaa"))).toBeGreaterThanOrEqual(
    4.5,
  );
  expect(accessibleAccent("#365c4a")).toBe("#365c4a");
});
it("uploads private immutable fonts only with an embedding license and enforces workspace ownership", async () => {
  const repo = new MemoryRepository(),
    storage = files();
  const bytes = await readFile("public/fonts/InstrumentSans-Variable.woff2"),
    data = "data:font/woff2;base64," + bytes.toString("base64");
  await expect(
    uploadFont(repo, storage, staff, {
      name: "My font",
      data,
      licensed: false,
    }),
  ).rejects.toThrow("licensed");
  await expect(
    uploadFont(repo, storage, staff, {
      name: "Bad font",
      data: "data:font/woff2;base64," + Buffer.alloc(100).toString("base64"),
      licensed: true,
    }),
  ).rejects.toThrow("valid");
  const font = await uploadFont(repo, storage, staff, {
    name: "My font",
    data,
    licensed: true,
  });
  expect(font.path).toBe(`${repo.workspaceId}/fonts/${font.id}.woff2`);
  expect(await storage.get(font.path)).toEqual(bytes);
  expect(await uploadedFonts(repo)).toEqual([font]);
  await expect(
    validateFonts(repo, { heading: font, body: "serif" }),
  ).resolves.toBeUndefined();
  await expect(
    validateFonts(
      new MemoryRepository("00000000-0000-4000-8000-000000000099"),
      { heading: font, body: "serif" },
    ),
  ).rejects.toThrow("workspace");
  const event = (await repo.entities<any>("workspace_events"))[0];
  expect(event.metadata.licensed_for_pdf_embedding).toBe(true);
  expect(event.actor).toBe(staff.actor);
  expect(
    fontCss({ proposal_fonts: { heading: font, body: "sans" } }),
  ).toContain(`/api/workspace-fonts/${font.id}`);
  expect(fontFamily("serif")).toContain("Source Serif 4");
  await storage.put(font.path, Buffer.from("tampered"));
  await expect(readFont(storage, font, repo.workspaceId)).rejects.toThrow(
    "fingerprint",
  );
});
it("workspace defaults apply to new drafts and never expose default passwords in public settings or mutate a frozen version", async () => {
  const { repo, service, draft, settings } = await setup();
  settings.default_password_hash = hashPassword("example-password");
  settings.currency = "CAD";
  settings.proposal_fonts = { heading: "sans", body: "serif" };
  await repo.put("workspace_settings", settings);
  const created = await service.create(
    {
      client_id: draft.client.id,
      template_id: draft.template_id!,
      title: "Defaults",
    },
    staff,
  );
  expect(created.currency).toBe("CAD");
  expect(passwordMatches("example-password", created.password_hash!)).toBe(
    true,
  );
  expect(settingsSnapshot(settings).default_password_hash).toBeUndefined();
  const sent = await service.send(created.id, staff);
  const signed = await service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "example-password" },
  );
  const frozen = structuredClone(signed.versions.at(-1)!);
  expect(signed.workspace_settings?.proposal_fonts).toEqual(
    settings.proposal_fonts,
  );
  settings.proposal_fonts = { heading: "mono", body: "sans" };
  await repo.put("workspace_settings", settings);
  await service.sign(
    signed.id,
    companyConsent(signed.revision, settings),
    "company",
    staff,
  );
  expect((await repo.get(signed.id))!.versions.at(-1)).toEqual(frozen);
  expect(versionHash(frozen)).toBe(frozen.content_hash);
});
it("renders readable timeline sentences for consent and unknown future events without changing stored types", () => {
  expect(
    eventLabel({
      type: "consent_given",
      actor: "client",
      metadata: { role: "client" },
    }),
  ).toBe("Client gave consent");
  expect(
    eventLabel({
      type: "consent_given",
      actor: staff.actor,
      metadata: { role: "company" },
    }),
  ).toBe("Company signer gave consent");
  for (const type of [
    "created",
    "edited",
    "sent",
    "viewed",
    "quote_changed",
    "signed",
    "counter_signed",
    "downloaded",
    "reminder_sent",
    "reminder_requested",
    "invoice_created",
    "subscription_created",
    "sync_failed",
    "reopened",
    "future_internal_name",
  ]) {
    const label = eventLabel({ type, actor: staff.actor, metadata: {} });
    expect(label).toMatch(/^[A-Z]/);
    expect(label).not.toContain("_");
    expect(label).not.toBe(type);
  }
});
it("activity combines proposal and Studio events without exposing pricing-reference contents and protects CSV cells", async () => {
  const { repo, draft } = await setup();
  await workspaceEvent(repo, staff, "templates_saved", {
    name: "=danger",
    entity_id: "id",
  });
  await repo.put("workspace_events", {
    id: crypto.randomUUID(),
    type: "document_version",
    created_at: new Date().toISOString(),
    content: "private reference text",
    version: "v1",
    content_hash: "abc",
  });
  const rows = await activity(repo);
  expect(rows.some((e) => e.proposal_id === draft.id)).toBe(true);
  expect(rows.some((e) => e.type === "templates_saved")).toBe(true);
  expect(JSON.stringify(rows)).not.toContain("private reference text");
  const csv = activityCsv(rows);
  expect(csv).toContain('"\'=danger"');
  expect(csv).toContain('"When","Who","Event","Detail","IP"');
});
it("a staff billing-link resend preserves the signed version, uses the proposal email job, and rejects assistants", async () => {
  const { repo, service, draft } = await setup();
  const sent = await service.send(draft.id, staff);
  const signed = await service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  signed.billing_links = [
    {
      provider: "stripe",
      status: "succeeded",
      attempts: 1,
      metadata: { requires_checkout: true },
    },
  ];
  await repo.save(signed, signed.revision);
  const { proposalAction } = await import("../src/lib/proposal-actions"),
    { billingOpen } = await import("../src/lib/proposal-state");
  expect(billingOpen(signed)).toBe(true);
  await expect(
    proposalAction(repo, signed.id, signed.revision, "resend_billing_link", {
      ...staff,
      actor: "ai:test",
    }),
  ).rejects.toThrow("Staff authorization");
  const next = await proposalAction(
    repo,
    signed.id,
    signed.revision,
    "resend_billing_link",
    staff,
  );
  expect(next.versions).toEqual(signed.versions);
  expect(next.jobs.at(-1)?.kind).toBe("email");
  expect(next.jobs.at(-1)?.payload.to).toBe(signed.client.email);
  expect(next.events.at(-1)?.type).toBe("billing_link_resent");
  expect(next.billing_links).toEqual(signed.billing_links);
});
it("the existing database stores font snapshots and append-only license evidence without a schema conversion", async () => {
  const { postgresFixture } = await import("./postgres-fixture");
  const db = await postgresFixture();
  const { repo, settings } = await setup();
  try {
    const id = crypto.randomUUID();
    const font = {
      id,
      name: "Studio",
      path: `${repo.workspaceId}/fonts/${id}.woff2`,
      hash: "a".repeat(64),
      format: "woff2",
    };
    const data = {
      ...settings,
      proposal_fonts: { heading: "serif", body: font },
      default_validity_days: 45,
      currency: "CAD",
    };
    await db.query(
      "insert into workspace_settings(id,workspace_id,data) values($1,$2,$3) on conflict(id) do update set data=excluded.data",
      [settings.id, repo.workspaceId, JSON.stringify(data)],
    );
    const result = await db.query<{ data: WorkspaceSettings }>(
      "select data from workspace_settings where id=$1",
      [settings.id],
    );
    expect(result.rows[0].data.proposal_fonts).toEqual(data.proposal_fonts);
    expect(result.rows[0].data.default_validity_days).toBe(45);
    const event = {
      id: crypto.randomUUID(),
      type: "font_uploaded",
      actor: staff.actor,
      created_at: new Date().toISOString(),
      metadata: { font, licensed_for_pdf_embedding: true },
    };
    await db.query(
      "insert into workspace_events(id,workspace_id,data) values($1,$2,$3)",
      [event.id, repo.workspaceId, JSON.stringify(event)],
    );
    await expect(
      db.query("update workspace_events set data='{}' where id=$1", [event.id]),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
});
