"use client";

import { CircleHelp } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { PublicQuestion } from "../lib/proposal-questions";
import type { QuestionTarget } from "../lib/question-targets";

export type QuestionRequest = {
  target: QuestionTarget;
  anchor?: HTMLElement;
  trigger?: HTMLElement;
};

export function isPhoneReading() {
  return (
    (document.querySelector(".flow-stage")?.getBoundingClientRect().width ??
      innerWidth) < 700
  );
}

export function ClientQuestionButton({
  label,
  className = "",
  page,
  style,
  onClick,
}: {
  label: string;
  className?: string;
  page?: string;
  style?: CSSProperties;
  onClick: (button: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      className={`client-ask-icon ${className}`}
      aria-label={label}
      aria-description={page}
      aria-haspopup="dialog"
      title={label}
      style={style}
      onClick={(event) => onClick(event.currentTarget)}
    >
      <CircleHelp size={18} aria-hidden="true" />
    </button>
  );
}

const selector =
  "[data-document-block],[data-column-block],[data-client-question-id],[data-client-item-id]";
function key(node: HTMLElement) {
  return (
    node.dataset.clientQuestionId ??
    node.dataset.clientItemId ??
    node.dataset.documentBlock ??
    node.dataset.columnBlock
  );
}
function canAskAboutBlock(target: QuestionTarget, phone: boolean) {
  return (
    !phone ||
    target.kind === "paragraph" ||
    target.kind === "list" ||
    target.kind === "image" ||
    target.kind === "term" ||
    target.kind === "quote line"
  );
}
function rootOf(wrapper: HTMLElement) {
  const document = wrapper.querySelector("#proposal-document");
  const root = document?.shadowRoot ?? document;
  // Terms clauses come from the published HTML; tag each clause heading and
  // body here (pagination splits them into separate atoms) instead of
  // changing that frozen markup.
  for (const part of root?.querySelectorAll<HTMLElement>(
    "[data-print-part]:not([data-client-question-id])",
  ) ?? [])
    part.dataset.clientQuestionId = part.dataset.printPart;
  return root;
}

export function goToQuestionTarget(id: string) {
  const wrapper = document.querySelector<HTMLElement>(".flow-question-surface");
  if (!wrapper) return;
  const node = [
    ...(rootOf(wrapper)?.querySelectorAll<HTMLElement>(selector) ?? []),
  ].find((node) => key(node) === id);
  node?.scrollIntoView({ block: "center" });
  node?.focus({ preventScroll: true });
}

type TargetSelection = { node: HTMLElement; phone: boolean };
type Positioned = {
  node: HTMLElement;
  x: number;
  y: number;
  id: string;
  width?: number;
};
export function ClientQuestionSurface({
  children,
  targets,
  threads,
  onAsk,
}: {
  children: ReactNode;
  targets: Map<string, QuestionTarget>;
  threads: PublicQuestion[];
  onAsk?: (request: QuestionRequest) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<TargetSelection | null>(null);
  const [layout, setLayout] = useState<{
    pages: Positioned[];
    markers: Positioned[];
    active?: Positioned;
    phone: boolean;
  }>({ pages: [], markers: [], phone: false });
  const handlers = useRef({ onAsk, targets, active, threads });
  handlers.current = { onAsk, targets, active, threads };

  useEffect(() => {
    const wrapper = ref.current!;
    const targetFromEvent = (event: Event) =>
      event
        .composedPath()
        .find(
          (node): node is HTMLElement =>
            node instanceof HTMLElement &&
            !!handlers.current.targets.get(key(node) ?? ""),
        );
    let frame = 0;
    let observer: ResizeObserver;
    const project = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const root = rootOf(wrapper);
        const { onAsk, targets, active, threads } = handlers.current;
        const phone = isPhoneReading();
        const bounds = wrapper.getBoundingClientRect();
        const nodes = [
          ...(root?.querySelectorAll<HTMLElement>(selector) ?? []),
        ];
        const set = new Map<string, HTMLElement>();
        for (const node of nodes) {
          const id = key(node);
          const target = id ? targets.get(id) : undefined;
          if (!id || !target) continue;
          if (!set.has(id)) set.set(id, node);
          if (onAsk && canAskAboutBlock(target, phone)) {
            node.tabIndex = 0;
            node.dataset.clientAskTarget = "";
          } else if (node.hasAttribute("data-client-ask-target")) {
            node.removeAttribute("tabindex");
            node.removeAttribute("data-client-ask-target");
          }
        }
        const point = (node: HTMLElement, id: string) => {
          const rect = node.getBoundingClientRect();
          return {
            node,
            id,
            x: rect.right - bounds.left,
            y: rect.top - bounds.top,
          };
        };
        const pages =
          onAsk && !phone
            ? [
                ...(root?.querySelectorAll<HTMLElement>(".client-page-frame") ??
                  []),
              ].map((node) => point(node, node.dataset.page ?? "1"))
            : [];
        const marked = new Set(
          threads
            .filter(
              (thread) =>
                thread.block_id &&
                thread.replies.length === 0 &&
                thread.status === "open",
            )
            .map((thread) => thread.block_id!),
        );
        for (const node of nodes)
          node.toggleAttribute(
            "data-client-question-marked",
            phone && marked.has(key(node) ?? ""),
          );
        const markers = [...marked].flatMap((id) => {
          const node = set.get(id);
          if (!node) return [];
          const placed = point(node, id);
          return [
            phone
              ? {
                  ...placed,
                  y: node.getBoundingClientRect().bottom - bounds.top - 26,
                }
              : {
                  ...placed,
                  width: Math.min(
                    116,
                    Math.max(58, bounds.width - placed.x + 18),
                  ),
                },
          ];
        });
        const current =
          active?.phone === phone &&
          active.node.isConnected &&
          targets.has(key(active.node) ?? "")
            ? active.node
            : undefined;
        setLayout({
          pages,
          markers,
          active: current && {
            ...point(current, key(current)!),
            ...(phone
              ? {
                  y:
                    current.getBoundingClientRect().top +
                    current.getBoundingClientRect().height / 2 -
                    bounds.top,
                }
              : {}),
          },
          phone,
        });
      });
    };
    observer = new ResizeObserver(project);
    observer.observe(wrapper);
    const select = (node: HTMLElement, phone: boolean) =>
      setActive((last) =>
        last?.node === node && last.phone === phone ? last : { node, phone },
      );
    // Moving toward the ask button crosses other targets (a line item's
    // group, the next paragraph). Switch only after the pointer rests, and
    // keep the current target while the pointer is on the button itself.
    let pending = 0;
    const pointer = (event: PointerEvent) => {
      if (event.pointerType === "touch" || isPhoneReading()) return;
      window.clearTimeout(pending);
      if (
        event
          .composedPath()
          .some(
            (node) =>
              node instanceof HTMLElement &&
              node.classList.contains("client-ask-icon"),
          )
      )
        return;
      const target = targetFromEvent(event);
      if (!target || !handlers.current.onAsk) return;
      const current = handlers.current.active?.node;
      if (!current?.isConnected || current === target) select(target, false);
      else pending = window.setTimeout(() => select(target, false), 220);
    };
    const click = (event: MouseEvent) => {
      if (!isPhoneReading() || !handlers.current.onAsk) return;
      if (
        (event.composedPath()[0] as Element)?.closest?.(
          "input,button,a,select,textarea",
        )
      )
        return;
      const target = targetFromEvent(event);
      const question =
        target && handlers.current.targets.get(key(target) ?? "");
      if (!target || !question || !canAskAboutBlock(question, true)) return;
      // A second tap on the highlighted block clears it.
      const current = handlers.current.active;
      if (current?.phone && current.node === target) setActive(null);
      else select(target, true);
    };
    const focus = (event: FocusEvent) => {
      const target = targetFromEvent(event);
      if (
        !isPhoneReading() &&
        target &&
        event.composedPath()[0] === target &&
        handlers.current.onAsk
      )
        select(target, false);
    };
    const enter = (event: KeyboardEvent) => {
      const node = targetFromEvent(event);
      if (!node || event.composedPath()[0] !== node) return;
      const target = handlers.current.targets.get(key(node)!);
      if (
        event.key === "Enter" &&
        target &&
        canAskAboutBlock(target, isPhoneReading()) &&
        handlers.current.onAsk
      ) {
        event.preventDefault();
        handlers.current.onAsk({ target, anchor: node, trigger: node });
      }
    };
    let wasPhone = isPhoneReading();
    const resize = () => {
      const phone = isPhoneReading();
      if (phone !== wasPhone) setActive(null);
      wasPhone = phone;
      project();
    };
    const leave = () => {
      window.clearTimeout(pending);
      if (!isPhoneReading() && !wrapper.contains(document.activeElement))
        setActive(null);
    };
    wrapper.addEventListener("pointerover", pointer);
    wrapper.addEventListener("pointerleave", leave);
    wrapper.addEventListener("click", click);
    wrapper.addEventListener("focusin", focus);
    wrapper.addEventListener("keydown", enter);
    wrapper.addEventListener("client-question-project", project);
    document.addEventListener("client-document-ready", project);
    window.addEventListener("resize", resize);
    project();
    return () => {
      window.clearTimeout(pending);
      cancelAnimationFrame(frame);
      observer.disconnect();
      wrapper.removeEventListener("pointerover", pointer);
      wrapper.removeEventListener("pointerleave", leave);
      wrapper.removeEventListener("click", click);
      wrapper.removeEventListener("focusin", focus);
      wrapper.removeEventListener("keydown", enter);
      wrapper.removeEventListener("client-question-project", project);
      document.removeEventListener("client-document-ready", project);
      window.removeEventListener("resize", resize);
    };
  }, []);
  useLayoutEffect(() => {
    if (active && onAsk)
      active.node.dataset.clientAsking = active.phone ? "phone" : "desktop";
    ref.current?.dispatchEvent(new Event("client-question-project"));
    return () => {
      if (active) delete active.node.dataset.clientAsking;
    };
  }, [active, !!onAsk, targets, threads]);

  const highlighted = layout.active && targets.get(layout.active.id);
  return (
    <div className="flow-question-surface" ref={ref}>
      {children}
      {onAsk &&
        layout.pages.map(({ node, id, x, y }) => (
          <ClientQuestionButton
            key={id}
            label="Ask about this page"
            page={`Page ${id}`}
            className="client-ask-page"
            style={{ left: x, top: y }}
            onClick={(trigger) => {
              const first = [
                ...node.querySelectorAll<HTMLElement>(selector),
              ].find((block) => targets.has(key(block) ?? ""));
              const target = first && targets.get(key(first)!);
              onAsk({
                target: target ?? {
                  label: id === "1" ? "Cover" : `Page ${id}`,
                  ...(id === "1" ? { section: "section:cover" } : {}),
                },
                anchor: node,
                trigger,
              });
            }}
          />
        ))}
      {onAsk && highlighted && layout.active && (
        <ClientQuestionButton
          label={`Ask about this ${highlighted.kind ?? "block"}`}
          className={`client-ask-block ${layout.phone ? "client-ask-block-phone" : ""}`}
          style={{ left: layout.active.x, top: layout.active.y }}
          onClick={(trigger) =>
            onAsk({ target: highlighted, anchor: layout.active!.node, trigger })
          }
        />
      )}
      {layout.markers.map(({ id, x, y, width }) => (
        <span
          className="client-question-marker"
          key={id}
          style={{ left: x, top: y, width }}
        >
          Your question | waiting for a reply
        </span>
      ))}
    </div>
  );
}
