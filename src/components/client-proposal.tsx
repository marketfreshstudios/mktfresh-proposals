"use client";
import {
  printedChoiceGroupLabel,
  choiceRequired,
  missingChoiceGroups,
  visibleQuote,
} from "../lib/quote-options";
import {
  oiotCareVariables,
  quoteChangesPageContent,
  revealedOiotClause,
} from "../lib/oiot";
import { useTermsJump } from "./use-terms-jump";
import { TermsNotice } from "./terms-notice";
import { ClientQuestions, generalQuestion } from "./proposal-questions";
import {
  ClientQuestionButton,
  ClientQuestionSurface,
  isPhoneReading,
  type QuestionRequest,
} from "./client-question-controls";
import { questionTargets } from "../lib/question-targets";
import type { PublicQuestion } from "../lib/proposal-questions";
import { useClientEngagement } from "./use-client-engagement";
import { accessibleAccent } from "../lib/brand";
import { Check, ChevronLeft, CircleAlert, LockKeyhole } from "lucide-react";
import { blockText } from "../lib/editor-document";
import { sizeListMarkers } from "../lib/list-markers";
import { DialogActions } from "./dialog-actions";
import { pairSignatureNodes } from "./signature-pair";
import { DocumentTotals } from "./document-totals";
import { ClientPrint } from "./client-print";
import {
  ClientPageSheets,
  captureClientPosition,
  restoreClientPosition,
} from "./client-page-sheets";
import {
  quoteLayout,
  harborQuoteNeutrals,
  documentStyleCss,
  styleFontFaces,
} from "../lib/proposal-styles";
import { blockBoxStyle } from "../lib/block-style";
import { documentSpacing } from "../lib/document-spacing";
import type { CSSProperties } from "react";
import type { Block } from "../lib/model";
import { billingDisplay } from "../lib/billing-display";
import { AfterSigning, afterSigningView } from "./after-signing";
import { ContactToast, copyContactValue } from "./contact-value";
import { fontCss, fontFamily, type FontSettings } from "../lib/proposal-fonts";
import { readableDate } from "../lib/validity";
import {
  billingLines,
  chooseItem,
  quoteSublines,
  orderedItems,
  selectedContent,
} from "../lib/quote-model";
import type { QuoteItem } from "../lib/model";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { accentText } from "../lib/branding";
import { formatMoney, intervalSuffix } from "../lib/money";
import { money, totals, renderBlocks, resolve } from "../lib/presentation";
import { PoweredByYeswell } from "./powered-by-yeswell";
import { ClientWorkspaceIcon } from "./client-workspace-icon";
import type { BillingLine } from "../lib/model";
import type { publicResult } from "../lib/service";
import { QuoteTable } from "./quote-table";
import { QuoteItemBody } from "./quote-item-body";
import { DocumentCover } from "./document-cover";
import { ClientSignatureBlock } from "./client-signature-block";
import { SignatureForm } from "./signature";
import { api, ApiError, Banner, Button, Icon, date } from "./ui";
import { Skeleton } from "./foundation";
import { Select } from "./form-controls";
import { StaffIconContext } from "./staff-icons";
export type PublicProposal = ReturnType<typeof publicResult> & {
  preview_can_send?: boolean;
};
type Brand = {
  name: string;
  email: string;
  phone?: string;
  show_powered_by?: boolean;
  logo?: string | null;
  logo_icon?: string | null;
  accent_colour?: string;
  contact?: {
    name: string;
    email: string;
    phone?: string;
    job_title?: string;
    photo_url?: string;
  };
  ended?: string | null;
  valid_until?: string | null;
  timezone?: string;
  proposal_fonts?: FontSettings["proposal_fonts"];
};
const emptyBrand: Brand = { name: "Proposal", email: "" };
export function ClientProposal({
  token,
  preview = false,
  publishedPreview = false,
}: {
  token: string;
  preview?: boolean;
  publishedPreview?: boolean;
}) {
  const previewEndpoint = preview
    ? `/api/proposals/${token}/preview${publishedPreview ? "?mode=published" : ""}`
    : undefined;
  const [route, setRoute] = useState<{
    brand: Brand;
    initial?: PublicProposal;
  } | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    const preference = localStorage.getItem("proposal-theme");
    document.documentElement.dataset.theme =
      preference ??
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);
  useEffect(() => {
    let active = true;
    setRoute(null);
    setFailure("");
    void api<any>(previewEndpoint ?? `/api/public/${token}/brand`)
      .then((value) => {
        if (active)
          setRoute({
            brand: preview
              ? { ...value.company, contact: value.contact }
              : value,
            initial: preview ? value : undefined,
          });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const status = error instanceof ApiError ? error.status : 0;
        setFailure(
          [401, 403, 404].includes(status)
            ? "This preview can only be opened by workspace staff."
            : status === 400
              ? "Some proposal content couldn’t be previewed. Open the editor and check readiness."
              : "The preview couldn’t be loaded. Reload the page to try again.",
        );
      });
    return () => {
      active = false;
    };
  }, [token, preview, previewEndpoint]);
  if (failure && preview)
    return (
      <main className="client-flow">
        <section className="flow-state flow-ended">
          <CircleAlert aria-hidden="true" />
          <h1>Preview unavailable</h1>
          <p>{failure}</p>
        </section>
      </main>
    );
  if (failure)
    return (
      <StaffIconContext.Provider value={true}>
        <NewClientFlow token={token} brand={emptyBrand} />
      </StaffIconContext.Provider>
    );
  if (!route)
    return (
      <div className="client-flow">
        <div className="flow-loading">
          <Skeleton kind="document" label="Opening your proposal…" />
        </div>
      </div>
    );
  return (
    <StaffIconContext.Provider value={true}>
      <ClientWorkspaceIcon
        token={token}
        version={route.brand.logo_icon}
        preview={preview}
      />
      <NewClientFlow
        token={token}
        previewEndpoint={previewEndpoint}
        publishedPreview={publishedPreview}
        brand={route.brand}
        initial={route.initial}
      />
    </StaffIconContext.Provider>
  );
}
function NewClientFlow({
  token,
  previewEndpoint,
  publishedPreview,
  brand: initialBrand,
  initial,
}: {
  token: string;
  previewEndpoint?: string;
  publishedPreview?: boolean;
  brand: Brand;
  initial?: PublicProposal;
}) {
  const preview = !!previewEndpoint;
  const [p, setP] = useState<PublicProposal | null>(initial ?? null),
    [brand, setBrand] = useState(initialBrand);
  const [step, setStep] = useState<"read" | "sign" | "billing" | "done">(
    "read",
  );
  const [opening, setOpening] = useState("");
  const [approving, setApproving] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutReturned, setCheckoutReturned] = useState(false),
    [returnSession, setReturnSession] = useState(""),
    [checkoutLeft, setCheckoutLeft] = useState(false),
    [returnTimedOut, setReturnTimedOut] = useState(false),
    [pollCycle, setPollCycle] = useState(0);
  useEffect(() => {
    if (preview) return;
    const query = new URLSearchParams(location.search);
    setCheckoutReturned(query.get("billing") === "returned");
    setCheckoutLeft(query.get("billing") === "pending");
    setReturnSession(query.get("session_id") ?? "");
  }, [preview, token]);
  const [choiceNotice, setChoiceNotice] = useState(false);
  const [locked, setLocked] = useState(false),
    [ended, setEnded] = useState(false),
    [password, setPassword] = useState("");
  const [declineNote, setDeclineNote] = useState("");
  const [showPassword, setShowPassword] = useState(false),
    [stale, setStale] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [declining, setDeclining] = useState(false),
    [phone, setPhone] = useState(false),
    [showCopy, setShowCopy] = useState(false);
  const bar = useRef<HTMLDivElement>(null),
    main = useRef<HTMLElement>(null),
    pending = useRef(false);
  const [barHeight, setBarHeight] = useState(0);
  const [readSection, setReadSection] = useState<number | null>(null);
  const jumpToTerms = useTermsJump("client");
  const [termsNotice, setTermsNotice] = useState<string | null>(null);
  const headers = { "x-proposal-password": password };
  const signed = !!p && ["signed_by_client", "completed"].includes(p.status);
  const [questionRequest, setQuestionRequest] =
    useState<QuestionRequest | null>(null);
  const [questionHistoryOpen, setQuestionHistoryOpen] = useState(false);
  const [questionThreads, setQuestionThreads] = useState<PublicQuestion[]>([]);
  const targets = useMemo(
    () =>
      questionTargets(
        p?.content ?? [],
        (p?.quote ?? []) as QuoteItem[],
        p?.variables ?? {},
      ),
    [p?.content, p?.quote, p?.variables],
  );
  const canAsk =
    !!p && ["sent", "viewed"].includes(p.status) && !signed && !stale;
  const recurring =
    !!p &&
    quoteSublines(p.quote as QuoteItem[]).some(
      (l) => (!l.optional || l.selected) && l.interval !== "one_time",
    );
  const billing =
    preview && step === "billing"
      ? [
          {
            payment_state: undefined,
            requires_checkout: true,
            checkout: [],
            added_existing: [],
            status: "pending",
          },
        ]
      : (p?.billing ?? []);
  const display = p
    ? billingDisplay(
        p.quote as QuoteItem[],
        billing,
        preview && step === "billing",
        p.billing_collection_method,
      )
    : null;
  const checkout = display?.checkout ?? [];
  const requiresCheckout =
    recurring && billing.some((b) => b.requires_checkout);
  const existing = display?.added ?? [];
  // Services joining a subscription the client already pays: shown with the
  // card on file and added only when the client approves.
  const approvals = (preview ? [] : (p?.billing ?? [])).flatMap((b) =>
    (b.approval ?? []).map((a) => ({
      ...a,
      lines: p
        ? billingLines(p.quote as QuoteItem[]).filter((l) =>
            a.line_ids.includes(l.id),
          )
        : [],
    })),
  );
  const confirmations = p?.billing.flatMap((b) => b.confirmations ?? []) ?? [];
  const returnConfirmed = returnSession
    ? confirmations.some((c) => c.checkout_session_id === returnSession)
    : confirmations.length > 0 && !requiresCheckout;
  const bankState = billing.some((b) => b.payment_state === "failed")
    ? "failed"
    : billing.some((b) => b.payment_state === "processing")
      ? "processing"
      : undefined;
  const finishingReturn =
    checkoutReturned && signed && !returnConfirmed && !bankState;
  const contact = {
    ...(p?.contact ?? brand.contact ?? { name: "", email: brand.email }),
    phone: brand.contact?.phone ?? p?.company.phone ?? brand.phone,
    job_title: brand.contact?.job_title,
    photo_url: brand.contact?.photo_url,
  };
  const engagement = useClientEngagement(
    p,
    token,
    password,
    preview,
    step === "read",
  );
  const firstName = p?.recipient.name.split(" ")[0] ?? "";
  const review = step === "read" && !signed;
  const activeStep = signed ? (step === "done" ? "done" : "billing") : step;
  const fonts = p?.proposal_fonts ?? brand.proposal_fonts;
  const logoIcon = brand.logo_icon
    ? preview
      ? `/api/workspace-icon?size=32&v=${encodeURIComponent(brand.logo_icon)}`
      : `/api/public/${token}/brand/icon?size=32&v=${encodeURIComponent(brand.logo_icon)}`
    : undefined;
  async function load() {
    setBusy(true);
    setError("");
    try {
      const value = await api<PublicProposal>(
        previewEndpoint ?? `/api/public/${token}`,
        { headers },
      );
      setP(value);
      setBrand({ ...brand, ...value.company, contact: value.contact });
      setLocked(false);
      setEnded(false);
      setStale(false);
      setStep(
        ["signed_by_client", "completed"].includes(value.status)
          ? value.billing.some((b) => b.requires_checkout) ||
            quoteSublines(value.quote as QuoteItem[]).some(
              (l) => (!l.optional || l.selected) && l.interval !== "one_time",
            )
            ? "billing"
            : "done"
          : "read",
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setLocked(true);
        if (password)
          setError("That password doesn’t match. Please try again.");
      } else if (e instanceof ApiError && [404, 410].includes(e.status))
        setEnded(true);
      else setError("We couldn’t open your proposal. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!initial) void load();
  }, [token]);
  useEffect(() => {
    if (
      preview ||
      !signed ||
      (checkoutReturned && (returnConfirmed || returnTimedOut))
    )
      return;
    let active = true;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void api<PublicProposal>(`/api/public/${token}/state`, {
        headers,
        signal: controller.signal,
      })
        .then((value) => {
          if (active) setP(value);
        })
        .catch(() => {});
    }, 3000);
    const deadline = setTimeout(
      () => {
        active = false;
        clearInterval(timer);
        controller.abort();
        if (checkoutReturned) setReturnTimedOut(true);
      },
      checkoutReturned ? 60000 : 180000,
    );
    return () => {
      active = false;
      clearInterval(timer);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [
    signed,
    token,
    password,
    preview,
    checkoutReturned,
    returnConfirmed,
    returnTimedOut,
    pollCycle,
  ]);

  // Back from Stripe: ask the server to confirm with Stripe directly, so
  // setup finishes even if Stripe's webhook is slow or never arrives.
  const confirmAsked = useRef("");
  useEffect(() => {
    if (
      preview ||
      !signed ||
      !checkoutReturned ||
      !returnSession ||
      returnConfirmed ||
      confirmAsked.current === returnSession
    )
      return;
    confirmAsked.current = returnSession;
    let cancelled = false;
    const ask = (retry: boolean) =>
      api<{ confirmed: boolean }>(`/api/public/${token}/checkout/confirm`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ session_id: returnSession }),
      })
        .then((r) => {
          if (!r.confirmed && retry && !cancelled)
            setTimeout(() => void ask(false), 4000);
        })
        .catch(() => {});
    void ask(true);
    return () => {
      cancelled = true;
    };
  }, [
    preview,
    signed,
    checkoutReturned,
    returnSession,
    returnConfirmed,
    token,
  ]);

  useEffect(() => {
    if (p?.title) document.title = p.title;
  }, [p?.title]);

  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [step]);
  useEffect(() => {
    if (step !== "read" || readSection === null) return;
    // Coming back from signing, the document is rebuilt (pages are laid out
    // again and the reading position restored). Scroll only once that has
    // settled, or the jump lands on a stale copy and is then undone.
    let frame = 0;
    const tryScroll = () => {
      const root = document.getElementById("proposal-document");
      if (!root) return;
      if (root.shadowRoot && root.getAttribute("data-layout-ready") !== "true")
        return;
      const target = (root.shadowRoot ?? document).getElementById(
        `section-${readSection}`,
      );
      if (!target?.checkVisibility({ visibilityProperty: true })) return;
      target.scrollIntoView({ block: "start" });
      setReadSection(null);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tryScroll);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-layout-ready", "hidden"],
    });
    document.addEventListener("client-document-ready", schedule);
    const timeout = setTimeout(() => setReadSection(null), 5000);
    schedule();
    return () => {
      observer.disconnect();
      document.removeEventListener("client-document-ready", schedule);
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [step, readSection]);
  useEffect(() => {
    const node = bar.current;
    if (!node || !review) {
      setBarHeight(0);
      return;
    }
    const measure = () =>
      setBarHeight(
        getComputedStyle(node).position === "fixed"
          ? node.getBoundingClientRect().height
          : 0,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [review, stale, p?.quote.length, phone]);
  async function submit(path: string, data: unknown) {
    if (preview) throw new Error("Preview cannot submit client actions");
    return api<PublicProposal>(`/api/public/${token}/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
  }
  async function toggle(id: string, selected: boolean) {
    if (!p || pending.current || stale || signed) return;
    const previous = p,
      quote = chooseItem(p.quote as QuoteItem[], id, selected),
      term = revealedOiotClause(p.content, p.quote as QuoteItem[], quote),
      t = totals(quote);
    const fmt = (n: number) => formatMoney(n, p.currency, p.money_cents);
    const variables = {
      ...p.variables,
      "quote.one_time_total": fmt(t.one_time_total),
      "quote.monthly_total": fmt(t.monthly_total),
      "quote.yearly_total": fmt(t.yearly_total),
      ...oiotCareVariables(quote, fmt),
      "quote.selected_items": visibleQuote(quote)
        .filter((l) => !l.optional || l.selected)
        .map((l) => l.name)
        .join(", "),
    };
    setP({
      ...p,
      pagination: quoteChangesPageContent(
        p.content,
        p.quote as QuoteItem[],
        quote,
      )
        ? undefined
        : p.pagination,
      quote,
      totals: t,
      variables,
      html: renderBlocks(
        p.content,
        quote as QuoteItem[],
        variables,
        p.currency,
      ),
    });
    if (preview) {
      setTermsNotice(term ?? null);
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await submit("quote", {
        revision: previous.revision,
        reviewed_hash: previous.reviewed_hash,
        item_id: id,
        selected,
      });
      setP(saved);
      setTermsNotice(term ?? null);
      engagement.choice(id, selected);
    } catch (e) {
      setP(previous);
      if (e instanceof ApiError && e.status === 409) setStale(true);
      else if (e instanceof ApiError && [404, 410].includes(e.status))
        setEnded(true);
      else
        setError(
          "Your selection wasn’t saved. Your previous choices are still here. Please try again.",
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function download(id: string) {
    if (preview) return;
    try {
      const response = await fetch(`/api/public/${token}/files/${id}`, {
        headers,
      });
      if (!response.ok) throw new Error();
      void engagement.download(id);
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download = "signed-proposal.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("We couldn’t download the copy. Please try again.");
    }
  }
  const hasContract = p?.content.some(
    (b) =>
      b.type === "contract" ||
      (b.type === "heading" &&
        /contract|statement of work/i.test(b.text ?? "")),
  );
  // Name the agreement the way the proposal titles it.
  const contractTitle =
    p?.content
      .find(
        (b) =>
          (b.type === "contract" ||
            (b.type === "heading" &&
              /contract|statement of work/i.test(b.text ?? ""))) &&
          b.text?.trim(),
      )
      ?.text?.trim() || "terms";
  // Hidden groups and "Choose up to one" groups never block signing.
  const missingGroups = p ? missingChoiceGroups(p.quote as QuoteItem[]) : [];
  const missingChoice = missingGroups.length > 0;
  const showMissingChoice = () => {
    setChoiceNotice(true);
    const first = missingGroups[0]?.[0]?.id;
    const host = document.querySelector("#proposal-document");
    const root = host?.shadowRoot ?? host;
    const node = first
      ? root?.querySelector<HTMLElement>(
          `[data-client-item-id="${CSS.escape(first)}"]`,
        )
      : null;
    (node?.closest<HTMLElement>("[role=radiogroup]") ?? node)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  };
  const reading = !!p && review && !locked && !ended;
  const palette = p?.resolved_styles?.layout?.quote_neutrals;
  const progress = !!p && !locked && !ended && (
    <FlowProgress
      step={activeStep}
      billing={recurring || requiresCheckout}
      billed={
        signed &&
        !requiresCheckout &&
        (confirmations.length > 0 || existing.length > 0)
      }
      className={review ? "flow-review-progress" : "flow-top-progress"}
      onReview={step === "sign" ? () => go("read") : undefined}
    />
  );
  const ask = canAsk ? setQuestionRequest : undefined;
  const closeQuestion = () => {
    const restore = questionRequest?.trigger;
    const anchor = questionRequest?.anchor;
    setQuestionRequest(null);
    requestAnimationFrame(() =>
      (restore?.isConnected ? restore : anchor)?.focus({ preventScroll: true }),
    );
  };
  const questions = p && !ended && !locked && step !== "sign" && (
    <ClientQuestions
      proposal={p}
      token={token}
      password={password}
      requested={questionRequest}
      close={closeQuestion}
      inReadingRail={reading}
      preview={preview}
      historyOpen={questionHistoryOpen}
      setHistoryOpen={setQuestionHistoryOpen}
      onThreadsChange={setQuestionThreads}
      onAsk={ask}
      targets={targets}
    />
  );
  const go = (value: typeof step) => {
    setError("");
    setQuestionRequest(null);
    setQuestionHistoryOpen(false);
    // Signing is a history entry, so the browser's back button (and the
    // phone's back gesture) returns to the proposal.
    if (value === "sign" && step === "read")
      history.pushState({ ...history.state, yeswellStep: "sign" }, "");
    else if (
      value === "read" &&
      step === "sign" &&
      history.state?.yeswellStep === "sign"
    ) {
      history.back();
      return;
    }
    setStep(value);
  };
  useEffect(() => {
    const pop = () => {
      if (history.state?.yeswellStep !== "sign")
        setStep((current) => (current === "sign" ? "read" : current));
    };
    // The page sets its own scroll when switching steps (top of the step, or
    // a section such as the Terms). The browser's own restoration would run
    // after that on Back and undo it.
    const restoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      history.scrollRestoration = restoration;
    };
  }, []);
  const previewBar = preview && initial && (
    <PreviewControls>
      <div className="preview-identity">
        <a
          className="preview-back"
          href={`/proposals/${token}`}
          aria-label={
            p?.preview_can_send ? "Back to editor" : "Back to proposal"
          }
        >
          <ChevronLeft size={16} aria-hidden="true" />
          <span className="preview-back-full">
            {p?.preview_can_send ? "Back to editor" : "Back to proposal"}
          </span>
          <span className="preview-back-short" aria-hidden="true">
            {p?.preview_can_send ? "Editor" : "Proposal"}
          </span>
        </a>
        <div className="preview-caption">
          <strong>
            {publishedPreview
              ? "Preview of published version"
              : "Preview, not sent"}
          </strong>
          <span>
            Previewing as {p?.recipient.name}. Choices and questions aren’t
            recorded.
          </span>
        </div>
      </div>
      <div className="preview-toolbar">
        <div
          className="preview-steps segmented"
          role="group"
          aria-label="Preview step"
        >
          {previewSteps.map(([value, label]) => (
            <Button
              key={value}
              aria-pressed={step === value}
              onClick={() => go(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Select
          className="preview-step-select"
          aria-label="Preview step"
          value={step === "done" ? "billing" : step}
          onChange={(event) => {
            const selected = previewSteps.find(
              ([value]) => value === event.target.value,
            );
            if (selected) go(selected[0]);
          }}
        >
          {previewSteps.map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </Select>
        <div
          className="preview-size segmented"
          role="group"
          aria-label="Preview width"
        >
          <Button
            aria-label="Desktop width"
            aria-pressed={!phone}
            onClick={() => setPhone(false)}
          >
            Desktop
          </Button>
          <Button
            aria-label="Phone width"
            aria-pressed={phone}
            onClick={() => setPhone(true)}
          >
            Phone
          </Button>
        </div>
        {p?.preview_can_send && (
          <a
            className="btn action preview-send"
            href={`/proposals/${token}?view=send`}
          >
            Send
          </a>
        )}
      </div>
    </PreviewControls>
  );
  return (
    <FlowStage
      className={`client-flow ${phone ? "flow-phone-preview" : ""} ${reading ? "flow-r25-reading" : ""}`}
      previewBar={previewBar}
      style={
        {
          "--accent": brand.accent_colour ?? "#365C4A",
          "--client-accent": brand.accent_colour ?? "#365C4A",
          "--client-accent-text": accessibleAccent(
            brand.accent_colour ?? "#365C4A",
          ),
          "--on-accent": accentText(brand.accent_colour ?? "#365C4A"),
          "--client-font-heading": fontFamily(fonts?.heading),
          "--client-font-body": fontFamily(fonts?.body),
          ...(palette && palette.group_fill !== harborQuoteNeutrals.group_fill
            ? { "--client-choice-custom-fill": palette.group_fill }
            : {}),
          ...(palette &&
          palette.group_border !== harborQuoteNeutrals.group_border
            ? { "--client-choice-custom-line": palette.group_border }
            : {}),
        } as React.CSSProperties
      }
    >
      {(p || fonts) && (
        <style>
          {fontCss({ proposal_fonts: fonts }, (f) =>
            preview
              ? `/api/workspace-fonts/${f.id}`
              : `/api/public/${token}/fonts/${f.id}`,
          )}
          {p &&
            styleFontFaces(p.resolved_styles, (f) =>
              preview
                ? `/api/workspace-fonts/${f.id}`
                : `/api/public/${token}/fonts/${f.id}`,
            )}
          {p &&
            documentStyleCss(p.resolved_styles, brand.accent_colour, p.content)}
        </style>
      )}
      <header className="client-header flow-header">
        <div className="flow-brand">
          <span className="flow-brand-mark" aria-hidden="true">
            {logoIcon ? (
              <img src={logoIcon} alt="" />
            ) : (
              (brand.name || "Proposal").trim()[0]?.toUpperCase()
            )}
          </span>
          <strong>{brand.name}</strong>
        </div>
        <div className="flow-header-end">
          {p && review && !locked && !ended && p.valid_until && (
            <span className="flow-valid-until">
              Valid until {readableDate(p.valid_until, p.timezone)}
            </span>
          )}
          {reading && (
            <a
              className="flow-questions-link"
              href="#your-questions"
              onClick={(event) => {
                if (!isPhoneReading()) return;
                event.preventDefault();
                setQuestionHistoryOpen(true);
              }}
            >
              <span className="flow-questions-link-wide">
                Your questions ({questionThreads.length})
              </span>
              <span className="flow-questions-link-short">Questions</span>
            </a>
          )}
        </div>
        {reading && progress}
        {reading && ask && (
          <ClientQuestionButton
            label="Ask a question"
            className="client-ask-header"
            // On phones it floats above the bottom bar, so it is always in reach.
            style={{ bottom: barHeight + 16 }}
            onClick={(trigger) => ask({ target: generalQuestion, trigger })}
          />
        )}
      </header>
      {!reading && progress}
      <main
        className={`client-body flow-body ${review ? "flow-review" : ""}`}
        data-stale={stale || undefined}
        ref={main}
        tabIndex={-1}
        style={{ paddingBottom: barHeight + 32 }}
      >
        {ended ? (
          <section className="flow-state flow-ended">
            <span className="flow-state-icon">
              <CircleAlert aria-hidden="true" />
            </span>
            <h1>
              {brand.ended === "expired"
                ? brand.valid_until
                  ? `This proposal expired on ${readableDate(brand.valid_until, brand.timezone)}`
                  : "This proposal has expired"
                : brand.ended === "declined"
                  ? "This proposal was declined"
                  : "This link is no longer active"}
            </h1>
            <p>
              {brand.ended === "expired"
                ? "If you’d still like to go ahead, ask for a current version."
                : brand.ended === "declined"
                  ? "If your plans change, ask for a new proposal."
                  : "Check your email for the newest link, or ask the sender to send it again."}
            </p>
            <SenderCard contact={contact} company={brand.name} />
            {contact.email && (
              <a className="btn primary" href={`mailto:${contact.email}`}>
                {brand.ended === "expired"
                  ? "Ask for a new proposal"
                  : "Email the sender"}
              </a>
            )}
          </section>
        ) : locked ? (
          <section className="flow-state flow-locked">
            <span className="flow-state-icon">
              <LockKeyhole aria-hidden="true" />
            </span>
            <h1>Enter the password to open your proposal</h1>
            <p>{brand.name} sent the password separately from the link.</p>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void load();
              }}
            >
              <div className="field">
                <label htmlFor="proposal-password">Password</label>
                <div className="flow-password">
                  <input
                    id="proposal-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              {error && <p role="alert">{error}</p>}
              <Button type="submit" variant="primary" busy={busy}>
                Open proposal
              </Button>
            </form>
            <p className="muted">
              Need the password? Ask{" "}
              {contact.email ? (
                <a href={`mailto:${contact.email}`}>
                  {contact.name || "the sender"}
                </a>
              ) : (
                contact.name || "the sender"
              )}
              .
            </p>
          </section>
        ) : !p ? (
          <div className="flow-loading">
            {error ? (
              <Banner
                title="Please try again"
                tone="danger"
                action={<Button onClick={load}>Try again</Button>}
              >
                {error}
              </Banner>
            ) : (
              <Skeleton kind="document" label="Opening your proposal…" />
            )}
          </div>
        ) : (
          <>
            {error && (
              <Banner
                title={signed ? "Your proposal is signed" : "Please try again"}
                tone="danger"
              >
                {error}
              </Banner>
            )}
            {stale && (
              <div className="flow-stale">
                <Banner
                  tone="warning"
                  title="This proposal changed while you were reading it"
                  action={<Button onClick={load}>Load latest version</Button>}
                >
                  The pricing or wording is different from what is on your
                  screen. Reload to see the current version before you sign.
                </Banner>
              </div>
            )}
            {signed || step === "billing" || step === "done" ? (
              <section className="flow-result stack">
                <div className="flow-result-summary stack">
                  {preview && (
                    <p className="after-small">
                      This is a preview. No signature or billing has been
                      submitted.
                    </p>
                  )}
                  <AfterSigning
                    view={afterSigningView({
                      completed: p.status === "completed",
                      step: step === "done" ? "done" : "billing",
                      requiresCheckout,
                      billingProblem: billing.some(
                        (b) =>
                          b.status === "failed" || b.status === "needs_review",
                      ),
                      bankState:
                        bankState && !requiresCheckout ? bankState : undefined,
                      returned: finishingReturn,
                      returnConfirmed,
                      returnTimedOut,
                    })}
                    preview={preview}
                    firstName={firstName}
                    email={p.recipient.email}
                    timezone={p.timezone}
                    currency={p.currency}
                    cents={p.money_cents}
                    studio={p.company.name || brand.name}
                    contact={{
                      name: contact.name ?? "",
                      email: contact.email,
                      phone: contact.phone,
                    }}
                    signedAt={
                      p.signers.find((s) => s.role === "client")?.signed_at
                    }
                    countersignedAt={
                      p.signers.find((s) => s.role === "company")?.signed_at
                    }
                    collection={
                      p.billing_collection_method ?? "charge_automatically"
                    }
                    invoiceMethod={p.invoice_method}
                    recurring={billingLines(
                      (p.quote ?? []) as QuoteItem[],
                    ).filter((l) => l.interval !== "one_time")}
                    oneTime={display?.oneTime ?? []}
                    sessions={checkout}
                    approvals={approvals}
                    confirmations={confirmations}
                    added={existing}
                    leftCheckout={checkoutLeft}
                    checkoutError={checkoutError}
                    opening={opening}
                    approving={approving}
                    files={p.files}
                    showCopy={showCopy}
                    onOpen={(session) => {
                      // Ask for a live checkout page: the one made at
                      // signing may have expired.
                      setOpening(session.id!);
                      setCheckoutError("");
                      api<{ url: string }>(`/api/public/${token}/checkout`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({ session_id: session.id }),
                      })
                        .then(({ url }) => window.location.assign(url))
                        .catch((failure) => {
                          setOpening("");
                          setCheckoutError(
                            failure instanceof Error
                              ? failure.message
                              : "Secure checkout couldn’t open. Try again.",
                          );
                        });
                    }}
                    onApprove={(a) => {
                      setApproving(a.id);
                      setCheckoutError("");
                      api(`/api/public/${token}/billing/approve`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({ approval_id: a.id }),
                      })
                        .then(() => load())
                        .catch((failure) =>
                          setCheckoutError(
                            failure instanceof Error
                              ? failure.message
                              : "Your approval wasn’t saved. Try again.",
                          ),
                        )
                        .finally(() => setApproving(""));
                    }}
                    onLater={() => go("done")}
                    onFinishBilling={() => go("billing")}
                    onCheckAgain={() => {
                      setReturnTimedOut(false);
                      setPollCycle((c) => c + 1);
                    }}
                    onDownload={(id) => download(id)}
                    onToggleCopy={() => setShowCopy(!showCopy)}
                  />
                </div>
                {showCopy && (
                  <FlowDocument
                    logoIcon={
                      p.company.logo_icon
                        ? preview
                          ? `/api/workspace-icon?size=128&v=${p.company.logo_icon}`
                          : `/api/public/${token}/brand/icon?size=128&v=${p.company.logo_icon}`
                        : undefined
                    }
                    forceFlowing={phone}
                    workspaceLogo={
                      p.company.logo
                        ? preview
                          ? `/api/proposals/${token}/preview-logo`
                          : `/api/public/${token}/brand/logo`
                        : undefined
                    }
                    proposal={p}
                    frozen
                    logo={
                      p.cover && p.company.logo
                        ? preview
                          ? `/api/proposals/${token}/preview-logo`
                          : `/api/public/${token}/brand/logo`
                        : undefined
                    }
                  />
                )}
              </section>
            ) : step === "sign" ? (
              <section className="flow-sign">
                <div className="flow-sign-intro">
                  <Button className="flow-back" onClick={() => go("read")}>
                    <ChevronLeft size={16} aria-hidden="true" />
                    Back to proposal
                  </Button>
                  <h1>Sign the proposal</h1>
                  <p>Check what you’re agreeing to, then add your signature.</p>
                </div>
                <section className="flow-acceptance">
                  <h2>What you’re agreeing to</h2>
                  <p>{p.title}</p>
                  <ChosenItems proposal={p} terms />
                  <FlowTotals proposal={p} />
                  {hasContract && (
                    <p className="flow-acceptance-terms">
                      <span>
                        You’re also agreeing to the {contractTitle}
                        {p.sent_at ? `, dated ${date(p.sent_at)}` : ""}.
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setReadSection(
                            p.content.findIndex(
                              (b) =>
                                b.type === "contract" ||
                                (b.type === "heading" &&
                                  /contract|statement of work/i.test(
                                    b.text ?? "",
                                  )),
                            ),
                          );
                          go("read");
                        }}
                      >
                        Read the {contractTitle}
                      </Button>
                    </p>
                  )}
                </section>
                <SignatureForm
                  clientCompany={p.recipient.company}
                  companySignatory={{
                    role: "company",
                    name:
                      p.company.signatory_name ||
                      p.variables["company.owner"] ||
                      p.company.name,
                    title: p.company.signatory_title,
                    company: p.company.name,
                  }}
                  preview={preview}
                  consentText={p.consent_text}
                  name={p.recipient.name}
                  email={p.recipient.email}
                  signerTitle={p.recipient.title}
                  revision={p.revision}
                  reviewedHash={p.reviewed_hash}
                  label="Sign proposal"
                  contactName={contact.name}
                  contactEmail={contact.email}
                  company={brand.name}
                  blocked={stale || busy || missingChoice}
                  blockedReason={
                    missingChoice
                      ? "Go back and choose one item in each choice group."
                      : undefined
                  }
                  onSign={async (value) => {
                    if (preview || stale || busy) return;
                    try {
                      const valueP = await submit("sign", value);
                      setP(valueP);
                      go(
                        quoteSublines(valueP.quote as QuoteItem[]).some(
                          (l) =>
                            (!l.optional || l.selected) &&
                            l.interval !== "one_time",
                        ) || valueP.billing.some((b) => b.requires_checkout)
                          ? "billing"
                          : "done",
                      );
                    } catch (e) {
                      if (e instanceof ApiError && e.status === 409)
                        setStale(true);
                      else if (
                        e instanceof ApiError &&
                        [404, 410].includes(e.status)
                      )
                        setEnded(true);
                      throw e;
                    }
                  }}
                />
              </section>
            ) : (
              <>
                <ClientQuestionSurface
                  targets={targets.blocks}
                  threads={questionThreads}
                  onAsk={ask}
                >
                  <FlowDocument
                    logoIcon={
                      p.company.logo_icon
                        ? preview
                          ? `/api/workspace-icon?size=128&v=${p.company.logo_icon}`
                          : `/api/public/${token}/brand/icon?size=128&v=${p.company.logo_icon}`
                        : undefined
                    }
                    forceFlowing={phone}
                    workspaceLogo={
                      p.company.logo
                        ? preview
                          ? `/api/proposals/${token}/preview-logo`
                          : `/api/public/${token}/brand/logo`
                        : undefined
                    }
                    logo={
                      p.cover && p.company.logo
                        ? preview
                          ? `/api/proposals/${token}/preview-logo`
                          : `/api/public/${token}/brand/logo`
                        : undefined
                    }
                    proposal={p}
                    frozen={stale}
                    busy={busy}
                    onToggle={toggle}
                  />
                </ClientQuestionSurface>
                <div className="flow-reading-rail">
                  <aside
                    className="flow-choices"
                    ref={bar}
                    aria-label="Your choices"
                  >
                    <div className="flow-desktop-choices">
                      <FlowProgress
                        step="read"
                        billing={recurring || requiresCheckout}
                      />
                      <h2>Your choices</h2>
                      <ChosenItems proposal={p} inlineAmounts />
                    </div>
                    <ReviewTotals proposal={p} />
                    <div className="flow-review-actions">
                      <Button
                        variant="primary"
                        disabled={busy || stale}
                        note={busy ? "Saving your selection…" : undefined}
                        onClick={() =>
                          missingChoice ? showMissingChoice() : go("sign")
                        }
                      >
                        Review and sign
                      </Button>
                      {choiceNotice && missingChoice && (
                        <p role="alert" className="flow-choice-needed">
                          Choose one option in each group marked “
                          {printedChoiceGroupLabel(missingGroups[0][0])}” to
                          continue.
                        </p>
                      )}
                      {ask && (
                        <Button
                          aria-haspopup="dialog"
                          onClick={(event) =>
                            ask({
                              target: generalQuestion,
                              trigger: event.currentTarget,
                              anchor: event.currentTarget,
                            })
                          }
                        >
                          Ask a question
                        </Button>
                      )}
                    </div>
                    <p className="flow-desktop-choices flow-choice-contact">
                      Questions?{" "}
                      {contact.email ? (
                        <a href={`mailto:${contact.email}`}>
                          Email {contact.name || "the sender"}
                        </a>
                      ) : (
                        "Ask the sender."
                      )}
                      {contact.phone && (
                        <>
                          {" "}
                          or{" "}
                          <a href={`tel:${contact.phone}`}>
                            call {contact.phone}
                          </a>
                        </>
                      )}
                    </p>
                  </aside>
                  {questions}
                </div>
                <div className="flow-document-footer">
                  {declining ? (
                    <section className="card stack">
                      <h2>Decline this proposal?</h2>
                      <p>
                        {contact.name || "The sender"} will be told you’ve
                        decided not to go ahead. The link will close.
                      </p>
                      <label className="field">
                        Note (optional)
                        <textarea
                          maxLength={2000}
                          value={declineNote}
                          disabled={busy}
                          onChange={(e) => setDeclineNote(e.target.value)}
                        />
                      </label>
                      <DialogActions>
                        <Button
                          variant="danger"
                          disabled={preview || busy}
                          onClick={async () => {
                            if (preview || pending.current) return;
                            pending.current = true;
                            setBusy(true);
                            try {
                              await submit("decline", { note: declineNote });
                              setBrand({ ...brand, ended: "declined" });
                              setEnded(true);
                            } catch {
                              setError(
                                "We couldn’t decline the proposal. Please try again.",
                              );
                            } finally {
                              pending.current = false;
                              setBusy(false);
                            }
                          }}
                        >
                          Decline proposal
                        </Button>
                        <Button onClick={() => setDeclining(false)}>
                          Go back
                        </Button>
                      </DialogActions>
                    </section>
                  ) : (
                    <div className="flow-document-actions">
                      {ask && (
                        <Button
                          className="flow-footer-ask"
                          onClick={(event) =>
                            ask({
                              target: generalQuestion,
                              trigger: event.currentTarget,
                            })
                          }
                        >
                          Ask a question
                        </Button>
                      )}
                      <Button
                        disabled={preview || stale}
                        onClick={() => setDeclining(true)}
                      >
                        Decline this proposal
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
        {!reading && questions}
        {!ended && !locked && (
          <Contact
            name={contact.name}
            email={contact.email}
            company={brand.name}
          />
        )}
        <ContactToast />
        <TermsNotice
          clause={termsNotice}
          content={p?.content ?? []}
          onView={jumpToTerms}
          onDismiss={() => setTermsNotice(null)}
        />
        <p className="flow-engagement-privacy">
          The sender can see when and how this proposal was viewed.
        </p>
        {(p?.show_powered_by ?? brand.show_powered_by) !== false && (
          <PoweredByYeswell />
        )}
      </main>
    </FlowStage>
  );
}
function FlowStage({
  previewBar,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { previewBar: React.ReactNode }) {
  return (
    <div {...props}>
      {previewBar}
      <div className="flow-stage">{children}</div>
    </div>
  );
}
function ReviewTotals({ proposal: p }: { proposal: PublicProposal }) {
  const entries = [
    { label: "One-time", amount: p.totals.one_time_total, suffix: "" },
    { label: "Monthly", amount: p.totals.monthly_total, suffix: "/mo" },
    { label: "Yearly", amount: p.totals.yearly_total, suffix: "/yr" },
  ].filter(({ amount }) => amount !== 0);
  if (!entries.length) return null;
  return (
    <div
      className="totals flow-totals review-totals"
      role="group"
      aria-label="Proposal totals"
    >
      {entries.map(({ label, amount, suffix }) => (
        <div key={label}>
          <span>{label}</span>
          <strong>
            {formatMoney(amount, p.currency, p.money_cents)}
            {suffix}
          </strong>
        </div>
      ))}
    </div>
  );
}

export function FlowTotals({ proposal: p }: { proposal: PublicProposal }) {
  return (
    <DocumentTotals
      oneTime={p.totals.one_time_total}
      monthly={p.totals.monthly_total}
      yearly={
        p.quote.some((i) => i.sublines.some((s) => s.interval === "year"))
          ? p.totals.yearly_total
          : undefined
      }
      currency={p.currency}
      cents={p.money_cents}
      className="totals flow-totals"
    />
  );
}

function FlowProgress({
  step,
  billing,
  billed = false,
  className,
  onReview,
}: {
  step: "read" | "sign" | "billing" | "done";
  billing: boolean;
  /** Billing is confirmed: every step is finished. */
  billed?: boolean;
  className?: string;
  /** While signing, the Review step goes back to the proposal. */
  onReview?: () => void;
}) {
  const labels = ["Review", "Sign", ...(billing ? ["Billing"] : [])];
  // After signing, the last step is current until billing is confirmed.
  const current = billed
    ? labels.length
    : Math.min({ read: 0, sign: 1, billing: 2, done: 2 }[step], labels.length);
  return (
    <nav className={className} aria-label="Proposal progress">
      <ol className="flow-progress">
        {labels.map((label, i) => (
          <li
            key={label}
            aria-current={i === current ? "step" : undefined}
            className={
              i < current
                ? "reached finished"
                : i === current
                  ? "reached"
                  : undefined
            }
          >
            {i < current && (
              <Check
                className="flow-progress-check"
                size={12}
                strokeWidth={3}
                aria-hidden="true"
              />
            )}
            {i === 0 && onReview ? (
              <button
                type="button"
                className="flow-progress-back"
                onClick={onReview}
              >
                {label}
              </button>
            ) : (
              label
            )}
            {i < current && <span className="sr-only"> (done)</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function SenderCard({
  contact,
  company,
}: {
  contact: NonNullable<Brand["contact"]>;
  company: string;
}) {
  if (!contact.name && !contact.email && !contact.phone) return null;
  const name = contact.name || company;
  return (
    <div className="flow-sender-card" aria-label="Sender contact">
      <span className="flow-brand-mark" aria-hidden="true">
        {contact.photo_url ? (
          <img src={contact.photo_url} alt="" width={36} height={36} />
        ) : (
          name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase()
        )}
      </span>
      <div>
        <strong>{name}</strong>
        {contact.job_title && <div className="muted">{contact.job_title}</div>}
        <div className="flow-sender-details">
          {contact.email && (
            <a href={`mailto:${contact.email}`}>{contact.email}</a>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`}>{contact.phone}</a>
          )}
        </div>
      </div>
    </div>
  );
}

