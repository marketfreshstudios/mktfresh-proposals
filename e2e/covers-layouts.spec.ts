import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { starterTemplates } from "../seed/starter-templates";
import { applyCoverLayout, coverText } from "../src/lib/cover";
import { fieldNodes } from "../src/lib/editor-fields";
import { coverLayouts } from "../src/lib/cover-layout";
import { pdfPreview } from "../src/lib/pdf-preview";
import { previewResult } from "../src/lib/preview";
import { validateCoverImage } from "../src/lib/brand-palette";
import { WorkspaceSettingsSchema } from "../src/lib/workspace";
import { setup } from "../tests/helpers";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
const shots = "docs/screenshots/cover-layouts";
const artboards = {
  editorial: "Main",
  split: "Split",
  bold: "Bold",
  photo: "Photo",
  centered: "Centered",
};
for (const layout of coverLayouts)
  test(`${layout} cover uses the same layout and plain metadata in editor, client sheets and actual PDF`, async ({
    page,
  }, info) => {
    const f = await editorFixture(page);
    f.settings.proposal_fonts = { heading: "montserrat", body: "dm-sans" };
    f.settings.accent_colour = "#2f5d50";
    f.settings.brand_palette = ["#b5532e", "#1f4e79"];
    await f.repo.put("workspace_settings", f.settings);
    const starter = starterTemplates(f.repo.workspaceId)[1];
    const cover = applyCoverLayout(starter.cover!, layout);
    cover.elements!.find((e) => e.kind === "title")!.content = fieldNodes(
      coverText("{{proposal.title}}"),
    );
    const photo = await sharp({
      create: { width: 816, height: 680, channels: 3, background: "#c6d7c9" },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="816" height="680"><path d="M0 500L220 180L400 450L620 90L816 500V680H0" fill="#7d9d8e"/><circle cx="680" cy="130" r="75" fill="#e6dcac"/></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();
    if (layout === "photo")
      cover.background = {
        type: "image",
        image: `data:image/png;base64,${photo.toString("base64")}`,
        focal: { x: 70, y: 35 },
        graphic: "none",
      };
    let p = await f.editRemote({
      cover,
      title: "A new website for Harbor & Pine Dental",
      content: [
        { id: "after-cover", type: "page_break" },
        { id: "overview", type: "heading", text: "Overview" },
        { id: "scope", type: "paragraph", text: "A clear and useful plan." },
      ],
    });
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto(`/proposals/${p.id}/edit`);
    const root = page.locator(
      `.editor-paper .document-cover[data-cover-layout="${layout}"]`,
    );
    await expect(root).toBeVisible();
    await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
      "data-layout-settled",
      "true",
    );
    const geometry = await root.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      label: [...el.querySelectorAll(".cover-meta-label")].map(
        (e) => e.textContent,
      ),
      title: getComputedStyle(el.querySelector("h1")!).fontSize,
      overflow:
        document.querySelector("main")!.scrollWidth >
        document.querySelector("main")!.clientWidth,
      text: el.textContent,
    }));
    expect(geometry.height).toBeGreaterThan(800);
    expect(geometry.label).toEqual(
      expect.arrayContaining([
        "Prepared for",
        "Prepared by",
        "Date",
        "Valid until",
      ]),
    );
    expect(geometry.overflow).toBe(false);
    if (layout === "split") {
      await expect(root.locator(".cover-watermark")).toHaveCSS("left", "96px");
      await expect(root.locator(".cover-watermark-clip")).toHaveCSS(
        "width",
        "296px",
      );
      await expect(root.locator(".cover-watermark-clip")).toHaveCSS(
        "overflow",
        "hidden",
      );
    }
    const titleInk = ["bold", "photo"].includes(layout)
      ? "rgb(255, 255, 255)"
      : "rgb(27, 31, 29)";
    await expect(root.locator("h1")).toHaveCSS("color", titleInk);
    await expect(
      root.locator('[data-field="proposal.valid_until"]'),
    ).toHaveClass(/field-chip/);
    const plan = JSON.parse(
      (await page.locator(".editor-paper").getAttribute("data-pagination")) ??
        "{}",
    );
    p = { ...f.active(), pagination: plan, workspace_settings: f.settings };
    if (process.env.CAPTURE_COVERS) {
      await mkdir(shots, { recursive: true });
      await page
        .locator('[data-editor-page="1"]')
        .screenshot({ path: `${shots}/${layout}-editor.png` });
      let html = await readFile(
        `design/covers/${artboards[layout]}.dc.html`,
        "utf8",
      );
      html = html
        .replace(/<script\b[\s\S]*?<\/script>/g, "")
        .replace(/{{accent}}/g, "#2f5d50")
        .replace(/{{markOpacity}}/g, layout === "split" ? "12%" : "8%");
      await page.route("http://cover-reference.test/", (r) =>
        r.fulfill({ contentType: "text/html", body: html }),
      );
      await page.goto("http://cover-reference.test/");
      const reference = await page.locator("x-dc > div").first().screenshot();
      const actual = await readFile(`${shots}/${layout}-editor.png`);
      const a = await sharp(actual).resize({ width: 760 }).png().toBuffer();
      const b = await sharp(reference).resize({ width: 760 }).png().toBuffer();
      const am = await sharp(a).metadata(),
        bm = await sharp(b).metadata();
      await sharp({
        create: {
          width: 1544,
          height: Math.max(am.height!, bm.height!),
          channels: 3,
          background: "#eef0ec",
        },
      })
        .composite([
          { input: a, left: 0, top: 0 },
          { input: b, left: 784, top: 0 },
        ])
        .png()
        .toFile(`${shots}/${layout}-pair-1440.png`);
    }
    const pdf = await pdfPreview(
      f.repo,
      { get: async () => new Uint8Array(), put: async () => {} },
      p,
      f.settings,
    );
    const path = info.outputPath(`${layout}.pdf`);
    await writeFile(path, Buffer.from(pdf.pdf_base64, "base64"));
    const text = execFileSync(
      "pdftotext",
      ["-raw", "-f", "1", "-l", "1", path, "-"],
      {
        encoding: "utf8",
      },
    );
    expect(text.replace(/\s+/g, "")).toContain(
      "AnewwebsiteforHarbor&PineDental",
    );
    expect(text).not.toContain("{{");
    expect(pdf.layout.pages).toBe(plan.pages);
    if (process.env.CAPTURE_COVERS)
      execFileSync("pdftoppm", [
        "-f",
        "1",
        "-singlefile",
        "-r",
        "96",
        "-png",
        path,
        `${shots}/${layout}-pdf`,
      ]);
    await page.route(`**/api/proposals/${p.id}/preview`, (r) =>
      r.fulfill({ json: previewResult(p, f.settings) }),
    );
    await page.goto(`/p/${p.id}?preview=1`);
    const sheets = page.locator(
      '.client-document-sheets[data-layout-ready="true"]',
    );
    await expect(sheets).toBeVisible();
    const client = sheets.locator(`[data-cover-layout="${layout}"]`);
    await expect(client).toBeVisible();
    await expect(client.locator("[data-field]")).toHaveCount(0);
    await expect(client.locator(".cover-meta-label")).toHaveCount(4);
    await expect(client.locator("h1")).toHaveCSS("font-size", geometry.title);
    await expect(client.locator("h1")).toHaveCSS("color", titleInk);
    await page.setViewportSize({ width: 375, height: 850 });
    await expect(page.locator(".client-document-sheets")).toHaveCount(0);
    await expect(
      page.locator(`.document-cover[data-cover-layout="${layout}"]`),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(375);
  });

