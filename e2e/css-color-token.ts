import type { Locator } from "@playwright/test";

export function cssColorToken(element: Locator, token: `--${string}`) {
  return element.evaluate((node, property) => {
    const value = getComputedStyle(node).getPropertyValue(property).trim();
    if (!CSS.supports("color", value))
      throw new Error(`Expected ${property} to be a color, got "${value}"`);
    const probe = document.createElement("span");
    probe.style.cssText = "display:none";
    probe.style.color = value;
    document.body.append(probe);
    try {
      return getComputedStyle(probe).color;
    } finally {
      probe.remove();
    }
  }, token);
}
