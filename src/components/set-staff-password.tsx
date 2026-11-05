"use client";
import { YeswellBrand } from "./yeswell-brand";
import { useEffect, useState } from "react";
import { post, Field, Button, Banner } from "./ui";
export function SetStaffPassword() {
  const [link, setLink] = useState<{ token_hash?: string; type?: string }>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.has("token_hash")) {
      setLink({
        token_hash: p.get("token_hash")!,
        type: p.get("type") ?? "invite",
      });
      history.replaceState(null, "", location.pathname + location.search);
    }
  }, []);
  return (
    <main className="login staff-foundation yeswell-auth">
      <div className="card stack">
        <YeswellBrand />
        <h1>Set your password</h1>
        <p>Choose a password to sign in to your Yeswell workspace.</p>
        {error && (
          <Banner tone="danger" title="Password could not be set">
            {error}
          </Banner>
        )}
        <form
          className="stack"
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
              setError((e as Error).message);
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
          <Button type="submit" variant="primary" busy={busy}>
            Save password & sign in
          </Button>
        </form>
        <p className="muted">Expired link? Ask your admin to resend.</p>
        <a href="/login">Back to sign in</a>
      </div>
    </main>
  );
}
