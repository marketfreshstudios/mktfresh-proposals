"use client";
import type { PlanState } from "../lib/plan";
import { PlanBanner, PlanNote, WorkspacePlanProvider } from "./workspace-plan";
import { StudioAccount } from "./studio-account";
import { WorkspaceMark } from "./workspace-mark";
import { YeswellBrand } from "./yeswell-brand";
import { Sheet } from "./foundation";
import { StaffIconContext, chromeIcons } from "./staff-icons";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { Icon, Button } from "./ui";
import { MoneyProvider } from "./money-context";
import { studioRoutes } from "../lib/staff-routes";
import { staffPageName } from "../lib/staff-brand";
import type { WorkspaceSettings } from "../lib/workspace";
import type { StaffAccount } from "../lib/staff-account-model";
import { StaffAccountProvider } from "./staff-account-context";

// The sidebar's workspace name, logo and signed-in person, remembered in this
// browser so they show straight away while a page loads.
const identityKey = "yeswell:shell-identity";
type ShellIdentity = {
  workspace: Pick<WorkspaceSettings, "company_name" | "logo_icon">;
  name: string;
  email: string;
  role?: "owner" | "member";
};
const useBeforePaint =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
export function forgetShellIdentity() {
  try {
    localStorage.removeItem(identityKey);
  } catch {}
}

const primary = [
  ["/", "Home", "home"],
  ["/proposals", "Proposals", "proposals"],
  ["/reports", "Reports", "reports"],
  ["/clients", "Clients", "clients"],
  ["/studio", "Studio", "studio"],
] as const;

