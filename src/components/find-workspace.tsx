"use client";
import { useEffect, useState } from "react";
import { StaffAuthFrame } from "./staff-auth-frame";
import { post, Field, Button, Banner } from "./ui";

/** From the sign-in on app.yeswell.co: email the person a link to their
 * workspace's own address. */
export function FindWorkspace({ onBack }: { onBack: () => void }) {
  // Never let the form submit natively before the handler is installed.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [sent, setSent] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  if (sent)
    return (
      <StaffAuthFrame workspace="Yeswell">
        <h1>Check your email</h1>
        <p>
          If <strong>{sent}</strong> belongs to a Yeswell workspace, we sent it
          a link to sign in.
        </p>
        <p className="muted">
          <button type="button" className="account-forgot" onClick={onBack}>
            Back to sign in
          </button>
        </p>
      </StaffAuthFrame>
    );

  return (
    <StaffAuthFrame workspace="Yeswell">
      <h1>Find your workspace</h1>
      <p>Enter your email and we'll send you a link to your workspace.</p>
      {error && (
        <Banner tone="danger" title="Couldn't send the link">
          {error}
        </Banner>
      )}
      <form
        className="form"
        method="post"
        onSubmit={async (e) => {
          e.preventDefault();
          const email = String(
            new FormData(e.currentTarget).get("email") ?? "",
          ).trim();
          setBusy(true);
          setError("");
          try {
            await post("/api/auth/find-workspace", { email });
            setSent(email);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Work email">
          <input type="email" name="email" required autoComplete="email" />
        </Field>
        <Button
          type="submit"
          variant="primary"
          className="action"
          busy={busy}
          disabled={!ready}
        >
          Email me my link
        </Button>
      </form>
      <p className="muted">
        <button type="button" className="account-forgot" onClick={onBack}>
          Back to sign in
        </button>
      </p>
    </StaffAuthFrame>
  );
}

/** /login/continue on a workspace's address: finishes a sign-in started on
 * app.yeswell.co. The one-time pass arrives in the address fragment. */
export function SignInContinue() {
  const [failed, setFailed] = useState("");
  useEffect(() => {
    const pass = decodeURIComponent(location.hash.slice(1));
    // Drop the pass from the address bar and history right away.
    history.replaceState(null, "", location.pathname);
    if (!pass) {
      setFailed("This sign-in expired or was already used.");
      return;
    }
    post<{ next: string }>("/api/auth/handoff", { pass })
      .then((r) => location.replace(r.next))
      .catch((e) =>
        setFailed(
          (e as Error).message || "This sign-in expired or was already used.",
        ),
      );
  }, []);
  return (
    <StaffAuthFrame>
      {failed ? (
        <>
          <h1>Sign in again</h1>
          <p>{failed}</p>
          <a className="btn primary action" href="/login">
            Sign in
          </a>
        </>
      ) : (
        <>
          <h1>Signing you in</h1>
          <p className="muted" role="status">
            Opening your workspace.
          </p>
        </>
      )}
    </StaffAuthFrame>
  );
}
