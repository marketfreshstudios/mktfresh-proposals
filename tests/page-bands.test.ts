import { it, expect } from "vitest";
import {
  BandSchema,
  HeaderFooterSettingsSchema,
  TemplateBandsSchema,
  defaultHeaderFooter,
  defaultTemplateBands,
  changeBandLayout,
} from "../src/lib/page-bands";
import { setup, staff, signature, clientActor } from "./helpers";
import { versionHash } from "../src/lib/content";
it("reducing valid columns never fails because their combined root content exceeds a per-column limit", () => {
  const content = Array.from({ length: 100 }, () => ({
    type: "paragraph",
    content: [{ type: "text", text: "A retained paragraph." }],
  }));
  const band = BandSchema.parse({
    layout: "thirds",
    slots: Array.from({ length: 3 }, () => ({
      type: "doc",
      content: structuredClone(content),
    })),
  });
  expect(changeBandLayout(band, "left").slots[0].content).toHaveLength(300);
});
it("strict schemas enforce column counts, image slots and embedded/default image sources", () => {
  const hf = defaultHeaderFooter();
  expect(hf.showOnCover).toBe(false);
  expect(hf.bandHeightIn).toBe(0.5);
  expect(hf.shared.header.image?.src).toBe("workspace-logo");
  expect(() =>
    HeaderFooterSettingsSchema.parse({ ...hf, unknown: true }),
  ).toThrow();
  expect(() => TemplateBandsSchema.parse(hf)).toThrow();
  expect(() => BandSchema.parse({ ...hf.shared.header, slots: [] })).toThrow();
  expect(() =>
    BandSchema.parse({
      ...hf.shared.header,
      image: { src: "https://private/image", alt: "x", slot: 0 },
    }),
  ).toThrow();
  expect(() =>
    BandSchema.parse({
      ...hf.shared.header,
      image: { src: "workspace-logo", alt: "x", slot: 2 },
    }),
  ).toThrow();
});
it("thirds to one column retains every rich node, mark and field in order without mutating the source", () => {
  const slot = (text: string) => ({
    type: "doc" as const,
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text, marks: [{ type: "bold" }] },
          { type: "variable", attrs: { path: "client.company" } },
        ],
      },
    ],
  });
  const b = BandSchema.parse({
    layout: "thirds",
    slots: ["One", "Two", "Three"].map(slot),
    image: { src: "workspace-logo", alt: "logo", slot: 2 },
  });
  const before = structuredClone(b),
    n = changeBandLayout(b, "left");
  expect(n.slots).toEqual([
    { type: "doc", content: before.slots.flatMap((s) => s.content) },
  ]);
  expect(n.image?.slot).toBe(0);
  expect(b).toEqual(before);
  expect(changeBandLayout(n, "thirds").slots).toHaveLength(3);
});
it("load defaults, template inheritance, same-link publication, hash and signing lock retain band settings", async () => {
  const f = await setup();
  const templates = await f.repo.entities<any>("templates"),
    t = templates[0];
  t.header_footer = defaultTemplateBands();
  t.header_footer.shared.footer.slots[0].content[0].content = [
    { type: "text", text: "Template footer" },
  ];
  await f.repo.put("templates", t);
  const created = await f.service.create(
    { client_id: f.draft.client.id, template_id: t.id, title: "Bands" },
    staff,
  );
  expect(created.header_footer?.shared).toEqual(t.header_footer.shared);
  expect(created.header_footer?.overrides).toEqual({});
  const missing = { ...f.draft };
  delete missing.header_footer;
  expect((await f.service.forRead(missing)).header_footer).toEqual(
    defaultHeaderFooter(),
  );
  let p = await f.service.send(created.id, staff);
  expect(p.versions.at(-1)?.header_footer?.shared).toEqual(
    t.header_footer.shared,
  );
  const hash = p.versions.at(-1)!.content_hash,
    token = p.token;
  const hf = structuredClone(p.header_footer!);
  hf.showOnCover = true;
  p = await f.service.edit(
    p.id,
    { revision: p.revision, header_footer: hf },
    staff,
  );
  expect(p.token).toBe(token);
  expect(p.versions.at(-1)!.content_hash).not.toBe(hash);
  expect(versionHash(p.versions.at(-1)!)).toBe(p.versions.at(-1)!.content_hash);
  await expect(
    f.service.edit(
      p.id,
      { revision: p.revision, header_footer: hf },
      { ...staff, actor: "ai:test" },
    ),
  ).rejects.toMatchObject({ status: 403 });
  p = await f.service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  await expect(
    f.service.edit(p.id, { revision: p.revision, header_footer: hf }, staff),
  ).rejects.toMatchObject({ status: 409 });
  const v = structuredClone(p.versions.at(-1)!);
  delete v.header_footer;
  const old = versionHash(v);
  expect(versionHash({ ...v, header_footer: undefined })).toBe(old);
  expect(versionHash({ ...v, header_footer: hf })).not.toBe(old);
});

it("shares exact per-page geometry for every band height and switch state, including hidden overrides", async () => {
  const { pageGeometry, pageContentHeight } =
    await import("../src/lib/page-bands");
  const { resolveStyles } = await import("../src/lib/proposal-styles");
  const styles = resolveStyles(null, undefined, {
    margins: { top: 0.75, right: 0.75, bottom: 0.75, left: 0.75 },
  });
  for (const bandHeightIn of [0.4, 0.5, 0.75] as const)
    for (const showHeader of [false, true])
      for (const showFooter of [false, true]) {
        const hf = {
          ...defaultHeaderFooter(),
          bandHeightIn,
          showHeader,
          showFooter,
        };
        const g = pageGeometry(styles, hf, 3),
          band = 96 * bandHeightIn;
        expect(pageContentHeight(styles, hf, 3)).toBeCloseTo(
          912 - (showHeader ? band + 24 : 0) - (showFooter ? band + 24 : 0),
        );
        expect(pageContentHeight(styles, hf, 1)).toBe(912);
        expect(g.header?.y).toBe(showHeader ? 72 : undefined);
        expect(g.footer?.y).toBe(showFooter ? 984 - band : undefined);
        expect(
          pageContentHeight(
            styles,
            {
              ...hf,
              overrides: { cover: { header: "hidden", footer: "hidden" } },
            },
            3,
          ),
        ).toBe(g.content.height);
      }
  const g = pageGeometry(styles, defaultHeaderFooter(), 3);
  expect(g.content).toEqual({ x: 72, y: 144, width: 672, height: 768 });
  expect(g.header).toEqual({ x: 72, y: 72, width: 672, height: 48 });
  expect(g.footer).toEqual({ x: 72, y: 936, width: 672, height: 48 });
  expect(pageContentHeight(styles, undefined, 3)).toBe(912);
});
