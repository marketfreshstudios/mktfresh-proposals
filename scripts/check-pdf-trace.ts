/** Inspect the actual Next API trace, then smoke-test only the traced packages.
 * Linux CI launches the serverless binary; macOS validates package loading only. */
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, mkdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const tracePath = resolve(".next/server/app/api/[...path]/route.js.nft.json");
const trace = JSON.parse(await readFile(tracePath, "utf8")) as {
  files: string[];
};
const files = new Set(
  trace.files.map((file) => resolve(dirname(tracePath), file)),
);
for (const file of [
  "node_modules/playwright-core/browsers.json",
  "node_modules/playwright-core/package.json",
  "node_modules/@sparticuz/chromium/package.json",
  "public/fonts/SourceSerif4-Variable.woff2",
])
  assert(files.has(resolve(file)), `API trace missing ${file}`);
for (const file of await readdir("node_modules/@sparticuz/chromium/bin"))
  assert(
    files.has(resolve("node_modules/@sparticuz/chromium/bin", file)),
    `API trace missing Chromium asset ${file}`,
  );
const isolated = await mkdtemp(join(tmpdir(), "proposal-pdf-trace-"));
try {
  // Include ALL traced node modules, preserving transitive dependencies and assets.
  for (const file of files) {
    const rel = relative(root, file);
    if (!rel.startsWith("node_modules/") && !rel.startsWith("public/fonts/"))
      continue;
    const dest = join(isolated, rel);
    await mkdir(dirname(dest), { recursive: true });
    await cp(file, dest);
  }
  await mkdir(join(isolated, "tmp"));
  const smoke = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { chromium as playwright } from 'playwright-core';
    import chromium from '@sparticuz/chromium';
    import { readFile } from 'node:fs/promises';
    if (process.platform === 'linux') {
      const browser = await playwright.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
      try {
        const page = await browser.newPage();
        const font = (await readFile('public/fonts/SourceSerif4-Variable.woff2')).toString('base64');
        await page.setContent('<style>@font-face{font-family:Proposal;src:url(data:font/woff2;base64,'+font+')}body{font-family:Proposal}</style><h1>Serverless PDF smoke check</h1>');
        await page.evaluate(() => document.fonts.ready);
        const pdf = await page.pdf();
        if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF');
        console.log('Traced serverless Chromium launched and generated a PDF.');
      } finally { await browser.close(); }
    } else console.log('Traced renderer packages load; Linux CI checks serverless PDF generation.');
  `,
    ],
    {
      cwd: isolated,
      encoding: "utf8",
      timeout: 90000,
      env: {
        PATH: process.env.PATH,
        HOME: isolated,
        TMPDIR: join(isolated, "tmp"),
        NODE_PATH: "",
        NODE_ENV: "production",
        VERCEL: "1",
      },
    },
  );
  assert.equal(smoke.status, 0, smoke.stderr || String(smoke.error));
  console.log(smoke.stdout.trim());
  console.log(`API trace verified (${files.size} files).`);
} finally {
  await rm(isolated, { recursive: true, force: true });
}
