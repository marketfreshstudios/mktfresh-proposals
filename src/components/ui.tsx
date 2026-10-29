"use client";
import {
  useEffect,
  useState,
  useId,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import icons from "./icons.json";
import { money, totals } from "../lib/presentation";
import type { Line, Proposal } from "../lib/model";
export function Icon({ name }: { name: keyof typeof icons }) {
  const i = icons[name];
  return (
    <svg
      aria-hidden="true"
      viewBox={i.viewBox}
      height="16"
      width="18"
      fill="currentColor"
    >
      <path d={i.path} />
    </svg>
  );
}
export function Button({
  children,
  variant = "secondary",
  busy = false,
  note,
  icon,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  busy?: boolean;
  note?: string;
  icon?: keyof typeof icons;
}) {
  return (
    <span className="button-wrap">
      <button
        type="button"
        {...props}
        disabled={props.disabled || busy}
        className={`btn ${variant} ${props.className ?? ""}`}
      >
        {icon && <Icon name={icon} />} {busy ? "Working…" : children}
      </button>
      {note && <small className="muted">{note}</small>}
    </span>
  );
}
export function Banner({
  title,
  children,
  tone = "info",
  action,
}: {
  title: string;
  children?: ReactNode;
  tone?: string;
  action?: ReactNode;
}) {
  return (
    <section
      className={`banner ${tone}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      <strong>{title}</strong>
      {children && <div>{children}</div>}
      {action}
    </section>
  );
}
const statuses: Record<
  string,
  { name: string; tone: string; icon: keyof typeof icons }
> = {
  draft: { name: "Draft", tone: "neutral", icon: "edit" },
  sent: { name: "Sent", tone: "info", icon: "send" },
  viewed: { name: "Viewed", tone: "info", icon: "viewed" },
  signed_by_client: {
    name: "Signed by client",
    tone: "warning",
    icon: "signature",
  },
  completed: { name: "Completed", tone: "success", icon: "verified" },
  declined: { name: "Declined", tone: "danger", icon: "declined" },
  expired: { name: "Expired", tone: "neutral", icon: "expired" },
  archived: { name: "Archived", tone: "neutral", icon: "archive" },
};
export function Status({
  status,
  ai = false,
}: {
  status: string;
  ai?: boolean;
}) {
  const s = statuses[status] ?? statuses.draft;
  return (
    <span className="pills">
      <span className={`pill ${s.tone}`}>
        <Icon name={s.icon} />
        {s.name}
      </span>
      {ai && (
        <span className="pill ai">
          <Icon name="ai" />
          Needs AI review
        </span>
      )}
    </span>
  );
}
export function Totals({
  lines,
  currency = "USD",
  value,
  showYearly = true,
}: {
  showYearly?: boolean;
  lines?: Line[];
  currency?: string;
  value?: {
    one_time_total: number;
    monthly_total: number;
    yearly_total: number;
  };
}) {
  const t = value ?? totals(lines ?? []);
  return (
    <div className="totals" aria-label="Proposal totals">
      {[
        ["One-time", t.one_time_total, ""],
        ["Monthly", t.monthly_total, "/month"],
        ["Yearly", t.yearly_total, "/year"],
      ]
        .filter(([label]) => label !== "Yearly" || showYearly)
        .map(([label, amount, suffix]) => (
          <div key={label}>
            <span className="eyebrow">{label}</span>
            <strong>
              {money(Number(amount), currency)}
              <small>{suffix}</small>
            </strong>
          </div>
        ))}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <label className="field">
        <span>{label}</span>
        {children}
      </label>
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name="document" />
      <h2>{title}</h2>
      <p className="muted">{children}</p>
      {action}
    </div>
  );
}
export function Signatures({
  proposal,
}: {
  proposal: Pick<Proposal, "signers" | "workspace_settings">;
}) {
  return (
    <div className="signature-slots">
      {["client", "company"].map((role) => {
        const s = proposal.signers.find((s) => s.role === role);
        return (
          <div key={role}>
            <span className="eyebrow">
              {role === "client"
                ? "Client"
                : (proposal.workspace_settings?.company_name ?? "Company")}
            </span>
            <strong>{s ? "Signed" : "Awaiting signature"}</strong>
            <small>
              {s
                ? `${s.name} · ${date(s.signed_at)}`
                : role === "company"
                  ? "Your counter-signature is required"
                  : "Client signs first"}
            </small>
          </div>
        );
      })}
    </div>
  );
}
export const date = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not yet";
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const d = localStorage.getItem("proposal-theme") === "dark";
    setDark(d);
    document.documentElement.dataset.theme = d ? "dark" : "light";
  }, []);
  return (
    <button
      className="btn ghost theme-toggle"
      onClick={() => {
        const value = !dark;
        setDark(value);
        document.documentElement.dataset.theme = value ? "dark" : "light";
        localStorage.setItem("proposal-theme", value ? "dark" : "light");
      }}
    >
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error ?? "Unable to complete request",
    );
  return data;
}
export const post = <T = any,>(path: string, data: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });

// Typed port of design/system/components/JobState, using the supplied ps-* styles.
export function JobState({
  state,
  label,
  error,
  attempts,
  onRetry,
  className = "",
}: {
  state: "queued" | "running" | "failed" | "review";
  label: string;
  error?: string;
  attempts?: number;
  onRetry?: () => void;
  className?: string;
}) {
  const def = {
    queued: { tone: "neutral", icon: "clock", label: "Queued" },
    running: { tone: "info", icon: "retry", label: "Running" },
    failed: { tone: "danger", icon: "failed", label: "Failed" },
    review: { tone: "warning", icon: "review", label: "Needs review" },
  }[state];
  return (
    <div className={`ps-job ${className}`}>
      <span className={`ps-pill ps-tone-${def.tone}`}>
        <span className={state === "running" ? "ps-job__spin" : ""}>
          <Icon name={def.icon as keyof typeof icons} />
        </span>
        <span>{def.label}</span>
      </span>
      <div className="ps-job__body">
        <div className="ps-job__label">{label}</div>
        {error && (
          <div className="ps-job__error">
            {error}
            {attempts ? ` · attempt ${attempts}` : ""}
          </div>
        )}
      </div>
      {["failed", "review"].includes(state) && onRetry && (
        <Button onClick={onRetry} icon="retry">
          {state === "review" ? "Resolve" : "Retry"}
        </Button>
      )}
    </div>
  );
}
