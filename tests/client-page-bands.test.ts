import { expect, it } from "vitest";
import { setup, staff } from "./helpers";
import { publicResult } from "../src/lib/service";
import { defaultHeaderFooter } from "../src/lib/page-bands";

it("public sheets use published bands and client-visible terms without exposing billing metadata", async () => {
  const f = await setup();
  const hf = defaultHeaderFooter();
  hf.overrides.cover = { header: "hidden" };
  const quote = f.draft.quote.map((item, n) => ({
    ...item,
    plan_terms: {
      ...item.plan_terms,
      client_copy: `Agreed terms ${n}`,
      private_internal: "never-public",
    },
  }));
  await f.service.edit(
    f.draft.id,
    { revision: f.draft.revision, quote, header_footer: hf },
    staff,
  );
  const sent = await f.service.send(f.draft.id, staff);
  // Unpublished staff changes must never change the client's band projection.
  sent.header_footer = { ...hf, showFooter: false };
  const result = publicResult(sent);
  expect(result.header_footer).toEqual(sent.versions.at(-1)!.header_footer);
  expect(result.header_footer!.showFooter).toBe(true);
  expect(result.client_item_terms).toEqual(
    Object.fromEntries(quote.map((i, n) => [i.id, `Agreed terms ${n}`])),
  );
  expect(JSON.stringify(result)).not.toContain("never-public");
  expect(result.quote.every((i) => !("plan_terms" in i))).toBe(true);
  delete sent.versions.at(-1)!.header_footer;
  expect(publicResult(sent)).not.toHaveProperty("header_footer");
});
