"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
/** A UI lock only. The editor models and the existing conflict recovery stay intact. */
export function ReadOnlyRegion({
  locked,
  children,
  className = "",
}: {
  locked: boolean;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!locked || !ref.current) return;
    const prior = new Map<HTMLElement, string>();
    const lock = () =>
      ref.current
        ?.querySelectorAll<HTMLElement>("[contenteditable]")
        .forEach((el) => {
          if (!prior.has(el))
            prior.set(el, el.getAttribute("contenteditable")!);
          el.setAttribute("contenteditable", "false");
        });
    lock();
    const observer = new MutationObserver(lock);
    observer.observe(ref.current, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      prior.forEach((value, el) => el.setAttribute("contenteditable", value));
    };
  }, [locked]);
  return (
    <div
      ref={ref}
      className={`editor-readonly-region ${className}`}
      inert={locked || undefined}
    >
      <fieldset disabled={locked}>{children}</fieldset>
    </div>
  );
}
