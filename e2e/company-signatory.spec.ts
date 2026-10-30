import { test, expect } from "@playwright/test";
import {
  setup,
  staff,
  clientActor,
  signature,
  companyConsent,
} from "../tests/helpers";
import { sealedPdf } from "../src/lib/pdf";
import { onBehalfText } from "../src/lib/workspace";
import { mkdir, writeFile } from "node:fs/promises";

test("delegated company signing requires authorization in the UI and seals actual actor evidence in the PDF", async ({
  page,
}) => {
  const { repo, service, draft, settings } = await setup();
  const delegate = {
    ...staff,
    actor: "staff:00000000-0000-4000-8000-000000000002",
    staff_name: "Franz",
    staff_email: "franz@example.test",
    staff_role: "member" as const,
    ip: "203.0.113.42",
  };
  settings.company_signatory!.authorized_user_ids.push(delegate.actor.slice(6));
  await repo.put("workspace_settings", settings);
  let p = await service.send(draft.id, staff);
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  let submitted: any;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === "/api/auth/session")
      data = {
        user: delegate,
        app_url: "http://127.0.0.1:3100",
        settings,
        signatory_version: companyConsent(0, settings).signatory_version,
        staff: [],
      };
    else if (path.endsWith("/countersign")) {
      submitted = route.request().postDataJSON();
      p = await service.sign(p.id, submitted, "company", delegate);
      data = p;
    } else if (path === `/api/proposals/${p.id}`) data = p;
    else if (path === "/api/proposals") data = { items: [p], total: 1 };
    await route.fulfill({ json: data });
  });
  await page.goto(`/proposals/${p.id}/countersign`);
  await expect(
    page.getByRole("heading", { name: "Signing on behalf of Alex Morgan" }),
  ).toBeVisible();
  const button = page.getByRole("button", {
    name: "Countersign as Alex Morgan",
  });
  await expect(button).toBeDisabled();
  await page
    .getByLabel(
      "I have reviewed the agreement and consent to apply the company signature.",
    )
    .check();
  await expect(button).toBeDisabled();
  const authorization = onBehalfText("Alex Morgan", "Example Studio");
  await page.getByLabel(authorization, { exact: true }).check();
  await expect(button).toBeEnabled();
  await mkdir(".data/evidence", { recursive: true });
  await page.screenshot({
    path: ".data/evidence/company-delegation.png",
    fullPage: true,
  });
  await button.click();
  await expect.poll(() => p.status).toBe("completed");
  expect(submitted.authorization_text).toBe(authorization);
  expect(submitted.name).toBeUndefined();
  expect(submitted.image).toBeUndefined();
  const result = await sealedPdf(
    p.versions.at(-1)!,
    p.signers,
    p.events,
    p.currency,
    { settings },
  );
  await writeFile(".data/evidence/delegated-company-proposal.pdf", result.pdf);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  async function extract(bytes: Uint8Array) {
    const loading = getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    });
    const doc = await loading.promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      pages.push(
        (await page.getTextContent()).items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );
    }
    await loading.destroy();
    return pages.join(" ").replace(/\s+/g, " ");
  }
  const body = await extract(result.body),
    full = await extract(result.pdf);
  expect(body).toContain("Alex Morgan · Owner · Example Studio");
  expect(body).not.toContain("Franz");
  expect(full).toContain(
    "Company signature applied by Franz [franz@example.test] on behalf of Alex Morgan",
  );
  expect(full).toContain(authorization);
  expect(full).toContain(delegate.ip);
  expect(full).toContain(p.signers[1].signed_at);
  expect(full).toContain(delegate.actor);
});
