import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
type Capture = {
  file: string;
  frame: string;
  width: number;
  theme: string;
  note?: string;
};
const destination = "docs/screenshots/phase5",
  source = ".data/evidence/phase5";
await mkdir(destination, { recursive: true });
const captures: Capture[] = JSON.parse(
  await readFile(join(source, "manifest.json"), "utf8"),
);
for (const c of captures)
  await copyFile(join(source, c.file), join(destination, c.file));
const client = JSON.parse(
  await readFile(".data/evidence/client-flow/manifest.json", "utf8"),
).captures as { file: string; frames: string; width: number; theme: string }[];
for (const c of client.filter((c) => /^8[m-r]$/.test(c.frames))) {
  const file = "client-" + c.file;
  await copyFile(
    join(".data/evidence/client-flow", c.file),
    join(destination, file),
  );
  captures.push({ file, frame: c.frames, width: c.width, theme: c.theme });
}
const refs = (await readdir(source)).filter((f) =>
  /^reference-[78][a-r]-(light|dark)\.png$/.test(f),
);
for (const f of refs) await copyFile(join(source, f), join(destination, f));
await copyFile(
  join(source, "proposal-fonts.png"),
  join(destination, "proposal-fonts.png"),
);
await copyFile(
  join(source, "proposal-fonts.pdf"),
  join(destination, "proposal-fonts.pdf"),
);
const identical = new Set<string>();
for (const f of refs.filter((f) => f.endsWith("-dark.png"))) {
  const light = f.replace("-dark.png", "-light.png");
  const hash = async (name: string) =>
    createHash("sha256")
      .update(await readFile(join(source, name)))
      .digest("hex");
  if ((await hash(f)) === (await hash(light))) identical.add(f);
}
const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
await writeFile(
  join(destination, "manifest.json"),
  JSON.stringify(
    { captures, identicalSourceVariants: [...identical] },
    null,
    2,
  ),
);
await writeFile(
  join(destination, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 5 visual review</title><style>body{font:14px system-ui;background:#e7e3db;color:#1c1b18;margin:24px}section{margin:36px 0}h2{font-size:18px;margin-bottom:8px}.pair{display:flex;gap:20px;align-items:start;overflow:auto}figure{margin:0}figcaption{font-size:12px;margin-bottom:10px}.pair img{width:auto;max-width:min(720px,90vw);border:1px solid #aaa}nav{display:flex;gap:12px;flex-wrap:wrap}</style><h1>Phase 5 · Studio and states</h1><p>${captures.length} application captures · 375/768/1440 · light and dark · matching frames 7a–7g and 8a–8r. Neutral local fixtures only; no hosted changes or provider calls.</p><p><a href="COMPARISON.md">Comparison notes and practical differences</a> · <a href="proposal-fonts.pdf">Local PDF with uploaded body font</a></p><p>Some exported design frames provide one visual variant. Identical dark/light source files are marked below. 8d compares the real, atomically saved assistant draft ready for review; the app does not pretend an assistant is streaming before its tool call completes.</p><nav>${[375, 768, 1440].map((w) => `<a href="#width-${w}">${w}px</a>`).join("")}</nav>${[
    375, 768, 1440,
  ]
    .map(
      (w) =>
        `<h1 id="width-${w}">${w}px</h1>${captures
          .filter((c) => c.width === w)
          .map((c) => {
            const ref = `reference-${c.frame}-${c.theme}.png`;
            return `<section><h2>${escape(c.file)}</h2><div class="pair"><figure><figcaption>Application · ${w}px · ${c.theme}</figcaption><img loading="lazy" src="${c.file}"></figure><figure><figcaption>Frame ${c.frame}${identical.has(ref) ? " · source has one visual variant" : ""}</figcaption><img loading="lazy" src="${ref}"></figure></div></section>`;
          })
          .join("")}`,
    )
    .join(
      "",
    )}<h1>PDF font verification</h1><img width="720" style="max-width:100%" src="proposal-fonts.png"></html>`,
);
console.log(
  `${captures.length} responsive captures and ${refs.length} reference frames packaged in ${destination}.`,
);
