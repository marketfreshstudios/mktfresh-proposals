import { expect, type Locator } from "@playwright/test";

export async function expectStraightTabIndicator(tab: Locator) {
  await expect(tab).toBeVisible();
  const indicator = await tab.evaluate((el) => {
    const line = getComputedStyle(el, "::after");
    return {
      content: line.content,
      height: Number.parseFloat(line.height),
      width: Number.parseFloat(line.width),
      radius: Math.max(
        Number.parseFloat(line.borderTopLeftRadius),
        Number.parseFloat(line.borderTopRightRadius),
        Number.parseFloat(line.borderBottomLeftRadius),
        Number.parseFloat(line.borderBottomRightRadius),
      ),
    };
  });
  expect(indicator.content).toBe('""');
  expect(indicator.height).toBe(2);
  expect(indicator.width).toBeGreaterThan(0);
  expect(indicator.radius).toBeLessThanOrEqual(1);
}
