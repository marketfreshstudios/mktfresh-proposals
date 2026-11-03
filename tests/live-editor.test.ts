import { expect, it } from "vitest";
import { setup, staff, signature, clientActor } from "./helpers";
import { publicResult, ProposalService } from "../src/lib/service";
import { proposalAction } from "../src/lib/proposal-actions";
import { defaultValidUntil } from "../src/lib/validity";
import { versionHash } from "../src/lib/content";
import type { Proposal } from "../src/lib/model";

it("a live save publishes one new version on the same token without an email or changing the prior version", async () => {
  const { service, draft } = await setup();
  const sent = await service.send(draft.id, staff);
  const content = [
    ...sent.content,
    {
      id: crypto.randomUUID(),
      type: "paragraph" as const,
      text: "Saved edits go live",
    },
  ];
  const edited = await service.edit(
    sent.id,
    { revision: sent.revision, content, title: "Updated title" },
    staff,
  );
  expect(edited.token).toBe(sent.token);
  expect(edited.versions).toHaveLength(2);
  expect(edited.versions[0]).toEqual(sent.versions[0]);
  expect(edited.jobs).toEqual(sent.jobs);
  expect(edited.events.at(-1)).toMatchObject({
    type: "updated_after_send",
    metadata: { previous_version: 1, new_version: 2 },
  });
  const live = publicResult(await service.byToken(sent.token!));
  expect(live.title).toBe("Updated title");
  expect(live.content.at(-1)?.text).toBe("Saved edits go live");
  expect(versionHash(edited.versions[1])).toBe(edited.versions[1].content_hash);
  await expect(
    service.edit(
      edited.id,
      { revision: edited.revision, title: "AI may not publish" },
      { ...staff, actor: "ai:test" },
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("an invalid save retains staff work and all client presentation from the last good version; fixing it auto-publishes", async () => {
  const { service, draft } = await setup();
  const sent = await service.send(draft.id, staff);
  const work = await service.edit(
    sent.id,
    {
      revision: sent.revision,
      title: "Work in progress",
      valid_until: null,
      content: sent.content.filter((b) => b.type !== "pricing_table"),
    },
    staff,
  );
  expect(work.live_blockers?.join(" ")).toContain("pricing table");
  expect(work.versions).toEqual(sent.versions);
  const client = publicResult(await service.byToken(sent.token!));
  expect(client.title).toBe(sent.title);
  expect(client.valid_until).toBe(sent.valid_until);
  expect(client.content).toEqual(sent.versions[0].content);
  const fixed = await service.edit(
    work.id,
    { revision: work.revision, content: sent.content },
    staff,
  );
  expect(fixed.live_blockers).toBeUndefined();
  expect(fixed.versions).toHaveLength(2);
  expect(publicResult(await service.byToken(sent.token!)).title).toBe(
    work.title,
  );
  expect(
    publicResult(await service.byToken(sent.token!)).valid_until,
  ).toBeNull();
});
it("the old viewed hash cannot sign after publication; reload succeeds and every further edit is refused", async () => {
  const { service, draft } = await setup();
  const sent = await service.send(draft.id, staff);
  const edited = await service.edit(
    sent.id,
    { revision: sent.revision, title: "Latest accepted title" },
    staff,
  );
  const access = { token: sent.token!, password: "" };
  await expect(
    service.sign(
      sent.id,
      {
        ...signature(edited.revision),
        reviewed_hash: sent.versions[0].content_hash,
      },
      "client",
      clientActor,
      access,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const signed = await service.sign(
    sent.id,
    {
      ...signature(edited.revision),
      reviewed_hash: edited.versions.at(-1)!.content_hash,
    },
    "client",
    clientActor,
    access,
  );
  await expect(
    service.edit(
      signed.id,
      { revision: signed.revision, title: "Forbidden" },
      staff,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    service.reviewSections(
      signed.id,
      {
        revision: signed.revision,
        section_ids: [signed.content[0].id!],
        reviewed: true,
      },
      staff,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
it("signing the last good publication retains invalid work for duplication, while the signed data and hash stay frozen", async () => {
  const { service, repo, draft } = await setup();
  const sent = await service.send(draft.id, staff);
  const work = await service.edit(
    sent.id,
    {
      revision: sent.revision,
      title: "Retained staff work",
      content: sent.content.filter((b) => b.type !== "pricing_table"),
    },
    staff,
  );
  const signed = await service.sign(
    sent.id,
    {
      ...signature(work.revision),
      reviewed_hash: sent.versions[0].content_hash,
    },
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  expect(signed.title).toBe(sent.title);
  expect(signed.content.some((b) => b.type === "pricing_table")).toBe(true);
  expect(signed.unpublished_work?.title).toBe("Retained staff work");
  expect(
    signed.unpublished_work?.content.some((b) => b.type === "pricing_table"),
  ).toBe(false);
  const frozen = structuredClone(signed.versions);
  const duplicate = await proposalAction(
    repo,
    signed.id,
    signed.revision,
    "duplicate",
    staff,
  );
  expect(duplicate.title).toBe("Retained staff work (copy)");
  expect(duplicate.content).toEqual(work.content);
  expect(duplicate.status).toBe("draft");
  expect(duplicate.token).toBeNull();
  expect(duplicate.unpublished_work).toBeUndefined();
  expect((await repo.get(signed.id))!.versions).toEqual(frozen);
  expect(versionHash(frozen[0])).toBe(frozen[0].content_hash);
});
for (const status of ["lost", "declined", "expired"] as const)
  it(`Reopen ${status} keeps the token, uses the workspace default, logs the event and sends no email`, async () => {
    const { service, repo, draft, settings } = await setup();
    let closed = await service.send(draft.id, staff);
    if (status === "lost")
      closed = await proposalAction(
        repo,
        closed.id,
        closed.revision,
        "mark_lost",
        staff,
      );
    else {
      closed.status = status;
      if (status === "expired") {
        closed.valid_until = "2020-01-01T23:59:00.000Z";
        closed.published_state!.valid_until = closed.valid_until;
      }
      await repo.save(closed, closed.revision);
    }
    closed = await service.edit(
      closed.id,
      {
        revision: closed.revision,
        title: "Edited while closed",
        valid_until: closed.valid_until,
      },
      staff,
    );
    expect(closed.title).toBe("Edited while closed");
    const now = new Date();
    const reopened = await proposalAction(
      repo,
      closed.id,
      closed.revision,
      "mark_sent",
      staff,
      "",
      now,
      service,
    );
    expect(reopened.token).toBe(closed.token);
    expect(reopened.valid_until).toBe(defaultValidUntil(settings, now));
    expect(reopened.jobs).toEqual(closed.jobs);
    expect(reopened.events.at(-1)).toMatchObject({
      type: "reopened",
      metadata: { previous_status: closed.status },
    });
    expect((await service.byToken(reopened.token!)).id).toBe(closed.id);
  });
it("a signature concurrent with the asynchronous readiness check wins and the stale save cannot overwrite it", async () => {
  const { service, repo, draft } = await setup();
  const sent = await service.send(draft.id, staff);
  const checkReady = service.checkReady.bind(service);
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => (enter = r)),
    gate = new Promise<void>((r) => (release = r));
  service.checkReady = async (...args) => {
    enter();
    await gate;
    return checkReady(...args);
  };
  const edit = service.edit(
    sent.id,
    { revision: sent.revision, title: "Must not overwrite" },
    staff,
  );
  await entered;
  const signed = await service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  release();
  await expect(edit).rejects.toMatchObject({ status: 409 });
  expect(await repo.get(sent.id)).toEqual(signed);
});

it("live autosaves do not create another reminder cycle; reminder email fields use the last good publication", async () => {
  const f = await setup();
  const sent = await f.service.send(f.draft.id, staff);
  f.service.clock = () => new Date(Date.now() + 4 * 86400000);
  await f.service.tick();
  let p = (await f.repo.get(sent.id))!;
  const reminders = p.jobs.filter((j) => j.payload.reminder_day);
  expect(reminders).toHaveLength(1);
  p = await f.service.edit(
    p.id,
    { revision: p.revision, title: "Published title" },
    staff,
  );
  p = await f.service.edit(
    p.id,
    {
      revision: p.revision,
      title: "Invalid staff title",
      content: p.content.filter((b) => b.type !== "pricing_table"),
    },
    staff,
  );
  await f.service.tick();
  p = (await f.repo.get(p.id))!;
  expect(p.jobs.filter((j) => j.payload.reminder_day)).toEqual(reminders);
  const { prepareEmail } = await import("../src/lib/email-templates");
  const email = await prepareEmail(f.repo, p, reminders[0]);
  expect(email.subject).toContain("Published title");
  expect(email.html).not.toContain("Invalid staff title");
});

it("manual reminders respect the last published expiry while invalid work has a different expiry", async () => {
  const { service, repo, draft } = await setup();
  const sent = await service.send(draft.id, staff);
  const { mutate } = await import("../src/lib/repository");
  const p = await mutate(repo, sent.id, (p) => {
    p.published_state!.valid_until = "2020-01-01T23:59:00.000Z";
    p.valid_until = null;
    p.live_blockers = ["Add a pricing table"];
  });
  await expect(
    proposalAction(repo, p.id, p.revision, "remind", staff),
  ).rejects.toThrow("expired");
});
