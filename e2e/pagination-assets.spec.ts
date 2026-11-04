import { test, expect, type Page, type Locator } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import type { Block } from "../src/lib/model";

const logo =
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="160"><rect width="600" height="160" fill="#777"/></svg>';
const manyPages = (): Block[] =>
  Array.from({ length: 14 }, (_, n) => [
    ...(n ? [{ id: crypto.randomUUID(), type: "page_break" as const }] : []),
    {
      id: crypto.randomUUID(),
      type: "heading" as const,
      text: `Page ${n + 1}`,
    },
    {
      id: crypto.randomUUID(),
      type: "paragraph" as const,
      text: "The complete plan remains editable on every page.",
    },
  ]).flat();

async function obsoleteCompletion(page: Page, root: Locator) {
  await page.route("**/obsolete-logo", (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: logo }),
  );
  await page.evaluate(() => {
    const decode = HTMLImageElement.prototype.decode;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    (window as any).finishObsoleteAsset = release;
    HTMLImageElement.prototype.decode = function (this: HTMLImageElement) {
      return this.src.endsWith("/obsolete-logo")
        ? pending
            .then(() => decode.call(this))
            .finally(() => {
              (window as any).obsoleteAssetFinished = true;
            })
        : decode.call(this);
    };
  });
  const original = await root
    .locator(".document-cover .cover-logo img")
    .getAttribute("src");
  await root.evaluate((el) => {
    el.querySelector("img")!.src = "/obsolete-logo";
    el.dispatchEvent(new Event("pagination-layout-change"));
  });
  await expect(root).toHaveAttribute("data-layout-assets-state", "pending");
  await root.evaluate((el, src) => {
    el.querySelector("img")!.src = src!;
    el.dispatchEvent(new Event("pagination-layout-change"));
  }, original);
  await expect(root).toHaveAttribute("data-layout-assets-state", "settled");
  await root.evaluate((el) => {
    (window as any).obsoleteAssetWaits = 0;
    const observer = new MutationObserver((records) => {
      if (
        el.getAttribute("data-layout-assets-ready") === "false" ||
        records.some((r) => r.oldValue === "false")
      )
        (window as any).obsoleteAssetWaits++;
    });
    observer.observe(el, {
      attributes: true,
      attributeFilter: ["data-layout-assets-ready"],
      attributeOldValue: true,
    });
    (window as any).obsoleteAssetObserver = observer;
  });
  await page.evaluate(() => (window as any).finishObsoleteAsset());
  await expect
    .poll(() => page.evaluate(() => (window as any).obsoleteAssetFinished))
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await page.evaluate(() => (window as any).obsoleteAssetWaits)).toBe(0);
  await page.evaluate(() => (window as any).obsoleteAssetObserver.disconnect());
}

