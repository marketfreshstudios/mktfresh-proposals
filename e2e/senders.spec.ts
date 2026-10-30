import { test, expect } from "@playwright/test";
import { setup, staff, companyConsent } from "../tests/helpers";
test("From lists the workspace team, defaults to the current user and submits a different selected staff ID", async ({
  page,
}) => {
  const { repo, service, draft, settings, members } = await setup();
  members.push({
    user_id: "00000000-0000-4000-8000-000000000002",
    name: "Franz",
    display_name: "Franz",
    email: "franz@example.test",
    role: "member",
  });
  let p = draft;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let value: unknown = [];
    if (path === "/api/auth/session")
      value = {
        user: staff,
        settings,
        staff: members,
        app_url: "http://127.0.0.1:3100",
        signatory_version: companyConsent(0, settings).signatory_version,
      };
    else if (path.endsWith("/send")) {
      const input = route.request().postDataJSON();
      expect(Object.keys(input).sort()).toEqual([
        "confirm_ai_review",
        "note",
        "password",
        "sender_user_id",
      ]);
      p = await service.send(
        p.id,
        staff,
        input.confirm_ai_review,
        input.sender_user_id,
      );
      value = p;
    } else if (path === `/api/proposals/${p.id}`) value = p;
    else if (path === "/api/proposals") value = { items: [p], total: 1 };
    else if (path === "/api/pricing_items")
      value = await repo.entities("pricing_items");
    await route.fulfill({ json: value });
  });
  await page.goto(`/proposals/${p.id}/send`);
  const from = page.getByRole("combobox", { name: "From", exact: true });
  await expect(from).toHaveValue(staff.actor.slice(6));
  await expect(from.locator("option")).toHaveCount(2);
  await from.selectOption(members[1].user_id);
  await page.getByRole("button", { name: "Send to Jane", exact: true }).click();
  await expect.poll(() => p.sender?.email).toBe("franz@example.test");
});
