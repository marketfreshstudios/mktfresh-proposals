// Explicit selectors are configuration, verified against the owner's Proposify UI before live use.
import { chromium } from "playwright";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseCsv } from "./core";
const [configPath] = process.argv.slice(2);
if (!configPath) throw new Error("Pass export-config.json; see README.");
const config = JSON.parse(await readFile(configPath, "utf8")) as {
  list_url: string;
  profile: string;
  output: string;
  csv: string;
  row_selector: string;
  link_selector: string;
  next_selector?: string;
  download_selector: string;
  min_wait_ms?: number;
  max_wait_ms?: number;
};
const base = new URL(config.list_url);
if (base.protocol !== "https:" && base.hostname !== "127.0.0.1")
  throw new Error("HTTPS required");
await mkdir(config.output, { recursive: true });
const checkpoint = join(config.output, "checkpoint.json");
let done: Record<string, string> = {};
try {
  done = JSON.parse(await readFile(checkpoint, "utf8"));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const rows = parseCsv(await readFile(config.csv, "utf8")),
  context = await chromium.launchPersistentContext(resolve(config.profile), {
    headless: false,
    acceptDownloads: true,
  });
const page = await context.newPage();
const save = async () => {
  await writeFile(checkpoint + ".tmp", JSON.stringify(done, null, 2));
  await rename(checkpoint + ".tmp", checkpoint);
};
try {
  await page.goto(config.list_url);
  console.log(
    "Use the dedicated browser window to sign in if needed. Press Enter here when the proposal list is visible.",
  );
  await new Promise<void>((r) => {
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      r();
    });
  });
  const links = new Map<string, string>();
  for (let pages = 0; pages < 1000; pages++) {
    for (const row of await page.locator(config.row_selector).all()) {
      const href = await row.locator(config.link_selector).getAttribute("href");
      if (href) {
        const url = new URL(href, base);
        if (url.origin !== base.origin) continue;
        const match = rows.find((r) =>
          url.pathname.split("/").includes(r.proposify_id),
        );
        if (match) links.set(match.proposify_id, url.href);
      }
    }
    if (!config.next_selector) break;
    const next = page.locator(config.next_selector);
    if (!(await next.count()) || !(await next.isEnabled())) break;
    const before = await page.locator(config.row_selector).first().innerText();
    await next.click();
    await page.waitForFunction(
      ({ selector, before }) =>
        document.querySelector(selector)?.textContent?.trim() !== before.trim(),
      { selector: config.row_selector, before },
      { timeout: 30000 },
    );
  }
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9-]+/g, "-").slice(0, 80);
  for (const row of rows) {
    if (done[row.proposify_id]) continue;
    try {
      const url = links.get(row.proposify_id) ?? row.url;
      if (!url) throw new Error("Proposal URL not found in list or CSV");
      if (new URL(url).origin !== base.origin)
        throw new Error("Unexpected proposal origin");
      await page.goto(url);
      const downloadPromise = page.waitForEvent("download", {
        timeout: 120000,
      });
      await page.locator(config.download_selector).click();
      const download = await downloadPromise;
      const file = `${row.proposify_id}_${safe(row.company)}_${safe(row.title)}.pdf`;
      await download.saveAs(join(config.output, file));
      if (await download.failure()) throw new Error("Browser download failed");
      const bytes = await readFile(join(config.output, file));
      if (bytes.subarray(0, 5).toString() !== "%PDF-")
        throw new Error("Downloaded file is not a PDF");
      done[row.proposify_id] = file;
      await save();
      console.log(
        JSON.stringify({ id: row.proposify_id, status: "saved", file }),
      );
    } catch (e) {
      console.error(
        JSON.stringify({
          id: row.proposify_id,
          status: "failed",
          error: e instanceof Error ? e.message : "Unknown error",
        }),
      );
    }
    const minimum = Math.max(3000, config.min_wait_ms ?? 5000),
      maximum = Math.max(minimum, config.max_wait_ms ?? 10000);
    await page.waitForTimeout(minimum + Math.random() * (maximum - minimum));
  }
} finally {
  await context.close();
}
