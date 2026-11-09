"use client";
import { chromeIcons } from "./staff-icons";
import { Select, Switch } from "./form-controls";
import { QuickBooksPicker } from "./quickbooks-fields";
import {
  ConnectionColumns,
  ConnectionDetailLayout,
  ConnectionFact,
  ConnectionPanel,
  ConnectionSteps,
  ConnectionTiles,
} from "./connection-detail";
import { Archive, FileText, Link2, Mail, ShieldCheck } from "lucide-react";
import type { ConnectionStatus } from "../lib/workspace-setup";
import { quoteLayout } from "../lib/proposal-styles";
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
import { stripeTestDashboard } from "../lib/stripe-connect-status";
import { stripeStatus } from "../lib/studio-v3";
import { relativeTime } from "./studio-v3";
import { DialogActions } from "./dialog-actions";
import {
  insertAuthoringBlocks,
  insertColumnBlocks,
} from "../lib/block-insertion";
import { ColumnsEditor } from "./editor/columns-editor";
import { ColumnActionBar } from "./editor/column-action-bar";
import { SelectionStyles } from "./editor/column-styles-panel";
import { columnStyleKey, isColumnStyleKey } from "./editor/style-clipboard";
import {
  documentBlocks,
  moveBlocksAcrossColumns,
  unwrapColumns,
  type BlockDestination,
} from "../lib/columns";
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
  moveDocumentBlocksAt,
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
        <Button
          className={item || custom ? undefined : "studio-primary"}
          onClick={() => setFamily(true)}
        >
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
              href={`${data.connections?.stripe_connect?.dashboardUrl ?? (data.connections?.mode === "live" ? "https://dashboard.stripe.com" : stripeTestDashboard)}/search?query=${encodeURIComponent(i.stripe_lookup_key)}`}
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
            <Select name="interval" defaultValue={i?.interval ?? "one_time"}>
              <option value="one_time">One-time</option>
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </Select>
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
          <div className="studio-product-client-copy">
            <h4>Client sees</h4>
            <p>
              {String(
                i.plan_terms?.client_copy ??
                  "Payoff counts paid invoices, not calendar months.",
              )}
            </p>
          </div>
        </section>
      )}
      {(!i ||
        i.interval === "one_time" ||
        i.sublines?.some((line) => line.interval === "one_time")) && (
        <QuickBooksPicker
          label="QuickBooks item"
          name="qbo_item_ref"
          initial={i?.qbo_item_ref}
          enabled={data.connections?.qbo_connection?.state === "connected"}
          emptyLabel="Use workspace default"
        />
      )}
      <details open={!i}>
        <Disclosure>More product details</Disclosure>
        <div className="stack">
          {[
            ["name", "Synced name"],
            ["sku", "SKU"],
            ["stripe_lookup_key", "Stripe lookup key"],
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
            <Switch name="active" defaultChecked={i?.active ?? true} />
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
                  <Select
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
                  </Select>
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
        <Button
          type="submit"
          variant="primary"
          className="studio-primary"
          busy={save.busy}
        >
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
    tab === "Styles" ? 380 : 400,
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
              documentBlocks([content[n]]).some(
                (block) => `template-${block.id ?? n}` === selection.selected,
              ) ||
              content[n].columns?.items.some(
                (column) => columnStyleKey(column.id) === selection.selected,
              ) ||
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
  const dirtyResources = useRef(new Set<string>());
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
    if (templateDirty) {
      dirtyResources.current.add(currentResource.key);
      try {
        localStorage.setItem(
          templateCache(currentResource.key),
          serialise(currentResource.value),
        );
      } catch {}
    } else if (
      !templateRecovery &&
      currentResource.value &&
      dirtyResources.current.delete(currentResource.key)
    )
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
  const blockDrop = useBlockDrop(
    content,
    templatePaper,
    (blocks, { at, inside }) => {
      if (!inside) return insertBlock(blocks[0], blocks.slice(1), at);
      try {
        const next = insertColumnBlocks(
          currentContent.current,
          blocks,
          inside,
          at,
        );
        patch(next.content);
        if (next.first?.id) focusInserted(`template-${next.first.id}`, false);
      } catch (error) {
        blockFeedback.error((error as Error).message);
      }
    },
  );
  function moveAt(from: string, target: BlockDestination, selected: string[]) {
    const current = currentContent.current;
    const ids = selected.includes(from) ? selected : [from];
    if (
      !target.inside &&
      ids.every((id) => current.some((block) => block.id === id))
    )
      return move((content) =>
        moveDocumentBlocksAt(content, from, target.at, selected),
      );
    try {
      const next = moveBlocksAcrossColumns(current, ids, target);
      if (JSON.stringify(next) !== JSON.stringify(current)) {
        patch(next);
        selection.clear();
        setIndex(null);
      }
    } catch (error) {
      blockFeedback.error((error as Error).message);
    }
  }
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
  const styleDocument = {
    content,
    prefix: "template-",
    onChange: patch,
    onOpenStyles: () => openTab("Styles"),
  };
  const unwrapGroup = (id: string) => {
    patch(unwrapColumns(currentContent.current, id));
    selection.clear();
  };
  const deleteGroup = (block: Block, index: number) =>
    blockFeedback.remove(
      block,
      () => {
        patch(currentContent.current.filter((item) => item.id !== block.id));
        selection.clear();
      },
      () => {
        const next = [...currentContent.current];
        next.splice(Math.min(index, next.length), 0, block);
        patch(next);
      },
    );
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
            <Select
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
            </Select>
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
      <SelectionStyles
        document={styleDocument}
        settings={data.settings}
        styles={templateStyles}
        phone={templatePanels.phone}
        template
      >
        {templateTools}
      </SelectionStyles>
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
          ...styleDocument,
          source: mode === "templates" ? "template" : "library",
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
      <section
        className="studio-template-main stack"
        aria-label={
          mode === "templates" ? "Template document" : "Saved block document"
        }
      >
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
              className="studio-editor-more round-icon"
              aria-label="More editor actions"
              aria-haspopup="dialog"
              onClick={(e) => {
                if (templatePanels.phone) {
                  setTemplateToolsOpen(true);
                } else setMoreAnchor(e.currentTarget);
              }}
            >
              <chromeIcons.more size={18} aria-hidden="true" />
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
                className={`studio-desktop-action ${starterAttempt ? "" : "studio-primary"}`}
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
                className="studio-primary"
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
            <Button
              variant="primary"
              className="studio-primary"
              onClick={starterActions.copy}
            >
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
                  documentDrop={
                    mode === "templates"
                      ? {
                          paper: templatePaper,
                          content,
                          onMoveAt: moveAt,
                        }
                      : undefined
                  }
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
                          content,
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
                          customSpacing={
                            b.style?.margin_above !== undefined ||
                            content[n - 1]?.style?.margin_below !== undefined
                          }
                          label={`block ${n + 1}`}
                          key={b.id ?? n}
                        >
                          <BlockFrame
                            id={`template-${b.id ?? n}`}
                            label={`Template block ${n + 1}`}
                            blockType={b.type}
                            selectionBar={
                              b.columns
                                ? (owner) =>
                                    selection.selected ===
                                      `template-${b.id}` && (
                                      <ColumnActionBar
                                        owner={owner}
                                        itemKey={`template-${b.id}`}
                                        label={`Columns · ${b.columns!.items.length}`}
                                        onStyle={() =>
                                          selection.selectStyle(
                                            `template-${b.id}`,
                                          )
                                        }
                                        onUnwrap={() => unwrapGroup(b.id!)}
                                        onDelete={() => deleteGroup(b, n)}
                                        tools={
                                          <>
                                            {([-1, 1] as const).map(
                                              (direction) => (
                                                <BlockAction
                                                  key={direction}
                                                  menuLabel
                                                  disabled={
                                                    !canMoveAdjacentBlock(
                                                      content,
                                                      b.id!,
                                                      direction,
                                                    )
                                                  }
                                                  onClick={() =>
                                                    move((blocks) =>
                                                      moveAdjacentBlock(
                                                        blocks,
                                                        b.id!,
                                                        direction,
                                                      ),
                                                    )
                                                  }
                                                >
                                                  {direction === -1
                                                    ? "Move up"
                                                    : "Move down"}
                                                </BlockAction>
                                              ),
                                            )}
                                            <BlockAction
                                              menuLabel
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
                                            {blockFeedback.reuseButton(b)}
                                          </>
                                        }
                                      />
                                    )
                                : undefined
                            }
                            appearance={{
                              value: b.style,
                              settings: data.settings,
                              styles: templateStyles,
                              block: b,
                              onChange: (style) =>
                                patch(
                                  currentContent.current.map((v) =>
                                    v.id === b.id ? { ...v, style } : v,
                                  ),
                                ),
                            }}
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
                                {b.type === "columns" && (
                                  <BlockAction
                                    menuLabel
                                    onClick={() => {
                                      patch(
                                        unwrapColumns(
                                          currentContent.current,
                                          b.id!,
                                        ),
                                      );
                                      selection.clear();
                                    }}
                                  >
                                    Unwrap columns
                                  </BlockAction>
                                )}
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
                              onClick={
                                b.columns
                                  ? undefined
                                  : () =>
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
                                  onTextStyle={(level, text, afterFocus) => {
                                    patch(
                                      content.map((v, j) =>
                                        j === n
                                          ? convertTextStyle(b, level, text)
                                          : v,
                                      ),
                                    );
                                    if (!templatePanels.phone || afterFocus)
                                      focusInserted(
                                        `template-${b.id}`,
                                        true,
                                        afterFocus,
                                      );
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
                                    onTextStyle={(level, _text, afterFocus) => {
                                      patch(
                                        content.map((v, j) =>
                                          j === n
                                            ? convertTextStyle(b, level)
                                            : v,
                                        ),
                                      );
                                      focusInserted(
                                        `template-${b.id}`,
                                        true,
                                        afterFocus,
                                      );
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
                              ) : b.type === "columns" && b.columns ? (
                                <ColumnsEditor
                                  block={b}
                                  map={map}
                                  styles={templateStyles}
                                  settings={data.settings}
                                  prefix="template-"
                                  saved={data.library}
                                  onChange={(next) =>
                                    patch(
                                      currentContent.current.map((v) =>
                                        v.id === b.id ? next : v,
                                      ),
                                    )
                                  }
                                  onUnwrap={() => unwrapGroup(b.id!)}
                                  onDelete={() => deleteGroup(b, n)}
                                  excess={
                                    browserPages?.overflowColumns?.find(
                                      (item) => item.block === b.id,
                                    )?.excess
                                  }
                                  reuse={blockFeedback.reuse}
                                  renderLink={
                                    mode === "templates" && !draft?.starter_key
                                      ? (child) => (
                                          <LinkedBlockNote
                                            block={child}
                                            content={content}
                                            library={data.library}
                                            onChange={patch}
                                          />
                                        )
                                      : undefined
                                  }
                                />
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
                                      quoteLayout(templateStyles),
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
      </section>
      <ToolsPanel
        tab={tab}
        tabs={panelTabs}
        sheetTitle={
          tab === "Styles" &&
          selection.selected &&
          isColumnStyleKey(selection.selected)
            ? "Column style"
            : undefined
        }
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
                      <Switch
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
                <Switch
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
    columns: "Columns",
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
        <Select
          value={clause}
          onChange={(e) => setClause(Number(e.target.value))}
        >
          {b.clauses?.map((c, n) => (
            <option value={n} key={c.id}>
              {resolvedEditorText(c.heading, map)}
            </option>
          ))}
        </Select>
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
              <Select
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
              </Select>
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
        Add clause
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
  const health = data.connections;
  const qbo = health?.qbo_connection;
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
      state:
        health?.stripe_connect?.state === "setting_up"
          ? "Setting up · test mode"
          : health?.stripe_connect?.state === "disconnecting"
            ? "Disconnecting"
            : stripeStatus(health),
      line: "Recurring billing, Checkout for new clients and product sync.",
      detail:
        health?.mode === "live"
          ? "Live Stripe billing configured."
          : "Stripe test mode; no live charges.",
      action:
        health?.stripe_platform === false
          ? health.stripe
            ? "Manage"
            : "Connect"
          : "Settings",
    },
    {
      id: "qbo",
      name: "QuickBooks",
      state:
        qbo?.state === "reconnect"
          ? "Reconnect needed"
          : qbo?.state === "connected"
            ? `Connected to ${qbo.company ?? "QuickBooks"} · sandbox`
            : health?.qbo
              ? "Sandbox configured"
              : "Setup needed",
      line: "One-time invoices stay in review until a sandbox connection is ready.",
      detail: `${data.proposals.filter((p) => p.billing_links.some((l) => l.provider === "qbo" && l.status !== "succeeded")).length} proposals with invoices to review`,
      action:
        qbo?.state === "reconnect"
          ? "Reconnect QuickBooks"
          : qbo?.state === "connected"
            ? "Manage QuickBooks"
            : "Connect QuickBooks",
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
  if (initial === "assistants")
    return (
      <ConnectionDetailLayout
        name="AI assistants"
        mark="AI"
        status={connected.length ? "Connected" : "Not connected"}
        tone={connected.length ? "success" : undefined}
        subtitle="Read reference data and draft proposals. A person always reviews and sends."
      >
        <ConnectionTiles
          tiles={[
            {
              label: "Connection",
              value: connected.length ? "Connected" : "Not connected",
              detail: "Connect through your assistant.",
            },
            {
              label: "Assistants",
              value: connected.length,
              detail:
                connected.map((a) => a.name).join(", ") || "No active grants",
            },
            {
              label: "Permissions",
              value: "Draft and edit",
              detail: "Staff review and send proposals.",
            },
          ]}
        />
        <ConnectionColumns
          main={
            <ConnectionPanel title="Connect or reconnect an assistant">
              <div className="connection-panel-body">
                <p>
                  Add this endpoint in your assistant, choose automatic
                  registration, then sign in and approve access.
                </p>
              </div>
              <dl>
                <ConnectionFact label="Remote MCP endpoint">
                  <code className="endpoint">{data.app_url}/mcp</code>
                </ConnectionFact>
                <ConnectionFact label="Access">
                  Read proposals, draft proposals, and edit templates and saved
                  blocks.
                </ConnectionFact>
              </dl>
              <footer>
                New templates stay hidden for review. Existing connections must
                reconnect to approve template access.
              </footer>
            </ConnectionPanel>
          }
          aside={<AssistantConnections data={data} run={run} />}
        />
      </ConnectionDetailLayout>
    );
  if (initial === "imports")
    return (
      <ConnectionDetailLayout
        name="Import from Proposify"
        mark="P"
        status={
          missing.length
            ? "PDFs need attention"
            : imports.length
              ? "Imported"
              : "Not imported"
        }
        tone={
          missing.length ? "warning" : imports.length ? "success" : undefined
        }
        subtitle="Past proposals are kept as read-only PDFs linked to their clients."
        actions={
          <a className="btn" href="/proposals?view=imported">
            View imported proposals
          </a>
        }
      >
        <ConnectionTiles
          tiles={[
            {
              label: "Import",
              value: imports.length ? "Imported" : "Ready to import",
              detail: "From a Proposify CSV export",
            },
            {
              label: "Proposals",
              value: imports.length,
              detail: "Kept as read-only records",
            },
            {
              label: "PDFs",
              value: missing.length
                ? `${missing.length} missing`
                : imports.length
                  ? "All attached"
                  : "No imported PDFs",
              tone: missing.length ? "warning" : undefined,
              action: missing.length ? (
                <a href="#connection-import-pdfs">See proposals</a>
              ) : undefined,
            },
          ]}
        />
        <ConnectionColumns
          main={
            <ConnectionPanel
              title="What imports do in Yeswell"
              className="studio-import-summary"
            >
              <ConnectionSteps
                steps={[
                  {
                    title: "Import records",
                    detail:
                      "Bring past proposals and clients into Yeswell from a Proposify CSV export.",
                    icon: Archive,
                  },
                  {
                    title: "Attach PDFs",
                    detail:
                      "Match each PDF by its original proposal ID using the import guide.",
                    icon: FileText,
                  },
                ]}
              />
            </ConnectionPanel>
          }
          aside={
            <ConnectionPanel
              id="connection-import-pdfs"
              title={
                missing.length ? "Proposals missing PDFs" : "Import records"
              }
            >
              {missing.length ? (
                <ul className="connection-activity" role="list">
                  {missing.map((p) => (
                    <li key={p.id}>
                      <a href={`/proposals/${p.id}`}>
                        {p.client.company} · {p.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="connection-panel-body muted">
                  {imports.length
                    ? "All imported proposals have a PDF."
                    : "No proposals have been imported yet."}
                </p>
              )}
            </ConnectionPanel>
          }
        />
      </ConnectionDetailLayout>
    );
  if (initial === "email") {
    const domain = data.settings?.sending_domain;
    const emailReady = health?.email && !!domain;
    const emailSettings = "/studio/workspace?view=email-sending";
    return (
      <ConnectionDetailLayout
        name="Email sending"
        mark="E"
        subtitle="Proposals send from the selected staff member. Replies follow your workspace rules."
        status={emailReady ? "Configured" : "Setup needed"}
        tone={emailReady ? "success" : "warning"}
        actions={
          <a className="btn" href={emailSettings}>
            Open sending domain
          </a>
        }
      >
        <ConnectionTiles
          tiles={[
            {
              label: "Connection",
              value: health?.email ? "Configured" : "Setup needed",
              tone: health?.email ? "success" : "warning",
            },
            {
              label: "Sending domain",
              value: domain || "Not set",
              detail: "Verify SPF and DKIM with your email provider.",
            },
            {
              label: "Email templates",
              value: "Workspace defaults",
              action: <a href="/studio/emails">View templates</a>,
            },
          ]}
        />
        <ConnectionColumns
          main={
            <ConnectionPanel title="How Yeswell sends email">
              <ConnectionSteps
                steps={[
                  {
                    title: "Send proposals",
                    detail: "The selected staff member appears as the sender.",
                    icon: Mail,
                  },
                  {
                    title: "Set up the domain",
                    detail:
                      "Verify the sending domain with your email provider.",
                    icon: ShieldCheck,
                  },
                  {
                    title: "Keep replies with your team",
                    detail: "Replies follow the workspace’s email settings.",
                    icon: Link2,
                  },
                ]}
              />
            </ConnectionPanel>
          }
          aside={
            <ConnectionPanel title="Connection">
              <dl>
                <ConnectionFact label="Provider">
                  {health?.email ? "Configured" : "Not configured"}
                </ConnectionFact>
                {domain && (
                  <ConnectionFact label="Sending domain">
                    {domain}
                  </ConnectionFact>
                )}
              </dl>
              <footer>
                <a href={emailSettings}>Edit in Email sending</a>
              </footer>
            </ConnectionPanel>
          }
        />
      </ConnectionDetailLayout>
    );
  }
  return (
    <div className="stack">
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
          <section
            className="connection-group"
            key={group.name}
            data-connection-group={group.ids[0]}
          >
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
                          {c.state}
                        </span>
                      </div>
                      <p>{c.line}</p>
                      <small>{c.detail}</small>
                    </div>
                    <a
                      className="btn"
                      href={
                        c.id === "qbo"
                          ? "/studio/connections/quickbooks"
                          : c.id === "stripe"
                            ? "/studio/connections/stripe"
                            : `/studio/connections?view=${c.id}`
                      }
                    >
                      {c.action}
                    </a>
                  </section>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
function AssistantConnections({ data, run }: { data: Data; run: Runner }) {
  return (
    <ConnectionPanel title="Connected assistants">
      {data.assistants.length ? (
        <ul className="connection-activity" role="list">
          {data.assistants.map((a) => (
            <li key={a.id}>
              <span>
                <strong>{a.name}</strong>
                <small>
                  {a.revoked
                    ? "Access revoked"
                    : a.last_used
                      ? `Last connected ${new Date(a.last_used).toLocaleString()}`
                      : "Has not connected yet"}
                </small>
              </span>
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
            </li>
          ))}
        </ul>
      ) : (
        <p className="connection-panel-body muted">
          New connections appear after authorization.
        </p>
      )}
    </ConnectionPanel>
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
