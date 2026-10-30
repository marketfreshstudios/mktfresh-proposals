"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { Data } from "./staff-app";
import type { Block, Item, Template } from "../lib/model";
import type { WorkspaceSettings } from "../lib/workspace";
import type { Activity } from "../lib/studio";
import { whiteContrast, accessibleAccent } from "../lib/brand";
import {
  curatedFonts,
  fontCss,
  fontFamily,
  type FontChoice,
  type ProposalFont,
} from "../lib/proposal-fonts";
import { itemDisplayName, sellableCatalogue } from "../lib/catalogue-display";
import { intervalSuffix } from "../lib/money";
import { eventLabel } from "../lib/event-label";
import { inactiveTemplateItems } from "../lib/template-quote";
import { api, post, Button, Banner, Field, Empty } from "./ui";
import { Sheet, Skeleton } from "./foundation";
import { StoredSignatureEditor } from "./company-signature";
import { ReferenceDocuments } from "./reference-documents";
import { Reorder, Sortable } from "./quote-editor";
import { catalogQuoteItem } from "../lib/quote-model";
import type { QuoteItem } from "../lib/model";
import { BlocksEditor } from "./editor";
import { useMoney } from "./money-context";
import { TemplateWarnings } from "./template-warnings";
type Runner = (fn: () => Promise<unknown>, success?: string) => Promise<void>;
function useSave(run: Runner) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return {
    error,
    busy,
    save: async (action: () => Promise<unknown>, message = "Saved") => {
      setError("");
      setBusy(true);
      try {
        await action();
        await run(async () => {}, message);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to save. Try again.");
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}
function SaveError({ error }: { error: string }) {
  return error ? (
    <Banner tone="danger" title="Your changes are still here">
      {error} Correct the issue and try again.
    </Banner>
  ) : null;
}
function Section({
  title,
  id,
  children,
  description,
}: {
  title: string;
  id?: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <section className="studio-section" id={id}>
      <header>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      <div className="stack">{children}</div>
    </section>
  );
}
export function WorkspaceStudio({ data, run }: { data: Data; run: Runner }) {
  const s = data.settings;
  const [accent, setAccent] = useState(s?.accent_colour ?? "#245547"),
    [logo, setLogo] = useState(s?.logo ?? null),
    [image, setImage] = useState(s?.company_signatory?.image ?? null),
    [allowed, setAllowed] = useState(
      s?.company_signatory?.authorized_user_ids ?? [],
    );
  const [heading, setHeading] = useState<FontChoice>(
      s?.proposal_fonts?.heading ?? "serif",
    ),
    [body, setBody] = useState<FontChoice>(s?.proposal_fonts?.body ?? "serif"),
    [fonts, setFonts] = useState<ProposalFont[]>([]),
    [licensed, setLicensed] = useState(false),
    [uploadError, setUploadError] = useState(""),
    [passwordEnabled, setPasswordEnabled] = useState(
      s?.default_password_enabled ?? false,
    );
  const [logoPreview, setLogoPreview] = useState(""),
    [uploading, setUploading] = useState(false);
  const owner = data.user.staff_role === "owner",
    save = useSave(run),
    contrast = whiteContrast(accent);
  useEffect(() => {
    api<ProposalFont[]>("/api/workspace-fonts")
      .then(setFonts)
      .catch((e) => setUploadError(e.message));
  }, []);
  const allFonts = [
    ...new Map(
      [
        ...fonts,
        ...[heading, body].filter(
          (f): f is ProposalFont => typeof f !== "string",
        ),
      ].map((f) => [f.id, f]),
    ).values(),
  ];
  return (
    <div className="studio-workspace stack">
      <nav className="studio-tabs" aria-label="Workspace sections">
        {["Brand", "Money", "Team", "Signatory", "Fonts", "Client links"].map(
          (t) => (
            <a href={`#${t.toLowerCase().replaceAll(" ", "-")}`} key={t}>
              {t}
            </a>
          ),
        )}
      </nav>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await save.save(
            () =>
              post("/api/workspace_settings", {
                ...s,
                ...Object.fromEntries(f),
                logo,
                accent_colour: accent,
                proposal_fonts: { heading, body },
                money: { cents: f.get("cents") },
                default_validity_days: Number(f.get("default_validity_days")),
                reminder_days: String(f.get("reminder_days"))
                  .split(",")
                  .filter((n) => n.trim())
                  .map(Number),
                qbo_custom_item_ref: f.get("qbo_custom_item_ref") || null,
                ...(owner
                  ? {
                      default_password: !passwordEnabled
                        ? null
                        : f.get("default_password") || undefined,
                      company_signatory: {
                        ...s?.company_signatory,
                        name: f.get("signatory_name"),
                        title: f.get("signatory_title"),
                        user_id: f.get("signatory_user_id") || null,
                        email:
                          data.staff.find(
                            (m) => m.user_id === f.get("signatory_user_id"),
                          )?.email ?? s?.email,
                        image,
                        authorized_user_ids: allowed,
                      },
                    }
                  : {}),
              }),
            "Workspace settings saved",
          );
        }}
      >
        <Section
          title="Brand"
          id="brand"
          description="Your identity on proposals, client links and sealed copies."
        >
          <div className="studio-brand-grid">
            <div className="stack">
              {logo && (
                <img
                  className="workspace-logo-preview"
                  src={logoPreview || "/api/workspace-logo"}
                  alt="Workspace logo"
                />
              )}
              <Field label="Workspace name">
                <input
                  name="company_name"
                  defaultValue={s?.company_name}
                  required
                />
              </Field>
              <Field label="Logo · PNG, under 750 KB">
                <input
                  type="file"
                  accept="image/png"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    try {
                      const image = await readData(file);
                      const result = await post("/api/workspace-logo", {
                        image,
                      });
                      setLogoPreview(image);
                      setLogo(result.path);
                      setUploadError("");
                    } catch (e) {
                      setUploadError(String(e));
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </Field>
              <Field label="Accent">
                <div className="actions">
                  <input
                    type="color"
                    aria-label="Accent color"
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                  />
                  <code>{accent}</code>
                </div>
              </Field>
              <p
                className={contrast < 4.5 ? "danger" : "success"}
                aria-live="polite"
              >
                {contrast.toFixed(2)}:1 with white text ·{" "}
                {contrast >= 4.5 ? "Readable" : "Needs at least 4.5:1"}
              </p>
              {contrast < 4.5 && (
                <Button onClick={() => setAccent(accessibleAccent(accent))}>
                  Use {accessibleAccent(accent)} — darker, same hue
                </Button>
              )}
            </div>
            <div className="stack">
              {[
                ["owner", "Owner contact name"],
                ["email", "Contact email"],
                ["phone", "Phone"],
                ["address", "Address"],
              ].map(([key, label]) => (
                <Field label={label} key={key}>
                  <input
                    name={key}
                    defaultValue={String(
                      s?.[key as keyof WorkspaceSettings] ?? "",
                    )}
                    required={key === "email"}
                    type={key === "email" ? "email" : "text"}
                  />
                </Field>
              ))}
            </div>
          </div>
        </Section>
        <Section title="Money" id="money">
          <Field label="Currency">
            <select name="currency" defaultValue={s?.currency ?? "USD"}>
              {["USD", "CAD", "GBP", "EUR", "AUD"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <fieldset className="studio-radio">
            <legend>Cents</legend>
            {[
              ["auto", "Only when needed · $500 · $49.50"],
              ["always", "Always show cents · $500.00"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="cents"
                  value={value}
                  defaultChecked={(s?.money?.cents ?? "auto") === value}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <p>
            Applies to new sends. Signed proposals keep their saved currency and
            formatting.
          </p>
        </Section>
        <Section
          title="Company signatory"
          id="signatory"
          description="Every company signature presents as this person. The audit records who applied it."
        >
          <fieldset className="stack" disabled={!owner}>
            <legend className="screen-reader">Signatory and delegates</legend>
            {!owner && (
              <p>Only an owner can change the signatory or delegates.</p>
            )}
            <div className="studio-brand-grid">
              <Field label="Signatory name">
                <input
                  name="signatory_name"
                  defaultValue={s?.company_signatory?.name ?? s?.owner}
                  required
                />
              </Field>
              <Field label="Signatory title">
                <input
                  name="signatory_title"
                  defaultValue={s?.company_signatory?.title ?? "Owner"}
                  required
                />
              </Field>
            </div>
            <Field label="Signatory staff account">
              <select
                name="signatory_user_id"
                defaultValue={s?.company_signatory?.user_id ?? ""}
              >
                <option value="">Choose a staff account</option>
                {data.staff.map((m) => (
                  <option value={m.user_id} key={m.user_id}>
                    {m.display_name} · {m.email}
                  </option>
                ))}
              </select>
            </Field>
            <StoredSignatureEditor value={image} onChange={setImage} />
            <h3>Who may apply this signature</h3>
            {data.staff.map((m) => (
              <label className="check" key={m.user_id}>
                <input
                  type="checkbox"
                  checked={allowed.includes(m.user_id)}
                  onChange={(e) =>
                    setAllowed(
                      e.target.checked
                        ? [...allowed, m.user_id]
                        : allowed.filter((id) => id !== m.user_id),
                    )
                  }
                />
                {m.display_name} · {m.email}
              </label>
            ))}
          </fieldset>
          <Field label="Electronic signature consent">
            <textarea
              name="consent_text"
              rows={4}
              minLength={20}
              required
              defaultValue={s?.consent_text}
            />
          </Field>
        </Section>
        <Section
          title="Proposal fonts"
          id="fonts"
          description="Used in the document, client page and sealed PDF. Buttons, totals and forms stay in the product font."
        >
          <style>{fontCss({ proposal_fonts: { heading, body } })}</style>
          <div className="studio-brand-grid">
            {[
              ["Headings", heading, setHeading],
              ["Body text", body, setBody],
            ].map(([label, value, set]) => (
              <fieldset className="font-choices" key={label as string}>
                <legend>{label as string}</legend>
                {[
                  ...curatedFonts.map((f) => ({
                    value: f.id as FontChoice,
                    name: f.name,
                  })),
                  ...allFonts.map((f) => ({
                    value: f as FontChoice,
                    name: f.name,
                  })),
                ].map((f) => (
                  <label
                    key={typeof f.value === "string" ? f.value : f.value.id}
                    style={{ fontFamily: fontFamily(f.value) }}
                  >
                    <input
                      type="radio"
                      name={
                        label === "Headings"
                          ? "font_heading_choice"
                          : "font_body_choice"
                      }
                      checked={
                        (typeof value === "string"
                          ? value
                          : (value as ProposalFont).id) ===
                        (typeof f.value === "string" ? f.value : f.value.id)
                      }
                      onChange={() => (set as (f: FontChoice) => void)(f.value)}
                    />{" "}
                    Aa {f.name}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={licensed}
              onChange={(e) => setLicensed(e.target.checked)}
            />
            I confirm this font is licensed for PDF embedding.
          </label>
          <Field label="Upload a font file · WOFF2 or TTF, under 1 MB">
            <input
              type="file"
              accept=".woff2,.ttf"
              disabled={!licensed}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                try {
                  const f = await post<ProposalFont>("/api/workspace-fonts", {
                    name: file.name.replace(/\.(woff2|ttf)$/i, ""),
                    data: await readData(file),
                    licensed,
                  });
                  setFonts([...fonts, f]);
                  setBody(f);
                  setUploadError("");
                } catch (e) {
                  setUploadError(String(e));
                } finally {
                  setUploading(false);
                }
              }}
            />
          </Field>
          <article className="paper proposal-typography font-preview">
            <small>PREVIEW · PHONE WIDTH</small>
            <h1>A proposal for your next chapter</h1>
            <h2>Overview</h2>
            <p>
              Thank you for sharing your plans. This proposal sets out the work,
              the investment and the next steps.
            </p>
            <p className="font-preview-chrome">
              The forms and totals stay easy to read.
            </p>
          </article>
        </Section>
        <Section title="Client links" id="client-links">
          <div className="studio-brand-grid">
            <Field label="Default link validity (days)">
              <input
                name="default_validity_days"
                type="number"
                min="1"
                max="365"
                required
                defaultValue={s?.default_validity_days ?? 30}
              />
            </Field>
            <Field label="Workspace timezone">
              <input
                name="timezone"
                required
                defaultValue={s?.timezone ?? "America/New_York"}
              />
            </Field>
          </div>
          <p>
            New proposals expire at the end of the selected day in this
            timezone. Clear a proposal’s date to make it indefinite.
          </p>
          <Field label="Reminders · days after sending, comma separated">
            <input
              name="reminder_days"
              defaultValue={s?.reminder_days.join(", ") ?? "3, 7"}
            />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              role="switch"
              checked={passwordEnabled}
              disabled={!owner}
              onChange={(e) => setPasswordEnabled(e.target.checked)}
            />
            Password by default
          </label>
          {passwordEnabled && (
            <Field
              label={
                s?.default_password_enabled
                  ? "Replace default password (leave blank to keep it)"
                  : "Default password"
              }
            >
              <input
                name="default_password"
                type="password"
                minLength={8}
                maxLength={200}
                required={!s?.default_password_enabled}
                autoComplete="new-password"
                disabled={!owner}
              />
            </Field>
          )}
          <Field label="Verified sending domain">
            <input
              name="sending_domain"
              readOnly={!owner}
              defaultValue={s?.sending_domain}
            />
          </Field>
          <p>
            Use a domain already verified in your email provider. Replies go to
            the selected staff sender.
          </p>
        </Section>
        <Section title="Billing defaults">
          <Field label="Collection method">
            <select
              name="collection_method"
              defaultValue={s?.collection_method ?? "charge_automatically"}
            >
              <option value="charge_automatically">
                Charge saved payment method
              </option>
              <option value="send_invoice">Send invoice</option>
            </select>
          </Field>
          <Field label="QuickBooks custom services item reference">
            <input
              name="qbo_custom_item_ref"
              defaultValue={s?.qbo_custom_item_ref ?? ""}
            />
          </Field>
        </Section>
        {uploadError && (
          <Banner tone="warning" title="Upload needs attention">
            {uploadError} Choose the file again to retry.
          </Banner>
        )}
        <SaveError error={save.error} />
        <div className="studio-save">
          <Button
            type="submit"
            variant="primary"
            busy={save.busy || uploading}
            disabled={contrast < 4.5}
          >
            Save workspace settings
          </Button>
        </div>
      </form>
      <Section
        title="Team"
        id="team"
        description="Display names appear in emails. Owners can edit everyone; members can edit their own name."
      >
        <TeamNames data={data} run={run} />
        <p>
          Add staff in your authentication administration, then add their user
          IDs to this workspace’s staff list.{" "}
          <a href="/studio/connections">
            Manage assistant access in Connections
          </a>
          .
        </p>
      </Section>
    </div>
  );
}
async function readData(file: File) {
  if (file.size > 1000000) throw new Error("Choose a file under 1 MB.");
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () =>
      reject(new Error("The file could not be read. Choose it again."));
    r.readAsDataURL(file);
  });
}
function TeamNames({ data, run }: { data: Data; run: Runner }) {
  const save = useSave(run);
  return (
    <>
      <SaveError error={save.error} />
      {data.staff.map((m) => (
        <form
          className="team-row"
          key={m.user_id}
          onSubmit={(e) => {
            e.preventDefault();
            const name = new FormData(e.currentTarget).get("display_name");
            void save.save(
              () => post(`/api/team/${m.user_id}`, { display_name: name }),
              "Display name saved",
            );
          }}
        >
          <div>
            <strong>{m.display_name}</strong>
            <small>
              {m.email} · {m.role === "owner" ? "Owner" : "Member"}
            </small>
          </div>
          <Field label={`Display name for ${m.email}`}>
            <input
              name="display_name"
              required
              defaultValue={m.display_name}
              disabled={
                data.user.staff_role !== "owner" &&
                data.user.actor !== "staff:" + m.user_id
              }
            />
          </Field>
          <Button
            type="submit"
            busy={save.busy}
            disabled={
              data.user.staff_role !== "owner" &&
              data.user.actor !== "staff:" + m.user_id
            }
          >
            Save name
          </Button>
        </form>
      ))}
    </>
  );
}
export function CatalogStudio({ data, run }: { data: Data; run: Runner }) {
  const [selected, setSelected] = useState<Item | null | undefined>(undefined),
    [query, setQuery] = useState(""),
    [inactive, setInactive] = useState(false),
    [family, setFamily] = useState(false);
  const money = useMoney();
  const items = data.catalog
    .filter(
      (i) =>
        (inactive || (i.active && !i.legacy)) &&
        `${itemDisplayName(i)} ${i.sku}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .toSorted((a, b) => itemDisplayName(a).localeCompare(itemDisplayName(b)));
  return (
    <div className="stack studio-catalog">
      <div className="actions">
        <Button
          onClick={() =>
            run(
              () => post("/api/catalog-sync/stripe"),
              "Stripe test catalog synced",
            )
          }
        >
          Sync now · Stripe test
        </Button>
        <Button onClick={() => setFamily(true)}>+ Custom family</Button>
        <Button onClick={() => setSelected(null)}>+ Item</Button>
      </div>
      <p>
        List prices are the values you set in Stripe. Enter each amount on a
        proposal; the app never suggests a price.
      </p>
      <TemplateWarnings templates={data.templates} catalog={data.catalog} />
      <div className="studio-filters">
        <Field label="Search catalog">
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={inactive}
            onChange={(e) => setInactive(e.target.checked)}
          />
          Include inactive and legacy
        </label>
      </div>
      {items.length ? (
        <div className="catalog-table">
          <div className="catalog-heading">
            <span>Item</span>
            <span>List price</span>
            <span>Source</span>
            <span>Terms</span>
            <span>Accounting</span>
          </div>
          {items.map((i) => (
            <button
              className="catalog-row"
              key={i.id}
              onClick={() => setSelected(i)}
            >
              <span>
                <strong>{itemDisplayName(i)}</strong>
                <small>
                  {i.sku}
                  {!i.active ? " · Inactive" : i.legacy ? " · Legacy" : ""}
                </small>
              </span>
              <span>
                {(i.sublines ?? [i]).map((s, n) => (
                  <span className="catalog-price" key={n}>
                    {money(s.amount)}
                    {intervalSuffix(s.interval)}
                  </span>
                ))}
              </span>
              <span>{i.stripe_lookup_key ? "Stripe" : "Entered"}</span>
              <span>
                {i.min_term_months
                  ? `${i.min_term_months}-month minimum`
                  : i.interval === "one_time"
                    ? "One-time"
                    : "Month to month"}
                {i.schedule && (
                  <small>
                    After {i.schedule.after_paid_invoices} paid invoices ·{" "}
                    {money(i.schedule.then.amount)}
                    {intervalSuffix(i.interval)}
                  </small>
                )}
              </span>
              <span>
                {i.qbo_item_ref
                  ? "QBO item"
                  : i.stripe_lookup_key
                    ? "Stripe"
                    : "Not mapped"}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title={query ? "No matching items" : "Your catalog starts here"}
          action={
            <Button onClick={() => setQuery("")}>
              {query ? "Clear search" : "Show inactive items"}
            </Button>
          }
        >
          Sync your Stripe test catalog or add an item.
        </Empty>
      )}
      <section className="studio-section">
        <h2>Custom families</h2>
        {data.families.length ? (
          data.families.map((f) => (
            <div className="row" key={f.id}>
              <strong>{f.name}</strong>
              <span>
                {f.active ? "Active" : "Inactive"} · Amount entered per proposal
              </span>
            </div>
          ))
        ) : (
          <p>
            No custom families yet. Use a service name, never a client name.
          </p>
        )}
      </section>
      {selected !== undefined && (
        <Sheet
          title={selected ? itemDisplayName(selected) : "New catalog item"}
          onClose={() => setSelected(undefined)}
        >
          <CatalogItem
            key={selected?.id ?? "new"}
            item={selected}
            data={data}
            run={run}
            close={() => setSelected(undefined)}
          />
        </Sheet>
      )}
      {family && (
        <Sheet title="New custom family" onClose={() => setFamily(false)}>
          <FamilyForm run={run} close={() => setFamily(false)} />
        </Sheet>
      )}
    </div>
  );
}
function FamilyForm({ run, close }: { run: Runner; close: () => void }) {
  const save = useSave(run);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const name = new FormData(e.currentTarget).get("name");
        if (
          await save.save(
            () =>
              post("/api/custom-families", {
                name,
                request_id: crypto.randomUUID(),
              }),
            "Custom family created",
          )
        )
          close();
      }}
    >
      <p>
        Use a service name. Existing Stripe products are checked for duplicates.
      </p>
      <Field label="Service family name">
        <input name="name" minLength={3} required />
      </Field>
      <SaveError error={save.error} />
      <Button type="submit" busy={save.busy}>
        Create in Stripe test mode
      </Button>
    </form>
  );
}
function CatalogItem({
  item: i,
  data,
  run,
  close,
}: {
  item: Item | null;
  data: Data;
  run: Runner;
  close: () => void;
}) {
  const save = useSave(run),
    money = useMoney();
  const [minimum, setMinimum] = useState(i?.min_term_months?.toString() ?? ""),
    [count, setCount] = useState(
      i?.schedule?.after_paid_invoices?.toString() ?? "",
    ),
    [then, setThen] = useState(
      i?.schedule ? String(i.schedule.then.amount / 100) : "",
    ),
    [copy, setCopy] = useState(String(i?.plan_terms?.client_copy ?? ""));
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (
          await save.save(
            () =>
              post("/api/pricing_items", {
                ...i,
                ...Object.fromEntries(f),
                display_name: f.get("display_name") || undefined,
                amount: Math.round(Number(f.get("price")) * 100),
                active: f.get("active") === "on",
                legacy: f.get("legacy") === "on",
                stripe_lookup_key: f.get("stripe_lookup_key") || null,
                qbo_item_ref: f.get("qbo_item_ref") || null,
                min_term_months: minimum ? Number(minimum) : null,
                schedule: count
                  ? {
                      after_paid_invoices: Number(count),
                      then: {
                        amount: Math.round(Number(then) * 100),
                        lookup_key: f.get("then_lookup_key"),
                      },
                    }
                  : null,
                plan_terms: { ...i?.plan_terms, client_copy: copy },
              }),
            "Catalog item saved",
          )
        )
          close();
      }}
    >
      <p>
        Changes apply when an item is next added to a draft. Sent and signed
        proposals retain their saved terms.
      </p>
      {[
        ["name", "Synced name"],
        ["display_name", "Display name"],
        ["sku", "SKU"],
        ["description", "Description"],
        ["stripe_lookup_key", "Stripe lookup key"],
        ["qbo_item_ref", "QuickBooks item reference"],
      ].map(([key, label]) => (
        <Field key={key} label={label}>
          <input
            name={key}
            required={["name", "sku"].includes(key)}
            defaultValue={String(i?.[key as keyof Item] ?? "")}
          />
        </Field>
      ))}
      <p>Display name is app-only. Stripe sync preserves it.</p>
      <div className="studio-brand-grid">
        <Field label="List price">
          <input
            name="price"
            type="number"
            step=".01"
            min="0"
            required
            defaultValue={(i?.amount ?? 0) / 100}
          />
        </Field>
        <Field label="Interval">
          <select name="interval" defaultValue={i?.interval ?? "one_time"}>
            <option value="one_time">One-time</option>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>
        </Field>
      </div>
      <label className="check">
        <input
          type="checkbox"
          name="active"
          defaultChecked={i?.active ?? true}
          role="switch"
        />
        Active
      </label>
      <label className="check">
        <input
          type="checkbox"
          name="legacy"
          defaultChecked={i?.legacy ?? false}
        />
        Legacy · hidden from new quotes
      </label>
      <fieldset className="stack">
        <legend>Plan terms</legend>
        <Field label="Minimum commitment (months)">
          <input
            type="number"
            min="1"
            value={minimum}
            onChange={(e) => setMinimum(e.target.value)}
          />
        </Field>
        <Field label="Paid off after (paid invoices)">
          <input
            type="number"
            min="1"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </Field>
        {count && (
          <>
            <Field label="Then continues at (per recurring period)">
              <input
                type="number"
                min="0"
                step=".01"
                required
                value={then}
                onChange={(e) => setThen(e.target.value)}
              />
            </Field>
            <Field label="Then Stripe lookup key">
              <select
                name="then_lookup_key"
                required
                defaultValue={i?.schedule?.then.lookup_key ?? ""}
              >
                <option value="">Choose an active recurring item</option>
                {sellableCatalogue(data.catalog)
                  .filter((i) => i.interval !== "one_time")
                  .map((i) => (
                    <option value={i.stripe_lookup_key ?? ""} key={i.id}>
                      {itemDisplayName(i)} · {i.stripe_lookup_key}
                    </option>
                  ))}
              </select>
            </Field>
          </>
        )}
        <Field label="Additional client copy">
          <textarea
            rows={4}
            value={copy}
            onChange={(e) => setCopy(e.target.value)}
            placeholder="Terms the client should see"
          />
        </Field>
      </fieldset>
      <section className="client-copy-preview">
        <p className="eyebrow">Client sees</p>
        <strong>{i ? itemDisplayName(i) : "New item"}</strong>
        {minimum && <p>{minimum}-month minimum commitment.</p>}
        {count && (
          <p>
            After {count} paid invoices:{" "}
            {money(Math.round(Number(then || 0) * 100))} per recurring period.
          </p>
        )}
        {copy && <p>{copy}</p>}
        <small>Payoff counts paid invoices, not calendar months.</small>
      </section>
      <SaveError error={save.error} />
      <Button type="submit" variant="primary" busy={save.busy}>
        Save item and terms
      </Button>
    </form>
  );
}
export function TemplatesStudio({
  data,
  run,
  selected,
  blocksOnly = false,
}: {
  data: Data;
  run: Runner;
  selected?: string;
  blocksOnly?: boolean;
}) {
  const original = data.templates.find((t) => t.id === selected);
  const [mode, setMode] = useState(blocksOnly ? "blocks" : "templates"),
    [draft, setDraft] = useState<Template | null>(
      original ?? data.templates[0] ?? null,
    ),
    [saved, setSaved] = useState<{
      id?: string;
      name: string;
      block: Block;
    } | null>(null),
    [index, setIndex] = useState<number | null>(null),
    [fields, setFields] = useState(false),
    [mobile, setMobile] = useState(false);
  const save = useSave(run);
  useEffect(() => {
    const q = matchMedia("(max-width:1099px)");
    const update = () => setMobile(q.matches);
    update();
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  const content =
    mode === "blocks" ? (saved ? [saved.block] : []) : (draft?.content ?? []);
  const patch = (next: Block[]) => {
    if (mode === "blocks" && saved) setSaved({ ...saved, block: next[0] });
    else if (draft) setDraft({ ...draft, content: next });
  };
  const map = {
    "proposal.title": "A new proposal",
    "proposal.date": "October 30, 2026",
    "proposal.valid_until": "November 29, 2026",
    "proposal.validity": "This proposal is valid until November 29, 2026.",
    "client.first_name": "Client",
    "client.company": "Client company",
    "company.name": data.settings?.company_name ?? "Company",
    "workspace.name": data.settings?.company_name ?? "Company",
    "quote.one_time_total": "One-time total",
    "quote.monthly_total": "Monthly total",
    "quote.yearly_total": "Yearly total",
  };
  const inspector =
    index !== null && content[index] ? (
      <BlockPanel
        key={content[index].id ?? index}
        block={content[index]}
        data={data}
        map={map}
        onChange={(b) => patch(content.map((v, n) => (n === index ? b : v)))}
        onSaveBlock={() => {
          setSaved({
            name: content[index].text || "Reusable block",
            block: structuredClone(content[index]),
          });
          setMode("blocks");
          setIndex(0);
        }}
      />
    ) : null;
  return (
    <div className="studio-template-layout">
      <aside className="studio-template-list">
        <div
          className="studio-tabs"
          role="tablist"
          aria-label="Templates and saved blocks"
        >
          {["templates", "blocks"].map((m) => (
            <button
              role="tab"
              aria-selected={mode === m}
              key={m}
              onClick={() => {
                setMode(m);
                setIndex(null);
              }}
            >
              {m === "templates" ? "Templates" : "Saved blocks"}
            </button>
          ))}
        </div>
        <Button
          onClick={() => {
            setIndex(null);
            if (mode === "templates")
              setDraft({
                id: crypto.randomUUID(),
                name: "Untitled template",
                active: true,
                default_quote: [],
                content: [
                  {
                    id: crypto.randomUUID(),
                    type: "heading",
                    text: "{{proposal.title}}",
                  },
                ],
              });
            else
              setSaved({
                name: "Untitled block",
                block: { id: crypto.randomUUID(), type: "paragraph", text: "" },
              });
          }}
        >
          + New {mode === "templates" ? "template" : "block"}
        </Button>
        {mode === "templates" ? (
          data.templates.length ? (
            data.templates.map((t) => (
              <button
                className={`template-link ${draft?.id === t.id ? "active" : ""}`}
                key={t.id}
                onClick={() => {
                  setDraft(structuredClone(t));
                  setIndex(null);
                }}
              >
                <strong>{t.name}</strong>
                <small>
                  {t.content.length} blocks ·{" "}
                  {data.proposals.filter((p) => p.template_id === t.id).length}{" "}
                  proposals{!t.active ? " · Inactive" : ""}
                  {inactiveTemplateItems(t, data.catalog).length
                    ? " · Defaults need review"
                    : ""}
                </small>
              </button>
            ))
          ) : (
            <p>No templates yet. Create your first reusable proposal.</p>
          )
        ) : data.library.length ? (
          data.library.map((b) => (
            <button
              key={b.id}
              className={`template-link ${saved?.id === b.id ? "active" : ""}`}
              onClick={() => {
                setSaved(structuredClone(b));
                setIndex(0);
              }}
            >
              <strong>{b.name}</strong>
              <small>{blockName(b.block)}</small>
            </button>
          ))
        ) : (
          <p>No saved blocks yet. Save a block from a template to reuse it.</p>
        )}
      </aside>
      <main className="studio-template-main stack">
        {(mode === "templates" && draft) || (mode === "blocks" && saved) ? (
          <>
            <header className="actions">
              <Field
                label={mode === "templates" ? "Template name" : "Block name"}
              >
                <input
                  value={mode === "templates" ? draft!.name : saved!.name}
                  required
                  onChange={(e) =>
                    mode === "templates"
                      ? setDraft({ ...draft!, name: e.target.value })
                      : setSaved({ ...saved!, name: e.target.value })
                  }
                />
              </Field>
              <Button onClick={() => setFields(true)}>Fields</Button>
              <Button
                variant="primary"
                busy={save.busy}
                onClick={() =>
                  save.save(
                    () =>
                      mode === "templates"
                        ? post("/api/templates", draft)
                        : post("/api/content_library", {
                            ...saved,
                            id: saved!.id ?? crypto.randomUUID(),
                          }),
                    mode === "templates" ? "Template saved" : "Block saved",
                  )
                }
              >
                Save {mode === "templates" ? "template" : "block"}
              </Button>
            </header>
            <p className="muted">
              Edits apply to new proposals only. Existing agreements keep their
              saved copy.
            </p>
            <SaveError error={save.error} />
            {mode === "templates" && (
              <label className="check">
                <input
                  role="switch"
                  type="checkbox"
                  checked={draft!.active}
                  onChange={(e) =>
                    setDraft({ ...draft!, active: e.target.checked })
                  }
                />
                Active template
              </label>
            )}
            <Reorder
              ids={content.map((_, n) => String(n))}
              onMove={(from, to) => {
                const next = [...content];
                const [moved] = next.splice(Number(from), 1);
                next.splice(Number(to), 0, moved);
                patch(next);
                setIndex(null);
              }}
            >
              <div className="studio-blocks">
                {content.map((b, n) => (
                  <Sortable
                    id={String(n)}
                    label={`block ${n + 1}`}
                    key={b.id ?? n}
                  >
                    <article
                      className={`studio-block-card ${index === n ? "selected" : ""}`}
                      key={b.id ?? n}
                    >
                      <header>
                        <button
                          className="block-open"
                          onClick={() => setIndex(n)}
                        >
                          <strong>
                            {b.type === "heading"
                              ? b.text
                              : b.type === "contract"
                                ? b.text || "Statement of Work & Contract"
                                : blockName(b)}
                          </strong>
                          <small>{blockName(b)}</small>
                        </button>
                        {mode === "templates" && (
                          <div className="actions">
                            <Button
                              aria-label={`Move block ${n + 1} up`}
                              disabled={n === 0}
                              onClick={() => {
                                const next = [...content];
                                [next[n - 1], next[n]] = [next[n], next[n - 1]];
                                patch(next);
                                setIndex(null);
                              }}
                            >
                              ↑
                            </Button>
                            <Button
                              aria-label={`Move block ${n + 1} down`}
                              disabled={n === content.length - 1}
                              onClick={() => {
                                const next = [...content];
                                [next[n + 1], next[n]] = [next[n], next[n + 1]];
                                patch(next);
                                setIndex(null);
                              }}
                            >
                              ↓
                            </Button>
                            <Button
                              aria-label={`Remove block ${n + 1}`}
                              onClick={() => {
                                patch(content.filter((_, j) => j !== n));
                                setIndex(null);
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                      </header>
                      {b.type === "contract" && (
                        <div className="contract-clause-list">
                          {b.clauses?.map((c) => (
                            <button key={c.id} onClick={() => setIndex(n)}>
                              <strong>{c.heading}</strong>
                              {c.show_when && (
                                <small>
                                  Shown when ·{" "}
                                  {data.catalog.find(
                                    (i) =>
                                      i.id === c.show_when?.pricing_item_id,
                                  )?.name ?? "Unavailable item"}{" "}
                                  selected
                                </small>
                              )}
                              <p>{c.body}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </article>
                  </Sortable>
                ))}
              </div>
            </Reorder>
            {mode === "templates" && (
              <>
                <div className="actions">
                  <Field label="Add block">
                    <select
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const type = e.target.value as Block["type"];
                        patch([
                          ...content,
                          {
                            id: crypto.randomUUID(),
                            type,
                            ...(type === "contract"
                              ? {
                                  text: "Statement of Work & Contract",
                                  clauses: [],
                                }
                              : type === "signature_block"
                                ? { role: "client" as const }
                                : { text: "" }),
                          },
                        ]);
                        setIndex(content.length);
                      }}
                    >
                      <option value="">Choose a block type</option>
                      {[
                        "heading",
                        "paragraph",
                        "image",
                        "pricing_table",
                        "contract",
                        "signature_block",
                        "page_break",
                      ].map((t) => (
                        <option key={t} value={t}>
                          {blockName({ type: t as Block["type"] })}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Insert saved block">
                    <select
                      value=""
                      onChange={(e) => {
                        const b = data.library.find(
                          (b) => b.id === e.target.value,
                        );
                        if (b)
                          patch([
                            ...content,
                            {
                              ...structuredClone(b.block),
                              id: crypto.randomUUID(),
                            },
                          ]);
                      }}
                    >
                      <option value="">Choose a saved block</option>
                      {data.library.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <section className="studio-section">
                  <h2>Default quote</h2>
                  <TemplateWarnings
                    templates={[draft!]}
                    catalog={data.catalog}
                  />
                  <TemplateDefaults
                    template={draft!}
                    data={data}
                    onChange={(default_items) =>
                      setDraft({ ...draft!, default_items, default_quote: [] })
                    }
                  />
                </section>
              </>
            )}
          </>
        ) : (
          <Empty
            title={
              mode === "templates"
                ? "Choose a template"
                : "Choose a saved block"
            }
          >
            Select one from the list, or create a new one.
          </Empty>
        )}
      </main>
      {!mobile && inspector && (
        <aside className="studio-inspector stack">{inspector}</aside>
      )}
      {mobile && inspector && (
        <Sheet title="Edit block" onClose={() => setIndex(null)}>
          {inspector}
        </Sheet>
      )}
      {fields && (
        <Sheet title="Fields" onClose={() => setFields(false)}>
          <div className="stack">
            {Object.entries(map).map(([key, value]) => (
              <div className="row" key={key}>
                <code>{`{{${key}}}`}</code>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
function blockName(b: Block) {
  return {
    heading: "Heading",
    paragraph: "Text",
    image: "Image",
    pricing_table: "Pricing table",
    signature_block: "Signature",
    page_break: "Page break",
    variable: "Field",
    contract: "Contract",
  }[b.type];
}
function BlockPanel({
  block: b,
  onChange,
  data,
  map,
  onSaveBlock,
}: {
  block: Block;
  onChange: (b: Block) => void;
  data: Data;
  map: Record<string, string>;
  onSaveBlock: () => void;
}) {
  const [clause, setClause] = useState(0);
  if (b.type !== "contract")
    return (
      <div className="stack">
        <h2>{blockName(b)}</h2>
        <BlocksEditor
          content={[b]}
          onChange={(next) => {
            if (next[0]) onChange(next[0]);
          }}
          map={map}
        />
        <Button onClick={onSaveBlock}>Save for reuse</Button>
      </div>
    );
  const c = b.clauses?.[clause];
  const update = (patch: Partial<NonNullable<Block["clauses"]>[number]>) =>
    onChange({
      ...b,
      clauses: b.clauses!.map((v, n) =>
        n === clause ? { ...v, ...patch } : v,
      ),
    });
  return (
    <div className="stack">
      <h2>Contract clauses</h2>
      <Field label="Contract title">
        <input
          value={b.text ?? ""}
          onChange={(e) => onChange({ ...b, text: e.target.value })}
        />
      </Field>
      <Field label="Clause">
        <select
          value={clause}
          onChange={(e) => setClause(Number(e.target.value))}
        >
          {b.clauses?.map((c, n) => (
            <option value={n} key={c.id}>
              {c.heading}
            </option>
          ))}
        </select>
      </Field>
      {c && (
        <>
          <Field label="Clause heading">
            <input
              value={c.heading}
              onChange={(e) => update({ heading: e.target.value })}
            />
          </Field>
          <Field label="Clause body">
            <textarea
              rows={7}
              value={c.body}
              onChange={(e) => update({ body: e.target.value })}
            />
          </Field>
          <fieldset className="studio-radio">
            <legend>Show this clause</legend>
            <label>
              <input
                type="radio"
                name="clause_visibility"
                checked={!c.show_when}
                onChange={() => update({ show_when: null })}
              />
              Always
            </label>
            <label>
              <input
                type="radio"
                name="clause_visibility"
                checked={!!c.show_when}
                onChange={() =>
                  update({
                    show_when: {
                      kind: "item_selected",
                      pricing_item_id:
                        sellableCatalogue(data.catalog)[0]?.id ?? "",
                    },
                  })
                }
              />
              Only when…
            </label>
          </fieldset>
          {c.show_when && (
            <Field label="When the quote includes and the client selects">
              <select
                value={c.show_when.pricing_item_id}
                onChange={(e) =>
                  update({
                    show_when: {
                      kind: "item_selected",
                      pricing_item_id: e.target.value,
                    },
                  })
                }
              >
                <option value="">Choose an item</option>
                {data.catalog
                  .filter(
                    (i) =>
                      (i.active && !i.legacy) ||
                      i.id === c.show_when?.pricing_item_id,
                  )
                  .toSorted((a, b) =>
                    itemDisplayName(a).localeCompare(itemDisplayName(b)),
                  )
                  .map((i) => (
                    <option value={i.id} key={i.id}>
                      {itemDisplayName(i)}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <p>
            Updates with the client’s choices and freezes with their signature.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={c.draft ?? false}
              onChange={(e) => update({ draft: e.target.checked })}
            />
            Draft wording · warn before sending
          </label>
          <div className="actions">
            <Button
              disabled={clause === 0}
              onClick={() => {
                const next = [...b.clauses!];
                [next[clause - 1], next[clause]] = [
                  next[clause],
                  next[clause - 1],
                ];
                onChange({ ...b, clauses: next });
                setClause(clause - 1);
              }}
            >
              Move clause up
            </Button>
            <Button
              disabled={clause === b.clauses!.length - 1}
              onClick={() => {
                const next = [...b.clauses!];
                [next[clause + 1], next[clause]] = [
                  next[clause],
                  next[clause + 1],
                ];
                onChange({ ...b, clauses: next });
                setClause(clause + 1);
              }}
            >
              Move clause down
            </Button>
            <Button
              onClick={() => {
                onChange({
                  ...b,
                  clauses: b.clauses!.filter((_, n) => n !== clause),
                });
                setClause(0);
              }}
            >
              Remove clause
            </Button>
          </div>
        </>
      )}
      <Button
        onClick={() => {
          onChange({
            ...b,
            clauses: [
              ...(b.clauses ?? []),
              {
                id: crypto.randomUUID(),
                heading: "New clause",
                body: "",
                show_when: null,
                draft: true,
              },
            ],
          });
          setClause(b.clauses?.length ?? 0);
        }}
      >
        + Add clause
      </Button>
      <Button onClick={onSaveBlock}>Save contract for reuse</Button>
    </div>
  );
}
function TemplateDefaults({
  template: t,
  data,
  onChange,
}: {
  template: Template;
  data: Data;
  onChange: (items: QuoteItem[]) => void;
}) {
  const items =
    t.default_items ??
    t.default_quote.flatMap((q, n) => {
      const c = data.catalog.find((i) => i.id === q.pricing_item_id);
      if (!c) return [];
      const i = catalogQuoteItem(
        c,
        n,
        c.id,
        c.sublines?.map((s) => s.id) ?? [c.id],
      );
      return [
        {
          ...i,
          optional: q.optional,
          default_selected: q.selected,
          selected: q.selected,
          sublines: i.sublines.map((s) => ({ ...s, qty: q.qty })),
        },
      ];
    });
  const patch = (id: string, update: Partial<QuoteItem>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...update } : i)));
  return (
    <div className="stack">
      {items.map((i, n) => (
        <div className="studio-default-item" key={i.id}>
          <strong>{i.name}</strong>
          <label className="check">
            <input
              type="checkbox"
              role="switch"
              checked={i.optional}
              onChange={(e) =>
                patch(i.id, {
                  optional: e.target.checked,
                  default_selected: true,
                })
              }
            />
            Optional
          </label>
          {i.optional && (
            <label className="check">
              <input
                type="checkbox"
                checked={i.default_selected}
                onChange={(e) =>
                  onChange(
                    items.map((v) =>
                      v.id === i.id
                        ? { ...v, default_selected: e.target.checked }
                        : i.choice_group_id &&
                            v.choice_group_id === i.choice_group_id &&
                            e.target.checked
                          ? { ...v, default_selected: false }
                          : v,
                    ),
                  )
                }
              />
              Selected for client
            </label>
          )}
          {i.sublines.map((s) => (
            <Field label={`${s.label || "Sub-line"} quantity`} key={s.id}>
              <input
                type="number"
                min="1"
                value={s.qty}
                onChange={(e) =>
                  patch(i.id, {
                    sublines: i.sublines.map((v) =>
                      v.id === s.id ? { ...v, qty: Number(e.target.value) } : v,
                    ),
                  })
                }
              />
            </Field>
          ))}
          <Field label="Choice group">
            <select
              value={
                i.choice_group_id
                  ? (items.find(
                      (v) =>
                        v.id !== i.id &&
                        v.choice_group_id === i.choice_group_id,
                    )?.id ?? "")
                  : ""
              }
              onChange={(e) => {
                const target = items.find((v) => v.id === e.target.value);
                const group = target?.choice_group_id ?? crypto.randomUUID();
                onChange(
                  items.map((v) =>
                    v.id === i.id
                      ? {
                          ...v,
                          optional: target ? true : v.optional,
                          choice_group_id: target ? group : null,
                          default_selected: target ? false : v.default_selected,
                        }
                      : v.id === target?.id
                        ? {
                            ...v,
                            optional: true,
                            choice_group_id: group,
                            default_selected: true,
                          }
                        : v,
                  ),
                );
              }}
            >
              <option value="">Standalone item</option>
              {items
                .filter((v) => v.id !== i.id)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    Choose one with {v.name}
                  </option>
                ))}
            </select>
          </Field>
          <div className="actions">
            <Button
              disabled={n === 0}
              onClick={() => {
                const next = [...items];
                [next[n - 1], next[n]] = [next[n], next[n - 1]];
                onChange(next.map((v, order) => ({ ...v, order })));
              }}
            >
              Move item up
            </Button>
            <Button
              onClick={() =>
                onChange(
                  items
                    .filter((v) => v.id !== i.id)
                    .map((v, order) => ({ ...v, order })),
                )
              }
            >
              Remove item
            </Button>
          </div>
        </div>
      ))}
      <Field label="Add catalog default">
        <select
          value=""
          onChange={(e) => {
            const c = data.catalog.find((i) => i.id === e.target.value);
            if (c)
              onChange([
                ...items,
                catalogQuoteItem(
                  c,
                  items.length,
                  crypto.randomUUID(),
                  (c.sublines ?? [c]).map(() => crypto.randomUUID()),
                ),
              ]);
          }}
        >
          <option value="">Choose an item</option>
          {sellableCatalogue(data.catalog).map((i) => (
            <option value={i.id} key={i.id}>
              {itemDisplayName(i)}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
export function ConnectionsStudio({
  data,
  run,
  initial,
}: {
  data: Data;
  run: Runner;
  initial?: string;
}) {
  const [health, setHealth] = useState<{
      stripe: boolean;
      qbo: boolean;
      email: boolean;
      mock: boolean;
    } | null>(null),
    [error, setError] = useState(""),
    [open, setOpen] = useState(initial ?? "");
  const load = () => {
    setError("");
    api<NonNullable<typeof health>>("/api/connections")
      .then(setHealth)
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);
  const connected = data.assistants.filter((a) => !a.revoked),
    stale = connected.some(
      (a) =>
        !a.last_used || Date.now() - Date.parse(a.last_used) > 7 * 86400000,
    ),
    imports = data.proposals.filter((p) => p.source === "proposify_import"),
    missing = imports.filter((p) => !p.files.some((f) => f.kind === "import")),
    references = data.documents,
    referenceError = references.some((d) => d.fetch_error);
  const cards = [
    {
      id: "stripe",
      name: "Stripe",
      state: health?.stripe
        ? "Test mode configured"
        : health?.mock
          ? "Mock mode"
          : "Not connected",
      line: "Recurring billing, Checkout for new clients and catalog sync.",
      detail: "Test mode only. No live billing is enabled.",
      action: "Settings",
    },
    {
      id: "qbo",
      name: "QuickBooks",
      state: health?.qbo ? "Sandbox configured" : "Setup needed",
      line: "One-time invoices stay in review until a sandbox connection is ready.",
      detail: `${data.proposals.filter((p) => p.billing_links.some((l) => l.provider === "qbo" && l.status !== "succeeded")).length} proposals with invoices to review`,
      action: "Set up QuickBooks",
    },
    {
      id: "email",
      name: "Email",
      state:
        health?.email && data.settings?.sending_domain
          ? "Configured"
          : "Setup needed",
      line: "Proposals send from the selected staff member. Replies go to that person.",
      detail: data.settings?.sending_domain
        ? `${data.settings.sending_domain} · verify SPF and DKIM with your provider`
        : "Add your verified sending domain in Workspace.",
      action: "Settings",
    },
    {
      id: "reference",
      name: "Pricing reference",
      state: referenceError
        ? "Refresh needs attention"
        : references.length
          ? "Up to date"
          : "Add a reference",
      line: referenceError
        ? "The last good version stays available while the refresh needs attention."
        : "Your pricing playbook beside the editor. Read-only; the app never sets prices.",
      detail: references
        .map(
          (d) =>
            `${d.version || "No version yet"}${d.last_success_at ? ` · last success ${new Date(d.last_success_at).toLocaleString()}` : ""}`,
        )
        .join(" · "),
      action: "Open",
    },
    {
      id: "assistants",
      name: "AI assistants",
      state: stale ? "Drafts paused" : `${connected.length} connected`,
      line: stale
        ? "An assistant has not connected recently. You can still write proposals by hand."
        : "Assistants read reference data and create drafts. A person always reviews, sends and signs.",
      detail:
        connected.map((a) => a.name).join(", ") || "No assistants connected",
      action: "Manage",
    },
    {
      id: "imports",
      name: "Import from Proposify",
      state: missing.length
        ? "PDFs need attention"
        : imports.length
          ? "Imported"
          : "Not imported",
      line: "Past proposals are kept as read-only PDFs linked to their clients.",
      detail: `${imports.length} imported · ${missing.length} missing PDFs`,
      action: "Import details",
    },
  ];
  return (
    <div className="stack">
      <SaveError error={error} />
      {error && <Button onClick={load}>Try loading connections again</Button>}
      <div className="connection-grid">
        {cards.map((c) => (
          <section className="connection-card" key={c.id}>
            <header>
              <h2>{c.name}</h2>
              {!health && ["stripe", "qbo", "email"].includes(c.id) ? (
                <Skeleton />
              ) : (
                <span
                  className={`connection-state ${/needed|paused|attention|Not connected/.test(c.state) ? "needs-attention" : ""}`}
                >
                  {c.state}
                </span>
              )}
            </header>
            <p>{c.line}</p>
            <small>{c.detail}</small>
            <Button onClick={() => setOpen(c.id)}>{c.action}</Button>
          </section>
        ))}
      </div>
      {open && (
        <Sheet
          title={cards.find((c) => c.id === open)?.name ?? "Connection"}
          onClose={() => setOpen("")}
        >
          {open === "reference" ? (
            <ReferenceDocuments documents={data.documents} run={run} />
          ) : open === "assistants" ? (
            <AssistantConnections data={data} run={run} />
          ) : open === "imports" ? (
            <div className="stack">
              <Banner title="Imported proposals are read-only">
                Existing imported records and PDFs are preserved.
              </Banner>
              <p>
                {imports.length} imported records · {missing.length} missing
                PDFs.
              </p>
              <p>
                Run the CSV, PDF upload and reconciliation steps in the
                repository’s import guide from your Mac. Match each PDF by its
                original proposal ID and review missing files before another
                batch.
              </p>
              <a className="btn" href="/proposals?view=imported">
                View imported proposals
              </a>
            </div>
          ) : open === "email" ? (
            <div className="stack">
              <p>
                Configure your email provider with this deployment, then verify
                your domain’s SPF and DKIM there. The app does not infer DNS
                verification from the setting alone.
              </p>
              <a className="btn" href="/studio/workspace#client-links">
                Open sending domain
              </a>
            </div>
          ) : (
            <div className="stack">
              <p>
                {open === "stripe"
                  ? "Use a Stripe test-mode restricted key in this deployment. Sync only after the test catalog has been copied."
                  : "QuickBooks sandbox credentials must be added to the deployment by the owner. Invoices remain in review until then."}
              </p>
              <Button
                onClick={() =>
                  run(
                    () =>
                      post(
                        `/api/catalog-sync/${open === "stripe" ? "stripe" : "qbo"}`,
                      ),
                    "Test catalog synced",
                  )
                }
              >
                Sync{" "}
                {open === "stripe"
                  ? "Stripe test catalog"
                  : "QuickBooks sandbox items"}
              </Button>
              <a href="/studio/catalog">Open catalog</a>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
function AssistantConnections({ data, run }: { data: Data; run: Runner }) {
  return (
    <div className="stack">
      <Banner tone="ai" title="You stay in control">
        Assistants can read your reference data, create clients and draft
        proposals. They cannot send, sign, delete clients, choose the sender or
        change billing.
      </Banner>
      <h3>Connect or reconnect an assistant</h3>
      <p>
        Add this remote MCP endpoint in your assistant, choose automatic
        registration, then sign in and approve its access:
      </p>
      <code className="endpoint">{data.app_url}/mcp</code>
      <p>Access: proposals:read · proposals:draft</p>
      {data.assistants.length ? (
        data.assistants.map((a) => (
          <section className="studio-section" key={a.id}>
            <h3>{a.name}</h3>
            <p>
              {a.revoked
                ? "Access revoked"
                : a.last_used
                  ? `Last connected ${new Date(a.last_used).toLocaleString()}`
                  : "Has not connected yet"}
            </p>
            {!a.revoked && (
              <Button
                variant="danger"
                onClick={() =>
                  run(
                    () => post(`/api/assistants/${a.id}/revoke`),
                    "Assistant access revoked",
                  )
                }
              >
                Revoke {a.name}
              </Button>
            )}
          </section>
        ))
      ) : (
        <p>
          No assistants connected. New connections appear after authorization.
        </p>
      )}
    </div>
  );
}
export function ActivityStudio({ data }: { data: Data }) {
  const [rows, setRows] = useState<Activity[] | null>(null),
    [error, setError] = useState(""),
    [actor, setActor] = useState(""),
    [type, setType] = useState(""),
    [period, setPeriod] = useState("30");
  const load = () => {
    setError("");
    api<Activity[]>("/api/workspace_events")
      .then(setRows)
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);
  const since = period
    ? new Date(Date.now() - Number(period) * 86400000).toISOString()
    : "";
  const filtered =
    rows?.filter(
      (e) =>
        (!actor || e.actor === actor) &&
        (!type || e.type === type) &&
        (!since || e.created_at >= since),
    ) ?? [];
  const name = (a: string) =>
    a.startsWith("staff:")
      ? (data.staff.find((m) => m.user_id === a.slice(6))?.display_name ??
        "Staff member")
      : a.startsWith("ai:")
        ? (data.assistants.find((m) => m.id === a.slice(3))?.name ??
          "Assistant")
        : a === "client"
          ? "Client"
          : "System";
  const query = new URLSearchParams({ format: "csv", actor, type, since });
  return (
    <div className="stack">
      <div className="studio-filters">
        <Field label="Who">
          <select value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">Anyone</option>
            {[...new Set(rows?.map((e) => e.actor))].map((a) => (
              <option key={a} value={a}>
                {name(a)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Event type">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All events</option>
            {[...new Set(rows?.map((e) => e.type))].sort().map((t) => (
              <option key={t} value={t}>
                {eventLabel({ type: t, actor: "", metadata: {} })}
              </option>
            ))}
          </select>
        </Field>
        <Field label="When">
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="30">Last 30 days</option>
            <option value="7">Last 7 days</option>
            <option value="">All time</option>
          </select>
        </Field>
        <a className="btn" href={`/api/workspace_events?${query}`}>
          Export CSV
        </a>
      </div>
      {error ? (
        <Banner
          tone="danger"
          title="Activity could not be loaded"
          action={<Button onClick={load}>Try again</Button>}
        >
          {error}
        </Banner>
      ) : rows === null ? (
        <Skeleton />
      ) : filtered.length ? (
        <div className="activity-table">
          <div className="activity-heading">
            <span>When</span>
            <span>Who</span>
            <span>Event</span>
            <span>Detail</span>
            <span>IP</span>
          </div>
          {filtered.map((e) => (
            <article className="activity-row" key={e.id}>
              <time>
                {new Date(e.created_at).toLocaleString("en-US", {
                  timeZone: data.settings?.timezone ?? "UTC",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
              <span>{name(e.actor)}</span>
              <span>
                <strong>{eventLabel(e, name(e.actor))}</strong>
                <code>{e.type}</code>
              </span>
              {e.proposal_id ? (
                <a href={`/proposals/${e.proposal_id}`}>{e.detail}</a>
              ) : (
                <span>{e.detail}</span>
              )}
              <code>
                {e.ip || (e.actor.startsWith("ai:") ? "Connector" : "—")}
              </code>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            rows.length
              ? "No activity matches these filters"
              : "No workspace activity yet"
          }
          action={
            rows.length ? (
              <Button
                onClick={() => {
                  setActor("");
                  setType("");
                  setPeriod("");
                }}
              >
                Clear filters
              </Button>
            ) : (
              <a href="/proposals?new=1">New proposal</a>
            )
          }
        >
          Proposal and Studio changes will appear here.
        </Empty>
      )}
    </div>
  );
}
