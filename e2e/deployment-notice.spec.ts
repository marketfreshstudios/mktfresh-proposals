import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { emailEditorFixture } from "./email-editor-fixture";
import { blockText } from "../src/lib/editor-document";
import { publicResult } from "../src/lib/service";
import { mkdir } from "node:fs/promises";
async function buildFixture(page: Page, email = false) {
  const f = email ? await emailEditorFixture(page) : await editorFixture(page);
  const running = await (await page.request.get("/api/staff-build")).json();
  let build = running.buildId,
    checks = 0;
  await page.route("**/api/staff-build", async (route) => {
    checks++;
    await route.fulfill({ json: { buildId: build } });
  });
  return {
    ...f,
    checks: () => checks,
    update: () => {
      build = "new-deployment";
    },
  };
}
test.use({ actionTimeout: 10000 });
const focus = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new Event("focus")));
const notice = (page: Page) =>
  page
    .getByRole("status")
    .filter({ hasText: "A new version of Yeswell is available." });
test("visible staff tabs detect builds, poll every five minutes, snooze thirty minutes and never stack", async ({
  page,
}) => {
  await page.clock.install();
  const f = await buildFixture(page);
  await page.goto("/");
  await expect.poll(f.checks).toBeGreaterThan(0);
  await expect(notice(page)).toHaveCount(0);
  const before = f.checks();
  await page.clock.fastForward(300000);
  await expect.poll(f.checks).toBeGreaterThan(before);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hidden = f.checks();
  f.update();
  await page.clock.fastForward(900000);
  await focus(page);
  expect(f.checks()).toBe(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(notice(page)).toBeVisible();
  await focus(page);
  await focus(page);
  await expect(notice(page)).toHaveCount(1);
  await notice(page)
    .getByRole("button", { name: "Later", exact: true })
    .click();
  await expect(notice(page)).toHaveCount(0);
  const until = await page.evaluate(() =>
    Number(
      sessionStorage.getItem(
        Object.keys(sessionStorage).find((k) =>
          k.startsWith("yeswell-update-later:"),
        )!,
      ),
    ),
  );
  await page.clock.setFixedTime(until - 1);
  await focus(page);
  await expect.poll(f.checks).toBeGreaterThan(hidden + 1);
  await expect(notice(page)).toHaveCount(0);
  await page.clock.setFixedTime(until + 1);
  await focus(page);
  await expect(notice(page)).toHaveCount(0);
  await page.goto("/proposals");
  await expect(notice(page)).toBeVisible();
});
test("the shared dismiss button snoozes a deployment notice", async ({
  page,
}) => {
  const f = await buildFixture(page);
  f.update();
  await page.goto("/");
  await notice(page)
    .getByRole("button", { name: "Dismiss notification" })
    .click();
  await expect(notice(page)).toHaveCount(0);
  await page.goto("/proposals");
  await expect(notice(page)).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).some((key) =>
        key.startsWith("yeswell-update-later:"),
      ),
    ),
  ).toBe(true);
});
test("a focus during the initial build check queues a fresh check instead of dropping the update", async ({
  page,
}) => {
  const f = await buildFixture(page),
    id = (await (await page.request.get("/api/staff-build")).json()).buildId;
  let release = () => {},
    count = 0,
    released = false;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/api/staff-build", async (r) => {
    count++;
    if (!released) {
      await gate;
      await r.fulfill({ json: { buildId: id } }).catch(() => {});
    } else await r.fulfill({ json: { buildId: "new-after-focus" } });
  });
  await page.goto("/");
  await expect.poll(() => count).toBeGreaterThanOrEqual(1);
  const before = count;
  await focus(page);
  released = true;
  release();
  await expect(notice(page)).toBeVisible();
  expect(count).toBeGreaterThan(before);
});
test("top banner does not restart its entrance animation during document updates", async ({
  page,
}) => {
  const f = await buildFixture(page);
  await page.goto(`/proposals/${f.draft.id}/edit`);
  f.update();
  await focus(page);
  const n = notice(page);
  await expect(n).toBeVisible();
  await n.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished));
    (el as HTMLElement).dataset.animationRestarts = "0";
    el.addEventListener("animationstart", () => {
      (el as HTMLElement).dataset.animationRestarts = String(
        Number((el as HTMLElement).dataset.animationRestarts) + 1,
      );
    });
  });
  const b = f.active().content.find((b) => b.type === "paragraph")!;
  await page.locator(`[data-block-id="block-${b.id}"]`).click();
  await page
    .locator(`[data-block-id="block-${b.id}"] .tiptap`)
    .fill("Updated while the notice is visible.");
  await expect
    .poll(() => blockText(f.active().content.find((x) => x.id === b.id)!))
    .toBe("Updated while the notice is visible.");
  await expect(n).toHaveAttribute("data-animation-restarts", "0");
});
test("Reload drains a pending workspace save, waits for it and preserves changes on failure", async ({
  page,
}) => {
  const f = await buildFixture(page);
  let allow = () => {},
    fail = false,
    entered = false;
  let gate = Promise.resolve();
  await page.route("**/api/workspace_settings", async (route) => {
    if (route.request().method() === "POST") {
      entered = true;
      await gate;
      if (fail)
        return route.fulfill({
          status: 500,
          json: { error: "Save unavailable" },
        });
      Object.assign(f.settings, route.request().postDataJSON());
      await f.repo.put("workspace_settings", f.settings);
      return route.fulfill({ json: f.settings });
    }
    return route.fulfill({ json: [f.settings] });
  });
  await page.goto("/studio/workspace?view=business-details");
  f.update();
  await focus(page);
  await expect(notice(page)).toBeVisible();
  gate = new Promise<void>((r) => {
    allow = r;
  });
  await page
    .getByLabel("Legal business name", { exact: true })
    .fill("Updated workspace");
  await notice(page)
    .getByRole("button", { name: "Reload", exact: true })
    .click();
  await expect.poll(() => entered).toBe(true);
  await expect(
    notice(page).getByRole("button", { name: "Saving…" }),
  ).toBeVisible();
  expect(f.settings.business_name).not.toBe("Updated workspace");
  const reloaded = page.waitForEvent("load");
  allow();
  await reloaded;
  await expect(
    page.getByLabel("Legal business name", { exact: true }),
  ).toHaveValue("Updated workspace");
  fail = true;
  entered = false;
  await page
    .getByLabel("Legal business name", { exact: true })
    .fill("Kept after error");
  await notice(page)
    .getByRole("button", { name: "Reload", exact: true })
    .click();
  await expect(
    notice(page).getByText("Save your changes first."),
  ).toBeVisible();
  await expect(
    notice(page).getByRole("button", { name: "Reload", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Legal business name", { exact: true }),
  ).toHaveValue("Kept after error");
});
test("Reload saves a pending template and explicit saved block through the serialized saver", async ({
  page,
}) => {
  const f = await buildFixture(page),
    template = (await f.repo.entities<any>("templates"))[0];
  await page.goto(`/studio/templates/${template.id}`);
  f.update();
  await focus(page);
  await expect(notice(page)).toBeVisible();
  await page
    .getByLabel("Template name", { exact: true })
    .fill("Updated template");
  await Promise.all([
    page.waitForEvent("load"),
    notice(page).getByRole("button", { name: "Reload", exact: true }).click(),
  ]);
  await expect(page.getByLabel("Template name", { exact: true })).toHaveValue(
    "Updated template",
  );
  const block = {
    id: crypto.randomUUID(),
    name: "Original block",
    block: {
      id: crypto.randomUUID(),
      type: "paragraph",
      text: "Useful content",
    },
  };
  await f.repo.put("content_library", block);
  await page.route("**/api/content_library**", async (r) => {
    if (r.request().method() === "POST") {
      Object.assign(block, r.request().postDataJSON());
      await f.repo.put("content_library", block);
      return r.fulfill({ json: block });
    }
    return r.fulfill({ json: [block] });
  });
  await page.goto(`/studio/blocks/${block.id}`);
  await page
    .getByLabel("Block name", { exact: true })
    .fill("Saved before reload");
  await expect(notice(page)).toBeVisible();
  await Promise.all([
    page.waitForEvent("load"),
    notice(page).getByRole("button", { name: "Reload", exact: true }).click(),
  ]);
  await expect(page.getByLabel("Block name", { exact: true })).toHaveValue(
    "Saved before reload",
  );
});
test("dirty explicit email edits and unsaved proposal edits cannot silently reload", async ({
  page,
}) => {
  const f = await buildFixture(page, true);
  await page.goto("/studio/emails/proposal_sent");
  f.update();
  await focus(page);
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("Unsaved email subject");
  await expect(
    notice(page).getByText("Save your changes first."),
  ).toBeVisible();
  await expect(
    notice(page).getByRole("button", { name: "Reload", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    notice(page).getByRole("button", { name: "Reload", exact: true }),
  ).toBeEnabled();
  await page.goto(`/proposals/${f.draft.id}/edit`);
  await expect(notice(page)).toBeVisible();
  const block = f.active().content.find((b) => b.type === "paragraph")!;
  const paragraph = page.locator(
    `.editor-paper [data-block-id="block-${block.id}"] .tiptap`,
  );
  await page
    .locator(`.editor-paper [data-block-id="block-${block.id}"]`)
    .click();
  // An offline editor must keep text on the device and block reload.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    window.dispatchEvent(new Event("offline"));
  });
  await paragraph.fill("Kept proposal text");
  await expect(
    notice(page).getByRole("button", { name: "Reload", exact: true }),
  ).toBeDisabled();
  await expect(paragraph).toContainText("Kept proposal text");
});
test("an unrelated failed test email does not block reloading a fully saved editor", async ({
  page,
}) => {
  const f = await buildFixture(page, true);
  await page.route("**/api/email-templates/proposal_sent/test", (r) =>
    r.fulfill({ status: 503, json: { error: "Test delivery unavailable" } }),
  );
  await page.goto("/studio/emails/proposal_sent");
  f.update();
  await focus(page);
  await expect(notice(page)).toBeVisible();
  await page
    .getByRole("button", { name: "Send me a test", exact: true })
    .click();
  await expect(
    page.getByText("Test delivery unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    notice(page).getByRole("button", { name: "Reload", exact: true }),
  ).toBeEnabled();
  await expect(notice(page).getByText("Save your changes first.")).toHaveCount(
    0,
  );
});
for (const width of [1440, 768, 375])
  for (const surface of ["home", "editor"])
    for (const theme of ["light", "dark"])
      test(`top notice clears navigation/header at ${width} ${theme} ${surface}`, async ({
        page,
      }) => {
        const f = await buildFixture(page);
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((theme) => {
          localStorage.setItem("proposal-theme", theme);
        }, theme);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(
          surface === "editor" ? `/proposals/${f.draft.id}/edit` : "/",
        );
        if (surface === "editor")
          await expect(page.locator(".editor-document-header")).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const focusedBefore = await page.evaluateHandle(
          () => document.activeElement,
        );
        f.update();
        await focus(page);
        const n = notice(page);
        await expect(n).toBeVisible();
        expect(
          await page.evaluate(
            (el) => document.activeElement === el,
            focusedBefore,
          ),
        ).toBe(true);
        await focusedBefore.dispose();
        await expect(n).toHaveCSS("background-color", "rgb(24, 34, 38)");
        expect(
          (
            await new AxeBuilder({ page })
              .include(".deployment-notice")
              .analyze()
          ).violations,
        ).toEqual([]);
        const close = n.getByRole("button", { name: "Dismiss notification" });
        await expect(close).toHaveCSS("width", "32px");
        await expect(close).toHaveCSS("height", "32px");
        for (const button of [
          n.getByRole("button", { name: "Later", exact: true }),
          n.getByRole("button", { name: "Reload", exact: true }),
        ]) {
          const box = (await button.boundingBox())!;
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.width).toBeGreaterThanOrEqual(44);
          await button.focus();
          await expect(button).toBeFocused();
        }
        await expect(
          n.getByRole("button", { name: "Reload", exact: true }),
        ).toHaveClass(/primary/);
        const box = (await n.boundingBox())!;
        expect(box.height).toBeLessThan(220);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        const bounds = await page.evaluate(() => {
          const region =
            document.querySelector(".editor-document-region") ??
            document.querySelector("#workspace-content")!;
          const main = region.getBoundingClientRect();
          const header = document.querySelector(
            ".editor-document-header,.staff-mobile-brand",
          );
          const h = header?.getBoundingClientRect();
          return {
            left: main.left,
            right: main.right,
            headerBottom: h && h.width && h.height ? Math.max(0, h.bottom) : 0,
          };
        });
        expect(box.x).toBeGreaterThanOrEqual(Math.max(0, bounds.left));
        expect(box.x + box.width).toBeLessThanOrEqual(bounds.right + 1);
        if (width >= 700)
          expect(box.y).toBeGreaterThanOrEqual(bounds.headerBottom + 15);
        expect(box.width).toBeLessThanOrEqual(560);
        if (width === 375) {
          const gutter = surface === "home" ? 18 : 16;
          expect(box.x).toBeCloseTo(gutter, 0);
          expect(box.width).toBeCloseTo(width - gutter * 2, 0);
        }
        await expect(n).toHaveCSS("animation-name", "none");
        await page.evaluate(() =>
          (document.activeElement as HTMLElement)?.blur(),
        );
        await expect(
          n.getByRole("button", { name: "Reload", exact: true }),
        ).not.toBeFocused();
        if (
          process.env.CAPTURE_POLISH &&
          (width === 1440 || (width === 375 && surface === "home"))
        ) {
          await mkdir("docs/screenshots/brand-polish", { recursive: true });
          await page.screenshot({
            path: `docs/screenshots/brand-polish/banner-${surface}-${width}-${theme}.png`,
          });
        }
      });
test("public proposal and signing routes never check or show deployment notices", async ({
  page,
}) => {
  const f = await buildFixture(page);
  await f.editRemote({
    content: [
      ...f.active().content,
      { id: crypto.randomUUID(), type: "signature_block", role: "company" },
    ],
  });
  const sent = await f.sendRemote();
  await page.route("**/api/public/**", (r) =>
    r.fulfill({ json: publicResult(sent) }),
  );
  for (const path of [
    `/p/${sent.token}`,
    `/billing/complete`,
    `/proposals/${sent.id}?action=countersign`,
  ]) {
    await page.goto(path);
    f.update();
    await focus(page);
    await expect(notice(page)).toHaveCount(0);
  }
  expect(f.checks()).toBe(0);
});
