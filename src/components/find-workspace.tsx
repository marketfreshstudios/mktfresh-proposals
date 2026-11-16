"use client";
import { useEffect, useState } from "react";
import { StaffAuthFrame } from "./staff-auth-frame";
import { post, Field, Button, Banner } from "./ui";

/** Sign-in on a host that isn't a workspace's own address (app.yeswell.co):
 * offer the workspace used last in this browser, or email a sign-in link. */
export function FindWorkspace({
  remembered,
  unknown,
}: {
  /** Origin of the workspace this browser signed in to last. */
  remembered: string | null;
  /** The unclaimed address this page was opened on, if any. */
  unknown: string | null;
}) {
  // Never let the form submit natively before the handler is installed.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [sent, setSent] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const rememberedHost = remembered ? new URL(remembered).host : "";

  if (sent)
    return (
      <StaffAuthFrame workspace="Yeswell">
        <h1>Check your email</h1>
        <p>
          If <strong>{sent}</strong> belongs to a Yeswell workspace, we sent it
          a link to sign in.
        </p>
        <p className="muted">
          Wrong email?{" "}
          <button
            type="button"
            className="account-forgot"
            onClick={() => setSent("")}
          >
            Start over
          </button>
        </p>
      </StaffAuthFrame>
    );

  return (
    <StaffAuthFrame workspace="Yeswell">
      <h1>{remembered ? "Sign in" : "Find your workspace"}</h1>
      {remembered ? (
        <>
          <a className="btn primary action" href={`${remembered}/login`}>
            Continue to {rememberedHost}
          </a>
          <p className="muted">Or get a link to your workspace by email.</p>
        </>
      ) : (
        <p>
          {unknown ? `There's no workspace at ${unknown}. ` : ""}
          Enter your email and we'll send you a link to your workspace.
        </p>
      )}
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
          variant={remembered ? "secondary" : "primary"}
          className={remembered ? "" : "action"}
          busy={busy}
          disabled={!ready}
        >
          Email me my link
        </Button>
      </form>
      <p className="muted">
        New to Yeswell? <a href="/start">Start a free trial</a>
      </p>
    </StaffAuthFrame>
  );
}
