"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button, Field, Banner } from "./ui";
import type { SignatureInput } from "../lib/model";
export function SignatureForm({
  consentText,
  name = "",
  email = "",
  revision,
  reviewedHash,
  label = "Sign and accept",
  onSign,
}: {
  consentText: string;
  name?: string;
  email?: string;
  revision: number;
  reviewedHash?: string;
  label?: string;
  onSign: (value: SignatureInput) => Promise<void>;
}) {
  const [mode, setMode] = useState<"typed" | "drawn">("typed"),
    [fullName, setName] = useState(name),
    [address, setEmail] = useState(email),
    [title, setTitle] = useState(""),
    [typed, setTyped] = useState(""),
    [consent, setConsent] = useState(false),
    [drawn, setDrawn] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false);
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
  function clear() {
    setDrawn(false);
    setTyped("");
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
  }
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setError("");
        setBusy(true);
        try {
          await onSign({
            name: fullName,
            email: address,
            title,
            revision,
            reviewed_hash: reviewedHash,
            consent: true,
            kind: mode,
            ...(mode === "typed"
              ? { typed_name: typed }
              : { image: canvas.current!.toDataURL("image/png") }),
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unable to sign");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="card">
        <p>{consentText}</p>
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          I have read and agree to the terms above and intend this to be my
          electronic signature.
        </label>
      </div>
      <div className="signature-pad">
        <div className="tabs" role="tablist" aria-label="Signature method">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "drawn"}
            className={`btn ${mode === "drawn" ? "active" : ""}`}
            onClick={() => {
              if (mode !== "drawn") setDrawn(false);
              setMode("drawn");
            }}
          >
            Draw
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "typed"}
            className={`btn ${mode === "typed" ? "active" : ""}`}
            onClick={() => setMode("typed")}
          >
            Type
          </button>
          <Button type="button" variant="ghost" onClick={clear}>
            Clear
          </Button>
        </div>
        {mode === "drawn" ? (
          <canvas
            ref={canvas}
            width={720}
            height={220}
            aria-label="Draw your signature"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drawing.current = true;
              const ctx = canvas.current!.getContext("2d")!;
              ctx.strokeStyle = "#12151a";
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
        ) : (
          <input
            aria-label="Your signature"
            value={typed}
            placeholder="Type your full name"
            onChange={(e) => setTyped(e.target.value)}
            required
          />
        )}
      </div>
      <div className="grid">
        <Field label="Full name">
          <input
            required
            value={fullName}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Title (optional)">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
      </div>
      <Field
        label="Email address"
        hint={email ? `Use the recipient address: ${email}` : undefined}
      >
        <input
          type="email"
          required
          value={address}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </Field>
      {error && (
        <Banner tone="danger" title="Unable to sign">
          {error}
        </Banner>
      )}
      <Button
        variant="primary"
        type="submit"
        busy={busy}
        disabled={!consent || (mode === "drawn" ? !drawn : !typed.trim())}
        note={
          !consent
            ? "Agree to the consent text before signing."
            : mode === "drawn" && !drawn
              ? "Draw your signature or choose Type."
              : undefined
        }
      >
        {label}
      </Button>
      <small>
        Your signed copy is sealed after acceptance. A billing delay cannot undo
        your signature.
      </small>
    </form>
  );
}
