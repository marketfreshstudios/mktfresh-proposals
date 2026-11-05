"use client";
import { useEffect, useState } from "react";
import type { Data } from "./staff-app";
import { api, Icon } from "./ui";
import { studioRoutes } from "../lib/staff-routes";
import type { EmailTemplate } from "../lib/email-template-content";
import type { Activity } from "../lib/studio";
export const workspaceSections = [
  ["brand", "Brand"],
  ["fonts", "Proposal fonts"],
  ["money", "Money"],
  ["styles", "Proposal styles"],
  ["billing", "Billing defaults"],
  ["team", "Team"],
  ["signatory", "Signatory"],
  ["client-links", "Client links"],
  ["email-sending", "Email sending"],
  ["pricing-references", "Pricing references"],
] as const;
export function relativeTime(date?: string | null) {
  if (!date) return "Not synced yet";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(date)) / 60000),
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
}
export function StudioHome({ data }: { data: Data }) {
  const [emails, setEmails] = useState<EmailTemplate[] | null>(null);
  const [events, setEvents] = useState<Activity[] | null>(null);
  useEffect(() => {
    api<EmailTemplate[]>("/api/email-templates")
      .then(setEmails)
      .catch(() => {});
    api<Activity[]>("/api/workspace_events")
      .then(setEvents)
      .catch(() => {});
  }, []);
  const sync = events?.find((e) => /catalog.*sync|sync.*catalog/.test(e.type));
  const clientEmails = emails?.filter((e) => !e.staff);
  const problems = [
    data.connections?.stripe === false ? "Stripe needs setup" : "",
    data.connections?.qbo === false ? "QuickBooks needs setup" : "",
    data.connections?.email === false ? "Email sending needs setup" : "",
    data.documents.some((d) => d.fetch_error)
      ? "Pricing reference needs attention"
      : "",
  ].filter(Boolean);
  const statuses = [
    `${data.templates.length} templates · ${data.library.length} saved blocks`,
    clientEmails
      ? `${clientEmails.length} client emails · ${clientEmails.filter((e) => e.updated_at).length} edited`
      : "Loading email status…",
    `${data.catalog.filter((i) => i.active && !i.legacy).length} products · ${sync ? `synced ${relativeTime(sync.created_at)}` : "not synced yet"}`,
    problems.join(" · ") ||
      (data.connections
        ? "Connections configured"
        : "Connection status unavailable"),
    "Brand, team and signatory",
    events
      ? events[0]
        ? `Last: ${events[0].detail}`
        : "No activity yet"
      : "Loading latest activity…",
  ];
  return (
    <nav className="studio-home-list" aria-label="Studio navigation">
      {studioRoutes.map(([href, name], n) => (
        <a href={href} key={href}>
          <span>
            <strong>{name}</strong>
            <small className={n === 3 && problems.length ? "warning" : ""}>
              {statuses[n]}
            </small>
          </span>
          <Icon name="chevron-right" />
        </a>
      ))}
    </nav>
  );
}
