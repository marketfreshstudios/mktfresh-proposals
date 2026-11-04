"use client";
import { Disclosure } from "./ui";
import { SelectableImage } from "./editor/selectable-image";
import { isStaffSignedOut, StaffSignIn } from "./staff-sign-in";
import { useBandEditing } from "./editor/band-editing";
import { bandPages, resolvedBandPages } from "../lib/band-overrides";
import { resetBandSettings } from "./editor/reset-band-settings";
import { defaultHeaderFooter } from "../lib/page-bands";
import {
  sublineLabel,
  ambiguousSublines,
  removeSubline,
} from "../lib/subline-label";
import { pairSignatureNodes } from "./signature-pair";
import { signatureHtml } from "../lib/signature-presentation";
import { DocumentTotals } from "./document-totals";
import { EditorHeader, PanelChevron, useCurrentState } from "./editor-header";
import { ToolsPanel, PanelTabs, type EditorTab } from "./editor/tools-panel";
import { SectionsPanel } from "./editor/sections-panel";
import { ReadOnlyRegion } from "./editor/read-only-region";
import { EditorNotice } from "./editor/editor-notice";
import { EditorButton } from "./editor/editor-button";
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
import {
  orderedItems,
  catalogQuoteItem,
  draftItems,
  quoteRange,
} from "../lib/quote-model";
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
  catalog: Item[];
  families: { id: string; name: string; active: boolean }[];
  library: { id: string; name: string; block: Block }[];
  onSaved: (p: Proposal) => void;
  staff?: { user_id: string; display_name: string; email: string }[];
  user?: Actor;
  documents?: ReferenceDocument[];
}) {
  const blockFeedback = useBlockFeedback();
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
    [expandedItem, setExpandedItem] = useState<string | null>(
      initial.quote[0]?.id ?? null,
    ),
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
  const panels = useEditorPanels(user?.actor ?? "local", paper, true, true);
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
          subject: emailSubject,
          body: note,
          ...(!protectedLink
            ? { password: null }
            : password
              ? { password }
              : {}),
        });
        location.href = `/proposals/${p.id}`;
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
    blockSpaces = documentSpacing(
      p.content,
      resolveStyles(
        current.workspace_settings,
        p.template_style_overrides,
        p.style_overrides,
      ),
    ),
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
    ready = readiness(current, catalog, new Date(), confirmed);
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
  function updateItem(id: string, update: Partial<QuoteItem>) {
    setItems(items.map((i) => (i.id === id ? { ...i, ...update } : i)));
  }
  function defaultItem(item: QuoteItem, value: boolean) {
    setItems(
      items.map((i) =>
        i.id === item.id
          ? { ...i, default_selected: value }
          : value &&
              item.choice_group_id &&
              i.choice_group_id === item.choice_group_id
            ? { ...i, default_selected: false }
            : i,
      ),
    );
  }
  function unlink(group: string) {
    setItems(
      items.map((i) =>
        i.choice_group_id === group ? { ...i, choice_group_id: null } : i,
      ),
    );
  }
  function link(item: QuoteItem, targetId: string) {
    const target = items.find((i) => i.id === targetId);
    if (!target) return;
    const group = target.choice_group_id ?? uid();
    setItems(
      items.map((i) =>
        i.id === item.id || i.id === target.id
          ? {
              ...i,
              optional: true,
              choice_group_id: group,
              default_selected:
                i.id === target.id ? target.default_selected : false,
            }
          : i,
      ),
    );
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

  const doc = documents.find((d) => d.id === documentId),
    range = quoteRange(items);
  const refPanel = (
    <div className="stack">
      <p className="eyebrow">Pricing reference · read only</p>
      {documents.length > 1 && (
        <Field label="Document">
          <select
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
          >
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
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
  function itemCard(i: QuoteItem) {
    const expanded = expandedItem === i.id;
    const tag = i.choice_group_id
      ? `Choose one${i.default_selected ? " · default" : ""}`
      : i.source === "custom" && !i.optional
        ? "Required · custom line"
        : i.optional
          ? `Optional · ${i.default_selected ? "ticked for client" : "not ticked"}`
          : "Required";
    const amount = i.sublines
      .map(
        (s) =>
          `${money(s.amount * s.qty, p.currency)}${s.interval === "month" ? "/mo" : s.interval === "year" ? "/yr" : ""}`,
      )
      .join(" + ");
    const aiPrice =
      (i.ai_entered || p.ai_unreviewed) &&
      i.sublines.some(
        (s) =>
          s.list_amount !== null &&
          s.amount !== s.list_amount &&
          !i.price_review?.[s.id],
      );
    return (
      <section
        className="quote-item quote-row"
        data-expanded={expanded}
        data-details={itemDetails === i.id}
        data-default={i.default_selected}
        data-optional={i.optional}
        key={i.id}
      >
        <button
          type="button"
          className="quote-row-toggle"
          aria-expanded={expanded}
          aria-controls={`quote-body-${i.id}`}
          onClick={() => setExpandedItem(expanded ? null : i.id)}
        >
          <span className="quote-row-caption">
            <strong>{i.name || "Untitled item"}</strong>
            <small data-custom={i.source === "custom" && !i.optional}>
              {tag}
            </small>
          </span>
          {aiPrice && (
            <span
              className="quote-ai-dot"
              title="AI price differs from product list"
            />
          )}
          <strong className="quote-row-amount">{amount}</strong>
          <Icon
            name={expanded ? "chevron-up" : "chevron-down"}
            className="disclosure-icon"
          />
        </button>
        {expanded && (
          <div id={`quote-body-${i.id}`} className="quote-row-body">
            <input
              className="item-title"
              aria-label="Item name"
              value={i.name}
              onChange={(e) => updateItem(i.id, { name: e.target.value })}
            />
            <textarea
              aria-label="Description"
              placeholder="Description"
              rows={2}
              value={i.description}
              onChange={(e) =>
                updateItem(i.id, { description: e.target.value })
              }
            />
            {i.sublines.map((s) => (
              <div className="subline" key={s.id}>
                {i.sublines.length > 1 && (
                  <button
                    type="button"
                    className="subline-remove"
                    title={`Remove sub-line ${sublineLabel(s)}`}
                    aria-label={`Remove sub-line ${sublineLabel(s)}`}
                    onClick={() =>
                      updateItem(i.id, { sublines: removeSubline(i, s.id) })
                    }
                  >
                    ×
                  </button>
                )}
                <div className="subline-grid">
                  <div className="subline-label">
                    {i.sublines.length === 1 ? (
                      <span>Shown as the item price</span>
                    ) : (
                      <input
                        aria-label={`Sub-line label for ${i.name}`}
                        placeholder={sublineLabel({ ...s, label: "" })}
                        value={s.label ?? ""}
                        onChange={(e) =>
                          updateItem(i.id, {
                            sublines: i.sublines.map((v) =>
                              v.id === s.id
                                ? { ...v, label: e.target.value }
                                : v,
                            ),
                          })
                        }
                      />
                    )}
                  </div>
                  <Field label={`Amount · ${p.currency}`}>
                    <span className="currency-input">
                      <span aria-hidden="true">
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: p.currency,
                        })
                          .formatToParts(0)
                          .find((part) => part.type === "currency")?.value ??
                          p.currency}
                      </span>
                      <input
                        aria-label={`Amount ${s.label || i.name}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={s.amount / 100}
                        onChange={(e) =>
                          updateItem(i.id, {
                            sublines: i.sublines.map((v) =>
                              v.id === s.id
                                ? {
                                    ...v,
                                    amount: Math.round(
                                      Number(e.target.value) * 100,
                                    ),
                                  }
                                : v,
                            ),
                            price_review: Object.fromEntries(
                              Object.entries(i.price_review ?? {}).filter(
                                ([key]) => key !== s.id,
                              ),
                            ),
                          })
                        }
                      />
                    </span>
                  </Field>
                  <Field label="Qty">
                    <input
                      aria-label={`Quantity ${s.label || i.name}`}
                      type="number"
                      min="1"
                      max="10000"
                      value={s.qty}
                      onChange={(e) =>
                        updateItem(i.id, {
                          sublines: i.sublines.map((v) =>
                            v.id === s.id
                              ? { ...v, qty: Number(e.target.value) }
                              : v,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="Interval">
                    <select
                      aria-label={`Interval ${s.label || i.name}`}
                      value={s.interval}
                      onChange={(e) =>
                        updateItem(i.id, {
                          sublines: i.sublines.map((v) =>
                            v.id === s.id
                              ? {
                                  ...v,
                                  interval: e.target.value as typeof s.interval,
                                }
                              : v,
                          ),
                        })
                      }
                    >
                      <option value="one_time">One-time</option>
                      <option value="month">Monthly</option>
                      <option value="year">Yearly</option>
                    </select>
                  </Field>
                </div>
                {(i.ai_entered || p.ai_unreviewed) &&
                  s.list_amount !== null &&
                  s.amount !== s.list_amount &&
                  !i.price_review?.[s.id] && (
                    <div className="price-review">
                      <p>
                        Claude entered {money(s.amount, p.currency)}. The
                        product list price is {money(s.list_amount, p.currency)}
                        .
                      </p>
                      <Button
                        onClick={() =>
                          updateItem(i.id, {
                            sublines: i.sublines.map((v) =>
                              v.id === s.id
                                ? { ...v, amount: s.list_amount! }
                                : v,
                            ),
                            price_review: { ...i.price_review, [s.id]: "list" },
                          })
                        }
                      >
                        Use {money(s.list_amount, p.currency)}
                      </Button>
                      <Button
                        onClick={() =>
                          updateItem(i.id, {
                            price_review: { ...i.price_review, [s.id]: "keep" },
                          })
                        }
                      >
                        Keep {money(s.amount, p.currency)}
                      </Button>
                    </div>
                  )}
                <details
                  open={itemDetails === i.id}
                  className="quote-mapping-details"
                >
                  <Disclosure>Billing mapping</Disclosure>
                  <Field label="Stripe lookup key">
                    <input
                      value={s.stripe_lookup_key ?? ""}
                      onChange={(e) =>
                        updateItem(i.id, {
                          sublines: i.sublines.map((v) =>
                            v.id === s.id
                              ? {
                                  ...v,
                                  stripe_lookup_key: e.target.value || null,
                                }
                              : v,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="QuickBooks item">
                    <input
                      value={s.qbo_item_ref ?? ""}
                      onChange={(e) =>
                        updateItem(i.id, {
                          sublines: i.sublines.map((v) =>
                            v.id === s.id
                              ? { ...v, qbo_item_ref: e.target.value || null }
                              : v,
                          ),
                        })
                      }
                    />
                  </Field>
                </details>
              </div>
            ))}
            {(i.schedule || i.min_term_months) && (
              <p className="quote-plan-note">
                {i.schedule && (
                  <>
                    {money(
                      i.sublines.find((s) => s.interval !== "one_time")
                        ?.amount ?? 0,
                      p.currency,
                    )}
                    /mo for {i.schedule.after_paid_invoices} paid invoices, then{" "}
                    {money(i.schedule.then.amount, p.currency)}/mo.{" "}
                  </>
                )}
                {i.min_term_months && (
                  <>{i.min_term_months}-month minimum commitment.</>
                )}
              </p>
            )}
            {ambiguousSublines(i) && (
              <p className="subline-warning">
                Name these sub-lines so the client can tell them apart.
              </p>
            )}
            <div className="item-options">
              <label className="check">
                <input
                  type="checkbox"
                  role="switch"
                  checked={i.optional}
                  onChange={(e) => {
                    if (!e.target.checked && i.choice_group_id) {
                      setItems(
                        items.map((v) =>
                          v.choice_group_id === i.choice_group_id
                            ? {
                                ...v,
                                choice_group_id: null,
                                ...(v.id === i.id
                                  ? { optional: false, default_selected: true }
                                  : {}),
                              }
                            : v,
                        ),
                      );
                    } else
                      updateItem(i.id, {
                        optional: e.target.checked,
                        default_selected: true,
                      });
                  }}
                />
                Optional
              </label>
              {i.optional && (
                <label className="check">
                  <input
                    type={i.choice_group_id ? "radio" : "checkbox"}
                    name={i.choice_group_id ?? i.id}
                    checked={i.default_selected}
                    onChange={(e) => defaultItem(i, e.target.checked)}
                  />
                  {i.choice_group_id
                    ? "Selected for client"
                    : "Ticked for client"}
                </label>
              )}
            </div>
            {!i.choice_group_id && i.optional ? (
              <Field label="Link as alternative">
                <select value="" onChange={(e) => link(i, e.target.value)}>
                  <option value="">Choose another optional item</option>
                  {items
                    .filter((v) => v.id !== i.id && v.optional)
                    .map((v) => (
                      <option value={v.id} key={v.id}>
                        {v.name}
                      </option>
                    ))}
                </select>
              </Field>
            ) : null}
            {i.source === "custom" &&
              itemDetails === i.id &&
              i.sublines.some((s) => s.interval !== "one_time") && (
                <Field label="Custom family">
                  <select
                    value={i.custom_family_id ?? ""}
                    onChange={(e) =>
                      updateItem(i.id, {
                        custom_family_id: e.target.value || null,
                      })
                    }
                  >
                    <option value="">Choose a family</option>
                    {families
                      .filter((f) => f.active)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
            <details
              open={itemDetails === i.id}
              className="quote-mapping-details"
            >
              <Disclosure>Plan terms</Disclosure>
              {i.schedule && (
                <p>
                  {money(
                    i.sublines.find((s) => s.interval !== "one_time")?.amount ??
                      0,
                    p.currency,
                  )}{" "}
                  for {i.schedule.after_paid_invoices} paid invoices, then{" "}
                  {money(i.schedule.then.amount, p.currency)}.
                </p>
              )}
              {i.min_term_months && (
                <p>{i.min_term_months}-month minimum commitment</p>
              )}
              <pre>{JSON.stringify(i.plan_terms, null, 2)}</pre>
              <small>Plan terms come from Products.</small>
            </details>

            <footer className="quote-item-footer">
              {" "}
              <Button
                variant="ghost"
                onClick={() =>
                  updateItem(i.id, {
                    sublines: [
                      ...i.sublines,
                      {
                        id: uid(),
                        amount: 0,
                        list_amount: null,
                        interval: "one_time",
                        qty: 1,
                        stripe_lookup_key: null,
                        qbo_item_ref: null,
                      },
                    ],
                  })
                }
              >
                + Sub-line
              </Button>
              <button
                type="button"
                aria-expanded={itemDetails === i.id}
                onClick={() =>
                  setItemDetails(itemDetails === i.id ? null : i.id)
                }
              >
                Details
              </button>
              <span />{" "}
              <Button
                variant="ghost"
                aria-label={`Remove ${i.name}`}
                onClick={() => {
                  setItems(items.filter((v) => v.id !== i.id));
                }}
              >
                Remove
              </Button>
            </footer>
          </div>
        )}
      </section>
    );
  }
  const units = Array.from(
      new Set(items.map((i) => i.choice_group_id ?? i.id)),
    ),
    unitItems = (id: string) =>
      items.filter((i) => (i.choice_group_id ?? i.id) === id);
  const quotePanel = (
    <div className="quote-panel stack">
      <p className="muted">
        Enter agreed prices. The app never sets prices. Drag ⋮⋮ to reorder; the
        client sees this order.
      </p>
      <div className="quote-cards">
        <Reorder
          ids={units}
          onMove={(from, to) => {
            const order = arrayMove(
              units,
              units.indexOf(from),
              units.indexOf(to),
            );
            setItems(order.flatMap(unitItems));
          }}
        >
          {units.map((id) => (
            <Sortable
              key={id}
              id={id}
              label={
                unitItems(id)[0].choice_group_id
                  ? "choice group"
                  : unitItems(id)[0].name
              }
            >
              {unitItems(id)[0].choice_group_id ? (
                <div className="editor-choice-group">
                  <header>
                    <h3>Choose one</h3>
                    <Button variant="ghost" onClick={() => unlink(id)}>
                      Unlink
                    </Button>
                  </header>
                  <Reorder
                    ids={unitItems(id).map((i) => i.id)}
                    onMove={(from, to) => {
                      const options = unitItems(id),
                        next = arrayMove(
                          options,
                          options.findIndex((i) => i.id === from),
                          options.findIndex((i) => i.id === to),
                        );
                      setItems(
                        units.flatMap((u) => (u === id ? next : unitItems(u))),
                      );
                    }}
                  >
                    {unitItems(id).map((i) => (
                      <Sortable key={i.id} id={i.id} label={i.name}>
                        {itemCard(i)}
                      </Sortable>
                    ))}
                  </Reorder>
                </div>
              ) : (
                itemCard(unitItems(id)[0])
              )}
            </Sortable>
          ))}
        </Reorder>
        <div className="quote-add-row">
          <Field label="+ Add product">
            <select
              value=""
              onChange={(e) => {
                const item = catalog.find((i) => i.id === e.target.value);
                if (item) addItem(item);
              }}
            >
              <option value="">+ Add product</option>
              {sellableCatalogue(catalog)
                .filter((c) => !items.some((i) => i.pricing_item_id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {itemDisplayName(c)}
                  </option>
                ))}
            </select>
          </Field>
          <Button onClick={() => addItem()}>+ Custom</Button>
        </div>
      </div>
      <footer>
        <p className="eyebrow">Client sees by default</p>
        <Totals lines={items} currency={p.currency} />
        <p className="muted">
          Across all choices · {money(range.min.one_time_total, p.currency)}–
          {money(range.max.one_time_total, p.currency)} one-time ·{" "}
          {money(range.min.monthly_total, p.currency)}–
          {money(range.max.monthly_total, p.currency)}/mo
          {items.some((i) => i.sublines.some((s) => s.interval === "year")) &&
            ` · ${money(range.min.yearly_total, p.currency)}–${money(range.max.yearly_total, p.currency)}/yr`}
        </p>
      </footer>
    </div>
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
  const sendPanel = (
    <div className="send-panel stack">
      <ul className="send-checklist">
        {ready.errors
          .filter((e) => !e.startsWith("Confirm review of AI changes"))
          .map((e, n) => (
            <li className="readiness-row blocker" key={n}>
              <span className="readiness-badge" aria-hidden="true">
                !
              </span>
              <div>
                <p>
                  <strong>Needs attention.</strong> {e}
                </p>
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
              ✓
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
          !
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
      <Field label="Valid until">
        <ValidityField
          timezone={settings?.timezone ?? "UTC"}
          value={p.valid_until}
          onChange={(valid_until) => change({ valid_until })}
        />
      </Field>
      <Field label="From">
        <select value={sender} onChange={(e) => setSender(e.target.value)}>
          {staff.map((s) => (
            <option key={s.user_id} value={s.user_id}>
              {s.display_name} · {settings?.company_name} &lt;{s.email}&gt;
            </option>
          ))}
        </select>
      </Field>
      <Field label="To">
        <input
          value={`${p.client.first_name} ${p.client.last_name} <${p.client.email}>`}
          readOnly
        />
      </Field>
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
        <a href="/studio/emails/proposal_sent">Proposal sent email</a>. Edits
        here apply only to this send.
      </p>
      <label className="check">
        <input
          type="checkbox"
          role="switch"
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
        The client link is added automatically. From must match{" "}
        {settings?.sending_domain || "the workspace’s verified domain"}.
      </small>
      <footer className="send-panel-footer">
        <div className="actions">
          <Button
            onClick={async () => {
              if (await save())
                window.open(`/p/${p.id}?preview=1`, "_blank", "noopener");
            }}
          >
            Preview as client
          </Button>
          <Button
            variant="primary"
            disabled={
              !ready.ready ||
              !emailLoaded ||
              !!emailValidation ||
              !!emailError ||
              stale ||
              offline ||
              sending ||
              (protectedLink && !p.password_hash && password.length < 8)
            }
            busy={sending}
            onClick={() => void sendProposal()}
          >
            Send to {p.client.first_name || "client"}
          </Button>
        </div>
        <p className="send-blocked-reason" role="status">
          {offline
            ? "Reconnect to send"
            : (ready.errors[0] ?? (emailError || emailValidation || ""))}
        </p>
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
      `block-${b.id}` === selection.selected ||
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
        {sections.length - pending.length} of {sections.length} sections
        reviewed
      </p>
      <progress
        value={sections.length - pending.length}
        max={sections.length || 1}
      />
    </>
  );
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
      ) : tab === "Styles" ? (
        <ProposalStyles
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
    const style = (level: TextLevel, text?: string) => {
      const next = p.content.map((v, j) =>
        j === n ? convertTextStyle(b, level, text) : v,
      );
      change({ content: next });
      setSection(contentSections(next).findIndex((s) => s.indices.includes(n)));
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLElement>(
              `[data-block-id="block-${b.id ?? n}"] textarea,[data-block-id="block-${b.id ?? n}"] .tiptap`,
            )
            ?.focus({ preventScroll: true }),
        ),
      );
    };
    return (
      <Sortable
        block
        id={`block-${b.id ?? n}`}
        spaceBefore={blockSpaces[b.id ?? String(n)]}
        label={`block ${n + 1}`}
        key={b.id ?? n}
      >
        <BlockFrame
          id={`block-${b.id ?? n}`}
          label={`Proposal block ${n + 1}`}
          blockType={b.type}
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
              <span className="heading-measure" aria-hidden="true">
                {panels.phone ? (
                  b.text || "\u200b"
                ) : (
                  <HeadingTokens text={b.text || "\u200b"} map={map} />
                )}
              </span>
              <FieldTextArea
                onBeforeInsert={() =>
                  setSection(sections.findIndex((s) => s.indices.includes(n)))
                }
                textStyle={{ value: b.level ?? 1, change: style }}
                className="document-heading"
                aria-label={`Heading ${n + 1}`}
                rows={1}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    event.currentTarget.selectionStart === 0
                  ) {
                    event.preventDefault();
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
                  }
                }}
                value={b.text ?? ""}
                onValue={(text) =>
                  patchBlock({
                    ...b,
                    text: text.replace(/[\r\n]+/g, " "),
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
          ) : b.type === "pricing_table" ? (
            <div className="editor-investment">
              <h2>Your investment</h2>
              <p>Optional items are your choice. Totals update as you go.</p>
              <div className="flow-quote document-quote">
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
              <h2>{b.text || "Statement of Work & Contract"}</h2>
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
                              {c.heading.replace(
                                /{{\s*([\w.-]+)\s*}}/g,
                                (_, key) => map[key] ?? key,
                              )}
                            </h3>
                          </Disclosure>
                          <SourceParagraph
                            text={c.body.replace(
                              /{{\s*([\w.-]+)\s*}}/g,
                              (_, key) => map[key] ?? key,
                            )}
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
                    <select
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
                    </select>
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
            <span className="field-chip">{map[b.path ?? ""]}</span>
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
  function insertBlock(block: Block) {
    const id = uid(),
      next = [...p.content],
      index = insertAt ?? p.content.length;
    next.splice(index, replaceEmpty ? 1 : 0, { ...block, id });
    setReplaceEmpty(false);
    change({ content: next });
    setInsertAt(null);
    const ss = contentSections(next),
      sn = ss.findIndex((s) => s.indices.includes(index));
    setSection(sn);
    requestAnimationFrame(() => {
      const frame = document.getElementById(`block-${id}`);
      const focus =
        frame?.querySelector<HTMLElement>(
          "input, textarea, [contenteditable=true]",
        ) ?? frame;
      selection.select(`block-${id}`);
      focus?.focus();
      frame?.scrollIntoView({ block: "center" });
    });
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
      data-panels-ready={panels.ready}
      data-stale={stale}
      data-compact={panels.compact}
      data-shell-mode={panels.phone ? "phone" : "v2"}
      data-phone-editing={panels.phone && !!selection.selected}
      className={`quote-workspace editor-v2 editor-round3 ${panels.printMode ? "pdf-width-editor" : "phone-editing"} ${section === null ? "section-list-mode" : "section-edit-mode"} ${fullDocument ? "full-document-mode" : ""}`}
    >
      <EditorControlConfig
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
      <EditorHeader
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
              <p>{recovery.quote?.length ?? 0} saved quote items.</p>
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
        <main className="editor-document-region">
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
                      panels.printMode && !(panels.phone && selection.selected)
                    }
                    sheets
                    headerFooter={bands}
                    onHeaderFooter={
                      !locked && !stale
                        ? (header_footer) => change({ header_footer })
                        : undefined
                    }
                    values={map}
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
                    )}
                  </style>
                  {p.content.length > 0 && (
                    <DocumentCover
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
        </main>
        {
          <ToolsPanel
            tab={tab as EditorTab}
            open={panels.phone ? phoneDrawer : panels.right}
            mode={panels.phone ? "sheet" : panels.mode}
            onTab={openTools}
            onToggle={toggleRight}
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
                <select
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
                      {clause.heading}
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
                </select>
              </Field>
              <Field label="Clause heading">
                <input
                  value={c.heading}
                  onChange={(e) => patch({ heading: e.target.value })}
                />
              </Field>
              <Field label="Clause body">
                <textarea
                  value={c.body}
                  onChange={(e) => patch({ body: e.target.value })}
                />
              </Field>
              <Field label="Show when">
                <select
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
                </select>
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
