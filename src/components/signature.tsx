"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Field, Banner } from "./ui";
import type { SignatureInput } from "../lib/model";
export function SignatureForm({
  preview = false,
  consentText,
  name = "",
  email = "",
  signerTitle = "",
  revision,
  reviewedHash,
  label = "Sign proposal",
  contactName = "",
  contactEmail = "",
  company = "",
  blocked = false,
  onSign,
}: {
  preview?: boolean;
  consentText: string;
  name?: string;
  email?: string;
  signerTitle?: string;
  revision: number;
  reviewedHash?: string;
  label?: string;
  contactName?: string;
  contactEmail?: string;
  company?: string;
  blocked?: boolean;
  onSign: (value: SignatureInput) => Promise<void>;
}) {
  const [mode, setMode] = useState<"typed" | "drawn">("typed"),
    [fullName, setName] = useState(name),
    [title, setTitle] = useState(signerTitle),
    [typed, setTyped] = useState(name),
    [consent, setConsent] = useState(false),
    [drawn, setDrawn] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    pending = useRef(false);
  useEffect(() => {
    if (matchMedia("(pointer: coarse)").matches) setMode("drawn");
  }, []);
  function point(e: PointerEvent<HTMLCanvasElement>) {
    const c = canvas.current!,
      r = c.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * c.width) / r.width,
      ((e.clientY - r.top) * c.height) / r.height,
    ] as const;
  }
  const reason = preview
    ? "Preview, not sent. Signing is disabled."
    : blocked
      ? "Reload and review the current proposal before signing."
      : !fullName.trim()
        ? "Enter your full name before signing."
        : mode === "drawn"
          ? !drawn
            ? "Draw your signature or choose Type."
            : !consent
              ? "Tick the agreement before signing."
              : ""
          : !typed.trim()
            ? "Type your signature before signing."
            : !consent
              ? "Tick the agreement before signing."
              : "";
  function clear() {
    setDrawn(false);
    setTyped("");
    canvas.current?.getContext("2d")?.clearRect(0, 0, 720, 220);
  }
  return (
    <form
      className="flow-signature stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending.current || reason || !consent || !email) return;
        pending.current = true;
        setBusy(true);
        setError("");
        try {
          await onSign({
            name: fullName.trim(),
            email,
            title,
            revision,
            reviewed_hash: reviewedHash,
            consent: true,
            kind: mode,
            ...(mode === "typed"
              ? { typed_name: typed.trim() }
              : { image: canvas.current!.toDataURL("image/png") }),
          });
        } catch {
          setError(
            "We couldn’t confirm your signature. Your signature and choices are still here. Check your connection, then try again or reload to check its status.",
          );
        } finally {
          pending.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <legend>Signing as</legend>
        <div className="grid">
          <Field label="Full name">
            <input
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Title (optional)">
            <input
              autoComplete="organization-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Email address">
          <input type="email" readOnly value={email} autoComplete="email" />
        </Field>
        <p className="muted">
          Not you? Ask{" "}
          {contactEmail ? (
            <a href={`mailto:${contactEmail}`}>{contactName || "the sender"}</a>
          ) : (
            contactName || "the sender"
          )}{" "}
          to re-send to the right person.
        </p>
        <p>
          Date{" "}
          {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Your signature</legend>
        <div className="signature-pad">
          <div className="tabs" role="tablist" aria-label="Signature method">
            {(
              [
                ["drawn", "Draw"],
                ["typed", "Type"],
              ] as const
            ).map(([value, text]) => (
              <button
                className={`btn ${mode === value ? "active" : "ghost"}`}
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                tabIndex={mode === value ? 0 : -1}
                onKeyDown={(e) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  )
                    return;
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? "drawn"
                      : e.key === "End"
                        ? "typed"
                        : mode === "drawn"
                          ? "typed"
                          : "drawn";
                  setMode(next);
                  (
                    e.currentTarget.parentElement!.querySelectorAll(
                      "[role=tab]",
                    )[next === "drawn" ? 0 : 1] as HTMLElement
                  ).focus();
                }}
                onClick={() => setMode(value)}
              >
                {text}
              </button>
            ))}
            <button className="btn ghost" type="button" onClick={clear}>
              Clear
            </button>
          </div>
          <canvas
            hidden={mode !== "drawn"}
            ref={canvas}
            width={720}
            height={220}
            aria-label="Draw your signature"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drawing.current = true;
              const ctx = canvas.current!.getContext("2d")!;
              ctx.strokeStyle = "#1c1b18";
              ctx.lineWidth = 2.5;
              ctx.lineCap = "round";
              ctx.beginPath();
              ctx.moveTo(...point(e));
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const ctx = canvas.current!.getContext("2d")!;
              ctx.lineTo(...point(e));
              ctx.stroke();
              setDrawn(true);
            }}
            onPointerUp={() => {
              drawing.current = false;
            }}
            onPointerCancel={() => {
              drawing.current = false;
            }}
          />
          <input
            hidden={mode !== "typed"}
            aria-label="Your signature"
            placeholder="Type your full name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
      </fieldset>
      <div className="flow-consent">
        <p>{consentText}</p>
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          I agree, and this is my electronic signature.
        </label>
      </div>
      {error && (
        <Banner tone="danger" title="Your signature is still here">
          {error}
        </Banner>
      )}
      <button
        className="btn primary"
        type="submit"
        disabled={busy || !!reason}
        aria-describedby="signature-reason"
      >
        {busy ? "Sealing your signed copy…" : error ? "Try again" : label}
      </button>
      <p id="signature-reason" className="muted" role="status">
        {busy
          ? "Please keep this page open. Your signature is being saved; do not submit it again."
          : reason ||
            `${company || "The company"} countersigns after you. You’ll both receive a sealed PDF.`}
      </p>
    </form>
  );
}
