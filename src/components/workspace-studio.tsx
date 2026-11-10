"use client";
import { Switch, Select } from "./form-controls";
import { QuickBooksPicker } from "./quickbooks-fields";
import { useReloadGuard } from "./reload-safety";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Data } from "./staff-app";
import type { WorkspaceSettings } from "../lib/workspace";
import { ColorPicker } from "./color-picker";
import { acceptBrandSuggestions } from "../lib/color-picker";
import { businessStates } from "../lib/business-state";
import {
  curatedFonts,
  fontCss,
  type FontChoice,
  type ProposalFont,
} from "../lib/proposal-fonts";
import { resolveStyles } from "../lib/proposal-styles";
import { formatMoney } from "../lib/money";
import { stripeStatus } from "../lib/studio-v3";
import { workspaceSections } from "./studio-v3";
import { Skeleton } from "./foundation";
import { api, post, Button, Field, Banner, Disclosure } from "./ui";
import { ProposalStyles, ProposalLayoutOptions } from "./proposal-styles";
import { TeamStudio } from "./team-studio";
import { ReferenceDocuments } from "./reference-documents";
import { StoredSignatureEditor } from "./company-signature";
import { StaffSignIn, isStaffSignedOut } from "./staff-sign-in";
type Runner = (fn: () => Promise<unknown>, success?: string) => Promise<void>;
function workspaceInitialSection(initial: string) {
  const hash = typeof window === "undefined" ? "" : location.hash.slice(1);
  const requested =
    initial === "brand" && workspaceSections.some(([key]) => key === hash)
      ? hash
      : initial;
  return workspaceSections.some(([key]) => key === requested)
    ? requested
    : "brand";
}

function WorkspaceFrame({
  section,
  onSelect,
  onBlur,
  status,
  children,
}: {
  section: string;
  onSelect?: (section: (typeof workspaceSections)[number][0]) => void;
  onBlur?: () => void;
  status?: ReactNode;
  children: ReactNode;
}) {
  const label = workspaceSections.find(([key]) => key === section)?.[1];
  return (
    <div className="studio-workspace-v3">
      <div className="workspace-auto-label">Changes save automatically</div>
      <nav aria-label="Workspace sections" className="workspace-section-list">
        {workspaceSections.map(([key, name]) => (
          <button
            key={key}
            aria-current={section === key ? "page" : undefined}
            disabled={!onSelect}
            onClick={() => onSelect?.(key)}
          >
            {name}
          </button>
        ))}
      </nav>
      <section
        id={section}
        className="workspace-section-card"
        aria-label={label}
        onBlur={onBlur}
      >
        <header>
          <h2>{label}</h2>
          {status}
        </header>
        {children}
      </section>
    </div>
  );
}

export function WorkspaceLoading({ initial = "brand" }: { initial?: string }) {
  const section = workspaceSections.some(([key]) => key === initial)
    ? initial
    : "brand";
  return (
    <WorkspaceFrame section={section}>
      <Skeleton kind="table" label="Loading workspace settings…" />
    </WorkspaceFrame>
  );
}

