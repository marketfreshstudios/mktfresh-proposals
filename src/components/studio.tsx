"use client";
import { stripeStatus } from "../lib/studio-v3";
import { relativeTime } from "./studio-v3";
import { DialogActions } from "./dialog-actions";
import { insertAuthoringBlocks } from "../lib/block-insertion";
import { useBlockDrop, defaultBlockInsertion } from "./editor/block-drop";
import { withSignatureHeadings } from "../lib/signature-headings";
import { TeamStudio } from "./team-studio";
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
import { SourceParagraph } from "./page-spacers";
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
import { api, post, Button, Banner, Field, Empty, Icon } from "./ui";
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
  const items = data.catalog.filter(
    (i) =>
      visible(i) &&
      `${itemDisplayName(i)} ${i.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
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
  const source = (i: Item) => (i.stripe_lookup_key ? "Stripe" : "Entered");
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
        ● {stripeStatus(data.connections)} ·{" "}
        {synced ? `Synced ${relativeTime(synced)}` : "No recorded sync yet"} ·{" "}
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
        <Field label="Search products">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
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
                className="studio-table-row catalog-row-v3"
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
                  <small>{i.description || i.sku}</small>
                </span>
                <span>
                  {(i.sublines ?? [i]).map((s, n) => (
                    <span className="catalog-price" key={n}>
                      {money(s.amount)}
                      {intervalSuffix(s.interval)}
                    </span>
                  ))}
                </span>
                <span>
                  {i.schedule
                    ? `${i.schedule.after_paid_invoices} payments, then ${money(i.schedule.then.amount)}/mo`
                    : "—"}
                  {i.min_term_months && (
                    <small>{i.min_term_months}-month minimum</small>
                  )}
                </span>
                <span className="studio-tag">{source(i)}</span>
                <Icon name="chevron-right" />
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
                <Icon name="chevron-right" />
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
                <CatalogItem
                  key={item.id}
                  item={item}
                  data={data}
                  run={run}
                  close={() => pick(null)}
                />
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
        ["name", "Synced name"],
        ["display_name", "Display name"],
        ["sku", "SKU"],
        ["description", "Description"],
        ["stripe_lookup_key", "Stripe lookup key"],
        ["qbo_item_ref", "QuickBooks item reference"],
      ].map(([key, label]) => (
        <Field
          key={key}
          label={
            key === "display_name"
              ? "Name on proposals"
              : key === "description"
                ? "Description the client sees"
                : label
          }
        >
          <input
            name={key}
            required={["name", "sku"].includes(key)}
            defaultValue={String(i?.[key as keyof Item] ?? "")}
          />
        </Field>
      ))}
      <ProductMappingDetails
        item={i}
        qboConnected={data.connections?.qbo ?? null}
      />
      <p>Display name is app-only. Stripe sync preserves it.</p>
      {i?.stripe_lookup_key && (
        <p>
          Synced from Stripe. Change the price there and it updates here.{" "}
          <a
            href={`https://dashboard.stripe.com/${data.connections?.mode === "live" ? "" : "test/"}search?query=${encodeURIComponent(i.stripe_lookup_key)}`}
            target="_blank"
            rel="noopener"
          >
            Edit in Stripe ↗
          </a>
        </p>
      )}
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
    [saved, setSaved] = useState<{
      id?: string;
      name: string;
      block: Block;
    } | null>(
      blocksOnly ? (data.library.find((b) => b.id === selected) ?? null) : null,
    ),
    [index, setIndex] = useState<number | null>(null),
    [clauseIndex, setClauseIndex] = useState(0),
    [fields, setFields] = useState(false),
    [blocksTab, setBlocksTab] = useState(false),
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
  const serialise = (value: unknown) =>
    JSON.stringify(value, (key, v) => (key === "pagination" ? undefined : v));
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
    mode === "blocks" ? (saved ? [saved.block] : []) : (draft?.content ?? []);
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
  const editDraft = (next: typeof draft) => {
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
  const templatePanels = useEditorPanels(data.user.actor, templatePaper, true);
  const phoneSection = templatePanels.phone
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
    draft,
    data.catalog,
    mode === "templates",
    data.settings,
  );
  const templateStyles = resolveStyles(data.settings, draft?.style_overrides);
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
    if (templateFlight.current) return templateFlight.current;
    const flight = (async () => {
      setTemplateError("");
      setTemplateBusy(true);
      try {
        while (true) {
          const captured = resourceRef.current;
          if (
            !captured.value ||
            savedModels.current.get(captured.key) === serialise(captured.value)
          )
            return true;
          if (!navigator.onLine)
            throw new Error("Offline — changes kept on this device");
          templatePaper.current?.dispatchEvent(new Event("pagination-flush"));
          const result = await post(captured.path, {
            ...captured.value,
            id: captured.value.id ?? crypto.randomUUID(),
            ...(captured.path === "/api/templates"
              ? { pagination: pagePlan.current }
              : {}),
          });
          savedModels.current.set(captured.key, serialise(captured.value));
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
  const patch = (next: Block[]) => {
    if (mode === "blocks" && saved) editSaved({ ...saved, block: next[0] });
    else if (draft) editDraft({ ...draft, content: next });
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
      {mode === "templates" ? (
        data.templates.length ? (
          data.templates.map((t) => (
            <button
              className={`template-link ${draft?.id === t.id ? "active" : ""}`}
              key={t.id}
              onClick={() => {
                setDraft(structuredClone(t));
                setTemplateListOpen(false);
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
      {mode === "templates" && draft && (
        <>
          <p className="eyebrow">Sections</p>
          <SectionsNav
            currentSectionId={
              index === null
                ? null
                : content
                    .slice(0, index + 1)
                    .filter((b) => b.type === "heading")
                    .at(-1)?.id
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
              if (templateListOpen) {
                setTemplateListOpen(false);
                requestAnimationFrame(() => {
                  if (n >= 0) setIndex(n);
                });
              } else if (n >= 0) setIndex(n);
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
  const templateTools =
    inspector ??
    (draft && (
      <ProposalStyles
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
    ));
  return (
    <div
      {...blockDrop.handlers}
      ref={templatePanels.container}
      className="studio-template-layout"
      data-template-phone-editing={!!phoneSection}
      style={{ gridTemplateColumns: templatePanels.columns }}
    >
      {blockDrop.line}
      <EditorControlConfig
        compact={templatePanels.compact}
        map={map}
        onField={
          templatePanels.phone || templatePanels.right
            ? () => setFields(true)
            : undefined
        }
      />
      <PageBreakController
        content={mode === "templates" ? content : []}
        onChange={patch}
      />
      {blockFeedback.feedback}
      <aside
        className={`studio-template-list ${templatePanels.left ? "" : "sidebar-rail"}`}
      >
        <div className="editor-sidebar-header">
          <button
            className="sidebar-arrow"
            aria-label={
              templatePanels.left
                ? "Collapse Pages sidebar"
                : "Expand Pages sidebar"
            }
            title="Pages sidebar"
            onClick={toggleTemplateLeft}
          >
            <PanelChevron direction={templatePanels.left ? "left" : "right"} />
          </button>
        </div>
        {templatePanels.left ? (
          <div className="editor-sidebar-scroll">{templateSidebar}</div>
        ) : (
          <button
            aria-label="Open Pages"
            title="Pages"
            onClick={toggleTemplateLeft}
          >
            <Icon name="file-lines" />
          </button>
        )}
      </aside>
      <main className="studio-template-main stack">
        <EditorHeader
          className="template-editor-header"
          title={
            mode === "templates"
              ? (draft?.name ?? "Templates & blocks")
              : (saved?.name ?? "Saved blocks")
          }
          backLabel="Studio"
          backHref="/studio"
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
          <TemplateHistoryControls />
          {phoneSection && (
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
          <Button
            onClick={() => {
              setIndex(null);
              setTemplateListOpen(false);
              if (mode === "templates")
                setDraft({
                  id: crypto.randomUUID(),
                  name: "Untitled template",
                  header_footer: defaultTemplateBands(),
                  cover: defaultCover(),
                  active: true,
                  default_quote: [],
                  content: contentAfterCover([
                    { id: crypto.randomUUID(), type: "paragraph", text: "" },
                  ]),
                });
              else
                setSaved({
                  name: "Untitled block",
                  block: {
                    id: crypto.randomUUID(),
                    type: "paragraph",
                    text: "",
                  },
                });
            }}
          >
            + New {mode === "templates" ? "template" : "block"}
          </Button>
        </EditorHeader>
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
            <header className="actions">
              <Field
                label={mode === "templates" ? "Template name" : "Block name"}
              >
                <input
                  value={mode === "templates" ? draft!.name : saved!.name}
                  required
                  onChange={(e) =>
                    mode === "templates"
                      ? editDraft({ ...draft!, name: e.target.value })
                      : editSaved({ ...saved!, name: e.target.value })
                  }
                />
              </Field>
              {mode === "templates" &&
                !content.length &&
                templatePanels.phone && (
                  <Button
                    onClick={(e) => {
                      setInsertAnchor(e.currentTarget);
                      setInsertAt(0);
                    }}
                  >
                    Add first block
                  </Button>
                )}
              <Button data-field-insert onClick={() => setFields(true)}>
                Fields
              </Button>
              <Button
                variant="primary"
                busy={templateBusy}
                onClick={() => void saveTemplate()}
              >
                Save {mode === "templates" ? "template" : "block"}
              </Button>
            </header>
            <p className="muted">
              Edits apply to new proposals only. Existing agreements keep their
              saved copy.
            </p>
            {mode === "templates" && (
              <label className="check">
                <input
                  role="switch"
                  type="checkbox"
                  checked={draft!.active}
                  onChange={(e) =>
                    editDraft({ ...draft!, active: e.target.checked })
                  }
                />
                Active template
              </label>
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
                        {styleFontFaces(
                          resolveStyles(data.settings, draft?.style_overrides),
                        )}
                        {documentStyleCss(
                          resolveStyles(data.settings, draft?.style_overrides),
                          data.settings?.accent_colour,
                        )}
                      </style>
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
                        title="Proposal title"
                        cover={draft?.cover}
                        map={map}
                        onCover={
                          mode === "templates"
                            ? (cover) => editDraft({ ...draft!, cover })
                            : undefined
                        }
                        workspace={data.settings?.company_name}
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
                          id={String(n)}
                          spaceBefore={blockSpaces[b.id ?? String(n)]}
                          label={`block ${n + 1}`}
                          key={b.id ?? n}
                        >
                          <BlockFrame
                            id={`template-${b.id ?? n}`}
                            label={`Template block ${n + 1}`}
                            blockType={b.type}
                            objectAction={
                              b.type === "pricing_table" ? (
                                <button
                                  type="button"
                                  title="Edit quote"
                                  onClick={() =>
                                    document
                                      .getElementById("template-default-quote")
                                      ?.scrollIntoView({ block: "center" })
                                  }
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
                              mode === "templates"
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
                                    setIndex(n);
                                    requestAnimationFrame(() => {
                                      const host =
                                        document.querySelector(
                                          ".studio-inspector",
                                        ) ??
                                        document.querySelector(
                                          "[aria-labelledby].foundation-sheet[open]",
                                        );
                                      const text =
                                        host?.querySelector<HTMLElement>(
                                          ".tiptap",
                                        );
                                      if (text) {
                                        text.focus();
                                        const range = document.createRange();
                                        range.selectNodeContents(text);
                                        range.collapse(false);
                                        getSelection()?.removeAllRanges();
                                        getSelection()?.addRange(range);
                                        document.dispatchEvent(
                                          new Event("selectionchange"),
                                        );
                                      } else {
                                        const input = host?.querySelector<
                                          HTMLInputElement | HTMLTextAreaElement
                                        >("input,textarea");
                                        input?.focus();
                                        input?.setSelectionRange(
                                          input.value.length,
                                          input.value.length,
                                        );
                                      }
                                    });
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
                                {mode === "templates" && (
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
                              role="button"
                              tabIndex={0}
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
                              ) : b.type === "heading" &&
                                !templatePanels.phone ? (
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
                                    blockFeedback.remove(
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
                                  {b.text || "Statement of Work & Contract"}
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
                                        <button
                                          className="clause-open"
                                          onClick={() =>
                                            selection.select(
                                              `template-clause-${c.id}`,
                                            )
                                          }
                                        >
                                          <h3>{c.heading}</h3>
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
                                          <SourceParagraph
                                            text={c.body.replace(
                                              /{{\s*([\w.-]+)\s*}}/g,
                                              (_, key) => map[key] ?? key,
                                            )}
                                          />
                                        </button>
                                      </BlockFrame>
                                    </Sortable>
                                  ))}
                                </div>
                              </Reorder>
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
            {mode === "templates" && (
              <>
                <section className="studio-section" id="template-default-quote">
                  <h2>Default quote</h2>
                  <TemplateWarnings
                    templates={[draft!]}
                    catalog={data.catalog}
                  />
                  <TemplateDefaults
                    template={draft!}
                    data={data}
                    onChange={(default_items) =>
                      editDraft({
                        ...draft!,
                        default_items,
                        default_quote: [],
                      })
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
      <aside
        className={`studio-inspector stack ${templatePanels.right ? "block-owned-dialog" : "sidebar-rail"}`}
      >
        <div className="editor-sidebar-header">
          <button
            className="sidebar-arrow"
            aria-label={
              templatePanels.right
                ? "Collapse tools sidebar"
                : "Expand tools sidebar"
            }
            title="Tools sidebar"
            onClick={toggleTemplateRight}
          >
            <PanelChevron direction={templatePanels.right ? "right" : "left"} />
          </button>
        </div>
        {templatePanels.right ? (
          <div className="editor-sidebar-scroll">
            <div
              className="editor-tabs"
              role="tablist"
              aria-label="Template tools"
            >
              <button
                role="tab"
                aria-selected={blocksTab}
                data-preserve-block-selection
                onClick={() => setBlocksTab(true)}
              >
                Blocks
              </button>
              <button
                role="tab"
                aria-selected={!blocksTab}
                onClick={() => {
                  setBlocksTab(false);
                  setIndex(null);
                }}
              >
                Styles
              </button>
            </div>
            {blocksTab ? templateBlocks : templateTools}
          </div>
        ) : (
          <>
            <button
              aria-label="Open Blocks"
              title="Blocks"
              data-preserve-block-selection
              onClick={() => {
                setBlocksTab(true);
                if (templatePanels.canRight) templatePanels.toggle("right");
                else setTemplateToolsOpen(true);
              }}
            >
              <Icon name="document" />
            </button>
            <button
              aria-label="Open Fields"
              title="Fields"
              onClick={() => setFields(true)}
            >
              <Icon name="code" />
            </button>
            <button
              aria-label="Open Styles"
              title="Styles"
              onClick={() => {
                if (templatePanels.canRight) templatePanels.toggle("right");
                else setTemplateToolsOpen(true);
              }}
            >
              <Icon name="heading" />
            </button>
          </>
        )}
      </aside>
      {templateListOpen && (
        <Sheet title="Pages" onClose={() => setTemplateListOpen(false)}>
          {templateSidebar}
        </Sheet>
      )}
      {!templatePanels.right && (inspector || templateToolsOpen) && (
        <Sheet
          title={
            blocksTab ? "Blocks" : inspector ? "Edit block" : "Template styles"
          }
          onClose={() => {
            setIndex(null);
            setTemplateToolsOpen(false);
          }}
        >
          {blocksTab ? templateBlocks : templateTools}
        </Sheet>
      )}
      {insertAt !== null && (
        <BlockMenu
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
          <DialogActions>
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
          </DialogActions>
        </div>
      ))}
      <Field label="Add product default">
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
      line: "Recurring billing, Checkout for new clients and product sync.",
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
            <article
              className={`activity-row ${e.proposal_id ? "clickable-row" : ""}`}
              key={e.id}
            >
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
                <a
                  className="activity-primary-link"
                  href={`/proposals/${e.proposal_id}`}
                >
                  {e.detail}
                </a>
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
