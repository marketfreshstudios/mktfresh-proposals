import { it, expect } from "vitest";
import {
  PagePlanSchema,
  validatePagePlan,
  type PagePlan,
} from "../src/lib/page-plan";
import { versionHash, canonical, sha256 } from "../src/lib/content";
import { setup, staff, signature, clientActor } from "./helpers";
import { computedPages, moveComputedSection } from "../src/lib/computed-pages";
import { assertBlockMove } from "../src/lib/editor-moves";
it("validates ordered, complete source positions and refuses missing blocks", () => {
  expect(() =>
    PagePlanSchema.parse({
      format: 1,
      pages: 3,
      starts: [{ page: 3, block: "x", offset: 0, explicit: false }],
    }),
  ).toThrow();
  expect(() =>
    validatePagePlan(
      {
        format: 1,
        pages: 2,
        starts: [{ page: 2, block: "missing", offset: 0, explicit: false }],
      },
      [],
    ),
  ).toThrow("missing block");
});
it("hashes saved pagination, preserves absent-plan hashes, and freezes the plan at send/sign", async () => {
  const f = await setup();
  const plan: PagePlan = {
    format: 1,
    pages: 2,
    starts: [
      { page: 2, block: f.draft.content[1].id!, offset: 0, explicit: false },
    ],
  };
  const edited = await f.service.edit(
    f.draft.id,
    { revision: f.draft.revision, pagination: plan },
    staff,
  );
  const p = await f.service.send(edited.id, staff, true);
  const v = p.versions.at(-1)!;
  expect(v.pagination).toEqual(plan);
  expect(v.content_hash).toBe(versionHash(v));
  expect(versionHash({ ...v, pagination: undefined })).not.toBe(v.content_hash);
  const noPlan = { ...v, pagination: undefined };
  expect(versionHash(noPlan)).toBe(
    sha256(
      canonical({
        content: v.content,
        quote: v.quote,
        variables_resolved: v.variables_resolved,
        resolved_styles: v.resolved_styles,
        header_footer: v.header_footer,
        cover: v.cover,
      }),
    ),
  );
  await f.service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  expect((await f.repo.get(p.id))!.versions.at(-1)!.pagination).toEqual(plan);
});
it("layout edits without a browser plan clear stale positions", async () => {
  const f = await setup();
  const p = await f.service.edit(
    f.draft.id,
    {
      revision: f.draft.revision,
      pagination: { format: 1, pages: 1, starts: [] },
    },
    staff,
  );
  const edited = await f.service.edit(
    p.id,
    { revision: p.revision, title: "Changed layout" },
    staff,
  );
  expect(edited.pagination).toBeUndefined();
});
it("places section starts and continuations on computed pages, and guards moves before adding a separator", () => {
  const content = [
    { id: "a", type: "heading" as const, text: "First" },
    { id: "p", type: "paragraph" as const, text: "Long" },
    { id: "b", type: "heading" as const, text: "Second" },
    { id: "q", type: "paragraph" as const, text: "Body" },
  ];
  const pages = computedPages(content, {
    plan: {
      format: 1,
      pages: 3,
      starts: [
        { page: 2, block: "p", offset: 30, explicit: false },
        { page: 3, block: "b", offset: 0, explicit: false },
      ],
    },
    assignments: [
      { block: "a", page: 1 },
      { block: "p", page: 1 },
      { block: "b", page: 3 },
      { block: "q", page: 3 },
    ],
  });
  expect(pages[1].continuing?.title).toBe("First");
  expect(pages[2].sections.map((s) => s.title)).toEqual(["Second"]);
  const moved = moveComputedSection(content, "a", "b", false);
  assertBlockMove(
    content,
    moved.filter((b) => b.type !== "page_break"),
  );
  expect(content.map((b) => b.id)).toEqual(["a", "p", "b", "q"]);
});

it("readiness names overflowing PDF pages without dropping the safe send warnings", async () => {
  const f = await setup();
  Object.assign(f.service, {
    printLayout: async () => ({ overflow_pages: [3], pricing_pages: 2 }),
  });
  const ready = await f.service.checkReady(f.draft);
  expect(ready.warnings).toContain("Page 3 overflows in the PDF · Preview PDF");
  expect(
    ready.warnings.some((s) => s.startsWith("Pricing table spans 2 pages")),
  ).toBe(true);
});

it("queued draft previews reuse saved pagination and resolved styles without creating a version", async () => {
  const f = await setup();
  const draft = await f.service.edit(
    f.draft.id,
    {
      revision: f.draft.revision,
      pagination: { format: 1, pages: 1, starts: [] },
      style_overrides: { density: "comfortable" },
    },
    staff,
  );
  const { proposalAction } = await import("../src/lib/proposal-actions");
  const preview = await proposalAction(
    f.repo,
    draft.id,
    draft.revision,
    "preview_pdf",
    staff,
  );
  const version = preview.jobs.at(-1)!.payload
    .version as import("../src/lib/model").Version;
  expect(version.pagination).toEqual(draft.pagination);
  expect(version.resolved_styles?.layout?.density).toBe("comfortable");
  expect(version.content_hash).toBe(versionHash(version));
  expect(preview.versions).toEqual([]);
});

it("attaches an untouched draft's current plan atomically at send without a metadata revision", async () => {
  const f = await setup();
  const plan: PagePlan = {
    format: 1,
    pages: 2,
    starts: [
      { page: 2, block: f.draft.content[1].id!, offset: 0, explicit: false },
    ],
  };
  const p = await f.service.send(f.draft.id, staff, true, undefined, {
    pagination: plan,
  });
  expect(p.revision).toBe(f.draft.revision + 1);
  expect(p.pagination).toEqual(plan);
  expect(p.versions.at(-1)!.pagination).toEqual(plan);
  expect(p.versions.at(-1)!.content_hash).toBe(versionHash(p.versions.at(-1)!));
});

it("refuses a stale send revision rather than freezing its old browser plan", async () => {
  const f = await setup();
  const current = await f.service.edit(
    f.draft.id,
    { revision: f.draft.revision, title: "Other session" },
    staff,
  );
  await expect(
    f.service.send(f.draft.id, staff, true, undefined, {
      expected_revision: f.draft.revision,
      pagination: { format: 1, pages: 1, starts: [] },
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await f.repo.get(f.draft.id))!.revision).toBe(current.revision);
  expect((await f.repo.get(f.draft.id))!.versions).toEqual([]);
});
