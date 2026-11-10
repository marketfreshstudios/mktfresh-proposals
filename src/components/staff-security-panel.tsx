"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Laptop, Smartphone } from "lucide-react";
import { Banner, Button, Field, api, post } from "./ui";
import { Sheet, Skeleton } from "./foundation";
import { useStaffDates } from "./staff-account-context";
import type { StaffDevice } from "../lib/staff-security";

const path = "/api/account/security";

type Security = {
  two_step: boolean;
  backup_codes_remaining: number;
  password_changed_at: string | null;
  sessions: StaffDevice[];
};

function SecurityForm({
  children,
  label,
  onClose,
  submit,
  disabled,
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
  submit: (values: FormData) => Promise<void>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await submit(new FormData(event.currentTarget));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form staff-security-form" method="post" onSubmit={save}>
      {children}
      {error && <Banner title={error} tone="danger" />}
      <div className="staff-security-actions">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="submit"
          className="action"
          variant="primary"
          busy={busy}
          disabled={disabled}
        >
          {label}
        </Button>
      </div>
    </form>
  );
}

function PasswordDialog({
  close,
  changed,
}: {
  close: () => void;
  changed: () => void;
}) {
  return (
    <Sheet title="Change password" onClose={close}>
      <p>
        Your other devices will be signed out after you change your password.
      </p>
      <SecurityForm
        label="Change password"
        onClose={close}
        submit={async (values) => {
          const password = values.get("password");
          if (password !== values.get("confirm"))
            throw new Error("The new passwords don’t match.");
          await post(path + "/password", {
            current_password: values.get("current"),
            password,
          });
          changed();
        }}
      >
        <Field label="Current password">
          <input
            required
            type="password"
            name="current"
            autoComplete="current-password"
            maxLength={200}
          />
        </Field>
        <Field label="New password">
          <input
            required
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={200}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            required
            type="password"
            name="confirm"
            autoComplete="new-password"
            minLength={8}
            maxLength={200}
          />
        </Field>
      </SecurityForm>
    </Sheet>
  );
}

