"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Data } from "./staff-app";
import type { WorkspaceSettings } from "../lib/workspace";
import { whiteContrast, accessibleAccent } from "../lib/brand";
import {
  curatedFonts,
  fontCss,
  type FontChoice,
  type ProposalFont,
} from "../lib/proposal-fonts";
import { formatMoney } from "../lib/money";
import { stripeStatus } from "../lib/studio-v3";
import { workspaceSections } from "./studio-v3";
import { api, post, Button, Field, Banner, Disclosure } from "./ui";
import { ProposalStyles } from "./proposal-styles";
import { TeamStudio } from "./team-studio";
import { ReferenceDocuments } from "./reference-documents";
import { StoredSignatureEditor } from "./company-signature";
import { StaffSignIn, isStaffSignedOut } from "./staff-sign-in";
type Runner = (fn: () => Promise<unknown>, success?: string) => Promise<void>;
export function WorkspaceStudio({
  data,
  run,
  initial = "brand",
}: {
  data: Data;
  run: Runner;
  initial?: string;
}) {
  const [section, setSection] = useState(
    workspaceSections.some(([key]) => key === initial)
      ? initial === "brand" &&
        typeof window !== "undefined" &&
        workspaceSections.some(([key]) => key === location.hash.slice(1))
        ? location.hash.slice(1)
        : initial
      : "brand",
  );
  const [draft, setDraft] = useState(data.settings!);
  const [fonts, setFonts] = useState<ProposalFont[]>([]),
    [licensed, setLicensed] = useState(false),
    [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState("");
  const [logoMeta, setLogoMeta] = useState<{
    name: string;
    size: number;
  } | null>(null);
  useEffect(() => {
    if (!draft.logo) return;
    let active = true;
    fetch("/api/workspace-logo")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.blob();
      })
      .then((blob) => {
        if (active && blob.type.startsWith("image/"))
          setLogoMeta({ name: "Workspace logo.png", size: blob.size });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [draft.logo]);
  const [passwordEnabled, setPasswordEnabled] = useState(
      data.settings?.default_password_enabled ?? false,
    ),
    [password, setPassword] = useState("");
  const [states, setStates] = useState<
    Record<string, { status: string; error?: string }>
  >({});
  const pending = useRef<{
      value: WorkspaceSettings;
      section: string;
      extra?: Record<string, unknown>;
    } | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    flight = useRef<Promise<void> | null>(null),
    model = useRef(draft),
    mounted = useRef(true),
    extras = useRef<Record<string, unknown>>({}),
    logoFile = useRef<HTMLInputElement>(null);
  const owner = data.user.staff_role === "owner";
  useEffect(() => {
    mounted.current = true;
    api<ProposalFont[]>("/api/workspace-fonts")
      .then(setFonts)
      .catch((e) => setUploadError(e.message));
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  async function flush() {
    clearTimeout(timer.current);
    if (flight.current) return flight.current;
    if (!pending.current) return;
    let didSave = false;
    const task = (async () => {
      while (pending.current) {
        const current = pending.current;
        pending.current = null;
        setStates((s) => ({ ...s, [current.section]: { status: "Saving…" } }));
        try {
          await post("/api/workspace_settings", {
            ...current.value,
            ...current.extra,
          });
          didSave = true;
          if (
            current.extra?.default_password === extras.current.default_password
          )
            delete extras.current.default_password;
          if (mounted.current)
            setStates((s) => ({
              ...s,
              [current.section]: {
                status:
                  pending.current?.section === current.section
                    ? "Unsaved changes"
                    : "Saved",
              },
            }));
          // Reload shared app data only after draining, without replacing this form's local values.
        } catch (e) {
          if (mounted.current)
            setStates((s) => ({
              ...s,
              [current.section]: {
                status: "Couldn't save",
                error: (e as Error).message,
              },
            }));
        }
      }
    })();
    flight.current = task;
    await task;
    flight.current = null;
    if (pending.current) return flush();
    if (didSave) await run(async () => {}, "Workspace settings saved");
  }
  function change(
    patch: Partial<WorkspaceSettings>,
    immediate = false,
    extra?: Record<string, unknown>,
  ) {
    const next = { ...model.current, ...patch };
    model.current = next;
    setDraft(next);
    extras.current = { ...extras.current, ...extra };
    pending.current = { value: next, section, extra: { ...extras.current } };
    setStates((s) => ({ ...s, [section]: { status: "Unsaved changes" } }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), immediate ? 0 : 600);
  }
  function go(key: string) {
    void flush();
    setSection(key);
    const url = new URL(location.href);
    url.searchParams.set("view", key);
    history.replaceState(null, "", url);
  }
  const text = (label: string, key: keyof WorkspaceSettings, type = "text") => (
    <Field label={label}>
      <input
        type={type}
        value={String(draft[key] ?? "")}
        onChange={(e) => change({ [key]: e.target.value })}
        onBlur={() => void flush()}
      />
    </Field>
  );
  const toggle = (
    label: string,
    checked: boolean,
    onChange: (value: boolean) => void,
    disabled = false,
    help?: string,
  ) => (
    <label className="check-row workspace-switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>
        {label}
        {help && <small>{help}</small>}
      </span>
    </label>
  );
  const signatory = draft.company_signatory ?? {
    user_id: null,
    name: draft.owner,
    title: "Owner",
    email: draft.email,
    image: null,
    authorized_user_ids: [],
  };
  const current = states[section];
  const allFonts = [
    ...new Map(
      [
        ...fonts,
        ...Object.values(draft.proposal_fonts ?? {}).filter(
          (f): f is ProposalFont => typeof f !== "string",
        ),
      ].map((f) => [f.id, f]),
    ).values(),
  ];
  const fontSelect = (label: string, kind: "heading" | "body") => (
    <Field label={label}>
      <select
        value={
          typeof draft.proposal_fonts?.[kind] === "string"
            ? (draft.proposal_fonts[kind] as string)
            : ((draft.proposal_fonts?.[kind] as ProposalFont | undefined)?.id ??
              "serif")
        }
        onChange={(e) => {
          const value: FontChoice =
            allFonts.find((f) => f.id === e.target.value) ??
            (e.target.value as FontChoice);
          change(
            {
              proposal_fonts: {
                heading: draft.proposal_fonts?.heading ?? "serif",
                body: draft.proposal_fonts?.body ?? "serif",
                [kind]: value,
              },
            },
            true,
          );
        }}
      >
        {["Serif", "Sans", "Monospace"].map((group) => (
          <optgroup label={group} key={group}>
            {curatedFonts
              .filter((f) => f.category === group)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </optgroup>
        ))}
        {!!allFonts.length && (
          <optgroup label="Uploaded">
            {allFonts.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </Field>
  );
  const contrast = /^#[0-9a-f]{6}$/i.test(draft.accent_colour)
    ? whiteContrast(draft.accent_colour)
    : 0;
  const cards: Record<string, ReactNode> = {
    brand: (
      <>
        <p>Shown on client pages, emails and PDFs.</p>
        <div className="workspace-control-grid workspace-brand-top">
          {text("Workspace name", "company_name")}
          <div className="workspace-logo-row">
            {draft.logo ? (
              <img src="/api/workspace-logo" alt="Workspace logo" />
            ) : (
              <span className="workspace-logo-empty" aria-hidden="true">
                {draft.company_name.slice(0, 1)}
              </span>
            )}
            <label className="workspace-logo-label">
              <span>Logo · PNG, under 750 KB</span>
              <span className="workspace-logo-file">
                {draft.logo
                  ? logoMeta
                    ? `${logoMeta.name} · ${Math.max(1, Math.round(logoMeta.size / 1024))} KB`
                    : "Workspace logo.png"
                  : "No logo uploaded"}
              </span>
              <input
                type="file"
                ref={logoFile}
                className="sr-only"
                tabIndex={-1}
                accept="image/png"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  try {
                    const result = await post("/api/workspace-logo", {
                      image: await readData(file),
                    });
                    setLogoMeta({ name: file.name, size: file.size });
                    change({ logo: result.path }, true);
                    setUploadError("");
                  } catch (e) {
                    setUploadError((e as Error).message);
                  } finally {
                    setUploading(false);
                  }
                }}
              />
              <Button variant="ghost" onClick={() => logoFile.current?.click()}>
                {draft.logo ? "Replace" : "Upload logo"}
              </Button>
            </label>
          </div>
        </div>
        <Field label="Accent color">
          <div className="workspace-accent">
            {["#365c4a", "#2e4f79", "#7a3e2d", "#1c1b18"].map((colour, n) => (
              <button
                type="button"
                className={`workspace-swatch workspace-swatch-${n}`}
                aria-label={`Use accent ${colour}`}
                aria-pressed={draft.accent_colour.toLowerCase() === colour}
                key={colour}
                onClick={() => change({ accent_colour: colour }, true)}
              />
            ))}
            <input
              aria-label="Accent hex"
              value={draft.accent_colour}
              onChange={(e) => change({ accent_colour: e.target.value })}
              onBlur={() => void flush()}
            />
            <p className={contrast >= 4.5 ? "success" : "warning"}>
              {contrast >= 4.5
                ? "✓ Readable on white"
                : "Needs 4.5:1 contrast on white"}{" "}
              ({contrast.toFixed(1)}:1)
            </p>
          </div>
        </Field>
        {contrast > 0 && contrast < 4.5 && (
          <Button
            onClick={() =>
              change(
                { accent_colour: accessibleAccent(draft.accent_colour) },
                true,
              )
            }
          >
            Use {accessibleAccent(draft.accent_colour)} — darker, same hue
          </Button>
        )}
        {toggle(
          'Show "Powered by Yeswell"',
          draft.show_powered_by !== false,
          (v) => change({ show_powered_by: v }, true),
          !owner,
          "A small line at the bottom of client pages and emails. Never shown on the PDF.",
        )}
        {!owner && (
          <p className="muted">
            Only a super admin can change Yeswell attribution.
          </p>
        )}
        <details>
          <Disclosure>Workspace contact details</Disclosure>
          <div className="stack">
            {text("Owner contact name", "owner")}
            {text("Contact email", "email", "email")}
            {text("Phone", "phone")}
            {text("Address", "address")}
          </div>
        </details>
      </>
    ),
    fonts: (
      <>
        <p>Used in the proposal, client page and sealed PDF.</p>
        <div className="workspace-control-grid">
          {fontSelect("Headings", "heading")}
          {fontSelect("Body text", "body")}
        </div>
        <Field label="Upload a font file · WOFF2 or TTF, under 1 MB">
          <input
            type="file"
            accept=".woff2,.ttf"
            disabled={!licensed || uploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                const font = await post<ProposalFont>("/api/workspace-fonts", {
                  name: file.name.replace(/\.(woff2|ttf)$/i, ""),
                  data: await readData(file),
                  licensed,
                });
                setFonts((f) => [...f, font]);
                change(
                  {
                    proposal_fonts: {
                      heading: draft.proposal_fonts?.heading ?? "serif",
                      body: font,
                    },
                  },
                  true,
                );
                setUploadError("");
              } catch (e) {
                setUploadError((e as Error).message);
              } finally {
                setUploading(false);
              }
            }}
          />
        </Field>
        <label className="check-row">
          <input
            type="checkbox"
            checked={licensed}
            onChange={(e) => setLicensed(e.target.checked)}
          />
          I confirm this font is licensed for PDF embedding.
        </label>
        <style>{fontCss(draft)}</style>
        <article className="paper proposal-typography font-preview">
          <small>PREVIEW</small>
          <h1>A proposal for your next chapter</h1>
          <h2>Overview</h2>
          <p>
            Thank you for sharing your plans. This proposal sets out the work,
            the investment and the next steps.
          </p>
        </article>
      </>
    ),
    styles: (
      <ProposalStyles
        settings={draft}
        value={draft.proposal_styles ?? {}}
        availableFonts={allFonts}
        onChange={(proposal_styles) => change({ proposal_styles })}
        scope="workspace"
        hidePageMargins
      />
    ),
    billing: (
      <>
        <p>Where each kind of charge is billed after a client signs.</p>
        <div className="workspace-setting-row">
          <div>
            <h3>
              Recurring services{" "}
              <span className="studio-tag studio-tag-stripe">Stripe</span>
            </h3>
            <p>
              Hosting, care and other monthly or yearly services. New clients
              pay through Stripe Checkout; existing subscribers have the items
              added to their subscription, with no payment step.
            </p>
          </div>
          <a href="/studio/connections?view=stripe">
            <span className={data.connections?.stripe ? "success" : "warning"}>
              ● {stripeStatus(data.connections)}
            </span>{" "}
            · Manage
          </a>
        </div>
        <div className="workspace-setting-row">
          <div>
            <h3>
              One-time fees{" "}
              <span className="studio-tag studio-tag-qbo">QuickBooks</span>
            </h3>
            <p>
              Project fees, including the Own It Over Time kickoff. Until
              QuickBooks is connected, staff record the invoice number on the
              proposal.
            </p>
          </div>
          <a href="/studio/connections?view=qbo">
            <span className={data.connections?.qbo ? "success" : "warning"}>
              ● {data.connections?.qbo ? "Sandbox configured" : "Not connected"}
            </span>{" "}
            · {data.connections?.qbo ? "Manage" : "Connect"}
          </a>
        </div>
        <details className="workspace-more">
          <Disclosure>More billing settings</Disclosure>
          <div className="stack">
            <Field label="Collection method">
              <select
                value={draft.collection_method}
                onChange={(e) =>
                  change(
                    {
                      collection_method: e.target
                        .value as WorkspaceSettings["collection_method"],
                    },
                    true,
                  )
                }
              >
                <option value="charge_automatically">
                  Charge automatically
                </option>
                <option value="send_invoice">Send invoice</option>
              </select>
            </Field>
            {text(
              "QuickBooks custom services item reference",
              "qbo_custom_item_ref",
            )}
          </div>
        </details>
      </>
    ),
    team: <TeamStudio data={data} run={run} embedded />,
    signatory: (
      <>
        <p>
          Every company signature presents as this person. The audit records who
          applied it.
        </p>
        {!owner && (
          <p className="muted">
            Only a super admin can change the signatory or delegates.
          </p>
        )}
        <fieldset disabled={!owner} className="stack">
          <Field label="Signatory name">
            <input
              value={signatory?.name ?? draft.owner}
              onChange={(e) =>
                change({
                  company_signatory: { ...signatory!, name: e.target.value },
                })
              }
            />
          </Field>
          <Field label="Signatory title">
            <input
              value={signatory?.title ?? "Owner"}
              onChange={(e) =>
                change({
                  company_signatory: { ...signatory!, title: e.target.value },
                })
              }
            />
          </Field>
          <Field label="Signatory staff account">
            <select
              value={signatory?.user_id ?? ""}
              onChange={(e) =>
                change(
                  {
                    company_signatory: {
                      ...signatory!,
                      user_id: e.target.value || null,
                      email:
                        data.staff.find((m) => m.user_id === e.target.value)
                          ?.email ?? draft.email,
                    },
                  },
                  true,
                )
              }
            >
              <option value="">Choose a staff account</option>
              {data.staff.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name} · {m.email}
                </option>
              ))}
            </select>
          </Field>
          <StoredSignatureEditor
            value={signatory?.image ?? null}
            onChange={(image) =>
              change({ company_signatory: { ...signatory!, image } }, true)
            }
          />
          <h3>Can countersign on {signatory?.name ?? draft.owner}'s behalf</h3>
          {data.staff.map((m) => (
            <label className="check-row" key={m.user_id}>
              <input
                type="checkbox"
                checked={
                  signatory?.authorized_user_ids.includes(m.user_id) ?? false
                }
                onChange={(e) =>
                  change(
                    {
                      company_signatory: {
                        ...signatory!,
                        authorized_user_ids: e.target.checked
                          ? [
                              ...(signatory?.authorized_user_ids ?? []),
                              m.user_id,
                            ]
                          : (signatory?.authorized_user_ids ?? []).filter(
                              (id) => id !== m.user_id,
                            ),
                      },
                    },
                    true,
                  )
                }
              />
              {m.display_name} · {m.email}
            </label>
          ))}
        </fieldset>
        <Field label="Electronic signature consent">
          <textarea
            value={draft.consent_text}
            onChange={(e) => change({ consent_text: e.target.value })}
          />
        </Field>
      </>
    ),
    "client-links": (
      <>
        <Field label="Default link validity (days)">
          <input
            type="number"
            min={1}
            max={365}
            value={draft.default_validity_days}
            onChange={(e) =>
              change({ default_validity_days: Number(e.target.value) })
            }
          />
        </Field>
        <p className="muted">
          New proposals use this default. Clear an individual proposal’s date to
          make it indefinite.
        </p>
        {text("Workspace timezone", "timezone")}
        {toggle(
          "Password by default",
          passwordEnabled,
          (v) => {
            setPasswordEnabled(v);
            if (!v) change({}, true, { default_password: null });
          },
          !owner,
        )}
        {passwordEnabled && (
          <Field
            label={
              data.settings?.default_password_enabled
                ? "Replace default password (leave blank to keep it)"
                : "Default password"
            }
          >
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={200}
              disabled={!owner}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (e.target.value.length >= 8)
                  change({}, false, { default_password: e.target.value });
              }}
            />
          </Field>
        )}
        {!owner && (
          <p className="muted">
            Only a super admin can change the default password.
          </p>
        )}
        <div className="field">
          <span>Link domain</span>
          <strong>{new URL(data.app_url).host}</strong>
          <small>Change domains in hosting settings</small>
        </div>
      </>
    ),
    "email-sending": (
      <>
        <p>Configure the existing verified domain and automatic reminders.</p>
        <Field label="Verified sending domain">
          <input
            value={draft.sending_domain}
            disabled={!owner}
            onChange={(e) => change({ sending_domain: e.target.value })}
          />
        </Field>
        <p className="muted">
          {data.connections?.email
            ? "Email provider configured"
            : "Email provider not configured"}
          . Verify SPF and DKIM with your provider.
        </p>
        {!owner && (
          <p className="muted">
            Only a super admin can change the verified sending domain.
          </p>
        )}
        <h3>Reminders</h3>
        <p>
          Sends 'Reminder · unopened' or 'Reminder · viewed, not signed' as
          appropriate.
        </p>
        <ReminderDays
          days={draft.reminder_days}
          onChange={(reminder_days) => change({ reminder_days })}
        />
      </>
    ),
    "pricing-references": (
      <>
        <p>
          Internal documents staff and assistants can read while writing a
          quote. They never set prices.
        </p>
        <ReferenceDocuments documents={data.documents} run={run} />
      </>
    ),
  };
  // Use the same currency choices as the existing settings form.
  cards.money = (
    <>
      <Field label="Currency">
        <select
          value={draft.currency}
          onChange={(e) =>
            change(
              { currency: e.target.value as WorkspaceSettings["currency"] },
              true,
            )
          }
        >
          {["USD", "CAD", "GBP", "EUR", "AUD"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <fieldset className="studio-radio">
        <legend>Cents</legend>
        {[
          ["auto", "Only when needed"],
          ["always", "Always"],
        ].map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              checked={(draft.money?.cents ?? "auto") === value}
              onChange={() =>
                change({ money: { cents: value as "auto" | "always" } }, true)
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
      <p className="workspace-sample">
        {draft.money?.cents === "always" ? "$500.00 · $49.50" : "$500 · $49.50"}
      </p>
    </>
  );
  return (
    <div className="studio-workspace-v3">
      <div className="workspace-auto-label">Changes save automatically</div>
      <nav aria-label="Workspace sections" className="workspace-section-list">
        {workspaceSections.map(([key, label]) => (
          <button
            key={key}
            aria-current={section === key ? "page" : undefined}
            onClick={() => go(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section
        id={section}
        className="workspace-section-card"
        aria-label={workspaceSections.find(([key]) => key === section)?.[1]}
        onBlur={() => void flush()}
      >
        <header>
          <h2>{workspaceSections.find(([key]) => key === section)?.[1]}</h2>
          {section !== "billing" && (uploading || current) && (
            <span role="status" className={current?.error ? "danger" : "muted"}>
              {uploading ? "Uploading…" : (current?.status ?? "")}
            </span>
          )}
        </header>
        <div className="stack">{cards[section]}</div>
        {uploadError && (
          <Banner tone="danger" title="Upload needs attention">
            {uploadError}
          </Banner>
        )}
        {current?.error && (
          <Banner tone="danger" title="Your changes are still here">
            {current.error}
            {isStaffSignedOut(current.error) && <StaffSignIn />}
            <Button
              onClick={() => {
                pending.current = {
                  value: model.current,
                  section,
                  extra: { ...extras.current },
                };
                void flush();
              }}
            >
              Retry
            </Button>
          </Banner>
        )}
      </section>
    </div>
  );
}
function ReminderDays({
  days,
  onChange,
}: {
  days: number[];
  onChange: (days: number[]) => void;
}) {
  const [value, setValue] = useState(days.join(", ")),
    previous = useRef(days.length ? days : [3, 7]);
  return (
    <>
      <label className="check-row">
        <input
          role="switch"
          type="checkbox"
          checked={days.length > 0}
          onChange={(e) => {
            if (days.length) previous.current = days;
            const next = e.target.checked ? previous.current : [];
            setValue(next.join(", "));
            onChange(next);
          }}
        />
        Automatic reminders
      </label>
      <Field label="Reminders · days after sending, comma separated">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            onChange(
              e.target.value
                .split(",")
                .filter((n) => n.trim())
                .map(Number),
            );
          }}
        />
      </Field>
    </>
  );
}
async function readData(file: File) {
  if (file.size > 1000000) throw new Error("Choose a file under 1 MB.");
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Unable to read file"));
    r.readAsDataURL(file);
  });
}
