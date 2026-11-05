"use client";
import { unfinishedAssignment } from "../lib/proposal-owner";
import { DialogActions } from "./dialog-actions";
import { ReassignDialog } from "./reassign-proposal";
import { useEffect, useState } from "react";
import type { Data } from "./staff-app";
import { ApiError, api, post, Button, Field, Banner, date } from "./ui";
import { Sheet } from "./foundation";
import {
  staffRoleLabel,
  staffStatusLabel,
  type TeamPerson,
  type TeamAudit,
} from "../lib/team-model";
const actionLabels: Record<string, string> = {
  reassign: "Reassign their proposals…",
  name: "Edit name",
  role: "Change role",
  password_set: "Set password",
  invite_resent: "Resend invite",
  reset_sent: "Send password reset",
  deactivate: "Deactivate",
  reactivate: "Reactivate",
  remove: "Remove from workspace",
};
type Dialog = { person?: TeamPerson; action: string; anchor?: HTMLElement };
export function TeamStudio({
  data,
  run,
  embedded = false,
}: {
  data: Data;
  embedded?: boolean;
  run: (fn: () => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const [people, setPeople] = useState<TeamPerson[]>([]),
    [recent, setRecent] = useState<TeamAudit[]>([]),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [work, setWork] = useState<{ id: string; title: string }[]>([]);
  const [reassign, setReassign] = useState<TeamPerson | null>(null);
  const Heading = embedded ? "h3" : "h2";
  const owner = data.user.staff_role === "owner",
    self = data.user.actor.slice(6);
  const fallback = () =>
    data.staff.map(
      (m) =>
        ({
          ...m,
          workspace_id: data.user.workspace_id!,
          role: m.role === "owner" ? "owner" : "member",
          status: "active",
          last_sign_in_at: null,
        }) as TeamPerson,
    );
  async function load() {
    try {
      const result = await api("/api/team");
      setPeople(Array.isArray(result.members) ? result.members : fallback());
      setRecent(Array.isArray(result.recent) ? result.recent : []);
    } catch (e) {
      setError((e as Error).message);
      setPeople(fallback());
    }
  }
  useEffect(() => {
    void load();
  }, [data.staff]);
  async function save(path: string, input: unknown, message: string) {
    setError("");
    setWork([]);
    setBusy(true);
    try {
      await post(path, input);
      setDialog(null);
      await load();
      await run(async () => {}, message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      if (
        e instanceof ApiError &&
        Array.isArray(e.details?.unfinished_proposals)
      )
        setWork(
          e.details.unfinished_proposals as { id: string; title: string }[],
        );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const me =
    people.find((m) => m.user_id === self) ??
    fallback().find((m) => m.user_id === self);
  return (
    <div className="team-studio stack">
      {!embedded && (
        <title>{`Team · ${data.settings?.company_name ?? "Workspace"}`}</title>
      )}
      <header className="team-heading">
        <p className="muted">
          Super admins manage Studio, billing and the team. Staff draft, edit,
          send and countersign.
        </p>
        {owner && (
          <Button
            variant="primary"
            onClick={() => {
              setError("");
              setDialog({ action: "invite" });
            }}
          >
            Invite user
          </Button>
        )}
      </header>
      {error && !dialog && (
        <Banner tone="danger" title="Team change could not be completed">
          {error}
        </Banner>
      )}
      <div className="team-table" role="table" aria-label="Workspace team">
        <div className="team-table-head" role="row">
          <span role="columnheader">Name & email</span>
          <span role="columnheader">Role</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Last sign-in</span>
          <span role="columnheader">
            <span className="sr-only">Actions</span>
          </span>
        </div>
        {people.map((person) => (
          <div
            role="row"
            className={`team-person ${person.status === "deactivated" ? "team-person-inactive" : ""}`}
            key={person.user_id}
          >
            <div role="cell">
              <span className="avatar" aria-hidden="true">
                {person.display_name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <strong>{person.display_name}</strong>
              <small>{person.email}</small>
            </div>
            <div role="cell">
              <span className="team-mobile-label">Role</span>
              <select
                aria-label={`Role for ${person.display_name}`}
                value={person.role}
                disabled={
                  !owner ||
                  (person.user_id === self &&
                    people.filter(
                      (p) => p.role === "owner" && p.status === "active",
                    ).length <= 1)
                }
                onChange={(e) =>
                  void save(
                    `/api/team/${person.user_id}`,
                    { action: "role", role: e.target.value },
                    "Role changed",
                  )
                }
              >
                <option value="owner">Super admin</option>
                <option value="member">Staff</option>
              </select>
            </div>
            <div role="cell">
              <span className="team-mobile-label">Status</span>
              <span className={`team-status team-status-${person.status}`}>
                {person.user_id === self ? (
                  "You"
                ) : person.status === "invited" && person.invited_at ? (
                  <>
                    <span>Invite sent {date(person.invited_at)}</span>
                    <small>Not accepted yet</small>
                  </>
                ) : (
                  staffStatusLabel(person.status)
                )}
              </span>
            </div>
            <div role="cell">
              <span className="team-mobile-label">Last sign-in</span>
              {person.last_sign_in_at ? (
                <time dateTime={person.last_sign_in_at}>
                  {new Date(person.last_sign_in_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              ) : (
                "Never"
              )}
            </div>
            <div role="cell">
              {owner && (
                <Button
                  aria-label={`Actions for ${person.display_name}`}
                  onClick={(e) => {
                    setError("");
                    setDialog({
                      person,
                      action: "menu",
                      anchor: e.currentTarget,
                    });
                  }}
                >
                  ⋯
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {me && (
        <section className="team-profile stack">
          <Heading>Your profile</Heading>
          <form
            className="team-profile-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await save(
                `/api/team/${self}`,
                { action: "name", display_name: f.get("display_name") },
                "Display name saved",
              );
            }}
          >
            <Field label={`Display name for ${me.email}`}>
              <input
                name="display_name"
                key={me.display_name}
                defaultValue={me.display_name}
                required
                maxLength={200}
              />
            </Field>
            <Button type="submit" busy={busy}>
              Save name
            </Button>
            <Button
              onClick={() => {
                setError("");
                setDialog({ action: "own_password", person: me });
              }}
            >
              Change your password
            </Button>
          </form>
        </section>
      )}
      <p className="team-connections-note">
        AI assistants like Claude are managed in{" "}
        <a href="/studio/connections?view=assistants">Connections</a>, not here.
      </p>
      <a href="/studio/activity?view=team">Recent changes · Team activity</a>
      {reassign && (
        <ReassignDialog
          from={reassign}
          onClose={() => setReassign(null)}
          onChanged={async () => {
            setDialog(null);
            setWork([]);
            setError("");
            await load();
            await run(
              async () => {},
              "Proposals reassigned. You can now remove this person when no unfinished work remains.",
            );
          }}
        />
      )}
      {dialog && (
        <Sheet
          title={
            dialog.action === "menu"
              ? `${dialog.person!.display_name} · actions`
              : dialog.action === "invite"
                ? "Invite user"
                : dialog.action === "password_set"
                  ? `Set password for ${dialog.person!.display_name}`
                  : dialog.action === "own_password"
                    ? "Change your password"
                    : dialog.action === "name"
                      ? "Edit name"
                      : dialog.action === "role"
                        ? "Change role"
                        : `${dialog.action === "remove" ? "Remove" : dialog.action === "deactivate" ? "Deactivate" : dialog.action === "reactivate" ? "Reactivate" : dialog.action === "invite_resent" ? "Resend invite" : "Send password reset"} ${dialog.person!.display_name}`
          }
          menu={dialog.action === "menu"}
          anchor={dialog.anchor}
          onClose={() => {
            if (!busy) {
              setDialog(null);
              setError("");
            }
          }}
        >
          {error && (
            <Banner tone="danger" title="Unable to complete this change">
              {error}
              {work.length > 0 && (
                <ul>
                  {work.map((p) => (
                    <li key={p.id}>
                      <a
                        href={`/proposals/${p.id}`}
                        target="_blank"
                        rel="noopener"
                      >
                        {p.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {work.length > 0 && dialog.person && (
                <DialogActions>
                  <Button
                    onClick={() => {
                      setReassign(dialog.person!);
                      setDialog(null);
                    }}
                  >
                    Reassign their proposals…
                  </Button>
                  <Button
                    onClick={() => {
                      setError("");
                      setWork([]);
                      setDialog({ ...dialog, action: "deactivate" });
                    }}
                  >
                    Deactivate instead
                  </Button>
                </DialogActions>
              )}
            </Banner>
          )}
          {dialog.action === "menu" ? (
            <div className="action-menu">
              {[
                "reassign",
                "name",
                "role",
                ...(dialog.person!.user_id !== self ? ["password_set"] : []),
                ...(dialog.person!.status === "invited"
                  ? ["invite_resent"]
                  : []),
                ...(dialog.person!.user_id !== self ? ["reset_sent"] : []),
                dialog.person!.status === "deactivated"
                  ? "reactivate"
                  : "deactivate",
                "remove",
              ].map((action) => (
                <button
                  type="button"
                  className="btn"
                  key={action}
                  aria-label={actionLabels[action]}
                  disabled={
                    ["deactivate", "remove"].includes(action) &&
                    (dialog.person!.user_id === self ||
                      (action === "remove" &&
                        data.proposals.some((p) =>
                          unfinishedAssignment(p, dialog.person!.user_id),
                        )))
                  }
                  title={
                    ["deactivate", "remove"].includes(action) &&
                    dialog.person!.user_id === self
                      ? "You cannot deactivate or remove yourself"
                      : action === "remove" &&
                          data.proposals.some((p) =>
                            unfinishedAssignment(p, dialog.person!.user_id),
                          )
                        ? "Reassign proposals first"
                        : undefined
                  }
                  onClick={() => {
                    if (action === "reassign") {
                      setReassign(dialog.person!);
                      setDialog(null);
                    } else setDialog({ ...dialog, action });
                  }}
                >
                  {actionLabels[action]}
                  {action === "remove" &&
                    data.proposals.some((p) =>
                      unfinishedAssignment(p, dialog.person!.user_id),
                    ) && <small>Reassign proposals first</small>}
                  {action === "reassign" && (
                    <small>
                      {
                        data.proposals.filter((p) =>
                          unfinishedAssignment(p, dialog.person!.user_id),
                        ).length
                      }{" "}
                      open proposals
                    </small>
                  )}
                  {action === "deactivate" && (
                    <small>Blocks sign-in. History is kept.</small>
                  )}
                </button>
              ))}
              {dialog.person!.user_id !== self &&
                data.proposals.some((p) =>
                  unfinishedAssignment(p, dialog.person!.user_id),
                ) && (
                  <div className="team-blocked-work">
                    <p>
                      Reassign proposals first. Deactivate is also available;
                      history is kept.
                    </p>
                    <ul>
                      {data.proposals
                        .filter((p) =>
                          unfinishedAssignment(p, dialog.person!.user_id),
                        )
                        .map((p) => (
                          <li key={p.id}>
                            <a href={`/proposals/${p.id}`}>{p.title}</a>
                          </li>
                        ))}
                    </ul>
                    <Button
                      onClick={() =>
                        setDialog({ ...dialog, action: "deactivate" })
                      }
                    >
                      Deactivate instead
                    </Button>
                  </div>
                )}
            </div>
          ) : (
            <TeamForm
              key={dialog.action}
              dialog={dialog}
              busy={busy}
              onCancel={() => setDialog(null)}
              onSubmit={async (input) => {
                const own = dialog.action === "own_password";
                if (own) {
                  setBusy(true);
                  setError("");
                  try {
                    await post("/api/auth/set-password", input);
                    setDialog(null);
                    await load();
                    await run(async () => {}, "Your password was changed");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                  return;
                }
                await save(
                  dialog.action === "invite"
                    ? "/api/team/invite"
                    : `/api/team/${dialog.person!.user_id}`,
                  input,
                  dialog.action === "invite"
                    ? "Invitation sent"
                    : dialog.action === "password_set"
                      ? "Password set. Previous sessions were signed out."
                      : "Team updated",
                );
              }}
            />
          )}
        </Sheet>
      )}
    </div>
  );
}
function TeamForm({
  dialog,
  busy,
  onSubmit,
  onCancel,
}: {
  onCancel: () => void;
  dialog: Dialog;
  busy: boolean;
  onSubmit: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [show, setShow] = useState(false),
    [validation, setValidation] = useState("");
  const action = dialog.action,
    person = dialog.person;
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const input: Record<string, unknown> = { action };
        if (action === "invite") {
          delete input.action;
          input.email = f.get("email");
          input.display_name = f.get("display_name");
          input.role = f.get("role");
        }
        if (action === "name") input.display_name = f.get("display_name");
        if (action === "role") input.role = f.get("role");
        if (action === "password_set" || action === "own_password") {
          if (f.get("password") !== f.get("confirm")) {
            setValidation("The passwords do not match");
            return;
          }
          input.password = f.get("password");
          if (action === "password_set")
            input.choose_new_password = f.get("choose") === "on";
          else {
            delete input.action;
            input.current_password = f.get("current_password");
          }
        }
        setValidation("");
        await onSubmit(input);
      }}
    >
      {validation && <p role="alert">{validation}</p>}
      {action === "invite" && (
        <Field label="Email">
          <input name="email" type="email" autoComplete="off" required />
        </Field>
      )}
      {["invite", "name"].includes(action) && (
        <Field label="Display name">
          <input
            name="display_name"
            defaultValue={person?.display_name ?? ""}
            required
            maxLength={200}
          />
        </Field>
      )}
      {["invite", "role"].includes(action) && (
        <Field label="Role">
          <select name="role" defaultValue={person?.role ?? "member"}>
            <option value="member">Staff</option>
            <option value="owner">Super admin</option>
          </select>
        </Field>
      )}
      {action === "own_password" && (
        <Field label="Current password">
          <input
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
      )}
      {["password_set", "own_password"].includes(action) && (
        <>
          <Field label="New password">
            <input
              name="password"
              type={show ? "text" : "password"}
              required
              minLength={8}
              maxLength={200}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Type new password again">
            <input
              name="confirm"
              type={show ? "text" : "password"}
              required
              minLength={8}
              maxLength={200}
              autoComplete="new-password"
            />
          </Field>
          <Button aria-pressed={show} onClick={() => setShow(!show)}>
            {show ? "Hide passwords" : "Show passwords"}
          </Button>
          <p className="muted">
            Use at least 8 characters. Your workspace’s authentication password
            rules also apply.
          </p>
          {action === "password_set" && (
            <label className="check-row">
              <input name="choose" type="checkbox" defaultChecked />
              Ask them to choose a new password at next sign-in
            </label>
          )}
          <p className="muted">
            Existing sessions will be signed out. The password is never emailed
            or recorded.
          </p>
        </>
      )}
      {action === "remove" && (
        <p>
          Remove <strong>{person!.display_name}</strong> ({person!.email}) from
          this workspace? Their past actions and signatures stay intact.
        </p>
      )}
      {action === "deactivate" && (
        <p>
          Deactivate <strong>{person!.display_name}</strong>? Their sign-in,
          existing sessions and assistant access will stop working.
        </p>
      )}
      {["reset_sent", "invite_resent"].includes(action) && (
        <p>
          Send{" "}
          {action === "invite_resent" ? "a new invitation" : "a password reset"}{" "}
          to {person!.email}?
        </p>
      )}
      {action === "reactivate" && (
        <p>
          Restore workspace access for {person!.display_name}? They will need to
          sign in again.
        </p>
      )}
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={
            ["remove", "deactivate"].includes(action) ? "danger" : "primary"
          }
          busy={busy}
        >
          {action === "invite"
            ? "Send invite"
            : action === "password_set"
              ? "Set password"
              : action === "own_password"
                ? "Change password"
                : action === "remove"
                  ? "Remove from workspace"
                  : action === "reset_sent"
                    ? "Send password reset"
                    : action === "invite_resent"
                      ? "Resend invite"
                      : "Save changes"}
        </Button>
      </DialogActions>
    </form>
  );
}
function auditText(e: TeamAudit) {
  const by = e.actor_name;
  switch (e.action) {
    case "password_set":
      return `Password set by ${by} for ${e.target_name}`;
    case "password_changed":
      return `${e.target_name} changed their password`;
    case "name":
      return `${by} changed ${e.before?.display_name} → ${e.after?.display_name}`;
    case "role":
      return `${by} changed ${e.target_name}: ${staffRoleLabel(String(e.before?.role))} → ${staffRoleLabel(String(e.after?.role))}`;
    default:
      return `${by}: ${({ invite: "Invited", invite_resent: "Resent invitation to", reset_sent: "Sent password reset to", deactivate: "Deactivated", reactivate: "Reactivated", remove: "Removed from workspace:" } as Record<string, string>)[e.action] ?? "Updated"} ${e.target_name}`;
  }
}
