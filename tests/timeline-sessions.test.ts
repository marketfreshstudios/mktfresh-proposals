import { describe, expect, it } from "vitest";
import { timelineEvents } from "../src/lib/timeline";
import { setup, staff } from "./helpers";

const ev = (
  id: string,
  type: string,
  actor: string,
  session?: string,
  created_at = "2026-11-12T15:00:00.000Z",
  metadata: Record<string, unknown> = {},
) => ({
  id,
  type,
  actor,
  created_at,
  metadata: { ...(session ? { editor_session: session } : {}), ...metadata },
});

describe("timelineEvents", () => {
  it("shows one editing entry per person per day, keeping the last save", () => {
    const out = timelineEvents([
      ev("1", "created", "a"),
      ev("2", "edited", "a", "s1-aaaaaaaa"),
      ev("3", "edited", "a", "s1-aaaaaaaa"),
      ev("4", "edited", "a", "s2-bbbbbbbb"),
      ev("5", "edited", "a", "s2-bbbbbbbb", "2026-11-13T09:00:00.000Z"),
    ]);
    expect(out.map((e) => e.id)).toEqual(["1", "4", "5"]);
  });
  it("keeps different people and interleaved events apart", () => {
    const out = timelineEvents([
      ev("1", "edited", "a", "s1-aaaaaaaa"),
      ev("2", "edited", "b", "s1-aaaaaaaa"),
      ev("3", "sent", "a"),
      ev("4", "edited", "a", "s1-aaaaaaaa"),
    ]);
    expect(out.map((e) => e.id)).toEqual(["1", "2", "3", "4"]);
  });
  it("folds edits after sending into one Proposal updated after sending row", () => {
    const out = timelineEvents([
      ev("1", "sent", "a"),
      ev("2", "edited", "a"),
      ev("3", "updated_after_send", "a"),
      ev("4", "edited", "a"),
      ev("5", "updated_after_send", "a"),
      ev("6", "edited", "a"),
    ]);
    expect(out.map((e) => [e.id, e.type])).toEqual([
      ["1", "sent"],
      ["6", "updated_after_send"],
    ]);
  });
  it("shows an email change once, without the edit and live update it caused", () => {
    const at = "2026-11-12T15:35:00.000Z",
      soon = "2026-11-12T15:35:00.400Z";
    const out = timelineEvents([
      ev("1", "sent", "a"),
      ev("2", "updated_after_send", "a", undefined, soon),
      ev("3", "edited", "a", undefined, at, { client_contact_updated: true }),
      ev("4", "recipient_email_changed", "a", undefined, at),
    ]);
    expect(out.map((e) => e.id)).toEqual(["1", "4"]);
    // Other contact changes show as one "Client contact updated" row.
    const other = timelineEvents([
      ev("1", "sent", "a"),
      ev("2", "edited", "a", undefined, at, { client_contact_updated: true }),
      ev("3", "updated_after_send", "a", undefined, soon),
    ]);
    expect(other.map((e) => e.id)).toEqual(["1", "2"]);
  });
  it("hides bookkeeping events and scheduled retries", () => {
    const out = timelineEvents([
      ev("1", "viewed", "c"),
      ev("2", "quote_changed", "c"),
      ev("3", "consent_given", "c"),
      ev("4", "signed", "c"),
      ev("5", "document_version", "a"),
      ev("6", "sync_failed", "system", undefined, undefined, {
        terminal: false,
      }),
      ev("7", "sync_failed", "system"),
    ]);
    expect(out.map((e) => e.id)).toEqual(["1", "4", "7"]);
  });
});

it("stores the editor session on the edited event", async () => {
  const { service, draft } = await setup();
  const p = await service.edit(
    draft.id,
    {
      revision: draft.revision,
      title: "Renamed",
      editor_session: "s1-aaaaaaaa",
    },
    staff,
  );
  expect(p.events.findLast((e) => e.type === "edited")?.metadata).toMatchObject(
    { editor_session: "s1-aaaaaaaa" },
  );
});
