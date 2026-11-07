"use client";
import { useConnectorRestore } from "./connector-restore";
import { StudioFilters } from "./studio-v3";
import { useEffect, useState } from "react";
import type { Data } from "./staff-app";
import type { TeamAudit } from "../lib/team-model";
import {
  activityCsv,
  activityGroup,
  activityGroups,
  teamActivity,
  type ActivityRow,
} from "../lib/studio-activity";
import { eventLabel } from "../lib/event-label";
import { api, Button, Banner, Empty } from "./ui";
import { Skeleton } from "./foundation";
export function ActivityStudio({ data }: { data: Data }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null),
    [error, setError] = useState(""),
    [filter, setFilter] = useState(() =>
      typeof window !== "undefined" &&
      new URLSearchParams(location.search).get("view") === "team"
        ? "Team"
        : "All",
    ),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(50);
  async function load() {
    try {
      setError("");
      const [events, team] = await Promise.all([
        api<ActivityRow[]>("/api/workspace_events"),
        api<{ recent?: TeamAudit[] }>("/api/team?history=all").catch(() => ({
          recent: [],
        })),
      ]);
      setRows(
        [...events, ...(team.recent ?? []).map(teamActivity)].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const restore = useConnectorRestore(async () => {
    await load();
  });
  useEffect(() => {
    void load();
  }, []);
  const who = (e: ActivityRow) =>
    String(
      e.metadata.actor_name ??
        (e.actor.startsWith("staff:")
          ? (data.staff.find((m) => `staff:${m.user_id}` === e.actor)
              ?.display_name ?? "Staff member")
          : e.actor.startsWith("ai:")
            ? (data.assistants.find((m) => `ai:${m.id}` === e.actor)?.name ??
              "Assistant")
            : e.actor === "client"
              ? "Client"
              : "System"),
    );
  const filtered = (rows ?? []).filter(
    (e) =>
      (filter === "All" || activityGroup(e) === filter) &&
      `${who(e)} ${eventLabel(e)} ${e.detail}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const timezone = data.settings?.timezone ?? "UTC";
  const day = (when: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(when));
  const today = day(new Date().toISOString()),
    yesterday = day(new Date(Date.now() - 86400000).toISOString());
  const groups = Map.groupBy(filtered.slice(0, limit), (e) =>
    day(e.created_at),
  );
  function exportRows() {
    const url = URL.createObjectURL(
      new Blob([activityCsv(filtered)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "workspace-activity.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="studio-activity-v3">
      {restore.feedback}
      <div className="studio-list-intro">
        <p>
          Everything that happened in the workspace, by whom. Proposal records
          keep their own full audit trail.
        </p>
        <Button onClick={exportRows}>Export CSV</Button>
      </div>
      <div className="studio-list-tools">
        <StudioFilters
          label="Activity categories"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setLimit(50);
          }}
          options={activityGroups.map((g) => ({ value: g, label: g }))}
        />
        <label className="field studio-search">
          <span className="sr-only">Search activity</span>
          <input
            type="search"
            placeholder="Search activity"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(50);
            }}
          />
        </label>
      </div>
      {error ? (
        <Banner
          title="Activity could not be loaded"
          tone="danger"
          action={<Button onClick={load}>Try again</Button>}
        >
          {error}
        </Banner>
      ) : rows === null ? (
        <Skeleton />
      ) : filtered.length ? (
        [...groups].map(([date, events]) => (
          <section key={date} className="activity-day">
            <h2>
              {date === today
                ? "Today · "
                : date === yesterday
                  ? "Yesterday · "
                  : ""}
              {new Date(events[0].created_at).toLocaleDateString("en-US", {
                timeZone: timezone,
                month: "long",
                day: "numeric",
                ...(date !== today && date !== yesterday
                  ? { year: "numeric" }
                  : {}),
              })}
            </h2>
            <div className="activity-day-rows">
              {events.map((e) => (
                <article
                  className={`activity-row-v3 activity-row ${e.proposal_id ? "clickable-row" : ""}`}
                  key={e.id}
                >
                  <time dateTime={e.created_at}>
                    {new Date(e.created_at).toLocaleTimeString("en-US", {
                      timeZone: timezone,
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                  <span className="avatar" aria-hidden="true">
                    {e.actor.startsWith("ai:")
                      ? "AI"
                      : e.actor === "system" || e.actor === "client"
                        ? "·"
                        : who(e)
                            .split(" ")
                            .map((w) => w[0])
                            .slice(0, 2)
                            .join("")}
                  </span>
                  <div>
                    {e.type.startsWith("connector_") &&
                    e.metadata.editor_name ? (
                      eventLabel(e)
                    ) : (
                      <>
                        <strong>{who(e)}</strong> {eventLabel(e)}
                      </>
                    )}
                    <small>{e.detail}</small>
                    {e.metadata.can_restore === true && (
                      <Button
                        disabled={restore.busy}
                        onClick={() => void restore.restore(e.id)}
                      >
                        Restore previous version
                      </Button>
                    )}
                  </div>
                  <a
                    className={
                      e.proposal_id ? "activity-primary-link" : undefined
                    }
                    href={
                      e.metadata.entity_table === "templates"
                        ? `/studio/templates/${e.metadata.entity_id}`
                        : e.metadata.entity_table === "content_library"
                          ? `/studio/blocks/${e.metadata.entity_id}`
                          : e.proposal_id
                            ? `/proposals/${e.proposal_id}`
                            : activityGroup(e) === "Team"
                              ? "/studio/workspace?view=team"
                              : /email/.test(e.type)
                                ? "/studio/emails"
                                : /catalog|pricing/.test(e.type)
                                  ? "/studio/products"
                                  : "/studio/workspace"
                    }
                  >
                    {e.proposal_id ? "Open" : "View"}
                  </a>
                </article>
              ))}
            </div>
          </section>
        ))
      ) : (
        <Empty
          title={
            query || filter !== "All"
              ? "No activity matches these filters"
              : "Nothing yet"
          }
        >
          Proposal and Studio changes will appear here.
        </Empty>
      )}
      {filtered.length > limit && (
        <Button onClick={() => setLimit((n) => n + 50)}>Load more</Button>
      )}
    </div>
  );
}
