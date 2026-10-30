import {
  readFile,
  readdir,
  mkdir,
  copyFile,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
type Capture = { file: string; frame: string; width: number; theme: string };
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const sections: string[] = [];
for (const [name, source, destination, prefix] of [
  [
    "Records, Home, clients and owner additions",
    ".data/evidence/phase4",
    "docs/screenshots/phase4",
    "",
  ],
  [
    "Editor polish",
    ".data/evidence/quote-editor",
    "docs/screenshots/phase4-editor",
    "../phase4-editor/",
  ],
]) {
  const captures: Capture[] = JSON.parse(
    await readFile(join(source, "manifest.json"), "utf8"),
  );
  await mkdir(destination, { recursive: true });
  for (const c of captures) {
    if (!/^[a-z0-9-]+\.png$/.test(c.file))
      throw new Error("Unexpected capture filename");
    await copyFile(join(source, c.file), join(destination, c.file));
  }
  const references = (await readdir(source)).filter((f) =>
    /^reference-(?:countersign-)?[2356][a-i]-(?:light|dark)\.png$/.test(f),
  );
  for (const file of references)
    await copyFile(join(source, file), join(destination, file));
  await copyFile(
    join(source, "manifest.json"),
    join(destination, "manifest.json"),
  );
  sections.push(`<h1>${name}</h1>`);
  for (const c of captures) {
    let reference = `reference-${c.frame}-${c.theme}.png`;
    if (c.file.startsWith("countersign") && !c.file.includes("stale"))
      reference = `reference-countersign-${({ 375: "3c", 768: "3b", 1440: "3a" } as Record<number, string>)[c.width]}-${c.theme}.png`;
    if (!references.includes(reference))
      reference = `reference-${c.frame}-light.png`;
    const caption = escape(c.frame);
    sections.push(
      `<section><h2>${escape(c.file)}</h2><small>${caption}</small><div class="pair"><figure><figcaption>Implementation · ${c.width}px · ${escape(c.theme)}</figcaption><img loading="lazy" src="${prefix}${c.file}"></figure>${references.includes(reference) ? `<figure><figcaption>Matching design frame · ${caption}</figcaption><img loading="lazy" src="${prefix}${reference}"></figure>` : "<p>This state extends the design with Jonathan’s additional requirements.</p>"}</div></section>`,
    );
  }
  console.log(`${captures.length} captures packaged: ${destination}`);
}
await writeFile(
  "docs/screenshots/phase4/index.html",
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 4 visual review</title><style>body{font:14px system-ui;margin:24px;background:#e7e3db;color:#1c1b18}h1{font-size:28px}h2{margin:0 0 8px;font-size:18px}section{margin:34px 0}.pair{display:flex;gap:16px;overflow:auto;align-items:flex-start}.pair figure{margin:0}.pair img{width:auto;max-width:min(720px,90vw);border:1px solid #aaa}.pair figcaption{font-size:12px;margin:8px 0}small{display:block}</style><h1>Phase 4 review: implementation beside design</h1><p>Neutral test fixtures only. The stored-signature fixture is deliberately a one-pixel PNG, not a real signature. Both themes at 375/768/1440. Tablet editor frames 5e–5h use the available light reference for structural comparison in dark mode.</p>${sections.join("")}</html>`,
);
