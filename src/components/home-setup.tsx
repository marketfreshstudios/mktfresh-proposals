"use client";
import { useEffect, useState } from "react";
import {
  Building2,
  Check,
  Mail,
  Palette,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import type { Data } from "./staff-app";
import { Button, post } from "./ui";
import { SigningIcon } from "./staff-icons";
import { ProviderMark } from "./provider-brand";
import { workspaceSetup } from "../lib/workspace-setup";
import { LOCAL_WORKSPACE_ID } from "../lib/workspace";
import { withCount } from "../lib/count-label";

const optionalStepNames = {
  team: "invite your team",
  assistant: "connect Claude",
  imports: "import from Proposify",
};

const setupIcons = {
  "business-details": Building2,
  brand: Palette,
  signatory: SigningIcon,
  email: Mail,
  team: Users,
  assistant: Sparkles,
  imports: Upload,
};

function SetupMark({
  step,
  complete,
}: {
  step: keyof typeof setupIcons | "stripe" | "qbo";
  complete: boolean;
}) {
  if (step === "stripe" || step === "qbo")
    return <ProviderMark provider={step} />;
  const Icon = complete ? Check : setupIcons[step];
  return (
    <span className="home-setup-icon" aria-hidden="true">
      <Icon size={18} />
    </span>
  );
}

export function HomeSetup({
  data,
  onChanged,
}: {
  data: Data;
  onChanged: () => Promise<void>;
}) {
  const workspace =
    data.settings?.company_name ??
    data.workspace_defaults?.company_name ??
    "your workspace";
  const setup = workspaceSetup(data);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const key = `yeswell:setup-dismissed:${data.user.workspace_id ?? data.settings?.id}:${data.user.actor}`;
  useEffect(() => {
    setDismissed(localStorage.getItem(key) === "1");
  }, [key]);

  if (data.user.staff_role !== "owner")
    return data.user.staff_home_banner_dismissed ? null : (
      <StaffHomeBanner key={data.user.actor} workspace={workspace} />
    );

  const knownIncomplete = setup.required.some(
    (row) =>
      !row.complete &&
      (data.connections ||
        row.id === "business-details" ||
        row.id === "brand" ||
        row.id === "signatory" ||
        (row.id === "email" && !data.settings?.sending_domain)),
  );
  if (
    (data.user.workspace_id === LOCAL_WORKSPACE_ID && !knownIncomplete) ||
    (setup.complete && dismissed)
  )
    return null;

  const done = setup.required.filter((row) => row.complete).length;
  const remaining = setup.optional.filter((row) => !row.complete);
  async function chooseManual() {
    setSaving(true);
    setError("");
    try {
      await post("/api/workspace_settings/manual-invoicing");
      await onChanged();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save manual invoicing.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="home-setup-card" aria-labelledby="home-setup-title">
      {setup.complete && (
        <header className="home-setup-summary">
          <div className="home-setup-summary-copy">
            <span className="home-setup-complete" aria-hidden="true">
              <Check size={18} />
            </span>
            <h2 id="home-setup-title">You’re set up.</h2>
            {remaining.length > 0 && (
              <p>
                {withCount(remaining.length, "optional step")} left:{" "}
                {new Intl.ListFormat("en-US").format(
                  remaining.map((row) => optionalStepNames[row.id]),
                )}
                .
              </p>
            )}
          </div>
          <div className="home-setup-actions">
            <Button
              aria-expanded={expanded}
              aria-controls="home-setup-details"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Hide" : "Show"}
            </Button>
            <Button
              onClick={() => {
                localStorage.setItem(key, "1");
                setDismissed(true);
              }}
            >
              Dismiss
            </Button>
          </div>
        </header>
      )}
      <div id="home-setup-details" hidden={setup.complete && !expanded}>
        <header className="home-setup-summary">
          <div>
            <h2 id={setup.complete ? undefined : "home-setup-title"}>
              Set up {workspace}
            </h2>
            <p className="muted">
              {done} of {setup.required.length} needed steps done · About 10
              minutes
            </p>
          </div>
        </header>
        <progress
          aria-label="Workspace setup progress"
          max={setup.required.length}
          value={done}
        />
        <div className="home-setup-groups">
          {(
            [
              ["Needed before you send", setup.required],
              ["When you’re ready", setup.optional],
            ] as const
          ).map(([heading, rows], index) => (
            <section key={heading} aria-label={heading}>
              <header className="home-setup-group-heading">
                <h3>{heading}</h3>
                {index === 1 && <span>Optional</span>}
              </header>
              <ul className="setup-checklist">
                {rows.map((row) => (
                  <li key={row.id} data-complete={row.complete}>
                    <SetupMark step={row.id} complete={row.complete} />
                    <div className="home-setup-label">
                      <strong>{row.label}</strong>
                      <p>{row.detail}</p>
                    </div>
                    {row.complete ? (
                      <span className="pill success">
                        <Check size={14} aria-hidden="true" /> Done
                      </span>
                    ) : (
                      <a
                        className="btn"
                        href={row.href}
                        aria-label={`${row.action}: ${row.label}`}
                      >
                        {row.action}
                      </a>
                    )}
                    {row.id === "qbo" && !row.complete && (
                      <button
                        className="home-setup-skip"
                        type="button"
                        disabled={saving}
                        onClick={chooseManual}
                      >
                        Record invoice numbers by hand
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}

function StaffHomeBanner({ workspace }: { workspace: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (dismissed) return null;

  async function dismiss() {
    setSaving(true);
    setError("");
    try {
      await post("/api/auth/staff-home-banner");
      setDismissed(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not dismiss the message. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="home-setup-card home-staff-banner"
      aria-label="Staff welcome"
    >
      <span className="home-setup-complete" aria-hidden="true">
        <Users size={18} />
      </span>
      <p>
        You joined <strong>{workspace}</strong> as Staff — draft, send, and
        countersign when authorized; super admins manage Studio settings.
      </p>
      <Button busy={saving} onClick={dismiss}>
        Dismiss
      </Button>
      {error && (
        <p className="home-staff-banner-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
