"use client";
import { useEffect, useRef, useState } from "react";
import { StaffAuthFrame } from "./staff-auth-frame";
import { post, Field, Button, Banner, ApiError } from "./ui";

const TERMS = "https://yeswell.co/terms";
const PRIVACY = "https://yeswell.co/privacy";

function addressFromName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
}
type Availability =
  | { state: "idle" | "checking" }
  | { state: "available" }
  | { state: "invalid" }
  | { state: "taken"; suggestion?: string };

export function StartSignup({
  enabled,
  domain,
}: {
  enabled: boolean;
  domain: string;
}) {
  const [business, setBusiness] = useState(""),
    [slug, setSlug] = useState(""),
    [slugEdited, setSlugEdited] = useState(false),
    [availability, setAvailability] = useState<Availability>({
      state: "idle",
    }),
    [error, setError] = useState<{ message: string; signIn?: boolean }>(),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState<{ email: string; address: string }>();
  const latest = useRef("");
  useEffect(() => {
    if (!enabled || !slug) {
      setAvailability({ state: "idle" });
      return;
    }
    latest.current = slug;
    setAvailability({ state: "checking" });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/signup/address?slug=${encodeURIComponent(slug)}`,
        );
        const data = await res.json();
        if (latest.current !== slug) return;
        setAvailability(
          !data.valid
            ? { state: "invalid" }
            : data.available
              ? { state: "available" }
              : { state: "taken", suggestion: data.suggestion },
        );
      } catch {
        if (latest.current === slug) setAvailability({ state: "idle" });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [slug, enabled]);

  if (!enabled)
    return (
      <StaffAuthFrame workspace="Yeswell">
        <h1>Coming soon</h1>
        <p>Yeswell is opening to new businesses soon.</p>
        <a className="btn" href="https://yeswell.co">
          Get early access
        </a>
      </StaffAuthFrame>
    );

  if (sent)
    return (
      <StaffAuthFrame workspace="Yeswell">
        <h1>Check your email</h1>
        <p>
          We sent a link to <strong>{sent.email}</strong>. Open it to finish
          setting up <strong>{sent.address}</strong>.
        </p>
        <p className="muted">
          The link works for 1 hour. Wrong email?{" "}
          <button
            type="button"
            className="account-forgot"
            onClick={() => setSent(undefined)}
          >
            Start over
          </button>
        </p>
      </StaffAuthFrame>
    );

  const hint =
    availability.state === "available"
      ? { tone: "ok", text: "Available" }
      : availability.state === "invalid"
        ? { tone: "error", text: "Use 3 to 30 letters, numbers or hyphens." }
        : availability.state === "taken"
          ? { tone: "error", text: `${slug} is taken.` }
          : null;

  return (
    <StaffAuthFrame workspace="Yeswell">
      <h1>Start your free trial</h1>
      <p>14 days free. No card needed.</p>
      {error && (
        <Banner tone="danger" title="Couldn't start your trial">
          {error.message} {error.signIn && <a href="/login">Sign in</a>}
        </Banner>
      )}
      <form
        className="form signup-form"
        method="post"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError(undefined);
          try {
            setSent(
              await post("/api/signup", {
                business_name: f.get("business_name"),
                slug,
                first_name: f.get("first_name"),
                last_name: f.get("last_name"),
                email: f.get("email"),
                password: f.get("password"),
              }),
            );
          } catch (e) {
            const details = (e as ApiError).details as
              { code?: string; suggestion?: string } | undefined;
            if (details?.code === "address_taken")
              setAvailability({
                state: "taken",
                suggestion: details.suggestion,
              });
            else
              setError({
                message: (e as Error).message,
                signIn: details?.code === "email_has_workspace",
              });
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Business name">
          <input
            name="business_name"
            required
            maxLength={200}
            autoComplete="organization"
            value={business}
            onChange={(e) => {
              setBusiness(e.target.value);
              if (!slugEdited) setSlug(addressFromName(e.target.value));
            }}
          />
        </Field>
        <div className="field">
          <label className="field">
            <span>Your address</span>
            <span className="signup-address">
              <input
                name="slug"
                required
                maxLength={30}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby="signup-address-hint"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
                }}
              />
              <span className="signup-address-domain">.{domain}</span>
            </span>
          </label>
          <small
            id="signup-address-hint"
            className={`signup-address-hint ${hint?.tone ?? ""}`}
            aria-live="polite"
          >
            {hint?.text}
            {availability.state === "taken" && availability.suggestion && (
              <>
                {" "}
                <button
                  type="button"
                  className="account-forgot"
                  onClick={() => {
                    setSlugEdited(true);
                    setSlug(availability.suggestion!);
                  }}
                >
                  Use {availability.suggestion}
                </button>
              </>
            )}
          </small>
        </div>
        <div className="signup-names">
          <Field label="First name">
            <input
              name="first_name"
              required
              maxLength={100}
              autoComplete="given-name"
            />
          </Field>
          <Field label="Last name">
            <input
              name="last_name"
              required
              maxLength={100}
              autoComplete="family-name"
            />
          </Field>
        </div>
        <Field label="Work email">
          <input type="email" name="email" required autoComplete="email" />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input
            type="password"
            name="password"
            required
            minLength={8}
            maxLength={200}
            autoComplete="new-password"
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          className="action"
          busy={busy}
          disabled={
            availability.state === "taken" || availability.state === "invalid"
          }
        >
          Start free trial
        </Button>
        <p className="muted signup-legal">
          By starting a trial you agree to the <a href={TERMS}>Terms</a> and{" "}
          <a href={PRIVACY}>Privacy Policy</a>.
        </p>
      </form>
      <p className="muted">
        Already have a workspace? <a href="/login">Sign in</a>
      </p>
    </StaffAuthFrame>
  );
}

export function ConfirmSignup() {
  const [state, setState] = useState<"working" | "expired" | "missing">(
    "working",
  );
  const [message, setMessage] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get("token_hash");
    history.replaceState(null, "", location.pathname);
    if (!token) {
      setState("missing");
      return;
    }
    post("/api/signup/confirm", { token_hash: token })
      .then((result: { origin: string }) => {
        location.href =
          new URL(result.origin).host === location.host ? "/" : result.origin;
      })
      .catch((e) => {
        setMessage((e as Error).message);
        setState("expired");
      });
  }, []);
  return (
    <StaffAuthFrame workspace="Yeswell">
      {state === "working" ? (
        <>
          <h1>Setting up your workspace</h1>
          <p>One moment.</p>
        </>
      ) : (
        <>
          <h1>Link expired</h1>
          <p>
            {state === "missing"
              ? "This link is incomplete. Open the link from your email again."
              : message}
          </p>
          <a className="btn" href="/start">
            Start over
          </a>
        </>
      )}
    </StaffAuthFrame>
  );
}
