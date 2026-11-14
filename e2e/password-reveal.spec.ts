import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const out = process.env.CAPTURE_PASSWORD;
test("password fields have an eye button that shows and hides the password", async ({
  page,
}) => {
  for (const path of ["/login", "/start"]) {
    await page.goto(path);
    const field = page.getByLabel("Password", { exact: true });
    await field.fill("correct horse");
    await expect(field).toHaveAttribute("type", "password");
    const eye = page.getByRole("button", { name: "Show password" });
    await eye.click();
    await expect(field).toHaveAttribute("type", "text");
    await expect(
      page.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");
    if (out)
      await page
        .locator(".password-input")
        .first()
        .screenshot({ path: `${out}${path.replace("/", "-")}.png` });
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(field).toHaveAttribute("type", "password");
    // The eye sits inside the field and is reachable by keyboard.
    const [f, b] = await Promise.all([field.boundingBox(), eye.boundingBox()]);
    expect(b!.x + b!.width).toBeLessThanOrEqual(f!.x + f!.width);
    expect(b!.y).toBeGreaterThanOrEqual(f!.y);
    expect(b!.y + b!.height).toBeLessThanOrEqual(f!.y + f!.height);
    await field.focus();
    await page.keyboard.press("Tab");
    await expect(eye).toBeFocused();
    expect(
      (await new AxeBuilder({ page }).include(".password-input").analyze())
        .violations,
    ).toEqual([]);
  }
});
