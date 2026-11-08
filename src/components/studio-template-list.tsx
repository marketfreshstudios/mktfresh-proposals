"use client";
import { StarterCardMenu } from "./starter-library";
import type { Template } from "../lib/model";
import { studioDate, templateUsage } from "../lib/studio-v3";
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
import { api, post, Button, Empty, Icon, Banner } from "./ui";
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
  const [templates, setTemplates] = useState(data.templates);
  useEffect(() => setTemplates(data.templates), [data.templates]);
  const refreshTemplates = async () => {
    setTemplates(await api<Template[]>("/api/templates"));
  };
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
      ? `Edited ${studioDate(e.created_at)} · ${data.staff.find((m) => e.actor === `staff:${m.user_id}`)?.display_name ?? "Staff"}`
      : "Default";
  };
  const items = data.library.filter(
    (b) =>
      (!query || b.name.toLowerCase().includes(query.toLowerCase())) &&
      (type === "All" ||
        (b.type === "group" ? "Group" : blockType(b.block)) === type),
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
        <p>
          Starting points for new proposals, and content you can drop into any
          of them.
        </p>
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
            Templates · {templates.length}
          </a>
          <a
            aria-current={blocks ? "page" : undefined}
            href="/studio/templates?view=blocks"
          >
            Saved blocks · {data.library.length}
          </a>
        </nav>
        <label className="field studio-search">
          <span className="sr-only">
            {blocks ? "Search blocks" : "Search templates"}
          </span>
          <input
            placeholder={blocks ? "Search blocks" : "Search templates"}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <Banner tone="danger" title="Could not create">
          {error}
        </Banner>
      )}
      {!blocks ? (
        <>
          <TemplateWarnings templates={templates} catalog={data.catalog} />
          {templates.some((t) => t.starter_key) && (
            <p className="muted">
              Starter terms are a starting point, not legal advice. Have an
              attorney review them before you use them.
            </p>
          )}
          <style>{fontCss(data.settings)}</style>
          <div className="studio-template-grid">
            {[...templates]
              .sort(
                (a, b) => (a.starter_order ?? 999) - (b.starter_order ?? 999),
              )
              .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
              .map((t) => (
                <div className="studio-template-card-shell" key={t.id}>
                  <a
                    href={`/studio/templates/${t.id}`}
                    className="studio-template-card"
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
                      {t.starter_key && (
                        <span className="starter-pill">Starter</span>
                      )}
                      {t.source_starter_key && (
                        <p className="starter-source">
                          Based on{" "}
                          {t.source_starter_name ??
                            templates.find(
                              (s) => s.starter_key === t.source_starter_key,
                            )?.name ??
                            t.source_starter_key}
                        </p>
                      )}
                      {t.description && <p>{t.description}</p>}
                      {t.connector_created && !t.active ? (
                        <span className="studio-hidden-pill">
                          Created by Claude — not yet available
                        </span>
                      ) : (
                        !t.active && (
                          <span className="studio-hidden-pill">
                            Hidden from new proposals
                          </span>
                        )
                      )}
                      <small>
                        {
                          t.content.filter(
                            (b) => b.type === "heading" && (b.level ?? 1) === 1,
                          ).length
                        }{" "}
                        {t.content.filter(
                          (b) => b.type === "heading" && (b.level ?? 1) === 1,
                        ).length === 1
                          ? "section"
                          : "sections"}{" "}
                        ·{" "}
                        {templateUsage(
                          data.proposals.filter((p) => p.template_id === t.id)
                            .length,
                        )}{" "}
                        ·{" "}
                        {t.starter_key
                          ? t.starter_edited
                            ? edited(t.id)
                              ? lastEdit(t.id)
                              : "Edited"
                            : "Default"
                          : lastEdit(t.id)}
                      </small>
                    </div>
                  </a>
                  {(t.starter_key || t.connector_restore_event_id) && (
                    <StarterCardMenu
                      template={t}
                      owner={data.user.staff_role === "owner"}
                      onChanged={refreshTemplates}
                    />
                  )}
                </div>
              ))}
          </div>
          {!templates.length && (
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
                <strong>{b.name}</strong>
                <span className="muted">{blockType(b.block)}</span>
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
            options={[
              "All",
              "Text",
              "List",
              "Contract clause",
              "Image",
              "Group",
            ].map((t) => ({
              value: t,
              label: `${t} · ${data.library.filter((b) => t === "All" || (b.type === "group" ? "Group" : blockType(b.block)) === t).length}`,
            }))}
          />
          <div className="studio-data-table saved-block-table">
            <div className="studio-table-head">
              <span>Block</span>
              <span>Type</span>
              <span>Used in</span>
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
                  <small className="saved-block-phone-summary">
                    {b.type === "group"
                      ? `Group · ${b.blocks?.length ?? 0} blocks`
                      : blockType(b.block)}{" "}
                    · In {b.used_in?.templates.length ?? 0}{" "}
                    {b.used_in?.templates.length === 1
                      ? "template"
                      : "templates"}
                  </small>
                </span>
                <span>
                  {b.type === "group"
                    ? `Group · ${b.blocks?.length ?? 0} blocks`
                    : blockType(b.block)}
                </span>
                <span>
                  In {b.used_in?.templates.length ?? 0}{" "}
                  {b.used_in?.templates.length === 1 ? "template" : "templates"}
                </span>
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
