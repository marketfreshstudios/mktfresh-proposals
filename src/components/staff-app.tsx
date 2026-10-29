"use client";
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
  Status,
  Signatures,
  ThemeToggle,
  date,
  Icon,
} from "./ui";
import { ProposalEditor, BlocksEditor } from "./editor";
import { SignatureForm } from "./signature";
import { money, renderBlocks, variables, totals } from "../lib/presentation";
import { readiness } from "../lib/quote";
import { PlaybookDraftSchema } from "../lib/playbook";
import type { Proposal, Client, Item, Template, Block } from "../lib/model";
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
  ["settings/ai", "AI assistants"],
];
type Data = {
  settings: WorkspaceSettings | null;
  proposals: Proposal[];
  total: number;
  clients: Client[];
  catalog: Item[];
  templates: Template[];
  library: { id: string; name: string; block: Block }[];
  families: { id: string; name: string; active: boolean }[];
  documents: {
    id: string;
    name: string;
    version: string;
    format: string;
    content: string;
  }[];
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
  local = false,
}: {
  path: string[];
  local?: boolean;
}) {
  const section = path[0] ?? "",
    id = path[1],
    action = path[2];
  const [data, setData] = useState<Data | null>(null),
    [p, setP] = useState<Proposal | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const session = await api<{ settings: WorkspaceSettings | null }>(
        "/api/auth/session",
      );
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
  let title = nav.find(([key]) => key === section)?.[1] ?? "Workspace",
    subtitle = "",
    content: ReactNode = null,
    headerAction: ReactNode = (
      <a className="btn primary" href="/proposals/new">
        <Icon name="plus" />
        New proposal
      </a>
    );
  if (data) {
    if (section === "") {
      title = "What needs me today";
      subtitle = new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      content = <Dashboard data={data} />;
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
          : action === "countersign"
            ? "Counter-sign"
            : action === "audit"
              ? "Audit trail"
              : p.title;
      subtitle = p.client.company + " · " + date(p.valid_until);
      headerAction = (
        <div className="actions">
          {p.status === "signed_by_client" && action !== "countersign" ? (
            <a className="btn primary" href={`/proposals/${p.id}/countersign`}>
              Counter-sign
            </a>
          ) : p.status === "draft" && action !== "edit" ? (
            <a className="btn primary" href={`/proposals/${p.id}/edit`}>
              Edit draft
            </a>
          ) : null}
          <a
            className="btn"
            href={`/proposals/${p.id}${action ? "" : "/audit"}`}
          >
            {action ? "Back to record" : "Audit"}
          </a>
        </div>
      );
      content =
        action === "edit" && p.status === "draft" ? (
          <ProposalEditor
            initial={p}
            catalog={data.catalog}
            families={data.families}
            library={data.library}
            onSaved={setP}
          />
        ) : action === "send" ? (
          <SendProposal
            p={p}
            catalog={data.catalog}
            onSent={(next) => {
              setP(next);
              location.href = `/proposals/${p.id}`;
            }}
          />
        ) : action === "countersign" ? (
          <div className="grid">
            <div className="stack">
              <Banner tone="info" title="Frozen client-signed document">
                The client’s selected scope and prices cannot change.
              </Banner>
              <Document p={p} />
            </div>
            <div className="card stack">
              <h2>Your signature</h2>
              <Signatures proposal={p} />
              {p.status === "signed_by_client" ? (
                <SignatureForm
                  consentText={p.workspace_settings?.consent_text ?? ""}
                  name={data.settings?.owner}
                  email={data.settings?.email}
                  revision={p.revision}
                  reviewedHash={p.versions.at(-1)?.content_hash}
                  label="Counter-sign and complete"
                  onSign={async (value) => {
                    await post(`/api/proposals/${p.id}/countersign`, value);
                    location.href = `/proposals/${p.id}`;
                  }}
                />
              ) : (
                <Banner
                  tone="warning"
                  title="Counter-signature is not available"
                >
                  The client must sign first.
                </Banner>
              )}
            </div>
          </div>
        ) : action === "audit" ? (
          <Audit p={p} />
        ) : (
          <Record p={p} refresh={load} />
        );
    } else if (section === "proposals") {
      subtitle = `${data.total} proposals`;
      content = (
        <ProposalList
          initial={data.proposals}
          total={data.total}
          clients={data.clients}
        />
      );
    } else if (section === "clients") {
      headerAction = null;
      content = <Clients data={data} selected={id} save={run} />;
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
          <ProposalTable
            proposals={data.proposals.filter(
              (p) => p.source === "proposify_import",
            )}
          />
        </div>
      );
    } else if (section === "integrations") {
      headerAction = null;
      content = <Integrations data={data} run={run} />;
    } else if (section === "settings" && id === "ai") {
      title = "AI assistants";
      subtitle =
        "Read reference data and draft proposals. A person always reviews and sends.";
      headerAction = null;
      content = <Assistants data={data} run={run} />;
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
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          {data?.settings?.logo ? (
            <img src="/api/workspace-logo" alt={company} />
          ) : (
            company
          )}
          <small>Workspace</small>
        </div>
        <nav aria-label="Main navigation">
          {nav.map(([key, label]) => (
            <a
              href={"/" + key}
              key={key}
              className={
                path.join("/") === key || (key === section && id !== "ai")
                  ? "active"
                  : ""
              }
            >
              {label}
            </a>
          ))}
        </nav>
        <footer>
          {data?.settings?.owner}
          <small style={{ display: "block" }}>{data?.settings?.email}</small>
          <ThemeToggle />
          <button
            className="btn ghost"
            onClick={async () => {
              await post("/api/auth/logout");
              location.href = "/login";
            }}
          >
            Sign out
          </button>
        </footer>
      </aside>
      <main className="workspace">
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
          {notice && <Banner tone="success" title={notice} />}{" "}
          {loading ? <p role="status">Loading your workspace…</p> : content}
        </div>
      </main>
    </div>
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
function Dashboard({ data }: { data: Data }) {
  const rows = data.proposals,
    signed = rows.filter((p) => p.status === "signed_by_client"),
    issues = rows.filter(
      (p) =>
        p.jobs?.some((j) => j.status === "failed") ||
        p.billing_links?.some((l) =>
          ["failed", "needs_review"].includes(l.status),
        ),
    ),
    viewed = rows.filter((p) => p.status === "viewed"),
    expiring = rows.filter(
      (p) =>
        ["sent", "viewed"].includes(p.status) &&
        Date.parse(p.valid_until) < Date.now() + 7 * 86400000,
    ),
    ai = rows.filter((p) => p.ai_unreviewed);
  return (
    <>
      <div className="metrics">
        {[
          [
            signed,
            "Awaiting your counter-signature",
            "Client has already signed",
            "warning",
          ],
          [issues, "Billing needs review", "Signatures remain safe", "warning"],
          [viewed, "Viewed but unsigned", "Ready for a follow-up", "info"],
          [
            expiring,
            "Expiring within 7 days",
            "Review validity dates",
            "neutral",
          ],
          [ai, "Drafted by AI, unreviewed", "Read scope and prices", "ai"],
        ].map(([list, label, note, tone]) => (
          <a
            className="card metric"
            href={
              label === "Billing needs review" ? "/integrations" : "/proposals"
            }
            key={String(label)}
          >
            <strong className={String(tone)}>
              {(list as Proposal[]).length}
            </strong>
            <b>{String(label)}</b>
            <p className="muted">{String(note)}</p>
          </a>
        ))}
      </div>
      <div className="grid">
        <section className="card">
          <h2>Counter-sign now</h2>
          {signed.length ? (
            signed.map((p) => (
              <div className="row" key={p.id}>
                <div>
                  <strong>{p.client.company}</strong>
                  <p>{p.title}</p>
                  <Status status={p.status} />
                </div>
                <a
                  className="btn primary"
                  href={`/proposals/${p.id}/countersign`}
                >
                  Counter-sign
                </a>
              </div>
            ))
          ) : (
            <Empty title="No signatures waiting">You’re up to date.</Empty>
          )}
        </section>
        <section className="card">
          <h2>Needs review</h2>
          {issues.length ? (
            issues.map((p) => (
              <div className="row" key={p.id}>
                <a href={`/proposals/${p.id}`}>{p.title}</a>
                <span className="pill warning">Billing review</span>
              </div>
            ))
          ) : (
            <Empty title="Nothing needs attention">
              Your integration queue is clear.
            </Empty>
          )}
        </section>
      </div>
      <section className="card">
        <h2>Recent proposals</h2>
        <ProposalTable proposals={rows.slice(-6).reverse()} />
      </section>
    </>
  );
}
function ProposalTable({ proposals }: { proposals: Proposal[] }) {
  return proposals.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Client / proposal</th>
            <th>Status and signatures</th>
            <th>One-time</th>
            <th>Monthly</th>
            <th>Yearly</th>
            <th>Sent</th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((p) => {
            const t = totals(p.quote ?? []);
            return (
              <tr key={p.id}>
                <td>
                  <a
                    href={`/${p.source === "proposify_import" ? "archives" : "proposals"}/${p.id}`}
                  >
                    <strong>{p.client.company}</strong>
                    {p.title}
                  </a>
                  <small>
                    {p.client.first_name} {p.client.last_name} ·{" "}
                    {p.client.email}
                  </small>
                  {p.source === "proposify_import" && (
                    <span className="pill">Imported · read-only</span>
                  )}
                </td>
                <td>
                  <Status status={p.status} ai={p.ai_unreviewed} />
                  {p.jobs?.some((j) => j.status === "failed") ||
                  p.billing_links?.some((l) =>
                    ["failed", "needs_review"].includes(l.status),
                  ) ? (
                    <a className="pill warning" href={`/proposals/${p.id}`}>
                      Work needs attention
                    </a>
                  ) : null}
                  <small>
                    Client —{" "}
                    {p.signers?.some((s) => s.role === "client")
                      ? "signed"
                      : "waiting"}
                    <br />
                    Company —{" "}
                    {p.signers?.some((s) => s.role === "company")
                      ? "signed"
                      : "waiting"}
                  </small>
                </td>
                <td>{money(t.one_time_total, p.currency)}</td>
                <td>{money(t.monthly_total, p.currency)}/month</td>
                <td>{money(t.yearly_total, p.currency)}/year</td>
                <td>{date(p.sent_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="No proposals here yet"
      action={
        <a className="btn primary" href="/proposals/new">
          Create a proposal
        </a>
      }
    >
      Try different filters, or start a new draft.
    </Empty>
  );
}
function ProposalList({
  initial,
  total,
  clients,
}: {
  initial: Proposal[];
  total: number;
  clients: Client[];
}) {
  const [rows, setRows] = useState(initial),
    [count, setCount] = useState(total),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [client, setClient] = useState(""),
    [source, setSource] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      void api<{ items: Proposal[]; total: number }>(
        `/api/proposals?limit=25&offset=${page * 25}&q=${encodeURIComponent(q)}&status=${status}&client=${client}&source=${source}&from=${from}&to=${to ? to + "T23:59:59.999Z" : ""}`,
      )
        .then((r) => {
          setRows(r.items);
          setCount(r.total);
        })
        .catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(timer);
  }, [q, status, client, source, from, to, page]);
  return (
    <div className="stack">
      <div className="toolbar">
        <Field label="Search proposals">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Client, title or archived wording"
          />
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All statuses</option>
            {[
              "draft",
              "sent",
              "viewed",
              "signed_by_client",
              "completed",
              "declined",
              "expired",
              "archived",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Client">
          <select
            value={client}
            onChange={(e) => {
              setClient(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source">
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            <option value="native">Native</option>
            <option value="proposify_import">Imported</option>
          </select>
        </Field>
        <Field label="Created from">
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </Field>
        <Field label="Created through">
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </Field>
        <Button
          variant="ghost"
          onClick={() => {
            setFrom("");
            setTo("");
            setQ("");
            setStatus("");
            setClient("");
            setSource("");
            setPage(0);
          }}
        >
          Clear filters
        </Button>
      </div>
      {error && (
        <Banner title="Unable to load proposals" tone="danger">
          {error}
        </Banner>
      )}
      {rows.length ? (
        <ProposalTable proposals={rows} />
      ) : (
        <Empty title="No proposals match these filters">
          Clear the filters or try a different search.
        </Empty>
      )}
      <div className="actions">
        <span>
          {count} proposals · page {page + 1}
        </span>
        <Button disabled={!page} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <Button
          disabled={(page + 1) * 25 >= count}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
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
                valid_until: new Date(
                  String(f.get("valid_until")) + "T23:59:59",
                ).toISOString(),
                ...(f.get("password") ? { password: f.get("password") } : {}),
                ...(payload ? { playbook: payload } : {}),
              });
              location.href = `/proposals/${p.id}/edit`;
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
          <Field label="Client">
            <select name="client" required={!payload?.client}>
              <option value="">
                {payload?.client
                  ? `Create ${payload.client.company}`
                  : "Choose a client"}
              </option>
              {data.clients.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.company} · {c.email}
                </option>
              ))}
            </select>
          </Field>
          <a href="/clients/new">Create a new client instead</a>
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
            <input
              name="valid_until"
              type="date"
              defaultValue={new Date(
                Date.now() +
                  (data.settings?.default_validity_days ?? 30) * 86400000,
              )
                .toISOString()
                .slice(0, 10)}
              required
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
    );
  } catch (e) {
    html = "Preview unavailable until unresolved variables are fixed.";
  }
  return (
    <article className="paper" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
function SendProposal({
  p,
  catalog,
  onSent,
}: {
  p: Proposal;
  catalog: Item[];
  onSent: (p: Proposal) => void;
}) {
  const [confirmed, setConfirmed] = useState(false),
    [rotate, setRotate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
          <h2>Recipient</h2>
          <strong>
            {p.client.first_name} {p.client.last_name}
          </strong>
          <span>{p.client.email}</span>
          <small>Valid until {date(p.valid_until)}</small>
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
function Record({ p, refresh }: { p: Proposal; refresh: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  return (
    <div className="stack">
      <div className="card stack">
        <Status status={p.status} ai={p.ai_unreviewed} />
        {p.origin && (
          <span className="pill">From playbook {p.origin.source_version}</span>
        )}
        <Totals lines={p.quote} currency={p.currency} />
        <Signatures proposal={p} />
        <div className="actions">
          {p.token && (
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(
                  (p.workspace_settings?.client_url ?? location.origin) +
                    "/p/" +
                    p.token,
                );
                setMessage("Private link copied");
              }}
            >
              Copy link
            </Button>
          )}
          {["sent", "viewed"].includes(p.status) && (
            <a className="btn" href={`/proposals/${p.id}/send`}>
              Re-send proposal
            </a>
          )}
          <span role="status">{message}</span>
        </div>
      </div>
      {p.status !== "draft" && p.source !== "proposify_import" && (
        <Banner
          title={
            p.client_signed_at
              ? "The document and quote are frozen"
              : "The client link is ready"
          }
        >
          {p.client_signed_at
            ? "Nothing about the accepted scope can change now."
            : "The client can choose optional items and sign."}
        </Banner>
      )}
      <div className="grid">
        <div className="stack">
          {p.source === "proposify_import" ? (
            <div className="card">
              <h2>Archived proposal</h2>
              <p>This imported record is read-only.</p>
              {p.files
                .filter((f) => f.kind === "import")
                .map((f) => (
                  <iframe
                    key={f.id}
                    title="Archived PDF"
                    src={`/api/proposals/${p.id}/files/${f.id}?inline=1`}
                    style={{ width: "100%", height: 600, border: 0 }}
                  />
                ))}
              <pre style={{ whiteSpace: "pre-wrap" }}>{p.search_text}</pre>
            </div>
          ) : (
            <Document p={p} />
          )}
        </div>
        <aside className="stack">
          <section className="card">
            <h2>Files</h2>
            {p.files
              .filter((f) => ["sealed", "import"].includes(f.kind))
              .map((f) => (
                <div className="row" key={f.id}>
                  <div>
                    <strong>
                      {f.kind === "import"
                        ? "Imported PDF"
                        : f.stage === "company"
                          ? "Fully countersigned copy"
                          : "Client-signed copy"}
                    </strong>
                    <small>
                      {date(f.created_at)} · {Math.ceil(f.bytes / 1024)} KB
                    </small>
                  </div>
                  <a
                    className="btn"
                    href={`/api/proposals/${p.id}/files/${f.id}`}
                  >
                    Download
                  </a>
                </div>
              ))}
            {!p.files.length && (
              <p className="muted">Sealed files appear after signing.</p>
            )}
          </section>
          {p.source !== "proposify_import" && (
            <section className="card">
              <h2>Jobs and billing</h2>
              <p className="muted">
                A billing failure never undoes a signature.
              </p>
              {p.jobs.map((j) => (
                <div className="row" key={j.id}>
                  <div>
                    <strong>{j.kind}</strong>
                    <small>
                      {j.status} · attempt {j.attempts}
                    </small>
                    {j.last_error && <p>{j.last_error}</p>}
                  </div>
                </div>
              ))}
              <Button
                onClick={async () => {
                  await post(`/api/proposals/${p.id}/jobs`);
                  await refresh();
                }}
              >
                Process pending jobs
              </Button>
              <Button
                onClick={async () => {
                  await post(`/api/proposals/${p.id}/retry`);
                  await refresh();
                }}
              >
                Retry failed work
              </Button>
            </section>
          )}
        </aside>
      </div>
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
                <td>{e.actor}</td>
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
function Clients({
  data,
  selected,
  save,
}: {
  data: Data;
  selected?: string;
  save: Runner;
}) {
  const client = data.clients.find((c) => c.id === selected),
    [query, setQuery] = useState("");
  return (
    <div className="grid">
      <section className="card stack">
        <div className="actions">
          <h2>Clients</h2>
          <a className="btn" href="/clients/new">
            New client
          </a>
        </div>
        <Field label="Find a client">
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        {data.clients
          .filter((c) =>
            (c.company + c.email).toLowerCase().includes(query.toLowerCase()),
          )
          .map((c) => (
            <a className="row" key={c.id} href={`/clients/${c.id}`}>
              <strong>{c.company}</strong>
              <span>{c.email}</span>
            </a>
          ))}
      </section>
      <section className="card stack">
        <h2>{client ? client.company : "New client"}</h2>
        <form
          className="form"
          key={client?.id ?? "new"}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save(() =>
              post("/api/clients", {
                ...client,
                ...Object.fromEntries(f),
                address: { formatted: f.get("address") },
                qbo_customer_id: f.get("qbo_customer_id") || null,
                stripe_customer_id: f.get("stripe_customer_id") || null,
              }),
            );
          }}
        >
          {[
            ["company", "Company"],
            ["first_name", "First name"],
            ["last_name", "Last name"],
            ["email", "Email address"],
            ["phone", "Phone"],
            ["notes", "Notes"],
            ["stripe_customer_id", "Verified Stripe customer ID"],
            ["qbo_customer_id", "Verified QuickBooks customer ID"],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                name={key}
                type={key === "email" ? "email" : "text"}
                required={["company", "email"].includes(key)}
                defaultValue={String(client?.[key as keyof Client] ?? "")}
              />
            </Field>
          ))}
          <Field label="Address">
            <textarea
              name="address"
              defaultValue={client?.address.formatted ?? ""}
            />
          </Field>
          <p className="muted">
            Only enter provider IDs after checking the customer’s identity.
            Same-company email mismatches require review.
          </p>
          <Button type="submit" variant="primary">
            Save client
          </Button>
        </form>
        {client && (
          <ProposalTable
            proposals={data.proposals.filter((p) => p.client.id === client.id)}
          />
        )}
      </section>
    </div>
  );
}
function Catalogue({ data, run }: { data: Data; run: Runner }) {
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
              (i.name + i.sku).toLowerCase().includes(query.toLowerCase()),
            )
            .map((i) => (
              <button
                className="row catalogue-row"
                key={i.id}
                onClick={() => setSelected(i)}
              >
                <span>
                  <strong>{i.name}</strong>
                  <small>
                    {i.stripe_lookup_key ?? i.qbo_item_ref ?? "Mapping needed"}{" "}
                    · {i.legacy ? "Legacy" : i.active ? "Active" : "Inactive"}
                  </small>
                </span>
                <span>
                  {money(i.amount)}
                  {i.interval === "month"
                    ? "/month"
                    : i.interval === "year"
                      ? "/year"
                      : " once"}
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
            ["sku", "SKU"],
            ["description", "Description"],
            ["stripe_lookup_key", "Stripe lookup key"],
            ["qbo_item_ref", "QuickBooks item reference"],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                name={key}
                required={["name", "sku"].includes(key)}
                defaultValue={String(selected?.[key as keyof Item] ?? "")}
              />
            </Field>
          ))}
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
            </a>
          ))}
          <a className="btn" href="/templates/new">
            New template
          </a>
        </div>
      </section>
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
            {data.catalog
              .filter((i) => i.active && !i.legacy)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
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
        {[
          ["company_name", "Company name"],
          ["owner", "Owner / signatory"],
          ["email", "Contact email"],
          ["phone", "Phone"],
          ["address", "Address"],
          ["email_sender_name", "Sender name"],
          ["email_sender_address", "Sender email"],
          ["client_url", "Client website URL"],
          ["timezone", "Timezone"],
          ["qbo_custom_item_ref", "QuickBooks Custom services item reference"],
        ].map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              name={key}
              defaultValue={String(
                s?.[key as keyof WorkspaceSettings] ??
                  (key === "timezone" ? "America/New_York" : ""),
              )}
              required={[
                "company_name",
                "email",
                "email_sender_name",
                "email_sender_address",
                "client_url",
                "timezone",
              ].includes(key)}
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
          Changes apply to new proposals. Existing agreements retain their saved
          identity and consent. Add staff through your own authentication
          administration.
        </p>
        <Button variant="primary" type="submit">
          Save workspace settings
        </Button>
      </form>
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
      <section className="card stack">
        <h2>Pricing reference for assistants</h2>
        {data.documents.map((d) => (
          <details key={d.id}>
            <summary>
              {d.name} · {d.version}
            </summary>
            <pre>{d.content}</pre>
          </details>
        ))}
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              () => post("/api/workspace_documents", Object.fromEntries(f)),
              "Pricing reference saved",
            );
          }}
        >
          <Field label="Reference name">
            <input name="name" required />
          </Field>
          <Field label="Version">
            <input name="version" required />
          </Field>
          <Field label="Format">
            <select name="format">
              <option value="markdown">Markdown</option>
              <option value="json">JSON</option>
            </select>
          </Field>
          <Field label="Pricing reference content">
            <textarea rows={8} name="content" required />
          </Field>
          <Button type="submit">Save reference</Button>
        </form>
      </section>
    </div>
  );
}
