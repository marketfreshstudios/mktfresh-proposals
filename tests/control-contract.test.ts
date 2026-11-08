import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Switch } from "../src/components/form-controls";
import { it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
it("native selects and on/off switches are owned by the shared controls", () => {
  const bypasses: string[] = [];
  for (const file of readdirSync("src/components", { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".tsx") && f !== "form-controls.tsx")) {
    const source = readFileSync("src/components/" + file, "utf8");
    if (/<select\b|role=["']switch["']/.test(source)) bypasses.push(file);
  }
  expect(bypasses).toEqual([]);
  expect(readFileSync("src/app/tokens.css", "utf8")).toContain(
    "--radius-button: 9999px",
  );
});

it("switch ARIA matches both controlled and native form defaults", () => {
  for (const props of [{ checked: true }, { defaultChecked: true }]) {
    const html = renderToStaticMarkup(React.createElement(Switch, props));
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('checked=""');
  }
  expect(
    renderToStaticMarkup(
      React.createElement(Switch, { defaultChecked: false }),
    ),
  ).toContain('aria-checked="false"');
});
