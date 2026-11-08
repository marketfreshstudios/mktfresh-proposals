"use client";
import { useConnectorRestore } from "./connector-restore";
import { useStarterActions } from "./starter-library";
import { useReloadGuard } from "./reload-safety";
import { resolvedEditorText } from "../lib/editor-fields";
import { PlainClauseText } from "./editor/plain-clause-text";
import { QuoteItemsPanel } from "./quote-items-panel";
import { ToolsPanel } from "./editor/tools-panel";
import { SectionsPanel } from "./editor/sections-panel";
import { PdfPreviewViewer } from "./pdf-preview-viewer";
import { ToolbarPopover } from "./toolbar-popover";
import {
  convertSavedBlockType,
  savedBlockType,
  savedBlockLabel,
} from "../lib/saved-block-type";
import { savedBlocks } from "../lib/linked-blocks";
import { LinkedBlockNote } from "./editor/linked-block-note";
import type { SavedBlock } from "../lib/model";
import { templateAuthoringItems } from "../lib/template-quote";
import { studioDate } from "../lib/studio-v3";
import { curatedFonts } from "../lib/proposal-fonts";
import { confirmDialog } from "./dialog-actions";
import { stripeStatus } from "../lib/studio-v3";
import { relativeTime } from "./studio-v3";
import { DialogActions } from "./dialog-actions";
import { insertAuthoringBlocks } from "../lib/block-insertion";
import { useBlockDrop, defaultBlockInsertion } from "./editor/block-drop";
import { withSignatureHeadings } from "../lib/signature-headings";
import { pageGeometry } from "../lib/page-bands";
import { SelectableImage } from "./editor/selectable-image";
import { isStaffSignedOut, StaffSignIn } from "./staff-sign-in";
import { resetBandSettings } from "./editor/reset-band-settings";
import { defaultTemplateBands, proposalBands } from "../lib/page-bands";
import { defaultCover, contentAfterCover } from "../lib/cover";
import { pairSignatureNodes } from "./signature-pair";
import { signatureHtml } from "../lib/signature-presentation";
import { contentSections } from "../lib/ai-review";
import { EditorHeader, PanelChevron } from "./editor-header";
import { EditorButton } from "./editor/editor-button";
import { EditorNotice } from "./editor/editor-notice";
import { TemplateHistoryControls } from "./editor/template-history-controls";
import { printView } from "../lib/print-view";
import { PageBreakController } from "./page-break-action";
import { useManagedPopover } from "./editor-popovers";
import { paginateBrowser } from "./browser-pagination";
import { type BrowserPages, PagedPaper } from "./paged-paper";
import { DocumentPagination } from "./document-pagination";
import { SectionsNav } from "./editor/sections-nav";
import { useEditorPanels } from "./use-editor-panels";
import { useTemplatePreview } from "./use-template-preview";
import { authoringPreview } from "../lib/authoring-preview";
import { variables } from "../lib/presentation";
import { documentQuote } from "../lib/document-quote";
import { documentSpacing } from "../lib/document-spacing";
import {
  applyDocumentMove,
  canMoveAdjacentBlock,
  moveAdjacentBlock,
  moveDocumentBlock,
} from "../lib/editor-moves";
import { pageMetrics } from "../lib/proposal-styles";
import { ProposalStyles } from "./proposal-styles";
import {
  resolveStyles,
  documentStyleCss,
  styleFontFaces,
  type StyleOverrides,
} from "../lib/proposal-styles";
import { useSessionHistory } from "./editor-history";
import {
  blockText,
  duplicateBlock,
  convertTextStyle,
} from "../lib/editor-document";
import { BlockMenu } from "./block-menu";
import {
  BlockScope,
  EditorControlConfig,
  useBlockFeedback,
  useBlockToolbar,
  BlockFrame,
  BlockAction,
  useBlockSelection,
} from "./block-controls";
import type { ComponentProps, CSSProperties } from "react";
import { productMappings } from "../lib/workspace-setup";
import { useEffect, useState, useRef, type ReactNode } from "react";
import type { Data } from "./staff-app";
import { renderBlocks, escape } from "../lib/presentation";
import { DocumentCover } from "./document-cover";
import { FieldEditor } from "./field-editor";
import { useInsertedBlockFocus } from "./editor/use-inserted-block-focus";
import { HeadingTokens, HeadingElement } from "./editor/heading-tokens";
import { FieldTextArea, FieldOptions } from "./field-options";
import { appendField } from "../lib/editor-document";
import type { Block, Item, Template } from "../lib/model";
import type { Activity } from "../lib/studio";
import { fontCss } from "../lib/proposal-fonts";
import { itemDisplayName, sellableCatalogue } from "../lib/catalogue-display";
import { intervalSuffix } from "../lib/money";
import { eventLabel } from "../lib/event-label";
import { inactiveTemplateItems } from "../lib/template-quote";
import {
  api,
  post,
  Button,
  Banner,
  Field,
  Empty,
  Icon,
  Disclosure,
} from "./ui";
import { Sheet, Skeleton } from "./foundation";
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
      {isStaffSignedOut(error)
        ? error
        : `${error} Correct the issue and try again.`}
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
export { WorkspaceStudio } from "./workspace-studio";
export function CatalogStudio({ data, run }: { data: Data; run: Runner }) {
  const [selected, setSelected] = useState<string | null>(() =>
      typeof window !== "undefined"
        ? new URLSearchParams(location.search).get("item")
        : null,
    ),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All"),
    [family, setFamily] = useState(false),
    [adding, setAdding] = useState(false),
    [synced, setSynced] = useState<string | null>(null);
  const money = useMoney();
  useEffect(() => {
    api<Activity[]>("/api/workspace_events")
      .then((events) =>
        setSynced(
          events.find((e) => e.type === "catalog_synced")?.created_at ?? null,
        ),
      )
      .catch(() => {});
  }, []);
  const pick = (id: string | null) => {
    setSelected(id);
    const url = new URL(location.href);
    if (id) url.searchParams.set("item", id);
    else url.searchParams.delete("item");
    history.replaceState(null, "", url);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") pick(null);
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        pick(selected ? null : (data.catalog[0]?.id ?? null));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected, data.catalog]);
  const choices = ["All", "Stripe", "Custom families", "Archived"];
  const visible = (i: Item) =>
    filter === "Archived"
      ? !i.active || i.legacy
      : i.active &&
        !i.legacy &&
        filter !== "Custom families" &&
        (filter !== "Stripe" || !!i.stripe_lookup_key);
  const items = data.catalog
    .filter(
      (i) =>
        visible(i) &&
        `${itemDisplayName(i)} ${i.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .toSorted((a, b) => itemDisplayName(a).localeCompare(itemDisplayName(b)));
  const families = data.families.filter(
    (f) =>
      (filter === "All" ||
        filter === "Custom families" ||
        (filter === "Archived" && !f.active)) &&
      (filter === "Archived" ? !f.active : f.active) &&
      f.name.toLowerCase().includes(query.toLowerCase()),
  );
  const item = data.catalog.find((i) => i.id === selected),
    custom = data.families.find((f) => f.id === selected);
  const source = (i: Item) => (i.stripe_lookup_key ? "Stripe" : "Custom");
  return (
    <div className="studio-products-v3">
      <div className="studio-list-intro">
        <p>
          Services you can add to a quote. Stripe products keep their Stripe
          price; custom families are priced on each proposal.
        </p>
        <Button variant="primary" onClick={() => setFamily(true)}>
          New custom family
        </Button>
      </div>
      <div className="studio-sync-meta">
        <span
          className={data.connections?.stripe ? "success" : "warning"}
          aria-hidden="true"
        >
          ●
        </span>{" "}
        {data.connections?.stripe
          ? `Synced with Stripe · ${data.connections.mode === "live" ? "live" : "test"} mode`
          : stripeStatus(data.connections)}{" "}
        · {synced ? relativeTime(synced) : "No recorded sync yet"} ·{" "}
        <Button
          onClick={() =>
            run(async () => {
              const result = await post("/api/catalog-sync/stripe");
              setSynced(result.synced_at);
            }, "Products synced")
          }
        >
          Sync now
        </Button>
      </div>
      <TemplateWarnings templates={data.templates} catalog={data.catalog} />
      <div className="studio-list-tools">
        <nav className="studio-filter-chips" aria-label="Product types">
          {choices.map((c) => (
            <button
              key={c}
              aria-pressed={filter === c}
              onClick={() => setFilter(c)}
            >
              {c} ·{" "}
              {c === "Custom families"
                ? data.families.filter((f) => f.active).length
                : c === "Archived"
                  ? data.catalog.filter((i) => !i.active || i.legacy).length
                  : data.catalog.filter(
                      (i) =>
                        i.active &&
                        !i.legacy &&
                        (c !== "Stripe" || i.stripe_lookup_key),
                    ).length +
                    (c === "All"
                      ? data.families.filter((f) => f.active).length
                      : 0)}
            </button>
          ))}
        </nav>
        <label className="field studio-search">
          <span className="sr-only">Search products</span>
          <input
            type="search"
            placeholder="Search products"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div
        className={`studio-products-layout ${selected ? "with-detail" : ""}`}
      >
        <div>
          <div className="studio-data-table product-table">
            <div className="studio-table-head">
              <span>Product</span>
              <span>Price</span>
              <span>Plan terms</span>
              <span>Source</span>
            </div>
            {items.map((i) => (
              <a
                className="studio-table-row catalog-row catalog-row-v3"
                href={`?item=${i.id}`}
                key={i.id}
                onClick={(e) => {
                  if (
                    !e.metaKey &&
                    !e.ctrlKey &&
                    !e.shiftKey &&
                    e.button === 0
                  ) {
                    e.preventDefault();
                    pick(i.id);
                  }
                }}
              >
                <span>
                  <strong>{itemDisplayName(i)}</strong>
                  <small>{i.description}</small>
                </span>
                <span>
                  <span className="catalog-price">
                    {(i.sublines ?? [i])
                      .map(
                        (s) =>
                          `${money(s.amount, data.settings?.currency)}${intervalSuffix(s.interval)}`,
                      )
                      .join(" + ")}
                  </span>
                </span>
                <span>
                  {i.schedule
                    ? `${i.schedule.after_paid_invoices} payments, then ${money(i.schedule.then.amount, data.settings?.currency)}/mo`
                    : "—"}
                  {i.min_term_months && (
                    <small>{i.min_term_months}-month minimum</small>
                  )}
                </span>
                <span>
                  <span
                    className={`studio-tag ${source(i) === "Stripe" ? "studio-tag-stripe" : ""}`}
                  >
                    {source(i)}
                  </span>
                </span>
              </a>
            ))}
            {families.map((f) => (
              <a
                className="studio-table-row"
                href={`?item=${f.id}`}
                key={f.id}
                onClick={(e) => {
                  if (
                    !e.metaKey &&
                    !e.ctrlKey &&
                    !e.shiftKey &&
                    e.button === 0
                  ) {
                    e.preventDefault();
                    pick(f.id);
                  }
                }}
              >
                <strong>{f.name}</strong>
                <span>Entered per proposal</span>
                <span>—</span>
                <span className="studio-tag">Custom</span>
              </a>
            ))}
          </div>
          {!items.length && !families.length && (
            <Empty
              title={
                query ? "No matching products" : "Your products start here"
              }
            >
              Sync your Stripe products or create a custom family.
            </Empty>
          )}
          <Button onClick={() => setAdding(true)}>Add one-time product</Button>
        </div>
        {(item || custom) && (
          <aside className="studio-product-detail" aria-label="Product details">
            <header>
              <h2>{item ? itemDisplayName(item) : custom!.name}</h2>
              <button
                aria-label="Close product details"
                className="btn"
                onClick={() => pick(null)}
              >
                <Icon name="chevron-right" />
              </button>
            </header>
            {item ? (
              <>
                <CatalogItem
                  key={item.id}
                  item={item}
                  data={data}
                  run={run}
                  close={() => pick(null)}
                />
                <section className="studio-product-used">
                  {" "}
                  <h3>Used in</h3>
                  <p>
                    {data.templates
                      .filter(
                        (t) =>
                          t.default_quote.some(
                            (l) => l.pricing_item_id === item.id,
                          ) ||
                          t.default_items?.some(
                            (q) => q.pricing_item_id === item.id,
                          ),
                      )
                      .map((t) => t.name)
                      .join(" · ") || "No templates"}{" "}
                    ·{" "}
                    {
                      data.proposals.filter(
                        (p) =>
                          ![
                            "completed",
                            "declined",
                            "expired",
                            "archived",
                          ].includes(p.status) &&
                          p.quote.some((q) => q.pricing_item_id === item.id),
                      ).length
                    }{" "}
                    open proposals
                  </p>
                </section>
              </>
            ) : (
              <>
                <span className="studio-tag">Custom family</span>
                <Field label="Family name">
                  <input readOnly value={custom!.name} />
                </Field>
                <p>
                  Entered per proposal. Use this family for a custom scope and
                  the agreed price; the app never sets prices.
                </p>
              </>
            )}
          </aside>
        )}
      </div>
      {adding && (
        <Sheet title="New product" onClose={() => setAdding(false)}>
          <CatalogItem
            item={null}
            data={data}
            run={run}
            close={() => setAdding(false)}
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
      <DialogActions>
        <Button onClick={close} disabled={save.busy}>
          Cancel
        </Button>
        <Button type="submit" busy={save.busy}>
          Create in Stripe test mode
        </Button>
      </DialogActions>
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
            "Product saved",
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
        ["display_name", "Name on proposals"],
        ["description", "Description the client sees"],
      ].map(([key, label]) => (
        <Field key={key} label={label}>
          <input
            name={key}
            defaultValue={String(i?.[key as keyof Item] ?? "")}
          />
        </Field>
      ))}
      {i?.stripe_lookup_key ? (
        <div className="studio-price-field">
          <label>Price</label>
          <div className="studio-readonly-price">
            <strong>
              {(i.sublines ?? [i])
                .map(
                  (line) =>
                    `${money(line.amount, data.settings?.currency)}${intervalSuffix(line.interval)}`,
                )
                .join(" + ")}
            </strong>
            <a
              href={`https://dashboard.stripe.com/${data.connections?.mode === "live" ? "" : "test/"}search?query=${encodeURIComponent(i.stripe_lookup_key)}`}
              target="_blank"
              rel="noopener"
            >
              Edit in Stripe ↗
            </a>
          </div>
          <small className="muted">
            Synced from Stripe. Change the price there and it updates here.
          </small>
          <input type="hidden" name="price" value={i.amount / 100} />
          <input type="hidden" name="interval" value={i.interval} />
        </div>
      ) : (
        <div className="studio-brand-grid">
          <Field label="List price">
            <input
              name="price"
              readOnly={!!i?.stripe_lookup_key}
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
      )}
      {i?.schedule && (
        <section className="studio-product-terms">
          <h3>Plan terms</h3>
          <dl>
            {(i.sublines ?? [i]).map((line, n) => (
              <div key={n}>
                <dt>
                  {line.interval === "one_time"
                    ? "Kickoff"
                    : line.interval === "month"
                      ? "Monthly"
                      : "Yearly"}
                </dt>
                <dd>
                  {money(line.amount, data.settings?.currency)}
                  {intervalSuffix(line.interval)}
                </dd>
              </div>
            ))}
            <div>
              <dt>Payments to own</dt>
              <dd>{i.schedule.after_paid_invoices}</dd>
            </div>
            <div>
              <dt>After that</dt>
              <dd>
                {money(i.schedule.then.amount, data.settings?.currency)}/mo
              </dd>
            </div>
            {i.min_term_months && (
              <div>
                <dt>Minimum term</dt>
                <dd>{i.min_term_months} months</dd>
              </div>
            )}
          </dl>
          <p>
            {String(
              i.plan_terms?.client_copy ??
                "Payoff counts paid invoices, not calendar months.",
            )}
          </p>
        </section>
      )}
      <details open={!i}>
        <Disclosure>More product details</Disclosure>
        <div className="stack">
          {[
            ["name", "Synced name"],
            ["sku", "SKU"],
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
          <ProductMappingDetails
            item={i}
            qboConnected={data.connections?.qbo ?? null}
          />
          <section className="client-copy-preview">
            <p className="eyebrow">Client sees</p>
            <strong>{i ? itemDisplayName(i) : "New item"}</strong>
            {minimum && <p>{minimum}-month minimum commitment.</p>}
            {count && (
              <p>
                After {count} paid invoices:{" "}
                {money(Math.round(Number(then || 0) * 100))} per recurring
                period.
              </p>
            )}
            {copy && <p>{copy}</p>}
            <small>Payoff counts paid invoices, not calendar months.</small>
          </section>
        </div>
      </details>
      <SaveError error={save.error} />
      <DialogActions>
        <Button onClick={close} disabled={save.busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" busy={save.busy}>
          Save item and terms
        </Button>
      </DialogActions>
    </form>
  );
}
function TemplatesStudioContent({
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
  const blockFeedback = useBlockFeedback();
  const [insertAnchor, setInsertAnchor] = useState<HTMLElement | null>(null);
  const fieldInsertion = useBlockToolbar();
  const selection = useBlockSelection();
  const focusInserted = useInsertedBlockFocus(selection.select);
  const original = data.templates.find((t) => t.id === selected);
  const [mode, setMode] = useState(blocksOnly ? "blocks" : "templates"),
    [draft, setDraft] = useState<Template | null>(
      (() => {
        const t = original ?? data.templates[0];
        return t ?? null;
      })(),
    ),
    [saved, setSaved] = useState<
      (Omit<SavedBlock, "id"> & { id?: string }) | null
    >(
      blocksOnly ? (data.library.find((b) => b.id === selected) ?? null) : null,
    ),
    [index, setIndex] = useState<number | null>(null),
    [clauseIndex, setClauseIndex] = useState(0),
    [fields, setFields] = useState(false),
    [tab, setTab] = useState<string>(blocksOnly ? "Used in" : "Quote"),
    [expandedDefault, setExpandedDefault] = useState<string | null>(null),
    [defaultDetails, setDefaultDetails] = useState<string | null>(null),
    [previewOpen, setPreviewOpen] = useState(false),
    [moreAnchor, setMoreAnchor] = useState<HTMLButtonElement | null>(null),
    [events, setEvents] = useState<Activity[]>([]),
    [mobile, setMobile] = useState(false),
    [insertAt, setInsertAt] = useState<number | null>(null),
    [replaceEmpty, setReplaceEmpty] = useState(false);
  useManagedPopover(fields, () => setFields(false));
  const [templateBusy, setTemplateBusy] = useState(false),
    [templateError, setTemplateError] = useState(""),
    [templateLastSaved, setTemplateLastSaved] = useState<string | null>(null),
    [templateOffline, setTemplateOffline] = useState(false);
  const templateFlight = useRef<Promise<boolean> | null>(null),
    allowLeave = useRef(false);
  const [updateDrafts, setUpdateDrafts] = useState(false),
    updateDraftsRef = useRef(false);
  updateDraftsRef.current = updateDrafts;
  const serialise = (value: unknown) =>
    JSON.stringify(
      value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).filter(
              ([key]) =>
                ![
                  "pagination",
                  "revision",
                  "connector_restore_event_id",
                  "used_in",
                  "version",
                ].includes(key),
            ),
          )
        : value,
    );
  const studioRevisions = useRef(
    new Map<string, string | undefined>([
      ...data.templates.map((t) => [`templates:${t.id}`, t.revision] as const),
      ...data.library.map((t) => [`blocks:${t.id}`, t.revision] as const),
    ]),
  );
  const savedModels = useRef(
    new Map<string, string>([
      ...data.templates.map(
        (t) => [`templates:${t.id}`, serialise(t)] as const,
      ),
      ...data.library.map((t) => [`blocks:${t.id}`, serialise(t)] as const),
    ]),
  );
  const [templateRecovery, setTemplateRecovery] = useState<any>(null);
  useEffect(() => {
    const q = matchMedia("(max-width:1099px)");
    const update = () => setMobile(q.matches);
    update();
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  const content =
    mode === "blocks"
      ? saved
        ? savedBlocks(saved as SavedBlock)
        : []
      : (draft?.content ?? []);
  const model = useRef({ draft, saved });
  model.current = { draft, saved };
  const applyModel = (next: typeof model.current) => {
    model.current = next;
    setDraft(next.draft);
    setSaved(next.saved);
  };
  const history = useSessionHistory(
    `${mode}:${mode === "blocks" ? (saved?.id ?? saved?.block.id ?? "new") : (draft?.id ?? "new")}`,
    applyModel,
    () => model.current,
  );
  const [copyWithoutEdit, setCopyWithoutEdit] = useState(false);
  const [starterAttempt, setStarterAttempt] = useState<Template | null>(null),
    [starterGeneration, setStarterGeneration] = useState(0);
  const editDraft = (next: typeof draft) => {
    if (model.current.draft?.starter_key && next) {
      if (serialise(next) !== serialise(model.current.draft)) {
        (document.activeElement as HTMLElement)?.blur();
        setIndex(null);
        setFields(false);
        setInsertAt(null);
        setMoreAnchor(null);
        setTemplateToolsOpen(false);
        setStarterAttempt((pending) => pending ?? structuredClone(next));
        setStarterGeneration((n) => n + 1);
      }
      return;
    }
    const value = { ...model.current, draft: next };
    history.record(model.current, value);
    applyModel(value);
  };
  const editSaved = (next: typeof saved) => {
    const value = { ...model.current, saved: next };
    history.record(model.current, value);
    applyModel(value);
  };
  const templatePaper = useRef<HTMLDivElement>(null);
  const [browserPages, setBrowserPages] = useState<BrowserPages | null>(null);
  const pagePlan = useRef<import("../lib/page-plan").PagePlan | undefined>(
    undefined,
  );
  const receivePagination = (value: BrowserPages) => {
    pagePlan.current = value.plan;
    setBrowserPages((old) =>
      JSON.stringify(old) === JSON.stringify(value) ? old : value,
    );
  };
  const templatePanels = useEditorPanels(
    data.user.actor,
    templatePaper,
    true,
    true,
  );
  function openTab(value: string) {
    setTab(value);
    setMoreAnchor(null);
    if (templatePanels.phone || !templatePanels.canRight)
      setTemplateToolsOpen(true);
    else if (!templatePanels.right) templatePanels.toggle("right");
  }
  useEffect(() => {
    api<Activity[]>("/api/workspace_events")
      .then(setEvents)
      .catch(() => {});
  }, []);
  const phoneSection =
    templatePanels.phone && !selection.selectMode
      ? contentSections(content).find((s) =>
          s.indices.some(
            (n) =>
              `template-${content[n].id ?? n}` === selection.selected ||
              content[n].clauses?.some(
                (c) => `template-clause-${c.id}` === selection.selected,
              ),
          ),
        )
      : undefined;
  useEffect(() => {
    templatePaper.current?.dispatchEvent(new Event("pagination-layout-change"));
  }, [templatePanels.phone, selection.selected]);
  const [templateListOpen, setTemplateListOpen] = useState(false),
    [templateToolsOpen, setTemplateToolsOpen] = useState(false);
  const toggleTemplateLeft = () => {
    if (templatePanels.canLeft) templatePanels.toggle("left");
    else setTemplateListOpen((v) => !v);
  };
  const toggleTemplateRight = () => {
    if (templatePanels.canRight) templatePanels.toggle("right");
    else setTemplateToolsOpen((v) => !v);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.repeat &&
        (e.key === "\\" || e.code === "Backslash")
      ) {
        e.preventDefault();
        if (e.shiftKey) toggleTemplateLeft();
        else toggleTemplateRight();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [templatePanels.canLeft, templatePanels.canRight]);
  const templatePreview = useTemplatePreview(
    draft
      ? { ...draft, pagination: browserPages?.plan ?? draft.pagination }
      : null,
    data.catalog,
    mode === "templates",
    data.settings,
  );
  const previewRef = useRef(templatePreview);
  previewRef.current = templatePreview;
  const templateStyles = resolveStyles(
    data.settings,
    mode === "templates" ? draft?.style_overrides : undefined,
  );
  const blockSpaces = documentSpacing(content, templateStyles);
  const templateMetrics = pageMetrics(templateStyles);
  const currentContent = useRef(content);
  currentContent.current = content;
  const resource = () => {
    const value =
      mode === "templates" ? model.current.draft : model.current.saved;
    const id = value?.id ?? (value as any)?.block?.id ?? "new";
    return {
      value,
      key: `${mode}:${id}`,
      path: mode === "templates" ? "/api/templates" : "/api/content_library",
    };
  };
  const resourceRef = useRef(resource());
  resourceRef.current = resource();
  const currentResource = resourceRef.current,
    templateDirty =
      !(mode === "templates" && draft?.starter_key) &&
      !!currentResource.value &&
      savedModels.current.get(currentResource.key) !==
        serialise(currentResource.value);
  const templateCache = (key: string) =>
    `studio-unsaved:${data.user.workspace_id ?? "workspace"}:${key}`;
  useEffect(() => {
    const online = () => setTemplateOffline(!navigator.onLine);
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, []);
  useEffect(() => {
    try {
      const cached = JSON.parse(
        localStorage.getItem(templateCache(currentResource.key)) ?? "null",
      );
      setTemplateRecovery(
        cached && serialise(cached) !== serialise(currentResource.value)
          ? cached
          : null,
      );
    } catch {}
  }, [currentResource.key]);
  useEffect(() => {
    if (templateDirty)
      try {
        localStorage.setItem(
          templateCache(currentResource.key),
          serialise(currentResource.value),
        );
      } catch {}
    else if (!templateRecovery && currentResource.value)
      try {
        localStorage.removeItem(templateCache(currentResource.key));
      } catch {}
  }, [currentResource.key, templateDirty, serialise(currentResource.value)]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const r = resource();
      if (
        !allowLeave.current &&
        r.value &&
        savedModels.current.get(r.key) !== serialise(r.value)
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [mode]);
  function saveTemplate(): Promise<boolean> {
    if (mode === "templates" && model.current.draft?.starter_key)
      return Promise.resolve(true);
    if (templateFlight.current) return templateFlight.current;
    const draftScope = mode === "blocks" && updateDraftsRef.current;
    const approvedDraftIds = usage.drafts.map((p) => p.id);
    let forceScope = draftScope;
    const flight = (async () => {
      setTemplateError("");
      setTemplateBusy(true);
      try {
        while (true) {
          const captured = resourceRef.current;
          if (
            !captured.value ||
            (savedModels.current.get(captured.key) ===
              serialise(captured.value) &&
              !forceScope)
          )
            return true;
          if (!navigator.onLine)
            throw new Error("Offline — changes kept on this device");
          templatePaper.current?.dispatchEvent(new Event("pagination-flush"));
          const result = await post(captured.path, {
            ...captured.value,
            expected_revision: studioRevisions.current.get(captured.key),
            id: captured.value.id ?? crypto.randomUUID(),
            ...(captured.path === "/api/content_library"
              ? {
                  update_drafts: draftScope,
                  update_draft_ids: approvedDraftIds,
                }
              : {}),
            ...(captured.path === "/api/templates"
              ? { pagination: pagePlan.current }
              : {}),
          });
          forceScope = false;
          if (result.revision) {
            studioRevisions.current.set(captured.key, result.revision);
            studioRevisions.current.set(
              `${captured.path === "/api/templates" ? "templates" : "blocks"}:${result.id}`,
              result.revision,
            );
          }
          savedModels.current.set(captured.key, serialise(captured.value));
          if (
            captured.path === "/api/templates" &&
            resourceRef.current.key === captured.key &&
            serialise(resourceRef.current.value) === serialise(captured.value)
          ) {
            const next = { ...model.current.draft!, ...result };
            savedModels.current.set(captured.key, serialise(next));
            applyModel({ ...model.current, draft: next });
            resourceRef.current = { ...captured, value: next };
          }
          setTemplateLastSaved(new Date().toISOString());
          if (!templateRecovery)
            try {
              localStorage.removeItem(templateCache(captured.key));
            } catch {}
          if (resourceRef.current.key !== captured.key) continue;
          if (
            captured.path === "/api/content_library" &&
            !model.current.saved?.id
          ) {
            const next = { ...model.current.saved!, id: result.id };
            savedModels.current.set(
              `blocks:${result.id}`,
              serialise({ ...captured.value, id: result.id }),
            );
            applyModel({ ...model.current, saved: next });
            resourceRef.current = {
              ...captured,
              key: `blocks:${result.id}`,
              value: next,
            };
          }
          if (
            savedModels.current.get(resourceRef.current.key) ===
            serialise(resourceRef.current.value)
          )
            break;
        }
        await run(
          async () => {},
          mode === "templates" ? "Template saved" : "Block saved",
        );
        if (draftScope) {
          updateDraftsRef.current = false;
          setUpdateDrafts(false);
        }
        return true;
      } catch (e) {
        setTemplateError(e instanceof Error ? e.message : "Unable to save");
        return false;
      } finally {
        setTemplateBusy(false);
      }
    })();
    templateFlight.current = flight;
    void flight.finally(() => {
      if (templateFlight.current === flight) templateFlight.current = null;
    });
    return flight;
  }
  useReloadGuard({
    blocked: !!templateRecovery || !!templateError,
    pending: templateDirty || templateBusy,
    hasPendingWork: () =>
      !!resourceRef.current.value &&
      savedModels.current.get(resourceRef.current.key) !==
        serialise(resourceRef.current.value),
    flush: saveTemplate,
  });
  const autoSaveKey = serialise(mode === "templates" ? draft : null);
  useEffect(() => {
    if (
      mode !== "templates" ||
      !templateDirty ||
      templateRecovery ||
      templateError ||
      templateOffline ||
      !draft?.name.trim()
    )
      return;
    const timer = setTimeout(() => void saveTemplate(), 600);
    return () => clearTimeout(timer);
  }, [
    autoSaveKey,
    mode,
    templateDirty,
    templateRecovery,
    templateError,
    templateOffline,
  ]);
  const starterActions = useStarterActions(
    mode === "templates" ? draft : null,
    data.user.staff_role === "owner",
    async (next) => {
      setStarterAttempt(null);
      selection.clear();
      setIndex(null);
      savedModels.current.set(`templates:${next.id}`, serialise(next));
      applyModel({ ...model.current, draft: next });
      await run(async () => {});
    },
    () => {
      allowLeave.current = true;
    },
    starterAttempt,
  );
  useEffect(() => {
    if (new URLSearchParams(location.search).get("copy") === "without-edit")
      setCopyWithoutEdit(true);
    if (new URLSearchParams(location.search).get("preview") === "1")
      setPreviewOpen(true);
  }, []);
  const connectorRestore = useConnectorRestore(async (value) => {
    const next = { ...model.current, draft: value };
    history.record(model.current, next);
    applyModel(next);
    studioRevisions.current.set(`templates:${value.id}`, value.revision);
    savedModels.current.set(`templates:${value.id}`, serialise(value));
    await run(async () => {});
  }, saveTemplate);
  async function duplicateSaved() {
    if (!model.current.saved) return;
    const value = model.current.saved,
      id = crypto.randomUUID();
    try {
      await post("/api/content_library", {
        id,
        name: `${value.name} copy`,
        block: duplicateBlock(value.block),
        ...(value.type === "group"
          ? { type: "group", blocks: value.blocks?.map(duplicateBlock) }
          : {}),
      });
      allowLeave.current = true;
      location.assign(`/studio/blocks/${id}`);
    } catch (e) {
      blockFeedback.error((e as Error).message);
    }
  }
  async function deleteSaved() {
    const value = model.current.saved;
    if (!value?.id) return;
    if (
      !(await confirmDialog({
        title: `Delete block “${value.name}”?`,
        description: `Used in ${value.used_in?.templates.length ?? 0} linked templates. Removes it from Saved blocks and unlinks those copies. Copies already in templates and proposals stay as they are.`,
        confirmLabel: "Delete block",
        cancelLabel: "Cancel",
        destructive: true,
      }))
    )
      return;
    try {
      await api(`/api/content_library/${value.id}`, { method: "DELETE" });
      allowLeave.current = true;
      location.assign("/studio/templates?view=blocks");
    } catch (e) {
      blockFeedback.error((e as Error).message);
    }
  }
  const edited = events.find((e) => e.metadata.entity_id === saved?.id),
    created = events.find(
      (e) =>
        e.metadata.entity_id === saved?.id &&
        e.type === "content_library_created",
    );
  const eventAuthor = (e: Activity) =>
    data.staff.find((m) => e.actor === `staff:${m.user_id}`)?.display_name ??
    "Staff";
  const defaults = draft ? templateAuthoringItems(draft, data.catalog) : [];
  function changeDefaults(next: QuoteItem[]) {
    editDraft({
      ...model.current.draft!,
      default_quote: [],
      default_items: next.map((item, order) => ({
        ...item,
        order,
        selected: !item.optional || item.default_selected,
      })),
    });
  }
  function addDefault(item?: Item) {
    const id = crypto.randomUUID();
    changeDefaults([
      ...defaults,
      item
        ? catalogQuoteItem(
            item,
            defaults.length,
            id,
            Array.from({ length: item.sublines?.length ?? 1 }, () =>
              crypto.randomUUID(),
            ),
          )
        : {
            id,
            order: defaults.length,
            name: "Custom item",
            description: "",
            source: "custom",
            pricing_item_id: null,
            custom_family_id: null,
            sublines: [
              {
                id: crypto.randomUUID(),
                amount: 0,
                list_amount: null,
                interval: "one_time",
                qty: 1,
                stripe_lookup_key: null,
                qbo_item_ref: null,
              },
            ],
            optional: false,
            default_selected: true,
            choice_group_id: null,
            min_term_months: null,
            schedule: null,
            plan_terms: null,
          },
    ]);
    setExpandedDefault(id);
  }
  const patch = (next: Block[]) => {
    if (mode === "blocks" && saved) {
      const blocks: Block[] = next.length
        ? next
        : [{ id: crypto.randomUUID(), type: "paragraph", text: "" }];
      editSaved({
        ...saved,
        block: blocks[0],
        ...(saved.type === "group" ? { blocks } : {}),
      });
    } else if (draft) editDraft({ ...draft, content: next });
  };
  const move = (operation: (content: Block[]) => Block[]) =>
    applyDocumentMove(
      currentContent.current,
      operation,
      (next) => {
        selection.clear();
        patch(next);
        setIndex(null);
      },
      blockFeedback.error,
    );
  function insertBlock(block: Block, extra: Block[] = [], atOverride?: number) {
    const at = atOverride ?? insertAt ?? currentContent.current.length;
    let next: Block[];
    try {
      next = insertAuthoringBlocks(
        currentContent.current,
        [block, ...extra],
        at,
        replaceEmpty && atOverride === undefined,
      );
    } catch (error) {
      blockFeedback.error((error as Error).message);
      return;
    }
    patch(next);
    setInsertAt(null);
    setIndex(null);
    setReplaceEmpty(false);
    const inserted =
      next.find(
        (b, n) =>
          n >= at &&
          !content.some((old) => old.id === b.id) &&
          b.type !== "heading",
      ) ?? next[at];
    focusInserted(
      `template-${inserted.id}`,
      ["paragraph", "heading"].includes(inserted.type),
    );
  }
  const blockDrop = useBlockDrop(content, templatePaper, (blocks, at) =>
    insertBlock(blocks[0], blocks.slice(1), at),
  );
  const templateBlocks = (
    <BlockMenu
      variant="panel"
      anchor={null}
      hasPricing={content.some((b) => b.type === "pricing_table")}
      signatureRoles={content
        .filter((b) => b.type === "signature_block")
        .map((b) => b.role!)}
      saved={data.library}
      onChoose={(block, extra) =>
        insertBlock(
          block,
          extra,
          defaultBlockInsertion(
            templatePaper.current,
            content,
            selection.selected,
            browserPages?.assignments,
          ),
        )
      }
      onClose={() => setTemplateToolsOpen(false)}
      onDragStart={() => setTemplateToolsOpen(false)}
    />
  );
  const specimen =
    draft && data.settings
      ? authoringPreview(
          {
            id: draft.id,
            content,
            quote: templatePreview.quote,
            header_footer: draft.header_footer,
            cover: draft.cover,
            style_overrides: draft.style_overrides,
          },
          data.settings,
          "template-preview",
        )
      : null;
  const map = specimen
    ? variables({ ...specimen, workspace_settings: data.settings! })
    : {};
  const inspector =
    index !== null && content[index] ? (
      <BlockPanel
        key={content[index].id ?? index}
        block={content[index]}
        clause={clauseIndex}
        setClause={setClauseIndex}
        data={data}
        map={map}
        onChange={(b) =>
          patch(currentContent.current.map((v) => (v.id === b.id ? b : v)))
        }
        saveAction={blockFeedback.reuseButton(content[index], true)}
        onSlash={(anchor) => {
          setInsertAnchor(anchor ?? null);
          setReplaceEmpty(true);
          setInsertAt(index);
        }}
      />
    ) : null;
  const templateSidebar = (
    <>
      {mode === "templates" && draft && (
        <>
          <SectionsNav
            map={map}
            currentSectionId={
              contentSections(content).find((section) =>
                section.indices.some(
                  (n) => `template-${content[n].id}` === selection.selected,
                ),
              )?.id ?? null
            }
            content={content}
            onMove={move}
            pagination={browserPages}
            measure={(content) =>
              paginateBrowser(
                templatePaper.current!,
                content,
                templateStyles,
                false,
                true,
                proposalBands(draft?.header_footer),
              )
            }
            onChange={(content) => {
              selection.clear();
              setIndex(null);
              patch(content);
            }}
            onFocus={(id) => {
              if (id === "cover") {
                templatePaper.current
                  ?.querySelector(".template-cover")
                  ?.scrollIntoView({ block: "start" });
                return;
              }
              const n = content.findIndex((b) => b.id === id);
              if (templateListOpen) setTemplateListOpen(false);
              if (n >= 0)
                focusInserted(
                  `template-${content[n].id}`,
                  ["paragraph", "heading"].includes(content[n].type),
                );
              requestAnimationFrame(() =>
                document
                  .querySelector(`[data-block-id="template-${CSS.escape(id)}"]`)
                  ?.scrollIntoView({ block: "center" }),
              );
            }}
          />
        </>
      )}
    </>
  );
  const templateTools = draft && (
    <div className="template-style-panel">
      <section className="template-fonts-row">
        <h3>Fonts</h3>
        <div>
          <strong>
            {[templateStyles.title.font, templateStyles.body.font]
              .map((f) =>
                typeof f === "string"
                  ? (curatedFonts.find((v) => v.id === f)?.name ?? f)
                  : f.name,
              )
              .join(" · ")}
          </strong>
          <small>From Workspace › Proposal fonts</small>
          <button
            type="button"
            onClick={() => {
              const panel = document.querySelector(".template-style-panel");
              const accordion =
                panel?.querySelector<HTMLDetailsElement>("details");
              if (accordion) accordion.open = true;
              panel
                ?.querySelector<HTMLElement>('select[aria-label$="font"]')
                ?.focus();
            }}
          >
            Change
          </button>
        </div>
      </section>
      <ProposalStyles
        cover={draft.cover}
        onCover={(cover) => editDraft({ ...draft, cover })}
        scope="template"
        settings={data.settings}
        headerFooter={proposalBands(draft.header_footer)}
        onHeaderFooter={({ overrides: _overrides, ...header_footer }) =>
          editDraft({ ...draft, header_footer })
        }
        onResetBands={() => {
          const { overrides: _, ...header_footer } = resetBandSettings(
            proposalBands(model.current.draft?.header_footer),
          );
          editDraft({ ...model.current.draft!, header_footer });
        }}
        bandsResetLabel="Reset to default"
        pageCount={browserPages?.plan.pages ?? 1}
        value={draft.style_overrides}
        onChange={(style_overrides) => editDraft({ ...draft, style_overrides })}
        resetLabel="Reset to workspace"
      />
    </div>
  );
  const panelTabs =
    mode === "templates"
      ? ["Quote", "Fields", "Blocks", "Styles"]
      : ["Used in", "Fields", "Details"];
  const usage = data.library.find((b) => b.id === saved?.id)?.used_in ??
    saved?.used_in ?? { templates: [], drafts: [] };
  const panelBody =
    mode === "blocks" && tab === "Used in" ? (
      <section className="saved-block-usage stack" aria-label="Used in">
        <h3>TEMPLATES · LINKED</h3>
        {usage.templates.length ? (
          usage.templates.map((t) => (
            <a
              className="saved-block-usage-row"
              key={t.id}
              href={`/studio/templates/${t.id}`}
            >
              <strong>{t.name}</strong>
              <small>
                {t.edited ? "Edited here · kept on save" : "Updates on save"}
              </small>
            </a>
          ))
        ) : (
          <p className="muted">Not linked to any templates yet.</p>
        )}
        <h3>DRAFTS WITH A COPY · {usage.drafts.length}</h3>
        {usage.drafts.map((p) => (
          <a
            className="saved-block-usage-row"
            key={p.id}
            href={`/proposals/${p.id}/edit`}
          >
            <strong>{p.title}</strong>
            <small>
              {p.status} ·{" "}
              {data.staff.find((m) => m.user_id === p.owner)?.display_name ??
                p.owner}
            </small>
          </a>
        ))}
        {!usage.drafts.length && (
          <p className="muted">No drafts have a copy.</p>
        )}
        <fieldset className="saved-block-save-scope">
          <legend>WHEN YOU SAVE</legend>
          <label>
            <input
              type="radio"
              name="saved-block-scope"
              disabled={templateBusy}
              checked={!updateDrafts}
              onChange={() => setUpdateDrafts(false)}
            />
            <span>
              <strong>Templates and new proposals</strong>
              <small>
                Drafts keep their current copy. This is the safe default.
              </small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="saved-block-scope"
              disabled={templateBusy}
              checked={updateDrafts}
              onChange={() => setUpdateDrafts(true)}
            />
            <span>
              <strong>
                Also update {usage.drafts.length}{" "}
                {usage.drafts.length === 1 ? "draft" : "drafts"}
              </strong>
              <small>
                Replaces this block in the drafts listed above. Any edits made
                to it in those drafts are lost.
              </small>
            </span>
          </label>
        </fieldset>
      </section>
    ) : tab === "Fields" ? (
      <FieldOptions
        map={map}
        onInsert={(path) => {
          if (templatePanels.phone || templateToolsOpen) {
            setTemplateToolsOpen(false);
            requestAnimationFrame(() => fieldInsertion?.insert(path));
          } else fieldInsertion?.insert(path);
        }}
      />
    ) : mode === "blocks" && tab === "Details" && saved ? (
      <div className="saved-block-details stack">
        <Field label="Name">
          <input
            aria-label="Block name"
            value={saved.name}
            onChange={(e) => editSaved({ ...saved, name: e.target.value })}
          />
        </Field>
        {saved.type !== "group" && (
          <Field label="Type">
            <select
              disabled={!["paragraph", "heading"].includes(saved.block.type)}
              value={savedBlockType(saved.block)}
              onChange={(e) =>
                editSaved({
                  ...saved,
                  block: convertSavedBlockType(saved.block, e.target.value),
                })
              }
            >
              {!["paragraph", "heading"].includes(saved.block.type) ? (
                <option value={savedBlockType(saved.block)}>
                  {savedBlockType(saved.block)}
                </option>
              ) : (
                <>
                  <option>Text</option>
                  <option>Bulleted list</option>
                  <option>Numbered list</option>
                </>
              )}
            </select>
          </Field>
        )}
        {saved.type !== "group" &&
          !["paragraph", "heading"].includes(saved.block.type) && (
            <p className="muted">This block type can't be changed</p>
          )}
        {edited && (
          <p className="muted">
            Edited {studioDate(edited.created_at)} · {eventAuthor(edited)}
          </p>
        )}
        {created && (
          <p className="muted">
            Created {studioDate(created.created_at)} by {eventAuthor(created)}
          </p>
        )}
        <Button variant="danger" onClick={() => void deleteSaved()}>
          Delete block
        </Button>
        <p>
          Removes it from Saved blocks. Copies already in templates and
          proposals stay as they are.
        </p>
      </div>
    ) : tab === "Blocks" ? (
      templateBlocks
    ) : tab === "Styles" ? (
      templateTools
    ) : mode === "templates" ? (
      <section id="template-default-quote">
        <TemplateWarnings templates={[draft!]} catalog={data.catalog} />
        <QuoteItemsPanel
          items={defaults}
          totalsItems={templatePreview.quote}
          catalog={data.catalog}
          families={data.families}
          currency={data.settings?.currency ?? "USD"}
          onChange={changeDefaults}
          addItem={addDefault}
          expandedItem={expandedDefault}
          setExpandedItem={setExpandedDefault}
          itemDetails={defaultDetails}
          setItemDetails={setDefaultDetails}
          intro="Lines added to every new proposal from this template. Prices are left blank or copied from the catalog; the app never fills them in for you."
        />
      </section>
    ) : null;

  return (
    <div
      {...blockDrop.handlers}
      ref={templatePanels.container}
      className={`studio-template-layout studio-v3-editor editor-v2 ${mode === "blocks" ? "studio-saved-block-editor" : "studio-template-editor"}`}
      data-template-phone-editing={!!phoneSection}
      style={{
        gridTemplateColumns:
          mode === "blocks"
            ? `minmax(0,1fr) ${templatePanels.right ? 400 : 64}px`
            : templatePanels.columns,
      }}
    >
      {blockDrop.line}
      <EditorControlConfig
        document={{
          content,
          prefix: "template-",
          source: mode === "templates" ? "template" : "library",
          onChange: patch,
          reuse: blockFeedback.reuse,
          remove: blockFeedback.remove,
        }}
        locked={!!starterAttempt && !!draft?.starter_key}
        compactPhone
        compact={templatePanels.compact}
        map={map}
        onField={
          templatePanels.phone || templatePanels.right
            ? () => openTab("Fields")
            : undefined
        }
      />
      <PageBreakController
        content={mode === "templates" ? content : []}
        onChange={patch}
      />
      {blockFeedback.feedback}
      {mode === "templates" && (
        <SectionsPanel
          className="studio-template-list"
          open={templatePanels.canLeft ? templatePanels.left : templateListOpen}
          mode={templatePanels.canLeft ? "docked" : "drawer"}
          onToggle={toggleTemplateLeft}
        >
          {templateSidebar}
        </SectionsPanel>
      )}
      <main className="studio-template-main stack">
        <EditorHeader
          className="template-editor-header"
          title={
            mode === "templates"
              ? (draft?.name ?? "Templates & blocks")
              : (saved?.name ?? "Saved blocks")
          }
          backLabel={mode === "templates" ? "Templates" : "Saved blocks"}
          backHref={
            mode === "templates"
              ? "/studio/templates"
              : "/studio/templates?view=blocks"
          }
          savedLabel={
            mode === "templates"
              ? draft?.starter_key
                ? "Yeswell starter · read-only"
                : "Saved · changes apply to new proposals"
              : "Saved"
          }
          dirtyLabel="Edited · not saved"
          titleEditor={
            <>
              <input
                className="studio-inline-name"
                aria-label={
                  mode === "templates" ? "Template name" : "Block name"
                }
                value={
                  mode === "templates"
                    ? (draft?.name ?? "")
                    : (saved?.name ?? "")
                }
                required
                maxLength={200}
                onChange={(e) =>
                  mode === "templates"
                    ? editDraft({ ...draft!, name: e.target.value })
                    : editSaved({ ...saved!, name: e.target.value })
                }
              />
              {mode === "blocks" && saved && (
                <span className="studio-type-pill">
                  {savedBlockLabel(saved as SavedBlock)}
                </span>
              )}
            </>
          }
          meta={
            mode === "templates" ? (
              <>
                {draft?.starter_key && (
                  <span className="starter-pill">Starter</span>
                )}
                {draft?.source_starter_key && (
                  <span className="starter-source">
                    Based on{" "}
                    {draft.source_starter_name ??
                      data.templates.find(
                        (t) => t.starter_key === draft.source_starter_key,
                      )?.name ??
                      draft.source_starter_key}
                  </span>
                )}
                {!draft?.active && (
                  <span className="studio-hidden-pill">
                    Hidden from new proposals
                  </span>
                )}
              </>
            ) : null
          }
          save={saveTemplate}
          dirty={templateDirty}
          saving={templateBusy}
          error={templateError}
          offline={templateOffline}
          lastSaved={templateLastSaved}
          retry={() => void saveTemplate()}
          beforeLeave={() => {
            allowLeave.current = true;
          }}
        >
          {!templatePanels.phone && <TemplateHistoryControls />}
          {phoneSection && mode === "templates" && (
            <Button
              aria-label="Done editing template section"
              onClick={() => {
                selection.clear();
                (document.activeElement as HTMLElement)?.blur();
              }}
            >
              Done
            </Button>
          )}
          {(mode === "templates" || templatePanels.phone) && (
            <button
              className="studio-editor-more"
              aria-label="More editor actions"
              aria-haspopup="dialog"
              onClick={(e) => {
                if (templatePanels.phone) {
                  setTemplateToolsOpen(true);
                } else setMoreAnchor(e.currentTarget);
              }}
            >
              ⋯
            </button>
          )}
          {mode === "templates" ? (
            <>
              <Button
                className="studio-desktop-action"
                onClick={() => setPreviewOpen(true)}
              >
                Preview
              </Button>
              <Button
                className="studio-desktop-action"
                variant="primary"
                disabled={!draft?.active}
                title={
                  !draft?.active
                    ? "Make this template available for new proposals first"
                    : undefined
                }
                onClick={async () => {
                  if (await saveTemplate()) {
                    allowLeave.current = true;
                    location.assign(`/proposals?new=1&template=${draft!.id}`);
                  }
                }}
              >
                New proposal from this
              </Button>
            </>
          ) : (
            <>
              <Button
                className="studio-desktop-action"
                onClick={() => void duplicateSaved()}
              >
                Duplicate
              </Button>
              <Button
                variant="primary"
                busy={templateBusy}
                onClick={() => void saveTemplate()}
              >
                Save changes
              </Button>
            </>
          )}
        </EditorHeader>
        {copyWithoutEdit && (
          <Banner title="Your copy is ready">
            The unfinished change could not be applied. Continue editing here.
          </Banner>
        )}
        {starterAttempt && draft?.starter_key && (
          <div className="starter-edit-notice" role="status">
            <span>This is a Yeswell starter. Make a copy to customize it.</span>
            <Button variant="primary" onClick={starterActions.copy}>
              Make a copy
            </Button>
          </div>
        )}
        {starterActions.dialogs}
        {connectorRestore.feedback}
        {templateRecovery && (
          <EditorNotice kind="recovered">
            <span title={templateRecovery.name}>
              Your unsaved edits were kept as a suggestion.{" "}
              {templateRecovery.name}
            </span>
            <EditorButton
              variant="primary"
              onClick={() => {
                if (mode === "templates") editDraft(templateRecovery);
                else editSaved(templateRecovery);
                setTemplateRecovery(null);
              }}
            >
              Restore my edits
            </EditorButton>
            <EditorButton
              onClick={() => {
                localStorage.removeItem(templateCache(currentResource.key));
                setTemplateRecovery(null);
              }}
            >
              Keep current draft
            </EditorButton>
          </EditorNotice>
        )}
        {templateError && (
          <EditorNotice kind="error">
            <span title={templateError}>
              {isStaffSignedOut(templateError) ? (
                templateError
              ) : (
                <>Your changes are still here. {templateError}</>
              )}
            </span>
            {isStaffSignedOut(templateError) && <StaffSignIn />}
            <EditorButton variant="primary" onClick={() => void saveTemplate()}>
              Retry
            </EditorButton>
          </EditorNotice>
        )}
        {(mode === "templates" && draft) || (mode === "blocks" && saved) ? (
          <>
            {mode === "blocks" && (
              <button
                type="button"
                className="saved-block-phone-usage"
                onClick={() => openTab("Used in")}
              >
                In {usage.templates.length}{" "}
                {usage.templates.length === 1 ? "template" : "templates"} ·{" "}
                {usage.drafts.length}{" "}
                {usage.drafts.length === 1 ? "draft" : "drafts"} with a copy
              </button>
            )}
            {mode === "blocks" && (
              <p className="saved-block-caption">
                Shown as it appears in a proposal. Fields fill in with each
                client's details.
              </p>
            )}
            <div className="template-page-viewport">
              <div
                style={{
                  width: undefined,
                  height: undefined,
                  marginInline: "auto",
                }}
              >
                <Reorder
                  ids={content.map((_, n) => String(n))}
                  onMove={(from, to) =>
                    move((blocks) =>
                      moveDocumentBlock(
                        blocks,
                        content[Number(from)].id!,
                        content[Number(to)].id!,
                      ),
                    )
                  }
                >
                  <div
                    key={draft?.starter_key ? starterGeneration : undefined}
                    ref={templatePaper}
                    data-sheet-view={mode === "templates" ? "true" : undefined}
                    data-editor-density={
                      templateStyles.layout?.density ?? "comfortable"
                    }
                    className={`studio-blocks proposal-typography document-reading ${mode === "templates" ? "template-paged-paper" : ""}`}
                    style={
                      mode === "templates"
                        ? ({
                            position: "relative",
                            "--editor-ui-scale": 1,
                            transform: undefined,
                            transformOrigin: "top left",
                            minHeight: undefined,
                            padding: `${templateMetrics.margins.top * 96}px ${templateMetrics.margins.right * 96}px ${templateMetrics.margins.bottom * 96}px ${templateMetrics.margins.left * 96}px`,
                          } as CSSProperties)
                        : undefined
                    }
                  >
                    {mode === "templates" && (
                      <PagedPaper
                        allowOverrides={false}
                        enabled={!phoneSection}
                        paper={templatePaper}
                        styles={templateStyles}
                        content={content}
                        headerFooter={proposalBands(draft?.header_footer)}
                        onHeaderFooter={
                          draft
                            ? ({ overrides: _, ...header_footer }) =>
                                editDraft({ ...draft, header_footer })
                            : undefined
                        }
                        values={map}
                        logoIcon={
                          data.settings?.logo_icon
                            ? `/api/workspace-icon?size=128&v=${encodeURIComponent(data.settings!.logo_icon!.path)}`
                            : undefined
                        }
                        logo={
                          data.settings?.logo
                            ? "/api/workspace-logo"
                            : undefined
                        }
                        contentKey={JSON.stringify([
                          printView(content, templatePreview.quote),
                          draft?.default_quote,
                          draft?.default_items,
                          draft?.style_overrides,
                          draft?.cover,
                          draft?.header_footer,
                        ])}
                        onPagination={receivePagination}
                        sheets
                      />
                    )}
                    <div
                      className={`proposal-typography document-reading template-cover ${!content.length ? "empty-sheet-cover" : ""}`}
                    >
                      <style>
                        {fontCss(data.settings)}
                        {styleFontFaces(templateStyles)}
                        {documentStyleCss(
                          templateStyles,
                          data.settings?.accent_colour,
                        )}
                      </style>
                      {mode === "templates" && (
                        <DocumentCover
                          contentHeight={
                            pageGeometry(
                              resolveStyles(
                                data.settings,
                                draft?.style_overrides,
                              ),
                              draft?.header_footer
                                ? proposalBands(draft.header_footer)
                                : undefined,
                              1,
                            ).content.height
                          }
                          paperInsets={
                            pageGeometry(
                              resolveStyles(
                                data.settings,
                                draft?.style_overrides,
                              ),
                              draft?.header_footer
                                ? proposalBands(draft.header_footer)
                                : undefined,
                              1,
                            ).margins
                          }
                          title="Proposal title"
                          cover={draft?.cover}
                          map={map}
                          onCover={
                            mode === "templates"
                              ? (cover) => editDraft({ ...draft!, cover })
                              : undefined
                          }
                          workspace={data.settings?.company_name}
                          accent={data.settings?.accent_colour}
                          logoIcon={
                            data.settings?.logo_icon
                              ? `/api/workspace-icon?size=128&v=${encodeURIComponent(data.settings!.logo_icon!.path)}`
                              : undefined
                          }
                          logo={
                            data.settings?.logo
                              ? "/api/workspace-logo"
                              : undefined
                          }
                          company="Client company"
                          sender={
                            data.settings?.owner ||
                            data.settings?.company_name ||
                            "Company"
                          }
                        />
                      )}
                    </div>
                    {mode === "templates" && !content.length && (
                      <button
                        type="button"
                        className="empty-document-insert"
                        aria-label="Add first block"
                        onClick={(e) => {
                          setInsertAnchor(e.currentTarget);
                          setReplaceEmpty(false);
                          setInsertAt(0);
                        }}
                      >
                        <span className="empty-sheet-plus" aria-hidden="true">
                          +
                        </span>
                        <span>Add your first block</span>
                      </button>
                    )}
                    {pairSignatureNodes(
                      content,
                      content.map((b, n) => (
                        <Sortable
                          block
                          draggable={
                            mode === "templates" || saved?.type === "group"
                          }
                          id={String(n)}
                          spaceBefore={blockSpaces[b.id ?? String(n)]}
                          label={`block ${n + 1}`}
                          key={b.id ?? n}
                        >
                          <BlockFrame
                            id={`template-${b.id ?? n}`}
                            label={`Template block ${n + 1}`}
                            blockType={b.type}
                            plainText={b.type === "contract"}
                            objectAction={
                              b.type === "pricing_table" ? (
                                <button
                                  type="button"
                                  title="Edit quote"
                                  onClick={() => openTab("Quote")}
                                >
                                  Edit quote
                                </button>
                              ) : undefined
                            }
                            onUndo={() =>
                              patch(
                                content.map((v, j) =>
                                  j === n
                                    ? {
                                        ...v,
                                        ai_review: {
                                          source:
                                            v.ai_review?.source ?? "assistant",
                                          reviewed: false,
                                        },
                                      }
                                    : v,
                                ),
                              )
                            }
                            className={`studio-block-card ${phoneSection && !phoneSection.indices.includes(n) ? "phone-section-hidden" : ""} ${b.type === "page_break" ? "sheet-break-marker" : ""}`}
                            insert={
                              mode === "templates" || saved?.type === "group"
                                ? (edge, anchor) => {
                                    setInsertAnchor(anchor);
                                    setReplaceEmpty(false);
                                    setInsertAt(n + (edge === "below" ? 1 : 0));
                                  }
                                : undefined
                            }
                            onInsertField={
                              ["paragraph", "heading"].includes(b.type)
                                ? (path) => {
                                    patch(
                                      content.map((v, j) =>
                                        j === n ? appendField(v, path) : v,
                                      ),
                                    );
                                    focusInserted(`template-${b.id}`, true);
                                  }
                                : undefined
                            }
                            ai={!!b.ai_review && !b.ai_review.reviewed}
                            onReviewed={() =>
                              patch(
                                content.map((v, j) =>
                                  j === n
                                    ? {
                                        ...v,
                                        ai_review: {
                                          source:
                                            v.ai_review?.source ?? "assistant",
                                          reviewed: true,
                                        },
                                      }
                                    : v,
                                ),
                              )
                            }
                            tools={
                              <>
                                <BlockAction
                                  aria-label="Block settings"
                                  onClick={() => {
                                    setClauseIndex(0);
                                    setIndex(n);
                                  }}
                                >
                                  Block settings
                                </BlockAction>
                                {(mode === "templates" ||
                                  saved?.type === "group") && (
                                  <>
                                    <BlockAction
                                      aria-label={`Move block ${n + 1} up`}
                                      disabled={
                                        !canMoveAdjacentBlock(
                                          content,
                                          b.id!,
                                          -1,
                                        )
                                      }
                                      onClick={() =>
                                        move((blocks) =>
                                          moveAdjacentBlock(blocks, b.id!, -1),
                                        )
                                      }
                                    >
                                      Move up
                                    </BlockAction>
                                    <BlockAction
                                      aria-label={`Move block ${n + 1} down`}
                                      disabled={
                                        !canMoveAdjacentBlock(content, b.id!, 1)
                                      }
                                      onClick={() =>
                                        move((blocks) =>
                                          moveAdjacentBlock(blocks, b.id!, 1),
                                        )
                                      }
                                    >
                                      Move down
                                    </BlockAction>
                                    {![
                                      "pricing_table",
                                      "signature_block",
                                    ].includes(b.type) && (
                                      <BlockAction
                                        aria-label="Duplicate block"
                                        onClick={() => {
                                          const next = [
                                            ...currentContent.current,
                                          ];
                                          next.splice(
                                            n + 1,
                                            0,
                                            duplicateBlock(b),
                                          );
                                          patch(next);
                                        }}
                                      >
                                        Duplicate block
                                      </BlockAction>
                                    )}
                                    {blockFeedback.reuseButton(b)}
                                    <BlockAction
                                      aria-label="Delete block"
                                      onClick={() =>
                                        blockFeedback.remove(
                                          b,
                                          () => {
                                            patch(
                                              currentContent.current.filter(
                                                (v) => v !== b,
                                              ),
                                            );
                                            setIndex(null);
                                          },
                                          () => {
                                            const next = [
                                              ...currentContent.current,
                                            ];
                                            next.splice(
                                              Math.min(n, next.length),
                                              0,
                                              b,
                                            );
                                            patch(next);
                                          },
                                        )
                                      }
                                    >
                                      Delete block
                                    </BlockAction>
                                  </>
                                )}
                              </>
                            }
                          >
                            <div
                              className="block-open"
                              onClick={() =>
                                selection.select(`template-${b.id ?? n}`)
                              }
                            >
                              {b.type === "paragraph" ? (
                                <FieldEditor
                                  map={map}
                                  showNames={false}
                                  value={
                                    b.content ?? {
                                      type: "doc",
                                      content: [
                                        {
                                          type: "paragraph",
                                          content: b.text
                                            ? [{ type: "text", text: b.text }]
                                            : [],
                                        },
                                      ],
                                    }
                                  }
                                  onChange={(value) =>
                                    patch(
                                      content.map((v, j) =>
                                        j === n
                                          ? {
                                              ...b,
                                              content: value,
                                              text: undefined,
                                            }
                                          : v,
                                      ),
                                    )
                                  }
                                  onTextStyle={(level, text) => {
                                    patch(
                                      content.map((v, j) =>
                                        j === n
                                          ? convertTextStyle(b, level, text)
                                          : v,
                                      ),
                                    );
                                    if (!templatePanels.phone)
                                      focusInserted(`template-${b.id}`, true);
                                  }}
                                  onSlash={(anchor) => {
                                    setInsertAnchor(anchor ?? null);
                                    setReplaceEmpty(true);
                                    setInsertAt(n);
                                  }}
                                />
                              ) : b.type === "heading" ? (
                                <HeadingElement
                                  level={b.level ?? 1}
                                  className="document-heading-edit"
                                  data-heading-level={b.level ?? 1}
                                >
                                  <FieldEditor
                                    label={`Heading ${n + 1}`}
                                    textLevel={b.level ?? 1}
                                    map={map}
                                    showNames={false}
                                    onTextStyle={(level) => {
                                      patch(
                                        content.map((v, j) =>
                                          j === n
                                            ? convertTextStyle(b, level)
                                            : v,
                                        ),
                                      );
                                      focusInserted(`template-${b.id}`, true);
                                    }}
                                    value={
                                      b.content ?? {
                                        type: "doc",
                                        content: [
                                          {
                                            type: "paragraph",
                                            content: b.text
                                              ? [{ type: "text", text: b.text }]
                                              : [],
                                          },
                                        ],
                                      }
                                    }
                                    onChange={(value) =>
                                      patch(
                                        content.map((v, j) =>
                                          j === n
                                            ? {
                                                ...b,
                                                content: value,
                                                rich_heading: true,
                                                text: blockText({
                                                  type: "heading",
                                                  content: value,
                                                }).replace(/[\r\n]+/g, " "),
                                              }
                                            : v,
                                        ),
                                      )
                                    }
                                  />
                                </HeadingElement>
                              ) : b.type === "image" ? (
                                <SelectableImage
                                  value={{ ...b, src: b.src ?? "" }}
                                  onChange={(image) =>
                                    patch(
                                      currentContent.current.map((v) =>
                                        v.id === b.id ? { ...v, ...image } : v,
                                      ),
                                    )
                                  }
                                  onDelete={() =>
                                    mode === "blocks" && saved?.type !== "group"
                                      ? void deleteSaved()
                                      : blockFeedback.remove(
                                          b,
                                          () =>
                                            patch(
                                              currentContent.current.filter(
                                                (v) => v.id !== b.id,
                                              ),
                                            ),
                                          () => {
                                            const next = [
                                              ...currentContent.current,
                                            ];
                                            next.splice(
                                              Math.min(n, next.length),
                                              0,
                                              b,
                                            );
                                            patch(next);
                                          },
                                        )
                                  }
                                />
                              ) : b.type === "signature_block" ? (
                                <div
                                  dangerouslySetInnerHTML={{
                                    __html: signatureHtml({
                                      role: b.role ?? "client",
                                      name:
                                        b.role === "company"
                                          ? data.settings?.company_signatory
                                              ?.name ||
                                            data.settings?.owner ||
                                            "Company"
                                          : "Client",
                                      company:
                                        b.role === "company"
                                          ? data.settings?.company_name || ""
                                          : "Client company",
                                      title:
                                        b.role === "company"
                                          ? data.settings?.company_signatory
                                              ?.title
                                          : "",
                                    }),
                                  }}
                                />
                              ) : b.type === "contract" ? (
                                <h2>
                                  <HeadingTokens
                                    text={
                                      b.text || "Statement of Work & Contract"
                                    }
                                    map={map}
                                  />
                                </h2>
                              ) : b.type === "pricing_table" ? (
                                <div
                                  dangerouslySetInnerHTML={{
                                    __html: documentQuote(
                                      templatePreview.quote,
                                      data.settings?.currency ?? "USD",
                                      data.settings?.money?.cents,
                                    ),
                                  }}
                                />
                              ) : ["heading", "paragraph"].includes(b.type) ? (
                                <div
                                  className="template-text-preview"
                                  dangerouslySetInnerHTML={{
                                    __html: templateTextPreview(b, map),
                                  }}
                                />
                              ) : b.type === "variable" ? (
                                <HeadingTokens
                                  text={`{{${b.path ?? ""}}}`}
                                  map={map}
                                />
                              ) : (
                                <strong>{blockName(b)}</strong>
                              )}
                              <small>{blockName(b)}</small>
                            </div>
                            {b.type === "contract" && (
                              <Reorder
                                ids={(b.clauses ?? []).map((c) => c.id)}
                                onMove={(from, to) => {
                                  selection.clear();
                                  const clauses = [...b.clauses!];
                                  const [moved] = clauses.splice(
                                    clauses.findIndex((c) => c.id === from),
                                    1,
                                  );
                                  clauses.splice(
                                    b.clauses!.findIndex((c) => c.id === to),
                                    0,
                                    moved,
                                  );
                                  patch(
                                    content.map((v, j) =>
                                      j === n ? { ...b, clauses } : v,
                                    ),
                                  );
                                  setIndex(null);
                                }}
                              >
                                <div className="contract-clause-list">
                                  {b.clauses?.map((c, k) => (
                                    <Sortable
                                      block
                                      id={c.id}
                                      label={`clause ${k + 1}`}
                                      key={c.id}
                                    >
                                      <BlockFrame
                                        id={`template-clause-${c.id}`}
                                        label={`Template clause ${k + 1}`}
                                        className="studio-clause-frame"
                                        plainText
                                        tools={
                                          <>
                                            <BlockAction
                                              aria-label="Clause settings"
                                              onClick={() => {
                                                setClauseIndex(k);
                                                setIndex(n);
                                              }}
                                            >
                                              Clause settings
                                            </BlockAction>
                                            <BlockAction
                                              aria-label="Move clause up"
                                              disabled={k === 0}
                                              onClick={() => {
                                                const clauses = [...b.clauses!];
                                                [clauses[k - 1], clauses[k]] = [
                                                  clauses[k],
                                                  clauses[k - 1],
                                                ];
                                                patch(
                                                  content.map((v, j) =>
                                                    j === n
                                                      ? { ...b, clauses }
                                                      : v,
                                                  ),
                                                );
                                                setIndex(null);
                                              }}
                                            >
                                              Move clause up
                                            </BlockAction>
                                            <BlockAction
                                              aria-label="Move clause down"
                                              disabled={
                                                k === b.clauses!.length - 1
                                              }
                                              onClick={() => {
                                                const clauses = [...b.clauses!];
                                                [clauses[k + 1], clauses[k]] = [
                                                  clauses[k],
                                                  clauses[k + 1],
                                                ];
                                                patch(
                                                  content.map((v, j) =>
                                                    j === n
                                                      ? { ...b, clauses }
                                                      : v,
                                                  ),
                                                );
                                                setIndex(null);
                                              }}
                                            >
                                              Move clause down
                                            </BlockAction>
                                            {blockFeedback.reuseButton({
                                              id: c.id,
                                              type: "contract",
                                              text: c.heading,
                                              clauses: [c],
                                            })}
                                            <BlockAction
                                              aria-label="Delete clause"
                                              onClick={() =>
                                                blockFeedback.remove(
                                                  { type: "contract" },
                                                  () => {
                                                    patch(
                                                      currentContent.current.map(
                                                        (v) =>
                                                          v === b
                                                            ? {
                                                                ...b,
                                                                clauses:
                                                                  b.clauses!.filter(
                                                                    (v) =>
                                                                      v.id !==
                                                                      c.id,
                                                                  ),
                                                              }
                                                            : v,
                                                      ),
                                                    );
                                                    setIndex(null);
                                                  },
                                                  () => {
                                                    patch(
                                                      currentContent.current.map(
                                                        (v) => {
                                                          if (v.id !== b.id)
                                                            return v;
                                                          const clauses = [
                                                            ...(v.clauses ??
                                                              []),
                                                          ];
                                                          clauses.splice(
                                                            Math.min(
                                                              k,
                                                              clauses.length,
                                                            ),
                                                            0,
                                                            c,
                                                          );
                                                          return {
                                                            ...v,
                                                            clauses,
                                                          };
                                                        },
                                                      ),
                                                    );
                                                  },
                                                )
                                              }
                                            >
                                              Delete clause
                                            </BlockAction>
                                          </>
                                        }
                                      >
                                        <div
                                          className="clause-open"
                                          onClick={() =>
                                            selection.select(
                                              `template-clause-${c.id}`,
                                            )
                                          }
                                        >
                                          <h3>
                                            <HeadingTokens
                                              text={c.heading}
                                              map={map}
                                            />
                                          </h3>
                                          {c.show_when && (
                                            <small>
                                              Shown when ·{" "}
                                              {data.catalog.find(
                                                (i) =>
                                                  i.id ===
                                                  c.show_when?.pricing_item_id,
                                              )?.name ??
                                                "Unavailable item"}{" "}
                                              selected
                                            </small>
                                          )}
                                          <PlainClauseText
                                            label={`Clause ${k + 1} body`}
                                            value={c.body}
                                            map={map}
                                            onChange={(body) =>
                                              patch(
                                                currentContent.current.map(
                                                  (v) =>
                                                    v.id === b.id
                                                      ? {
                                                          ...v,
                                                          clauses:
                                                            v.clauses!.map(
                                                              (clause) =>
                                                                clause.id ===
                                                                c.id
                                                                  ? {
                                                                      ...clause,
                                                                      body,
                                                                    }
                                                                  : clause,
                                                            ),
                                                        }
                                                      : v,
                                                ),
                                              )
                                            }
                                          />
                                        </div>
                                      </BlockFrame>
                                    </Sortable>
                                  ))}
                                </div>
                              </Reorder>
                            )}
                            {mode === "templates" && !draft?.starter_key && (
                              <LinkedBlockNote
                                block={b}
                                content={content}
                                library={data.library}
                                onChange={patch}
                              />
                            )}
                          </BlockFrame>
                        </Sortable>
                      )),
                      undefined,
                    )}
                    {mode === "templates" && (
                      <DocumentPagination pagination={browserPages?.plan} />
                    )}
                  </div>
                </Reorder>
              </div>
            </div>
            {mode === "blocks" && (
              <p className="saved-block-footer">
                Sent proposals that aren't signed yet update on the same link
                when you save them; signed proposals never change.
              </p>
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
      <ToolsPanel
        tab={tab}
        tabs={panelTabs}
        label={mode === "templates" ? "Template tools" : "Block tools"}
        open={
          templatePanels.phone || !templatePanels.canRight
            ? templateToolsOpen
            : templatePanels.right
        }
        mode={templatePanels.phone ? "sheet" : templatePanels.mode}
        onTab={openTab}
        onToggle={toggleTemplateRight}
        totals=""
        phoneDock={false}
        actions={
          templatePanels.phone ? (
            <div className="studio-phone-menu-actions">
              <TemplateHistoryControls inline />
              {mode === "templates" ? (
                <>
                  <Button
                    onClick={() => {
                      setTemplateToolsOpen(false);
                      setTemplateListOpen(true);
                    }}
                  >
                    Sections
                  </Button>
                  {draft?.starter_key ? (
                    <div
                      role="menu"
                      className="starter-actions-menu"
                      onClick={() => setTemplateToolsOpen(false)}
                    >
                      {starterActions.items}
                    </div>
                  ) : (
                    <label className="check">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={draft!.active}
                        onChange={(e) =>
                          editDraft({ ...draft!, active: e.target.checked })
                        }
                      />
                      Available for new proposals
                    </label>
                  )}
                  {draft?.connector_restore_event_id && (
                    <Button
                      disabled={connectorRestore.busy}
                      onClick={() => {
                        setTemplateToolsOpen(false);
                        void connectorRestore.restore(
                          draft.connector_restore_event_id!,
                        );
                      }}
                    >
                      Restore previous version
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      setTemplateToolsOpen(false);
                      setPreviewOpen(true);
                    }}
                  >
                    Preview
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!draft?.active}
                    onClick={async () => {
                      if (await saveTemplate())
                        location.assign(
                          `/proposals?new=1&template=${draft!.id}`,
                        );
                    }}
                  >
                    New proposal from this
                  </Button>
                </>
              ) : (
                <Button onClick={() => void duplicateSaved()}>Duplicate</Button>
              )}
            </div>
          ) : undefined
        }
      >
        {panelBody}
      </ToolsPanel>
      {inspector && (
        <Sheet title="Edit block" onClose={() => setIndex(null)}>
          {inspector}
        </Sheet>
      )}
      {moreAnchor && mode === "templates" && (
        <ToolbarPopover
          trigger={moreAnchor}
          className="studio-template-actions"
          close={() => setMoreAnchor(null)}
        >
          <div role="dialog" aria-label="Template actions">
            {draft?.starter_key ? (
              <div
                role="menu"
                className="starter-actions-menu"
                onClick={() => setMoreAnchor(null)}
              >
                {starterActions.items}
              </div>
            ) : (
              <label className="check">
                <input
                  type="checkbox"
                  role="switch"
                  checked={draft!.active}
                  onChange={(e) =>
                    editDraft({ ...draft!, active: e.target.checked })
                  }
                />
                Available for new proposals
              </label>
            )}
            {draft?.connector_restore_event_id && (
              <Button
                disabled={connectorRestore.busy}
                onClick={() => {
                  setMoreAnchor(null);
                  void connectorRestore.restore(
                    draft.connector_restore_event_id!,
                  );
                }}
              >
                Restore previous version
              </Button>
            )}
          </div>
        </ToolbarPopover>
      )}
      {previewOpen && (
        <PdfPreviewViewer
          load={async () => {
            templatePaper.current?.dispatchEvent(new Event("pagination-flush"));
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            );
            return previewRef.current.ensure();
          }}
          close={() => setPreviewOpen(false)}
        />
      )}
      {insertAt !== null && (
        <BlockMenu
          reusableOnly={mode === "blocks"}
          anchor={insertAnchor}
          hasPricing={content.some((b) => b.type === "pricing_table")}
          saved={data.library}
          signatureRoles={content
            .filter((b) => b.type === "signature_block")
            .map((b) => b.role!)}
          onChoose={insertBlock}
          onClose={() => {
            setInsertAt(null);
            setReplaceEmpty(false);
          }}
        />
      )}
      {fields && (
        <Sheet title="Fields" onClose={() => setFields(false)}>
          <FieldOptions
            map={map}
            onInsert={(path) => {
              setFields(false);
              requestAnimationFrame(() => fieldInsertion?.insert(path));
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
function blockName(b: Block) {
  return {
    heading: `Heading ${b.level ?? 1}`,
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
  saveAction,
  clause,
  setClause,
  onSlash,
}: {
  onSlash?: (anchor?: HTMLElement) => void;
  clause: number;
  setClause: (index: number) => void;
  block: Block;
  onChange: (b: Block) => void;
  data: Data;
  map: Record<string, string>;
  saveAction: ReactNode;
}) {
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
          onSlash={onSlash}
        />
        {saveAction}
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
        <PlainClauseText
          label="Contract title"
          value={b.text ?? ""}
          map={map}
          multiline={false}
          onChange={(text) => onChange({ ...b, text })}
        />
      </Field>
      <Field label="Clause">
        <select
          value={clause}
          onChange={(e) => setClause(Number(e.target.value))}
        >
          {b.clauses?.map((c, n) => (
            <option value={n} key={c.id}>
              {resolvedEditorText(c.heading, map)}
            </option>
          ))}
        </select>
      </Field>
      {c && (
        <>
          <Field label="Clause heading">
            <PlainClauseText
              label="Clause heading"
              value={c.heading}
              map={map}
              multiline={false}
              onChange={(heading) => update({ heading })}
            />
          </Field>
          <Field label="Clause body">
            <PlainClauseText
              label="Clause body"
              value={c.body}
              map={map}
              onChange={(body) => update({ body })}
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
          <DialogActions>
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
          </DialogActions>
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
      {saveAction}
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
      mode?: "test" | "live" | "mock";
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
    missing = imports.filter((p) => !p.files.some((f) => f.kind === "import"));
  const cards = [
    {
      id: "stripe",
      name: "Stripe",
      state: stripeStatus(health),
      line: "Recurring billing, Checkout for new clients and product sync.",
      detail:
        health?.mode === "live"
          ? "Live Stripe billing configured."
          : "Stripe test mode; no live charges.",
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
      name: "Email sending",
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
      id: "assistants",
      name: connected.some((a) => /claude/i.test(a.name))
        ? "Claude"
        : "AI assistants",
      state: connected.length ? "Connected" : "Not connected",
      line: stale
        ? "An assistant has not connected recently. Manage its grant to reconnect."
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
      <p className="studio-description">
        Payments, invoicing, email delivery, AI assistants and imports. Each one
        shows if it's healthy and offers one fix when it isn't.
      </p>
      <div className="studio-connections-v3">
        {[
          { name: "Billing", ids: ["stripe", "qbo"] },
          { name: "Email", ids: ["email"] },
          { name: "AI assistants", ids: ["assistants"] },
          { name: "Imports", ids: ["imports"] },
        ].map((group) => (
          <section className="connection-group" key={group.name}>
            <h2>{group.name}</h2>
            <div className="connection-grid">
              {cards
                .filter((c) => group.ids.includes(c.id))
                .map((c) => (
                  <section
                    className={`connection-card ${c.id !== "assistants" && /needed|attention|Not connected/.test(c.state) ? "needs-attention" : ""}`}
                    key={c.id}
                  >
                    <span className="connection-monogram" aria-hidden="true">
                      {c.id === "stripe"
                        ? "S"
                        : c.id === "qbo"
                          ? "qb"
                          : c.id === "assistants"
                            ? "AI"
                            : c.name[0]}
                    </span>
                    <div>
                      <div className="connection-title">
                        <h3>{c.name}</h3>
                        <span
                          className={`connection-state ${c.id === "assistants" && !connected.length ? "muted" : /^(Connected|Configured|Verified|Imported|Sandbox configured)\b/i.test(c.state) ? "success" : "warning"}`}
                        >
                          ● {c.state}
                        </span>
                      </div>
                      <p>{c.line}</p>
                      <small>{c.detail}</small>
                    </div>
                    <Button onClick={() => setOpen(c.id)}>{c.action}</Button>
                  </section>
                ))}
            </div>
          </section>
        ))}
      </div>
      {open && (
        <Sheet
          title={cards.find((c) => c.id === open)?.name ?? "Connection"}
          onClose={() => setOpen("")}
        >
          {open === "assistants" ? (
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
              <a className="btn" href="/studio/workspace?view=email-sending">
                Open sending domain
              </a>
            </div>
          ) : (
            <div className="stack">
              <p>
                {open === "stripe"
                  ? "Use a Stripe test-mode restricted key in this deployment. Sync only after the test products have been copied."
                  : "QuickBooks sandbox credentials must be added to the deployment by a super admin. Invoices remain in review until then."}
              </p>
              <Button
                onClick={() =>
                  run(
                    () =>
                      post(
                        `/api/catalog-sync/${open === "stripe" ? "stripe" : "qbo"}`,
                      ),
                    "Test products synced",
                  )
                }
              >
                Sync{" "}
                {open === "stripe"
                  ? "Stripe test products"
                  : "QuickBooks sandbox items"}
              </Button>
              <a href="/studio/products">Open products</a>
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
        proposals. With template access, they can create and edit templates and
        saved blocks. New templates stay hidden for review. They cannot send,
        sign, delete, choose the sender, change availability or change billing.
      </Banner>
      <h3>Connect or reconnect an assistant</h3>
      <p>
        Add this remote MCP endpoint in your assistant, choose automatic
        registration, then sign in and approve its access:
      </p>
      <code className="endpoint">{data.app_url}/mcp</code>
      <p>Available access: proposals:read · proposals:draft · templates:edit</p>
      <p>
        Existing connections must reconnect and approve template access before
        using the new tools.
      </p>
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
export { ActivityStudio } from "./studio-activity";

function ProductMappingDetails({
  item,
  qboConnected,
}: {
  item: Item | null | undefined;
  qboConnected: boolean | null;
}) {
  const [current, setCurrent] = useState(item);
  useEffect(() => setCurrent(item), [item]);
  return (
    <section
      className="product-mapping-details"
      ref={(element) => {
        const form = element?.closest("form");
        if (!form) return;
        const update = () => {
          const values = new FormData(form);
          setCurrent({
            ...item,
            interval:
              (values.get("interval") as Item["interval"]) ||
              item?.interval ||
              "one_time",
            stripe_lookup_key:
              String(values.get("stripe_lookup_key") || "") || null,
            qbo_item_ref: String(values.get("qbo_item_ref") || "") || null,
          } as Item);
        };
        form.addEventListener("input", update);
        return () => form.removeEventListener("input", update);
      }}
    >
      <h3>How this product is billed</h3>
      {current ? (
        productMappings(current, qboConnected).map((state, n) => (
          <p key={n}>
            <strong className={state.warning ? "mapping-warning" : ""}>
              {state.label}
            </strong>{" "}
            · {state.detail}
          </p>
        ))
      ) : (
        <p>
          Choose the interval and provider mapping to see what happens after
          signature.
        </p>
      )}
    </section>
  );
}

export function TemplatesStudio(
  props: ComponentProps<typeof TemplatesStudioContent>,
) {
  return (
    <BlockScope>
      <TemplatesStudioContent {...props} />
    </BlockScope>
  );
}

function templateTextPreview(block: Block, map: Record<string, string>) {
  // Drafts can contain fields awaiting client data or incomplete links. Keep
  // those authorable rather than turning the template screen into an error page.
  try {
    return renderBlocks(
      [block],
      [],
      new Proxy(map, {
        get: (values, path: string) => values[path] ?? `{{${path}}}`,
      }),
    );
  } catch {
    return `<p>${escape(blockText(block))}</p>`;
  }
}
