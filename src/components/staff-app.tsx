"use client";
import { HomeV4, ProposalListV4, RecordV4, ClientsV4 } from "./records";
import {
  WorkspaceStudio,
  CatalogStudio,
  TemplatesStudio,
  ConnectionsStudio,
  ActivityStudio,
} from "./studio";
import { ClientPicker } from "./client-picker";
import { ValidityField } from "./validity-field";
import { defaultValidUntil } from "../lib/validity";
import { StaffShell } from "./staff-shell";
import { Sheet, Skeleton } from "./foundation";
import { staffRoute, studioRoutes, type StaffQuery } from "../lib/staff-routes";
import { withDraftSettings } from "../lib/proposal-settings";
import type { ReferenceDocument } from "../lib/documents";
import { useEffect, useState, type ReactNode } from "react";
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
  catalog_error?: string;
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
        api("/api/pricing_items").catch((e) => ({ load_error: e.message })),
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
        catalog: Array.isArray(catalog) ? catalog : [],
        catalog_error: Array.isArray(catalog)
          ? undefined
          : (catalog as { load_error: string }).load_error,
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
      content = <CatalogStudio data={data} run={run} />;
    } else if (section === "templates") {
      headerAction = null;
      content = <TemplatesStudio data={data} selected={id} run={run} />;
    } else if (section === "library") {
      headerAction = null;
      content = <TemplatesStudio data={data} run={run} blocksOnly />;
    } else if (section === "imports") {
      headerAction = null;
      content = <ConnectionsStudio data={data} run={run} initial="imports" />;
    } else if (section === "integrations") {
      headerAction = null;
      content = (
        <ConnectionsStudio
          data={data}
          run={run}
          initial={query.view === "reference" ? "reference" : undefined}
        />
      );
    } else if (section === "settings" && id === "team") {
      title = "Team";
      headerAction = null;
      content = <WorkspaceStudio data={data} run={run} />;
    } else if (section === "settings" && id === "ai") {
      title = "AI assistants";
      subtitle =
        "Read reference data and draft proposals. A person always reviews and sends.";
      headerAction = null;
      content = (
        <ConnectionsStudio data={data} run={run} initial="assistants" />
      );
    } else if (section === "activity") {
      title = "Activity log";
      headerAction = null;
      content = <ActivityStudio data={data} />;
    } else if (section === "settings") {
      headerAction = null;
      content = <WorkspaceStudio data={data} run={run} />;
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
        {error && (
          <Banner
            tone="danger"
            title="Unable to complete this action"
            action={<Button onClick={load}>Reload</Button>}
          >
            {error}
          </Banner>
        )}
        {data?.catalog_error && (
          <Banner
            tone="warning"
            title="We couldn’t load the catalog. Your saved lines are unchanged."
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
                        : "Try loading the catalog again",
                    );
                  }
                }}
              >
                Try again
              </Button>
            }
          >
            You can keep writing or add a custom item while the catalog is
            unavailable.
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
              timezone={data.settings?.timezone ?? "UTC"}
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
  catalog_error?: string;
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
              <tr key={e.id} id={`event-${e.id}`}>
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
