import { createClient } from "@supabase/supabase-js";
import { SupabaseTeamStore } from "../src/lib/team-store";
import { describe, expect, it } from "vitest";
import { emailDefaults } from "../src/lib/email-template-content";
import {
  groupedEmails,
  stripeStatus,
  studioDate,
  templateUsage,
} from "../src/lib/studio-v3";
import {
  activityGroup,
  teamActivity,
  activityCsv,
} from "../src/lib/studio-activity";
import { staffRoute, legacyStaffRedirect } from "../src/lib/staff-routes";
describe("Studio v3 existing data and routes", () => {
  it("formats template usage and short editing dates", () => {
    expect([0, 1, 14].map(templateUsage)).toEqual([
      "Not used yet",
      "Used once",
      "Used 14 times",
    ]);
    expect(studioDate("2026-10-21T12:00:00Z", new Date("2026-11-05"))).toBe(
      "Oct 21",
    );
    expect(studioDate("2025-10-21T12:00:00Z", new Date("2026-11-05"))).toBe(
      "Oct 21, 2025",
    );
  });
  it("reads all Team activity in stable, workspace-scoped pages without changing recent changes", async () => {
    const records = Array.from({ length: 1002 }, (_, n) => ({
      id: String(n),
      workspace_id: "workspace-a",
      created_at: "2026-11-05T12:00:00Z",
    }));
    const calls: URL[] = [];
    const db = createClient("https://example.invalid", "test-only", {
      global: {
        fetch: async (input) => {
          const url = new URL(String(input));
          calls.push(url);
          expect(url.searchParams.get("workspace_id")).toBe("eq.workspace-a");
          expect(url.searchParams.get("order")).toBe("created_at.desc,id.desc");
          const offset = Number(url.searchParams.get("offset") ?? 0),
            limit = Number(url.searchParams.get("limit"));
          return new Response(
            JSON.stringify(records.slice(offset, offset + limit)),
            { headers: { "Content-Type": "application/json" } },
          );
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const store = new SupabaseTeamStore(db, "workspace-a");
    expect(await store.audit(true)).toHaveLength(1002);
    expect(calls.map((u) => u.searchParams.get("offset"))).toEqual([
      "0",
      "500",
      "1000",
    ]);
    calls.length = 0;
    expect(await store.audit()).toHaveLength(40);
    expect(calls).toHaveLength(1);
  });

  it("lists exactly ten staff emails in the owner-approved groups without duplicating job failures", () => {
    const groups = groupedEmails(emailDefaults, true);
    expect(groups.map((g) => [g.name, g.templates.map((t) => t.key)])).toEqual([
      ["Client activity", ["staff_viewed", "staff_declined"]],
      [
        "Signatures",
        [
          "staff_signed",
          "staff_countersign_reminder",
          "staff_completed",
          "staff_copy",
        ],
      ],
      ["Billing", ["staff_billing_complete"]],
      [
        "Team and jobs · editable",
        ["staff_billing_failed", "team_invite", "team_password_reset"],
      ],
    ]);
    expect(groups.flatMap((g) => g.templates)).toHaveLength(10);
    expect(
      groupedEmails(emailDefaults, false).flatMap((g) => g.templates),
    ).toHaveLength(8);
  });
  it("never labels a test connection as live", () => {
    expect(stripeStatus({ stripe: true, mock: false, mode: "test" })).toBe(
      "Connected · test mode",
    );
    expect(stripeStatus({ stripe: true, mock: false, mode: "live" })).toBe(
      "Connected · live mode",
    );
    expect(stripeStatus({ stripe: false, mock: true, mode: "mock" })).toBe(
      "Mock mode",
    );
  });
  it("retains Studio and legacy routes including the saved-block editor", () => {
    expect(staffRoute(["studio", "blocks", "block-id"])).toEqual({
      section: "library",
      id: "block-id",
      action: undefined,
    });
    expect(
      staffRoute(["studio", "templates"], { view: "blocks" }).section,
    ).toBe("library");
    expect(staffRoute(["studio", "workspace"], { view: "team" })).toEqual({
      section: "settings",
      id: "team",
      action: undefined,
    });
    expect(legacyStaffRedirect(["library"])).toBe(
      "/studio/templates?view=blocks",
    );
    expect(legacyStaffRedirect(["settings", "team"])).toBe(
      "/studio/workspace?view=team",
    );
    expect(legacyStaffRedirect(["studio", "catalog"])).toBe("/studio/products");
  });
  it("groups team changes using the existing audit and protects CSV cells", () => {
    const e = teamActivity({
      id: "1",
      workspace_id: "w",
      actor: "staff:a",
      actor_name: "Admin",
      target_user_id: "b",
      target_name: "Teammate",
      action: "role",
      before: { role: "member" },
      after: { role: "owner" },
      created_at: "2026-11-05T12:00:00Z",
    });
    expect(activityGroup(e)).toBe("Team");
    expect(e.metadata.actor_name).toBe("Admin");
    expect(activityCsv([{ ...e, detail: "=formula" }])).toContain(
      '"\'=formula"',
    );
  });
});
