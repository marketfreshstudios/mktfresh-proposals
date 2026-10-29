import { it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Totals, JobState } from "../src/components/ui";
it("always retains one-time/monthly totals and hides absent yearly totals", () => {
  const values = { one_time_total: 0, monthly_total: 0, yearly_total: 0 };
  const html = renderToStaticMarkup(
    createElement(Totals, { value: values, showYearly: false }),
  );
  expect(html).toContain("One-time");
  expect(html).toContain("Monthly");
  expect(html).not.toContain("Yearly");
  expect(
    renderToStaticMarkup(
      createElement(Totals, {
        value: { ...values, yearly_total: 30000 },
        showYearly: true,
      }),
    ),
  ).toContain("Yearly");
});
it("ports JobState classes, safe errors and distinct Retry/Resolve actions", () => {
  for (const state of ["queued", "running", "failed", "review"] as const) {
    const html = renderToStaticMarkup(
      createElement(JobState, {
        state,
        label: "Billing",
        error: "Review customer mapping",
        attempts: 2,
        onRetry: () => {},
      }),
    );
    expect(html).toContain("ps-job");
    expect(html.includes("ps-job__spin")).toBe(state === "running");
    if (state === "failed") expect(html).toContain("Retry");
    if (state === "review") expect(html).toContain("Resolve");
    expect(html).toContain("attempt 2");
  }
});