function Terms({ line: l, currency }: { line: BillingLine; currency: string }) {
  return (
    <>
      {l.schedule && (
        <p className="flow-terms">
          {money(l.amount, currency)}/{l.interval === "year" ? "year" : "month"}{" "}
          for {l.schedule.after_paid_invoices} paid invoices, then{" "}
          {money(l.schedule.then.amount, currency)}/
          {l.interval === "year" ? "year" : "month"}.
        </p>
      )}
      {!!l.min_term_months && (
        <p className="flow-terms">
          {l.min_term_months}-month minimum commitment.
        </p>
      )}
    </>
  );
}
/** The item is already visible here: read its own lines, not its visibility
 * alone (a care plan that depends on another choice is hidden on its own). */
function ItemTerms({ item, currency }: { item: QuoteItem; currency: string }) {
  const lines = quoteSublines([item], false, true);
  const line = lines.find((l) => l.interval !== "one_time") ?? lines[0];
  return line ? <Terms line={line} currency={currency} /> : null;
}
function ChosenItems({
  proposal: p,
  terms = false,
  inlineAmounts = false,
}: {
  proposal: PublicProposal;
  terms?: boolean;
  inlineAmounts?: boolean;
}) {
  return (
    <ul className="flow-chosen">
      {orderedItems(visibleQuote(p.quote as QuoteItem[]))
        .filter((i) => !i.optional || i.selected)
        .map((i) => (
          <li key={i.id}>
            <span>
              {i.name}
              {terms && <ItemTerms item={i} currency={p.currency} />}
            </span>
            {inlineAmounts ? (
              <span className="flow-choice-amounts">
                {i.sublines
                  .map(
                    (s) =>
                      formatMoney(s.amount * s.qty, p.currency, p.money_cents) +
                      intervalSuffix(s.interval),
                  )
                  .join(" + ")}
              </span>
            ) : (
              <span>
                {i.sublines.map((s) => (
                  <span key={s.id} style={{ display: "block" }}>
                    {formatMoney(s.amount * s.qty, p.currency, p.money_cents)}
                    {intervalSuffix(s.interval)}
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
    </ul>
  );
}

function Contact({
  name,
  email,
  company,
}: {
  name: string;
  email: string;
  show_powered_by?: boolean;
  company: string;
}) {
  return (
    <footer className="flow-sender-contact">
      <span>
        Questions? Contact{" "}
        {email ? (
          <a href={`mailto:${email}`}>{name || company || "the sender"}</a>
        ) : (
          name || company || "the sender"
        )}
      </span>
      {email && (
        <button
          className="contact-copy"
          type="button"
          aria-label={`Copy sender email: ${email}`}
          onClick={() => void copyContactValue(email)}
        >
          {email}
        </button>
      )}
    </footer>
  );
}
function FlowDocument(props: {
  logo?: string;
  workspaceLogo?: string;
  logoIcon?: string;
  forceFlowing?: boolean;
  proposal: PublicProposal;
  frozen?: boolean;
  busy?: boolean;
  onToggle?: (id: string, selected: boolean) => void;
}) {
  const [desktop, setDesktop] = useState(false);
  const [layoutFailed, setLayoutFailed] = useState(false);
  const position = useRef<ReturnType<typeof captureClientPosition>>(undefined);
  useLayoutEffect(() => {
    const query = matchMedia("(min-width: 1100px)");
    const change = () => {
      const documentRoot = document.getElementById("proposal-document");
      if (documentRoot)
        position.current = captureClientPosition(
          documentRoot.shadowRoot ?? documentRoot,
        );
      setDesktop(query.matches && !props.forceFlowing);
    };
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, [props.forceFlowing]);
  const ready = () => {
    const root = document.getElementById("proposal-document");
    if (root && position.current) {
      restoreClientPosition(root.shadowRoot ?? root, position.current);
      position.current = undefined;
    }
    document.dispatchEvent(new Event("client-document-ready"));
  };
  useLayoutEffect(() => {
    if (!desktop) ready();
  }, [desktop]);
  return (
    <>
      <ClientPrint
        proposal={props.proposal}
        logoIcon={props.logoIcon}
        logo={props.workspaceLogo ?? props.logo}
      />
      {desktop && !layoutFailed ? (
        <ClientPageSheets
          {...props}
          logo={props.workspaceLogo ?? props.logo}
          onReady={ready}
          onError={() => setLayoutFailed(true)}
        />
      ) : (
        <FlowingDocument {...props} />
      )}
    </>
  );
}
function FlowingDocument({
  logo,
  logoIcon,
  proposal: p,
  frozen = false,
  busy = false,
  onToggle,
}: {
  logo?: string;
  logoIcon?: string;
  proposal: PublicProposal;
  frozen?: boolean;
  busy?: boolean;
  onToggle?: (id: string, selected: boolean) => void;
}) {
  const listRoot = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const root = listRoot.current;
    if (!root) return;
    const update = () => sizeListMarkers(root);
    update();
    const resize = new ResizeObserver(update);
    resize.observe(root);
    document.fonts.addEventListener("loadingdone", update);
    return () => {
      resize.disconnect();
      document.fonts.removeEventListener("loadingdone", update);
    };
  }, [p]);
  const content = selectedContent(p.content, p.quote as QuoteItem[]);
  const spaces = p.resolved_styles?.layout
    ? documentSpacing(content, p.resolved_styles)
    : {};
  const blockProps = (block: Block, n: number) => {
    const box = blockBoxStyle(block.style);
    return {
      "data-document-block": block.id ?? n,
      "data-block-box": box ? true : undefined,
      style: {
        "--block-space-before": `${spaces[block.id ?? String(n)] ?? 0}px`,
        ...box,
      } as CSSProperties,
    };
  };
  return (
    <article
      ref={listRoot}
      className="paper flow-document proposal-typography document-reading"
      id="proposal-document"
    >
      <DocumentCover
        highlightFields={false}
        logo={logo}
        logoIcon={logoIcon}
        accent={p.company.accent_colour}
        cover={p.cover}
        map={p.variables}
        title={p.title}
        company={p.recipient.company}
        sender={p.contact.name || p.company.name}
        validUntil={p.valid_until}
        timezone={p.timezone}
      />
      {pairSignatureNodes(
        content,
        content.map((block, index) =>
          index === 0 &&
          block.type === "heading" &&
          block.text === "{{proposal.title}}" ? null : block.type ===
            "pricing_table" ? (
            <section
              key={index}
              {...blockProps(block, index)}
              id={`section-${index}`}
            >
              <h2>Your investment</h2>
              {!frozen && (
                <p>Optional items are your choice. Totals update as you go.</p>
              )}
              <div className="flow-quote">
                <ClientItems
                  proposal={p}
                  frozen={frozen}
                  busy={busy}
                  onToggle={onToggle}
                />
              </div>
            </section>
          ) : block.type === "contract" ? (
            <section
              key={index}
              id={`section-${index}`}
              className="flow-contract"
              {...blockProps(block, index)}
              dangerouslySetInnerHTML={{
                __html: renderBlocks(
                  [block],
                  p.quote as QuoteItem[],
                  p.variables,
                  p.currency,
                ),
              }}
            />
          ) : block.type === "signature_block" ? (
            <div key={index} {...blockProps(block, index)}>
              <ClientSignatureBlock
                proposal={p}
                role={block.role ?? "client"}
              />
            </div>
          ) : (
            <div
              id={`section-${index}`}
              key={index}
              {...blockProps(block, index)}
              dangerouslySetInnerHTML={{
                __html: renderBlocks(
                  [block],
                  p.quote as QuoteItem[],
                  p.variables,
                  p.currency,
                  undefined,
                  p.resolved_styles,
                ),
              }}
            />
          ),
        ),
        p.pagination,
      )}
      <p className="muted document-end">
        {p.valid_until && (
          <>Valid until {readableDate(p.valid_until, p.timezone)} | </>
        )}
        From {p.company.name}
      </p>
    </article>
  );
}

function ClientItems({
  proposal: p,
  frozen,
  busy,
  onToggle,
}: {
  proposal: PublicProposal;
  frozen: boolean;
  busy: boolean;
  onToggle?: (id: string, value: boolean) => void;
}) {
  const items = orderedItems(visibleQuote(p.quote as QuoteItem[])),
    units = Array.from(new Set(items.map((i) => i.choice_group_id ?? i.id)));
  function option(i: QuoteItem) {
    const active = !i.optional || !!i.selected;
    const body = (
      <QuoteItemBody
        item={i}
        active={active}
        currency={p.currency}
        cents={p.money_cents}
      />
    );
    return i.optional ? (
      <label
        data-client-question-id={i.id}
        className={`flow-quote-line ${active ? "selected" : ""}`}
        data-client-optional={!i.choice_group_id || undefined}
        key={i.id}
      >
        <span className="quote-control-slot">
          <input
            type={i.choice_group_id ? "radio" : "checkbox"}
            name={i.choice_group_id ?? i.id}
            aria-label={`${i.name} | ${active ? "included" : "not included"}`}
            aria-description={
              i.choice_group_id && !choiceRequired(i)
                ? "Activate the selected option again to clear it."
                : undefined
            }
            onClick={(event) => {
              if (active && i.choice_group_id && !choiceRequired(i)) {
                event.preventDefault();
                onToggle?.(i.id, false);
              }
            }}
            checked={active}
            disabled={busy || frozen}
            onChange={(e) => onToggle?.(i.id, e.target.checked)}
          />
        </span>
        {body}
      </label>
    ) : (
      <div
        data-client-question-id={i.id}
        className="flow-quote-line selected"
        key={i.id}
      >
        <span className="quote-control-slot">
          <span
            className="quote-required"
            role="img"
            aria-label="Required"
            title="Required"
          />
        </span>
        {body}
      </div>
    );
  }
  if (quoteLayout(p.resolved_styles) === "table")
    return (
      <QuoteTable
        quote={items}
        currency={p.currency}
        cents={p.money_cents}
        disabled={busy || frozen}
        onToggle={onToggle}
        clientReading
      />
    );
  return (
    <>
      {units.map((id) => {
        const group = items.filter((i) => (i.choice_group_id ?? i.id) === id);
        return group[0].choice_group_id ? (
          <div
            role="radiogroup"
            aria-label={printedChoiceGroupLabel(group[0])}
            className="flow-choice-group"
            key={id}
          >
            <h3
              style={
                group[0].choice_group_label
                  ? { overflowWrap: "anywhere" }
                  : undefined
              }
            >
              {printedChoiceGroupLabel(group[0])}
            </h3>
            {group.map(option)}
          </div>
        ) : (
          option(group[0])
        );
      })}
    </>
  );
}

const previewSteps = [
  ["read", "Reading"],
  ["sign", "Signing"],
  ["billing", "Billing"],
] as const;

/** Staff preview chrome never overlays the public reading surface. */
function PreviewControls({ children }: { children: React.ReactNode }) {
  return (
    <aside
      className="preview-controls staff-foundation ink-clay"
      aria-label="Preview controls"
    >
      {children}
    </aside>
  );
}