test("cover controls preserve history, use palette colors, validate uploads and fall back from small icons", async ({
  page,
}, info) => {
  const f = await editorFixture(page);
  const small = await sharp({
    create: { width: 128, height: 128, channels: 4, background: "#a4482e" },
  })
    .png()
    .toBuffer();
  let currentIcon = small;
  f.settings.brand_palette = ["#b5532e", "#ffeeaa"];
  f.settings.logo_icon = {
    path: `${f.repo.workspaceId}/${"a".repeat(64)}.png`,
    name: "Small icon.png",
    size: small.length,
    width: 128,
    height: 128,
  };
  await f.repo.put("workspace_settings", f.settings);
  await f.editRemote({
    cover: applyCoverLayout(
      starterTemplates(f.repo.workspaceId)[1].cover!,
      "editorial",
    ),
  });
  await page.route("**/api/workspace-icon**", (r) =>
    r.fulfill({ contentType: "image/png", body: currentIcon }),
  );
  await page.route("**/api/cover-image", async (r) => {
    try {
      await r.fulfill({
        json: await validateCoverImage(r.request().postDataJSON().image),
      });
    } catch (e) {
      await r.fulfill({ status: 400, json: { error: (e as Error).message } });
    }
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}/edit`);
  const title = page.getByRole("textbox", {
    name: "Proposal title",
    exact: true,
  });
  await title.click();
  const before = (await title.boundingBox())!.y;
  await page.getByRole("button", { name: "Spacing", exact: true }).click();
  const below = page.getByRole("spinbutton", {
    name: "Space below",
    exact: true,
  });
  expect(Number(await below.getAttribute("max"))).toBeGreaterThan(32);
  await below.fill("32");
  await expect(
    page.locator('.editor-paper [data-cover-element="title"]'),
  ).toHaveCSS("margin-bottom", "32px");
  await expect
    .poll(
      () =>
        f.active().cover?.elements?.find((e) => e.kind === "title")
          ?.space_below,
    )
    .toBe(32);
  expect(before - (await title.boundingBox())!.y).toBeCloseTo(32, 0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await title.boundingBox())!.y)
    .toBeCloseTo(before, 0);
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page.locator(".cover-settings-accordion > summary").click();
  const settings = page.locator(".cover-settings");
  await expect(
    settings.getByText("Ink text on the cover · AA contrast", { exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByText(
      "Upload a 1024×1024 or larger icon to use it as the cover graphic",
    ),
  ).toBeVisible();
  await expect(
    settings.locator(
      'select[aria-label="Cover graphic"] option[value="logo-icon"]',
    ),
  ).toHaveCount(0);
  await expect(page.locator(".editor-paper .cover-watermark")).toHaveAttribute(
    "data-cover-graphic",
    "ring",
  );
  await settings
    .getByLabel("Cover graphic", { exact: true })
    .selectOption("dots");
  await settings.getByLabel("Opacity (%)", { exact: true }).fill("25");
  await settings.getByLabel("Size (px)", { exact: true }).fill("600");
  await expect(page.locator(".editor-paper .cover-watermark")).toHaveCSS(
    "opacity",
    "0.25",
  );
  await expect(page.locator(".editor-paper .cover-watermark")).toHaveCSS(
    "width",
    "600px",
  );
  await settings
    .getByLabel("Cover background", { exact: true })
    .selectOption("solid");
  await settings
    .getByRole("button", { name: "Use brand color #ffeeaa" })
    .click();
  await expect(page.locator(".editor-paper .cover-decoration")).toHaveCSS(
    "background-color",
    "rgb(255, 238, 170)",
  );
  await settings
    .getByLabel("Cover background", { exact: true })
    .selectOption("image");
  await settings
    .getByLabel("Upload cover background", { exact: true })
    .setInputFiles({
      name: "wrong.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
  await expect(settings.getByRole("alert")).toContainText("PNG or JPEG");
  await settings
    .getByLabel("Upload cover background", { exact: true })
    .setInputFiles({
      name: "design.png",
      mimeType: "image/png",
      buffer: small,
    });
  await settings.getByRole("checkbox", { name: /finished/i }).check();
  await expect(page.locator(".editor-paper .document-cover")).toHaveAttribute(
    "data-cover-backdrop",
    "true",
  );
  await expect(page.locator(".editor-paper h1")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".editor-paper .document-cover")).toHaveAttribute(
    "data-cover-finished",
    "true",
  );
  await settings.getByLabel("Focal point X", { exact: true }).fill("70");
  await expect(page.locator(".editor-paper .cover-background-image")).toHaveCSS(
    "object-position",
    "70% 50%",
  );
  await expect.poll(() => f.active().cover?.background?.focal?.x).toBe(70);
  currentIcon = await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: "#7722aa" },
  })
    .png()
    .toBuffer();
  f.settings.logo_icon = {
    ...f.settings.logo_icon!,
    width: 1024,
    height: 1024,
    size: currentIcon.length,
  };
  await f.repo.put("workspace_settings", f.settings);
  await f.editRemote({
    cover: {
      ...f.active().cover!,
      background: { type: "plain", graphic: "auto", opacity: 0.25, size: 600 },
    },
  });
  await page.reload();
  await expect(page.locator(".editor-paper .cover-watermark")).toHaveAttribute(
    "data-cover-graphic",
    "logo-icon",
  );
  await expect(
    page.locator(".editor-paper img[data-cover-icon-candidate]"),
  ).toBeVisible();
  await expect(page.locator(".editor-paper .cover-watermark-clip")).toHaveCSS(
    "overflow",
    "hidden",
  );
  if (process.env.CAPTURE_COVERS) {
    await page.getByRole("tab", { name: "Styles", exact: true }).click();
    const accordion = page.locator(".cover-settings-accordion");
    if (!(await accordion.evaluate((el) => (el as HTMLDetailsElement).open)))
      await accordion.locator(":scope > summary").click();
    await page.screenshot({ path: `${shots}/cover-settings-1440.png` });
  }
  const pdf = await pdfPreview(
    f.repo,
    { get: async () => currentIcon, put: async () => {} },
    f.active(),
    f.settings,
  );
  const path = info.outputPath("icon.pdf"),
    raster = info.outputPath("icon");
  await writeFile(path, Buffer.from(pdf.pdf_base64, "base64"));
  execFileSync("pdftoppm", [
    "-f",
    "1",
    "-singlefile",
    "-r",
    "96",
    "-png",
    path,
    raster,
  ]);
  const pixel = await sharp(raster + ".png")
    .extract({ left: 780, top: 30, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  expect(pixel[2]).toBeGreaterThan(pixel[1]); // Purple icon, not the green Ring fallback.
});

test("Brand suggests logo colors for explicit acceptance and keeps saved colors until accepted", async ({
  page,
  request,
}) => {
  const headers = {
    authorization: "Bearer e2e-staff-secret-only",
    origin: "http://127.0.0.1:3100",
  };
  const original =
    (
      await (await request.get("/api/workspace_settings", { headers })).json()
    )[0] ?? (await setup()).settings;
  const palette = ["#446699"];
  const settings = { ...original, brand_palette: palette };
  const prepared = await request.post("/api/workspace_settings", {
    headers,
    data: settings,
  });
  expect(prepared.ok(), await prepared.text()).toBe(true);
  const logo = await sharp({
    create: { width: 240, height: 80, channels: 4, background: "#2f5d50" },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="240" height="80"><rect x="120" width="120" height="80" fill="#b5532e"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  try {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto("/studio/workspace?view=brand");
    await page.locator("#workspace-logo-upload").setInputFiles({
      name: "Palette logo.png",
      mimeType: "image/png",
      buffer: logo,
    });
    await expect(page.getByText("Suggested from your logo")).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await (
              await request.get("/api/workspace_settings", { headers })
            ).json()
          )[0].logo,
      )
      .not.toBe(original.logo);
    const before = (
      await (await request.get("/api/workspace_settings", { headers })).json()
    )[0];
    expect(before.brand_palette).toEqual(palette);
    expect(before.accent_colour).toBe(original.accent_colour);
    await page
      .getByRole("button", { name: "Accept color", exact: true })
      .first()
      .click();
    await expect
      .poll(
        async () =>
          (
            await (
              await request.get("/api/workspace_settings", { headers })
            ).json()
          )[0].brand_palette.length,
      )
      .toBe(2);
    if (process.env.CAPTURE_COVERS) {
      await page.setViewportSize({ width: 1440, height: 1440 });
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `${shots}/brand-palette-1440.png` });
    }
    await page.getByLabel("Suggested color 1", { exact: true }).fill("#805522");
    await page
      .getByRole("button", { name: "Discard", exact: true })
      .first()
      .click();
    const after = (
      await (await request.get("/api/workspace_settings", { headers })).json()
    )[0];
    expect(after.brand_palette).not.toContain("#805522");
  } finally {
    expect(
      (
        await request.post("/api/workspace_settings", {
          headers,
          data: WorkspaceSettingsSchema.parse(original),
        })
      ).ok(),
    ).toBe(true);
  }
});
