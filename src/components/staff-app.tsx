"use client";
import {
  HomeV4,
  ProposalListV4,
  RecordV4,
  ClientsV4,
  ProposalRows,
  WorkspaceActivityV4,
} from "./records";
import { ClientPicker } from "./client-picker";
import { ValidityField } from "./validity-field";
import { defaultValidUntil } from "../lib/validity";
import { quoteSublines } from "../lib/quote-model";
import { intervalSuffix } from "../lib/money";
import { statusDisplay } from "../lib/status-display";
import { StaffShell } from "./staff-shell";
import { Sheet, Skeleton } from "./foundation";
import { staffRoute, studioRoutes, type StaffQuery } from "../lib/staff-routes";
import { useMoney } from "./money-context";
import { withDraftSettings } from "../lib/proposal-settings";
import { sellableCatalogue, itemDisplayName } from "../lib/catalogue-display";
import { TemplateWarnings } from "./template-warnings";
import { inactiveTemplateItems } from "../lib/template-quote";
import type { ReferenceDocument } from "../lib/documents";
import { ReferenceDocuments, ReferenceStatus } from "./reference-documents";
import { useEffect, useState, type ReactNode } from "react";
import {
  api,
  post,
  ApiError,
  Button,
  Banner,
  Field,
  Empty,
  Totals,
  JobState,
  Status,
  Signatures,
  ThemeToggle,
  date,
  Icon,
} from "./ui";
import { ProposalEditor, BlocksEditor } from "./editor";
import { StoredSignatureEditor } from "./company-signature";
import { renderBlocks, variables, totals } from "../lib/presentation";
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
import type { WorkspaceSettings } from "../lib/workspace";
const nav = [
  ["", "Dashboard"],
  ["proposals", "Proposals"],
  ["clients", "Clients"],
  ["catalogue", "Pricing"],
  ["templates", "Templates"],
  ["library", "Content library"],
  ["integrations", "Integrations"],
  ["imports", "Imports"],
  ["settings", "Settings"],
  ["settings/team", "Team"],
  ["settings/ai", "AI assistants"],
];
export type Data = {
  app_url: string;
  user: Actor;
  signatory_version: string;
  staff: {
    user_id: string;
    name: string;
    display_name: string;
    email: string;
    role: string;
  }[];
  settings: WorkspaceSettings | null;
  proposals: Proposal[];
  total: number;
  clients: Client[];
  catalog: Item[];
  templates: Template[];
  library: { id: string; name: string; block: Block }[];
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
export function StaffApp({
  path,
  query = {},
  local = false,
}: {
  path: string[];
  query?: StaffQuery;
  local?: boolean;
}) {
  const { section, id, action } = staffRoute(path, query);
  const [newOpen, setNewOpen] = useState(query.new === "1");
  const [data, setData] = useState<Data | null>(null),
    [p, setP] = useState<Proposal | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const session = await api<{
        settings: WorkspaceSettings | null;
        user: Actor;
        signatory_version: string;
        app_url: string;
        staff: Data["staff"];
      }>("/api/auth/session");
      const [
        proposals,
        clients,
        catalog,
        templates,
        library,
        families,
        documents,
        assistants,
      ] = await Promise.all([
        allProposals(),
        api("/api/clients"),
        api("/api/pricing_items"),
        api("/api/templates"),
        api("/api/content_library"),
        api("/api/custom_families"),
        api("/api/workspace_documents"),
        api("/api/assistants"),
      ]);
      setData({
        settings: session.settings,
        app_url: session.app_url,
        user: session.user,
        signatory_version: session.signatory_version,
        staff: session.staff ?? [],
        proposals: proposals.items,
        total: proposals.total,
        clients,
        catalog,
        templates,
        library,
        families,
        documents,
        assistants,
      });
      if (["proposals", "archives"].includes(section) && id && id !== "new")
        setP(await api(`/api/proposals/${id}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
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
    if (section !== "login" && section !== "billing") void load();
  }, [section, id, action]);
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
        setNewOpen(true);
      }
    }
    if (section !== "login") window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [section]);
  if (section === "login") return <Login local={local} />;
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
  const company = data?.settings?.company_name ?? "Your workspace";
  const run = async (fn: () => Promise<unknown>, success = "Saved") => {
    try {
      setError("");
      await fn();
      setNotice(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to complete action");
    }
  };
  let title =
      path[0] === "studio"
        ? ({
            templates: "Templates & blocks",
            catalog: "Catalog",
            connections: "Connections",
            workspace: "Workspace",
            activity: "Activity log",
          }[path[1]] ?? "Studio")
        : (nav.find(([key]) => key === section)?.[1] ?? "Workspace"),
    subtitle = "",
    content: ReactNode = null,
    headerAction: ReactNode = null;
  if (data) {
    if (section === "studio") {
      title = "Studio";
      content = (
        <nav className="studio-page" aria-label="Studio navigation">
          {studioRoutes.map(([href, label]) => (
            <a key={href} href={href}>
              <Icon name="studio" />
              {label}
              <span aria-hidden="true">→</span>
            </a>
          ))}
          <ThemeToggle />
          <Button
            onClick={async () => {
              await post("/api/auth/logout");
              location.href = "/login";
            }}
          >
            Sign out
          </Button>
        </nav>
      );
    } else if (section === "") {
      title = "Home";
      subtitle = new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      content = <HomeV4 data={data} />;
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
      ) : (!action || action === "edit" || action === "send") &&
        p.status === "draft" ? (
        <ProposalEditor
          initial={p}
          initialTab={action === "send" ? "Review & send" : "Quote"}
          settings={data.settings}
          catalog={data.catalog}
          families={data.families}
          library={data.library}
          staff={data.staff}
          user={data.user}
          documents={data.documents}
          onSaved={setP}
        />
      ) : action === "send" ? (
        <SendProposal
          data={data}
          p={p}
          catalog={data.catalog}
          onSent={(next) => {
            setP(next);
            location.href = `/proposals/${p.id}`;
          }}
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
    } else if (section === "proposals") {
      subtitle = `${data.total} proposals`;
      content = (
        <ProposalListV4
          data={data}
          initialView={typeof query.view === "string" ? query.view : "all"}
        />
      );
    } else if (section === "clients") {
      headerAction = null;
      content = <ClientsV4 data={data} selected={id} onRefresh={load} />;
    } else if (section === "catalogue") {
      headerAction = null;
      content = <Catalogue data={data} run={run} />;
    } else if (section === "templates") {
      headerAction = null;
      content = <Templates data={data} selected={id} run={run} />;
    } else if (section === "library") {
      headerAction = null;
      content = <Library data={data} run={run} />;
    } else if (section === "imports") {
      headerAction = null;
      content = (
        <div className="stack">
          <Banner title="Imported proposals are read-only">
            Imports are run separately in small batches. This screen reports
            their state.
          </Banner>
          <div className="card">
            <h2>Archive report</h2>
            <p>
              Run the CSV import, export, upload and reconciliation scripts
              described in README from your Mac. Match PDFs by the original
              proposal ID; review missing and unmatched files before another
              batch.
            </p>
            <p>
              {
                data.proposals.filter((p) => p.source === "proposify_import")
                  .length
              }{" "}
              imported records.{" "}
              {
                data.proposals.filter(
                  (p) =>
                    p.source === "proposify_import" &&
                    p.files?.some((f) => f.kind === "import"),
                ).length
              }{" "}
              have PDFs attached.{" "}
              {
                data.proposals.filter(
                  (p) =>
                    p.source === "proposify_import" &&
                    !p.files?.some((f) => f.kind === "import"),
                ).length
              }{" "}
              are missing PDFs.
            </p>
          </div>
          <ProposalRows
            data={data}
            proposals={data.proposals.filter(
              (p) => p.source === "proposify_import",
            )}
          />
        </div>
      );
    } else if (section === "integrations") {
      headerAction = null;
      content = <Integrations data={data} run={run} />;
    } else if (section === "settings" && id === "team") {
      title = "Team";
      headerAction = null;
      content = <Team data={data} run={run} />;
    } else if (section === "settings" && id === "ai") {
      title = "AI assistants";
      subtitle =
        "Read reference data and draft proposals. A person always reviews and sends.";
      headerAction = null;
      content = <Assistants data={data} run={run} />;
    } else if (section === "activity") {
      title = "Activity log";
      headerAction = null;
      content = <WorkspaceActivityV4 data={data} />;
    } else if (section === "settings") {
      headerAction = null;
      content = <Settings data={data} run={run} />;
    } else
      content = (
        <Empty
          title="Page not found"
          action={<a href="/">Return to dashboard</a>}
        />
      );
  }
  return (
    <StaffShell
      path={path}
      settings={data?.settings ?? null}
      name={data?.user.staff_name ?? ""}
      email={data?.user.staff_email ?? ""}
      onNew={() => setNewOpen(true)}
      onSignout={async () => {
        await post("/api/auth/logout");
        location.href = "/login";
      }}
    >
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {headerAction}
      </header>
      <div className="page-body stack">
        {path[0] === "studio" && (
          <nav className="studio-subnav" aria-label="Studio views">
            {path[1] === "templates" && (
              <>
                <a href="/studio/templates">Templates</a>
                <a href="/studio/templates?view=blocks">Reusable blocks</a>
              </>
            )}
            {path[1] === "connections" && (
              <>
                <a href="/studio/connections">Connections</a>
                <a href="/studio/connections?view=assistants">AI assistants</a>
                <a href="/studio/connections?view=imports">Proposify import</a>
              </>
            )}
            {path[1] === "workspace" && (
              <>
                <a href="/studio/workspace">Workspace</a>
                <a href="/studio/workspace?view=team">Team</a>
              </>
            )}
          </nav>
        )}
        {error && (
          <Banner
            tone="danger"
            title="Unable to complete this action"
            action={<Button onClick={load}>Reload</Button>}
          >
            {error}
          </Banner>
        )}
        {notice && <Banner tone="success" title={notice} />}{" "}
        {loading ? <Skeleton /> : content}
      </div>
      {newOpen && data && (
        <Sheet
          title="New proposal"
          onClose={() => {
            setNewOpen(false);
            if (query.new === "1")
              history.replaceState(null, "", location.pathname);
          }}
        >
          <NewProposal data={data} />
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
function Login({ local }: { local: boolean }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <ThemeToggle />
      <div className="card stack">
        <h1>Welcome back</h1>
        <p className="muted">Sign in to your proposal workspace.</p>
        {error && (
          <Banner tone="danger" title="Unable to sign in">
            {error}
          </Banner>
        )}
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const f = new FormData(e.currentTarget);
            try {
              await post("/api/auth/login", {
                email: f.get("email"),
                password: f.get("password"),
              });
              const next = new URL(location.href).searchParams.get("next");
              location.href =
                next?.startsWith("/") && !next.startsWith("//") ? next : "/";
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to sign in");
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
          <Button type="submit" variant="primary" busy={busy}>
            Sign in
          </Button>
        </form>
        {local && (
          <details>
            <summary>Local development sign-in</summary>
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await post("/api/auth/local", {
                    token: new FormData(e.currentTarget).get("token"),
                  });
                  const next = new URL(location.href).searchParams.get("next");
                  location.href =
                    next?.startsWith("/") && !next.startsWith("//")
                      ? next
                      : "/";
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
      </div>
    </main>
  );
}
function NewProposal({ data }: { data: Data }) {
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
    <div className="grid">
      <section className="card stack">
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
                  ? String(f.get("valid_until")) + "T23:59:59.999Z"
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
          <h2>Client</h2>
          <ClientPicker
            clients={data.clients}
            initial={
              typeof window !== "undefined"
                ? (new URL(location.href).searchParams.get("client") ?? "")
                : ""
            }
            required={!payload?.client}
          />
          <h2>Proposal</h2>
          <Field label="Title">
            <input
              key={payload?.title}
              name="title"
              defaultValue={payload?.title ?? ""}
              required
            />
          </Field>
          <Field label="Template">
            <select name="template" required>
              <option value="">Choose a template</option>
              {data.templates
                .filter((t) => t.active)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Valid until">
            <ValidityField
              defaultValue={defaultValidUntil(
                data.settings ?? { timezone: "UTC", default_validity_days: 30 },
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
          <Button
            variant="primary"
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
        </form>
      </section>
      <aside className="card">
        <h2>What happens next</h2>
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
function SendProposal({
  data,
  p,
  catalog,
  onSent,
}: {
  p: Proposal;
  catalog: Item[];
  data: Data;
  onSent: (p: Proposal) => void;
}) {
  p = withDraftSettings(p, data.settings);
  const [confirmed, setConfirmed] = useState(false),
    [rotate, setRotate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [senderId, setSenderId] = useState(data.user.actor.slice(6));
  const ready = readiness(p, catalog, new Date(), confirmed);
  return (
    <div className="grid">
      <div className="stack">
        <section className="card">
          <h2>Ready to send</h2>
          {ready.errors.map((e) => (
            <p key={e}>× {e}</p>
          ))}
          {ready.warnings.map((w) => (
            <p key={w}>! {w}</p>
          ))}
          {ready.ready && <p>✓ Content, signatures and quote are ready.</p>}
        </section>
        <section className="card stack">
          <Field label="From">
            <select
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
            >
              {data.staff.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.display_name} · {data.settings?.company_name} &lt;
                  {member.email}&gt;
                </option>
              ))}
            </select>
          </Field>
          <small>
            Sender must use the verified sending domain:{" "}
            {data.settings?.sending_domain ||
              "not configured — set it in Settings"}
            .
          </small>
          <h2>Recipient</h2>
          <strong>
            {p.client.first_name} {p.client.last_name}
          </strong>
          <span>{p.client.email}</span>
          {p.valid_until && <small>Valid until {date(p.valid_until)}</small>}
          {p.ai_unreviewed && (
            <label className="check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I have reviewed the assistant’s scope and prices.
            </label>
          )}
          {p.sent_at && (
            <label className="check">
              <input
                type="checkbox"
                checked={rotate}
                onChange={(e) => setRotate(e.target.checked)}
              />
              Re-send and rotate the link. The previous link will stop working.
            </label>
          )}
          {error && (
            <Banner tone="danger" title="Not sent">
              {error}
            </Banner>
          )}
          <Button
            variant="primary"
            busy={busy}
            disabled={!ready.ready || (!!p.sent_at && !rotate)}
            note={
              !ready.ready
                ? "Resolve the readiness checks before sending."
                : p.sent_at && !rotate
                  ? "Confirm link rotation to re-send."
                  : undefined
            }
            onClick={async () => {
              setBusy(true);
              try {
                onSent(
                  await post(`/api/proposals/${p.id}/send`, {
                    confirm_ai_review: confirmed,
                    sender_user_id: senderId,
                  }),
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to send");
              } finally {
                setBusy(false);
              }
            }}
          >
            {p.sent_at ? "Re-send and rotate link" : "Send proposal"}
          </Button>
        </section>
        <section className="card">
          <h2>Reminders</h2>
          <p>
            Days {(p.workspace_settings?.reminder_days ?? []).join(" and ")}{" "}
            after sending, unless signed or declined first.
          </p>
          <p>
            Billing runs after the client signs. A failure never undoes a
            signature.
          </p>
        </section>
      </div>
      <section>
        <h2>What the client will see</h2>
        <Document p={p} />
      </section>
    </div>
  );
}
function Audit({ p }: { p: Proposal }) {
  const [verdict, setVerdict] = useState<Record<string, string>>({});
  return (
    <div className="stack">
      <section className="card">
        <h2>Integrity</h2>
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
        <h2>Consent text as shown</h2>
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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Actor</th>
              <th>IP</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {p.events.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleString()}</td>
                <td>{e.type}</td>
                <td>{String(e.metadata.application_statement ?? e.actor)}</td>
                <td>{e.ip || "Not available"}</td>
                <td>
                  <details>
                    <summary>Details</summary>
                    <pre className="hash">
                      {JSON.stringify(e.metadata, null, 2)}
                    </pre>
                    <small>{e.user_agent || "User agent not available"}</small>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
type Runner = (fn: () => Promise<unknown>, success?: string) => Promise<void>;
function Catalogue({ data, run }: { data: Data; run: Runner }) {
  const money = useMoney();
  const [selected, setSelected] = useState<Item | null>(null),
    [query, setQuery] = useState("");
  return (
    <div className="stack">
      <Banner title="Catalogue defaults">
        Prices are entered values. Stripe catalogue sync reads all pages;
        billing resolves the exact lookup key. Legacy entries cannot be sent.
      </Banner>
      <div className="actions">
        <Button
          onClick={() =>
            run(
              () => post("/api/catalog-sync/stripe"),
              "Stripe catalogue synced",
            )
          }
        >
          Sync Stripe test catalogue
        </Button>
        <Button
          onClick={() =>
            run(() => post("/api/catalog-sync/qbo"), "QuickBooks items synced")
          }
        >
          Sync QuickBooks sandbox
        </Button>
        <Button onClick={() => setSelected(null)}>New item</Button>
      </div>
      <div className="grid">
        <section className="card">
          <Field label="Search catalogue">
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </Field>
          {data.catalog
            .filter((i) =>
              (itemDisplayName(i) + i.name + i.sku)
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((i) => (
              <button
                className="row catalogue-row"
                key={i.id}
                onClick={() => setSelected(i)}
              >
                <span>
                  <strong>{itemDisplayName(i)}</strong>
                  <small>
                    {i.stripe_lookup_key ?? i.qbo_item_ref ?? "Mapping needed"}{" "}
                    · {i.legacy ? "Legacy" : i.active ? "Active" : "Inactive"}
                  </small>
                </span>
                <span>
                  {money(i.amount)}
                  {intervalSuffix(i.interval)}
                </span>
              </button>
            ))}
        </section>
        <form
          key={selected?.id ?? "new"}
          className="card form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(() =>
              post("/api/pricing_items", {
                ...selected,
                ...Object.fromEntries(f),
                display_name: f.get("display_name") || undefined,
                amount: Math.round(Number(f.get("price")) * 100),
                active: f.get("active") === "on",
                legacy: f.get("legacy") === "on",
                stripe_lookup_key: f.get("stripe_lookup_key") || null,
                qbo_item_ref: f.get("qbo_item_ref") || null,
              }),
            );
          }}
        >
          <h2>{selected ? "Edit catalogue item" : "New catalogue item"}</h2>
          {[
            ["name", "Name"],
            ["display_name", "Display name"],
            ["sku", "SKU"],
            ["description", "Description"],
            ["stripe_lookup_key", "Stripe lookup key"],
            ["qbo_item_ref", "QuickBooks item reference"],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                name={key}
                required={["name", "sku"].includes(key)}
                placeholder={
                  key === "display_name" ? selected?.name : undefined
                }
                defaultValue={String(selected?.[key as keyof Item] ?? "")}
              />
            </Field>
          ))}
          <small>
            Display name is used on new proposal lines and in dropdowns. Leave
            it blank to use the synced name. Stripe sync preserves your
            override.
          </small>
          <Field label="Price (USD)">
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={(selected?.amount ?? 0) / 100}
            />
          </Field>
          <Field label="Billing interval">
            <select
              name="interval"
              defaultValue={selected?.interval ?? "one_time"}
            >
              <option value="one_time">One-time</option>
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </select>
          </Field>
          <label>
            <input
              name="active"
              type="checkbox"
              defaultChecked={selected?.active ?? true}
            />{" "}
            Active
          </label>
          <label>
            <input
              name="legacy"
              type="checkbox"
              defaultChecked={selected?.legacy ?? false}
            />{" "}
            Legacy
          </label>
          <Button type="submit" variant="primary">
            Save item
          </Button>
        </form>
      </div>
    </div>
  );
}
function Templates({
  data,
  selected,
  run,
}: {
  data: Data;
  selected?: string;
  run: Runner;
}) {
  const original = data.templates.find((t) => t.id === selected);
  const [blocks, setBlocks] = useState<Block[]>(
      original?.content ?? [
        { type: "heading", text: "{{proposal.title}}" },
        { type: "paragraph", text: "Prepared for {{client.company}}." },
        { type: "pricing_table" },
        { type: "signature_block", role: "client" },
        { type: "signature_block", role: "company" },
      ],
    ),
    [quote, setQuote] = useState<Template["default_quote"]>(
      original?.default_quote ?? [],
    );
  return (
    <div className="stack">
      <section className="card">
        <h2>Templates</h2>
        <div className="actions">
          {data.templates.map((t) => (
            <a className="btn" href={`/templates/${t.id}/edit`} key={t.id}>
              {t.name}
              {!t.active ? " · inactive" : ""}
              {inactiveTemplateItems(t, data.catalog).length
                ? " · defaults need review"
                : ""}
            </a>
          ))}
          <a className="btn" href="/templates/new">
            New template
          </a>
        </div>
      </section>
      <TemplateWarnings
        templates={
          original ? [{ ...original, default_quote: quote }] : data.templates
        }
        catalog={data.catalog}
      />
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(
            () =>
              post("/api/templates", {
                id: original?.id,
                name: f.get("name"),
                content: blocks,
                default_quote: quote,
                active: f.get("active") === "on",
              }),
            "Template saved",
          );
        }}
      >
        <h2>{original ? "Edit template" : "Create template"}</h2>
        <Field label="Template name">
          <input name="name" required defaultValue={original?.name} />
        </Field>
        <label>
          <input
            name="active"
            type="checkbox"
            defaultChecked={original?.active ?? true}
          />{" "}
          Active
        </label>
        <BlocksEditor
          content={blocks}
          onChange={setBlocks}
          map={{
            "proposal.title": "Example proposal",
            "client.company": "Example client",
            "company.name": data.settings?.company_name ?? "Company",
          }}
          library={data.library}
        />
        <h3>Default quote</h3>
        {quote.map((line, index) => (
          <div className="row" key={index}>
            <span>
              {data.catalog.find((i) => i.id === line.pricing_item_id)?.name ??
                "Unavailable item"}
            </span>
            <Field label="Quantity">
              <input
                type="number"
                min="1"
                value={line.qty}
                onChange={(e) =>
                  setQuote(
                    quote.map((q, i) =>
                      i === index ? { ...q, qty: Number(e.target.value) } : q,
                    ),
                  )
                }
              />
            </Field>
            <label>
              <input
                type="checkbox"
                checked={line.optional}
                onChange={(e) =>
                  setQuote(
                    quote.map((q, i) =>
                      i === index
                        ? { ...q, optional: e.target.checked, selected: true }
                        : q,
                    ),
                  )
                }
              />{" "}
              Optional
            </label>
            <Button
              onClick={() => setQuote(quote.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Field label="Add catalogue default">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value)
                setQuote([
                  ...quote,
                  {
                    pricing_item_id: e.target.value,
                    qty: 1,
                    optional: false,
                    selected: true,
                  },
                ]);
            }}
          >
            <option value="">Choose an item</option>
            {sellableCatalogue(data.catalog).map((i) => (
              <option key={i.id} value={i.id}>
                {itemDisplayName(i)}
              </option>
            ))}
          </select>
        </Field>
        <Button variant="primary" type="submit">
          Save template
        </Button>
      </form>
    </div>
  );
}
function Library({ data, run }: { data: Data; run: Runner }) {
  const [selected, setSelected] = useState<string>(""),
    [blocks, setBlocks] = useState<Block[]>([{ type: "paragraph", text: "" }]);
  const item = data.library.find((i) => i.id === selected);
  return (
    <div className="grid">
      <section className="card stack">
        <h2>Reusable content</h2>
        {data.library.map((i) => (
          <Button
            key={i.id}
            onClick={() => {
              setSelected(i.id);
              setBlocks([i.block]);
            }}
          >
            {i.name}
          </Button>
        ))}
        <Button
          onClick={() => {
            setSelected("");
            setBlocks([{ type: "paragraph", text: "" }]);
          }}
        >
          New reusable block
        </Button>
      </section>
      <form
        key={selected}
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(() =>
            post("/api/content_library", {
              id: item?.id,
              name: f.get("name"),
              block: blocks[0],
            }),
          );
        }}
      >
        <Field label="Block name">
          <input name="name" required defaultValue={item?.name} />
        </Field>
        <BlocksEditor
          content={blocks}
          onChange={setBlocks}
          map={{}}
          library={[]}
        />
        <Button
          type="submit"
          disabled={blocks.length !== 1}
          note={
            blocks.length !== 1
              ? "Keep one block per library entry."
              : undefined
          }
        >
          Save reusable block
        </Button>
      </form>
    </div>
  );
}
function Integrations({ data, run }: { data: Data; run: Runner }) {
  return (
    <div className="stack">
      <Banner title="Development providers">
        The app defaults to mocks. Actual Stripe test mode and QuickBooks
        sandbox require explicit configuration. No live billing is enabled.
      </Banner>
      <div className="grid">
        {["Stripe", "QuickBooks"].map((name) => (
          <section className="card" key={name}>
            <h2>{name}</h2>
            <p>
              {name === "Stripe"
                ? "Catalogue lookup, recurring billing and payment setup"
                : "One-time invoices, created without sending"}
            </p>
            <Button
              onClick={() =>
                run(
                  () =>
                    post(
                      `/api/catalog-sync/${name === "Stripe" ? "stripe" : "qbo"}`,
                    ),
                  "Catalogue synced",
                )
              }
            >
              Sync test catalogue
            </Button>
          </section>
        ))}
      </div>
      <section className="card">
        <h2>Billing and delivery queue</h2>
        {data.proposals
          .filter(
            (p) =>
              p.billing_links?.length ||
              p.jobs?.some((j) => j.status === "failed"),
          )
          .map((p) => (
            <div className="stack" key={p.id}>
              <h3>
                <a href={`/proposals/${p.id}`}>{p.title}</a>
              </h3>
              {p.billing_links?.map((l) => (
                <div className="row" key={l.provider}>
                  <span>
                    {l.provider} · {l.status}
                    <small>{l.last_error ?? ""}</small>
                  </span>
                  <a href={`/clients/${p.client.id}`}>Review customer match</a>
                </div>
              ))}
              <Button
                onClick={() =>
                  run(
                    () => post(`/api/proposals/${p.id}/retry`),
                    "Retry processed",
                  )
                }
              >
                Retry after correction
              </Button>
            </div>
          ))}
        {!data.proposals.some((p) => p.billing_links?.length) && (
          <Empty title="Nothing needs attention">
            Your billing queue is clear.
          </Empty>
        )}
      </section>
    </div>
  );
}
function Assistants({ data, run }: { data: Data; run: Runner }) {
  return (
    <div className="stack">
      <Banner tone="ai" title="You stay in control">
        Assistants can read your catalogue and pricing reference, create clients
        and draft proposals. Sending, signing, deleting and billing actions are
        denied by the server.
      </Banner>
      <section className="card">
        <h2>Connect an assistant</h2>
        <p>
          Add this remote MCP endpoint in Claude or ChatGPT, choose automatic
          registration, then sign in and approve its access.
        </p>
        <code>
          {typeof location !== "undefined"
            ? location.origin
            : "https://your-domain"}
          /mcp
        </code>
        <p>
          Local addresses are for protocol testing. Hosted assistants need your
          deployed HTTPS domain.
        </p>
        <p>Access: proposals:read · proposals:draft</p>
      </section>
      <section className="card">
        <h2>Connected assistants</h2>
        {data.assistants.length ? (
          data.assistants.map((a) => (
            <div className="row" key={a.id}>
              <div>
                <strong>{a.name}</strong>
                <small>
                  {a.scopes.join(" · ")} · Last used {date(a.last_used)}
                </small>
              </div>
              {a.revoked ? (
                <span className="pill">Revoked</span>
              ) : (
                <Button
                  variant="danger"
                  onClick={() =>
                    run(
                      () => post(`/api/assistants/${a.id}/revoke`),
                      "Assistant revoked",
                    )
                  }
                >
                  Revoke access
                </Button>
              )}
            </div>
          ))
        ) : (
          <Empty title="No assistants connected">
            A connection appears after you authorize it.
          </Empty>
        )}
      </section>
    </div>
  );
}
function Settings({ data, run }: { data: Data; run: Runner }) {
  const s = data.settings,
    [logo, setLogo] = useState<string | null>(s?.logo ?? null),
    [error, setError] = useState("");
  const [signatoryImage, setSignatoryImage] = useState(
    s?.company_signatory?.image ?? null,
  );
  const [allowed, setAllowed] = useState(
    s?.company_signatory?.authorized_user_ids ?? [],
  );
  const owner = data.user?.staff_role === "owner";
  return (
    <div className="stack">
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(() =>
            post("/api/workspace_settings", {
              ...s,
              ...Object.fromEntries(f),
              logo,
              company_signatory: owner
                ? {
                    name: String(f.get("signatory_name")),
                    title: String(f.get("signatory_title")),
                    user_id: f.get("signatory_user_id") || null,
                    email:
                      data.staff.find(
                        (m) => m.user_id === f.get("signatory_user_id"),
                      )?.email ?? s?.email,
                    image: signatoryImage,
                    authorized_user_ids: allowed,
                  }
                : s?.company_signatory,
              default_validity_days: Number(f.get("default_validity_days")),
              reminder_days: String(f.get("reminder_days"))
                .split(",")
                .filter(Boolean)
                .map(Number),
              qbo_custom_item_ref: f.get("qbo_custom_item_ref") || null,
            }),
          );
        }}
      >
        <h2>Workspace identity and sending</h2>
        <p>
          Enter the domain already verified with your email provider. Staff
          sender names are managed in <a href="/settings/team">Team</a>. Client
          links use the deployment’s canonical address.
        </p>
        {[
          ["company_name", "Company name"],
          ["owner", "Owner contact name"],
          ["email", "Contact email"],
          ["phone", "Phone"],
          ["address", "Address"],
          ["sending_domain", "Verified sending domain"],
          ["timezone", "Timezone"],
          ["qbo_custom_item_ref", "QuickBooks Custom services item reference"],
        ].map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              name={key}
              readOnly={key === "sending_domain" && !owner}
              defaultValue={String(
                s?.[key as keyof WorkspaceSettings] ??
                  (key === "timezone" ? "America/New_York" : ""),
              )}
              required={["company_name", "email", "timezone"].includes(key)}
            />
          </Field>
        ))}
        <Field label="Accent colour">
          <input
            name="accent_colour"
            type="color"
            defaultValue={s?.accent_colour ?? "#245547"}
          />
        </Field>
        <Field label="Logo (PNG, under 750 KB)">
          <input
            type="file"
            accept="image/png"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const image = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result));
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
                setLogo((await post("/api/workspace-logo", { image })).path);
                setError("");
              } catch (e) {
                setError(String(e));
              }
            }}
          />
        </Field>
        {error && (
          <Banner tone="danger" title="Logo could not be uploaded">
            {error}
          </Banner>
        )}
        <fieldset className="stack" disabled={!owner}>
          <legend>Company signatory</legend>
          {!owner && (
            <p>
              Only a workspace owner can change the signatory and authorized
              staff.
            </p>
          )}
          <Field label="Signatory name">
            <input
              name="signatory_name"
              required
              defaultValue={s?.company_signatory?.name ?? s?.owner ?? ""}
            />
          </Field>
          <Field label="Signatory title">
            <input
              name="signatory_title"
              required
              defaultValue={s?.company_signatory?.title ?? "Owner"}
            />
          </Field>
          <Field label="Signatory staff account">
            <select
              name="signatory_user_id"
              defaultValue={s?.company_signatory?.user_id ?? ""}
            >
              <option value="">Choose the signatory’s staff account</option>
              {data.staff.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name} [{m.email}]
                </option>
              ))}
            </select>
          </Field>
          <StoredSignatureEditor
            value={signatoryImage}
            onChange={setSignatoryImage}
          />
          <p>
            Staff authorized to apply this signature (include the signatory if
            they will sign):
          </p>
          {data.staff.map((m) => (
            <label className="check" key={m.user_id}>
              <input
                type="checkbox"
                checked={allowed.includes(m.user_id)}
                onChange={(e) =>
                  setAllowed(
                    e.target.checked
                      ? [...allowed, m.user_id]
                      : allowed.filter((id) => id !== m.user_id),
                  )
                }
              />
              {m.name} [{m.email}]
            </label>
          ))}
        </fieldset>
        <Field label="Electronic signature consent">
          <textarea
            name="consent_text"
            required
            rows={5}
            defaultValue={
              s?.consent_text ??
              "I consent to use electronic records and signatures for this agreement and can retain a copy."
            }
          />
        </Field>
        <Field label="Reminder days after sending (comma separated)">
          <input
            name="reminder_days"
            defaultValue={s?.reminder_days.join(", ") ?? "3, 7"}
          />
        </Field>
        <Field label="Default validity (days)">
          <input
            name="default_validity_days"
            type="number"
            min="1"
            max="365"
            defaultValue={s?.default_validity_days ?? 30}
          />
        </Field>
        <Field label="Collection method">
          <select
            name="collection_method"
            defaultValue={s?.collection_method ?? "charge_automatically"}
          >
            <option value="charge_automatically">
              Charge saved payment method
            </option>
            <option value="send_invoice">Send invoice</option>
          </select>
        </Field>
        <p className="muted">
          Identity and consent changes apply to new proposals. Signatory changes
          apply to future counter-signatures, including proposals already
          awaiting signing. Completed agreements retain their saved identity and
          consent. Add staff through your own authentication administration.
        </p>
        <Button variant="primary" type="submit">
          Save workspace settings
        </Button>
      </form>
      <section className="stack" aria-label="Pricing settings">
        <h2>Pricing</h2>
        <TemplateWarnings templates={data.templates} catalog={data.catalog} />
      </section>
      <section className="card stack">
        <h2>Custom service families</h2>
        <p>
          Use a service name, never a client name. Creation checks every active
          Stripe product for duplicates.
        </p>
        {data.families.map((f) => (
          <div className="row" key={f.id}>
            {f.name}
            <span>{f.active ? "Active" : "Inactive"}</span>
          </div>
        ))}
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const name = new FormData(e.currentTarget).get("name");
            void run(
              () =>
                post("/api/custom-families", {
                  name,
                  request_id: crypto.randomUUID(),
                }),
              "Custom family created",
            );
          }}
        >
          <Field label="Service family name">
            <input
              name="name"
              minLength={3}
              required
              placeholder="Custom Retainer"
            />
          </Field>
          <Button type="submit">Create in Stripe test mode</Button>
        </form>
      </section>
      <ReferenceDocuments documents={data.documents} run={run} />
    </div>
  );
}

function Team({ data, run }: { data: Data; run: Runner }) {
  return (
    <div className="stack">
      <p>
        Display names appear in proposal emails. Email addresses come from staff
        login accounts. Owners can edit everyone; members can edit their own
        name.
      </p>
      {data.staff.map((member) => (
        <form
          className="card form"
          key={member.user_id}
          onSubmit={(e) => {
            e.preventDefault();
            const name = new FormData(e.currentTarget).get("display_name");
            void run(() =>
              post(`/api/team/${member.user_id}`, { display_name: name }),
            );
          }}
        >
          <h2>{member.email}</h2>
          <Field label="Display name">
            <input
              name="display_name"
              required
              maxLength={200}
              defaultValue={member.display_name}
              disabled={
                data.user.staff_role !== "owner" &&
                data.user.actor !== "staff:" + member.user_id
              }
            />
          </Field>
          <Button
            type="submit"
            disabled={
              data.user.staff_role !== "owner" &&
              data.user.actor !== "staff:" + member.user_id
            }
          >
            Save display name
          </Button>
        </form>
      ))}
    </div>
  );
}
