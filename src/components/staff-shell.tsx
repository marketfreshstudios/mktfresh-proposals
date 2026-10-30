"use client";
import type { ReactNode } from "react";
import { useState } from "react";
import { Sheet } from "./foundation";
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
  const current = "/" + path.join("/");
  const insideProposal =
    path[0] === "proposals" && !!path[1] && path[1] !== "new";
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
        className={`staff-foundation shell ${insideProposal ? "inside-proposal" : ""}`}
        style={
          {
            "--accent": settings?.accent_colour ?? "#365C4A",
          } as React.CSSProperties
        }
      >
        <a className="skip-link" href="#workspace-content">
          Skip to content
        </a>
        <aside className="sidebar">
          <a className="brand" href="/">
            {settings?.logo ? (
              <img src="/api/workspace-logo" alt={settings.company_name} />
            ) : (
              (settings?.company_name ?? "Your workspace")
            )}
          </a>
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
          <footer>
            <button
              className="studio-trigger"
              aria-haspopup="dialog"
              aria-expanded={studio}
              onClick={() => setStudio(true)}
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
            <button
              className={path[0] === "studio" ? "active" : ""}
              onClick={() => setStudio(true)}
              aria-haspopup="dialog"
            >
              <Icon name="studio" />
              <span>Studio</span>
            </button>
          </nav>
        )}
        {studio && (
          <Sheet title="Studio" onClose={() => setStudio(false)}>
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
            <div className="phone-person">
              <p>{name}</p>
              <ThemeToggle />
              <button className="btn ghost" onClick={onSignout}>
                Sign out
              </button>
            </div>
          </Sheet>
        )}
      </div>
    </MoneyProvider>
  );
}
