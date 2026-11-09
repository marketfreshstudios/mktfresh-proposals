"use client";
import { withCount } from "../lib/count-label";
import { Select, Switch } from "./form-controls";
import { useReloadGuard } from "./reload-safety";
import { resolvedEditorText } from "../lib/editor-fields";
import { businessStateError, businessStateUrl } from "../lib/business-state";
import { finalOiotClause } from "../lib/oiot";
import { QuoteItemsPanel } from "./quote-items-panel";
import { CopyContactButton } from "./contact-value";
import { EditClientModal } from "./edit-client-modal";
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
  columnsOverflowMessage,
  moveBlocksAcrossColumns,
  unwrapColumns,
  type BlockDestination,
} from "../lib/columns";
import { useBlockDrop, defaultBlockInsertion } from "./editor/block-drop";
import { withSignatureHeadings } from "../lib/signature-headings";
import { ReassignDialog } from "./reassign-proposal";
import { ReplaceSavedBlockDialog } from "./replace-saved-block";
import { canReassign } from "../lib/proposal-owner";
import { pageGeometry } from "../lib/page-bands";
import { Disclosure } from "./ui";
import { DisclosureChevron } from "./disclosure-chevron";
import { SelectableImage } from "./editor/selectable-image";
import { isStaffSignedOut, StaffSignIn } from "./staff-sign-in";
import { useBandEditing } from "./editor/band-editing";
import { bandPages, resolvedBandPages } from "../lib/band-overrides";
import { resetBandSettings } from "./editor/reset-band-settings";
import { defaultHeaderFooter } from "../lib/page-bands";
import { pairSignatureNodes } from "./signature-pair";
import { signatureHtml } from "../lib/signature-presentation";
import { QuoteTable } from "./quote-table";
import { DocumentTotals } from "./document-totals";
import { EditorHeader, PanelChevron, useCurrentState } from "./editor-header";
import { ToolsPanel, PanelTabs, type EditorTab } from "./editor/tools-panel";
import { SectionsPanel } from "./editor/sections-panel";
import { ReadOnlyRegion } from "./editor/read-only-region";
import { EditorNotice } from "./editor/editor-notice";
import { EditorButton } from "./editor/editor-button";
import { PlainClauseText } from "./editor/plain-clause-text";
import { HeadingTokens } from "./editor/heading-tokens";
import { printView } from "../lib/print-view";
import { PageBreakController } from "./page-break-action";
import { quoteTotalValues } from "../lib/document-quote";
import { documentSpacing } from "../lib/document-spacing";
import {
  applyDocumentMove,
  canMoveAdjacentBlock,
  moveAdjacentBlock,
  moveDocumentBlock,
  moveDocumentBlocksAt,
} from "../lib/editor-moves";
import { paginateBrowser } from "./browser-pagination";
import { type BrowserPages, PagedPaper } from "./paged-paper";
import { SourceParagraph } from "./page-spacers";
import { usePdfPreview } from "./use-pdf-preview";
import { PdfPreviewViewer } from "./pdf-preview-viewer";
import { useEditorPanels } from "./use-editor-panels";
import { ProposalStyles } from "./proposal-styles";
import {
  resolveStyles,
  quoteLayout,
  documentStyleCss,
  styleFontFaces,
} from "../lib/proposal-styles";
import {
  blockText,
  convertTextStyle,
  type TextLevel,
} from "../lib/editor-document";
import {
  BlockScope,
  EditorControlConfig,
  useBlockFeedback,
  ToastSurface,
  useBlockToolbar,
  BlockFrame,
  BlockAction,
  useBlockSelection,
} from "./block-controls";
import { QuoteItemBody } from "./quote-item-body";
import { DocumentCover } from "./document-cover";
import { BlockMenu } from "./block-menu";
import { useSessionHistory } from "./editor-history";
import { duplicateBlock } from "../lib/editor-document";
import { DocumentPagination } from "./document-pagination";
import type { ComponentProps, CSSProperties } from "react";
import {
  emailDefaults,
  plainBody,
  emailValues,
  resolveEmailText,
  validateTemplate,
} from "../lib/email-template-content";
import type { EmailTemplate } from "../lib/email-template-content";
import { fontCss } from "../lib/proposal-fonts";
import { ValidityField } from "./validity-field";
import { readableDate } from "../lib/validity";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { Reorder, Sortable } from "./sortable";
export { Reorder, Sortable } from "./sortable";
import { SectionsNav } from "./editor/sections-nav";
import { pageMetrics } from "../lib/proposal-styles";
import type { Block, Item, Proposal, QuoteItem, Actor } from "../lib/model";
import type { WorkspaceSettings } from "../lib/workspace";
import type { ReferenceDocument } from "../lib/documents";
import { orderedItems, catalogQuoteItem, draftItems } from "../lib/quote-model";
import { contentSections, pendingSections } from "../lib/ai-review";
import { variables, intervalLabel, totals } from "../lib/presentation";
import { readiness } from "../lib/quote";
import { withDraftSettings } from "../lib/proposal-settings";
import { sellableCatalogue, itemDisplayName } from "../lib/catalogue-display";
import { FieldEditor } from "./field-editor";
import { FieldOptions, SubjectField, FieldTextArea } from "./field-options";
import { api, post, ApiError, Button, Field, Banner, Totals, Icon } from "./ui";
import { useMoney } from "./money-context";
const uid = () => crypto.randomUUID();
function editorQuote(p: Proposal) {
  return p.signers.length
    ? p.quote.map((i) => ({
        ...i,
        default_selected: i.selected ?? i.default_selected,
      }))
    : draftItems(p.quote);
}
function Sheet({
  title,
  close,
  children,
  extra = "",
  onCloseComplete,
}: {
  title: string;
  close: () => void;
  children: ReactNode | ((dismiss: () => void) => ReactNode);
  extra?: string;
  onCloseComplete?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const dismiss = () => ref.current?.close();
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`editor-sheet ${["Add a block", "Clause settings", "Image settings", "Signature settings"].includes(title) ? "block-owned-dialog" : ""} ${extra}`}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onClose={(e) => {
        // Strict Mode can close/reopen the same node before its queued event.
        if (e.currentTarget.open) return;
        // Native close has removed inertness and restored its previous focus.
        close();
        onCloseComplete?.();
      }}
    >
      <header>
        <h2>{title}</h2>
        <Button onClick={dismiss}>Done</Button>
      </header>
      <div className="sheet-body">
        {typeof children === "function" ? children(dismiss) : children}
      </div>
    </dialog>
  );
}
function QuoteEditorContent({
  initial,
  appUrl,
  settings,
  connections,
  catalog,
  families,
  library,
  onSaved,
  staff = [],
  user,
  documents = [],
  initialTab = "Quote",
}: {
  initialTab?: string;
  initial: Proposal;
  appUrl: string;
  settings?: WorkspaceSettings | null;
  connections?: import("../lib/workspace-setup").ConnectionStatus | null;
  catalog: Item[];
  families: { id: string; name: string; active: boolean }[];
  library: { id: string; name: string; block: Block }[];
  onSaved: (p: Proposal) => void;
  staff?: { user_id: string; display_name: string; email: string }[];
  user?: Actor;
  documents?: ReferenceDocument[];
}) {
  const blockFeedback = useBlockFeedback();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [replaceBlockOpen, setReplaceBlockOpen] = useState(false);
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  useEffect(() => {
    if (linkCopied) {
      const timer = setTimeout(() => setLinkCopied(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [linkCopied]);
  const fields = useBlockToolbar();
  const pendingField = useRef<string | null>(null);
  const pendingOutline = useRef<string | null>(null);
  const pendingReview = useRef(false);
  const [pdfOpen, setPdfOpen] = useState(false),
    [phoneOutlineOpen, setOutlineOpen] = useState(false);
  const [insertAnchor, setInsertAnchor] = useState<HTMLElement | null>(null);
  const [blockSettings, setBlockSettings] = useState<string | null>(null);
  const selection = useBlockSelection();
  const money = useMoney(),
    [p, setP] = useState<Proposal>({
      ...initial,
      content: initial.content,
      quote: editorQuote(initial),
    }),
    [customerErrors, setCustomerErrors] = useState<string[]>([]),
    [dirty, setDirty, dirtyRef] = useCurrentState(false),
    [saving, setSaving] = useState(false),
    [error, setError, errorRef] = useCurrentState(""),
    [stale, setStale, staleRef] = useCurrentState(false),
    [tab, setTab] = useState(
      initialTab === "Review & send" ? "Send" : initialTab,
    ),
    [phoneDrawer, setDrawer] = useState(false),
    [expandedItem, setExpandedItem] = useState<string | null>(null),
    [itemDetails, setItemDetails] = useState<string | null>(null),
    [reference, setReference] = useState(false),
    [search, setSearch] = useState(""),
    [documentId, setDocumentId] = useState(documents[0]?.id ?? ""),
    [section, setSection] = useState<number | null>(null),
    [fullDocument, setFullDocument] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [sender, setSender] = useState(
      user?.actor.slice(6) ?? staff[0]?.user_id ?? "",
    ),
    [note, setNote] = useState<import("../lib/model").RichText>(plainBody("")),
    [delivery, setDelivery] = useState<"email" | "manual">("email"),
    [emailSubject, setEmailSubject] = useState(""),
    [emailError, setEmailError] = useState(""),
    [emailLoaded, setEmailLoaded] = useState(false),
    [emailRetry, setEmailRetry] = useState(0),
    [protectedLink, setProtected] = useState(!!initial.password_hash),
    [password, setPassword] = useState(""),
    [sending, setSending] = useState(false),
    [reviewBusy, setReviewBusy] = useState(false),
    [insertAt, setInsertAt] = useState<number | null>(null),
    [replaceEmpty, setReplaceEmpty] = useState(false),
    [clauseEdit, setClauseEdit] = useState<{
      block: number;
      clause: number;
    } | null>(null);
  const bandEditing = useBandEditing();
  const locked = !!p.signers.length || p.versions.some((v) => v.frozen);
  const bands = locked
    ? p.versions.at(-1)?.header_footer
    : (p.header_footer ?? defaultHeaderFooter());
  const closed = ["declined", "expired"].includes(p.status);
  const live = !!p.token && p.versions.length > 0 && !closed && !locked;
  const paper = useRef<HTMLElement>(null),
    reviewCursor = useRef(-1);
  const [browserPages, setBrowserPages] = useState<BrowserPages | null>(null);
  const pagePlan = useRef(initial.pagination);
  const pdfPreview = usePdfPreview({
    ...p,
    pagination: browserPages?.plan ?? p.pagination,
  });
  const receivePagination = (value: BrowserPages) => {
    if (staleRef.current) return;
    pagePlan.current = value.plan;
    setBrowserPages((old) =>
      JSON.stringify(old) === JSON.stringify(value) ? old : value,
    );
  };
  const panels = useEditorPanels(
    user?.actor ?? "local",
    paper,
    true,
    true,
    tab === "Styles" ? 380 : 400,
  );
  const drawer =
    phoneDrawer || (!panels.phone && panels.mode === "drawer" && panels.right);
  const outlineOpen =
    phoneOutlineOpen ||
    (!panels.phone && panels.mode === "drawer" && panels.left);
  useEffect(() => {
    if (tab !== "Send") return;
    const timer = setTimeout(
      () => void pdfPreview.ensure().catch(() => {}),
      400,
    );
    return () => clearTimeout(timer);
  }, [tab, pdfPreview.visualKey]);
  const openTools = (nextTab: string) => {
    setTab(nextTab);
    if (!panels.phone) {
      if (!panels.right) panels.toggle("right");
    } else setDrawer(true);
  };
  useEffect(() => {
    // A direct send route is an action, so it must override a saved collapse.
    // Wait for preference hydration and measurement before choosing dock/drawer.
    if (panels.ready && initialTab === "Review & send") openTools("Send");
  }, [initialTab, panels.ready]);
  useEffect(() => {
    if (panels.right) setDrawer(false);
  }, [panels.right]);
  useEffect(() => {
    if (panels.left) setOutlineOpen(false);
  }, [panels.left]);
  const toggleLeft = () => {
    if (!panels.phone) panels.toggle("left");
    else setOutlineOpen((v) => !v);
  };
  const toggleRight = () => {
    if (!panels.phone) panels.toggle("right");
    else setDrawer((v) => !v);
  };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        !event.repeat &&
        (event.metaKey || event.ctrlKey) &&
        (event.key === "\\" || event.code === "Backslash")
      ) {
        event.preventDefault();
        if (event.shiftKey) toggleLeft();
        else toggleRight();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [panels.canRight, panels.canLeft, panels.phone]);
  useEffect(() => {
    if (!stale && !locked) return;
    selection.clear();
    const guard = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        ["z", "y"].includes(event.key.toLowerCase())
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", guard, true);
    return () => window.removeEventListener("keydown", guard, true);
  }, [stale, locked]);
  function review(sectionIds: string[], reviewed: boolean): Promise<boolean> {
    if (sendFlight.current) return Promise.resolve(false);
    if (reviewFlight.current) return reviewFlight.current;
    const flight = (async () => {
      setReviewBusy(true);
      try {
        // Review is a revision-changing write too. Drain the actual save promise,
        // then keep other saves/Send behind this acknowledgment (not a timer).
        if (!(await saveContent())) return false;
        const captured = generation.current;
        const result = await post<Proposal>(`/api/proposals/${p.id}/review`, {
          revision: revision.current,
          section_ids: sectionIds,
          reviewed,
        });
        revision.current = result.revision;
        latest.current =
          captured === generation.current
            ? { ...result, quote: editorQuote(result) }
            : {
                ...latest.current,
                revision: result.revision,
                events: result.events,
                ai_unreviewed: result.ai_unreviewed,
                content: latest.current.content.map((b) => {
                  const returned = result.content.find((v) => v.id === b.id);
                  return returned?.ai_review
                    ? { ...b, ai_review: returned.ai_review }
                    : b;
                }),
              };
        setP(latest.current);
        setLastSaved(result.updated_at ?? null);
        onSaved(result);
        setError("");
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setStale(true);
        setError((e as Error).message);
        return false;
      } finally {
        setReviewBusy(false);
      }
    })();
    reviewFlight.current = flight;
    void flight.finally(() => {
      if (reviewFlight.current === flight) reviewFlight.current = null;
    });
    return flight;
  }
  function showReview() {
    if (drawer) {
      pendingReview.current = true;
      document.querySelector<HTMLDialogElement>("dialog.tools-sheet")?.close();
      return;
    }
    revealReview();
  }
  function revealReview() {
    const pending = contentSections(latest.current.content).filter(
      (s) => s.pending,
    );
    if (!pending.length) return;
    reviewCursor.current = (reviewCursor.current + 1) % pending.length;
    const target = pending[reviewCursor.current],
      n = contentSections(latest.current.content).findIndex(
        (s) => s.id === target.id,
      );
    setSection(n);
    requestAnimationFrame(() => {
      const el = document.getElementById(`draft-section-${n}`);
      el?.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
      const frame = el?.querySelector<HTMLElement>(
        ".block-frame[data-ai=true]",
      );
      if (frame) {
        selection.select(frame.dataset.blockId!);
        frame.focus({ preventScroll: true });
      }
    });
  }
  const reviewCount = pendingSections(p).length;
  const subjectEdited = useRef(false),
    subjectTemplate = useRef("");
  useEffect(() => {
    if (tab !== "Send" || emailLoaded) return;
    let live = true;
    void api<EmailTemplate[]>("/api/email-templates")
      .then((ts) => {
        if (!live) return;
        const t = ts.find((t) => t.key === "proposal_sent") ?? emailDefaults[0];
        subjectTemplate.current = t.subject;
        setEmailSubject(
          resolveEmailText(t.subject, {
            ...emailValues(p),
            "sender.name":
              staff.find((m) => m.user_id === sender)?.display_name ??
              user?.staff_name ??
              "",
          }),
        );
        setNote(t.body);
        setEmailLoaded(true);
        setEmailError("");
      })
      .catch((e) => {
        if (live)
          setEmailError("Email template could not be loaded: " + e.message);
      });
    return () => {
      live = false;
    };
  }, [tab, emailLoaded, emailRetry]);
  useEffect(() => {
    if (emailLoaded && !subjectEdited.current)
      setEmailSubject(
        resolveEmailText(subjectTemplate.current, {
          ...emailValues(p),
          "sender.name":
            staff.find((m) => m.user_id === sender)?.display_name ??
            user?.staff_name ??
            "",
        }),
      );
  }, [sender, emailLoaded]);
  let emailValidation = "";
  if (emailLoaded)
    try {
      validateTemplate({
        subject: emailSubject,
        body: note,
        button_label: "View proposal",
      });
    } catch (e) {
      emailValidation = (e as Error).message;
    }
  const cacheKey = `proposal-unsaved:${initial.workspace_id ?? "workspace"}:${initial.id}`;
  const [offline, setOffline, offlineRef] = useCurrentState(false),
    [recovery, setRecovery, recoveryRef] =
      useCurrentState<Partial<Proposal> | null>(null),
    [deviceSaved, setDeviceSaved] = useState(false);
  useEffect(() => {
    const online = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) setError("");
    };
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null");
      if (
        cached &&
        JSON.stringify(editable(cached)) !== JSON.stringify(editable(initial))
      )
        setRecovery(cached);
      else if (cached) localStorage.removeItem(cacheKey);
    } catch {}
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, [cacheKey]);
  useEffect(() => {
    if (!dirty) return;
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          revision: p.revision,
          header_footer: p.header_footer,
          cover: p.cover,
          title: p.title,
          content: p.content,
          quote: p.quote,
          valid_until: p.valid_until,
          style_overrides: p.style_overrides ?? {},
          template_style_overrides: p.template_style_overrides ?? {},
        }),
      );
      setDeviceSaved(true);
    } catch {
      setDeviceSaved(false);
    }
  }, [p, dirty, cacheKey]);
  const [lastSaved, setLastSaved] = useState<string | null>(
    initial.updated_at ?? null,
  );
  const saveFlight = useRef<Promise<boolean> | null>(null),
    reviewFlight = useRef<Promise<boolean> | null>(null),
    sendFlight = useRef<Promise<boolean> | null>(null);
  const allowLeave = useRef(false);
  const generation = useRef(0),
    revision = useRef(initial.revision),
    latest = useRef(p);
  latest.current = p;
  const editable = (v: Proposal) => ({
    header_footer: v.header_footer,
    cover: v.cover,
    title: v.title,
    content: v.content,
    quote: draftItems(v.quote ?? []),
    valid_until: v.valid_until,
    style_overrides: v.style_overrides ?? {},
    template_style_overrides: v.template_style_overrides ?? {},
  });
  const history = useSessionHistory(
    initial.id,
    (value: ReturnType<typeof editable>) => {
      applyChange(value);
    },
    () => editable(latest.current),
  );
  function applyChange(update: Partial<Proposal>) {
    if (!staleRef.current) setError("");
    generation.current++;
    setDirty(true);
    latest.current = { ...latest.current, ...update };
    setP(latest.current);
  }
  function change(update: Partial<Proposal>) {
    if (locked) return;
    if (Object.keys(bandEditing?.moves ?? {}).length) bandEditing?.setMoves({});
    history.record(
      editable(latest.current),
      editable({ ...latest.current, ...update }),
    );
    applyChange(update);
  }
  function keepLocalEdits(value = latest.current) {
    const edits = structuredClone(editable(value));
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ revision: revision.current, ...edits }),
      );
      setDeviceSaved(true);
    } catch {
      setDeviceSaved(false);
    }
    return edits;
  }
  function dropPagePlan() {
    pagePlan.current = undefined;
    setBrowserPages(null);
    const { pagination: discarded, ...value } = latest.current;
    latest.current = value;
    setP(value);
  }
  async function reloadConflict() {
    const edits = keepLocalEdits();
    setRecovery(edits);
    try {
      const current = await api<Proposal>(`/api/proposals/${p.id}`);
      dropPagePlan();
      delete current.pagination;
      revision.current = current.revision;
      setLastSaved(current.updated_at ?? null);
      latest.current = { ...current, quote: editorQuote(current) };
      setP(latest.current);
      // A rejected acknowledgement belongs to the old revision, not this reload.
      setConfirmed(false);
      setDirty(false);
      setStale(false);
      setError("");
      requestAnimationFrame(() =>
        paper.current?.dispatchEvent(new Event("pagination-layout-change")),
      );
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load the current draft",
      );
      return false;
    }
  }
  async function settleEdits(): Promise<boolean> {
    while (reviewFlight.current)
      if (!(await reviewFlight.current)) return false;
    return saveContent();
  }
  function save(): Promise<boolean> {
    return sendFlight.current ?? settleEdits();
  }
  function saveContent(): Promise<boolean> {
    // A derived plan never starts a write, changes the revision, or becomes a
    // recovered edit. Attach a fresh plan only to an actual content save.
    if (saveFlight.current) return saveFlight.current;
    if (!dirtyRef.current)
      return Promise.resolve(!staleRef.current && !errorRef.current);
    if (staleRef.current || offlineRef.current) {
      keepLocalEdits();
      return Promise.resolve(false);
    }
    const flight = (async () => {
      setSaving(true);
      try {
        while (dirtyRef.current) {
          if (staleRef.current || offlineRef.current) return false;
          paper.current?.dispatchEvent(new Event("pagination-flush"));
          const captured = generation.current,
            value = latest.current;
          const result = await api<Proposal>(`/api/proposals/${p.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              revision: revision.current,
              ...editable(value),
              pagination: pagePlan.current,
            }),
          });
          revision.current = result.revision;
          setLastSaved(result.updated_at ?? new Date().toISOString());
          if (captured === generation.current) {
            latest.current = { ...result, quote: editorQuote(result) };
            setP(latest.current);
            setDirty(false);
            if (!recoveryRef.current) {
              try {
                localStorage.removeItem(cacheKey);
              } catch {}
            }
            onSaved(result);
          } else {
            latest.current = { ...latest.current, revision: result.revision };
            setP(latest.current);
          }
          setError("");
        }
        return true;
      } catch (e) {
        const edits = keepLocalEdits();
        if (e instanceof ApiError && e.status === 409) {
          setStale(true);
          dropPagePlan();
          setRecovery(edits);
          // A signature is a permanent lock, not an editable revision conflict.
          // Preserve the rejected local work while showing the accepted document.
          try {
            const current = await api<Proposal>(`/api/proposals/${p.id}`);
            if (
              current.signers.length ||
              current.versions.some((v) => v.frozen)
            ) {
              revision.current = current.revision;
              latest.current = { ...current, quote: editorQuote(current) };
              setP(latest.current);
              setDirty(false);
              setStale(false);
              setError("");
              selection.clear();
              onSaved(current);
              return false;
            }
          } catch {
            /* Keep the local suggestion when current state is unavailable. */
          }
        }
        setError(e instanceof Error ? e.message : "Unable to save");
        return false;
      } finally {
        setSaving(false);
      }
    })();
    saveFlight.current = flight;
    void flight.finally(() => {
      if (saveFlight.current === flight) saveFlight.current = null;
    });
    return flight;
  }
  useReloadGuard({
    blocked: dirty || saving || stale || !!recovery || reviewBusy || sending,
  });
  useEffect(() => {
    if (!dirty || saving || stale || error || offline || reviewBusy || sending)
      return;
    const id = setTimeout(() => void save(), 900);
    return () => clearTimeout(id);
  }, [p, dirty, saving, stale, error, offline, reviewBusy, sending]);
  function sendProposal(): Promise<boolean> {
    if (sendFlight.current) return sendFlight.current;
    const flight = (async () => {
      setSending(true);
      try {
        if (!(await settleEdits())) return false;
        paper.current?.dispatchEvent(new Event("pagination-flush"));
        await post(`/api/proposals/${p.id}/send`, {
          revision: revision.current,
          pagination: pagePlan.current,
          confirm_ai_review: confirmed,
          sender_user_id: sender,
          delivery_method: delivery,
          ...(delivery === "email"
            ? { subject: emailSubject, body: note }
            : {}),
          ...(!protectedLink
            ? { password: null }
            : password
              ? { password }
              : {}),
        });
        allowLeave.current = true;
        location.href = `/proposals/${p.id}${delivery === "manual" ? "?delivery=manual" : ""}`;
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to send");
        return false;
      } finally {
        setSending(false);
      }
    })();
    // A second click/save cannot start another write while publication is pending.
    sendFlight.current = flight;
    void flight.finally(() => {
      if (sendFlight.current === flight) sendFlight.current = null;
    });
    return flight;
  }
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current && !allowLeave.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    let active = true;
    api<{ errors: string[] }>(`/api/proposals/${p.id}/ready`)
      .then((result) => {
        if (active && Array.isArray(result.errors))
          setCustomerErrors(
            result.errors.filter(
              (e) =>
                e === "Choose which Stripe customer this client is" ||
                e.startsWith("Stripe customer check unavailable:"),
            ),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [p.id, p.revision]);
  const current = withDraftSettings(p, settings),
    resolvedStyles = resolveStyles(
      current.workspace_settings,
      p.template_style_overrides,
      p.style_overrides,
    ),
    blockSpaces = documentSpacing(p.content, resolvedStyles),
    items = orderedItems(p.quote),
    sections = contentSections(p.content),
    pending = pendingSections(p),
    map = variables({
      ...current,
      sender: staff.find((s) => s.user_id === sender)
        ? {
            ...current.sender!,
            ...staff.find((s) => s.user_id === sender)!,
            company_name: settings?.company_name ?? "",
            sending_domain: settings?.sending_domain ?? "",
          }
        : current.sender,
    }),
    ready = readiness(
      current,
      catalog,
      new Date(),
      confirmed,
      connections?.qbo_connection
        ? {
            connected: connections.qbo,
            realm: connections.qbo_connection.realm,
            defaultItem: settings?.qbo_custom_item_ref,
          }
        : undefined,
    );

  for (const { excess } of browserPages?.overflowColumns ?? []) {
    ready.errors.push(columnsOverflowMessage(excess));
    ready.ready = false;
  }
  ready.errors.push(...customerErrors);
  ready.ready = !ready.errors.length;
  function setItems(next: QuoteItem[]) {
    change({
      quote: next.map((i, order) => ({
        ...i,
        order,
        selected: !i.optional || i.default_selected,
      })),
    });
  }
  function addItem(item?: Item) {
    const id = uid(),
      value = item
        ? catalogQuoteItem(
            item,
            items.length,
            id,
            Array.from({ length: item.sublines?.length || 1 }, uid),
          )
        : {
            id,
            order: items.length,
            name: "Custom item",
            description: "",
            source: "custom" as const,
            pricing_item_id: null,
            custom_family_id: null,
            sublines: [
              {
                id: uid(),
                amount: 0,
                list_amount: null,
                interval: "one_time" as const,
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
          };
    setItems([...items, value]);
    setExpandedItem(id);
  }
  function move(operation: (content: Block[]) => Block[]) {
    return applyDocumentMove(
      latest.current.content,
      operation,
      (content) => {
        selection.clear();
        const id = contentSections(latest.current.content)[section ?? -1]?.id;
        const next = contentSections(content).findIndex((s) => s.id === id);
        setSection(next < 0 ? null : next);
        change({ content });
      },
      blockFeedback.error,
    );
  }
  function patchBlock(block: Block) {
    // Rich-text callbacks can outlive a drag render. Address the stable ID in
    // the latest document, never the old position or a captured block array.
    change({
      content: latest.current.content.map((b) =>
        b.id === block.id ? block : b,
      ),
    });
  }

  const doc = documents.find((d) => d.id === documentId);
  const refPanel = (
    <div className="stack">
      <p className="eyebrow">Pricing reference · read only</p>
      {documents.length > 1 && (
        <Field label="Document">
          <Select
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
          >
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {doc ? (
        <>
          <h3>{doc.name}</h3>
          <p>
            Version {doc.version} ·{" "}
            {doc.fetched_at
              ? new Date(doc.fetched_at).toLocaleString()
              : "Pasted text"}
          </p>
          <code className="fetch-hash">{doc.content_hash}</code>
          {doc.fetch_error && (
            <Banner tone="warning" title="Showing last good version">
              {doc.fetch_error}
            </Banner>
          )}
          <Field label="Search reference">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="search"
            />
          </Field>
          <pre className="pricing-reference">
            {search
              ? doc.content
                  .split("\n")
                  .filter((l) =>
                    l.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
                  )
                  .join("\n") || "No matching lines"
              : doc.content}
          </pre>
        </>
      ) : (
        <p>
          No pricing reference has been added. Add one in Workspace settings.
        </p>
      )}
    </div>
  );
  const units = Array.from(
      new Set(items.map((i) => i.choice_group_id ?? i.id)),
    ),
    unitItems = (id: string) =>
      items.filter((i) => (i.choice_group_id ?? i.id) === id);
  const quotePanel = (
    <QuoteItemsPanel
      items={items}
      catalog={catalog}
      families={families}
      currency={p.currency}
      proposalContent={p.content}
      aiUnreviewed={p.ai_unreviewed}
      onChange={setItems}
      addItem={addItem}
      expandedItem={expandedItem}
      setExpandedItem={setExpandedItem}
      itemDetails={itemDetails}
      setItemDetails={setItemDetails}
    />
  );
  const firstBlock = !p.content.length ? (
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
      <>
        <span className="empty-sheet-plus" aria-hidden="true">
          +
        </span>
        <span>Add your first block</span>
      </>
    </button>
  ) : null;
  const sendBlockedReason = offline
    ? "Reconnect to send"
    : stale
      ? "Reload to review the latest changes."
      : (ready.errors[0] ??
        (delivery === "email"
          ? emailError ||
            emailValidation ||
            (!emailLoaded ? "Loading email template…" : "")
          : ""));
  const sendReason =
    sendBlockedReason ||
    (protectedLink && !p.password_hash && password.length < 8
      ? "Enter a password with at least 8 characters."
      : "");
  const sendPanel = (
    <div className="send-panel stack">
      <h2 className="t-section-title">Readiness</h2>
      <ul className="send-checklist">
        {ready.errors
          .filter((e) => !e.startsWith("Confirm review of AI changes"))
          .map((e, n) => (
            <li className="readiness-row blocker" key={n}>
              <span className="readiness-badge" aria-hidden="true">
                <Icon name="failed" />
              </span>
              <div>
                <p>
                  <strong>Needs attention.</strong> {e}
                </p>
                {e === businessStateError && (
                  <a href={businessStateUrl}>Add business state</a>
                )}
                {e === "Choose which Stripe customer this client is" && (
                  <a href={`/clients/${p.client.id}#stripe-customers`}>
                    Choose Stripe customer
                  </a>
                )}
              </div>
            </li>
          ))}
        {[
          ...ready.warnings,
          ...(pdfPreview.data?.layout.overflow_pages ?? []).map(
            (page) => `Page ${page} overflows in the PDF · Preview PDF`,
          ),
          ...((pdfPreview.data?.layout.pricing_pages ?? 0) > 1
            ? [
                `Pricing table spans ${pdfPreview.data!.layout.pricing_pages} pages — use Standard density or trim descriptions.`,
              ]
            : []),
        ].map((e, n) => (
          <li className="readiness-row warning" key={n}>
            <span className="readiness-badge" aria-hidden="true">
              ?
            </span>
            <div>
              <p>
                {e.includes(": custom — check scope and price") ? (
                  <>
                    <strong>Custom line.</strong> {e.split(": custom —")[0]} has
                    a manual price. Check the scope and price.
                  </>
                ) : (
                  <>
                    <strong>Review.</strong> {e}
                  </>
                )}
              </p>
            </div>
          </li>
        ))}
        {ready.errors.every((e) =>
          e.startsWith("Confirm review of AI changes"),
        ) && (
          <li className="readiness-row success">
            <span className="readiness-badge" aria-hidden="true">
              <Icon name="verified" />
            </span>
            <p>Quote, contract and signature blocks are in place.</p>
          </li>
        )}
      </ul>
      {/* A fast review response must not detach the native control mid-activation. */}
      <div
        className="send-ai-review readiness-row blocker"
        hidden={pending.length === 0}
      >
        <span className="readiness-badge" aria-hidden="true">
          <Icon name="failed" />
        </span>
        <div className="send-ai-review-body">
          <p>
            <strong>
              {pending.length} AI-written{" "}
              {pending.length === 1 ? "section" : "sections"}.
            </strong>{" "}
            {pending.join(", ")}
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                if (e.target.checked)
                  void review(
                    contentSections(p.content)
                      .filter((s) => s.pending)
                      .map((s) => s.id),
                    true,
                  );
              }}
            />
            I've reviewed these AI-written sections
          </label>
          <button type="button" className="text-link" onClick={showReview}>
            Show me
          </button>
        </div>
      </div>
      <fieldset className="delivery-choice">
        <legend>How will you deliver it?</legend>
        <label className="check">
          <input
            type="radio"
            name="proposal-delivery"
            value="email"
            checked={delivery === "email"}
            onChange={() => setDelivery("email")}
          />
          Email it from the app
        </label>
        <label className="check">
          <input
            type="radio"
            name="proposal-delivery"
            value="manual"
            checked={delivery === "manual"}
            onChange={() => setDelivery("manual")}
          />
          I'll send it myself
        </label>
      </fieldset>
      <Field label="Valid until">
        <ValidityField
          timezone={settings?.timezone ?? "UTC"}
          value={p.valid_until}
          onChange={(valid_until) => change({ valid_until })}
        />
      </Field>
      {delivery === "manual" ? (
        <section className="manual-client-contact" aria-label="Client contact">
          <header>
            <strong>Client contact</strong>
            <button
              type="button"
              className="text-link"
              onClick={async () => {
                if (await save()) setEditClientOpen(true);
              }}
            >
              Edit client
            </button>
          </header>
          <p>
            {p.client.company} ·{" "}
            {[p.client.first_name, p.client.last_name]
              .filter(Boolean)
              .join(" ")}
          </p>
          <div className="manual-contact-email">
            <span>{p.client.email}</span>
            <CopyContactButton kind="email" value={p.client.email} />
          </div>
          {p.client.billing_email && (
            <p>Billing email: {p.client.billing_email}</p>
          )}
        </section>
      ) : (
        <>
          <Field label="From">
            <Select value={sender} onChange={(e) => setSender(e.target.value)}>
              {staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.display_name} · {settings?.company_name} &lt;{s.email}&gt;
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To">
            <input
              value={`${p.client.first_name} ${p.client.last_name} <${p.client.email}>`}
              readOnly
            />
          </Field>
        </>
      )}
      {delivery === "email" && (
        <>
          {(emailError || emailValidation) && (
            <Banner tone="danger" title="Check the email">
              {emailError || emailValidation}
              {emailError && (
                <Button onClick={() => setEmailRetry((n) => n + 1)}>
                  Retry email template
                </Button>
              )}
            </Banner>
          )}
          <Field label="Subject">
            <SubjectField
              value={emailSubject}
              disabled={!emailLoaded}
              map={{
                ...emailValues(p),
                "sender.name":
                  staff.find((m) => m.user_id === sender)?.display_name ??
                  user?.staff_name ??
                  "",
              }}
              onChange={(value) => {
                subjectEdited.current = true;
                setEmailSubject(value);
              }}
            />
          </Field>
          <div className="field send-email-note">
            <span>Note</span>
            {emailLoaded ? (
              <FieldEditor
                standalone
                label="Note"
                allowLinks
                value={note}
                onChange={(v) => {
                  setNote(v);
                }}
                map={{
                  ...emailValues(p),
                  "sender.name":
                    staff.find((m) => m.user_id === sender)?.display_name ??
                    user?.staff_name ??
                    "",
                }}
                showNames={false}
              />
            ) : (
              <p role="status">Loading email template…</p>
            )}
          </div>
          <p className="muted">
            Subject and note start from your{" "}
            <a href="/studio/emails/proposal_sent">Proposal sent email</a>.
            Edits here apply only to this send.
          </p>
        </>
      )}
      <label className="check">
        <Switch
          checked={protectedLink}
          onChange={(e) => setProtected(e.target.checked)}
        />
        Require a password
      </label>
      {protectedLink && (
        <Field label="Password">
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            placeholder={
              p.password_hash
                ? "Leave blank to keep current password"
                : "At least 8 characters"
            }
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      )}
      <small>
        {delivery === "email"
          ? "The client link is added automatically. "
          : "The app won't email this link or send automatic reminders unless you turn them on in the record. "}
        {delivery === "email" && (
          <>
            From must match{" "}
            {settings?.sending_domain || "the workspace’s verified domain"}.
          </>
        )}
      </small>
      <footer className="send-panel-footer">
        <div className="send-card-preview">
          <Button
            onClick={async () => {
              if (await save())
                window.open(`/p/${p.id}?preview=1`, "_blank", "noopener");
            }}
          >
            Preview as client
          </Button>
        </div>
        <div className="send-action-card">
          <div>
            <strong>
              {delivery === "manual" ? "Manual delivery" : "Send proposal"}
            </strong>
            <p
              className="send-blocked-reason"
              id="proposal-send-reason"
              role="status"
            >
              {sendReason}
            </p>
          </div>
          <Button
            variant="primary"
            className="action"
            aria-describedby={sendReason ? "proposal-send-reason" : undefined}
            disabled={
              !ready.ready ||
              (delivery === "email" &&
                (!emailLoaded || !!emailValidation || !!emailError)) ||
              stale ||
              offline ||
              sending ||
              (protectedLink && !p.password_hash && password.length < 8)
            }
            busy={sending}
            onClick={() => void sendProposal()}
          >
            {delivery === "manual"
              ? "Publish client link"
              : `Send to ${p.client.first_name || "client"}`}
          </Button>
        </div>
      </footer>
    </div>
  );
  const focusBlock = (id: string) => {
    const index = p.content.findIndex((b) => b.id === id);
    const group = sections.findIndex((s) => s.indices.includes(index));
    if (group >= 0) setSection(group);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(
          id === "cover"
            ? "#cover-title"
            : `[data-block-id="block-${CSS.escape(id)}"]`,
        );
        el?.scrollIntoView({ block: "center" });
        (el?.querySelector<HTMLElement>("textarea,.tiptap") ?? el)?.focus();
      }),
    );
  };
  const selectedIndex = p.content.findIndex(
    (b) =>
      documentBlocks([b]).some(
        (child) => `block-${child.id}` === selection.selected,
      ) ||
      b.columns?.items.some(
        (column) => columnStyleKey(column.id) === selection.selected,
      ) ||
      b.clauses?.some((c) => `clause-${c.id}` === selection.selected),
  );
  useEffect(() => {
    // Return from isolated phone editing to the complete existing sheet projection.
    paper.current?.dispatchEvent(new Event("pagination-layout-change"));
  }, [panels.phone, selection.selected]);
  const currentSectionId =
    selectedIndex < 0
      ? null
      : (p.content
          .slice(0, selectedIndex + 1)
          .filter((b) => b.type === "heading")
          .at(-1)?.id ?? "cover");
  const outline = (
    <>
      <SectionsNav
        map={map}
        headerFooter={bands}
        currentSectionId={currentSectionId}
        content={p.content}
        onMove={move}
        pagination={browserPages}
        measure={(content) =>
          paginateBrowser(
            paper.current!,
            content,
            resolveStyles(
              p.workspace_settings,
              p.template_style_overrides,
              p.style_overrides,
            ),
            false,
            true,
            bands,
          )
        }
        onPage={(page) => {
          if (panels.phone) {
            setSection(0);
            setFullDocument(true);
            setOutlineOpen(false);
          }
          requestAnimationFrame(() =>
            document
              .querySelector(`[data-editor-page="${page}"]`)
              ?.scrollIntoView({ block: "start" }),
          );
        }}
        onChange={(content) => {
          selection.clear();
          const activeId = sections[section ?? -1]?.id;
          const next = contentSections(content).findIndex(
            (s) => s.id === activeId,
          );
          setSection(next < 0 ? null : next);
          change({ content });
        }}
        onFocus={(id) => {
          if (outlineOpen) {
            pendingOutline.current = id;
            document
              .querySelector<HTMLDialogElement>("dialog.sections-overlay")
              ?.close();
          } else focusBlock(id);
        }}
      />
      <p className="eyebrow legacy-sections-progress">AI review</p>
      <p>
        {sections.length - pending.length} of{" "}
        {withCount(sections.length, "section")}
        reviewed
      </p>
      <progress
        value={sections.length - pending.length}
        max={sections.length || 1}
      />
    </>
  );
  const styleDocument = {
    content: p.content,
    prefix: "block-",
    onChange: (content: Block[]) => change({ content }),
    onOpenStyles: () => openTools("Styles"),
  };
  const panelBody = (
    <ReadOnlyRegion locked={stale || locked}>
      {tab === "Quote" ? (
        locked ? (
          <div className="quote-panel">
            {p.quote.map((i) => (
              <section className="locked-quote-row" key={i.id}>
                <strong>{i.name}</strong>
                <p>{i.description}</p>
                <p>
                  {i.sublines
                    .map(
                      (s) =>
                        `${money(s.amount * s.qty, p.currency)}${s.interval === "month" ? "/mo" : s.interval === "year" ? "/yr" : ""}`,
                    )
                    .join(" + ")}
                </p>
              </section>
            ))}
            <Totals lines={p.quote} currency={p.currency} />
          </div>
        ) : (
          quotePanel
        )
      ) : tab === "Fields" ? (
        <FieldOptions
          map={map}
          onInsert={(path) => {
            if (drawer) {
              pendingField.current = path;
              document
                .querySelector<HTMLDialogElement>("dialog.tools-sheet")
                ?.close();
            } else fields?.insert(path);
          }}
        />
      ) : tab === "Blocks" ? (
        <BlockMenu
          variant="panel"
          anchor={null}
          hasPricing={p.content.some((b) => b.type === "pricing_table")}
          signatureRoles={p.content
            .filter((b) => b.type === "signature_block")
            .map((b) => b.role!)}
          saved={library}
          onChoose={(block, extra) =>
            insertBlock(
              block,
              extra,
              defaultBlockInsertion(
                paper.current,
                p.content,
                selection.selected,
                browserPages?.assignments,
              ),
            )
          }
          onClose={() => {
            if (panels.phone) setDrawer(false);
          }}
          onDragStart={() => {
            if (panels.mode !== "docked") setDrawer(false);
          }}
        />
      ) : tab === "Styles" ? (
        <SelectionStyles
          document={styleDocument}
          settings={current.workspace_settings}
          styles={resolvedStyles}
          phone={panels.phone}
          locked={locked || stale}
        >
          <ProposalStyles
            cover={p.cover}
            onCover={(cover) => change({ cover })}
            settings={p.workspace_settings}
            headerFooter={bands}
            bandPages={
              bands
                ? resolvedBandPages(
                    bands,
                    bandPages(
                      p.content,
                      browserPages?.plan,
                      browserPages?.assignments,
                    ),
                  )
                : undefined
            }
            onHeaderFooter={(header_footer) => change({ header_footer })}
            onResetBands={async () => {
              const templates =
                await api<import("../lib/model").Template[]>("/api/templates");
              const saved = templates.find(
                (t) => t.id === latest.current.template_id,
              )?.header_footer;
              change({
                header_footer: resetBandSettings(
                  latest.current.header_footer ?? defaultHeaderFooter(),
                  saved,
                ),
              });
            }}
            pageCount={browserPages?.plan.pages ?? 1}
            inherited={p.template_style_overrides}
            value={p.style_overrides}
            onChange={(style_overrides) => change({ style_overrides })}
            resetLabel="Reset to template"
            onReset={() => change({ style_overrides: {} })}
          />
        </SelectionStyles>
      ) : (
        sendPanel
      )}
    </ReadOnlyRegion>
  );
  const panel = (
    <>
      <PanelTabs tab={tab as EditorTab} onTab={setTab} />
      <div role="tabpanel" id="editor-active-panel">
        {panelBody}
      </div>
    </>
  );

  function blockEditor(b: Block, n: number) {
    const signer = p.signers.find((s) => s.role === (b.role ?? "client"));
    const HeadingTag = `h${(b.level ?? 1) + 1}` as "h2" | "h3" | "h4";
    const style = (
      level: TextLevel,
      text?: string,
      afterFocus?: () => void,
    ) => {
      const next = p.content.map((v, j) =>
        j === n ? convertTextStyle(b, level, text) : v,
      );
      change({ content: next });
      setSection(contentSections(next).findIndex((s) => s.indices.includes(n)));
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          document
            .querySelector<HTMLElement>(
              `[data-block-id="block-${b.id ?? n}"] textarea,[data-block-id="block-${b.id ?? n}"] .tiptap`,
            )
            ?.focus({ preventScroll: true });
          afterFocus?.();
        }),
      );
    };
    const unwrap = () => {
      change({ content: unwrapColumns(latest.current.content, b.id!) });
      selection.clear();
    };
    const removeColumns = () =>
      blockFeedback.remove(
        b,
        () => {
          change({
            content: latest.current.content.filter(
              (block) => block.id !== b.id,
            ),
          });
          selection.clear();
        },
        () => {
          const next = [...latest.current.content];
          next.splice(Math.min(n, next.length), 0, b);
          change({ content: next });
        },
      );
    const duplicateColumns = () => {
      const content = [...latest.current.content];
      content.splice(n + 1, 0, duplicateBlock(b));
      change({ content });
    };
    return (
      <Sortable
        block
        id={`block-${b.id ?? n}`}
        spaceBefore={blockSpaces[b.id ?? String(n)]}
        customSpacing={
          b.style?.margin_above !== undefined ||
          p.content[n - 1]?.style?.margin_below !== undefined
        }
        label={`block ${n + 1}`}
        key={b.id ?? n}
      >
        <BlockFrame
          id={`block-${b.id ?? n}`}
          label={`Proposal block ${n + 1}`}
          blockType={b.type}
          selectionBar={
            b.columns
              ? (owner) =>
                  selection.selected === `block-${b.id}` && (
                    <ColumnActionBar
                      owner={owner}
                      itemKey={`block-${b.id}`}
                      label={`Columns · ${b.columns!.items.length}`}
                      onStyle={() => selection.selectStyle(`block-${b.id}`)}
                      onUnwrap={unwrap}
                      onDelete={removeColumns}
                      tools={
                        <>
                          {([-1, 1] as const).map((direction) => (
                            <BlockAction
                              key={direction}
                              menuLabel
                              disabled={
                                !canMoveAdjacentBlock(
                                  p.content,
                                  b.id!,
                                  direction,
                                )
                              }
                              onClick={() =>
                                move((content) =>
                                  moveAdjacentBlock(content, b.id!, direction),
                                )
                              }
                            >
                              {direction === -1 ? "Move up" : "Move down"}
                            </BlockAction>
                          ))}
                          <BlockAction
                            menuLabel
                            onClick={() => duplicateColumns()}
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
            settings: current.workspace_settings,
            styles: resolvedStyles,
            block: b,
            onChange: locked
              ? undefined
              : (style) => patchBlock({ ...b, style }),
          }}
          reviewBusy={reviewBusy}
          objectAction={
            b.type === "pricing_table" ? (
              <button
                type="button"
                title="Edit quote"
                onClick={() => openTools("Quote")}
              >
                Edit quote
              </button>
            ) : undefined
          }
          className={`draft-block ${b.type === "page_break" ? "sheet-break-marker" : ""}`}
          ai={!!b.ai_review && !b.ai_review.reviewed}
          reviewPending={sections.find((s) => s.indices.includes(n))?.pending}
          reviewed={
            !!sections.find(
              (s) =>
                s.indices.includes(n) &&
                s.indices.some((j) => p.content[j].ai_review) &&
                !s.pending,
            )
          }
          onReviewed={() => {
            const s = sections.find((s) => s.indices.includes(n));
            if (s) void review([s.id], true);
          }}
          onUndo={() => {
            const s = sections.find((s) => s.indices.includes(n));
            if (s) void review([s.id], false);
          }}
          insert={(edge, anchor) => {
            setInsertAnchor(anchor);
            setReplaceEmpty(false);
            setInsertAt(n + (edge === "below" ? 1 : 0));
          }}
          tools={
            <>
              {b.type === "columns" && (
                <BlockAction menuLabel onClick={unwrap}>
                  Unwrap columns
                </BlockAction>
              )}
              <BlockAction
                variant="ghost"
                disabled={!canMoveAdjacentBlock(p.content, b.id!, -1)}
                onClick={() =>
                  move((content) => moveAdjacentBlock(content, b.id!, -1))
                }
              >
                Move up
              </BlockAction>
              <BlockAction
                variant="ghost"
                disabled={!canMoveAdjacentBlock(p.content, b.id!, 1)}
                onClick={() =>
                  move((content) => moveAdjacentBlock(content, b.id!, 1))
                }
              >
                Move down
              </BlockAction>
              {b.type === "contract" && (
                <BlockAction
                  onClick={() =>
                    patchBlock({
                      ...b,
                      contract_edited: true,
                      clauses: [
                        ...(b.clauses ?? []),
                        {
                          id: uid(),
                          heading: "New clause",
                          body: "",
                          show_when: null,
                        },
                      ],
                    })
                  }
                >
                  Add clause
                </BlockAction>
              )}
              {b.type === "contract" && b.clauses?.length ? (
                <BlockAction
                  aria-label="Contract settings"
                  onClick={() => setClauseEdit({ block: n, clause: 0 })}
                >
                  Contract settings
                </BlockAction>
              ) : null}
              {["image", "signature_block"].includes(b.type) && (
                <BlockAction
                  aria-label="Block settings"
                  onClick={() => setBlockSettings(b.id!)}
                >
                  Block settings
                </BlockAction>
              )}
              {!["pricing_table", "signature_block"].includes(b.type) && (
                <BlockAction
                  aria-label="Duplicate block"
                  onClick={() => {
                    const content = [...latest.current.content];
                    content.splice(n + 1, 0, duplicateBlock(b));
                    change({ content });
                  }}
                >
                  Duplicate block
                </BlockAction>
              )}
              {blockFeedback.reuseButton(b)}
              <BlockAction
                onClick={() =>
                  blockFeedback.remove(
                    b,
                    () =>
                      change({
                        content: latest.current.content.filter(
                          (v) => v.id !== b.id,
                        ),
                      }),
                    () => {
                      const next = [...latest.current.content];
                      next.splice(Math.min(n, next.length), 0, b);
                      change({ content: next });
                    },
                  )
                }
              >
                Delete block
              </BlockAction>
            </>
          }
        >
          {b.type === "heading" ? (
            <HeadingTag
              className="document-heading-edit"
              data-heading-level={b.level ?? 1}
            >
              <FieldEditor
                label={`Heading ${n + 1}`}
                textLevel={b.level ?? 1}
                map={map}
                showNames={false}
                onTextStyle={style}
                onBeforeInsert={() =>
                  setSection(sections.findIndex((s) => s.indices.includes(n)))
                }
                value={
                  b.content ?? {
                    type: "doc",
                    content: [
                      {
                        type: "paragraph",
                        content: b.text ? [{ type: "text", text: b.text }] : [],
                      },
                    ],
                  }
                }
                onHeadingStartEnter={() => {
                  const next = [...latest.current.content];
                  next.splice(
                    next.findIndex((v) => v.id === b.id),
                    0,
                    {
                      id: uid(),
                      type: "paragraph",
                      content: {
                        type: "doc",
                        content: [{ type: "paragraph" }],
                      },
                    },
                  );
                  change({ content: next });
                }}
                onChange={(content) =>
                  patchBlock({
                    ...b,
                    content,
                    rich_heading: true,
                    text: blockText({ type: "heading", content }).replace(
                      /[\r\n]+/g,
                      " ",
                    ),
                  })
                }
              />
            </HeadingTag>
          ) : b.type === "paragraph" ? (
            <FieldEditor
              onTextStyle={style}
              onBeforeInsert={() =>
                setSection(sections.findIndex((s) => s.indices.includes(n)))
              }
              value={
                b.content ?? {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      ...(b.text
                        ? { content: [{ type: "text", text: b.text }] }
                        : {}),
                    },
                  ],
                }
              }
              onChange={(content) =>
                patchBlock({ ...b, content, text: undefined })
              }
              map={map}
              showNames={false}
              onSlash={(anchor) => {
                setInsertAnchor(anchor ?? null);
                setReplaceEmpty(true);
                setInsertAt(n);
              }}
            />
          ) : b.type === "columns" && b.columns ? (
            <ColumnsEditor
              block={b}
              map={map}
              styles={resolvedStyles}
              settings={current.workspace_settings}
              prefix="block-"
              saved={library}
              onChange={locked ? undefined : patchBlock}
              onUnwrap={unwrap}
              onDelete={removeColumns}
              excess={
                browserPages?.overflowColumns?.find(
                  (item) => item.block === b.id,
                )?.excess
              }
              reuse={blockFeedback.reuse}
            />
          ) : b.type === "pricing_table" ? (
            <div className="editor-investment">
              <h2>Your investment</h2>
              <p>Optional items are your choice. Totals update as you go.</p>
              <div className="flow-quote document-quote">
                {quoteLayout(
                  resolveStyles(
                    p.workspace_settings,
                    p.template_style_overrides,
                    p.style_overrides,
                  ),
                ) === "table" ? (
                  <QuoteTable
                    quote={items}
                    currency={p.currency}
                    cents={p.workspace_settings?.money?.cents}
                    defaults
                    onToggle={(id, value) => {
                      const item = items.find((i) => i.id === id)!;
                      setItems(
                        items.map((v) =>
                          v.choice_group_id &&
                          v.choice_group_id === item.choice_group_id
                            ? { ...v, default_selected: v.id === id }
                            : v.id === id
                              ? { ...v, default_selected: value }
                              : v,
                        ),
                      );
                    }}
                  />
                ) : (
                  <Reorder
                    ids={units}
                    onMove={(from, to) =>
                      setItems(
                        arrayMove(
                          units,
                          units.indexOf(from),
                          units.indexOf(to),
                        ).flatMap(unitItems),
                      )
                    }
                  >
                    {units.map((id) => (
                      <Sortable
                        key={id}
                        id={id}
                        documentKind={
                          unitItems(id)[0].choice_group_id ? "group" : "card"
                        }
                        printUnit={unitItems(id)[0].id}
                        label={`document ${unitItems(id)[0].choice_group_id ? "choice group" : unitItems(id)[0].name}`}
                      >
                        {unitItems(id)[0].choice_group_id ? (
                          <div
                            className="flow-choice-group"
                            role="radiogroup"
                            aria-label="Choose one"
                          >
                            <h3>Choose one</h3>
                            <Reorder
                              ids={unitItems(id).map((i) => i.id)}
                              onMove={(from, to) => {
                                const group = unitItems(id),
                                  next = arrayMove(
                                    group,
                                    group.findIndex((i) => i.id === from),
                                    group.findIndex((i) => i.id === to),
                                  );
                                setItems(
                                  units.flatMap((u) =>
                                    u === id ? next : unitItems(u),
                                  ),
                                );
                              }}
                            >
                              {unitItems(id).map((i) => (
                                <Sortable
                                  key={i.id}
                                  id={i.id}
                                  documentKind="card"
                                  label={`document option ${i.name}`}
                                >
                                  {documentItem(i)}
                                </Sortable>
                              ))}
                            </Reorder>
                          </div>
                        ) : (
                          documentItem(unitItems(id)[0])
                        )}
                      </Sortable>
                    ))}
                  </Reorder>
                )}
                <DocumentTotals
                  {...quoteTotalValues(items)}
                  currency={p.currency}
                  cents={p.workspace_settings?.money?.cents}
                  className="print-quote-totals"
                />
              </div>
            </div>
          ) : b.type === "contract" ? (
            <div className="contract-editor">
              <h2>
                <HeadingTokens
                  text={b.text || "Statement of Work & Contract"}
                  map={map}
                />
              </h2>
              {b.contract_edited && (
                <p className="warning">Contract edited for this proposal.</p>
              )}
              <Reorder
                ids={(b.clauses ?? []).map((c) => c.id)}
                onMove={(from, to) => {
                  selection.clear();
                  const clauses = arrayMove(
                    b.clauses!,
                    b.clauses!.findIndex((c) => c.id === from),
                    b.clauses!.findIndex((c) => c.id === to),
                  );
                  patchBlock({ ...b, contract_edited: true, clauses });
                }}
              >
                {(b.clauses ?? []).map((c, k) =>
                  !c.show_when ||
                  items.some(
                    (i) =>
                      i.pricing_item_id === c.show_when?.pricing_item_id &&
                      (!i.optional || i.default_selected),
                  ) ? (
                    <Sortable
                      block
                      key={c.id}
                      id={c.id}
                      label={`clause ${k + 1}`}
                    >
                      <BlockFrame
                        id={`clause-${c.id}`}
                        label={`Proposal clause ${k + 1}`}
                        tools={
                          <>
                            <BlockAction
                              aria-label="Clause settings"
                              onClick={() =>
                                setClauseEdit({ block: n, clause: k })
                              }
                            >
                              Clause settings
                            </BlockAction>{" "}
                            {blockFeedback.reuseButton({
                              id: c.id,
                              type: "contract",
                              text: c.heading,
                              clauses: [c],
                            })}
                            <BlockAction
                              variant="ghost"
                              onClick={() =>
                                blockFeedback.remove(
                                  { type: "contract" },
                                  () =>
                                    patchBlock({
                                      ...b,
                                      contract_edited: true,
                                      clauses: b.clauses!.filter(
                                        (_, j) => j !== k,
                                      ),
                                    }),
                                  () => {
                                    const current = latest.current.content.find(
                                      (v) => v.id === b.id,
                                    );
                                    if (!current) return;
                                    const clauses = [
                                      ...(current.clauses ?? []),
                                    ];
                                    clauses.splice(
                                      Math.min(k, clauses.length),
                                      0,
                                      c,
                                    );
                                    change({
                                      content: latest.current.content.map(
                                        (v) =>
                                          v.id === b.id
                                            ? {
                                                ...current,
                                                contract_edited: true,
                                                clauses,
                                              }
                                            : v,
                                      ),
                                    });
                                  },
                                )
                              }
                            >
                              Remove clause
                            </BlockAction>
                            <BlockAction
                              variant="ghost"
                              disabled={k === 0}
                              onClick={() => {
                                const clauses = [...b.clauses!];
                                [clauses[k - 1], clauses[k]] = [
                                  clauses[k],
                                  clauses[k - 1],
                                ];
                                patchBlock({
                                  ...b,
                                  contract_edited: true,
                                  clauses,
                                });
                              }}
                            >
                              Move clause up
                            </BlockAction>
                            <BlockAction
                              variant="ghost"
                              disabled={k === b.clauses!.length - 1}
                              onClick={() => {
                                const clauses = [...b.clauses!];
                                [clauses[k + 1], clauses[k]] = [
                                  clauses[k],
                                  clauses[k + 1],
                                ];
                                patchBlock({
                                  ...b,
                                  contract_edited: true,
                                  clauses,
                                });
                              }}
                            >
                              Move clause down
                            </BlockAction>
                          </>
                        }
                      >
                        <details open={panels.printMode || undefined}>
                          <Disclosure>
                            <h3>
                              <HeadingTokens text={c.heading} map={map} />
                            </h3>
                          </Disclosure>
                          <SourceParagraph
                            text={c.body}
                            map={map}
                            boldRunIns={finalOiotClause(c)}
                          />
                        </details>
                      </BlockFrame>
                    </Sortable>
                  ) : null,
                )}
              </Reorder>
            </div>
          ) : b.type === "signature_block" ? (
            <div className="editor-signature client-signature">
              {blockSettings === b.id && (
                <Sheet
                  title="Signature settings"
                  close={() => setBlockSettings(null)}
                >
                  <Field label="Signer role">
                    <Select
                      value={b.role ?? "client"}
                      onChange={(e) =>
                        patchBlock({
                          ...b,
                          role: e.target.value as "client" | "company",
                        })
                      }
                    >
                      <option value="client">Client</option>
                      <option value="company">Company</option>
                    </Select>
                  </Field>
                </Sheet>
              )}
              <div
                dangerouslySetInnerHTML={{
                  __html: signatureHtml({
                    role: b.role ?? "client",
                    name:
                      signer?.name ||
                      (b.role === "company"
                        ? settings?.company_signatory?.name ||
                          settings?.owner ||
                          "Company"
                        : `${p.client.first_name} ${p.client.last_name}`),
                    date: signer
                      ? readableDate(
                          signer.signed_at,
                          p.workspace_settings?.timezone,
                        )
                      : undefined,
                    image: signer?.kind === "drawn" ? signer.image : undefined,
                    typedName:
                      signer?.kind === "typed"
                        ? signer.typed_name || signer.name
                        : undefined,
                    company:
                      signer?.company ||
                      (b.role === "company"
                        ? p.workspace_settings?.company_name ||
                          settings?.company_name ||
                          ""
                        : p.client.company),
                    title:
                      signer?.title ||
                      (b.role === "company"
                        ? settings?.company_signatory?.title
                        : p.client.title),
                  }),
                }}
              />
            </div>
          ) : b.type === "image" ? (
            <>
              <SelectableImage
                value={{ ...b, src: b.src ?? "" }}
                onChange={
                  locked ? undefined : (image) => patchBlock({ ...b, ...image })
                }
                onDelete={() =>
                  blockFeedback.remove(
                    b,
                    () =>
                      change({
                        content: latest.current.content.filter(
                          (v) => v.id !== b.id,
                        ),
                      }),
                    () => {
                      const next = [...latest.current.content];
                      next.splice(Math.min(n, next.length), 0, b);
                      change({ content: next });
                    },
                  )
                }
              />
              {blockSettings === b.id && (
                <Sheet
                  title="Image settings"
                  close={() => setBlockSettings(null)}
                >
                  <Field label="Image description">
                    <input
                      value={b.alt ?? ""}
                      onChange={(e) =>
                        patchBlock({ ...b, alt: e.target.value })
                      }
                    />
                  </Field>
                </Sheet>
              )}
            </>
          ) : b.type === "variable" ? (
            <HeadingTokens text={`{{${b.path ?? ""}}}`} map={map} />
          ) : (
            <div className="editor-page-break" data-explicit-break>
              Page break
            </div>
          )}
        </BlockFrame>
      </Sortable>
    );
  }
  function sectionEditor(s: (typeof sections)[number], n: number) {
    return (
      <section
        className="document-section"
        data-ai-pending={s.pending}
        id={`draft-section-${n}`}
        key={s.id}
      >
        {pairSignatureNodes(
          s.indices.map((j) => p.content[j]),
          s.indices.map((j) => blockEditor(p.content[j], j)),
          locked ? p.pagination : undefined,
        )}
      </section>
    );
  }
  function insertBlock(block: Block, extra: Block[] = [], at?: number) {
    const index = at ?? insertAt ?? p.content.length;
    let next: Block[];
    try {
      next = insertAuthoringBlocks(
        p.content,
        [block, ...extra],
        index,
        replaceEmpty && at === undefined,
      );
    } catch (error) {
      blockFeedback.error((error as Error).message);
      return;
    }
    const id =
      next.find(
        (b, n) =>
          n >= index &&
          !p.content.some((old) => old.id === b.id) &&
          b.type !== "heading",
      )?.id ?? next[index].id!;
    setReplaceEmpty(false);
    change({ content: next });
    setInsertAt(null);
    const ss = contentSections(next);
    setSection(
      ss.findIndex((s) =>
        s.indices.includes(next.findIndex((b) => b.id === id)),
      ),
    );
    requestAnimationFrame(() => {
      const frame = document.getElementById(`block-${id}`);
      selection.select(`block-${id}`);
      (
        frame?.querySelector<HTMLElement>(
          "input,textarea,[contenteditable=true]",
        ) ?? frame
      )?.focus();
      frame?.scrollIntoView({ block: "center" });
    });
  }
  const blockDrop = useBlockDrop(
    p.content,
    paper,
    (blocks, { at, inside }) => {
      if (!inside) return insertBlock(blocks[0], blocks.slice(1), at);
      try {
        const next = insertColumnBlocks(
          latest.current.content,
          blocks,
          inside,
          at,
        );
        change({ content: next.content });
        if (next.first?.id)
          requestAnimationFrame(() => {
            selection.select(`block-${next.first.id}`);
            document
              .getElementById(`block-${next.first.id}`)
              ?.focus({ preventScroll: true });
          });
      } catch (error) {
        blockFeedback.error((error as Error).message);
      }
    },
    locked || stale,
  );
  function moveAt(from: string, target: BlockDestination, selected: string[]) {
    const current = latest.current.content;
    const ids = selected.includes(from) ? selected : [from];
    if (
      !target.inside &&
      ids.every((id) => current.some((block) => block.id === id))
    )
      return move((content) =>
        moveDocumentBlocksAt(content, from, target.at, selected),
      );
    try {
      const content = moveBlocksAcrossColumns(current, ids, target);
      if (JSON.stringify(content) !== JSON.stringify(current)) {
        change({ content });
        selection.clear();
      }
    } catch (error) {
      blockFeedback.error((error as Error).message);
    }
  }
  function documentItem(i: QuoteItem) {
    const active = !i.optional || i.default_selected;
    const Row = i.optional ? "label" : "div";
    return (
      <Row className={`flow-quote-line ${active ? "selected" : ""}`}>
        <span className="quote-control-slot">
          {i.optional ? (
            <input
              aria-label={`Default selection for ${i.name} · ${active ? "included" : "not included"}`}
              type={i.choice_group_id ? "radio" : "checkbox"}
              name={`document-${i.choice_group_id ?? i.id}`}
              checked={active}
              onChange={() =>
                setItems(
                  items.map((v) =>
                    v.choice_group_id && v.choice_group_id === i.choice_group_id
                      ? { ...v, default_selected: v.id === i.id }
                      : v.id === i.id
                        ? { ...v, default_selected: !v.default_selected }
                        : v,
                  ),
                )
              }
            />
          ) : (
            <span
              className="quote-required"
              role="img"
              aria-label="Required"
              title="Required"
            />
          )}
        </span>
        <QuoteItemBody
          item={i}
          active={active}
          currency={p.currency}
          cents={p.workspace_settings?.money?.cents}
        />
      </Row>
    );
  }
  return (
    <div
      {...blockDrop.handlers}
      data-panels-ready={panels.ready}
      data-stale={stale}
      data-compact={panels.compact}
      data-shell-mode={panels.phone ? "phone" : "v2"}
      data-phone-editing={
        panels.phone && !!selection.selected && !selection.selectMode
      }
      data-phone-select-mode={selection.selectMode}
      className={`quote-workspace editor-v2 editor-round3 ${panels.printMode ? "pdf-width-editor" : "phone-editing"} ${section === null ? "section-list-mode" : "section-edit-mode"} ${fullDocument ? "full-document-mode" : ""}`}
    >
      {blockDrop.line}
      {replaceBlockOpen && (
        <ReplaceSavedBlockDialog
          proposal={p}
          onClose={() => setReplaceBlockOpen(false)}
          onChanged={(next) => {
            revision.current = next.revision;
            latest.current = { ...next, quote: editorQuote(next) };
            setP(latest.current);
            setDirty(false);
            setLastSaved(next.updated_at);
            onSaved(next);
          }}
        />
      )}
      <EditorControlConfig
        document={{
          ...styleDocument,
          reuse: blockFeedback.reuse,
          remove: blockFeedback.remove,
        }}
        compact={panels.compact}
        locked={locked || stale}
        map={map}
        onField={
          panels.phone || panels.right ? () => openTools("Fields") : undefined
        }
      />
      <PageBreakController
        content={p.content}
        onChange={(content) => change({ content })}
      />
      {editClientOpen && (
        <EditClientModal
          client={p.client}
          onClose={() => setEditClientOpen(false)}
          onSaved={async () => {
            const current = await api<Proposal>(`/api/proposals/${p.id}`);
            revision.current = current.revision;
            latest.current = { ...current, quote: editorQuote(current) };
            setP(latest.current);
            setLastSaved(current.updated_at);
            onSaved(current);
          }}
        />
      )}
      {reassignOpen && (
        <ReassignDialog
          proposal={p}
          onClose={() => setReassignOpen(false)}
          onChanged={(rows) => {
            const next = rows[0];
            if (next) {
              revision.current = next.revision;
              latest.current = next;
              setP(next);
              onSaved(next);
            }
          }}
        />
      )}
      <EditorHeader
        onReplaceBlock={
          !locked && live && p.content.some((b) => b.saved_block_id)
            ? async () => {
                if (await save()) setReplaceBlockOpen(true);
              }
            : undefined
        }
        onReassign={
          user && canReassign(p, user)
            ? async () => {
                if (await save()) setReassignOpen(true);
              }
            : undefined
        }
        beforeLeave={() => {
          allowLeave.current = true;
        }}
        className="quote-editor-top"
        phone={panels.phone}
        editingTitle={
          selection.selected
            ? (sections.find((s) => s.indices.includes(selectedIndex))?.title ??
              "Block")
            : undefined
        }
        onDone={() => {
          selection.clear();
          (document.activeElement as HTMLElement)?.blur();
        }}
        onSections={() => setOutlineOpen(true)}
        tablet={panels.viewportWidth >= 700 && panels.viewportWidth < 960}
        compact={panels.viewportWidth < 1180}
        locked={locked}
        published={live ? "live" : "draft"}
        liveLabel={
          live
            ? `Sent · ${p.first_viewed_at ? `Viewed ${readableDate(p.first_viewed_at, p.workspace_settings?.timezone)}` : "Not viewed"}`
            : closed
              ? p.status === "expired"
                ? "Expired"
                : "Lost"
              : undefined
        }
        notLiveReason={p.live_blockers?.[0]}
        primaryLabel={
          locked
            ? "Duplicate as new draft"
            : closed
              ? "Reopen"
              : live
                ? "Copy client link"
                : "Review & send"
        }
        onPrimary={async () => {
          if (locked) {
            try {
              const next = await post<Proposal>(
                `/api/proposals/${p.id}/actions`,
                { revision: revision.current, action: "duplicate" },
              );
              if (recoveryRef.current) {
                const edits = editable(recoveryRef.current as Proposal);
                await api(`/api/proposals/${next.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    ...edits,
                    valid_until: next.valid_until,
                    revision: next.revision,
                  }),
                });
              }
              location.href = `/proposals/${next.id}`;
            } catch (e) {
              setError((e as Error).message);
            }
            return;
          }
          if (!(await save())) return;
          if (closed) {
            try {
              const next = await post<Proposal>(
                `/api/proposals/${p.id}/actions`,
                { revision: revision.current, action: "mark_sent" },
              );
              revision.current = next.revision;
              latest.current = next;
              setP(next);
              onSaved(next);
              setError("");
            } catch (e) {
              setError((e as Error).message);
              openTools("Send");
            }
          } else if (live) {
            try {
              await navigator.clipboard.writeText(
                new URL(`/p/${p.token}`, appUrl).href,
              );
              setLinkCopied(true);
            } catch {
              blockFeedback.error("Unable to copy the client link");
            }
          } else openTools("Send");
        }}
        stale={stale}
        recovered={!!recovery}
        aiPending={reviewCount}
        hadAi={p.content.some((b) => b.ai_review)}
        onNextAi={showReview}
        onPreviewPdf={() => {
          paper.current?.dispatchEvent(new Event("pagination-flush"));
          setPdfOpen(true);
        }}
        onPreviewClient={async () => {
          if (await save())
            window.open(`/p/${p.id}?preview=1`, "_blank", "noopener");
        }}
        onReviewSend={() => openTools("Send")}
        title={p.title}
        backLabel="Proposals"
        backHref="/proposals"
        save={save}
        dirty={dirty}
        saving={saving}
        error={error}
        offline={offline}
        lastSaved={lastSaved}
        retry={() => void (stale ? reloadConflict() : save())}
      />
      {panels.phone && offline && (
        <Banner tone="warning" title="You’re offline. Sending is paused.">
          {deviceSaved
            ? "Your changes are kept on this device."
            : "Keep this page open to retain your changes."}{" "}
          We’ll save them when you’re back online.
        </Banner>
      )}
      {linkCopied && <ToastSurface>Client link copied</ToastSurface>}
      {(p.unpublished_work || (locked && recovery)) && (
        <p className="editor-retained-work" role="status">
          Unpublished changes were not part of the signed version
        </p>
      )}
      {stale && (
        <EditorNotice kind="stale">
          <span title="This proposal changed in another tab or by another person.">
            This proposal changed in another tab or by another person.
          </span>
          <EditorButton variant="primary" onClick={() => void reloadConflict()}>
            Reload
          </EditorButton>
        </EditorNotice>
      )}
      {recovery && !stale && (
        <EditorNotice kind="recovered">
          <span title="Your unsaved edits were kept as a suggestion.">
            We found unsaved changes from{" "}
            {recovery.updated_at
              ? new Date(recovery.updated_at).toLocaleString()
              : "this device"}
            .
          </span>
          <details>
            <Disclosure>See my saved changes</Disclosure>
            <div className="recovery-copy">
              <h3>{recovery.title}</h3>
              {recovery.content?.map((b, n) => (
                <p key={n}>
                  {blockText(b) ||
                    (b.type === "contract" &&
                      b.clauses?.map((c) => c.heading).join(" · ")) ||
                    "Document section"}
                </p>
              ))}
              <p>
                {withCount(recovery.quote?.length ?? 0, "saved quote item")}.
              </p>
            </div>
          </details>
          <EditorButton
            variant="primary"
            disabled={locked}
            onClick={async () => {
              const edits = editable(
                staleRef.current ? latest.current : (recovery as Proposal),
              );
              if (staleRef.current && !(await reloadConflict())) return;
              dropPagePlan();
              change(edits);
              setRecovery(null);
            }}
          >
            Keep
          </EditorButton>
          <EditorButton
            onClick={async () => {
              if (staleRef.current && !(await reloadConflict())) return;
              localStorage.removeItem(cacheKey);
              setRecovery(null);
            }}
          >
            Discard
          </EditorButton>
        </EditorNotice>
      )}
      {error && !stale && (
        <EditorNotice kind="error">
          <span title={error}>
            {isStaffSignedOut(error) ? (
              error
            ) : (
              <>Your changes are kept here. {error}</>
            )}
          </span>
          {isStaffSignedOut(error) && <StaffSignIn />}
          <EditorButton variant="primary" onClick={() => void save()}>
            Retry
          </EditorButton>
        </EditorNotice>
      )}
      {p.creation_warnings?.length ? (
        <Banner tone="warning" title="Template defaults skipped">
          {p.creation_warnings.join("; ")}
        </Banner>
      ) : null}
      <div
        className="editor-layout"
        ref={panels.container}
        style={{
          gridTemplateColumns: panels.columns,
        }}
      >
        {!panels.phone ? (
          <SectionsPanel
            open={panels.left}
            mode={panels.mode}
            onToggle={toggleLeft}
            onCloseComplete={() => {
              const id = pendingOutline.current;
              pendingOutline.current = null;
              if (id) focusBlock(id);
            }}
          >
            <ReadOnlyRegion locked={stale || locked}>{outline}</ReadOnlyRegion>
          </SectionsPanel>
        ) : null}
        <section
          className="editor-document-region"
          aria-label="Proposal document"
        >
          <ReadOnlyRegion locked={stale || locked}>
            {blockFeedback.feedback}
            <div className="pdf-paper-viewport">
              <div
                className="pdf-paper-size"
                style={
                  false
                    ? {
                        width: 816 * panels.scale,
                        height: panels.height * panels.scale,
                      }
                    : undefined
                }
              >
                <article
                  ref={paper}
                  data-sheet-view="true"
                  data-editor-density={
                    resolveStyles(
                      p.workspace_settings,
                      p.template_style_overrides,
                      p.style_overrides,
                    ).layout?.density ?? "comfortable"
                  }
                  style={
                    {
                      "--accent": current.workspace_settings?.accent_colour,
                      "--editor-ui-scale": false ? 1 / panels.scale : 1,
                      "--page-margin-top": `${pageMetrics(resolveStyles(p.workspace_settings, p.template_style_overrides, p.style_overrides)).margins.top * 96}px`,
                      "--page-margin-right": `${pageMetrics(resolveStyles(p.workspace_settings, p.template_style_overrides, p.style_overrides)).margins.right * 96}px`,
                      "--page-margin-bottom": `${pageMetrics(resolveStyles(p.workspace_settings, p.template_style_overrides, p.style_overrides)).margins.bottom * 96}px`,
                      "--page-margin-left": `${pageMetrics(resolveStyles(p.workspace_settings, p.template_style_overrides, p.style_overrides)).margins.left * 96}px`,
                      transform: false ? `scale(${panels.scale})` : undefined,
                      transformOrigin: "top left",
                      minHeight: false
                        ? `max(var(--page-sheets-height, 0px), ${(browserPages?.plan.pages ?? 1) * 1080 - 24}px)`
                        : undefined,
                    } as CSSProperties
                  }
                  className="paper editor-paper proposal-typography document-reading"
                >
                  <PagedPaper
                    onBandReflow={(header_footer, withContentEdit) => {
                      const step = history.controller.engine.past.at(-1);
                      if (
                        withContentEdit &&
                        step &&
                        JSON.stringify(step.after) ===
                          JSON.stringify(editable(latest.current))
                      ) {
                        step.after = { ...step.after, header_footer };
                        applyChange({ header_footer });
                      } else change({ header_footer });
                      return history.controller.engine.lastId;
                    }}
                    paper={paper}
                    styles={resolveStyles(
                      p.workspace_settings,
                      p.template_style_overrides,
                      p.style_overrides,
                    )}
                    enabled={
                      panels.printMode &&
                      !(
                        panels.phone &&
                        selection.selected &&
                        !selection.selectMode
                      )
                    }
                    sheets
                    headerFooter={bands}
                    onHeaderFooter={
                      !locked && !stale
                        ? (header_footer) => change({ header_footer })
                        : undefined
                    }
                    values={map}
                    logoIcon={
                      p.workspace_settings?.logo_icon
                        ? `/api/workspace-icon?size=128&v=${encodeURIComponent(p.workspace_settings!.logo_icon!.path)}`
                        : undefined
                    }
                    logo={
                      p.workspace_settings?.logo
                        ? `/api/proposals/${p.id}/preview-logo`
                        : undefined
                    }
                    content={p.content}
                    contentKey={JSON.stringify([
                      p.title,
                      printView(p.content, p.quote),
                      p.valid_until,
                      p.style_overrides,
                      p.template_style_overrides,
                      p.cover,
                      bands,
                    ])}
                    onPagination={receivePagination}
                  />
                  <style>
                    {fontCss(p.workspace_settings)}
                    {styleFontFaces(
                      resolveStyles(
                        p.workspace_settings,
                        p.template_style_overrides,
                        p.style_overrides,
                      ),
                    )}
                    {documentStyleCss(
                      resolveStyles(
                        p.workspace_settings,
                        p.template_style_overrides,
                        p.style_overrides,
                      ),
                      p.workspace_settings?.accent_colour,
                      p.content,
                    )}
                  </style>
                  {p.content.length > 0 && (
                    <DocumentCover
                      contentHeight={
                        pageGeometry(
                          resolveStyles(
                            p.workspace_settings,
                            p.template_style_overrides,
                            p.style_overrides,
                          ),
                          p.header_footer,
                          1,
                        ).content.height
                      }
                      paperInsets={
                        pageGeometry(
                          resolveStyles(
                            p.workspace_settings,
                            p.template_style_overrides,
                            p.style_overrides,
                          ),
                          p.header_footer,
                          1,
                        ).margins
                      }
                      title={p.title}
                      cover={p.cover}
                      map={map}
                      onCover={
                        locked ? undefined : (cover) => change({ cover })
                      }
                      workspace={
                        panels.printMode
                          ? p.workspace_settings?.company_name
                          : undefined
                      }
                      accent={p.workspace_settings?.accent_colour}
                      logoIcon={
                        p.workspace_settings?.logo_icon
                          ? `/api/workspace-icon?size=128&v=${encodeURIComponent(p.workspace_settings!.logo_icon!.path)}`
                          : undefined
                      }
                      logo={
                        p.workspace_settings?.logo
                          ? `/api/proposals/${p.id}/preview-logo`
                          : undefined
                      }
                      company={p.client.company}
                      sender={map["sender.name"]}
                      validUntil={p.valid_until}
                      timezone={p.workspace_settings?.timezone}
                      onTitle={
                        locked ? undefined : (title) => change({ title })
                      }
                    />
                  )}
                  {firstBlock}
                  <Reorder
                    ids={p.content.map((b, n) => `block-${b.id ?? n}`)}
                    documentDrop={
                      locked || stale
                        ? undefined
                        : {
                            paper,
                            content: p.content,
                            onMoveAt: moveAt,
                          }
                    }
                    onMove={(from, to) =>
                      move((content) =>
                        moveDocumentBlock(content, from.slice(6), to.slice(6)),
                      )
                    }
                  >
                    {sections.map((s, n) => (
                      <div
                        data-phone-section={n}
                        data-phone-section-active={
                          sections.findIndex((s) =>
                            s.indices.includes(selectedIndex),
                          ) === n
                        }
                        className={section === n ? "phone-active-section" : ""}
                        key={s.id}
                      >
                        {sectionEditor(s, n)}
                      </div>
                    ))}{" "}
                  </Reorder>
                  <p className="muted document-end">
                    {p.valid_until && (
                      <>
                        Valid until{" "}
                        {readableDate(
                          p.valid_until,
                          p.workspace_settings?.timezone,
                        )}{" "}
                        ·{" "}
                      </>
                    )}
                    From {settings?.company_name}
                  </p>
                  <DocumentPagination pagination={browserPages?.plan} />
                </article>
              </div>
            </div>
          </ReadOnlyRegion>
        </section>
        {
          <ToolsPanel
            tab={tab as EditorTab}
            open={panels.phone ? phoneDrawer : panels.right}
            mode={panels.phone ? "sheet" : panels.mode}
            onTab={openTools}
            onToggle={toggleRight}
            sheetTitle={
              tab === "Styles" &&
              selection.selected &&
              isColumnStyleKey(selection.selected)
                ? "Column style"
                : undefined
            }
            totals={`${money(totals(items).one_time_total, p.currency)} · ${money(totals(items).monthly_total, p.currency)}/mo`}
            onCloseComplete={() => {
              const path = pendingField.current;
              pendingField.current = null;
              if (path) fields?.insert(path);
              if (pendingReview.current) {
                pendingReview.current = false;
                requestAnimationFrame(revealReview);
              }
            }}
          >
            {panelBody}
          </ToolsPanel>
        }
      </div>
      {pdfOpen && (
        <PdfPreviewViewer
          load={pdfPreview.ensure}
          close={() => setPdfOpen(false)}
        />
      )}
      {phoneOutlineOpen && (
        <Sheet
          title="Sections"
          close={() => setOutlineOpen(false)}
          extra="sections-overlay"
          onCloseComplete={() => {
            const id = pendingOutline.current;
            pendingOutline.current = null;
            if (id) focusBlock(id);
          }}
        >
          <div className="editor-outline outline-overlay-content">
            {outline}
          </div>
        </Sheet>
      )}
      {insertAt !== null && (
        <BlockMenu
          anchor={insertAnchor}
          hasPricing={p.content.some((b) => b.type === "pricing_table")}
          saved={library}
          signatureRoles={p.content
            .filter((b) => b.type === "signature_block")
            .map((b) => b.role!)}
          onChoose={insertBlock}
          onClose={() => {
            setInsertAt(null);
            setReplaceEmpty(false);
          }}
        />
      )}
      {clauseEdit &&
        (() => {
          const b = p.content[clauseEdit.block],
            c = b?.clauses?.[clauseEdit.clause];
          if (!c) return null;
          const patch = (update: Partial<typeof c>) =>
            patchBlock({
              ...b,
              contract_edited: true,
              clauses: b.clauses!.map((v, n) =>
                n === clauseEdit.clause ? { ...v, ...update } : v,
              ),
            });
          return (
            <Sheet title="Clause settings" close={() => setClauseEdit(null)}>
              <Field label="Clause">
                <Select
                  value={clauseEdit.clause}
                  onChange={(e) =>
                    setClauseEdit({
                      ...clauseEdit,
                      clause: Number(e.target.value),
                    })
                  }
                >
                  {b.clauses!.map((clause, k) => (
                    <option key={clause.id} value={k}>
                      {resolvedEditorText(clause.heading, map)}
                      {clause.show_when &&
                      !items.some(
                        (i) =>
                          i.pricing_item_id ===
                            clause.show_when?.pricing_item_id &&
                          (!i.optional || i.default_selected),
                      )
                        ? " — hidden for current choices"
                        : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Clause heading">
                <PlainClauseText
                  label="Clause heading"
                  value={c.heading}
                  map={map}
                  multiline={false}
                  onChange={(heading) => patch({ heading })}
                />
              </Field>
              <Field label="Clause body">
                <PlainClauseText
                  label="Clause body"
                  value={c.body}
                  map={map}
                  onChange={(body) => patch({ body })}
                />
              </Field>
              <Field label="Show when">
                <Select
                  value={c.show_when?.pricing_item_id ?? ""}
                  onChange={(e) =>
                    patch({
                      show_when: e.target.value
                        ? {
                            kind: "item_selected",
                            pricing_item_id: e.target.value,
                          }
                        : null,
                    })
                  }
                >
                  <option value="">Always</option>
                  {sellableCatalogue(catalog).map((i) => (
                    <option key={i.id} value={i.id}>
                      {itemDisplayName(i)} is selected
                    </option>
                  ))}
                </Select>
              </Field>
            </Sheet>
          );
        })()}
      {reference && (
        <Sheet
          title="Pricing reference"
          close={() => setReference(false)}
          extra="reference-sheet"
        >
          {refPanel}
        </Sheet>
      )}
    </div>
  );
}

export function QuoteEditor(props: ComponentProps<typeof QuoteEditorContent>) {
  return (
    <BlockScope>
      <QuoteEditorContent {...props} />
    </BlockScope>
  );
}
