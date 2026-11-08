import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/** Whole words only: persisted keys (accent_colour), aliases (/catalogue),
 * filenames and historical migration payloads are not user-facing copy. */
export const americanSpellings: Record<string, string> = {
  colour: "color",
  colours: "colors",
  coloured: "colored",
  colouring: "coloring",
  behaviour: "behavior",
  behaviours: "behaviors",
  behavioural: "behavioral",
  catalogue: "catalog",
  catalogues: "catalogs",
  centre: "center",
  centres: "centers",
  centred: "centered",
  centring: "centering",
  organise: "organize",
  organises: "organizes",
  organised: "organized",
  organising: "organizing",
  organisation: "organization",
  organisations: "organizations",
  customise: "customize",
  customises: "customizes",
  customised: "customized",
  customising: "customizing",
  customisation: "customization",
  favour: "favor",
  favours: "favors",
  favourite: "favorite",
  favourites: "favorites",
  licence: "license",
  licences: "licenses",
  cancelled: "canceled",
  cancelling: "canceling",
  travelled: "traveled",
  travelling: "traveling",
  modelling: "modeling",
  grey: "gray",
  greys: "grays",
  greyed: "grayed",
  sanitise: "sanitize",
  sanitised: "sanitized",
  sanitising: "sanitizing",
  summarise: "summarize",
  summarised: "summarized",
  optimise: "optimize",
  optimised: "optimized",
  optimising: "optimizing",
  optimisation: "optimization",
  recognise: "recognize",
  recognised: "recognized",
  initialise: "initialize",
  initialised: "initialized",
  initialisation: "initialization",
  normalise: "normalize",
  normalised: "normalized",
  normalising: "normalizing",
  authorisation: "authorization",
  authorise: "authorize",
  authorised: "authorized",
  authorising: "authorizing",
  colourful: "colorful",
};
const words = new RegExp(
  `(?<![\\w/_.-])(${Object.keys(americanSpellings).join("|")})(?![\\w/_-])`,
  "gi",
);
export function americanEnglishViolations(text: string) {
  return [...text.matchAll(words)].map((m) => ({
    word: m[0],
    replacement: americanSpellings[m[0].toLowerCase()],
    index: m.index,
  }));
}
export function proseOnly(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\]\([^)]*\)/g, "]");
}
// Read displayed literals, not identifiers or persisted property names.
const { parse } = createRequire(import.meta.url)(
  "next/dist/compiled/babel/parser",
);
export function sourceCopy(source: string) {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const chunks: string[] = [];
  const visit = (node: any, parent?: any, key?: string) => {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "StringLiteral" &&
      key !== "key" &&
      ![
        "ImportDeclaration",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
      ].includes(parent?.type)
    ) {
      chunks.push(node.value);
    }
    if (node.type === "JSXText") chunks.push(node.value);
    if (node.type === "TemplateElement")
      chunks.push(node.value.cooked ?? node.value.raw);
    for (const [k, value] of Object.entries(node))
      if (k !== "comments" && !k.endsWith("Comments")) {
        if (Array.isArray(value)) value.forEach((v) => visit(v, node, k));
        else if ((value as any)?.type) visit(value, node, k);
      }
  };
  visit(ast);
  return chunks.join("\n");
}
export function checkAmericanEnglish(root = ".") {
  const errors: string[] = [];
  const walk = (dir: string) => {
    for (const item of readdirSync(join(root, dir), { withFileTypes: true })) {
      const file = join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (
        /\.(tsx?|css|md|json)$/.test(file) &&
        !file.endsWith("check-american-english.ts") &&
        file !== "seed/starter-legacy-copy.ts"
      ) {
        let text = readFileSync(join(root, file), "utf8");
        if (file.endsWith(".md")) text = proseOnly(text);
        if (/\.tsx?$/.test(file)) {
          if (
            [
              "src/lib/staff-routes.ts",
              "src/components/staff-app.tsx",
            ].includes(file)
          )
            text = text.replace(/"catalogue"/g, '""');
          text = sourceCopy(text);
        }
        // Technical schema values, old route aliases and CSS class names stay stable.
        if (/\.(tsx?|json)$/.test(file))
          text = text.replace(/(["'])((?:colour|catalogue))\1(?=\s*:)/g, '""');
        for (const m of americanEnglishViolations(text))
          errors.push(`${file}: ${m.word} → ${m.replacement}`);
      }
    }
  };
  for (const dir of ["src", "seed", "docs", "design"]) walk(dir);
  for (const file of ["README.md", "DECISIONS.md"])
    for (const m of americanEnglishViolations(
      proseOnly(readFileSync(join(root, file), "utf8")),
    ))
      errors.push(`${file}: ${m.word} → ${m.replacement}`);
  return errors;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const errors = checkAmericanEnglish();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("American English copy check passed.");
}
