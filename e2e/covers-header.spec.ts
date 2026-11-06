import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { starterTemplates } from "../seed/starter-templates";
import { proposalBands, pageGeometry } from "../src/lib/page-bands";
import { resolveStyles } from "../src/lib/proposal-styles";
import { previewResult } from "../src/lib/preview";
import { pdfPreview } from "../src/lib/pdf-preview";
import type { Item } from "../src/lib/model";
import { starterLogo } from "../tests/starter-logo";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const shots = "docs/screenshots/covers-header";
for (const withLogo of [true, false])
  test(`page 2 reserves the full header stack in both editors, client and PDF; logo ${withLogo}`, async ({
    page,
  }, testInfo) => {
    const f = await editorFixture(page);
    const t = starterTemplates(f.repo.workspaceId, {
      marketfresh: true,
      catalog: await f.repo.entities<Item>("pricing_items"),
    })[1];
    f.settings.business_state = { name: "North Carolina", other: "" };
    const logo = await starterLogo();
    f.settings.logo = withLogo ? f.repo.workspaceId + "/logo.png" : null;
    await f.repo.put("workspace_settings", f.settings);
    const p = await f.editRemote({
      content: t.content,
      cover: t.cover,
      header_footer: proposalBands(t.header_footer),
    });
    p.workspace_settings = f.settings;
    await f.repo.put("templates", t);
    await page.route("**/preview-logo", (r) =>
      r.fulfill({ body: logo, contentType: "image/png" }),
    );
    await page.route("**/api/workspace-logo", (r) =>
      r.fulfill({ body: logo, contentType: "image/png" }),
    );
    await page.setViewportSize({ width: 1440, height: 1100 });
    await mkdir(shots, { recursive: true });
    for (const [url, root] of [
      [`/proposals/${p.id}/edit`, ".editor-paper"],
      [`/studio/templates/${t.id}`, ".template-paged-paper"],
    ]) {
      await page.goto(url);
      await expect(page.locator(`${root} .editor-page-sheets`)).toHaveAttribute(
        "data-layout-settled",
        "true",
      );
      const data = await page.locator(root).evaluate((el) => {
        const heading = el.querySelector<HTMLElement>("[data-block-id] h2")!;
        const header = el.querySelector<HTMLElement>(
          '[data-page-band="header"][data-band-page="2"]',
        )!;
        const sheet = el.querySelector<HTMLElement>('[data-editor-page="2"]')!;
        return {
          gap:
            heading.getBoundingClientRect().top -
            header.getBoundingClientRect().bottom,
          body:
            heading.getBoundingClientRect().top -
            sheet.getBoundingClientRect().top,
          plan: JSON.parse((el as HTMLElement).dataset.pagination!),
          header: header.textContent,
        };
      });
      expect(data.gap).toBeGreaterThanOrEqual(8);
      expect(data.body).toBeCloseTo(
        pageGeometry(resolveStyles(f.settings), p.header_footer, 2).content.y,
        0,
      );
      if (withLogo) expect(data.header).not.toContain("Example Studio");
      else expect(data.header).toContain("Example Studio");
      p.pagination = data.plan;
      if (root === ".template-paged-paper") {
        await page
          .locator(`${root} [data-editor-page="2"]`)
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${shots}/editor-page2-${withLogo ? "logo" : "name"}-1440.png`,
        });
      }
    }
    const result = await pdfPreview(
      f.repo,
      { get: async () => logo, put: async () => {} },
      p,
      f.settings,
    );
    const path = testInfo.outputPath("proposal.pdf");
    await writeFile(path, Buffer.from(result.pdf_base64, "base64"));
    const prefix = testInfo.outputPath("page2");
    execFileSync("pdftoppm", [
      "-f",
      "2",
      "-singlefile",
      "-r",
      "96",
      "-png",
      path,
      prefix,
    ]);
    await writeFile(
      `${shots}/pdf-page2-${withLogo ? "logo" : "name"}.png`,
      await import("node:fs/promises").then((fs) =>
        fs.readFile(prefix + ".png"),
      ),
    );
    const bbox = execFileSync(
      "pdftotext",
      ["-f", "2", "-l", "2", "-bbox", path, "-"],
      { encoding: "utf8" },
    );
    const overview = /<word[^>]*yMin="([^"]+)"[^>]*>Overview<\/word>/.exec(
      bbox,
    )!;
    expect((Number(overview[1]) * 96) / 72).toBeGreaterThanOrEqual(
      pageGeometry(resolveStyles(f.settings), p.header_footer, 2).header!.y +
        pageGeometry(resolveStyles(f.settings), p.header_footer, 2).header!
          .height,
    );
    // Use the same stored PagePlan in the public print projection.
    const publicP = previewResult(p, f.settings);
    await page.route(`**/api/proposals/${p.id}/preview`, (r) =>
      r.fulfill({ json: publicP }),
    );
    await page.goto(`/p/${p.id}?preview=1`);
    const host = page.locator(
      '.client-document-sheets[data-layout-ready="true"]',
    );
    await expect(host).toBeVisible();
    const metrics = await host
      .locator('[data-client-page="2"]')
      .evaluate((sheet) => {
        const header = sheet.querySelector<HTMLElement>(
          '[data-page-band="header"]',
        )!;
        const body = sheet.querySelector<HTMLElement>(
          '[data-print-kind="heading"] h2',
        )!;
        const scale = Number(
          sheet.getRootNode() instanceof ShadowRoot
            ? (sheet.getRootNode() as ShadowRoot).host.getAttribute(
                "data-scale",
              )
            : 1,
        );
        return {
          gap:
            (body.getBoundingClientRect().top -
              header.getBoundingClientRect().bottom) /
            scale,
        };
      });
    expect(metrics.gap).toBeGreaterThanOrEqual(8);
    expect(result.layout.pages).toBe(p.pagination!.pages);
    expect(result.layout.sheets![1].content_area!.top).toBe(
      pageGeometry(resolveStyles(f.settings), p.header_footer, 2).content.y,
    );
    expect(result.layout.geometry![1].content.height).toBe(
      pageGeometry(resolveStyles(f.settings), p.header_footer, 2).content
        .height,
    );
  });
