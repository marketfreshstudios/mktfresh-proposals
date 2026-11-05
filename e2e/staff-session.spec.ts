import { setup } from "../tests/helpers";
import { test, expect, type APIRequestContext } from "@playwright/test";
const auth = "http://127.0.0.1:3112";
const headers = { Authorization: "Bearer e2e-staff-secret-only" };
async function draft(request: APIRequestContext) {
  const { settings } = await setup();
  const configured = await request.post("/api/workspace_settings", {
    headers,
    data: settings,
  });
  expect(configured.ok(), await configured.text()).toBe(true);
  const client = {
    id: crypto.randomUUID(),
    company: "Session fixture",
    first_name: "Jane",
    last_name: "Doe",
    email: `client-${crypto.randomUUID()}@example.test`,
  };
  const template = {
    id: crypto.randomUUID(),
    name: "Session fixture",
    active: true,
    default_quote: [],
    content: [
      { id: crypto.randomUUID(), type: "heading", text: "Overview", level: 1 },
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        text: "Scope being edited.",
      },
      { id: crypto.randomUUID(), type: "pricing_table" },
      { id: crypto.randomUUID(), type: "signature_block", role: "client" },
      { id: crypto.randomUUID(), type: "signature_block", role: "company" },
    ],
  };
  for (const [path, data] of [
    ["clients", client],
    ["templates", template],
  ] as const) {
    const created = await request.post(`/api/${path}`, { headers, data });
    expect(created.ok(), await created.text()).toBe(true);
  }
  const response = await request.post("/api/proposals", {
    headers,
    data: {
      client_id: client.id,
      template_id: template.id,
      title: `Session fixture ${crypto.randomUUID()}`,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}
async function credentials(request: APIRequestContext, expired = true) {
  return (await request.post(`${auth}/fixture`, { data: { expired } })).json();
}
test("real proxy refreshes parallel saves and returns rotated HttpOnly browser cookies", async ({
  request,
  context,
  page,
}) => {
  const one = await draft(request),
    two = await draft(request),
    session = await credentials(request);
  const cookie = `proposal_session=${session.access_token}; proposal_refresh=${session.refresh_token}`;
  const results = await Promise.all(
    [one, two].map((p) =>
      request.patch(`/api/proposals/${p.id}`, {
        headers: { cookie, Origin: "http://127.0.0.1:3100" },
        data: { revision: p.revision, title: p.title + " saved after expiry" },
      }),
    ),
  );
  expect(results.map((r) => r.status())).toEqual([200, 200]);
  for (const result of results) {
    const cookies = result
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value)
      .join(";");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("SameSite=Lax");
    expect(cookies).toContain("Max-Age=2592000");
    const body = await result.json();
    expect(JSON.stringify(body)).not.toContain("refresh_token");
    expect(JSON.stringify(body)).not.toContain("access_token");
  }
  const fresh = await credentials(request);
  await context.addCookies([
    {
      name: "proposal_session",
      value: fresh.access_token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "proposal_refresh",
      value: fresh.refresh_token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(`/proposals/${one.id}`);
  await expect(
    page.locator(".editor-page-sheets[data-layout-settled=true]"),
  ).toBeVisible();
  const current = await context.cookies();
  expect(current.find((c) => c.name === "proposal_refresh")!.value).not.toBe(
    fresh.refresh_token,
  );
  expect(await page.evaluate(() => document.cookie)).not.toMatch(
    /proposal_session|proposal_refresh/,
  );
  expect(
    (await (await request.get(`${auth}/fixture/${fresh.id}`)).json()).refreshes,
  ).toBe(1);
});
test("revoked session keeps editor text, signs in in another tab, and Retry saves it; logout clears both cookies", async ({
  request,
  context,
  page,
}) => {
  const p = await draft(request),
    session = await credentials(request, false);
  await context.addCookies([
    {
      name: "proposal_session",
      value: session.access_token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "proposal_refresh",
      value: session.refresh_token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${p.id}`);
  await expect(
    page.locator(".editor-page-sheets[data-layout-settled=true]"),
  ).toBeVisible();
  await request.post(`${auth}/fixture/${session.id}/revoke`);
  const paragraph = p.content.find((b: any) => b.type === "paragraph");
  const text = page.locator(`[data-block-id="block-${paragraph.id}"] .tiptap`);
  await text.fill("These local edits must survive sign-in.");
  const bar = page.locator(".editor-notice-error");
  await expect(bar).toContainText(
    "You've been signed out. Your changes are kept on this device.",
  );
  await expect(text).toHaveText("These local edits must survive sign-in.");
  expect(
    await page.evaluate(
      (id) =>
        Object.entries(localStorage).some(
          ([key, value]) =>
            key.includes(id) &&
            value.includes("These local edits must survive sign-in."),
        ),
      p.id,
    ),
  ).toBe(true);
  let loginBody!: unknown;
  let loginStatus: number | undefined;
  let finishLogin!: () => void;
  const loginHandled = new Promise<void>((resolve) => {
    finishLogin = resolve;
  });
  await context.route("**/api/auth/login", async (route) => {
    const response = await route.fetch();
    loginBody = await response.json();
    loginStatus = response.status();
    await route.fulfill({ response });
    finishLogin();
  });
  const popupPromise = context.waitForEvent("page");
  await bar.getByRole("link", { name: "Sign in", exact: true }).click();
  const popup = await popupPromise;
  await popup.getByLabel("Email address").fill("staff@example.test");
  await popup.getByLabel("Password", { exact: true }).fill("fixture-password");
  const closed = popup.waitForEvent("close");
  await popup.getByRole("button", { name: "Sign in", exact: true }).click();
  // The sign-in page closes itself immediately after fetch resolves. Waiting
  // for its browser response event races tab destruction on slower CI runners.
  // Observe the completed intercepted server response, then the actual close.
  await loginHandled;
  expect(loginStatus).toBe(200);
  expect(loginBody).toEqual({ authenticated: true });
  await closed;
  await expect(text).toHaveText("These local edits must survive sign-in.");
  await bar.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(bar).toHaveCount(0);
  const saved = await (
    await request.get(`/api/proposals/${p.id}`, { headers })
  ).json();
  expect(JSON.stringify(saved.content)).toContain(
    "These local edits must survive sign-in.",
  );
  const logout = await page.evaluate(
    async () => (await fetch("/api/auth/logout", { method: "POST" })).status,
  );
  expect(logout).toBe(200);
  expect(
    (await context.cookies()).filter((c) =>
      ["proposal_session", "proposal_refresh"].includes(c.name),
    ),
  ).toEqual([]);
  expect((await page.request.get("/api/proposals")).status()).toBe(401);
});
test("inline client save shows Sign in without clearing its entered contact details", async ({
  request,
  context,
  page,
}) => {
  await draft(request);
  const session = await credentials(request, false);
  await context.addCookies([
    {
      name: "proposal_session",
      value: session.access_token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "proposal_refresh",
      value: session.refresh_token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/proposals?new=1");
  await expect(
    page.getByRole("dialog", { name: "New proposal", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create new client instead", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "New client", exact: true });
  await modal
    .getByLabel("Company", { exact: true })
    .fill("Kept contact company");
  await modal
    .getByLabel("Email", { exact: true })
    .fill("kept-contact@example.test");
  await request.post(`${auth}/fixture/${session.id}/revoke`);
  const rejected = page.waitForResponse(
    (r) => r.url().endsWith("/api/clients") && r.request().method() === "POST",
  );
  await modal
    .getByRole("button", { name: "Create client", exact: true })
    .click();
  expect((await rejected).status()).toBe(401);
  await expect(modal).toContainText(
    "You've been signed out. Your changes are kept on this device.",
  );
  await expect(
    modal.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(modal.getByLabel("Company", { exact: true })).toHaveValue(
    "Kept contact company",
  );
  await expect(modal.getByLabel("Email", { exact: true })).toHaveValue(
    "kept-contact@example.test",
  );
  await expect(
    modal.getByRole("button", { name: "Create client", exact: true }),
  ).toBeEnabled();
});

test("staff pages redirect before HTML and accept a refresh-only session", async ({
  page,
  context,
  request,
}) => {
  await context.clearCookies();
  for (const path of [
    "/",
    "/proposals/00000000-0000-4000-8000-000000000123?view=send",
  ]) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(
      new URL(
        response.headers().location,
        "http://127.0.0.1:3100",
      ).searchParams.get("next"),
    ).toBe(path);
    expect(await response.text()).not.toContain("Dashboard");
  }
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  const session = await credentials(request);
  await context.addCookies([
    {
      name: "proposal_refresh",
      value: session.refresh_token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const response = await page.request.get("/", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("Dashboard");
  const cookies = await context.cookies();
  expect(cookies.some((c) => c.name === "proposal_session")).toBe(true);
  expect(
    cookies.filter((c) => c.name === "proposal_refresh").map((c) => c.path),
  ).toEqual(["/"]);
});
