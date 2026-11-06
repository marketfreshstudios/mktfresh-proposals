"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { renderEmailBody } from "../lib/email-template-content";
import type { RichText } from "../lib/model";

/** Scope the real mail stylesheet; preview width replaces the mail viewport. */
function mailStyles(document: Document) {
  const styles = new CSSStyleSheet();
  styles.replaceSync(
    [...document.querySelectorAll("style")]
      .map((s) => s.textContent)
      .join("\n"),
  );
  const visit = (rules: CSSRuleList, dark = false): string =>
    [...rules]
      .map((rule) => {
        if (rule instanceof CSSStyleRule) {
          const scope = `.email-rendered${dark ? '[data-dark="true"]' : ""}`;
          const selectors = rule.selectorText.split(",").flatMap((selector) => {
            const value = selector.trim();
            if (value === ":root" || value === "body") return [scope];
            return [
              `${scope} ${value}`,
              ...(document.body.matches(value) ? [scope] : []),
            ];
          });
          return `${selectors.join(",")}{${rule.style.cssText}}`;
        }
        if (rule instanceof CSSMediaRule) {
          if (rule.conditionText.includes("prefers-color-scheme"))
            return visit(rule.cssRules, true);
          return `@container email-preview ${rule.conditionText.replace(/^screen and /, "")} {${visit(rule.cssRules, dark)}}`;
        }
        return "";
      })
      .join("\n");
  return visit(styles.cssRules);
}
export function EmailCanvas({
  html,
  renderKey,
  body,
  values,
  dark,
  bodyEditor,
  buttonEditor,
  caption,
  bodyFrame,
}: {
  html: string;
  renderKey: string;
  body: RichText;
  values: Record<string, string>;
  dark: boolean;
  bodyEditor: ReactNode;
  buttonEditor: ReactNode;
  caption: string;
  bodyFrame: React.RefObject<HTMLElement | null>;
}) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef({ html, body, values });
  latest.current = { html, body, values };
  const [targets, setTargets] = useState<{
    body: HTMLDivElement;
    button: HTMLSpanElement;
    caption: HTMLParagraphElement;
  } | null>(null);
  const stable = useRef<typeof targets>(null);
  useLayoutEffect(() => {
    const { html, body, values } = latest.current;
    const parsed = new DOMParser().parseFromString(html, "text/html"),
      wrap = document.createElement("div");
    wrap.className = `email-rendered editor-paper ${parsed.body.className}`;
    wrap.dataset.dark = String(dark);
    wrap.style.cssText = parsed.body.getAttribute("style") ?? "";
    wrap.innerHTML = parsed.body.innerHTML;
    wrap.querySelectorAll("a").forEach((link) => {
      link.dataset.previewHref = link.getAttribute("href") ?? "";
      link.removeAttribute("href");
    });
    const content = wrap.querySelector<HTMLElement>(".email-body"),
      cta = wrap.querySelector<HTMLElement>(".email-cta");
    if (!content || !cta) return;
    const nodes = stable.current ?? {
      body: document.createElement("div"),
      button: document.createElement("span"),
      caption: document.createElement("p"),
    };
    nodes.body.className = "email-editor-body block-frame";
    nodes.body.dataset.blockId = "email-body";
    nodes.body.setAttribute("data-history-block", "email-body");
    nodes.button.className = "email-button-edit";
    nodes.caption.className = "email-button-caption email-muted";
    nodes.caption.dataset.editorChrome = "";
    // The renderer may append receipt/job facts. Only the authored prefix is editable.
    const authored = new DOMParser().parseFromString(
      renderEmailBody(body, values).html,
      "text/html",
    );
    for (let n = 0; n < authored.body.childNodes.length; n++)
      content.firstChild?.remove();
    content.prepend(nodes.body);
    cta.replaceChildren(nodes.button);
    cta.closest("table")?.after(nodes.caption);
    const style = document.createElement("style");
    style.textContent = mailStyles(parsed);
    host.current?.replaceChildren(style, wrap);
    stable.current = nodes;
    bodyFrame.current = nodes.body;
    setTargets(nodes);
    return () => {
      bodyFrame.current = null;
    };
  }, [renderKey]);
  useLayoutEffect(() => {
    host.current
      ?.querySelector<HTMLElement>(".email-rendered")
      ?.setAttribute("data-dark", String(dark));
  }, [dark, targets]);
  return (
    <>
      <div
        className="email-real-renderer"
        ref={host}
        aria-label="Email preview"
      />
      {targets && (
        <>
          {createPortal(bodyEditor, targets.body)}
          {createPortal(buttonEditor, targets.button)}
          {createPortal(caption, targets.caption)}
        </>
      )}
    </>
  );
}
