import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { setup, staff, testSignatureImage } from "./helpers";
import {
  allowStaffNotification,
  readStaffAccount,
  readStaffPhoto,
  saveAccountSignature,
  saveStaffAccount,
  saveStaffPhoto,
} from "../src/lib/staff-account";
import {
  formatStaffDate,
  StaffAccountPatchSchema,
} from "../src/lib/staff-account-model";
import { signatoryVersion } from "../src/lib/company-signatory";
import { renderTemplate, emailTemplates } from "../src/lib/email-templates";
import { MemoryRepository } from "../src/lib/repository";
import type { WorkspaceSettings } from "../src/lib/workspace";

const otherId = "00000000-0000-4000-8000-000000000017";
function viewer(repo: MemoryRepository, id?: string) {
  return {
    ...staff,
    workspace_id: repo.workspaceId,
    actor: id ? `staff:${id}` : staff.actor,
    staff_name: id ? "Jamie Smith" : staff.staff_name!,
    staff_email: id ? "jamie@example.test" : staff.staff_email!,
    staff_role: id ? ("member" as const) : ("owner" as const),
  };
}

describe("staff account", () => {
  it("isolates personal settings and merges independent preference changes", async () => {
    const repo = new MemoryRepository();
    const actor = viewer(repo);
    const other = viewer(repo, otherId);
    await Promise.all([
      saveStaffAccount(repo, actor, {
        notifications: { staff_question: false },
      }),
      saveStaffAccount(repo, actor, { timezone: "Pacific/Honolulu" }),
    ]);
    await saveStaffAccount(repo, other, { theme: "dark" });
    expect(await readStaffAccount(repo, actor)).toMatchObject({
      timezone: "Pacific/Honolulu",
      notifications: { staff_question: false },
      theme: null,
    });
    expect(await readStaffAccount(repo, other)).toMatchObject({
      timezone: null,
      notifications: {},
      theme: "dark",
    });
    await expect(
      readStaffAccount(new MemoryRepository(otherId), actor),
    ).rejects.toMatchObject({ status: 403 });
    for (const input of [
      { user_id: otherId },
      { role: "owner" },
      { timezone: "Not/A_Timezone" },
      { notifications: { staff_signed: false } },
      { notifications: { staff_billing_failed: false } },
      { first_name: "" },
    ])
      expect(StaffAccountPatchSchema.safeParse(input).success).toBe(false);
  });

  it("narrows only optional notifications that would already go to a recipient", async () => {
    const { repo, draft } = await setup();
    const owner = viewer(repo);
    const teammate = viewer(repo, otherId);
    expect(
      await allowStaffNotification(
        repo,
        draft,
        teammate.staff_email,
        "staff_question",
        otherId,
      ),
    ).toBe(true);
    await saveStaffAccount(repo, teammate, { own_proposals_only: true });
    expect(
      await allowStaffNotification(
        repo,
        draft,
        teammate.staff_email,
        "staff_question",
        otherId,
      ),
    ).toBe(false);
    expect(
      await allowStaffNotification(
        repo,
        draft,
        owner.staff_email,
        "staff_question",
        owner.actor.slice(6),
      ),
    ).toBe(true);
    await saveStaffAccount(repo, owner, {
      notifications: { staff_question: false },
    });
    expect(
      await allowStaffNotification(
        repo,
        draft,
        owner.staff_email,
        "staff_question",
        owner.actor.slice(6),
      ),
    ).toBe(false);
    expect(
      await allowStaffNotification(
        repo,
        draft,
        owner.staff_email,
        "staff_completed",
        owner.actor.slice(6),
      ),
    ).toBe(true);
  });

  it("updates only the designated staff signatory’s image and rejects stale saves", async () => {
    const { repo, settings, service, draft } = await setup();
    const designated = viewer(repo, otherId);
    const signatory = { ...settings.company_signatory!, user_id: otherId };
    await repo.put("workspace_settings", {
      ...settings,
      company_signatory: signatory,
    });
    const sent = await service.send(draft.id, staff);
    const document = { ...settings, company_signatory: signatory };
    const version = signatoryVersion(document);
    await expect(
      saveAccountSignature(repo, viewer(repo), version, testSignatureImage),
    ).rejects.toMatchObject({ status: 403 });
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#10272d" },
    })
      .png()
      .toBuffer();
    const image = "data:image/png;base64," + png.toString("base64");
    await expect(
      saveAccountSignature(repo, designated, version, image),
    ).resolves.toMatchObject({ signature: { ...signatory, image } });
    await expect(
      saveAccountSignature(repo, designated, version, testSignatureImage),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await repo.entities<WorkspaceSettings>("workspace_settings"))[0],
    ).toEqual({ ...document, company_signatory: { ...signatory, image } });
    expect((await repo.get(draft.id))?.versions).toEqual(sent.versions);
  });

  it("validates and stores square photos and snapshots the sender profile for new proposal mail", async () => {
    const { repo, service, draft } = await setup();
    const images = new Map<string, Uint8Array>();
    const storage = {
      put: async (path: string, bytes: Uint8Array) => {
        images.set(path, bytes);
      },
      get: async (path: string) => images.get(path)!,
    };
    const actor = viewer(repo);
    const asData = async (width: number) =>
      "data:image/jpeg;base64," +
      (
        await sharp({
          create: { width, height: 256, channels: 3, background: "#405457" },
        })
          .jpeg()
          .toBuffer()
      ).toString("base64");
    await expect(
      saveStaffPhoto(repo, storage, actor, await asData(255)),
    ).rejects.toMatchObject({ status: 400 });
    await saveStaffPhoto(repo, storage, actor, await asData(256));
    await saveStaffAccount(repo, actor, {
      job_title: "Managing partner",
      phone: "+1 (305) 555-0123",
    });
    const sent = await service.send(draft.id, staff);
    const path = sent.sender!.photo_path;
    expect(path).toBe([...images.keys()][0]);
    expect(sent.sender).toMatchObject({
      job_title: "Managing partner",
      phone: "+1 (305) 555-0123",
    });
    await expect(
      readStaffPhoto(storage, repo.workspaceId, otherId, path),
    ).rejects.toMatchObject({ status: 404 });
    const template = (await emailTemplates(repo)).find(
      (item) => item.key === "proposal_sent",
    )!;
    const rendered = renderTemplate(template, sent);
    expect(rendered.html).toContain("/brand/sender-photo");
    expect(rendered.html).toContain("Managing partner");
    expect(rendered.text).toContain("Managing partner");
    await saveStaffAccount(repo, actor, {
      photo_path: null,
      job_title: "New title",
    });
    expect((await repo.get(draft.id))?.sender).toEqual(sent.sender);
  });

  it("uses the viewer’s zone and date format for staff timestamps", () => {
    expect(
      formatStaffDate(
        "2026-11-10T02:00:00Z",
        {
          timezone: "America/New_York",
          date_format: "iso",
        },
        { timeZone: "UTC", timeStyle: "short" },
      ),
    ).toBe("2026-11-09, 9:00 PM");
  });
});