export function StaffShell({
  path,
  settings,
  name,
  email,
  account,
  onAccountChanged,
  role,
  onNew,
  onSignout,
  children,
  record = false,
  plan = null,
}: {
  path: string[];
  settings: WorkspaceSettings | null;
  name: string;
  email: string;
  account?: StaffAccount;
  onAccountChanged?: (account: StaffAccount) => void;
  role?: "owner" | "member";
  onNew: () => void;
  onSignout: () => void;
  children: ReactNode;
  record?: boolean;
  plan?: PlanState | null;
}) {
  const [drawer, setDrawer] = useState(false);
  const [remembered, setRemembered] = useState<ShellIdentity | null>(null);
  useBeforePaint(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(identityKey) ?? "null");
      if (saved?.workspace?.company_name) setRemembered(saved);
    } catch {}
  }, []);
  useEffect(() => {
    if (!settings || !name) return;
    try {
      localStorage.setItem(
        identityKey,
        JSON.stringify({
          workspace: {
            company_name: settings.company_name,
            logo_icon: settings.logo_icon ?? null,
          },
          name,
          email,
          role,
        } satisfies ShellIdentity),
      );
    } catch {}
  }, [settings, name, email, role]);
  // Live values win; the remembered ones only fill the gap while loading.
  const shownSettings = settings ?? remembered?.workspace ?? null;
  const shownName = name || remembered?.name || "";
  const shownEmail = email || remembered?.email || "";
  const shownRole = role ?? (name ? undefined : remembered?.role);
  const current = "/" + path.join("/");
  const studio = path[0] === "studio";
  const studioPage =
    studio && !(path[2] && ["templates", "blocks", "emails"].includes(path[1]));
  const insideProposal =
    path[0] === "proposals" && !!path[1] && path[1] !== "new";

  function nav([href, label, icon]: (typeof primary)[number], phone = false) {
    const active =
      href === "/"
        ? current === "/"
        : current === href || current.startsWith(href + "/");
    const parent = phone && href === "/proposals" && current === "/reports";
    return (
      <a
        key={href}
        href={href}
        className={active || parent ? "active" : ""}
        aria-current={
          active && current === href
            ? "page"
            : active || parent
              ? "location"
              : undefined
        }
      >
        <Icon name={icon} />
        <span>{label}</span>
      </a>
    );
  }
  const studioLinks = studioRoutes.map(([href, label]) => {
    const active =
      current === href ||
      current.startsWith(href + "/") ||
      (href === "/studio/templates" && current.startsWith("/studio/blocks/"));
    return (
      <a
        key={href}
        href={href}
        className={active ? "active" : ""}
        aria-current={active ? "page" : undefined}
      >
        {label}
      </a>
    );
  });
  function sideNavigation() {
    return (
      <>
        <nav aria-label="Main navigation">
          {primary.map((item) => nav(item))}
        </nav>
        {studio && (
          <nav className="studio-subnav" aria-label="Studio navigation">
            {studioLinks}
          </nav>
        )}
      </>
    );
  }
  const workspace = (
    <>
      <WorkspaceMark settings={shownSettings} />
      <strong>{shownSettings?.company_name ?? "Workspace"}</strong>
    </>
  );
  return (
    <WorkspacePlanProvider value={plan}>
      <StaffIconContext.Provider value>
        <StaffAccountProvider account={account} onChanged={onAccountChanged}>
          <MoneyProvider mode={settings?.money?.cents ?? "auto"}>
            <div
              className={`staff-foundation ink-clay shell ${insideProposal ? "inside-proposal" : ""} ${studioPage ? "studio-v3-shell" : ""}`}
            >
              <a className="skip-link" href="#workspace-content">
                Skip to content
              </a>
              <aside className="sidebar">
                <a className="brand" href="/" aria-label="Yeswell home">
                  <YeswellBrand reversed />
                </a>
                <div className="workspace-label">{workspace}</div>
                <PlanNote plan={plan} />
                {sideNavigation()}
                <footer>
                  <StudioAccount
                    name={shownName}
                    email={shownEmail}
                    role={shownRole}
                    onSignout={() => {
                      forgetShellIdentity();
                      onSignout();
                    }}
                  />
                </footer>
              </aside>
              <main className="workspace" id="workspace-content" tabIndex={-1}>
                {(!insideProposal || record) && (!studio || studioPage) && (
                  <div
                    className={`shell-tablet-header ${studioPage ? "studio-tablet-header" : ""}`}
                  >
                    <button
                      className="btn icon-only shell-drawer-trigger"
                      aria-label="Open navigation"
                      title="Open navigation"
                      aria-haspopup="dialog"
                      aria-expanded={drawer}
                      onClick={() => setDrawer(true)}
                    >
                      <chromeIcons.menu size={20} aria-hidden="true" />
                    </button>
                    <a href="/" aria-label="Yeswell home">
                      <YeswellBrand reversed />
                    </a>
                    <strong className="tablet-page-name">
                      {staffPageName(path)}
                    </strong>
                    {studioPage && (
                      <span className="tablet-workspace-label">
                        {workspace}
                      </span>
                    )}
                    <StudioAccount
                      name={shownName}
                      email={shownEmail}
                      role={shownRole}
                      onSignout={() => {
                        forgetShellIdentity();
                        onSignout();
                      }}
                    />
                  </div>
                )}
                {!insideProposal && path[0] !== "account" && (
                  <a
                    href="/"
                    className="staff-mobile-brand"
                    aria-label="Yeswell home"
                  >
                    <YeswellBrand mark reversed={current !== "/"} />
                  </a>
                )}
                {studioPage && (
                  <>
                    <nav
                      className="studio-area-chips"
                      aria-label="Studio areas"
                    >
                      {studioLinks}
                    </nav>
                    {path[1] && (
                      <a className="studio-back" href="/studio">
                        Studio
                      </a>
                    )}
                  </>
                )}
                <div className="plan-banner">
                  <PlanBanner plan={plan} />
                </div>
                {children}
              </main>
              {!insideProposal && (
                <nav className="bottom-tabs" aria-label="Phone navigation">
                  {nav(primary[0], true)}
                  {nav(primary[1], true)}
                  <button
                    className="bottom-new"
                    onClick={onNew}
                    disabled={plan?.mode === "read_only"}
                    aria-label="New proposal"
                    title="New proposal"
                  >
                    <Icon name="plus" />
                    <span className="sr-only">New proposal</span>
                  </button>
                  {nav(primary[3], true)}
                  {nav(primary[4], true)}
                </nav>
              )}
              {drawer && (
                <Sheet
                  title="Navigation"
                  className="staff-drawer"
                  onClose={() => setDrawer(false)}
                >
                  <div className="workspace-label">{workspace}</div>
                  <PlanNote plan={plan} />
                  {sideNavigation()}
                  <Button
                    disabled={plan?.mode === "read_only"}
                    onClick={() => {
                      setDrawer(false);
                      onNew();
                    }}
                  >
                    New proposal
                  </Button>
                </Sheet>
              )}
            </div>
          </MoneyProvider>
        </StaffAccountProvider>
      </StaffIconContext.Provider>
    </WorkspacePlanProvider>
  );
}