for (const editor of ["proposal", "template"] as const) {
  for (const asset of [
    "failed assets",
    "stalled image",
    "stalled font",
  ] as const) {
    test(`${editor} paginates all sheets with ${asset} and recovers without writes`, async ({
      page,
    }) => {
      const f = await editorFixture(page, false, { content: manyPages() });
      f.settings.logo = "neutral-asset-regression-logo";
      await f.repo.put("workspace_settings", f.settings);
      // Refresh the mock's read model after changing workspace settings.
      await f.editRemote({ title: f.active().title });
      const writes: string[] = [];
      page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (
          (request.method() === "PATCH" &&
            path.startsWith("/api/proposals/")) ||
          (request.method() === "POST" && path === "/api/templates")
        )
          writes.push(path);
      });
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      let imageRequests = 0,
        failedFonts = 0;
      await page.route(
        /\/(preview-logo|workspace-logo)(\?.*)?$/,
        async (route) => {
          imageRequests++;
          if (asset === "stalled image") await held;
          if (asset === "failed assets") await route.abort("failed");
          else
            await route.fulfill({ contentType: "image/svg+xml", body: logo });
        },
      );
      if (asset === "failed assets") {
        await page.route(
          /\/fonts\/SourceSerif4[^/]*\.woff2(\?.*)?$/,
          async (route) => {
            failedFonts++;
            await route.abort("failed");
          },
        );
      }
      if (asset === "stalled font") {
        await page.addInitScript(() => {
          const load = document.fonts.load.bind(document.fonts);
          let release!: () => void;
          const held = new Promise<void>((resolve) => (release = resolve));
          (window as any).finishLayoutFonts = release;
          (window as any).layoutFontRequests = 0;
          document.fonts.load = async (...args) => {
            (window as any).layoutFontRequests++;
            await held;
            return load(...args);
          };
        });
      }
      await page.setViewportSize({ width: 1920, height: 1000 });
      const template = (await f.repo.entities<any>("templates"))[0];
      const rootSelector =
        editor === "proposal" ? ".editor-paper" : ".template-paged-paper";
      const root = page.locator(rootSelector);
      const surface = root.locator(".editor-page-sheets");
      const sheets = root.locator(".page-sheet");
      try {
        await page.goto(
          editor === "proposal"
            ? `/proposals/${f.draft.id}`
            : `/studio/templates/${template.id}`,
        );
        if (asset !== "failed assets") {
          await expect(root).toHaveAttribute(
            "data-layout-assets-ready",
            "false",
          );
          // The placeholder must not advertise an exact, completed layout.
          await expect(surface).toHaveAttribute("data-approximate", "true");
        }
        // Pending or failed resources cannot leave a one-sheet placeholder forever.
        await expect(sheets).toHaveCount(14);
        await expect(surface).toHaveAttribute("data-layout-settled", "true");
        await expect(surface).toHaveAttribute("data-approximate", "false");
        await expect(root.locator(".document-cover")).toHaveCSS("opacity", "1");
        await expect(root.locator(".tiptap").first()).toBeVisible();
        await root.locator(".tiptap").first().focus();
        await expect(root.locator(".tiptap").first()).toBeFocused();
        expect(imageRequests).toBeGreaterThan(0);
        if (asset === "failed assets") {
          expect(failedFonts).toBeGreaterThan(0);
        } else {
          await expect(root).toHaveAttribute(
            "data-layout-assets-state",
            "fallback",
          );
          await root.evaluate((el) => {
            (window as any).assetReplans = 0;
            const observer = new MutationObserver(
              () => (window as any).assetReplans++,
            );
            observer.observe(el, {
              attributes: true,
              attributeFilter: ["data-pagination"],
            });
            (window as any).assetReplanObserver = observer;
          });
          if (asset === "stalled image") release();
          else await page.evaluate(() => (window as any).finishLayoutFonts());
          await expect(root).toHaveAttribute(
            "data-layout-assets-state",
            "settled",
          );
          await expect(sheets).toHaveCount(14);
          await expect(
            root.locator(".document-cover .cover-logo img"),
          ).toHaveJSProperty("naturalWidth", 600);
          await expect(surface).toHaveAttribute("data-layout-settled", "true");
          await expect
            .poll(() => page.evaluate(() => (window as any).assetReplans))
            .toBeGreaterThan(0);
          await page.evaluate(() =>
            (window as any).assetReplanObserver.disconnect(),
          );
          if (asset === "stalled image") await obsoleteCompletion(page, root);
        }
        const plan = JSON.parse((await root.getAttribute("data-pagination"))!);
        expect(plan.pages).toBe(14);
        expect(plan.starts.filter((s: any) => s.explicit)).toHaveLength(13);
        await expect(root.locator(".tiptap").last()).toContainText(
          "complete plan",
        );
        expect(f.patches).toHaveLength(0);
        expect(writes).toEqual([]);
      } finally {
        release();
        if (asset === "stalled font" && !page.isClosed())
          await page
            .evaluate(() => (window as any).finishLayoutFonts?.())
            .catch(() => {});
      }
    });
  }
}
