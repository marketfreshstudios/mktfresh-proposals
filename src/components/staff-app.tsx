"use client";
import { withCount } from "../lib/count-label";
import { StaffTable, StaffTableEmpty, StaffNativeTable } from "./staff-table";
import { Select } from "./form-controls";
import { ReloadSafetyProvider } from "./reload-safety";
import { DeploymentNotice } from "./deployment-notice";
import { staffPageName } from "../lib/staff-brand";
import { StaffResetForm } from "./staff-reset-form";
import { StaffAuthFrame } from "./staff-auth-frame";
import {
  ConfirmStaffEmail,
  nextStaffPage,
  SignedOutHeading,
  StaffAccessState,
  TwoStepSignIn,
} from "./staff-security-auth";
import { StudioTemplateList } from "./studio-template-list";
import { StudioHome } from "./studio-v3";
import { TeamStudio } from "./team-studio";
import {
  BillingConnectionDetail,
  ConnectionDetailLoading,
  connectionDetails,
} from "./connection-detail";
import { WorkspaceLoading } from "./workspace-studio";
import { Disclosure } from "./ui";
import { DialogActions } from "./dialog-actions";
import {
  connectionStatus,
  type ConnectionStatus,
} from "../lib/workspace-setup";
import { EmailsStudio } from "./email-studio";
import { ContactToast } from "./contact-value";
import {
  HomeV4,
  HomeLoading,
  ProposalListV4,
  ReportProposalList,
  RecordV4,
  ClientsV4,
} from "./records";
import { ReportsPage } from "./reports";
import { reportDrillSchema, reportFiltersSchema } from "../lib/report-filters";
import {
  WorkspaceStudio,
  CatalogStudio,
  TemplatesStudio,
  ConnectionsStudio,
  ConnectionsLoading,
  ActivityStudio,
} from "./studio";
import { ClientPicker } from "./client-picker";
import { ValidityField } from "./validity-field";
import { defaultValidUntil } from "../lib/validity";
import { StaffShell } from "./staff-shell";
import { AccountPage } from "./account-page";
import { staffName, type StaffAccount } from "../lib/staff-account-model";
import { Sheet, Skeleton } from "./foundation";
import { staffRoute, studioRoutes, type StaffQuery } from "../lib/staff-routes";
import { withDraftSettings } from "../lib/proposal-settings";
import type { ReferenceDocument } from "../lib/documents";
import { isValidElement, useEffect, useState, type ReactNode } from "react";
import {
  api,
  post,
  ApiError,
  Button,
  Banner,
  Field,
  Empty,
  ThemeToggle,
  date,
  Icon,
} from "./ui";
import { ProposalEditor } from "./editor";
import { renderBlocks, variables } from "../lib/presentation";
import { readiness } from "../lib/quote";
import { PlaybookDraftSchema } from "../lib/playbook";
import type {
  Actor,
  Proposal,
  Client,
  Item,
  Template,
  Block,
} from "../lib/model";
import { inView } from "../lib/proposal-state";
import type { WorkspaceSettings } from "../lib/workspace";
export type Data = {
  app_url: string;
  connections?: ConnectionStatus | null;
  user: Actor & { staff_home_banner_dismissed?: boolean };
  account?: StaffAccount;
  signatory_version: string;
  staff: {
    user_id: string;
    name: string;
    display_name: string;
    email: string;
    role: string;
    status?: string;
    photo_url?: string;
  }[];
  settings: WorkspaceSettings | null;
  workspace_defaults?: WorkspaceSettings;
  proposals: Proposal[];
  total: number;
  clients: Client[];
  catalog: Item[];
  catalog_error?: string;
  templates: Template[];
  library: import("../lib/model").SavedBlock[];
  families: { id: string; name: string; active: boolean }[];
  documents: ReferenceDocument[];
  assistants: {
    id: string;
    name: string;
    scopes: string[];
    last_used: string | null;
    revoked: boolean;
  }[];
};
type StaffAppProps = { path: string[]; query?: StaffQuery; local?: boolean };
export function StaffApp(props: StaffAppProps) {
  return (
    <ReloadSafetyProvider>
      <StaffAppContent {...props} />
    </ReloadSafetyProvider>
  );
}
function StaffAppContent({
  path,
  query = {},
  local = false,
}: {
  path: string[];
  query?: StaffQuery;
  local?: boolean;
}) {
  const { section, id, action } = staffRoute(path, query);
  const requestedConnection =
    section === "integrations"
      ? (id ?? (query.view === "email" ? "email" : ""))
      : section === "imports"
        ? "imports"
        : section === "settings" && id === "ai"
          ? "assistants"
          : "";
  const connectionDetail = Object.hasOwn(connectionDetails, requestedConnection)
    ? (requestedConnection as keyof typeof connectionDetails)
    : undefined;
  const drill =
    section === "proposals" && !id
      ? reportDrillSchema.safeParse(query).data
      : undefined;
  const reportFilters = drill
    ? reportFiltersSchema.safeParse(query).data
    : undefined;
  const reportShell = section === "reports" || (!!drill && !!reportFilters);
  const [newOpen, setNewOpen] = useState(query.new === "1");
  function closeNew() {
    setNewOpen(false);
    if (query.new === "1") {
      const url = new URL(location.href);
      url.searchParams.delete("new");
      history.replaceState(null, "", url.pathname + url.search);
    }
  }
  function openNew() {
    if (reportShell || section === "account")
      location.href = "/proposals?new=1";
    else setNewOpen(true);
  }
  const [data, setData] = useState<Data | null>(null),
    [p, setP] = useState<Proposal | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState("");
  async function load(preservePage = false) {
    if (!preservePage) setLoading(true);
    setError("");
    try {
      const session = await api<{
        settings: WorkspaceSettings | null;
        workspace_defaults?: WorkspaceSettings;
        user: Data["user"];
        account?: StaffAccount;
        signatory_version: string;
        app_url: string;
        staff: Data["staff"];
      }>("/api/auth/session");
      if (reportShell || section === "account") {
        setData({
          ...session,
          total: 0,
          proposals: [],
          clients: [],
          catalog: [],
          templates: [],
          library: [],
          families: [],
          documents: [],
          assistants: [],
        });
        return;
      }
      const [
        proposals,
        clients,
        catalog,
        templates,
        library,
        families,
        documents,
        assistants,
        connections,
      ] = await Promise.all([
        allProposals(),
        api("/api/clients"),
        api("/api/pricing_items").catch((e) => ({ load_error: e.message })),
        api("/api/templates"),
        api("/api/content_library"),
        api("/api/custom_families"),
        api("/api/workspace_documents"),
        api("/api/assistants"),
        api("/api/connections")
          .then(connectionStatus)
          .catch(() => null),
      ]);
      setData({
        settings: session.settings,
        workspace_defaults: session.workspace_defaults,
        app_url: session.app_url,
        user: session.user,
        account: session.account,
        signatory_version: session.signatory_version,
        staff: session.staff ?? [],
        proposals: proposals.items,
        total: proposals.total,
        clients,
        catalog: Array.isArray(catalog) ? catalog : [],
        catalog_error: Array.isArray(catalog)
          ? undefined
          : (catalog as { load_error: string }).load_error,
        templates,
        library,
        families,
        documents,
        assistants,
        connections,
      });
      if (["proposals", "archives"].includes(section) && id && id !== "new")
        setP(await api(`/api/proposals/${id}`));
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.message.includes("Choose a new password")
      ) {
        location.href = "/set-password";
        return;
      }
      if (e instanceof ApiError && e.status === 401 && !data) {
        location.href =
          "/login?next=" +
          encodeURIComponent(location.pathname + location.search);
        return;
      }
      setError(e instanceof Error ? e.message : "Unable to load workspace");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (section !== "billing")
      document.title = `${p?.title ?? staffPageName(path)} · Yeswell`;
  }, [section, p?.title, path.join("/")]);
  useEffect(() => {
    if (section !== "login" && section !== "billing") void load();
  }, [section, id, action, reportShell]);
  // Workspace fixes (e.g. business state) are made in a new tab from the
  // editor's readiness notices; refresh settings when staff come back so the
  // notice clears without reloading the draft.
  useEffect(() => {
    if (!["proposals", "archives"].includes(section) || !id) return;
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const session = await api<{ settings: WorkspaceSettings | null }>(
          "/api/auth/session",
        );
        setData((d) => (d ? { ...d, settings: session.settings } : d));
      } catch {
        // Keep the current settings; the next full load will retry.
      }
    }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [section, id]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        event.key.toLowerCase() === "n" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !target.isContentEditable &&
        !target.closest(
          "input,textarea,select,[contenteditable=true],[role=dialog],dialog",
        )
      ) {
        event.preventDefault();
        openNew();
      }
    }
    if (section !== "login") window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [section, reportShell]);
  if (section === "login")
    return path[1] === "confirm-email" ? (
      <ConfirmStaffEmail />
    ) : (
      <Login local={local} initialState={query.state} />
    );
  if (section === "billing")
    return (
      <div className="login card">
        <h1>
          {id === "complete"
            ? "Billing setup received"
            : "Billing setup is still pending"}
        </h1>
        <p>
          Your proposal remains signed. Return to the link in your proposal
          email to see its latest status.
        </p>
      </div>
    );
  const run = async (fn: () => Promise<unknown>, success = "Saved") => {
    try {
      setError("");
      await fn();
      setNotice(success);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to complete action");
    }
  };
  const pageData = loading ? null : data;
  let title = staffPageName(path),
    subtitle = "",
    content: ReactNode = null,
    headerAction: ReactNode = null;
  if (section === "") {
    content = pageData ? (
      <HomeV4
        data={pageData}
        onNew={openNew}
        onSetupChanged={() => load(true)}
        deploymentNotice={<DeploymentNotice enabled navigationKey="/" />}
      />
    ) : loading ? (
      <HomeLoading onNew={openNew} />
    ) : null;
  } else if (section === "reports") {
    content = <ReportsPage query={query} />;
  } else if (section === "clients") {
    if (loading || pageData)
      content = <ClientsV4 data={pageData} selected={id} onRefresh={load} />;
  } else if (section === "proposals" && !id && !reportShell) {
    subtitle = pageData
      ? withCount(
          pageData.proposals.filter((proposal) => inView(proposal, "all"))
            .length,
          "proposal",
        )
      : loading
        ? "Loading proposals…"
        : "";
    headerAction = (
      <div className="actions">
        <a className="btn" href="/reports">
          Reports
        </a>
        <Button
          variant={pageData?.total === 0 ? undefined : "primary"}
          className={pageData?.total === 0 ? undefined : "action"}
          onClick={openNew}
        >
          New proposal
        </Button>
      </div>
    );
    if (loading || pageData)
      content = (
        <ProposalListV4
          data={pageData}
          initialView={typeof query.view === "string" ? query.view : "all"}
          onChanged={(next) =>
            setData(
              (current) =>
                current && {
                  ...current,
                  proposals: current.proposals.map((proposal) =>
                    proposal.id === next.id ? next : proposal,
                  ),
                },
            )
          }
        />
      );
  } else if ((loading || pageData) && section === "catalogue") {
    content = <CatalogStudio data={pageData} run={run} />;
  } else if ((loading || pageData) && section === "emails") {
    content = <EmailsStudio data={pageData} id={id} />;
  } else if (
    (loading || pageData) &&
    !id &&
    (section === "templates" || section === "library")
  ) {
    content = (
      <StudioTemplateList data={pageData} blocks={section === "library"} />
    );
  } else if ((loading || pageData) && section === "activity") {
    content = (
      <ActivityStudio
        data={pageData}
        initialFilter={query.view === "team" ? "Team" : "All"}
      />
    );
  } else if (loading) {
    if (connectionDetail) {
      content = <ConnectionDetailLoading page={connectionDetail} />;
    } else if (section === "integrations") {
      content = <ConnectionsLoading />;
    } else if (section === "settings") {
      subtitle = "How proposals look and who can send and sign them.";
      content = (
        <WorkspaceLoading
          initial={
            id === "team"
              ? "team"
              : typeof query.view === "string"
                ? query.view
                : undefined
          }
        />
      );
    } else {
      content = <Skeleton kind={id ? "document" : "table"} />;
    }
    if (reportShell) subtitle = "Filtered from Reports";
    if (section === "proposals" && id) {
      title =
        action === "send"
          ? "Send this proposal"
          : action === "audit"
            ? "Audit trail"
            : "Proposal";
    }
  } else if (data) {
    if (section === "studio") {
      content = <StudioHome data={data} />;
    } else if (section === "proposals" && id === "new") {
      title = "New proposal";
      subtitle =
        "Choose a client and template, then shape the scope and quote.";
      headerAction = (
        <a className="btn" href="/proposals">
          Cancel
        </a>
      );
      content = <NewProposal data={data} />;
    } else if (["proposals", "archives"].includes(section) && p) {
      title =
        action === "send"
          ? "Send this proposal"
          : action === "audit"
            ? "Audit trail"
            : p.title;
      subtitle =
        p.client.company +
        (p.sender ? ` · Sent by ${p.sender.display_name}` : "") +
        (p.valid_until ? " · " + date(p.valid_until) : "");
      headerAction = null;
      content = p.archived_at ? (
        <RecordV4 p={p} data={data} onChanged={setP} onRefresh={load} />
      ) : (p.status === "draft" &&
          (!action || action === "edit" || action === "send")) ||
        (["edit", "send"].includes(action) &&
          p.source === "native" &&
          !p.marked_won_by) ? (
        <ProposalEditor
          appUrl={data.app_url}
          initial={p}
          initialTab={action === "send" ? "Review & send" : "Quote"}
          settings={data.settings}
          connections={data.connections}
          catalog={data.catalog}
          families={data.families}
          library={data.library}
          staff={data.staff}
          user={data.user}
          documents={data.documents}
          onSaved={setP}
        />
      ) : action === "countersign" ? (
        <RecordV4
          p={p}
          data={data}
          onChanged={setP}
          onRefresh={load}
          countersign
        />
      ) : action === "audit" ? (
        <Audit p={p} />
      ) : (
        <RecordV4 p={p} data={data} onChanged={setP} onRefresh={load} />
      );
    } else if (section === "proposals" && drill && reportFilters) {
      subtitle = "Filtered from Reports";
      content = (
        <ReportProposalList data={data} drill={drill} filters={reportFilters} />
      );
    } else if (id && (section === "templates" || section === "library")) {
      content = (
        <TemplatesStudio
          data={data}
          selected={id}
          run={run}
          blocksOnly={section === "library"}
        />
      );
    } else if (section === "imports") {
      headerAction = null;
      content = <ConnectionsStudio data={data} run={run} initial="imports" />;
    } else if (section === "integrations") {
      headerAction = null;
      content =
        id === "quickbooks" || id === "stripe" ? (
          <BillingConnectionDetail
            key={id}
            provider={id === "quickbooks" ? "qbo" : "stripe"}
            data={data}
          />
        ) : (
          <ConnectionsStudio
            data={data}
            run={run}
            initial={
              id === "email" || id === "imports" || id === "assistants"
                ? id
                : query.view === "email"
                  ? "email"
                  : undefined
            }
          />
        );
    } else if (section === "settings" && id === "team") {
      title = "Team";
      headerAction = null;
      title = "Workspace";
      subtitle = "How proposals look and who can send and sign them.";
      content = <WorkspaceStudio data={data} run={run} initial="team" />;
    } else if (section === "settings" && id === "ai") {
      title = "AI assistants";
      subtitle =
        "Read reference data and draft proposals. A person always reviews and sends.";
      headerAction = null;
      content = (
        <ConnectionsStudio data={data} run={run} initial="assistants" />
      );
    } else if (section === "settings") {
      headerAction = null;
      subtitle = "How proposals look and who can send and sign them.";
      content = (
        <WorkspaceStudio
          data={data}
          run={run}
          initial={typeof query.view === "string" ? query.view : undefined}
        />
      );
    } else
      content = (
        <Empty
          title="Page not found"
          action={<a href="/">Return to dashboard</a>}
        />
      );
  }
  async function signout() {
    await post("/api/auth/logout");
    location.href = "/login";
  }
  if (section === "account")
    content = (
      <AccountPage
        id={id}
        profile={query.view === "profile"}
        data={data}
        onSignout={() => void signout()}
      />
    );
  const ownsHeading =
    isValidElement(content) &&
    (content.type === RecordV4 ||
      content.type === ProposalEditor ||
      content.type === TemplatesStudio);
  return (
    <StaffShell
      path={path}
      record={isValidElement(content) && content.type === RecordV4}
      settings={data?.settings ?? data?.workspace_defaults ?? null}
      name={data?.user.staff_name ?? ""}
      email={data?.user.staff_email ?? ""}
      role={data?.user.staff_role}
      account={data?.account}
      onAccountChanged={(account) =>
        setData(
          (current) =>
            current && {
              ...current,
              account,
              user: {
                ...current.user,
                staff_name:
                  staffName(account.first_name, account.last_name) ||
                  current.user.staff_name,
              },
            },
        )
      }
      onNew={openNew}
      onSignout={() => void signout()}
    >
      <ContactToast />
      {section !== "" &&
        section !== "reports" &&
        section !== "clients" &&
        section !== "account" &&
        !connectionDetail &&
        !ownsHeading &&
        !(section === "emails" && id) && (
          <header className="page-header">
            <div>
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {headerAction}
          </header>
        )}
      {section !== "" && (
        <DeploymentNotice
          enabled={action !== "countersign"}
          navigationKey={path.join("/")}
        />
      )}
      <div className="page-body stack">
        {error && (
          <Banner
            tone="danger"
            title="Unable to complete this action"
            action={<Button onClick={() => void load()}>Reload</Button>}
          >
            {error}
          </Banner>
        )}
        {data?.catalog_error && (
          <Banner
            tone="warning"
            title="We couldn’t load the products. Your saved lines are unchanged."
            action={
              <Button
                onClick={async () => {
                  try {
                    const catalog = await api<Item[]>("/api/pricing_items");
                    setData({ ...data, catalog, catalog_error: undefined });
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Try loading the products again",
                    );
                  }
                }}
              >
                Try again
              </Button>
            }
          >
            You can keep writing or add a custom item while the products is
            unavailable.
          </Banner>
        )}
        {notice && <Banner tone="success" title={notice} />} {content}
      </div>
      {newOpen && data && (
        <Sheet
          title="New proposal"
          className="new-proposal-sheet"
          onClose={closeNew}
        >
          <NewProposal data={data} onCancel={closeNew} />
        </Sheet>
      )}
    </StaffShell>
  );
}
async function allProposals() {
  const first = await api<{ items: Proposal[]; total: number }>(
    "/api/proposals?limit=100",
  );
  for (let offset = 100; offset < first.total; offset += 100) {
    const next = await api<{ items: Proposal[] }>(
      `/api/proposals?limit=100&offset=${offset}`,
    );
    first.items.push(...next.items);
  }
  return first;
}
function Login({
  local,
  initialState,
}: {
  local: boolean;
  initialState?: string | string[];
}) {
  // Server HTML is visible before hydration. Never let the browser submit the
  // form natively (GET /login) before the credential POST handler is installed.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [resumed, setResumed] = useState(false),
    [forgot, setForgot] = useState(false);
  const [state, setState] = useState(initialState);
  function continueSignIn(passwordChange?: boolean) {
    if (passwordChange) {
      location.href = "/set-password";
      return;
    }
    if (new URL(location.href).searchParams.get("resume") === "1") {
      setResumed(true);
      window.close();
      return;
    }
    location.href = nextStaffPage();
  }
  if (resumed)
    return (
      <StaffAuthFrame>
        <h1>You're signed in</h1>
        <p>Return to your editor and choose Retry to save your kept changes.</p>
      </StaffAuthFrame>
    );
  if (forgot) return <StaffResetForm onBack={() => setForgot(false)} />;
  if (state === "two-step") return <TwoStepSignIn done={continueSignIn} />;
  if (state === "paused" || state === "removed")
    return (
      <StaffAccessState
        state={state}
        back={() => {
          setState(undefined);
          setError("");
        }}
      />
    );
  return (
    <StaffAuthFrame>
      {state === "signed-out" ? <SignedOutHeading /> : <h1>Sign in</h1>}
      {error && (
        <Banner tone="danger" title="Unable to sign in">
          {error}
        </Banner>
      )}
      <form
        className="form"
        method="post"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            const result = await post("/api/auth/login", {
              email: f.get("email"),
              password: f.get("password"),
            });
            if (result.two_step_required) {
              setError("");
              setState("two-step");
              return;
            }
            continueSignIn(result.password_change_required);
          } catch (error) {
            const accountState = (error as ApiError).details?.state;
            if (
              accountState === "paused" ||
              accountState === "removed" ||
              (error instanceof Error &&
                error.message.startsWith("Staff access deactivated"))
            )
              setState(accountState === "removed" ? "removed" : "paused");
            else
              setError(
                error instanceof Error ? error.message : "Unable to sign in",
              );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Email address">
          <input type="email" name="email" required autoComplete="username" />
        </Field>
        <Field label="Password">
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
          />
        </Field>
        <button
          className="account-forgot"
          type="button"
          onClick={() => setForgot(true)}
        >
          Forgot password?
        </button>
        <Button
          type="submit"
          variant="primary"
          className="action"
          busy={busy}
          disabled={!ready}
        >
          Sign in
        </Button>
      </form>
      {local && (
        <details>
          <Disclosure>Local development sign-in</Disclosure>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await post("/api/auth/local", {
                  token: new FormData(e.currentTarget).get("token"),
                });
                location.href = nextStaffPage();
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            <Field label="Local token">
              <input name="token" type="password" required />
            </Field>
            <Button type="submit">Open local workspace</Button>
          </form>
        </details>
      )}
    </StaffAuthFrame>
  );
}
function NewProposal({
  data,
  onCancel,
}: {
  data: Data;
  onCancel?: () => void;
}) {
  const SectionHeading = onCancel ? "h3" : "h2";
  const [error, setError] = useState(""),
    [payload, setPayload] = useState<ReturnType<
      typeof PlaybookDraftSchema.parse
    > | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const encoded = new URL(location.href).searchParams.get("draft");
    if (encoded)
      try {
        const bytes = Uint8Array.from(
          atob(encoded.replaceAll("-", "+").replaceAll("_", "/")),
          (c) => c.charCodeAt(0),
        );
        setPayload(
          PlaybookDraftSchema.parse(
            JSON.parse(new TextDecoder().decode(bytes)),
          ),
        );
      } catch {
        setError("The playbook draft is invalid. Ask for a new handoff link.");
      }
  }, []);
  return (
    <div className="new-proposal-content stack">
      <p>Pick a client and a starting point. You can change both later.</p>
      <section className="stack">
        {payload && (
          <Banner tone="info" title={`From playbook ${payload.source_version}`}>
            Entered prices and the original payload will be preserved.
          </Banner>
        )}
        {error && (
          <Banner tone="danger" title="Draft could not be created">
            {error}
          </Banner>
        )}
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              let client = String(f.get("client"));
              if (!client && payload?.client)
                client = (await post<Client>("/api/clients", payload.client))
                  .id;
              const p = await post<Proposal>("/api/proposals", {
                client_id: client,
                template_id: f.get("template"),
                title: f.get("title"),
                valid_until: f.get("valid_until")
                  ? String(f.get("valid_until"))
                  : null,
                ...(f.get("password") ? { password: f.get("password") } : {}),
                ...(payload ? { playbook: payload } : {}),
              });
              location.href = `/proposals/${p.id}`;
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Unable to create draft",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <SectionHeading>Client</SectionHeading>
          <ClientPicker
            clients={data.clients}
            initial={
              typeof window !== "undefined"
                ? (new URL(location.href).searchParams.get("client") ?? "")
                : ""
            }
            required={!payload?.client}
          />
          <SectionHeading>Proposal</SectionHeading>
          <Field label="Title">
            <input
              key={payload?.title}
              name="title"
              defaultValue={payload?.title ?? ""}
              required
            />
          </Field>
          <Field label="Template">
            <Select
              name="template"
              required
              defaultValue={
                typeof window !== "undefined"
                  ? (new URL(location.href).searchParams.get("template") ?? "")
                  : ""
              }
            >
              <option value="">Choose a template</option>
              {data.templates
                .filter((t) => t.active)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </Field>
          <details>
            <Disclosure>Link settings</Disclosure>
            <div className="form">
              <Field label="Valid until">
                <ValidityField
                  timezone={data.settings?.timezone ?? "UTC"}
                  defaultValue={defaultValidUntil(
                    data.settings ?? {
                      timezone: "UTC",
                      default_validity_days: 30,
                    },
                  )}
                />
              </Field>
              <Field label="Proposal password (optional)">
                <input
                  type="password"
                  name="password"
                  minLength={8}
                  autoComplete="new-password"
                />
              </Field>
            </div>
          </details>
          <DialogActions>
            {onCancel && (
              <Button disabled={busy} onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              variant="primary"
              className="action"
              type="submit"
              busy={busy}
              disabled={
                !data.settings ||
                !data.templates.length ||
                error.startsWith("The playbook draft")
              }
              note={
                !data.settings
                  ? "Complete workspace settings first."
                  : !data.templates.length
                    ? "Create an active template first."
                    : undefined
              }
            >
              Create draft
            </Button>
          </DialogActions>
        </form>
      </section>
      <aside className="new-proposal-note">
        <SectionHeading>What happens next</SectionHeading>
        <ol>
          <li>The template and default quote are copied into a draft.</li>
          <li>You edit the content, prices and optional items.</li>
          <li>The readiness check mirrors send validation.</li>
          <li>Sending emails a private link and starts reminders.</li>
          <li>The client signs first. You counter-sign after.</li>
        </ol>
        <Banner tone="ai" title="Assistants can draft too">
          They can never send, sign, counter-sign or change billing.
        </Banner>
      </aside>
    </div>
  );
}
function Document({ p }: { p: Proposal }) {
  let html = "";
  try {
    const v = p.versions.at(-1);
    html = renderBlocks(
      v?.content ?? p.content,
      v?.quote ?? p.quote,
      v?.variables_resolved ?? variables(p),
      p.currency,
      p.workspace_settings?.money?.cents ?? "auto",
    );
  } catch (e) {
    html = "Preview unavailable until unresolved variables are fixed.";
  }
  return (
    <article className="paper" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
function Audit({ p }: { p: Proposal }) {
  const [verdict, setVerdict] = useState<Record<string, string>>({});
  return (
    <div className="stack">
      <section className="card">
        <h2 className="t-card-title">Integrity</h2>
        <h3>Content hash</h3>
        <div className="hash">
          {p.versions.at(-1)?.content_hash ?? "Not created until send"}
        </div>
        {p.files
          .filter((f) => f.kind === "sealed")
          .map((f) => (
            <div key={f.id} className="stack" style={{ marginTop: 20 }}>
              <h3>
                {f.stage === "company" ? "Final" : "Client-signed"} PDF hash
              </h3>
              <div className="hash">{f.sha256}</div>
              <Button
                onClick={async () => {
                  try {
                    const result = await api<{ valid: boolean }>(
                      `/api/proposals/${p.id}/files/${f.id}/verify`,
                    );
                    setVerdict((v) => ({
                      ...v,
                      [f.id]: result.valid
                        ? "Matches — this file is unchanged since sealing."
                        : "Does not match — investigate this file.",
                    }));
                  } catch {
                    setVerdict((v) => ({
                      ...v,
                      [f.id]: "Unable to verify. Try again.",
                    }));
                  }
                }}
              >
                Verify
              </Button>
              <p role="status">{verdict[f.id] ?? "Not checked yet"}</p>
            </div>
          ))}
      </section>
      <section className="card">
        <h2 className="t-card-title">Consent text as shown</h2>
        {p.signers.map((s) => (
          <div key={s.role}>
            <strong>
              {s.name} · {s.role}
            </strong>
            {s.application_statement && <p>{s.application_statement}</p>}
            {s.authorization_text && <p>{s.authorization_text}</p>}
            <p>{s.consent_text}</p>
            <small>
              {date(s.consent_at)} · IP {s.ip || "Not available"}
            </small>
          </div>
        ))}
      </section>
      <StaffTable className="table-wrap">
        <StaffNativeTable>
          <thead className="staff-table-head">
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Actor</th>
              <th>IP</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {!p.events.length && (
              <tr>
                <td colSpan={5}>
                  <StaffTableEmpty>No evidence recorded yet.</StaffTableEmpty>
                </td>
              </tr>
            )}
            {p.events.map((e) => (
              <tr key={e.id} id={`event-${e.id}`}>
                <td>{new Date(e.created_at).toLocaleString()}</td>
                <td>{e.type}</td>
                <td>{String(e.metadata.application_statement ?? e.actor)}</td>
                <td>{e.ip || "Not available"}</td>
                <td>
                  <details>
                    <Disclosure>Details</Disclosure>
                    <pre className="hash">
                      {JSON.stringify(e.metadata, null, 2)}
                    </pre>
                    <small>{e.user_agent || "User agent not available"}</small>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </StaffNativeTable>
      </StaffTable>
    </div>
  );
}