export function WorkspaceStudio({
  data,
  run,
  initial = "brand",
}: {
  data: Data;
  run: Runner;
  initial?: string;
}) {
  const fontInput = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState(() =>
    workspaceInitialSection(initial),
  );
  const [draft, setDraft] = useState(
    (data.settings ?? data.workspace_defaults)!,
  );
  const [fonts, setFonts] = useState<ProposalFont[]>([]),
    [licensed, setLicensed] = useState(false),
    [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [addedColor, setAddedColor] = useState<number | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>();
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
    logoFile = useRef<HTMLInputElement>(null),
    iconFile = useRef<HTMLInputElement>(null);
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
  const saveFailed = useRef(false);
  useReloadGuard({
    blocked: Object.values(states).some((s) => !!s.error),
    pending: Object.values(states).some(
      (s) => s.status === "Saving…" || s.status === "Unsaved changes",
    ),
    hasPendingWork: () => !!pending.current || !!flight.current,
    flush,
  });
  async function flush(): Promise<boolean> {
    clearTimeout(timer.current);
    if (flight.current) {
      await flight.current;
      return pending.current ? flush() : !saveFailed.current;
    }
    if (!pending.current) return !saveFailed.current;
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
          saveFailed.current = false;
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
          saveFailed.current = true;
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
    return !saveFailed.current;
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
  function offerSuggestions(colors: string[]) {
    const saved = [
      model.current.accent_colour,
      ...(model.current.brand_palette ?? []),
    ];
    setSuggestions(
      [...new Set(colors)].filter(
        (c) => !saved.some((n) => n.toLowerCase() === c.toLowerCase()),
      ),
    );
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
      <Switch
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
      <Select
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
      </Select>
    </Field>
  );
  const cards: Record<string, ReactNode> = {
    brand: (
      <>
        <p>Shown on client pages, emails and PDFs.</p>
        <div className="workspace-control-grid workspace-brand-top">
          {text("Workspace name", "company_name")}
        </div>
        <div className="workspace-brand-assets">
          <div className="workspace-logo-row">
            <div className="workspace-logo-heading">
              <label htmlFor="workspace-logo-upload">Logo</label>
              <p className="muted">
                Used on covers, client pages, emails and PDFs
              </p>
            </div>
            <div className="workspace-logo-preview">
              {draft.logo ? (
                <img
                  src={logoPreview ?? "/api/workspace-logo"}
                  alt="Workspace logo"
                />
              ) : (
                <span className="workspace-logo-empty" aria-hidden="true">
                  {draft.company_name.slice(0, 1)}
                </span>
              )}
            </div>
            <div className="workspace-logo-label">
              <span className="workspace-logo-file">
                {draft.logo
                  ? logoMeta
                    ? `${logoMeta.name} · ${Math.max(1, Math.round(logoMeta.size / 1024))} KB`
                    : "Workspace logo.png"
                  : "No logo uploaded"}
              </span>
              <input
                type="file"
                id="workspace-logo-upload"
                aria-label="Logo · used on covers, client pages, emails and PDFs"
                ref={logoFile}
                className="sr-only"
                tabIndex={-1}
                accept="image/png"
                disabled={!owner || uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  try {
                    const image = await readData(file);
                    const result = await post("/api/workspace-logo", { image });
                    setLogoPreview(image);
                    offerSuggestions(result.palette_suggestions ?? []);
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
              <Button
                variant="ghost"
                disabled={!owner || uploading}
                onClick={() => logoFile.current?.click()}
              >
                {draft.logo ? "Replace" : "Upload logo"}
              </Button>
            </div>
          </div>
          <div className="workspace-logo-row workspace-icon-row">
            <div className="workspace-logo-heading">
              <label htmlFor="workspace-icon-upload">Logo icon</label>
              <p className="muted">
                Square, shown next to your workspace name and as the browser-tab
                icon on client pages
              </p>
            </div>
            <div className="workspace-logo-preview">
              {draft.logo_icon ? (
                <img
                  src={`/api/workspace-icon?size=128&v=${encodeURIComponent(draft.logo_icon.path)}`}
                  alt="Workspace logo icon"
                />
              ) : (
                <span className="workspace-logo-empty" aria-hidden="true">
                  {draft.company_name.slice(0, 1)}
                </span>
              )}
            </div>
            <div className="workspace-logo-label">
              <span className="workspace-logo-file">
                {draft.logo_icon
                  ? `${draft.logo_icon.name} · ${Math.max(1, Math.round(draft.logo_icon.size / 1024))} KB`
                  : "No logo icon uploaded"}
              </span>
              <input
                id="workspace-icon-upload"
                aria-label="Logo icon · square, shown next to your workspace name and as the browser-tab icon on client pages"
                type="file"
                ref={iconFile}
                className="sr-only"
                tabIndex={-1}
                accept="image/png"
                disabled={!owner || uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  try {
                    if (file.type !== "image/png")
                      throw new Error(
                        "PNG icon required (SVG is not supported)",
                      );
                    if (file.size >= 750000)
                      throw new Error("Logo icon must be under 750 KB");
                    const result = await post("/api/workspace-icon", {
                      image: await readData(file),
                      name: file.name,
                    });
                    change({ logo_icon: result.icon }, true);
                    setUploadError("");
                  } catch (error) {
                    setUploadError((error as Error).message);
                  } finally {
                    setUploading(false);
                    e.target.value = "";
                  }
                }}
              />
              <div className="workspace-logo-actions">
                <Button
                  variant="ghost"
                  disabled={!owner || uploading}
                  onClick={() => iconFile.current?.click()}
                >
                  {draft.logo_icon ? "Replace" : "Upload logo icon"}
                </Button>
                {draft.logo_icon && (
                  <Button
                    variant="ghost"
                    disabled={!owner || uploading}
                    onClick={() => {
                      change({ logo_icon: null }, true);
                      setUploadError("");
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
          <p className="muted workspace-logo-requirements">
            PNG only, under 750 KB. Logo icon: square, at least 1024×1024 for
            cover graphics. Smaller icons (at least 128×128) still work in
            navigation and browser tabs.
          </p>
          {!owner && (
            <p className="muted">
              Only a super admin can change workspace logos.
            </p>
          )}
        </div>
        <section className="workspace-palette" aria-label="Brand colors">
          <h3>Brand colors</h3>
          <p className="muted">
            Used on covers, accents and buttons. Primary plus up to four more.
          </p>
          <div className="workspace-color-row">
            <ColorPicker
              label="Primary"
              value={draft.accent_colour}
              variant="brand"
              primary
              settings={draft}
              disabled={!owner}
              onChange={(color) => change({ accent_colour: color })}
              onClose={() => void flush()}
            />
            {(draft.brand_palette ?? []).map((color, index) => (
              <ColorPicker
                key={index}
                label={`Color ${index + 2}`}
                value={color}
                variant="brand"
                settings={draft}
                disabled={!owner}
                initialOpen={addedColor === index + 1}
                onChange={(color) =>
                  change({
                    brand_palette: (draft.brand_palette ?? []).map((c, n) =>
                      n === index ? color : c,
                    ),
                  })
                }
                onClose={() => void flush()}
                onRemove={() =>
                  change(
                    {
                      brand_palette: draft.brand_palette?.filter(
                        (_, n) => n !== index,
                      ),
                    },
                    true,
                  )
                }
              />
            ))}
            {(draft.brand_palette?.length ?? 0) < 4 && (
              <div className="color-choice color-choice-brand">
                <button
                  type="button"
                  className="add-brand-color"
                  aria-label="Add color"
                  disabled={!owner}
                  onClick={() => {
                    const used = [
                      draft.accent_colour,
                      ...(draft.brand_palette ?? []),
                    ];
                    const color = [
                      "#335577",
                      "#74ccdb",
                      "#ea4e26",
                      "#2f5d50",
                      "#8b6a4f",
                    ].find(
                      (c) =>
                        !used.some((v) => v.toLowerCase() === c.toLowerCase()),
                    )!;
                    setAddedColor((draft.brand_palette?.length ?? 0) + 1);
                    change(
                      {
                        brand_palette: [...(draft.brand_palette ?? []), color],
                      },
                      true,
                    );
                  }}
                >
                  +
                </button>
                <span>Add</span>
              </div>
            )}
          </div>
          {!!suggestions.filter(
            (c) =>
              ![draft.accent_colour, ...(draft.brand_palette ?? [])].some(
                (n) => n.toLowerCase() === c.toLowerCase(),
              ),
          ).length ? (
            <div className="palette-suggestions">
              <header>
                <strong>From your logo</strong>
                <span>
                  <Button
                    variant="ghost"
                    disabled={!owner || (draft.brand_palette?.length ?? 0) >= 4}
                    onClick={() => {
                      const next = acceptBrandSuggestions(
                        draft.accent_colour,
                        draft.brand_palette ?? [],
                        suggestions,
                      );
                      change({ brand_palette: next.palette }, true);
                      setSuggestions(next.remaining);
                    }}
                  >
                    Add all
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!owner}
                    onClick={() => setSuggestions([])}
                  >
                    Dismiss
                  </Button>
                </span>
              </header>
              <div className="suggestion-pills">
                {suggestions
                  .filter(
                    (c) =>
                      ![
                        draft.accent_colour,
                        ...(draft.brand_palette ?? []),
                      ].some((n) => n.toLowerCase() === c.toLowerCase()),
                  )
                  .map((color) => (
                    <span className="suggestion-pill" key={color}>
                      <i style={{ background: color }} />
                      <code>{color.toUpperCase()}</code>
                      <button
                        type="button"
                        aria-label={`Add ${color.toUpperCase()} to brand colors`}
                        disabled={
                          !owner || (draft.brand_palette?.length ?? 0) >= 4
                        }
                        onClick={() => {
                          const next = acceptBrandSuggestions(
                            draft.accent_colour,
                            draft.brand_palette ?? [],
                            [color],
                          );
                          change({ brand_palette: next.palette }, true);
                          setSuggestions((s) =>
                            s.filter((c) => !next.added.includes(c)),
                          );
                        }}
                      >
                        +
                      </button>
                    </span>
                  ))}
              </div>
              <p>
                Suggested automatically when you upload a logo. Never replaces
                your saved colors.
              </p>
            </div>
          ) : (
            !!draft.logo && (
              <Button
                variant="ghost"
                disabled={!owner}
                onClick={async () => {
                  try {
                    offerSuggestions(
                      (
                        await api<{ colors: string[] }>(
                          "/api/workspace-palette",
                        )
                      ).colors,
                    );
                  } catch (e) {
                    setUploadError((e as Error).message);
                  }
                }}
              >
                Suggest from logo
              </Button>
            )
          )}
        </section>
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
        <details
          open={
            (typeof location !== "undefined" &&
              location.hash === "#workspace-business-state") ||
            undefined
          }
        >
          <Disclosure>Workspace contact details</Disclosure>
          <div className="stack">
            {text("Owner contact name", "owner")}
            {text("Contact email", "email", "email")}
            {text("Phone", "phone")}
            {text("Address", "address")}
            <Field label="Business state">
              <Select
                id="workspace-business-state"
                disabled={!owner}
                value={draft.business_state?.name ?? ""}
                onChange={(e) =>
                  change(
                    {
                      business_state: {
                        name: e.target.value as any,
                        other: draft.business_state?.other ?? "",
                      },
                    },
                    true,
                  )
                }
              >
                <option value="">Choose your business state</option>
                {businessStates.map((state) => (
                  <option key={state}>{state}</option>
                ))}
                <option value="other">Other / outside the US</option>
              </Select>
            </Field>
            {draft.business_state?.name === "other" && (
              <Field label="State or region">
                <input
                  disabled={!owner}
                  maxLength={200}
                  value={draft.business_state.other}
                  onChange={(e) =>
                    change({
                      business_state: { name: "other", other: e.target.value },
                    })
                  }
                />
              </Field>
            )}
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
        <div className="field">
          <span>Upload a font file · WOFF2 or TTF, under 1 MB</span>
          <input
            ref={fontInput}
            aria-label="Upload a font file · WOFF2 or TTF, under 1 MB"
            type="file"
            accept=".woff2,.ttf"
            hidden
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
          <Button
            className="action"
            disabled={!licensed || uploading}
            onClick={() => fontInput.current?.click()}
          >
            Upload font
          </Button>
        </div>
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
          <div data-sample-heading="1">A proposal for your next chapter</div>
          <div data-sample-heading="2">Overview</div>
          <p>
            Thank you for sharing your plans. This proposal sets out the work,
            the investment and the next steps.
          </p>
        </article>
      </>
    ),
    styles: (
      <>
        <ProposalLayoutOptions
          workspace
          styles={resolveStyles(draft)}
          value={draft.proposal_styles}
          onChange={(proposal_styles) => change({ proposal_styles })}
        />
        <ProposalStyles
          settings={draft}
          value={draft.proposal_styles ?? {}}
          availableFonts={allFonts}
          onChange={(proposal_styles) => change({ proposal_styles })}
          scope="workspace"
          hidePageMargins
        />
      </>
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
          <a href="/studio/connections/stripe">
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
          <a href="/studio/connections/quickbooks">
            <span className={data.connections?.qbo ? "success" : "warning"}>
              ● {data.connections?.qbo ? "Sandbox configured" : "Not connected"}
            </span>{" "}
            · {data.connections?.qbo ? "Manage" : "Connect"}
          </a>
        </div>
        <div className="workspace-setting-row workspace-payment-methods workspace-billing-control">
          <div>
            <h3 id="payment-methods-label">Payment methods</h3>
            <p id="payment-methods-hint">
              For new recurring Stripe Checkout payments. US bank payments take
              a few business days to clear. Existing subscribers have no new
              payment step.
            </p>
          </div>
          <Select
            aria-labelledby="payment-methods-label"
            aria-describedby="payment-methods-hint"
            disabled={!owner}
            value={draft.payment_methods ?? "card"}
            onChange={(e) =>
              change(
                {
                  payment_methods: e.target
                    .value as WorkspaceSettings["payment_methods"],
                },
                true,
              )
            }
          >
            <option value="card">Card</option>
            <option value="card_ach">Card + US bank account (ACH)</option>
          </Select>
        </div>
        <div className="workspace-setting-row workspace-billing-control">
          <div>
            <h3 id="qbo-delivery-label">QuickBooks invoices</h3>
            <p>
              Choose whether to review one-time invoices in QuickBooks or email
              them when the client signs.
            </p>
          </div>
          <Select
            aria-labelledby="qbo-delivery-label"
            disabled={!owner}
            value={draft.qbo_invoice_delivery ?? "draft"}
            onChange={(event) =>
              change(
                {
                  qbo_invoice_delivery:
                    event.currentTarget.value === "email" ? "email" : "draft",
                },
                true,
              )
            }
          >
            <option value="draft">Create as draft for review</option>
            <option value="email">Create and email to the client</option>
          </Select>
        </div>
        <div className="workspace-setting-row workspace-billing-control">
          <div>
            <h3>One-time product mapping</h3>
            <p>
              Invoice lines use this QuickBooks product or service unless the
              Yeswell product has its own mapping in Studio › Products.
            </p>
          </div>
          <QuickBooksPicker
            label="Default QuickBooks item"
            initial={draft.qbo_custom_item_ref}
            enabled={data.connections?.qbo_connection?.state === "connected"}
            disabled={!owner}
            emptyLabel="No default item"
            onChange={(qbo_custom_item_ref) =>
              change({ qbo_custom_item_ref }, true)
            }
          />
        </div>
        <details className="workspace-more">
          <Disclosure>More billing settings</Disclosure>
          <div className="stack">
            <Field label="Collection method">
              <Select
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
              </Select>
            </Field>
            <QuickBooksPicker
              label="Default invoice terms"
              kind="terms"
              initial={draft.qbo_term_ref}
              enabled={data.connections?.qbo_connection?.state === "connected"}
              disabled={!owner}
              emptyLabel="Use QuickBooks default"
              onChange={(qbo_term_ref) => change({ qbo_term_ref }, true)}
            />
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
            <Select
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
            </Select>
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
        <div className="workspace-setting-row workspace-reminder-row">
          <div>
            <h3>Reply-to</h3>
            <p>Where client replies go.</p>
          </div>
          <div className="field">
            <Select
              aria-label="Reply-to"
              value={draft.email_reply_to ?? "sender"}
              disabled={!owner}
              onChange={(e) =>
                change({
                  email_reply_to: e.target.value as "sender" | "workspace",
                })
              }
            >
              <option value="sender">Sender</option>
              <option value="workspace">Workspace sending address</option>
            </Select>
          </div>
        </div>
        {(
          [
            [
              "in_app",
              "First client view · in-app note",
              "Show a note on the proposal record after its first qualified client view.",
            ],
            [
              "email",
              "First client view · staff email",
              "Email staff once when a client first views a sent proposal.",
            ],
          ] as const
        ).map(([key, label, hint]) => (
          <div
            className="workspace-setting-row workspace-reminder-row"
            key={key}
          >
            <div>
              <h3>{label}</h3>
              <p>{hint}</p>
            </div>
            <label className="workspace-engagement-switch workspace-switch">
              <span className="sr-only">{label}</span>
              <Switch
                aria-label={label}
                disabled={!owner}
                checked={
                  draft.engagement_notifications?.[key] ?? key === "in_app"
                }
                onChange={(e) =>
                  change({
                    engagement_notifications: {
                      in_app: draft.engagement_notifications?.in_app ?? true,
                      email: draft.engagement_notifications?.email ?? false,
                      [key]: e.target.checked,
                    },
                  })
                }
              />
            </label>
          </div>
        ))}
        <div className="workspace-setting-row workspace-reminder-row">
          <div>
            <h3>Client questions · notify super admins</h3>
            <p>
              The proposal owner is notified when a client asks a question. Turn
              this on to notify super admins too.
            </p>
          </div>
          <Switch
            aria-label="Notify super admins about client questions"
            disabled={!owner}
            checked={draft.question_notify_admins ?? false}
            onChange={(e) =>
              change({ question_notify_admins: e.target.checked })
            }
          />
        </div>
        <ReminderRules
          settings={draft}
          disabled={!owner}
          onChange={(reminder_rules) => change({ reminder_rules })}
        />
        <div className="workspace-setting-row workspace-reminder-row">
          <div>
            <h3>Remind staff to countersign</h3>
            <p>
              Next morning is 9:00 on the next Monday–Friday in {draft.timezone}
              .
            </p>
          </div>
          <div className="workspace-reminder-controls field">
            <Select
              aria-label="Remind staff to countersign"
              value={draft.countersign_reminder?.mode ?? "off"}
              disabled={!owner}
              onChange={(e) =>
                change({
                  countersign_reminder: {
                    mode: e.target.value as
                      "off" | "next_morning" | "after_days",
                    days: draft.countersign_reminder?.days ?? 1,
                  },
                })
              }
            >
              <option value="off">Off</option>
              <option value="next_morning">Next morning</option>
              <option value="after_days">After days</option>
            </Select>
            {draft.countersign_reminder?.mode === "after_days" && (
              <label>
                After{" "}
                <input
                  type="number"
                  aria-label="Countersign reminder days"
                  min={1}
                  max={365}
                  value={draft.countersign_reminder.days}
                  disabled={!owner}
                  onChange={(e) =>
                    change({
                      countersign_reminder: {
                        mode: "after_days",
                        days: e.target.valueAsNumber,
                      },
                    })
                  }
                />{" "}
                days
              </label>
            )}
          </div>
        </div>
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
        <Select
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
        </Select>
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
    <WorkspaceFrame
      section={section}
      onSelect={go}
      onBlur={() => void flush()}
      status={
        (uploading || current) && (
          <span role="status" className={current?.error ? "danger" : "muted"}>
            {uploading ? "Uploading…" : (current?.status ?? "")}
          </span>
        )
      }
    >
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
    </WorkspaceFrame>
  );
}

function ReminderRules({
  settings,
  disabled,
  onChange,
}: {
  settings: WorkspaceSettings;
  disabled: boolean;
  onChange: (rules: NonNullable<WorkspaceSettings["reminder_rules"]>) => void;
}) {
  const legacy = [...new Set(settings.reminder_days)].sort((a, b) => a - b);
  const rules = settings.reminder_rules ?? {
    enabled: legacy.length > 0,
    unopened_days: Math.min(365, legacy[0] ?? 3),
    viewed_days: Math.min(365, legacy[1] ?? legacy[0] ?? 7),
    stop_after: Math.max(1, legacy.length || 2),
  };
  const update = (patch: Partial<typeof rules>) =>
    onChange({ ...rules, ...patch });
  return (
    <>
      {!settings.reminder_rules && (
        <p className="workspace-reminder-legacy">
          Current schedule:{" "}
          {legacy.length
            ? `days ${legacy.join(" and ")} after sending`
            : "automatic reminders off"}
          . Saving reminder timing applies repeating rules to future sends and
          reopens. Already-sent proposals keep their schedule.
        </p>
      )}
      <div className="workspace-setting-row workspace-reminder-row">
        <div>
          <h3>Automatic client reminders</h3>
          <p>
            Each proposal keeps its own Automatic reminders switch. Manually
            delivered proposals start with it off.
          </p>
        </div>
        <label className="check-row workspace-switch">
          <Switch
            aria-label="Automatic client reminders"
            disabled={disabled}
            checked={rules.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          <span>{rules.enabled ? "On" : "Off"}</span>
        </label>
      </div>
      {(
        [
          [
            "unopened_days",
            "Not opened",
            "Counts from sending or reopening. A view stops these reminders.",
          ],
          [
            "viewed_days",
            "Viewed, not signed",
            "Counts from the first view after sending or reopening.",
          ],
        ] as const
      ).map(([key, title, help]) => (
        <div className="workspace-setting-row workspace-reminder-row" key={key}>
          <div>
            <h3>{title}</h3>
            <p>{help}</p>
            <small>
              {settings.reminder_rules
                ? rules.enabled
                  ? `Every ${rules[key]} ${rules[key] === 1 ? "day" : "days"}, up to ${rules.stop_after} ${rules.stop_after === 1 ? "reminder" : "reminders"} across both kinds`
                  : "Off"
                : "Legacy schedule above stays in effect until you save these controls."}
            </small>
          </div>
          <div className="workspace-reminder-controls field">
            <label>
              After{" "}
              <input
                type="number"
                aria-label={`${title} days`}
                min={1}
                max={365}
                value={rules[key]}
                disabled={disabled || !rules.enabled}
                onChange={(e) => update({ [key]: e.target.valueAsNumber })}
              />{" "}
              days
            </label>
          </div>
        </div>
      ))}
      <div className="workspace-setting-row workspace-reminder-row">
        <div>
          <h3>Stop after</h3>
          <p>
            Per proposal, across unopened and viewed reminders. Manual reminders
            are not counted.
          </p>
        </div>
        <div className="workspace-reminder-controls field">
          <label>
            <input
              type="number"
              aria-label="Stop after reminders"
              min={1}
              max={100}
              value={rules.stop_after}
              disabled={disabled || !rules.enabled}
              onChange={(e) => update({ stop_after: e.target.valueAsNumber })}
            />{" "}
            reminders
          </label>
        </div>
      </div>
      <p className="muted">
        Calendar days use {settings.timezone}. Settings apply on the next Send
        or Reopen.
      </p>
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
