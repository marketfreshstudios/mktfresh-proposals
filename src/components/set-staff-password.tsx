"use client";
import { StaffAuthFrame } from "./staff-auth-frame";
import { useEffect, useState } from "react";
import { post, Field, Button, Banner, ApiError } from "./ui";
export function SetStaffPassword() {
  const [link, setLink] = useState<{ token_hash?: string; type?: string }>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false),
    [ready, setReady] = useState(false),
    [closed, setClosed] = useState<"expired" | "deactivated">();
  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.has("token_hash")) {
      setLink({
        token_hash: p.get("token_hash")!,
        type: p.get("type") ?? "invite",
      });
      history.replaceState(null, "", location.pathname + location.search);
    }
    setReady(true);
  }, []);
  if (closed)
    return (
      <StaffAuthFrame>
        <h1>{closed === "expired" ? "Link expired" : "Deactivated account"}</h1>
        <p>
          {closed === "expired"
            ? "This link is no longer valid. Ask your admin to resend it."
            : "Contact your workspace administrator if you need access again."}
        </p>
        <a className="btn" href="/login">
          Back to sign in
        </a>
      </StaffAuthFrame>
    );
  return (
    <StaffAuthFrame>
      <h1>
        {link.type === "invite" ? "Set your password" : "Choose a new password"}
      </h1>
      <p>
        {link.type === "invite"
          ? "Accept your invitation and choose a password to sign in."
          : "Choose a password to sign in to your Yeswell workspace."}
      </p>
      {error && (
        <Banner tone="danger" title="Password could not be set">
          {error}
        </Banner>
      )}
      <form
        className="stack"
        method="post"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (f.get("password") !== f.get("confirm")) {
            setError("The passwords do not match");
            return;
          }
          setError("");
          setBusy(true);
          try {
            await post("/api/auth/set-password", {
              ...link,
              password: f.get("password"),
            });
            location.href = "/";
          } catch (e) {
            if (e instanceof ApiError && e.status === 410) setClosed("expired");
            else if (
              e instanceof ApiError &&
              e.message.startsWith("Staff access deactivated")
            )
              setClosed("deactivated");
            else setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="New password">
          <input
            type={show ? "text" : "password"}
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={200}
          />
        </Field>
        <Field label="Type new password again">
          <input
            type={show ? "text" : "password"}
            name="confirm"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={200}
          />
        </Field>
        <Button onClick={() => setShow(!show)} aria-pressed={show}>
          {show ? "Hide passwords" : "Show passwords"}
        </Button>
        <p className="muted">
          Use at least 8 characters. Your workspace’s authentication password
          rules also apply.
        </p>
        <Button
          type="submit"
          variant="primary"
          className="action"
          busy={busy}
          disabled={!ready}
        >
          Save password & sign in
        </Button>
      </form>
      <p className="muted">Expired link? Ask your admin to resend.</p>
      <a href="/login">Back to sign in</a>
    </StaffAuthFrame>
  );
}
