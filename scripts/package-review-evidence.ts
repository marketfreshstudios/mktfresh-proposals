import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const source = ".data/evidence/live-review",
  destination = "docs/screenshots/live-review";
type Capture = { file: string; frame: string; width: number; theme: string };
const captures = JSON.parse(
  await readFile(`${source}/manifest.json`, "utf8"),
) as Capture[];
await mkdir(destination, { recursive: true });
for (const c of captures)
  await copyFile(`${source}/${c.file}`, `${destination}/${c.file}`);
const frames = [...new Set(captures.map((c) => c.frame))].sort();
const identical: string[] = [];
for (const frame of frames) {
  const buffers: Buffer[] = [];
  for (const theme of ["light", "dark"]) {
    const file = `reference-${frame}-${theme}.png`;
    buffers.push(await readFile(`${source}/${file}`));
    await copyFile(`${source}/${file}`, `${destination}/${file}`);
  }
  if (
    createHash("sha256").update(buffers[0]).digest("hex") ===
    createHash("sha256").update(buffers[1]).digest("hex")
  )
    identical.push(frame);
}
await writeFile(
  `${destination}/manifest.json`,
  JSON.stringify({ captures, identicalSourceVariants: identical }, null, 2),
);
await writeFile(
  `${destination}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Live app review visual review</title><style>body{font:14px system-ui;background:#eeece6;color:#24231f;margin:24px}header{max-width:1000px}nav{display:flex;gap:16px;flex-wrap:wrap;position:sticky;top:0;background:#eeece6;padding:12px 0}label{display:grid;gap:4px}select{padding:8px}section{margin:32px 0}.pair{display:flex;gap:20px;align-items:start;overflow:auto}figure{margin:0}figcaption{margin:8px 0;color:#555}img{max-width:min(720px,90vw);height:auto;border:1px solid #aaa}h2{font-size:18px}</style><header><h1>Live app review</h1><p>${captures.length} application captures · 375 / 768 / 1440 · light and dark. Synthetic local clients and mocked provider responses.</p><p>Compared with frames 6a–6f, 7a/7b/7d/7f/7g, 8a, 2a/2d/2e and 5h. Products, status-driven setup, contact-copy actions, explicit customer linking and the expanded fonts follow Jonathan’s review, which takes precedence over older frames. Modal references show the matching client detail context; those new dialogs have no exact source frame.</p><p><a href="COMPARISON.md">Comparison and validation notes</a></p></header><nav><label>Width<select id="width"><option value="">All widths</option>${[375, 768, 1440].map((w) => `<option>${w}</option>`).join("")}</select></label><label>Theme<select id="theme"><option value="">Both themes</option><option>light</option><option>dark</option></select></label><label>Screen<select id="screen"><option value="">All screens</option>${[...new Set(captures.map((c) => c.file.replace(/-\d+-(light|dark)\.png$/, "")))].map((name) => `<option>${name}</option>`).join("")}</select></label></nav>${captures
    .map((c) => {
      const name = c.file.replace(/-\d+-(light|dark)\.png$/, "");
      return `<section data-width="${c.width}" data-theme="${c.theme}" data-screen="${name}"><h2>${name} · ${c.width}px · ${c.theme}</h2><div class="pair"><figure><figcaption>Application</figcaption><a href="${c.file}"><img loading="lazy" src="${c.file}" alt="${name}, ${c.width}px, ${c.theme}"></a></figure><figure><figcaption>Reference ${c.frame}${identical.includes(c.frame) ? " · source export has one visual variant" : ""}</figcaption><img loading="lazy" src="reference-${c.frame}-${c.theme}.png" alt="Design frame ${c.frame}"></figure></div></section>`;
    })
    .join(
      "",
    )}<script>const fields=['width','theme','screen'];function filter(){for(const section of document.querySelectorAll('section'))section.hidden=fields.some(key=>document.getElementById(key).value&&document.getElementById(key).value!==section.dataset[key]);}for(const key of fields)document.getElementById(key).addEventListener('change',filter);</script></html>`,
);
console.log(
  `${captures.length} captures and ${frames.length * 2} references packaged.`,
);

await mkdir(`${destination}/fonts`, { recursive: true });
const fonts = JSON.parse(
  await readFile(`${source}/fonts/report.json`, "utf8"),
) as { id: string }[];
for (const f of fonts)
  await copyFile(
    `${source}/fonts/${f.id}.pdf`,
    `${destination}/fonts/${f.id}.pdf`,
  );
await copyFile(
  `${source}/fonts/report.json`,
  `${destination}/fonts/report.json`,
);
for (const id of ["poppins", "fraunces", "merriweather"])
  await copyFile(`${source}/fonts/${id}.png`, `${destination}/fonts/${id}.png`);
