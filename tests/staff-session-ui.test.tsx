import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { api, Banner } from "../src/components/ui";
import { STAFF_SIGNED_OUT } from "../src/components/staff-sign-in";
afterEach(() => vi.unstubAllGlobals());
it("staff session expiry becomes a useful message and a safe separate sign-in tab", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { error: "Staff authorization required", code: "STAFF_SIGNED_OUT" },
        { status: 401 },
      ),
    ),
  );
  await expect(
    api("/api/proposals/example", { method: "PATCH", body: "{}" }),
  ).rejects.toMatchObject({ status: 401, message: STAFF_SIGNED_OUT });
  const html = renderToStaticMarkup(
    <Banner title="Save failed">{STAFF_SIGNED_OUT}</Banner>,
  );
  expect(html).toContain("Your changes are kept on this device.");
  expect(html).toContain('href="/login?resume=1"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener"');
});
it("public-link passwords, login errors, provider failures and non-staff 403s stay distinct", async () => {
  for (const [path, status, message] of [
    ["/api/public/token", 401, "Password required"],
    ["/api/auth/login", 401, "Invalid credentials"],
    ["/api/connections", 401, "Provider credentials rejected"],
    ["/api/templates", 403, "Staff access required"],
  ] as const) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: message }, { status })),
    );
    await expect(api(path)).rejects.toMatchObject({ status, message });
  }
  expect(
    renderToStaticMarkup(
      <Banner title="Save failed">Staff access required</Banner>,
    ),
  ).not.toContain("/login?resume=1");
});
