import { expect, it } from "vitest";
import { setup, staff } from "./helpers";
import { emailIdentity } from "../src/lib/email-identity";
import {
  definition,
  editableEmail,
  emailDefaults,
  renderTemplate,
  saveEmailTemplate,
} from "../src/lib/email-templates";
import { groupedEmails } from "../src/lib/studio-v3";
import { afterLocalDays, nextBusinessMorning } from "../src/lib/reminder-time";

it("keeps the workspace wall-clock time across both DST edges", () => {
  expect(
    afterLocalDays("2026-03-07T14:30:00.123Z", 1, "America/New_York"),
  ).toBe("2026-03-08T13:30:00.123Z");
  expect(
    afterLocalDays("2026-10-31T13:30:00.000Z", 1, "America/New_York"),
  ).toBe("2026-11-01T14:30:00.000Z");
  expect(
    afterLocalDays("2026-03-07T07:30:00.000Z", 1, "America/New_York"),
  ).toBe("2026-03-08T07:30:00.000Z");
  expect(
    afterLocalDays("2026-10-31T05:30:00.000Z", 1, "America/New_York"),
  ).toBe("2026-11-01T05:30:00.000Z");
});
it("next morning means 9am on the next Monday–Friday in the workspace timezone", () => {
  expect(nextBusinessMorning("2026-03-06T22:00:00Z", "America/New_York")).toBe(
    "2026-03-09T13:00:00.000Z",
  );
  expect(nextBusinessMorning("2026-03-07T02:00:00Z", "Asia/Tokyo")).toBe(
    "2026-03-09T00:00:00.000Z",
  );
  expect(nextBusinessMorning("2026-11-08T15:00:00Z", "America/New_York")).toBe(
    "2026-11-09T14:00:00.000Z",
  );
  expect(nextBusinessMorning("2026-11-09T08:00:00Z", "America/New_York")).toBe(
    "2026-11-10T14:00:00.000Z",
  );
});

it("defaults Reply-to to the sender and supports the workspace sending address without changing From", async () => {
  const { service, draft, repo, settings } = await setup();
  let p = await service.send(draft.id, staff);
  const senderIdentity = emailIdentity(p);
  expect(senderIdentity.reply_to).toBe(staff.staff_email);
  await repo.put("workspace_settings", {
    ...settings,
    email: "office@example.test",
    email_reply_to: "workspace",
  });
  p = await service.send(draft.id, staff);
  expect(emailIdentity(p)).toEqual({
    ...senderIdentity,
    reply_to: "office@example.test",
  });
  expect(p.jobs.at(-1)!.payload.reply_to).toBe("office@example.test");
  expect(p.jobs[0].payload.reply_to).toBe(staff.staff_email);
});
it("lists Countersign reminder as read-only, renders the normal staff preview and deep-links to countersigning", async () => {
  const f = await setup();
  const p = await f.service.send(f.draft.id, staff);
  const t = definition("staff_countersign_reminder");
  expect(editableEmail(t)).toBe(false);
  expect(
    groupedEmails(emailDefaults, true).find((g) => g.name === "Signatures")!
      .templates,
  ).toContainEqual(t);
  expect(renderTemplate(t, p).html).toContain("?action=countersign");
  expect(renderTemplate(t, p).text).toContain(
    "waiting for the company countersignature",
  );
  await expect(
    saveEmailTemplate(f.repo, staff, t.key, t),
  ).rejects.toMatchObject({ status: 403 });
});
