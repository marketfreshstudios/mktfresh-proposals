"use client";
import {
  StaffTable,
  StaffTableHead,
  StaffTableEmpty,
  StaffTableOpen,
} from "./staff-table";
import { StarterCardMenu } from "./starter-library";
import type { Template } from "../lib/model";
import { studioDate, templateUsage } from "../lib/studio-v3";
import { StudioFilters } from "./studio-v3";
import { useEffect, useState } from "react";
import { Skeleton } from "./foundation";
import type { Data } from "./staff-app";
import type { Activity } from "../lib/studio";
import type { Block } from "../lib/model";
import { fieldLabel } from "../lib/field-labels";
import { plainEditorText, resolvedEditorText } from "../lib/editor-fields";
import { blockText } from "../lib/editor-document";
import { savedBlockLabel } from "../lib/saved-block-type";
import { defaultCover, contentAfterCover } from "../lib/cover";
import { defaultTemplateBands } from "../lib/page-bands";
import { fontCss } from "../lib/proposal-fonts";
import { api, post, Button, Empty, Banner } from "./ui";
import { confirmDialog } from "./dialog-actions";
import { withCount } from "../lib/count-label";
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
function TemplateThumbnail({
  template,
  settings,
}: {
  template: Template;
  settings: Data["settings"];
}) {
  const coverTitle = template.cover?.elements?.find(
    (element) => element.kind === "title" && !element.hidden,
  )?.content;
  const heading = template.content.find((block) => block.type === "heading");
  const title =
    (coverTitle && plainEditorText(coverTitle).trim()) ||
    (heading && blockText(heading).trim()) ||
    template.name;
  const samples = {
    "client.company": "Client",
    "workspace.name": settings?.company_name ?? "Workspace",
    "company.name": settings?.company_name ?? "Workspace",
  };
  const previewTitle = resolvedEditorText(title, {
    ...samples,
    "proposal.title": resolvedEditorText(template.name, samples),
  });
  return (
    <div className="template-thumbnail proposal-typography" aria-hidden="true">
      <div className="template-thumbnail-paper">
        <span
          className="template-thumbnail-accent"
          style={{ backgroundColor: settings?.accent_colour }}
        />
        <strong className="template-thumbnail-title">{previewTitle}</strong>
        <div className="template-thumbnail-lines">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
export function StudioTemplateList({
  data,
  blocks = false,
}: {
  data: Data | null;
  blocks?: boolean;
}) {
  const savedTemplates = data?.templates;
  const [refreshed, setRefreshed] = useState<{
    source: typeof savedTemplates;
    templates: Template[];
  }>();
  const templates =
    refreshed && refreshed.source === savedTemplates
      ? refreshed.templates
      : (savedTemplates ?? []);
  const refreshTemplates = async () => {
    setRefreshed({
      source: savedTemplates,
      templates: await api<Template[]>("/api/templates"),
    });
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
      ? `Edited ${studioDate(e.created_at)} · ${data?.staff.find((m) => e.actor === `staff:${m.user_id}`)?.display_name ?? "Staff"}`
      : "Default";
  };
  const library = data?.library ?? [];
  const items = library.filter(
    (b) =>
      (!query || b.name.toLowerCase().includes(query.toLowerCase())) &&
      (type === "All" ||
        (b.type === "group" ? "Group" : blockType(b.block)) === type),
  );
  const recent = [...library]
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
  async function deleteSample(template: Template) {
    if (
      !(await confirmDialog({
        title: `Delete “${template.name}”?`,
        description:
          "This removes the sample from Templates. Existing proposals keep their content.",
        confirmLabel: "Delete sample",
        cancelLabel: "Cancel",
        destructive: true,
      }))
    )
      return;
    try {
      await api(`/api/templates/${template.id}`, { method: "DELETE" });
      await refreshTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete sample.");
    }
  }
  const sampleCount = templates.filter((t) => t.sample).length;
  const matchingTemplates = templates
    .filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    .sort(
      (a, b) =>
        Number(!!b.sample) - Number(!!a.sample) ||
        (a.starter_order ?? 999) - (b.starter_order ?? 999),
    );
  return (
    <div className="studio-v3-list">
      <div className="studio-list-intro">
        <p>
          Starting points for new proposals, and content you can drop into any
          of them.
        </p>
        <Button
          variant="primary"
          className="action"
          busy={busy}
          disabled={!data}
          onClick={create}
        >
          {blocks ? "New block" : "New template"}
        </Button>
      </div>
      <div className="studio-list-tools">
        <nav
          className="studio-segments"
          data-tab-style="underline"
          aria-label="Templates and saved blocks"
        >
          <a
            aria-current={!blocks ? "page" : undefined}
            href="/studio/templates"
          >
            Templates · {data ? templates.length : "–"}
          </a>
          <a
            aria-current={blocks ? "page" : undefined}
            href="/studio/templates?view=blocks"
          >
            Saved blocks · {data ? library.length : "–"}
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
      {!data ? (
        <Skeleton
          kind={blocks ? "table" : "cards"}
          label={blocks ? "Loading saved blocks…" : "Loading templates…"}
        />
      ) : !blocks ? (
        <>
          <TemplateWarnings templates={templates} catalog={data.catalog} />
          {templates.some((t) => t.starter_key) && (
            <p className="staff-surface staff-surface-note muted">
              Starter terms are a starting point, not legal advice. Have an
              attorney review them before you use them.
            </p>
          )}
          {sampleCount > 0 && (
            <p className="staff-surface staff-surface-note">
              {withCount(sampleCount, "sample template")} to start from. Edit or
              delete the samples as needed. They have no preset prices.
            </p>
          )}
          <style>{fontCss(data.settings)}</style>
          <div className="studio-template-grid">
            {matchingTemplates.map((t) => (
              <div className="studio-template-card-shell" key={t.id}>
                <a
                  href={`/studio/templates/${t.id}`}
                  className="studio-template-card"
                  data-hidden={!t.active || undefined}
                >
                  <TemplateThumbnail template={t} settings={data.settings} />
                  <div className="studio-template-card-footer">
                    <div>
                      <strong
                        className="studio-template-card-name"
                        data-testid="template-card-name"
                      >
                        {t.name}
                      </strong>
                      {t.starter_key && (
                        <span className="starter-pill">Starter</span>
                      )}
                      {t.sample && <span className="starter-pill">Sample</span>}
                    </div>
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
                      ).toLowerCase()}{" "}
                      ·{" "}
                      {t.starter_key
                        ? t.starter_edited
                          ? edited(t.id)
                            ? lastEdit(t.id).replace(/^Edited/, "edited")
                            : "edited"
                          : "Default"
                        : lastEdit(t.id).replace(/^Edited/, "edited")}
                    </small>
                  </div>
                </a>
                {(t.starter_key ||
                  t.connector_restore_event_id ||
                  t.sample) && (
                  <StarterCardMenu
                    template={t}
                    owner={data.user.staff_role === "owner"}
                    onChanged={refreshTemplates}
                    onDelete={
                      t.sample && data.user.staff_role === "owner"
                        ? () => void deleteSample(t)
                        : undefined
                    }
                  />
                )}
              </div>
            ))}
          </div>
          {!matchingTemplates.length && (
            <Empty
              title={
                query ? "No matching templates" : "Create your first template"
              }
            />
          )}
          <section className="studio-saved-preview">
            <header>
              <h2>Saved blocks</h2>
              <a href="/studio/templates?view=blocks">
                See all {data.library.length}
              </a>
            </header>
            <StaffTable className="saved-preview-table">
              <StaffTableHead className="studio-table-head">
                <span>Name</span>
                <span>Type</span>
                <span className="sr-only">Actions</span>
              </StaffTableHead>
              {recent.map((b) => (
                <div className="staff-table-row studio-table-row" key={b.id}>
                  <strong>{b.name}</strong>
                  <span className="muted">
                    {b.type === "group"
                      ? savedBlockLabel(b)
                      : blockType(b.block)}
                  </span>
                  <StaffTableOpen
                    href={`/studio/blocks/${b.id}`}
                    label={`Open ${b.name}`}
                  />
                </div>
              ))}
              {!recent.length && (
                <StaffTableEmpty>
                  No saved blocks yet. Select any block in a proposal or
                  template and choose ⋯ › Save for reuse.
                </StaffTableEmpty>
              )}
            </StaffTable>
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
          <StaffTable className="studio-data-table saved-block-table">
            <StaffTableHead className="studio-table-head">
              <span>Name</span>
              <span>Blocks</span>
              <span>Used in</span>
              <span>Updated</span>
              <span className="sr-only">Actions</span>
            </StaffTableHead>
            {items.map((b) => {
              const type = b.type === "group" ? "Group" : blockType(b.block);
              const count = b.type === "group" ? (b.blocks?.length ?? 0) : 1;
              const templates = b.used_in?.templates.length ?? 0;
              const use = `In ${templates} ${templates === 1 ? "template" : "templates"}`;
              return (
                <div className="staff-table-row studio-table-row" key={b.id}>
                  <span>
                    <strong>{b.name}</strong>
                    <small>
                      {type} · {summary(b.block) || "Empty block"}
                    </small>
                    <small className="saved-block-phone-summary">
                      {b.type === "group" ? savedBlockLabel(b) : type} · {use}
                    </small>
                  </span>
                  <span
                    aria-label={`${count} ${count === 1 ? "block" : "blocks"}`}
                  >
                    {count}
                  </span>
                  <span>{use}</span>
                  <span>{lastEdit(b.id)}</span>
                  <StaffTableOpen
                    href={`/studio/blocks/${b.id}`}
                    label={`Open ${b.name}`}
                  />
                </div>
              );
            })}
            {!items.length && (
              <StaffTableEmpty>
                {data.library.length
                  ? "No matching blocks."
                  : "No saved blocks yet. Select any block in a proposal or template and choose ⋯ › Save for reuse."}
              </StaffTableEmpty>
            )}
          </StaffTable>
        </>
      )}
    </div>
  );
}
