/** Reproducible source inventory; browser checks verify the rendered contract. */
import { createRequire } from "node:module";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const { parse } = createRequire(import.meta.url)(
  "next/dist/compiled/babel/parser",
);
const rows: string[][] = [
  ["Source", "Line", "Control", "Label or name", "Shared treatment"],
];
for (const file of readdirSync("src/components", { recursive: true })
  .map(String)
  .filter((f) => f.endsWith(".tsx") && f !== "form-controls.tsx")) {
  const source = readFileSync("src/components/" + file, "utf8");
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });
  const visit = (n: any, ancestors: any[] = []) => {
    if (!n?.type) return;
    if (
      n.type === "JSXOpeningElement" &&
      ["input", "textarea", "Select", "Switch", "ColorPicker"].includes(
        n.name.name,
      )
    ) {
      const attr = (el: any, name: string) =>
        el?.attributes?.find((a: any) => a.name?.name === name)?.value;
      const value = (v: any) =>
        v?.value ?? (v ? source.slice(v.start, v.end) : "");
      const parent = ancestors.findLast(
        (p) =>
          p.type === "JSXElement" && p.openingElement.name.name === "Field",
      );
      const label =
        value(attr(n, "aria-label")) ||
        value(attr(n, "name")) ||
        value(attr(parent?.openingElement, "label")) ||
        "(label supplied by surrounding row)";
      const type =
        n.name.name === "input"
          ? value(attr(n, "type")) || "text"
          : n.name.name;
      const shared =
        n.name.name === "Switch"
          ? "Shared Switch: 36×22 track, 3px knob inset, 44px target, role/checked"
          : n.name.name === "Select"
            ? "Shared Select: app font, inset, chevron, field radius/focus"
            : type === "checkbox" || type === "radio"
              ? "Existing native control + shared label/focus/phone target"
              : n.name.name === "ColorPicker"
                ? "Existing shared color-picker popover; input-like trigger shape retained"
                : type === "file"
                  ? "Existing validated upload, not a styled text field"
                  : type === "range"
                    ? "Existing slider + number field; unchanged"
                    : "Shared field defaults/focus; contextual sizing, units and validation retained";
      rows.push([
        "src/components/" + file,
        String(n.loc.start.line),
        type,
        String(label),
        shared,
      ]);
    }
    for (const value of Object.values(n))
      if (Array.isArray(value))
        value.forEach((v) => visit(v, [...ancestors, n]));
      else if ((value as any)?.type) visit(value, [...ancestors, n]);
  };
  visit(ast);
}
writeFileSync(
  "docs/form-control-audit-2026-11-08.csv",
  rows
    .map((row) =>
      row
        .map((v) => '"' + v.replaceAll('"', '""').replaceAll("\n", " ") + '"')
        .join(","),
    )
    .join("\n") + "\n",
);
console.log(`${rows.length - 1} form-control sites inventoried.`);
