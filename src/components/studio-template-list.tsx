"use client";
import { StudioFilters } from "./studio-v3";
import { useEffect, useState } from "react";
import type { Data } from "./staff-app";
import type { Activity } from "../lib/studio";
import type { Block } from "../lib/model";
import { fieldLabel } from "../lib/field-labels";
import { blockText } from "../lib/editor-document";
import { defaultCover, contentAfterCover } from "../lib/cover";
import { defaultTemplateBands } from "../lib/page-bands";
import { fontCss } from "../lib/proposal-fonts";
import { api, post, Button, Field, Empty, Icon, Banner, date } from "./ui";
import { TemplateWarnings } from "./template-warnings";
const blockType = (b: Block) =>
  b.type === "contract"
    ? "Contract clause"
    : b.type === "image"
      ? "Image"
      : b.content?.content?.some((n) =>
            ["bulletList", "orderedList"].includes(n.type),
          )
        ? "List"
        : "Text";
function summary(block: Block) {
  return blockText(block).replace(/\{\{([^}]+)\}\}/g, (_, token: string) =>
    fieldLabel(token),
  );
}
export function StudioTemplateList({
  data,
  blocks = false,
}: {
  data: Data;
  blocks?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [type, setType] = useState("All"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<Activity[]>([]);
  useEffect(() => {
    api<Activity[]>("/api/workspace_events")
      .then(setEvents)
      .catch(() => {});
  }, []);
  const edited = (id: string) =>
    events.find((e) => e.metadata.entity_id === id);
  const lastEdit = (id: string) => {
    const e = edited(id);
    return e
      ? `Edited ${date(e.created_at)} · ${data.staff.find((m) => e.actor === `staff:${m.user_id}`)?.display_name ?? "Staff"}`
      : "Default";
  };
  const items = data.library.filter(
    (b) =>
      (!query || b.name.toLowerCase().includes(query.toLowerCase())) &&
      (type === "All" || blockType(b.block) === type),
  );
  const recent = [...data.library]
    .sort((a, b) =>
      (edited(b.id)?.created_at ?? "").localeCompare(
        edited(a.id)?.created_at ?? "",
      ),
    )
    .slice(0, 4);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const id = crypto.randomUUID();
      if (blocks) {
        await post("/api/content_library", {
          id,
          name: "Untitled block",
          block: { id: crypto.randomUUID(), type: "paragraph", text: "" },
        });
        location.href = `/studio/blocks/${id}`;
      } else {
        await post("/api/templates", {
          id,
          name: "Untitled template",
          active: true,
          default_quote: [],
          cover: defaultCover(),
          header_footer: defaultTemplateBands(),
          content: contentAfterCover([
            { id: crypto.randomUUID(), type: "paragraph", text: "" },
          ]),
        });
        location.href = `/studio/templates/${id}`;
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="studio-v3-list">
      <div className="studio-list-intro">
        <p>Reusable proposals and content, ready for your next client.</p>
        <Button variant="primary" busy={busy} onClick={create}>
          {blocks ? "New block" : "New template"}
        </Button>
      </div>
      <div className="studio-list-tools">
        <nav
          className="studio-segments"
          aria-label="Templates and saved blocks"
        >
          <a
            aria-current={!blocks ? "page" : undefined}
            href="/studio/templates"
          >
            Templates · {data.templates.length}
          </a>
          <a
            aria-current={blocks ? "page" : undefined}
            href="/studio/templates?view=blocks"
          >
            Saved blocks · {data.library.length}
          </a>
        </nav>
        <Field label={blocks ? "Search blocks" : "Search templates"}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
      </div>
      {error && (
        <Banner tone="danger" title="Could not create">
          {error}
        </Banner>
      )}
      {!blocks ? (
        <>
          <TemplateWarnings templates={data.templates} catalog={data.catalog} />
          <style>{fontCss(data.settings)}</style>
          <div className="studio-template-grid">
            {data.templates
              .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
              .map((t) => (
                <a
                  className="studio-template-card"
                  key={t.id}
                  href={`/studio/templates/${t.id}`}
                >
                  <div
                    className="template-thumbnail proposal-typography"
                    aria-hidden="true"
                  >
                    <small>{data.settings?.company_name}</small>
                    <strong>{t.name}</strong>
                    <span>Prepared for your client</span>
                    <i />
                    <i />
                    <i />
                  </div>
                  <div>
                    <strong>{t.name}</strong>
                    <small>
                      {
                        t.content.filter(
                          (b) => b.type === "heading" && (b.level ?? 1) === 1,
                        ).length
                      }{" "}
                      sections · used{" "}
                      {
                        data.proposals.filter((p) => p.template_id === t.id)
                          .length
                      }{" "}
                      times · {lastEdit(t.id)}
                    </small>
                  </div>
                </a>
              ))}
          </div>
          {!data.templates.length && (
            <Empty
              title="Create your first template"
              action={<Button onClick={create}>New template</Button>}
            />
          )}
          <section className="studio-saved-preview">
            <header>
              <h2>Saved blocks</h2>
              <a href="/studio/templates?view=blocks">
                See all {data.library.length}
              </a>
            </header>
            {recent.map((b) => (
              <a href={`/studio/blocks/${b.id}`} key={b.id}>
                <span>
                  <strong>{b.name}</strong>
                  <small>{blockType(b.block)}</small>
                </span>
                <Icon name="chevron-right" />
              </a>
            ))}
            {!recent.length && (
              <p className="muted">
                No saved blocks yet. Select any block in a proposal or template
                and choose ⋯ › Save for reuse.
              </p>
            )}
          </section>
        </>
      ) : (
        <>
          <StudioFilters
            label="Block types"
            value={type}
            onChange={setType}
            options={["All", "Text", "List", "Contract clause", "Image"].map(
              (t) => ({
                value: t,
                label: `${t} · ${data.library.filter((b) => t === "All" || blockType(b.block) === t).length}`,
              }),
            )}
          />
          <div className="studio-data-table saved-block-table">
            <div className="studio-table-head">
              <span>Block</span>
              <span>Type</span>
              <span>Last edited</span>
            </div>
            {items.map((b) => (
              <a
                className="studio-table-row"
                key={b.id}
                href={`/studio/blocks/${b.id}`}
              >
                <span>
                  <strong>{b.name}</strong>
                  <small>{summary(b.block) || "Empty block"}</small>
                </span>
                <span>{blockType(b.block)}</span>
                <span>{lastEdit(b.id)}</span>
                <Icon name="chevron-right" />
              </a>
            ))}
          </div>
          {!items.length && (
            <Empty
              title={
                data.library.length
                  ? "No matching blocks"
                  : "No saved blocks yet"
              }
            >
              Select any block in a proposal or template and choose ⋯ › Save for
              reuse.
            </Empty>
          )}
          <p className="muted">
            To save a new block, select any block in a proposal or template and
            choose ⋯ › Save for reuse.
          </p>
        </>
      )}
    </div>
  );
}
