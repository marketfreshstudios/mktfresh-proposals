import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFDict,
  PDFString,
  PDFHexString,
  PDFRawStream,
} from "pdf-lib";
import { editorFixture } from "./editor-fixture";
import { aiTool } from "../src/lib/ai-tools";
import { stampSavedBlocks } from "../src/lib/linked-blocks";
import type { SavedBlock } from "../src/lib/model";

test("a connector case-study group renders its embedded logo and live link in Studio, client sheets and the actual PDF", async ({
  page,
}, testInfo) => {
  const f = await editorFixture(page),
    actor = {
      actor: "ai:Claude",
      workspace_id: f.repo.workspaceId,
      on_behalf_of_user_id: "00000000-0000-4000-8000-000000000001",
      on_behalf_of_name: "Alex Morgan",
      ip: "",
      user_agent: "MCP",
    };
  const call = (name: string, args: unknown) =>
    aiTool(
      f.repo,
      actor,
      name,
      args,
      ["proposals:read", "templates:edit"],
      f.service,
    ) as Promise<any>;
  const png = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="90"><path fill="#365c4a" d="M8 45 38 8 68 45 38 82Z"/><path fill="#fff" d="m38 21 6 18 14 6-14 6-6 18-6-18-14-6 14-6Z"/><text x="84" y="57" font-family="sans-serif" font-size="29" font-weight="700" fill="#13303a">NORTHSTAR</text></svg>',
    ),
  )
    .png()
    .toBuffer();
  const { image_ref } = await call("upload_image", {
    filename: "northstar-logo.png",
    content_base64: png.toString("base64"),
    alt: "Northstar client logo",
  });
  const created = await call("create_saved_block", {
    name: "Northstar case study",
    type: "group",
    content: `![Northstar client logo](${image_ref}){width=120}\n\n## A clearer path to booking\n\nWe helped **Northstar** turn a crowded website into a clear, useful experience. The new pages make it easy for customers to find the right service and get in touch.\n\n[Visit the Northstar website](https://example.test/northstar)`,
  });
  const view = await call("get_saved_block", {
    saved_block_id: created.saved_block_id,
  });
  await call("update_saved_block", {
    saved_block_id: created.saved_block_id,
    revision: view.revision,
    content: view.content,
  });
  const row = (await f.repo.entities<SavedBlock>("content_library")).find(
    (r) => r.id === created.saved_block_id,
  )!;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/studio/blocks/${row.id}`);
  const logo = page.locator('.studio-blocks img[alt="Northstar client logo"]');
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("src", image_ref);
  await expect(
    page.locator('.studio-blocks a[href="https://example.test/northstar"]'),
  ).toHaveText("Visit the Northstar website");
  await page.getByRole("tab", { name: "Fields", exact: true }).click();
  if (process.env.CAPTURE_CONNECTOR_MEDIA) {
    await mkdir("docs/screenshots/connector-media", { recursive: true });
    await page.screenshot({
      path: "docs/screenshots/connector-media/group-editor-1440.png",
      animations: "disabled",
    });
  }
  await f.editRemote({
    content: [
      { id: crypto.randomUUID(), type: "page_break" },
      { id: crypto.randomUUID(), type: "heading", text: "Case study" },
      ...stampSavedBlocks(row),
      ...f.draft.content,
    ],
  });
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  const plan = JSON.parse(
    (await page.locator(".editor-paper").getAttribute("data-pagination"))!,
  );
  await f.editRemote({ pagination: plan });
  const sent = await f.sendRemote();
  await page.goto(`/p/${sent.token}`);
  await expect(page.locator(".client-document-sheets")).toHaveAttribute(
    "data-layout-ready",
    "true",
  );
  const clientLogo = page.locator(
    '.client-document-sheets img[alt="Northstar client logo"]',
  );
  await clientLogo.scrollIntoViewIfNeeded();
  await expect(clientLogo).toBeVisible();
  await expect(clientLogo).toHaveAttribute("src", image_ref);
  const clientLink = page.locator(
    '.client-document-sheets a[href="https://example.test/northstar"]',
  );
  await expect(clientLink).toBeVisible();
  expect(
    await clientLogo.evaluate((el) => parseFloat(getComputedStyle(el).width)),
  ).toBeCloseTo(120, 0);
  if (process.env.CAPTURE_CONNECTOR_MEDIA) {
    await clientLogo.evaluate((img) =>
      img.closest(".client-page-frame")?.scrollIntoView({ block: "start" }),
    );
    await page.evaluate(() => window.scrollBy(0, -64));
    await page.screenshot({
      path: "docs/screenshots/connector-media/client-case-study-1440.png",
      animations: "disabled",
    });
  }
  // The real preview/sealing renderer uses these same blocks and frozen plan.
  await page.goto(`/proposals/${sent.id}/edit`);
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  const bytes = Buffer.from(f.renders[0].pdf_base64, "base64"),
    pdf = await PDFDocument.load(bytes);
  const uris: string[] = [];
  for (const p of pdf.getPages()) {
    const annotations = p.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    for (let i = 0; i < (annotations?.size() ?? 0); i++) {
      const annotation = annotations!.lookup(i, PDFDict),
        action = annotation.lookupMaybe(PDFName.of("A"), PDFDict),
        uri = action?.lookup(PDFName.of("URI"));
      if (uri instanceof PDFString || uri instanceof PDFHexString)
        uris.push(uri.decodeText());
    }
  }
  expect(uris).toContain("https://example.test/northstar");
  expect(
    pdf.context
      .enumerateIndirectObjects()
      .some(
        ([, value]) =>
          value instanceof PDFRawStream &&
          value.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"),
      ),
  ).toBe(true);
  const file = testInfo.outputPath("case-study.pdf");
  await writeFile(file, bytes);
  const text = execFileSync("pdftotext", ["-layout", file, "-"], {
    encoding: "utf8",
  });
  expect(text).toContain("Visit the Northstar website");
  expect(text).toContain("A clearer path to booking");
});
