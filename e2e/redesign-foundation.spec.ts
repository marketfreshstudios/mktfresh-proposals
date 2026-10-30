import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  setup,
  staff,
  clientActor,
  signature,
  companyConsent,
} from "../tests/helpers";
import type { Proposal } from "../src/lib/model";
test("Foundation: responsive navigation, redirects, typography, money, keyboard and frozen-client isolation", async ({
  page,
  context,
}) => {
  test.setTimeout(600000);
  const { repo, service, draft, settings, members } = await setup();
  let active: Proposal = draft;
  const sent = await service.send(draft.id, staff);
  const signed = await service.sign(
    draft.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const archive = {
    ...signed,
    id: "00000000-0000-4000-8000-000000000099",
    source: "proposify_import",
    status: "archived",
  } as Proposal;
  const stateBefore = JSON.stringify(await repo.get(draft.id));
  let delayAuth = false,
    release: (() => void) | undefined;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname
      .split("/")
      .filter(Boolean)
      .slice(1);
    let value: unknown = [];
    if (path[0] === "auth") {
      if (delayAuth)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      value = {
        user: staff,
        settings,
        staff: members,
        app_url: "http://127.0.0.1:3100",
        signatory_version: companyConsent(0, settings).signatory_version,
      };
    } else if (path[0] === "clients" && path[2] === "billing")
      value = {
        available: false,
        subscriber: false,
        items: [],
        card: null,
        next_invoice: null,
        stripe_url: null,
        qbo_url: null,
        notice: "Stripe is not connected.",
      };
    else if (path[0] === "proposals")
      value = path[1]
        ? active
        : {
            items: [
              draft,
              { ...signed, id: "00000000-0000-4000-8000-000000000098" },
              archive,
            ],
            total: 3,
          };
    else if (
      [
        "clients",
        "pricing_items",
        "templates",
        "content_library",
        "custom_families",
        "workspace_documents",
      ].includes(path[0])
    )
      value = await repo.entities(path[0] as any);
    await route.fulfill({ json: value });
  });
  const externalFonts: string[] = [];
  page.on("request", (r) => {
    if (
      /fonts\.google|\.woff2/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:")
    )
      externalFonts.push(r.url());
  });
  const dir = ".data/evidence/foundation";
  await mkdir(dir, { recursive: true });
  const captures: {
    file: string;
    route: string;
    width: number;
    theme: string;
    frame: string;
  }[] = [];
  const screens = [
    ["home", "/", "3d/3e/3f"],
    ["proposals", "/proposals", "6a/6b/6c"],
    ["clients", "/clients", "6d/6e/6f"],
    ["client", `/clients/${draft.client.id}`, "6d/6e/6f"],
    ["editor", `/proposals/${draft.id}`, "2a/5g/2c"],
    ["send", `/proposals/${draft.id}?view=send`, "2a/5h/2f"],
    ["record", `/proposals/${draft.id}`, "3a/3b/3c"],
    ["countersign", `/proposals/${draft.id}?action=countersign`, "3a/3b/3c"],
    ["evidence", `/proposals/${draft.id}?view=evidence`, "3a/3b/3c"],
    ["templates", "/studio/templates", "7a/7f/7g"],
    ["template", `/studio/templates/${draft.template_id}/edit`, "7a/7f/7g"],
    ["blocks", "/studio/templates?view=blocks", "7a/7f/7g"],
    ["catalog", "/studio/catalog", "7b"],
    ["connections", "/studio/connections", "7c"],
    ["assistants", "/studio/connections?view=assistants", "7c"],
    ["imports", "/studio/connections?view=imports", "7c"],
    ["workspace", "/studio/workspace", "7d/7d/7g"],
    ["team", "/studio/workspace?view=team", "7d/7d/7g"],
    ["activity", "/studio/activity", "7e"],
  ] as const;
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (t) => localStorage.setItem("proposal-theme", t),
      theme,
    );
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [name, url, frame] of screens) {
        active = ["record", "countersign", "evidence"].includes(name)
          ? signed
          : draft;
        await page.goto(url);
        await expect(
          page.getByText("Loading your workspace…", { exact: true }),
        ).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        const shell = page.locator(".staff-foundation");
        await expect(shell).toHaveCSS("font-family", /"Instrument Sans"/);
        await expect(shell).toHaveCSS(
          "background-color",
          theme === "light" ? "rgb(243, 240, 234)" : "rgb(19, 19, 17)",
        );
        if (width >= 1100 && ["editor", "send"].includes(name)) {
          await expect(page.locator(".sidebar")).toBeHidden();
        } else if (width >= 700) {
          await expect(page.locator(".sidebar")).toBeVisible();
          await expect(page.locator(".sidebar")).toHaveCSS(
            "width",
            width >= 1100 ? "232px" : "64px",
          );
        } else {
          await expect(page.locator(".sidebar")).toBeHidden();
          const inside = [
            "editor",
            "send",
            "record",
            "countersign",
            "evidence",
          ].includes(name);
          await expect(
            page.getByRole("navigation", { name: "Phone navigation" }),
          ).toHaveCount(inside ? 0 : 1);
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          name +
            " at " +
            width +
            " " +
            JSON.stringify(
              await page.locator("body *").evaluateAll((els) =>
                els
                  .filter(
                    (e) =>
                      e.getBoundingClientRect().right > innerWidth + 1 &&
                      getComputedStyle(e).position !== "fixed" &&
                      !e.closest(".table-wrap"),
                  )
                  .slice(-8)
                  .map((e) => ({
                    tag: e.tagName,
                    cls: e.className,
                    width: e.getBoundingClientRect().width,
                  })),
              ),
            ),
        ).toBe(true);
        const file = `${name}-${width}-${theme}.png`;
        await page.screenshot({ path: `${dir}/${file}`, fullPage: true });
        captures.push({ file, route: url, width, theme, frame });
        if (name === "home") {
          await page.setViewportSize({
            width,
            height: width === 1440 ? 960 : width === 768 ? 1100 : 780,
          });
          await page.screenshot({
            path: `${dir}/home-frame-${width}-${theme}.png`,
          });
          await page.setViewportSize({ width, height: 1000 });
        }
      }
      active = draft;
      await page.goto("/proposals?new=1");
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.screenshot({
        path: `${dir}/new-${width}-${theme}.png`,
        fullPage: true,
      });
      captures.push({
        file: `new-${width}-${theme}.png`,
        route: "/proposals?new=1",
        width,
        theme,
        frame: "04 modal/sheet",
      });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      if (width === 768) {
        await page
          .getByRole("button", { name: "Studio", exact: true })
          .filter({ visible: true })
          .click();
        await expect(page.locator(".studio-popover")).toBeVisible();
      } else if (width === 375) {
        await page.getByRole("link", { name: "Studio", exact: true }).click();
        await expect(page.locator(".studio-page")).toBeVisible();
      } else await expect(page.locator(".desktop-studio")).toBeVisible();
      await page.screenshot({
        path: `${dir}/studio-menu-${width}-${theme}.png`,
        fullPage: true,
      });
      captures.push({
        file: `studio-menu-${width}-${theme}.png`,
        route: "Studio navigation",
        width,
        theme,
        frame: "01 IA/04 components",
      });
      await page.keyboard.press("Escape");
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  // The shortcut is a client effect; wait for hydrated workspace data on CI.
  await expect(
    page.getByRole("heading", { name: "Recent proposals", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/studio/catalog");
  await page
    .getByRole("textbox", { name: "Search catalog", exact: true })
    .fill("n");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/proposals/new");
  await expect(page).toHaveURL(/\/proposals\?new=1$/);
  await page.keyboard.press("Escape");
  await page.goto("/catalogue");
  await expect(page).toHaveURL(/\/studio\/catalog$/);
  await page.goto("/settings/ai");
  await expect(page).toHaveURL(/\/studio\/connections\?view=assistants$/);
  await page.goto(`/proposals/${draft.id}/edit`);
  await expect(page).toHaveURL(new RegExp(`/proposals/${draft.id}$`));
  // Loading is shaped content and announces itself once; no spinner or external font request.
  delayAuth = true;
  await page.goto("/");
  await expect(
    page.getByRole("status", { name: "Loading your workspace…" }),
  ).toBeVisible();
  await expect(page.locator(".skeleton-line")).toHaveCount(4);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".skeleton-line").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.screenshot({
    path: `${dir}/skeleton-1440-dark.png`,
    fullPage: true,
  });
  delayAuth = false;
  release?.();
  await expect(
    page.getByText("Loading your workspace…", { exact: true }),
  ).toHaveCount(0);
  expect(JSON.stringify(await repo.get(draft.id))).toBe(stateBefore);
  await writeFile(
    `${dir}/manifest.json`,
    JSON.stringify(
      {
        scope:
          "Foundation only; feature content remains existing until its planned redesign phase.",
        captures,
      },
      null,
      2,
    ),
  );
  // Render the supplied HTML frames with their supported design runtime; font bytes are local.
  const design = await context.newPage();
  const font = await readFile("public/fonts/InstrumentSans-Variable.woff2");
  await design.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({
      contentType: "text/css",
      body: `@font-face{font-family:'Instrument Sans';font-style:normal;font-weight:400 700;src:url(data:font/woff2;base64,${font.toString("base64")}) format('woff2');}`,
    }),
  );
  await design.route("https://fonts.gstatic.com/**", (r) => r.abort());
  await design.goto(
    "http://127.0.0.1:4176/Redesign%2003%20-%20Record%20and%20Home.dc.html",
  );
  for (const theme of ["light", "dark"]) {
    await design.evaluate((t) => {
      const w = window as any;
      w.__dcSetProps(w.__dcRootName(), { theme: t });
    }, theme);
    for (const [frame, width] of [
      ["3a", 1440],
      ["3b", 768],
      ["3c", 375],
      ["3d", 1440],
      ["3e", 768],
      ["3f", 375],
    ] as const) {
      await design.setViewportSize({ width: width + 100, height: 1200 });
      await design.evaluate(() => document.fonts.ready);
      const root = design
        .locator(`[id="${frame}"]`)
        .locator(":scope > div")
        .nth(1);
      await expect(root).toBeVisible();
      await root.screenshot({ path: `${dir}/reference-${frame}-${theme}.png` });
    }
  }
  const boards = [
    ["Redesign 02 - Editor.dc.html", ["2a", "2c", "2d", "2f"]],
    ["Redesign 05 - Tablet and Desktop.dc.html", ["5g", "5h"]],
    [
      "Redesign 06 - Proposals and Clients.dc.html",
      ["6a", "6b", "6c", "6d", "6e", "6f"],
    ],
    [
      "Redesign 07 - Studio.dc.html",
      ["7a", "7b", "7c", "7d", "7e", "7f", "7g"],
    ],
    ["Redesign 08 - States.dc.html", ["8c"]],
  ] as const;
  for (const [file, frames] of boards) {
    await design.setViewportSize({ width: 1540, height: 1200 });
    await design.goto("http://127.0.0.1:4176/" + encodeURIComponent(file));
    await design.evaluate(() => document.fonts.ready);
    for (const frame of frames) {
      const node = design
        .locator(`[id="${frame}"]`)
        .locator(":scope > div")
        .nth(1);
      await expect(node).toBeVisible();
      await node.screenshot({ path: `${dir}/reference-${frame}-light.png` });
    }
  }
  await design.goto(
    "http://127.0.0.1:4176/Redesign%2004%20-%20Design%20System.dc.html",
  );
  await design.evaluate(() => document.fonts.ready);
  await design
    .locator("#t4")
    .screenshot({ path: `${dir}/reference-04-components.png` });
  expect(externalFonts).toEqual([]);
  await design.close();
});
