import { expect, it } from "vitest";
import { insertAuthoringBlocks } from "../src/lib/block-insertion";
import { blockOptions } from "../src/components/block-options";
it("inserts the signer pair with one editable heading and preserves the existing blocks", () => {
  const before = [{ id: "a", type: "paragraph" as const, text: "Intro" }];
  const next = insertAuthoringBlocks(
    before,
    [
      { type: "signature_block", role: "client" },
      { type: "signature_block", role: "company" },
    ],
    1,
  );
  expect(next.map((b) => b.type)).toEqual([
    "paragraph",
    "heading",
    "signature_block",
    "signature_block",
  ]);
  expect(next[1].text).toBe("Signatures");
  expect(next[0]).toEqual(before[0]);
  expect(before).toHaveLength(1);
});
it("retains an existing heading and refuses duplicate signer roles and pricing tables", () => {
  const existing = [{ id: "h", type: "heading" as const, text: "Agreement" }];
  const next = insertAuthoringBlocks(
    existing,
    [{ type: "signature_block", role: "client" }],
    1,
  );
  expect(next).toHaveLength(2);
  expect(() =>
    insertAuthoringBlocks(
      next,
      [{ type: "signature_block", role: "client" }],
      2,
    ),
  ).toThrow("Only one client signature");
  expect(() =>
    insertAuthoringBlocks(
      [{ type: "pricing_table" }],
      [{ type: "pricing_table" }],
      0,
    ),
  ).toThrow("Only one pricing table");
});
it("the shared menu explains duplicates while exposing all signature options and divider", () => {
  const options = blockOptions({
    hasPricing: false,
    saved: [],
    signatureRoles: ["client"],
  });
  expect(options.find((o) => o.name === "Signatures")?.disabled).toBe(true);
  expect(
    options.find((o) => o.name === "Client signature")?.description,
  ).toContain("only one");
  expect(options.find((o) => o.name === "Company signature")?.disabled).toBe(
    false,
  );
  expect(
    options.find((o) => o.name === "Divider")?.block?.content?.content?.[0]
      .type,
  ).toBe("horizontalRule");
});
