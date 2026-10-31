import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
const source = ".data/evidence/billing-confirmations",
  destination = "docs/screenshots/billing-confirmations";
type Capture = { file: string; state: string; width: number; theme: string };
const captures = JSON.parse(
  await readFile(`${source}/manifest.json`, "utf8"),
) as Capture[];
await mkdir(`${destination}/html`, { recursive: true });
for (const c of captures)
  await copyFile(`${source}/${c.file}`, `${destination}/${c.file}`);
const files = (await readdir(`${source}/html`)).sort();
for (const f of files)
  await copyFile(`${source}/html/${f}`, `${destination}/html/${f}`);
await writeFile(
  `${destination}/manifest.json`,
  JSON.stringify(captures, null, 2),
);
const states = [...new Set(captures.map((c) => c.state))];
await writeFile(
  `${destination}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Billing confirmations review</title><style>body{font:14px system-ui;background:#eeece6;color:#24231f;margin:24px}header{max-width:950px}nav{display:flex;gap:16px;flex-wrap:wrap;position:sticky;top:0;background:#eeece6;padding:12px 0;z-index:1}label{display:grid;gap:4px}select{padding:8px}section{margin:32px 0}figure{margin:0}figcaption{margin:8px 0;color:#555}img{max-width:min(1050px,95vw);height:auto;border:1px solid #aaa}h2{font-size:18px}ul{columns:2;max-width:900px;line-height:1.8}</style><header><h1>Billing confirmations</h1><p>${captures.length} captures: card-saving and payment Checkout, processing/timeout/verified return states, yearly billing and staff status at 375 / 768 / 1440 in light and dark; confirmation email renders at 375 / 600. Synthetic local data and mock delivery only.</p><p>These are browser-rendered HTML previews, not Gmail, Apple Mail or Outlook inbox screenshots. Native mail-client and automatic color-inversion checks remain pending. <a href="COMPATIBILITY.md">Rendering checks and limitations</a>.</p><p>Client reading/billing and record cards retain the redesign shell, typography, controls and responsive rules. Jonathan’s new billing-confirmation instructions define the added states. Contextual frames 1e, 1f and 3a are linked in the comparison notes.</p><h2>Portable HTML and generated plain text</h2><ul>${files
    .filter((f) => f.endsWith(".html"))
    .map(
      (f) =>
        `<li><a href="html/${f}">${f.replace(".html", "")}</a> · <a href="html/${f.replace(".html", ".txt")}">plain text</a></li>`,
    )
    .join(
      "",
    )}</ul></header><nav><label>Width<select id="width"><option value="">All widths</option>${[375, 600, 768, 1440].map((w) => `<option>${w}</option>`).join("")}</select></label><label>Theme<select id="theme"><option value="">Both themes</option><option>light</option><option>dark</option></select></label><label>Screen<select id="screen"><option value="">All screens</option>${states.map((s) => `<option>${s}</option>`).join("")}</select></label></nav>${captures.map((c) => `<section data-width="${c.width}" data-theme="${c.theme}" data-screen="${c.state}"><h2>${c.state} · ${c.width}px · ${c.theme}</h2><figure><a href="${c.file}"><img loading="lazy" src="${c.file}" alt="${c.state}, ${c.width}px, ${c.theme}"></a></figure></section>`).join("")}<script>const keys=['width','theme','screen'];function filter(){for(const section of document.querySelectorAll('section'))section.hidden=keys.some(k=>document.getElementById(k).value&&document.getElementById(k).value!==section.dataset[k]);}for(const k of keys)document.getElementById(k).addEventListener('change',filter);</script></html>`,
);
console.log(
  `${captures.length} captures and ${files.length / 2} HTML/text pairs packaged.`,
);
