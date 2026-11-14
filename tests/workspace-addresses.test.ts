import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  validWorkspaceSlug,
  workspaceSlugFromHost,
} from "../src/lib/workspace-address";
import { proposalOrigin, workspaceOrigin } from "../src/lib/links";
import {
  WorkspaceHostMismatch,
  checkStaffWorkspaceHost,
  publicHostAllows,
  type WorkspaceAddressLookup,
} from "../src/lib/workspace-host";
import { postgresFixture } from "./postgres-fixture";

const A = "00000000-0000-4000-8000-0000000000aa",
  B = "00000000-0000-4000-8000-0000000000bb",
  C = "00000000-0000-4000-8000-0000000000cc";
const lookup: WorkspaceAddressLookup = {
  idForSlug: async (s) => ({ acme: A, bravo: B })[s] ?? null,
  slugForId: async (id) => ({ [A]: "acme", [B]: "bravo" })[id] ?? null,
};
const env = { ...process.env };
beforeEach(() => {
  process.env.APP_URL = "https://marketfresh.example.test";
  process.env.WORKSPACE_DOMAIN = "example.test";
});
afterEach(() => {
  process.env = { ...env };
});
const req = (host: string) =>
  new Request(`https://${host}/proposals`, { headers: { host } });

describe("workspace addresses", () => {
  it("accepts ordinary names and refuses reserved or malformed ones", () => {
    for (const ok of ["acme", "a1b", "north-star", "x".repeat(30)])
      expect(validWorkspaceSlug(ok), ok).toBe(true);
    for (const bad of [
      "ab",
      "app",
      "www",
      "support",
      "-acme",
      "acme-",
      "a--b",
      "Acme",
      "x".repeat(31),
      "a.b",
    ])
      expect(validWorkspaceSlug(bad), bad).toBe(false);
  });
  it("reads the workspace name from the host", () => {
    expect(workspaceSlugFromHost("acme.example.test")).toBe("acme");
    expect(workspaceSlugFromHost("ACME.example.test:443")).toBe("acme");
    expect(workspaceSlugFromHost("app.example.test")).toBeNull();
    expect(workspaceSlugFromHost("a.b.example.test")).toBeNull();
    expect(workspaceSlugFromHost("example.test")).toBeNull();
    expect(workspaceSlugFromHost("acme.other.test")).toBeNull();
    delete process.env.WORKSPACE_DOMAIN;
    expect(workspaceSlugFromHost("acme.example.test")).toBeNull();
  });
  it("builds links on the workspace address, falling back to APP_URL", () => {
    expect(workspaceOrigin("acme")).toBe("https://acme.example.test");
    expect(workspaceOrigin(null)).toBe("https://marketfresh.example.test");
    expect(
      proposalOrigin({
        workspace_settings: { workspace_slug: "acme" },
      } as never),
    ).toBe("https://acme.example.test");
    process.env.APP_URL = "http://localhost:3100";
    process.env.WORKSPACE_DOMAIN = "localhost";
    expect(workspaceOrigin("acme")).toBe("http://acme.localhost:3100");
    delete process.env.WORKSPACE_DOMAIN;
    expect(workspaceOrigin("acme")).toBe("http://localhost:3100");
  });
  it("sends staff on another workspace's address to their own", async () => {
    await expect(
      checkStaffWorkspaceHost(req("acme.example.test"), A, lookup),
    ).resolves.toBeUndefined();
    const e = await checkStaffWorkspaceHost(
      req("acme.example.test"),
      B,
      lookup,
    ).catch((x) => x);
    expect(e).toBeInstanceOf(WorkspaceHostMismatch);
    expect(e.origin).toBe("https://bravo.example.test");
    // No address of their own: APP_URL, unless that is where they already are.
    const none = await checkStaffWorkspaceHost(
      req("acme.example.test"),
      C,
      lookup,
    ).catch((x) => x);
    expect(none.origin).toBe("https://marketfresh.example.test");
    // Hosts that aren't workspace addresses are left alone.
    await expect(
      checkStaffWorkspaceHost(req("app.example.test"), B, lookup),
    ).resolves.toBeUndefined();
  });
  it("keeps APP_URL working until its name is claimed", async () => {
    await expect(
      checkStaffWorkspaceHost(req("marketfresh.example.test"), C, lookup),
    ).resolves.toBeUndefined();
    expect(await publicHostAllows("marketfresh.example.test", C, lookup)).toBe(
      true,
    );
    const claimed: WorkspaceAddressLookup = {
      ...lookup,
      idForSlug: async () => A,
    };
    const e = await checkStaffWorkspaceHost(
      req("marketfresh.example.test"),
      C,
      claimed,
    ).catch((x) => x);
    expect(e).toBeInstanceOf(WorkspaceHostMismatch);
    expect(e.origin).toBeNull();
  });
  it("opens proposal links only on their own workspace's address", async () => {
    expect(await publicHostAllows("acme.example.test", A, lookup)).toBe(true);
    expect(await publicHostAllows("acme.example.test", B, lookup)).toBe(false);
    expect(await publicHostAllows("unknown.example.test", A, lookup)).toBe(
      false,
    );
    expect(await publicHostAllows("app.example.test", A, lookup)).toBe(true);
  });
  it("stores unique, well-formed addresses", async () => {
    const db = await postgresFixture();
    await db.exec(
      `insert into public.workspaces(id,name) values ('${A}','A'),('${B}','B') on conflict (id) do nothing`,
    );
    await db.exec(`update public.workspaces set slug='acme' where id='${A}'`);
    await expect(
      db.exec(`update public.workspaces set slug='acme' where id='${B}'`),
    ).rejects.toThrow();
    for (const bad of ["Acme", "a--b", "-ab", "ab"])
      await expect(
        db.exec(`update public.workspaces set slug='${bad}' where id='${B}'`),
      ).rejects.toThrow();
    await db.exec(`update public.workspaces set slug=null where id='${B}'`);
  });
});
