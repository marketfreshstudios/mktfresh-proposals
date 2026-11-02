import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
const target = "docs/screenshots/editor-followup";
type Capture = {
  file: string;
  state: string;
  width: number;
  theme: string;
  group?: string;
};
const captures: Capture[] = [];
await mkdir(target, { recursive: true });
for (const [source, group] of [
  [".data/evidence/editor-followup", "controls"],
  [".data/evidence/editor-followup-fields", "fields"],
  [".data/evidence/editor-ux/after", "document"],
  [".data/evidence/emails", "emails"],
]) {
  const rows = JSON.parse(
    await readFile(`${source}/manifest.json`, "utf8"),
  ) as Capture[];
  await mkdir(`${target}/${group}`, { recursive: true });
  for (const row of rows) {
    if (row.width === 768 && group !== "fields") continue;
    if (
      group === "document" &&
      ![
        "document",
        "selected-block",
        "block-menu",
        "document-pricing",
        "page-break",
        "template",
        "template-selected",
      ].includes(row.state)
    )
      continue;
    if (group === "emails" && row.state !== "editor-proposal_sent") continue;
    await copyFile(`${source}/${row.file}`, `${target}/${group}/${row.file}`);
    captures.push({ ...row, file: `${group}/${row.file}`, group });
  }
}
await mkdir(`${target}/before`, { recursive: true });
for (const state of ["document", "selected-block"])
  for (const width of [375, 1440])
    for (const theme of ["light", "dark"]) {
      const file = `${state}-${width}-${theme}.png`;
      await copyFile(
        `docs/screenshots/editor-ux/after/${file}`,
        `${target}/before/${file}`,
      );
      captures.push({
        file: `before/${file}`,
        state,
        width,
        theme,
        group: "before",
      });
    }
for (const file of [
  "long-proposal.pdf",
  "long-pricing-group.pdf",
  "pagination.json",
])
  await copyFile(`.data/evidence/editor-ux/after/${file}`, `${target}/${file}`);
await writeFile(`${target}/manifest.json`, JSON.stringify(captures, null, 2));
const serial = JSON.stringify(captures).replaceAll("<", "\\u003c");
await writeFile(
  `${target}/index.html`,
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Editor follow-up review</title><style>body{margin:24px;font:15px/1.5 system-ui;background:#f5f3ee;color:#25241f}h1{font-size:26px}nav{display:flex;gap:12px;flex-wrap:wrap;position:sticky;top:0;padding:12px;background:#f5f3ee;border-bottom:1px solid #ccc}label{display:grid;font-size:12px}select{padding:8px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}figure{margin:18px 0;padding:12px;background:white;border:1px solid #ccc;border-radius:10px}figcaption{font-size:13px;margin-bottom:10px}img{width:100%;height:auto;display:block}a{color:#365c4a}</style><h1>Editor follow-up after PR #38</h1><p>Owner-directed controls and Fields updates. Baseline images are archived PR #38 captures from the same document fixture; the approved follow-up deliberately adds an editing gutter and insertion gaps. Current controls/Fields captures use test fixtures only.</p><p><a href="long-proposal.pdf">Long proposal PDF</a> · <a href="long-pricing-group.pdf">Intact pricing group PDF</a> · <a href="pagination.json">Page-count proof</a> · <a href="COMPARISON.md">Design comparison and verification notes</a></p><nav><label>Width<select id="width"><option value="1440">1440</option><option>375</option><option>768</option></select></label><label>Theme<select id="theme"><option>light</option><option>dark</option></select></label><label>Group<select id="group"><option value="all">All</option><option>before</option><option>document</option><option>controls</option><option>fields</option><option>emails</option></select></label></nav><main></main><script>const rows=${serial};const controls=[...document.querySelectorAll('select')];function render(){const [width,theme,group]=controls.map(el=>el.value);document.querySelector('main').replaceChildren(...rows.filter(r=>r.width==width&&r.theme===theme&&(group==='all'||r.group===group)).map(r=>{const f=document.createElement('figure'),c=document.createElement('figcaption'),a=document.createElement('a'),i=document.createElement('img');c.textContent=r.group+' · '+r.state+' · '+r.width+' · '+r.theme;i.src=r.file;i.alt=c.textContent;i.loading='lazy';a.href=r.file;a.target='_blank';a.append(i);f.append(c,a);return f}));}controls.forEach(el=>el.onchange=render);render();</script>`,
);
console.log(`Packaged ${captures.length} screenshots into ${target}`);
