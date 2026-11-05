import { afterEach, it, expect, vi } from "vitest";
import { teamFixture } from "./fixtures/team";
import { TeamWorkConflict } from "../src/lib/team";
import {
  saveEmailTemplate,
  plainBody,
  emailTemplates,
} from "../src/lib/email-templates";
import { staffRoleLabel, staffStatusLabel } from "../src/lib/team-model";
afterEach(() => vi.unstubAllEnvs());
it("Staff cannot invoke any management action; only their own name remains editable", async () => {
  const f = await teamFixture();
  for (const action of [
    "role",
    "password_set",
    "deactivate",
    "reactivate",
    "remove",
    "reset_sent",
    "invite_resent",
    "name",
  ])
    await expect(
      f.team.change(f.member, f.admin.actor.slice(6), {
        action,
        role: "member",
        password: "not-a-real-password",
      }),
    ).rejects.toMatchObject({ status: 403 });
  await expect(
    f.team.invite(f.member, { email: "new@example.test", display_name: "New" }),
  ).rejects.toMatchObject({ status: 403 });
  await f.team.change(f.member, f.member.actor.slice(6), {
    action: "name",
    display_name: "Updated",
  });
  expect((await f.store.get(f.member.actor.slice(6)))!.display_name).toBe(
    "Updated",
  );
  expect(f.store.history).toHaveLength(1);
});
it("invite and resend use the editable app template/provider, log redacted content, and never return credentials", async () => {
  vi.stubEnv("APP_URL", "https://app.example.test");
  const f = await teamFixture();
  await saveEmailTemplate(f.repo, f.admin, "team_invite", {
    subject: "Join {{workspace.name}}",
    body: plainBody("Welcome {{team.name}} as {{team.role}}"),
    button_label: "Choose password",
  });
  const response = await f.team.invite(f.admin, {
    email: "new@example.test",
    display_name: "Taylor Example",
  });
  expect(response).toEqual({ user_id: expect.any(String), invited: true });
  const m = await f.store.get(response.user_id);
  expect(m).toMatchObject({
    status: "invited",
    role: "member",
    invited_by: f.admin.actor.slice(6),
  });
  const mail = [...f.mailer.sent.values()][0] as any;
  expect(mail.subject).toBe("Join Example Studio");
  expect(mail.to).toBe("new@example.test");
  expect(mail.html).toContain("Choose password");
  expect(mail.text).toContain("Welcome Taylor Example as Staff");
  expect(mail.html).toContain("/set-password#token_hash=");
  const logs = await f.repo.entities<any>("email_log");
  expect(logs[0].snapshot.template_key).toBe("team_invite");
  expect(JSON.stringify(logs)).not.toContain(f.auth.links[0].token);
  expect(logs[0].snapshot.credential_redacted).toBe(true);
  await f.team.change(f.admin, response.user_id, { action: "invite_resent" });
  expect(f.mailer.sent.size).toBe(2);
  expect(f.auth.links[1].token).not.toBe(f.auth.links[0].token);
  expect(f.store.history.map((e) => e.action)).toEqual([
    "invite",
    "invite_resent",
  ]);
  await expect(
    saveEmailTemplate(f.repo, f.member, "team_invite", {
      subject: "No",
      body: plainBody("No"),
      button_label: "No",
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    (await emailTemplates(f.repo)).find((t) => t.key === "team_invite")!
      .subject,
  ).toBe("Join {{workspace.name}}");
});
it("password set activates invited users, uses only the admin API input, and keeps passwords out of every persisted/returned surface", async () => {
  vi.stubEnv("APP_URL", "https://app.example.test");
  const f = await teamFixture();
  const added = await f.team.invite(f.admin, {
      email: "new@example.test",
      display_name: "Taylor",
    }),
    password = "Private passphrase 927!";
  const result = await f.team.change(f.admin, added.user_id, {
    action: "password_set",
    password,
    choose_new_password: true,
  });
  expect(result).toEqual({ updated: true });
  expect(await f.store.get(added.user_id)).toMatchObject({
    status: "active",
    password_change_required: true,
    session_version: 1,
  });
  expect(
    JSON.stringify([
      f.store.members,
      f.store.history,
      [...f.mailer.sent],
      await f.repo.entities("email_log"),
      result,
    ]),
  ).not.toContain(password);
  await f.team.change(f.admin, added.user_id, {
    action: "password_set",
    password: "Another passphrase 42!",
    choose_new_password: false,
  });
  expect((await f.store.get(added.user_id))!.password_change_required).toBe(
    false,
  );
  await expect(
    f.team.change(f.admin, f.admin.actor.slice(6), {
      action: "password_set",
      password,
    }),
  ).rejects.toThrow("profile");
});
it("last Super admin and self guards preserve at least one active admin", async () => {
  const f = await teamFixture(),
    id = f.admin.actor.slice(6);
  await expect(
    f.team.change(f.admin, id, { action: "role", role: "member" }),
  ).rejects.toThrow("at least one");
  for (const action of ["deactivate", "remove"])
    await expect(f.team.change(f.admin, id, { action })).rejects.toThrow(
      "yourself",
    );
  await f.team.change(f.admin, f.member.actor.slice(6), {
    action: "role",
    role: "owner",
  });
  await f.team.change(f.admin, id, { action: "role", role: "member" });
  expect((await f.store.get(id))!.role).toBe("member");
  await expect(
    f.team.change(
      { ...f.admin, staff_role: "owner" },
      f.member.actor.slice(6),
      { action: "role", role: "member" },
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("deactivate/reactivate and removal preserve historical Auth users and record the actor, target and old → new", async () => {
  const f = await teamFixture(),
    id = f.member.actor.slice(6);
  await f.team.change(f.admin, id, { action: "deactivate" });
  expect(f.auth.banned.has(id)).toBe(true);
  expect((await f.store.get(id))!.status).toBe("deactivated");
  await f.team.change(f.admin, id, { action: "reactivate" });
  expect(f.auth.banned.has(id)).toBe(false);
  await f.team.change(f.admin, id, { action: "remove" });
  expect(await f.store.get(id)).toBeNull();
  expect(await f.auth.user(id)).toMatchObject({ id });
  expect(f.auth.banned.has(id)).toBe(true);
  expect(f.store.history.map((e) => e.action)).toEqual([
    "deactivate",
    "reactivate",
    "remove",
  ]);
  for (const event of f.store.history) {
    expect(event.actor).toBe(f.admin.actor);
    expect(event.target_user_id).toBe(id);
    expect(event.created_at).toBeTruthy();
  }
  expect(f.store.history[0].before!.status).toBe("active");
  expect(f.store.history[0].after!.status).toBe("deactivated");
});
it("unfinished sender work and unsent draft authors block removal with links; Deactivate remains available", async () => {
  const f = await teamFixture(),
    id = f.member.actor.slice(6),
    p = await f.repo.get(f.draft.id);
  p!.created_by = "staff:" + id;
  await f.repo.save(p!, p!.revision);
  try {
    await f.team.change(f.admin, id, { action: "remove" });
    throw new Error("should block");
  } catch (e) {
    expect(e).toBeInstanceOf(TeamWorkConflict);
    expect((e as TeamWorkConflict).proposals).toEqual([
      { id: f.draft.id, title: f.draft.title },
    ]);
    expect((e as Error).message).toContain("Deactivate");
  }
  await f.team.change(f.admin, id, { action: "deactivate" });
  expect((await f.store.get(id))!.status).toBe("deactivated");
});
it("password reset uses the provider/log and the dedicated editable reset template", async () => {
  vi.stubEnv("APP_URL", "https://app.example.test");
  const f = await teamFixture(),
    id = f.member.actor.slice(6);
  await saveEmailTemplate(f.repo, f.admin, "team_password_reset", {
    subject: "Password for {{team.name}}",
    body: plainBody("A new password for {{workspace.name}}."),
    button_label: "Reset password",
  });
  await f.team.change(f.admin, id, { action: "reset_sent" });
  const log = (await f.repo.entities<any>("email_log"))[0];
  expect(log.snapshot.subject).toBe("Password for Jamie Example");
  expect(log.snapshot.template_key).toBe("team_password_reset");
  expect(f.auth.links[0].type).toBe("recovery");
  expect(f.store.history[0].action).toBe("reset_sent");
});
it("a foreign workspace identity is rejected before any Auth link or user mutation", async () => {
  const f = await teamFixture(),
    id = crypto.randomUUID();
  f.auth.add(id, "elsewhere@example.test", "Other");
  f.store.members.set(id, {
    ...f.store.members.get(f.admin.actor.slice(6))!,
    user_id: id,
    workspace_id: crypto.randomUUID(),
  });
  await expect(
    f.team.invite(f.admin, {
      email: "elsewhere@example.test",
      display_name: "No",
    }),
  ).rejects.toThrow("already belongs");
  expect(f.auth.links).toHaveLength(0);
  expect(f.store.history).toHaveLength(0);
  expect(staffRoleLabel("owner")).toBe("Super admin");
  expect(staffRoleLabel("member")).toBe("Staff");
  expect(staffStatusLabel("invited")).toContain("not accepted");
});
