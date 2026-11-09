"use client";

import { useEffect, useRef, useState } from "react";
import { StaffAuthFrame } from "./staff-auth-frame";
import { Banner, Button, Field, post } from "./ui";

export function StaffResetForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [minutes, setMinutes] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [resendStatus, setResendStatus] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [minutes]);

  async function send(resend = false) {
    setBusy(true);
    setError(false);
    setResendStatus("");
    try {
      const result = await post<{ expires_in_minutes: number }>(
        "/api/auth/reset-password",
        { email },
      );
      setMinutes(result.expires_in_minutes);
      if (resend) setResendStatus("Reset link requested again.");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <StaffAuthFrame>
      <h1 ref={heading} tabIndex={-1}>
        {minutes ? "Check your email" : "Reset your password"}
      </h1>
      {error && (
        <Banner tone="danger" title="Couldn’t submit your request">
          Try again in a moment.
        </Banner>
      )}
      {minutes ? (
        <>
          <p className="account-reset-address">
            If an account exists for <strong>{email.trim()}</strong>, we’ve sent
            a link to reset your password. It expires in {minutes} minutes.
          </p>
          <div className="form">
            <Button className="action" variant="primary" onClick={onBack}>
              Back to sign in
            </Button>
            <button
              className="account-forgot account-reset-link"
              type="button"
              disabled={busy}
              onClick={() => void send(true)}
            >
              Didn’t get it? Send again
            </button>
          </div>
          <span className="sr-only" role="status">
            {resendStatus}
          </span>
        </>
      ) : (
        <>
          <p>
            Enter your work email and we’ll send you a link to reset your
            password.
          </p>
          <form
            className="form"
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Field label="Email address">
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                maxLength={254}
              />
            </Field>
            <Button
              type="submit"
              className="action"
              variant="primary"
              busy={busy}
            >
              Send reset link
            </Button>
            <button
              className="account-forgot account-reset-link"
              type="button"
              onClick={onBack}
            >
              Back to sign in
            </button>
          </form>
        </>
      )}
    </StaffAuthFrame>
  );
}
