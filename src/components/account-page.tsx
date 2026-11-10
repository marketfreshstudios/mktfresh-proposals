"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  accountNotifications,
  accountSections,
  staffDateFormats,
  staffInitials,
  staffTimeZones,
  type StaffAccountPatch,
} from "../lib/staff-account-model";
import type { Data } from "./staff-app";
import type { WorkspaceSettings } from "../lib/workspace";
import { Select, Switch } from "./form-controls";
import { api, Banner, Button, Field, post } from "./ui";
import { Skeleton } from "./foundation";
import { useStaffAccount } from "./staff-account-context";
import { StaffThemeOptions } from "./studio-account";
import { StaffEmailSettings, StaffSecurityPanel } from "./staff-security-panel";
import { workspaceSecuritySender } from "../lib/email-identity";

type AccountSection = (typeof accountSections)[number][0];
type Signatory = NonNullable<WorkspaceSettings["company_signatory"]>;

export function AccountPage({
  id,
  profile,
  data,
  onSignout,
}: {
  id?: string;
  profile?: boolean;
  data: Data | null;
  onSignout: () => void;
}) {
  const section = accountSections.find(([value]) => value === (id ?? ""))?.[0];
  const label =
    accountSections.find(([value]) => value === section)?.[1] ??
    "Page not found";
  const account = useStaffAccount()?.account;
  const settings = data?.settings ?? data?.workspace_defaults;
  const home = !id && !profile;
  return (
    <div
      className={`staff-account-page${home ? " account-phone-index" : " account-phone-detail"}`}
    >
      <header className="account-page-header">
        {!home && (
          <a href="/account" className="account-phone-back">
            <ChevronLeft size={16} aria-hidden="true" /> Your account
          </a>
        )}
        <h1 className="t-page-title">
          <span className="account-wide-title">Your account</span>
          <span className="account-phone-title">
            {home ? "Your account" : label}
          </span>
        </h1>
        <p>Only you see these settings. Workspace settings are in Studio.</p>
      </header>
      <div className="account-page-layout">
        <nav aria-label="Account sections" className="account-section-nav">
          {accountSections.map(([value, text]) => (
            <a
              key={value}
              href={value ? `/account/${value}` : "/account"}
              aria-current={section === value ? "page" : undefined}
            >
              {text}
            </a>
          ))}
        </nav>
        {home && (
          <div className="account-phone-pages">
            <a
              className="card account-phone-profile"
              href="/account?view=profile"
            >
              <AccountAvatar
                name={data?.user.staff_name ?? ""}
                photo={account?.photo_url}
              />
              <span>
                <strong>{data?.user.staff_name ?? "Profile"}</strong>
                <small>{data?.user.staff_email ?? ""}</small>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </a>
            <nav
              className="card account-phone-list"
              aria-label="Your account pages"
            >
              {accountSections.slice(1).map(([value, text]) => (
                <a href={`/account/${value}`} key={value}>
                  <strong>{text}</strong>
                  {account && value === "notifications" && (
                    <small>
                      {
                        accountNotifications.filter(
                          ({ key }) =>
                            account.notifications[key] !== false &&
                            (key !== "staff_viewed" ||
                              settings?.engagement_notifications?.email ===
                                true),
                        ).length
                      }{" "}
                      on
                    </small>
                  )}
                  {account && value === "preferences" && (
                    <small>
                      {account.theme
                        ? account.theme[0].toUpperCase() +
                          account.theme.slice(1)
                        : "System"}{" "}
                      ·{" "}
                      {(account.timezone ?? settings?.timezone ?? "UTC")
                        .split("/")
                        .at(-1)
                        ?.replaceAll("_", " ")}
                    </small>
                  )}
                  <ChevronRight size={16} aria-hidden="true" />
                </a>
              ))}
            </nav>
            <div className="card account-phone-list">
              <button type="button" onClick={onSignout}>
                Sign out
              </button>
            </div>
          </div>
        )}
        <section className="card account-content" aria-label={label}>
          <h2>{label}</h2>
          {!data ? (
            <Skeleton label="Loading your account…" />
          ) : !account ? (
            <Banner title="Account settings unavailable" tone="danger">
              Reload to try again.
            </Banner>
          ) : section === "" ? (
            <Profile
              email={data.user.staff_email ?? ""}
              workspaceReplyTo={settings?.email_reply_to === "workspace"}
              verifiedFrom={settings ? workspaceSecuritySender(settings) : null}
            />
          ) : section === "notifications" ? (
            <Notifications
              viewedEnabled={settings?.engagement_notifications?.email === true}
            />
          ) : section === "signature" ? (
            <AccountSignature data={data} />
          ) : section === "preferences" ? (
            <Preferences workspaceZone={settings?.timezone ?? "UTC"} />
          ) : section === "security" ? (
            <StaffSecurityPanel />
          ) : (
            <p>This account section could not be found.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export function AccountAvatar({
  name,
  photo,
}: {
  name: string;
  photo?: string | null;
}) {
  return (
    <span className="account-avatar" aria-hidden="true">
      {photo ? <img src={photo} alt="" /> : staffInitials(name)}
    </span>
  );
}

function Profile({
  email,
  workspaceReplyTo,
  verifiedFrom,
}: {
  email: string;
  workspaceReplyTo: boolean;
  verifiedFrom: string | null;
}) {
  const { account, accept, saved } = useStaffAccount()!;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function photo(file?: File) {
    if (!file) return;
    setError("");
    if (
      !["image/jpeg", "image/png"].includes(file.type) ||
      file.size > 1000000
    ) {
      setError("Choose a JPG or PNG photo under 1 MB.");
      return;
    }
    setBusy(true);
    try {
      const image = await fileData(file);
      accept(await post("/api/account/photo", { image }));
      saved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setError("");
    setBusy(true);
    try {
      accept(await api("/api/account/photo", { method: "DELETE" }));
      saved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p>
        Your name and photo appear on proposals you send and in the activity
        log.
      </p>
      <div className="account-photo-row">
        <AccountAvatar
          name={`${account!.first_name} ${account!.last_name}`}
          photo={account!.photo_url}
        />
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          onChange={(e) => {
            void photo(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button onClick={() => input.current?.click()} busy={busy}>
          Upload photo
        </Button>
        {account!.photo_url && (
          <button
            className="account-text-action"
            type="button"
            disabled={busy}
            onClick={() => void remove()}
          >
            Remove
          </button>
        )}
        <small>Square JPG or PNG, at least 256px.</small>
      </div>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      <div className="account-profile-fields">
        <ProfileField
          label="First name"
          field="first_name"
          autocomplete="given-name"
        />
        <ProfileField
          label="Last name"
          field="last_name"
          autocomplete="family-name"
        />
        <ProfileField
          label="Job title"
          field="job_title"
          autocomplete="organization-title"
          hint="Shown under your name in proposal emails."
        />
        <ProfileField
          label="Phone"
          field="phone"
          autocomplete="tel"
          hint="Shown to clients on dead-end pages so they can reach you."
        />
      </div>
      <div className="account-fact account-email">
        <div>
          <strong>Email</strong>
          <p>
            {email} ·{" "}
            {workspaceReplyTo &&
            (!verifiedFrom ||
              email.split("@").at(-1)?.toLowerCase() ===
                verifiedFrom.split("@").at(-1)?.toLowerCase())
              ? "used to sign in. Proposal replies go to the workspace email."
              : "used to sign in and as the reply-to on proposals you send"}
          </p>
        </div>
        <StaffEmailSettings email={email} verifiedFrom={verifiedFrom} />
      </div>
    </>
  );
}
function fileData(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
}
function ProfileField({
  label,
  field,
  hint,
  autocomplete,
}: {
  label: string;
  field: "first_name" | "last_name" | "job_title" | "phone";
  hint?: string;
  autocomplete: string;
}) {
  const { account, save } = useStaffAccount()!;
  const current = account![field];
  const [value, setValue] = useState(current);
  const [error, setError] = useState("");
  useEffect(() => {
    setValue(current);
  }, [current]);
  return (
    <Field label={label} hint={error ? undefined : hint}>
      <input
        autoComplete={autocomplete}
        value={value}
        maxLength={field === "phone" ? 64 : field === "job_title" ? 120 : 100}
        type={field === "phone" ? "tel" : "text"}
        aria-invalid={!!error}
        aria-describedby={error ? `account-${field}-error` : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setError("");
        }}
        onBlur={() => {
          if (value.trim() === current) return;
          void save({ [field]: value.trim() }).catch((error: Error) =>
            setError(error.message),
          );
        }}
      />
      {error && (
        <span
          className="account-error"
          role="alert"
          id={`account-${field}-error`}
        >
          {error}
        </span>
      )}
    </Field>
  );
}

function Notifications({ viewedEnabled }: { viewedEnabled: boolean }) {
  const { account, save } = useStaffAccount()!;
  const [error, setError] = useState("");
  function change(patch: StaffAccountPatch, undo: StaffAccountPatch) {
    setError("");
    void save(patch, undo).catch((error: Error) => setError(error.message));
  }
  return (
    <>
      <p>Choose which optional emails reach you.</p>
      <div className="account-notifications">
        <div className="account-notify-heading" aria-hidden="true">
          Email
        </div>
        {["Proposals", "Signatures", "Billing"].map((group) => (
          <fieldset key={group}>
            <legend>{group}</legend>
            {accountNotifications
              .filter((event) => event.group === group)
              .map((event) => {
                const enabled = account!.notifications[event.key] !== false;
                const unavailable =
                  event.key === "staff_viewed" && !viewedEnabled;
                return (
                  <label className="account-option-row" key={event.key}>
                    <span>
                      <strong>{event.label}</strong>
                      {event.detail && <small>{event.detail}</small>}
                      {unavailable && (
                        <small>
                          First-view emails are off in Workspace settings.
                        </small>
                      )}
                    </span>
                    <Switch
                      aria-label={event.label}
                      checked={enabled && !unavailable}
                      disabled={unavailable}
                      onChange={(e) =>
                        change(
                          { notifications: { [event.key]: e.target.checked } },
                          { notifications: { [event.key]: enabled } },
                        )
                      }
                    />
                  </label>
                );
              })}
          </fieldset>
        ))}
        <label className="account-option-row account-own-filter">
          <span>
            <strong>Only for proposals I own</strong>
            <small>
              Limits optional emails you would otherwise receive to proposals
              you own.
            </small>
          </span>
          <Switch
            aria-label="Only for proposals I own"
            checked={account!.own_proposals_only}
            onChange={(e) =>
              change(
                { own_proposals_only: e.target.checked },
                { own_proposals_only: account!.own_proposals_only },
              )
            }
          />
        </label>
      </div>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function Preferences({ workspaceZone }: { workspaceZone: string }) {
  const { account, save } = useStaffAccount()!;
  const [error, setError] = useState("");
  function change(patch: StaffAccountPatch, undo: StaffAccountPatch) {
    setError("");
    void save(patch, undo).catch((error: Error) => setError(error.message));
  }
  const timezone = account!.timezone;
  const formatLabels = [
    "Nov 8, 2026",
    "November 8, 2026",
    "11/8/26",
    "2026-11-08",
  ];
  return (
    <>
      <div className="account-option-row">
        <span>
          <strong>Theme</strong>
          <small>System follows your device’s light or dark setting.</small>
        </span>
        <StaffThemeOptions />
      </div>
      <label className="account-option-row">
        <span>
          <strong>Time zone</strong>
          <small>
            Used for times you see in the app. Client-facing dates use the
            workspace time zone ({workspaceZone}).
          </small>
        </span>
        <Select
          aria-label="Time zone"
          value={timezone ?? ""}
          onChange={(e) =>
            change({ timezone: e.target.value || null }, { timezone })
          }
        >
          <option value="">Workspace time zone</option>
          {timezone && !staffTimeZones.includes(timezone) && (
            <option value={timezone}>{timezone}</option>
          )}
          {staffTimeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
      </label>
      <label className="account-option-row">
        <strong>Date format</strong>
        <Select
          aria-label="Date format"
          value={account!.date_format ?? "medium"}
          onChange={(e) =>
            change(
              {
                date_format: e.target.value as StaffAccountPatch["date_format"],
              },
              { date_format: account!.date_format ?? "medium" },
            )
          }
        >
          {staffDateFormats.map((format, index) => (
            <option key={format} value={format}>
              {formatLabels[index]}
            </option>
          ))}
        </Select>
      </label>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function CurrentSignature({ image }: { image: Signatory["image"] }) {
  return (
    <figure className="account-current-signature">
      <figcaption>Current company signature</figcaption>
      {image ? (
        <img
          className="account-stored-signature"
          src={image}
          alt="Stored company signature"
        />
      ) : (
        <p className="muted">No signature saved yet</p>
      )}
    </figure>
  );
}

function AccountSignature({ data }: { data: Data }) {
  const signature = data.settings?.company_signatory;
  const user = data.user.actor.slice(6);
  if (!signature?.user_id)
    return (
      <p>
        A super admin sets the company signatory in{" "}
        <a href="/studio/workspace?view=signatory">Workspace › Signatory</a>.
      </p>
    );
  if (signature.user_id !== user)
    return (
      <>
        <CurrentSignature image={signature.image} />
        <p>
          <strong>{signature.name}</strong> · Company signature
        </p>
        <p>
          {signature.authorized_user_ids.includes(user)
            ? `You countersign on ${signature.name}’s behalf. `
            : ""}
          The audit trail records who applies the company signature.
        </p>
        <p>
          A super admin can manage signatory settings in{" "}
          <a href="/studio/workspace?view=signatory">Workspace › Signatory</a>.
        </p>
      </>
    );
  return (
    <SignatureEditor
      signature={signature}
      version={data.signatory_version}
      workspace={data.settings!.company_name}
    />
  );
}

function SignatureEditor({
  signature,
  version,
  workspace,
}: {
  signature: Signatory;
  version: string;
  workspace: string;
}) {
  const { saved } = useStaffAccount()!;
  const [mode, setMode] = useState<"Type" | "Draw" | "Upload">("Type");
  const [typed, setTyped] = useState(signature.name);
  const [uploaded, setUploaded] = useState("");
  const [ink, setInk] = useState(false);
  const [current, setCurrent] = useState({ signature, version });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const active = useRef<number | null>(null);
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - rect.x) * 720) / rect.width,
      ((event.clientY - rect.y) * 220) / rect.height,
    ] as const;
  }
  function clear() {
    if (mode === "Type") setTyped("");
    if (mode === "Upload") setUploaded("");
    if (mode === "Draw") {
      setInk(false);
      canvas.current?.getContext("2d")?.clearRect(0, 0, 720, 220);
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      let image = uploaded;
      if (mode === "Type") {
        const buffer = document.createElement("canvas");
        buffer.width = 720;
        buffer.height = 220;
        const ctx = buffer.getContext("2d")!;
        ctx.fillStyle = "#1c1b18";
        ctx.font = "italic 54px Georgia, serif";
        ctx.textBaseline = "middle";
        ctx.fillText(typed.trim(), 24, 110, 672);
        image = buffer.toDataURL("image/png");
      } else if (mode === "Draw")
        image = canvas.current!.toDataURL("image/png");
      setCurrent(
        await post("/api/account/signature", {
          version: current.version,
          image,
        }),
      );
      saved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const methods = ["Type", "Draw", "Upload"] as const;
  const canSave =
    mode === "Type" ? !!typed.trim() : mode === "Draw" ? ink : !!uploaded;
  return (
    <>
      <p>
        You’re the company signatory. This signature goes on every countersigned
        proposal.
      </p>
      <div
        className="account-segment"
        role="group"
        aria-label="Signature method"
      >
        {methods.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="account-signature-pad">
        <button className="account-text-action" type="button" onClick={clear}>
          Clear
        </button>
        <canvas
          hidden={mode !== "Draw"}
          ref={canvas}
          width={720}
          height={220}
          aria-label="Draw company signature"
          onPointerDown={(event) => {
            active.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            const ctx = event.currentTarget.getContext("2d")!;
            ctx.strokeStyle = "#1c1b18";
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(...point(event));
          }}
          onPointerMove={(event) => {
            if (active.current !== event.pointerId) return;
            const ctx = event.currentTarget.getContext("2d")!;
            ctx.lineTo(...point(event));
            ctx.stroke();
            setInk(true);
          }}
          onPointerUp={() => {
            active.current = null;
          }}
          onPointerCancel={() => {
            active.current = null;
          }}
        />
        {mode === "Type" && (
          <input
            aria-label="Type company signature"
            value={typed}
            maxLength={200}
            onChange={(e) => setTyped(e.target.value)}
          />
        )}
        {mode === "Upload" && (
          <Field label="Upload signature (PNG, under 350 KB)">
            <input
              type="file"
              accept="image/png"
              onChange={(e) => {
                setError("");
                setUploaded("");
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.type !== "image/png" || file.size > 350000) {
                  setError("Choose a PNG under 350 KB.");
                  return;
                }
                void fileData(file).then(setUploaded, (error: Error) =>
                  setError(error.message),
                );
              }}
            />
          </Field>
        )}
      </div>
      {mode === "Draw" && (
        <p className="muted">Draw with your mouse, trackpad, or finger.</p>
      )}
      <p className="muted">
        Printed under it:{" "}
        <strong>
          {signature.name} · {signature.title ? `${signature.title}, ` : ""}
          {workspace}
        </strong>
        . Changing it only affects future signatures. Sealed PDFs keep the
        original signature.
      </p>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      <div className="account-signature-actions">
        <Button
          className="studio-primary"
          onClick={() => void submit()}
          disabled={!canSave}
          busy={busy}
        >
          Save signature
        </Button>
      </div>
      <CurrentSignature image={current.signature.image} />
    </>
  );
}
