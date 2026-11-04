import { it, expect } from "vitest";
import {
  defaultHeaderFooter,
  HeaderFooterSettingsSchema,
  pageGeometry,
  BandSpacingSchema,
} from "../src/lib/page-bands";
import { resolveStyles } from "../src/lib/proposal-styles";
import {
  CoverSchema,
  coverElements,
  coverText,
  defaultCover,
} from "../src/lib/cover";
import { editableCoverHtml } from "../src/lib/cover-render";
import { setup, staff, signature, clientActor } from "./helpers";
import { versionHash } from "../src/lib/content";
it("cover edits publish on the same link, preserve earlier versions and lock after a signature", async () => {
  const f = await setup();
  const sent = await f.service.send(f.draft.id, staff);
  const first = JSON.stringify(sent.versions[0]),
    hash = versionHash(sent.versions[0]);
  const elements = coverElements(sent.cover ?? defaultCover(), sent.title).map(
    (e) => ({ ...e, align: "center" as const, space_below: 32 }),
  );
  const edited = await f.service.edit(
    sent.id,
    { revision: sent.revision, cover: { ...sent.cover!, elements } },
    staff,
  );
  expect(edited.token).toBe(sent.token);
  expect(edited.versions).toHaveLength(2);
  expect(edited.versions[1].cover?.elements?.[0].align).toBe("center");
  expect(JSON.stringify(edited.versions[0])).toBe(first);
  expect(versionHash(edited.versions[0])).toBe(hash);
  const signed = await f.service.sign(
    edited.id,
    signature(edited.revision),
    "client",
    clientActor,
    { token: edited.token!, password: "" },
  );
  await expect(
    f.service.edit(
      signed.id,
      { revision: signed.revision, cover: { ...signed.cover!, elements: [] } },
      staff,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
it("cover styles retain dynamic titles, rich fields, image offsets and frozen serialized values", () => {
  const cover = defaultCover(),
    elements = coverElements(cover, "Template title");
  expect(elements.find((e) => e.kind === "title")?.content).toBeUndefined();
  const edited = CoverSchema.parse({
    ...cover,
    elements: elements.map((e) =>
      e.kind === "prepared_for"
        ? {
            ...e,
            align: "center",
            space_below: 32,
            content: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "variable",
                      attrs: { path: "client.company" },
                      marks: [{ type: "bold" }],
                    },
                  ],
                },
              ],
            },
          }
        : e,
    ),
  });
  const before = JSON.stringify(edited),
    html = editableCoverHtml(edited, "New proposal title", {
      "client.company": "Sample Company",
      "workspace.name": "Sample Studio",
      "proposal.validity": "",
    });
  expect(html).toContain("text-align:center");
  expect(html).toContain("margin-bottom:32px");
  expect(html).toContain("<strong>Sample Company</strong>");
  expect(html).toContain("New proposal title");
  expect(html).not.toContain("Template title");
  expect(JSON.stringify(edited)).toBe(before);
  expect(
    CoverSchema.safeParse({
      ...edited,
      elements: [
        {
          id: "x",
          kind: "extra",
          content: coverText("hello"),
          align: "left",
          space_above: 201,
        },
      ],
    }).success,
  ).toBe(false);
});
it("legacy distance migrates independently; large headers grow margins on cover, shared and hidden pages", () => {
  const defaults = defaultHeaderFooter();
  const legacy = HeaderFooterSettingsSchema.parse({
    ...defaults,
    headerSpacing: undefined,
    footerSpacing: undefined,
    distanceIn: 0.4,
  });
  expect(legacy.headerSpacing.distanceIn).toBe(0.4);
  expect(legacy.footerSpacing.distanceIn).toBe(0.4);
  const hf = {
    ...defaults,
    headerSpacing: BandSpacingSchema.parse({ distanceIn: 0.4, heightIn: 0.6 }),
    footerSpacing: BandSpacingSchema.parse({
      distanceIn: 0.25,
      heightIn: 0.25,
    }),
  };
  const styles = resolveStyles(null, undefined, {
    margins: { top: 0.75, bottom: 0.75, left: 0.75, right: 0.75 },
  });
  for (const page of [1, 2, 3]) {
    const g = pageGeometry(
      styles,
      { ...hf, overrides: { cover: { header: "hidden" } } },
      page,
    );
    expect(g.margins.top).toBeCloseTo(38.4 + 57.6 + 6 + 1 + 8, 8);
    expect(g.margins.bottom).toBe(72);
    expect(g.content.height).toBeCloseTo(1056 - 111 - 72, 8);
    expect(g.bandLimits.header.imageHeight).toBeCloseTo(57.6, 8);
  }
  expect(
    pageGeometry(styles, { ...hf, showHeader: false }, 2).margins.top,
  ).toBe(72);
});
