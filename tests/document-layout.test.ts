import { expect, it } from "vitest";
import {
  documentLayout,
  documentStyleCss,
  freezeStyles,
  pageMetrics,
  resolveStyles,
  StyleOverridesSchema,
} from "../src/lib/proposal-styles";
import { setup, staff, signature, clientActor } from "./helpers";
import { versionHash } from "../src/lib/content";
it("defaults to Standard and .75in with property-wise layout precedence", () => {
  const base = resolveStyles();
  expect(base.layout).toEqual({
    density: "standard",
    margins: { top: 0.75, right: 0.75, bottom: 0.75, left: 0.75 },
  });
  expect(pageMetrics(base)).toMatchObject({
    contentWidth: 672,
    contentHeight: 912,
  });
  const resolved = resolveStyles(
    {
      proposal_styles: { density: "comfortable", margins: { top: 1, left: 1 } },
    },
    { margins: { right: 1.25 } },
    { density: "standard", margins: { top: 0.5 } },
  );
  expect(resolved.layout).toEqual({
    density: "standard",
    margins: { top: 0.5, right: 1.25, left: 1, bottom: 0.75 },
  });
  expect(documentStyleCss(base)).toContain("line-height:1.5");
  expect(
    documentStyleCss(
      resolveStyles(undefined, undefined, { density: "comfortable" }),
    ),
  ).toContain("line-height:1.65");
});
it("validates page margins and keeps earlier frozen maps at their existing metrics", () => {
  expect(StyleOverridesSchema.safeParse({ margins: { top: 0 } }).success).toBe(
    false,
  );
  expect(
    StyleOverridesSchema.safeParse({ margins: { left: 2.1 } }).success,
  ).toBe(false);
  const old = freezeStyles();
  delete old.layout;
  const before = JSON.stringify(old);
  expect(documentLayout(old)).toMatchObject({
    density: "comfortable",
    margins: { top: 18 / 25.4 },
  });
  expect(pageMetrics(old).contentWidth).toBeCloseTo(816 - (36 / 25.4) * 96);
  documentStyleCss(old);
  expect(JSON.stringify(old)).toBe(before);
});
it("freezes density/margins at send and preserves signed hashes after workspace edits", async () => {
  const f = await setup();
  f.settings.proposal_styles = { density: "comfortable", margins: { left: 1 } };
  await f.repo.put("workspace_settings", f.settings);
  const p = await f.service.edit(
    f.draft.id,
    {
      revision: f.draft.revision,
      style_overrides: { density: "standard", margins: { top: 0.5 } },
    },
    staff,
  );
  const sent = await f.service.send(p.id, staff);
  expect(sent.versions.at(-1)!.resolved_styles?.layout).toMatchObject({
    density: "standard",
    margins: { top: 0.5, left: 1 },
  });
  const signed = await f.service.sign(
    p.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const v = structuredClone(signed.versions.at(-1)!);
  f.settings.proposal_styles = {
    density: "comfortable",
    margins: { top: 1.5 },
  };
  await f.repo.put("workspace_settings", f.settings);
  expect(versionHash((await f.repo.get(p.id))!.versions.at(-1)!)).toBe(
    v.content_hash,
  );
  expect((await f.repo.get(p.id))!.versions.at(-1)).toEqual(v);
});
it("shared readiness exposes measured pricing-table warnings without estimating in the browser", async () => {
  const f = await setup();
  const { ProposalService } = await import("../src/lib/service");
  const service = new ProposalService(
    f.repo,
    undefined,
    undefined,
    undefined,
    async () => ({ pricing_pages: 2 }),
  );
  expect((await service.checkReady(f.draft)).warnings).toContain(
    "Pricing table spans 2 pages — use Standard density or trim descriptions.",
  );
});
