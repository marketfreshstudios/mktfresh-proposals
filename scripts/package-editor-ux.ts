import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
const source = ".data/evidence/editor-ux",
  target = "docs/screenshots/editor-ux";
type Capture = {
  file: string;
  state: string;
  width: number;
  theme: string;
  stage: string;
};
const captures: Capture[] = [];
await mkdir(target, { recursive: true });
for (const stage of ["before", "after"]) {
  await mkdir(`${target}/${stage}`, { recursive: true });
  const items = JSON.parse(
    await readFile(`${source}/${stage}/manifest.json`, "utf8"),
  ) as Capture[];
  for (const c of items) {
    await copyFile(
      `${source}/${stage}/${c.file}`,
      `${target}/${stage}/${c.file}`,
    );
    captures.push(c);
  }
}
await copyFile(
  `${source}/after/long-proposal.pdf`,
  `${target}/long-proposal.pdf`,
);
await copyFile(`${source}/after/pagination.json`, `${target}/pagination.json`);
for (const [name, folder] of [
  ["2a", "phase4-editor"],
  ["2c", "phase4-editor"],
  ["5g", "clients-polish"],
  ["7a", "phase5"],
])
  for (const theme of ["light", "dark"])
    await copyFile(
      `docs/screenshots/${folder}/reference-${name}-${theme}.png`,
      `${target}/reference-${name}-${theme}.png`,
    );
await writeFile(`${target}/manifest.json`, JSON.stringify(captures, null, 2));
const states = [...new Set(captures.map((c) => c.state))];
const after = captures.filter((c) => c.stage === "after");
await writeFile(
  `${target}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Proposal editor UX review</title><style>body{font:14px/1.5 system-ui;background:#efede6;color:#24231f;margin:24px}header{max-width:1000px}nav{display:flex;flex-wrap:wrap;gap:18px;position:sticky;top:0;z-index:1;background:#efede6;padding:12px 0}label{display:grid;gap:4px}select{padding:8px}section{margin:36px 0}h2{font-size:18px}.pair{display:flex;align-items:flex-start;gap:18px;overflow:auto}figure{margin:0;flex:0 0 auto}figcaption{margin:8px 0}img{width:auto;max-width:min(720px,88vw);height:auto;border:1px solid #aaa}.references{display:flex;gap:16px;overflow:auto}.references img{max-width:450px}code{background:#e1ded4;padding:2px 4px}</style><header><h1>Proposal editor UX pass</h1><p>${captures.length} screenshots. Matched before/after states at 375 / 768 / 1440 in light and dark, using synthetic local data. Before is merged main 810882d; after is this PR. New menu/review/pagination states have no previous counterpart.</p><p><a href="NOTES.md">Comparison and reproduction notes</a> · <a href="long-proposal.pdf">Long fixture PDF</a> · <a href="pagination.json">Matching page counts</a>. The fixture has 32 paragraphs, including text longer than a full page, an explicit break and both signature slots. Text extraction checks all 645 repeated sentences and the final paragraph.</p><p>The owner’s new instructions take precedence over older frames: one cover title, amber review, floating controls, outline and in-document sorting, inline insertion and PDF guides. The original redesign’s three-column layout, responsive tools, entered prices, white paper and font choices remain.</p></header><nav><label>Width<select id="width"><option value="">All</option>${[375, 768, 1440].map((w) => `<option>${w}</option>`).join("")}</select></label><label>Theme<select id="theme"><option value="">Both</option><option>light</option><option>dark</option></select></label><label>State<select id="state"><option value="">All</option>${states.map((s) => `<option>${s}</option>`).join("")}</select></label></nav>${after
    .map((c) => {
      const before = captures.find(
        (b) =>
          b.stage === "before" &&
          b.state === c.state &&
          b.width === c.width &&
          b.theme === c.theme,
      );
      return `<section data-width="${c.width}" data-theme="${c.theme}" data-state="${c.state}"><h2>${c.state} · ${c.width}px · ${c.theme}</h2><div class="pair">${before ? `<figure><figcaption>Before · merged main</figcaption><a href="before/${before.file}"><img loading="lazy" src="before/${before.file}" alt="Before ${c.state}"></a></figure>` : "<p>New state in this PR</p>"}<figure><figcaption>After</figcaption><a href="after/${c.file}"><img loading="lazy" src="after/${c.file}" alt="After ${c.state}"></a></figure></div></section>`;
    })
    .join(
      "",
    )}<h2>Matching source frames</h2><div class="references">${["2a", "2c", "5g", "7a"].flatMap((f) => ["light", "dark"].map((t) => `<figure><figcaption>${f} · ${t}</figcaption><a href="reference-${f}-${t}.png"><img loading="lazy" src="reference-${f}-${t}.png" alt="Original design ${f} ${t}"></a></figure>`)).join("")}</div><script>const keys=['width','theme','state'];function filter(){document.querySelectorAll('section[data-state]').forEach(s=>s.hidden=keys.some(k=>document.getElementById(k).value&&document.getElementById(k).value!==s.dataset[k]));}keys.forEach(k=>document.getElementById(k).addEventListener('change',filter));</script></html>`,
);
console.log(`${captures.length} before/after captures packaged.`);