function BackupCodes({
  codes,
  children,
}: {
  codes: string[];
  children: ReactNode;
}) {
  const [message, setMessage] = useState("");
  const content = codes.join("\n");
  function download() {
    const url = URL.createObjectURL(
      new Blob([content + "\n"], { type: "text/plain" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "yeswell-backup-codes.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <p>
        Each code works once if you lose access to your authenticator. Store
        them somewhere safe.
      </p>
      <ul className="staff-backup-codes">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <div className="staff-security-actions staff-security-start">
        <Button onClick={download}>Download</Button>
        <Button
          onClick={() =>
            void navigator.clipboard.writeText(content).then(
              () => setMessage("Copied"),
              () =>
                setMessage("Couldn’t copy the codes. Download them instead."),
            )
          }
        >
          Copy
        </Button>
        <span role="status">{message}</span>
      </div>
      {children}
    </>
  );
}

function TwoStepDialog({
  mode,
  close,
  changed,
}: {
  mode: "start" | "disable" | "regenerate";
  close: () => void;
  changed: () => void;
}) {
  const [setup, setSetup] = useState<{ qr: string; secret: string }>();
  const [codes, setCodes] = useState<string[]>();
  const [stored, setStored] = useState(false);
  const [copied, setCopied] = useState("");
  const title = codes
    ? "Save your backup codes"
    : mode === "start"
      ? "Turn on two-step verification"
      : mode === "disable"
        ? "Turn off two-step verification"
        : "Regenerate backup codes";
  const endpoint = path + "/two-step";

  return (
    <Sheet key={title} title={title} onClose={close}>
      {codes ? (
        <BackupCodes codes={codes}>
          <SecurityForm
            key="codes"
            label={mode === "start" ? "Turn on" : "Done"}
            onClose={close}
            disabled={!stored}
            submit={async () => {
              if (!stored) return;
              if (mode === "start") await post(endpoint, { action: "enable" });
              changed();
            }}
          >
            <label className="staff-security-checkbox">
              <input
                type="checkbox"
                checked={stored}
                onChange={(e) => setStored(e.target.checked)}
              />
              I’ve saved these codes
            </label>
          </SecurityForm>
        </BackupCodes>
      ) : mode === "start" && !setup ? (
        <SecurityForm
          key="start"
          label="Continue"
          onClose={close}
          submit={async () =>
            setSetup(await post(endpoint, { action: "start" }))
          }
        >
          <p>
            Use an authenticator app such as 1Password, Google Authenticator, or
            Authy. Keep it handy to scan the code.
          </p>
        </SecurityForm>
      ) : (
        <SecurityForm
          key={mode + "-code"}
          label={
            setup ? "Verify" : mode === "disable" ? "Turn off" : "Regenerate"
          }
          onClose={close}
          submit={async (values) => {
            const result = await post<{ codes?: string[] }>(endpoint, {
              action: setup ? "prepare" : mode,
              code: values.get("code"),
            });
            if (result.codes) setCodes(result.codes);
            else changed();
          }}
        >
          {setup ? (
            <>
              <p>Scan this QR code with your authenticator app.</p>
              <div className="staff-totp-setup">
                <img
                  src={setup.qr}
                  width={144}
                  height={144}
                  alt="Authenticator setup QR code"
                />
                <div>
                  <p>Can’t scan? Enter this key:</p>
                  <code>{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
                  <Button
                    onClick={() =>
                      void navigator.clipboard.writeText(setup.secret).then(
                        () => setCopied("Copied"),
                        () => setCopied("Couldn’t copy the key."),
                      )
                    }
                  >
                    Copy key
                  </Button>
                  <span role="status">{copied}</span>
                </div>
              </div>
            </>
          ) : (
            <p>
              {mode === "regenerate"
                ? "New codes replace all of your existing backup codes."
                : "Your other devices will be signed out, and your backup codes will stop working."}
            </p>
          )}
          <Field
            label={
              setup
                ? "Enter the 6-digit code from the app"
                : "Authenticator or backup code"
            }
          >
            <input
              name="code"
              required
              maxLength={setup ? 6 : 40}
              pattern={setup ? "[0-9]{6}" : undefined}
              inputMode={setup ? "numeric" : "text"}
              autoComplete="one-time-code"
            />
          </Field>
        </SecurityForm>
      )}
    </Sheet>
  );
}

export function StaffSecurityPanel() {
  const [state, setState] = useState<Security>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<
    "password" | "start" | "disable" | "regenerate" | null
  >(null);
  const [signOut, setSignOut] = useState<StaffDevice | "others" | null>(null);
  const dates = useStaffDates();
  function lastActive(value: string) {
    const minutes = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(value)) / 60_000),
    );
    if (minutes >= 24 * 60)
      return dates.date(value) + " · " + dates.time(value);
    if (minutes < 1) return "Just now";
    return new Intl.RelativeTimeFormat("en-US").format(
      minutes >= 60 ? -Math.floor(minutes / 60) : -minutes,
      minutes >= 60 ? "hour" : "minute",
    );
  }
  async function load() {
    try {
      const security = await api<Security>(path);
      if (!Array.isArray(security.sessions))
        throw new Error("Sign in with your staff account to manage security.");
      setState(security);
      setError("");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const changed = (message: string) => {
    setDialog(null);
    setNotice(message);
    void load();
  };

  if (!state)
    return error ? (
      <Banner title="Security settings unavailable" tone="danger">
        {error}
      </Banner>
    ) : (
      <Skeleton label="Loading your security settings…" />
    );

  return (
    <div className="staff-security">
      {notice && <Banner title={notice} tone="success" />}
      {error && <Banner title={error} tone="danger" />}
      <div className="account-fact staff-security-row">
        <div>
          <strong>Password</strong>
          <p>
            {state.password_changed_at
              ? "Last changed " + dates.date(state.password_changed_at)
              : "Change the password you use to sign in."}
          </p>
        </div>
        <Button onClick={() => setDialog("password")}>Change password</Button>
      </div>
      <div className="account-fact staff-security-row">
        <div>
          <strong>Two-step verification</strong>{" "}
          <span className={`pill ${state.two_step ? "success" : "warning"}`}>
            {state.two_step ? "On" : "Off"}
          </span>
          <p>Use a code from your authenticator app when you sign in.</p>
          {state.two_step && (
            <p>{state.backup_codes_remaining} of 8 backup codes left</p>
          )}
        </div>
        <div className="staff-security-actions">
          {state.two_step && (
            <Button onClick={() => setDialog("regenerate")}>
              Regenerate backup codes
            </Button>
          )}
          <Button
            className={state.two_step ? undefined : "studio-primary"}
            onClick={() => setDialog(state.two_step ? "disable" : "start")}
          >
            {state.two_step ? "Turn off" : "Turn on"}
          </Button>
        </div>
      </div>
      <div className="staff-security-sessions">
        <div className="staff-security-row">
          <h2>Where you’re signed in</h2>
          <Button
            onClick={() => setSignOut("others")}
            disabled={state.sessions.every((device) => device.current)}
          >
            Sign out everywhere else
          </Button>
        </div>
        <ul>
          {state.sessions.map((device) => {
            const DeviceIcon = /iPhone|iPad|Android/.test(device.device)
              ? Smartphone
              : Laptop;
            return (
              <li className="staff-security-row" key={device.id}>
                <DeviceIcon size={20} aria-hidden="true" />
                <div className="staff-device-label">
                  <strong>{device.device}</strong>{" "}
                  {device.current && (
                    <span className="pill success">This device</span>
                  )}
                  <p>
                    {device.location && device.location + " · "}
                    {device.current ? "Now" : lastActive(device.last_active)}
                  </p>
                </div>
                {!device.current && (
                  <button
                    type="button"
                    className="account-text-action"
                    aria-label={`Sign out ${device.device}`}
                    onClick={() => setSignOut(device)}
                  >
                    Sign out
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {dialog === "password" && (
        <PasswordDialog
          close={() => setDialog(null)}
          changed={() =>
            changed("Password changed. Other devices were signed out.")
          }
        />
      )}
      {dialog && dialog !== "password" && (
        <TwoStepDialog
          mode={dialog}
          close={() => setDialog(null)}
          changed={() =>
            changed(
              dialog === "start"
                ? "Two-step verification is on."
                : dialog === "disable"
                  ? "Two-step verification is off."
                  : "Backup codes regenerated.",
            )
          }
        />
      )}
      {signOut && (
        <Sheet
          title={
            signOut === "others"
              ? "Sign out everywhere else?"
              : `Sign out ${signOut.device}?`
          }
          onClose={() => setSignOut(null)}
        >
          <SecurityForm
            label="Sign out"
            onClose={() => setSignOut(null)}
            submit={async () => {
              await post(
                path + "/sessions",
                signOut === "others"
                  ? { action: "others" }
                  : { action: "one", id: signOut.id },
              );
              setSignOut(null);
              changed("Signed out.");
            }}
          >
            <p>You’ll stay signed in on this device.</p>
          </SecurityForm>
        </Sheet>
      )}
    </div>
  );
}

type PendingEmail = { email: string; expires_at: string };
export function StaffEmailSettings({
  email,
  verifiedFrom,
}: {
  email: string;
  verifiedFrom: string | null;
}) {
  const [pending, setPending] = useState<PendingEmail | null>(null);
  const [dialog, setDialog] = useState<"change" | "sent" | null>(null);
  const [proposed, setProposed] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = path + "/email";
  const external =
    proposed.includes("@") &&
    verifiedFrom &&
    proposed.trim().split("@").at(-1)?.toLowerCase() !==
      verifiedFrom.split("@").at(-1)?.toLowerCase();

  async function load() {
    const result = await api<PendingEmail | null>(endpoint);
    setPending(result?.email ? result : null);
  }
  useEffect(() => {
    void load().catch(() => {});
  }, []);
  async function manage(action: "resend" | "cancel") {
    setBusy(true);
    setError("");
    try {
      setPending(await post(endpoint, { action }));
      if (action === "resend") setDialog("sent");
      else setDialog(null);
    } catch (error) {
      setError((error as Error).message);
      void load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {pending && (
        <div className="staff-email-pending">
          <Banner title="Email change pending">
            {Date.parse(pending.expires_at) <= Date.now() ? (
              <>
                The link for <strong>{pending.email}</strong> expired. Resend it
                to get a new link.
              </>
            ) : (
              <>
                Confirm the link we sent to <strong>{pending.email}</strong>.
              </>
            )}
          </Banner>
          <div className="staff-security-actions staff-security-start">
            <Button disabled={busy} onClick={() => void manage("resend")}>
              Resend
            </Button>
            <Button disabled={busy} onClick={() => void manage("cancel")}>
              Cancel change
            </Button>
          </div>
        </div>
      )}
      {error && !dialog && <Banner title={error} tone="danger" />}
      {!pending && (
        <Button
          onClick={() => {
            setError("");
            setProposed("");
            setDialog("change");
          }}
        >
          Change email
        </Button>
      )}
      {dialog === "change" && (
        <Sheet title="Change your email" onClose={() => setDialog(null)}>
          <p>
            We’ll send a link to the new address. Your email changes once you
            confirm it.
          </p>
          <SecurityForm
            label="Send confirmation"
            onClose={() => setDialog(null)}
            submit={async (values) => {
              try {
                setPending(
                  await post(endpoint, {
                    action: "request",
                    email: values.get("email"),
                    password: values.get("password"),
                  }),
                );
                setDialog("sent");
              } catch (error) {
                void load().catch(() => {});
                throw error;
              }
            }}
          >
            <p>
              Current email <strong>{email}</strong>
            </p>
            <Field label="New email">
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                maxLength={254}
                value={proposed}
                onChange={(event) => setProposed(event.target.value)}
              />
            </Field>
            {external && (
              <p className="muted">
                Proposals will be sent from {verifiedFrom} with replies going to{" "}
                {proposed.trim()}.
              </p>
            )}
            <Field label="Your password" hint="To confirm it’s you.">
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                maxLength={200}
                required
              />
            </Field>
          </SecurityForm>
        </Sheet>
      )}
      {dialog === "sent" && pending && (
        <Sheet title="Check your new inbox" onClose={() => setDialog(null)}>
          <p>
            We sent a confirmation link to <strong>{pending.email}</strong>. It
            works for 24 hours.
          </p>
          <p>
            Keep signing in with {email} until you confirm. We also emailed that
            address in case this wasn’t you.
          </p>
          {error && <Banner title={error} tone="danger" />}
          <div className="staff-security-actions">
            <Button disabled={busy} onClick={() => void manage("resend")}>
              Resend link
            </Button>
            <Button
              className="action"
              variant="primary"
              onClick={() => setDialog(null)}
            >
              Done
            </Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
