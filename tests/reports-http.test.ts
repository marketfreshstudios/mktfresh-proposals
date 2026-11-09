import { beforeEach, expect, it, vi } from "vitest";
import type { Actor, Proposal } from "../src/lib/model";
import type { Repository } from "../src/lib/repository";
const state = vi.hoisted(() => ({
  repos: new Map<string, Repository>(),
  users: new Map<string, Actor>(),
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: (workspace: string) => ({ repo: state.repos.get(workspace) }),
}));
vi.mock("../src/lib/auth", async (original) => {
  const actual = await original<typeof import("../src/lib/auth")>();
  const { AppError } = await import("../src/lib/model");
  return {
    ...actual,
    staff: async (request: Request) => {
      const user = state.users.get(request.headers.get("authorization") ?? "");
      if (!user) throw new AppError(401, "Staff authorization required");
      return user;
    },
    workspaceStaff: async (workspace: string) =>
      [...state.users.values()]
        .filter((u) => u.workspace_id === workspace)
        .map((u) => ({
          user_id: u.actor.slice(6),
          display_name: u.staff_name,
        })),
  };
});
import { handle } from "../src/lib/http";
import { MemoryRepository, mutate } from "../src/lib/repository";
import { clientActor, setup, signature, staff } from "./helpers";
import { reportId } from "./report-fixture";
import { reportParams } from "../src/lib/report-filters";

function get(
  path: string,
  query: URLSearchParams | string = "",
  user = "owner",
) {
  return handle(
    new Request("https://app.example.test/api/" + path + "?" + query, {
      headers: user ? { authorization: user } : {},
    }),
    path.split("/"),
  );
}
let repo: MemoryRepository, signed: Proposal, base: Proposal;
beforeEach(async () => {
  const fixture = await setup();
  repo = fixture.repo;
  base = fixture.draft;
  state.repos.clear();
  state.users.clear();
  state.repos.set(repo.workspaceId, repo);
  state.users.set("owner", { ...staff, workspace_id: repo.workspaceId });
  state.users.set("member", {
    ...staff,
    actor: "staff:" + reportId(911),
    staff_name: "Robin Lee",
    staff_role: "member",
    workspace_id: repo.workspaceId,
  });
  const p = await fixture.service.send(base.id, staff);
  const viewed = await fixture.service.view(p.token!, "", clientActor, {
    in_app: false,
    email: false,
  });
  signed = await fixture.service.sign(
    p.id,
    signature(viewed.revision),
    "client",
    clientActor,
    { token: p.token!, password: "" },
  );
  const other = new MemoryRepository(reportId(990));
  state.repos.set(other.workspaceId, other);
  state.users.set("other", { ...staff, workspace_id: other.workspaceId });
  const copy = {
    ...structuredClone(p),
    workspace_id: other.workspaceId,
    id: reportId(991),
    title: "Private tenant",
    revision: 0,
  };
  await other.save(copy, -1);
});
it("allows Staff the same workspace reports as Super admins, denies anonymous access and isolates drill-downs and CSV", async () => {
  const response = await get("reports");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const report = await response.json();
  expect(report).toMatchObject({ sent: 1, signed: 1, viewed: 1, winRate: 1 });
  expect(await (await get("reports", "", "member")).json()).toMatchObject({
    sent: 1,
    signed: 1,
  });
  expect(await (await get("reports", "", "other")).json()).toMatchObject({
    sent: 1,
    signed: 0,
    viewed: 0,
  });
  expect((await get("reports", "", "")).status).toBe(401);
  expect((await get("reports/export", "", "")).status).toBe(401);
  const filter = {
    range: "custom" as const,
    from: report.range.from,
    to: report.range.to,
    owner: signed.sender!.user_id,
    template: signed.template_id!,
    client: signed.client.id,
  };
  const q = reportParams(filter, { report: "signed" });
  const result = await (await get("proposals", q, "member")).json();
  expect(result.total).toBe(report.signed);
  expect(result.items.map((row: Proposal) => row.id)).toEqual([signed.id]);
  expect((await (await get("proposals", q, "other")).json()).total).toBe(0);
  const exportResponse = await get(
    "reports/export",
    reportParams(filter),
    "member",
  );
  expect(exportResponse.headers.get("content-type")).toContain("text/csv");
  expect(exportResponse.headers.get("content-disposition")).toContain(
    "attachment",
  );
  expect(await exportResponse.text()).toContain('"USD","1","1","100%"');
  expect(
    (await get("reports", "range=custom&from=2026-03-02&to=2026-02-01")).status,
  ).toBe(400);
  expect((await get("proposals", "report=stage")).status).toBe(400);
  expect((await repo.get(signed.id))?.versions).toEqual(signed.versions);
});
it("ignores previews, email tests and imported records, excludes archived drafts, and keeps archived sent records", async () => {
  await mutate(repo, signed.id, (p) => {
    p.archived_at = new Date().toISOString();
  });
  const copy = (n: number, fields: Partial<Proposal>) =>
    repo.save(
      { ...structuredClone(base), id: reportId(n), revision: 0, ...fields },
      -1,
    );
  await copy(700, { archived_at: new Date().toISOString() });
  await copy(701, {
    source: "proposify_import",
    sent_at: signed.sent_at,
    first_viewed_at: signed.first_viewed_at,
    status: "archived",
  });
  await copy(702, {
    events: [
      {
        id: reportId(703),
        type: "preview_pdf",
        created_at: new Date().toISOString(),
        actor: staff.actor,
        ip: "",
        user_agent: "",
        metadata: {},
      },
    ],
  });
  // The self-test path has email-log entries but does not write a sent proposal.
  await repo.put("email_log", {
    id: reportId(704),
    proposal_id: reportId(702),
    test: true,
  });
  const report = await (await get("reports")).json();
  expect(report).toMatchObject({ sent: 1, viewed: 1, signed: 1, open: 0 });
  expect(
    report.pipeline.find((r: { id: string }) => r.id === "draft").count,
  ).toBe(1);
  const result = await (await get("proposals", "report=sent")).json();
  expect(result.items).toHaveLength(1);
  expect(result.items[0].id).toBe(signed.id);
});
