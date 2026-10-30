import {
  copyFile,
  mkdir,
  readFile,
  writeFile,
  readdir,
} from "node:fs/promises";
import { createHash } from "node:crypto";
const destination = "docs/screenshots/client-completion";
type Capture = {
  file: string;
  frame?: string;
  width: number;
  theme: string;
  state: string;
};
const sources = ["client-completion", "block-controls"];
await mkdir(destination, { recursive: true });
const captures: Capture[] = [];
for (const source of sources) {
  const list = JSON.parse(
    await readFile(`.data/evidence/${source}/manifest.json`, "utf8"),
  ) as Capture[];
  // The old implementation is optional during CI, but its independently captured
  // before screenshots remain part of the review package.
  if (source === "block-controls")
    for (const file of await readdir(`.data/evidence/${source}`)) {
      const match = file.match(
        /^(proposal|template)(-clause)?-before-(375|1440)-(light|dark)\.png$/,
      );
      if (match && !list.some((c) => c.file === file))
        list.push({
          file,
          state: `${match[1]}${match[2] ?? ""}-before`,
          width: Number(match[3]),
          theme: match[4],
        });
    }
  for (const c of list) {
    c.state ??= c.file.replace(/-\d+-(light|dark)\.png$/, "");
    await copyFile(
      `.data/evidence/${source}/${c.file}`,
      `${destination}/${c.file}`,
    );
    captures.push(c);
  }
}
const frames = [
    ...new Set(captures.flatMap((c) => (c.frame ? [c.frame] : []))),
  ].sort(),
  identical: string[] = [];
for (const frame of frames) {
  const buffers: Buffer[] = [];
  for (const theme of ["light", "dark"]) {
    const f = `reference-${frame}-${theme}.png`;
    buffers.push(await readFile(`.data/evidence/client-completion/${f}`));
    await copyFile(
      `.data/evidence/client-completion/${f}`,
      `${destination}/${f}`,
    );
  }
  if (
    buffers
      .map((b) => createHash("sha256").update(b).digest("hex"))
      .every((h, _, a) => h === a[0])
  )
    identical.push(frame);
}
for (const f of ["completed-proposal.pdf", "certificate-final.png"])
  await copyFile(
    `.data/evidence/client-completion/${f}`,
    `${destination}/${f}`,
  );
await writeFile(
  `${destination}/manifest.json`,
  JSON.stringify(
    { captures, identicalSourceVariants: identical, beforeCommit: "734b026" },
    null,
    2,
  ),
);
const image = (file: string, label: string) =>
  `<figure><figcaption>${label}</figcaption><a href="${file}"><img loading="lazy" src="${file}" alt="${label}"></a></figure>`;
await writeFile(
  `${destination}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Client completion and editor review</title><style>body{font:14px system-ui;background:#eeece6;color:#24231f;margin:24px}header{max-width:950px}nav{display:flex;gap:16px;flex-wrap:wrap;position:sticky;top:0;background:#eeece6;padding:12px 0;z-index:1}label{display:grid;gap:4px}select{padding:8px}section{margin:32px 0}.pair{display:flex;gap:20px;align-items:start;overflow:auto}figure{margin:0}figcaption{margin:8px 0;color:#555}img{max-width:min(720px,90vw);height:auto;border:1px solid #aaa}h2{font-size:18px}</style><header><h1>Client completion and editor controls</h1><p>${captures.length} application and baseline captures · 375 / 768 / 1440 · light and dark. Synthetic local clients; no provider calls.</p><p>Client frames 1a/1d/1e/1f/1g and 5a–5d provide reading/signing/billing context. Jonathan’s newer instructions take precedence. Emails and the certificate are new layouts, with contextual completed-page references. Editor comparisons show the real main-branch implementation at 375/1440, alongside the replacement. The 768px editor captures supplement those required comparisons.</p><p><a href="COMPARISON.md">Validation and comparison notes</a> · <a href="completed-proposal.pdf">Rendered proposal and completion certificate</a></p></header><nav><label>Width<select id="width"><option value="">All widths</option>${[375, 768, 1440].map((w) => `<option>${w}</option>`).join("")}</select></label><label>Theme<select id="theme"><option value="">Both themes</option><option>light</option><option>dark</option></select></label><label>Screen<select id="screen"><option value="">All screens</option>${[...new Set(captures.map((c) => c.state))].map((s) => `<option>${s}</option>`).join("")}</select></label></nav>${captures
    .filter((c) => !c.state.endsWith("-before"))
    .map((c) => {
      const before = c.file.replace(/-after-/, "-before-");
      const comparison = c.frame
        ? image(
            `reference-${c.frame}-${c.theme}.png`,
            `Reference ${c.frame}${identical.includes(c.frame) ? " · single source visual variant" : ""}`,
          )
        : captures.some((b) => b.file === before)
          ? image(before, "Before · main 734b026")
          : "<p>Supplemental tablet view; required before comparisons are at 375/1440.</p>";
      return `<section data-width="${c.width}" data-theme="${c.theme}" data-screen="${c.state}"><h2>${c.state} · ${c.width}px · ${c.theme}</h2><div class="pair">${image(c.file, c.frame ? "Application" : "After · attached controls")}${comparison}</div></section>`;
    })
    .join(
      "",
    )}<script>const keys=['width','theme','screen'];function filter(){for(const section of document.querySelectorAll('section'))section.hidden=keys.some(k=>document.getElementById(k).value&&document.getElementById(k).value!==section.dataset[k]);}for(const k of keys)document.getElementById(k).addEventListener('change',filter);</script></html>`,
);
console.log(
  `${captures.length} captures and ${frames.length * 2} reference frames packaged.`,
);
