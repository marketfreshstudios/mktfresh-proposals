import { test, expect } from "@playwright/test";
import {
  regressionKinds,
  verifyPdfJobs,
} from "../tests/fixtures/pdf-job-regression";
for (const kind of regressionKinds)
  test(`actual PDF jobs: ${kind}, client/company/certificate, exhausted Retry, preview and exact-once copies`, async () => {
    await verifyPdfJobs(kind);
  });

test("a transient real-pipeline print failure retries once and persists bounded diagnostics in Evidence", async () => {
  const { chromium } = await import("playwright-core");
  const original = (chromium as any).connect;
  let fail = true;
  (chromium as any).connect = async (...args: any[]) => {
    const browser = await original.apply(chromium, args),
      newPage = browser.newPage.bind(browser);
    browser.newPage = async (...opts: any[]) => {
      const page = await newPage(...opts),
        pdf = page.pdf.bind(page);
      page.pdf = async (...input: any[]) => {
        if (fail) {
          fail = false;
          await page.evaluate(() =>
            console.error("Trusted print diagnostic probe"),
          );
          throw new Error(
            "page.pdf: Protocol error (Page.printToPDF): Printing failed",
          );
        }
        return pdf(...input);
      };
      return page;
    };
    return browser;
  };
  try {
    const result = await verifyPdfJobs("old-plan");
    expect(result.recovered).toHaveLength(1);
    const d = (result.recovered[0].pdf_diagnostics as any[])[0];
    expect(d).toMatchObject({
      stage: "client",
      print: "proposal body",
      attempt: 1,
      page_count: 2,
    });
    expect(d.geometry.content.height).toBeGreaterThan(0);
    expect(d.memory.rss).toBeGreaterThan(0);
    expect(d.chromium).toMatch(/^\d/);
    expect(d.console.join(" ")).toContain("Trusted print diagnostic probe");
    expect(Array.isArray(d.stderr)).toBe(true);
  } finally {
    (chromium as any).connect = original;
  }
});

test("a later certificate failure retains earlier recovered-body diagnostics in the job Evidence", async () => {
  const { chromium } = await import("playwright-core");
  const { setup, staff, clientActor, signature } =
    await import("../tests/helpers");
  const { Worker, MockMailer } = await import("../src/lib/jobs");
  const { MockBillingProvider } = await import("../src/lib/billing");
  const { repo, service, draft } = await setup();
  let p = await service.send(draft.id, staff);
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  const original = (chromium as any).connect;
  let prints = 0;
  (chromium as any).connect = async (...args: any[]) => {
    const browser = await original.apply(chromium, args),
      create = browser.newPage.bind(browser);
    browser.newPage = async (...opts: any[]) => {
      const page = await create(...opts),
        print = page.pdf.bind(page);
      page.pdf = async (...options: any[]) => {
        prints++;
        if (prints === 1 || prints === 3 || prints === 4)
          throw new Error(
            "page.pdf: Protocol error (Page.printToPDF): Printing failed",
          );
        return print(...options);
      };
      return page;
    };
    return browser;
  };
  try {
    const worker = new Worker(
      repo,
      { put: async () => {}, get: async () => new Uint8Array() },
      new MockMailer(),
      {
        qbo: new MockBillingProvider("qbo"),
        stripe: new MockBillingProvider("stripe"),
      },
    );
    await worker.drain(p.id, "pdf");
    p = (await repo.get(p.id))!;
    const d = p.events.findLast((e) => e.type === "sync_failed")!.metadata
      .pdf_diagnostics as any[];
    expect(d.map((v) => v.print)).toEqual([
      "proposal body",
      "certificate",
      "certificate",
    ]);
    expect(d.map((v) => v.attempt)).toEqual([1, 1, 2]);
    expect(p.jobs.find((j) => j.kind === "pdf")!.status).toBe("pending");
    expect(prints).toBe(4);
  } finally {
    (chromium as any).connect = original;
  }
});
