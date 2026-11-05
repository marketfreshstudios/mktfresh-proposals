"use client";
import { YeswellBrand } from "./yeswell-brand";
import type { ReactNode } from "react";
import { useState, useEffect, useRef } from "react";

import { Icon, ThemeToggle } from "./ui";
import { MoneyProvider } from "./money-context";
import { studioRoutes } from "../lib/staff-routes";
import type { WorkspaceSettings } from "../lib/workspace";
const primary = [
  ["/", "Home", "home"],
  ["/proposals", "Proposals", "proposals"],
  ["/clients", "Clients", "clients"],
] as const;
export function StaffShell({
  path,
  settings,
  name,
  email,
  onNew,
  onSignout,
  children,
}: {
  path: string[];
  settings: WorkspaceSettings | null;
  name: string;
  email: string;
  onNew: () => void;
  onSignout: () => void;
  children: ReactNode;
}) {
  const [studio, setStudio] = useState(false);
  const studioButton = useRef<HTMLButtonElement>(null),
    studioPopover = useRef<HTMLDivElement>(null);
  const current = "/" + path.join("/");
  const inStudio =
    path[0] === "studio" &&
    !(path[2] && ["templates", "blocks", "emails"].includes(path[1]));
  const insideProposal =
    path[0] === "proposals" && !!path[1] && path[1] !== "new";
  useEffect(() => {
    if (!studio) return;
    studioPopover.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStudio(false);
        studioButton.current?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [studio]);
  function nav(
    href: string,
    label: string,
    icon: "home" | "proposals" | "clients" | "studio",
  ) {
    const active = href === "/" ? current === "/" : current.startsWith(href);
    return (
      <a
        href={href}
        className={active ? "active" : ""}
        aria-current={active ? "page" : undefined}
      >
        <Icon name={icon} />
        <span>{label}</span>
      </a>
    );
  }
  return (
    <MoneyProvider mode={settings?.money?.cents ?? "auto"}>
      <div
        className={`staff-foundation shell ${insideProposal ? "inside-proposal" : ""} ${inStudio ? "studio-v3-shell" : ""}`}
      >
        <a className="skip-link" href="#workspace-content">
          Skip to content
        </a>
        <aside className="sidebar">
          <a className="brand" href="/">
            <span className="yeswell-wide">
              <YeswellBrand />
            </span>
            <span className="yeswell-tight">
              <YeswellBrand mark />
            </span>
          </a>
          <div className="workspace-label">
            {settings?.logo ? (
              <img src="/api/workspace-logo" alt="" />
            ) : (
              <span className="avatar">
                {settings?.company_name.slice(0, 1) ?? "W"}
              </span>
            )}
            <strong>{settings?.company_name ?? "Workspace"}</strong>
          </div>
          <button
            className="btn primary shell-new"
            onClick={onNew}
            aria-label="New proposal"
          >
            <Icon name="plus" />
            <span>New proposal</span>
            <kbd>N</kbd>
          </button>
          <nav aria-label="Main navigation">
            {primary.map(([href, label, icon]) => (
              <span className="nav-item" key={href}>
                {nav(href, label, icon)}
              </span>
            ))}
          </nav>
          <section className="desktop-studio">
            <h2>Studio</h2>
            <nav aria-label="Studio navigation">
              {studioRoutes.map(([href, label]) => (
                <span key={href}>{nav(href, label, "studio")}</span>
              ))}
            </nav>
          </section>
          <footer>
            <button
              ref={studioButton}
              className={`studio-trigger ${path[0] === "studio" ? "active" : ""}`}
              aria-haspopup="dialog"
              aria-expanded={studio}
              onClick={() => setStudio(!studio)}
            >
              <Icon name="studio" />
              <span>Studio</span>
            </button>
            <div className="shell-person">
              <span className="avatar" aria-hidden="true">
                {name.slice(0, 1) || "U"}
              </span>
              <span>
                {name}
                <small>{email}</small>
              </span>
            </div>
            <ThemeToggle />
            <button className="btn ghost sign-out" onClick={onSignout}>
              Sign out
            </button>
          </footer>
        </aside>
        <main className="workspace" id="workspace-content" tabIndex={-1}>
          {!insideProposal && (
            <a
              href="/"
              className="staff-mobile-brand"
              aria-label="Yeswell home"
            >
              <YeswellBrand mark />
            </a>
          )}
          {inStudio && (
            <>
              <div className="studio-tablet-header">
                <a href="/" aria-label="Yeswell home">
                  <YeswellBrand />
                </a>
                <span>{settings?.company_name ?? "Workspace"}</span>
                <span className="avatar">{name.slice(0, 1)}</span>
              </div>
              <nav className="studio-area-chips" aria-label="Studio areas">
                {studioRoutes.map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    aria-current={current.startsWith(href) ? "page" : undefined}
                  >
                    {label}
                  </a>
                ))}
              </nav>
              {path[1] && (
                <a className="studio-back" href="/studio">
                  ‹ Studio
                </a>
              )}
            </>
          )}
          {children}
        </main>
        {!insideProposal && (
          <nav className="bottom-tabs" aria-label="Phone navigation">
            {nav("/", "Home", "home")}
            {nav("/proposals", "Proposals", "proposals")}
            <button
              className="bottom-new"
              onClick={onNew}
              aria-label="New proposal"
            >
              <Icon name="plus" />
              <span className="sr-only">New proposal</span>
            </button>
            {nav("/clients", "Clients", "clients")}
            {nav("/studio", "Studio", "studio")}
          </nav>
        )}
        {studio && (
          <>
            <button
              className="studio-dismiss"
              aria-label="Close Studio menu"
              onClick={() => setStudio(false)}
            />
            <div
              className="studio-popover"
              role="dialog"
              aria-label="Studio"
              ref={studioPopover}
            >
              <nav className="studio-menu" aria-label="Studio navigation">
                {studioRoutes.map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    aria-current={current.startsWith(href) ? "page" : undefined}
                  >
                    {label}
                  </a>
                ))}
              </nav>
            </div>
          </>
        )}
      </div>
    </MoneyProvider>
  );
}
