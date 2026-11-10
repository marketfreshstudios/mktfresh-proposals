"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, LogOut, ShieldCheck } from "lucide-react";
import { StaffAuthFrame } from "./staff-auth-frame";
import { api, Banner, Button, Field, post } from "./ui";

export function nextStaffPage() {
  const next = new URL(location.href).searchParams.get("next");
  if (!next?.startsWith("/")) return "/";
  try {
    const url = new URL(next, location.origin);
    return url.origin === location.origin
      ? url.pathname + url.search + url.hash
      : "/";
  } catch {
    return "/";
  }
}

export function TwoStepSignIn({
  done,
}: {
  done: (passwordChange?: boolean) => void;
}) {
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <StaffAuthFrame>
      <ShieldCheck className="staff-auth-state-icon" aria-hidden="true" />
      <h1>Verify your sign-in</h1>
      <p>
        {backup
          ? "Enter one of your saved backup codes."
          : "Enter the 6-digit code from your authenticator app."}
      </p>
      {error && <Banner tone="danger" title={error} />}
      <form
        className="form"
        method="post"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            const code = new FormData(event.currentTarget).get("code");
            const result = await post<{ password_change_required?: boolean }>(
              "/api/auth/two-step",
              { code },
            );
            done(result.password_change_required);
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={backup ? "Backup code" : "Authenticator code"}>
          <input
            key={String(backup)}
            name="code"
            required
            inputMode={backup ? "text" : "numeric"}
            pattern={backup ? undefined : "[0-9]{6}"}
            maxLength={backup ? 40 : 6}
            autoComplete="one-time-code"
          />
        </Field>
        <Button type="submit" variant="primary" className="action" busy={busy}>
          Verify
        </Button>
        <button
          type="button"
          className="account-forgot"
          onClick={() => {
            setError("");
            setBackup(!backup);
          }}
        >
          {backup ? "Use your authenticator instead" : "Use a backup code"}
        </button>
        <button
          type="button"
          className="account-forgot"
          onClick={async () => {
            try {
              await post("/api/auth/logout");
            } finally {
              location.href = "/login";
            }
          }}
        >
          Back to sign in
        </button>
      </form>
    </StaffAuthFrame>
  );
}

export function StaffAccessState({
  state,
  back,
}: {
  state: "paused" | "removed";
  back: () => void;
}) {
  const [details, setDetails] = useState<{
    state: string;
    workspace?: string;
    at?: string;
    timezone?: string;
    admin?: { name?: string; email: string };
  } | null>(null);
  useEffect(() => {
    void api<typeof details>("/api/auth/account-state")
      .then(setDetails)
      .catch(() => {});
  }, []);
  const known = details?.state === state ? details : null;
  const date = known?.at
    ? new Date(known.at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: known.timezone,
      })
    : null;
  return (
    <StaffAuthFrame workspace={known?.workspace}>
      <CircleAlert className="staff-auth-state-icon" aria-hidden="true" />
      <h1>
        {state === "paused"
          ? "Your account is paused"
          : "You no longer have access"}
      </h1>
      <p>
        {state === "paused"
          ? `A super admin paused your access${date ? ` on ${date}` : ""}. Your proposals and history are kept. Ask your workspace administrator to reactivate you.`
          : `You were removed from ${known?.workspace ?? "the workspace"}${date ? ` on ${date}` : ""}. If you belong to another workspace, sign in with that email.`}
      </p>
      {known?.admin && (
        <div className="staff-auth-contact">
          <strong>{known.admin.name || "Workspace administrator"}</strong>
          <a href={`mailto:${known.admin.email}`}>{known.admin.email}</a>
        </div>
      )}
      <Button onClick={back}>Back to sign in</Button>
    </StaffAuthFrame>
  );
}

export function SignedOutHeading() {
  return (
    <>
      <LogOut className="staff-auth-state-icon" aria-hidden="true" />
      <h1>You were signed out</h1>
      <p>
        Your session ended or was signed out from another device. Sign in again
        to continue.
      </p>
    </>
  );
}

export function ConfirmStaffEmail() {
  const [token, setToken] = useState<string | null>();
  const captured = useRef(false);
  const [changed, setChanged] = useState<{
    email: string;
    signed_in: boolean;
  }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    setToken(new URLSearchParams(location.hash.slice(1)).get("token"));
    history.replaceState(null, "", location.pathname);
  }, []);
  return (
    <StaffAuthFrame>
      <h1>{changed ? "Email changed" : "Confirm your new email"}</h1>
      {changed ? (
        <>
          <p>
            You now sign in with <strong>{changed.email}</strong>.
          </p>
          <p>
            Your other devices were signed out. Proposals you already sent keep
            their original reply-to address.
          </p>
          <a
            className="btn primary action"
            href={changed.signed_in ? "/account" : "/login"}
          >
            {changed.signed_in ? "Done" : "Sign in"}
          </a>
        </>
      ) : (
        <>
          <p>
            Confirm this address to change the email you use to sign in to
            Yeswell.
          </p>
          {error && <Banner tone="danger" title={error} />}
          {token === null && (
            <Banner
              tone="danger"
              title="This confirmation link is incomplete."
            />
          )}
          {token && (
            <Button
              variant="primary"
              className="action"
              busy={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setChanged(await post("/api/auth/confirm-email", { token }));
                  setToken(null);
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirm email
            </Button>
          )}
          <a className="account-forgot" href="/login">
            Back to sign in
          </a>
        </>
      )}
    </StaffAuthFrame>
  );
}
