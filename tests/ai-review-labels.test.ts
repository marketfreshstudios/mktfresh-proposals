import { describe, it, expect } from "vitest";
import { resolveLabel } from "../src/lib/presentation";

describe("AI review section labels", () => {
  it("fill known fields and leave unknown or empty ones as written", () => {
    const map = { "workspace.name": "MarketFresh", "client.company": "" };
    expect(resolveLabel("Why {{workspace.name}}", map)).toBe(
      "Why MarketFresh",
    );
    expect(resolveLabel("Why {{ workspace.name }}", map)).toBe(
      "Why MarketFresh",
    );
    expect(resolveLabel("For {{client.company}}", map)).toBe(
      "For {{client.company}}",
    );
    expect(resolveLabel("{{unknown.field}} plan", map)).toBe(
      "{{unknown.field}} plan",
    );
  });
});
