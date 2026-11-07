import { describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ denied: false }));
vi.mock("../src/lib/auth", () => ({
  staff: async () => {
    if (auth.denied) throw new AppError(401, "Staff authorization required");
    return {};
  },
}));
import { AppError } from "../src/lib/model";
import {
  buildIdentity,
  appBuildId,
  buildPollMs,
  buildSnoozeMs,
} from "../src/lib/app-build";
import { GET } from "../src/app/api/staff-build/route";
describe("staff build metadata", () => {
  it("selects one public build identity and keeps different deployments of a commit distinct", () => {
    expect(
      buildIdentity(
        { YESWELL_BUILD_ID: "explicit", VERCEL_DEPLOYMENT_ID: "deployment" },
        "fallback",
      ),
    ).toBe("explicit");
    expect(
      buildIdentity(
        { VERCEL_DEPLOYMENT_ID: "deployment", VERCEL_GIT_COMMIT_SHA: "commit" },
        "fallback",
      ),
    ).toBe("deployment");
    expect(
      buildIdentity(
        { VERCEL_GIT_COMMIT_SHA: "commit", VERCEL_URL: "one.example" },
        "fallback",
      ),
    ).not.toBe(
      buildIdentity(
        { VERCEL_GIT_COMMIT_SHA: "commit", VERCEL_URL: "two.example" },
        "fallback",
      ),
    );
    expect(buildIdentity({}, "unique-local-build")).toBe("unique-local-build");
    expect(buildPollMs).toBe(300000);
    expect(buildSnoozeMs).toBe(1800000);
  });
  it("returns only the build ID with no-store at every cache layer", async () => {
    auth.denied = false;
    const response = await GET(new Request("http://localhost/api/staff-build"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ buildId: appBuildId });
    for (const name of [
      "Cache-Control",
      "CDN-Cache-Control",
      "Vercel-CDN-Cache-Control",
    ])
      expect(response.headers.get(name)).toContain("no-store");
  });
  it("requires staff authorization", async () => {
    auth.denied = true;
    const response = await GET(new Request("http://localhost/api/staff-build"));
    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("buildId");
    auth.denied = false;
  });
});
