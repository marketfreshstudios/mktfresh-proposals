import { expect, it } from "vitest";
import { homePipeline } from "../src/lib/home-pipeline";
import type { Proposal } from "../src/lib/model";
import { setup } from "./helpers";

it("buckets Pipeline by the workspace calendar and preserves stage and currency rules", async () => {
  const { draft } = await setup();
  const now = new Date("2026-11-01T05:45:00Z");
  const inZone = (range: Parameters<typeof homePipeline>[1]) =>
    homePipeline(rows, range, now, "America/Los_Angeles");
  const sent = (sent_at: string, status: Proposal["status"] = "sent") => ({
    ...draft,
    sent_at,
    status,
  });
  const rows: Proposal[] = [
    sent("2026-10-01T07:00:00Z"),
    sent("2026-10-01T06:59:59Z", "viewed"),
    { ...sent("2026-08-01T07:00:00Z", "completed"), currency: "CAD" },
    sent("2026-05-01T07:00:00Z", "viewed"),
    sent("2026-01-01T08:00:00Z"),
    sent("2026-01-01T07:59:59Z"),
    { ...draft, status: "completed", sent_at: null },
    sent("2026-11-01T07:00:00Z"),
    { ...sent("2026-10-15T15:00:00Z"), archived_at: now.toISOString() },
    { ...sent("2026-10-15T15:00:00Z"), source: "proposify_import" },
    sent("2026-10-15T15:00:00Z", "draft"),
    sent("2026-10-15T15:00:00Z", "declined"),
  ];
  expect(inZone("month").counts).toEqual([1, 0, 0]);
  expect(inZone("3-months").counts).toEqual([1, 1, 1]);
  expect(inZone("6-months").counts).toEqual([1, 2, 1]);
  expect(inZone("year").counts).toEqual([2, 2, 1]);
  expect(inZone("all").counts).toEqual([4, 2, 2]);
  const monthly = inZone("month").amounts.USD;
  expect(monthly.once).toBeGreaterThan(0);
  expect(monthly.month).toBeGreaterThan(0);
  expect(inZone("3-months").amounts).toEqual({
    USD: {
      once: 2 * monthly.once,
      month: 2 * monthly.month,
      year: 2 * monthly.year,
    },
    CAD: monthly,
  });
  expect(homePipeline(rows, "month", now, "UTC").counts).toEqual([0, 0, 0]);
});
