"use client";
import { useRef, useState } from "react";
import { Banner, Button, Field } from "./ui";
import { onBehalfText, type WorkspaceSettings } from "../lib/workspace";
import type { Actor, Proposal } from "../lib/model";
export function CompanySignatureForm({
  settings,
  user,
  version,
  proposal,
  onSign,
}: {
  settings: WorkspaceSettings | null;
  user: Actor;
  version: string;
  proposal: Proposal;
  onSign: (body: unknown) => Promise<void>;
}) {
  const [consent, setConsent] = useState(false),
    [authorized, setAuthorized] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const s = settings?.company_signatory,
    id = user.actor.slice(6);
  if (!s?.user_id || !s.image)
    return (
      <Banner tone="warning" title="Company signatory setup required">
        An owner must designate the signatory and save their signature in
        Settings.
      </Banner>
    );
  if (!s.authorized_user_ids.includes(id))
    return (
      <Banner tone="warning" title="You cannot apply the company signature">
        Ask a workspace owner to authorize your staff account.
      </Banner>
    );
  const delegated = id !== s.user_id,
    authorization = onBehalfText(s.name, settings!.company_name);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await onSign({
            revision: proposal.revision,
            reviewed_hash: proposal.versions.at(-1)?.content_hash,
            consent: true,
            signatory_version: version,
            ...(delegated
              ? { authorization: true, authorization_text: authorization }
              : {}),
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unable to counter-sign");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>
        {delegated ? `Signing on behalf of ${s.name}` : `Signing as ${s.name}`}
      </h3>
      <p>
        {s.name} · {s.title} · {settings!.company_name}
      </p>
      <img
        src={s.image}
        alt={`${s.name}’s stored signature`}
        style={{
          maxWidth: "100%",
          maxHeight: 160,
          objectFit: "contain",
          background: "white",
        }}
      />
      <p>{proposal.workspace_settings?.consent_text}</p>
      <label className="check">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I have reviewed the agreement and consent to apply the company
        signature.
      </label>
      {delegated && (
        <label className="check">
          <input
            type="checkbox"
            required
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
          />
          {authorization}
        </label>
      )}
      <small>
        Applied by {user.staff_name || user.staff_email} [{user.staff_email}].
        This identity is recorded in the audit trail.
      </small>
      {error && (
        <Banner tone="danger" title="Unable to counter-sign">
          {error}
        </Banner>
      )}
      <Button
        type="submit"
        variant="primary"
        busy={busy}
        disabled={!consent || (delegated && !authorized)}
      >
        Counter-sign and complete
      </Button>
    </form>
  );
}
export function StoredSignatureEditor({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (image: string | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false);
  const [ink, setInk] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="stack">
      {value && (
        <img
          alt="Stored company signature"
          src={value}
          style={{
            maxWidth: "100%",
            maxHeight: 140,
            objectFit: "contain",
            background: "white",
          }}
        />
      )}
      <Field label="Upload signature (PNG, under 350 KB)">
        <input
          type="file"
          accept="image/png"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 350000 || file.type !== "image/png") {
              setError("Choose a PNG under 350 KB.");
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              onChange(String(reader.result));
              setError("");
            };
            reader.readAsDataURL(file);
          }}
        />
      </Field>
      <p>Or draw the designated signatory’s signature once:</p>
      <canvas
        ref={canvas}
        width={720}
        height={220}
        aria-label="Draw stored company signature"
        style={{
          width: "100%",
          background: "white",
          border: "1px solid #8b9299",
          touchAction: "none",
        }}
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const c = canvas.current!,
            r = c.getBoundingClientRect(),
            ctx = c.getContext("2d")!;
          ctx.strokeStyle = "#12151a";
          ctx.lineWidth = 2.5;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(
            ((e.clientX - r.left) * c.width) / r.width,
            ((e.clientY - r.top) * c.height) / r.height,
          );
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const c = canvas.current!,
            r = c.getBoundingClientRect(),
            ctx = c.getContext("2d")!;
          ctx.lineTo(
            ((e.clientX - r.left) * c.width) / r.width,
            ((e.clientY - r.top) * c.height) / r.height,
          );
          ctx.stroke();
          setInk(true);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <div className="row">
        <Button
          type="button"
          disabled={!ink}
          onClick={() => onChange(canvas.current!.toDataURL("image/png"))}
        >
          Use drawn signature
        </Button>
        <Button
          type="button"
          onClick={() => {
            canvas.current?.getContext("2d")?.clearRect(0, 0, 720, 220);
            setInk(false);
          }}
        >
          Clear drawing
        </Button>
        <Button type="button" onClick={() => onChange(null)}>
          Remove stored signature
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
