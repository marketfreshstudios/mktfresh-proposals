import { describe, expect, it } from "vitest";
import { timelineEvents } from "../src/lib/timeline";
import { setup, staff } from "./helpers";

const ev = (id: string, type: string, actor: string, session?: string) => ({
  id,
  type,
  actor,
  metadata: session ? { editor_session: session } : {},
});

describe("timelineEvents", () => {
  it("shows one edited entry per editor session, keeping the last save", () => {
    const out = timelineEvents([
      ev("1", "created", "a"),
      ev("2", "edited", "a", "s1-aaaaaaaa"),
      ev("3", "edited", "a", "s1-aaaaaaaa"),
      ev("4", "edited", "a", "s1-aaaaaaaa"),
      ev("5", "edited", "a", "s2-bbbbbbbb"),
      ev("6", "edited", "a", "s2-bbbbbbbb"),
    ]);
    expect(out.map((e) => e.id)).toEqual(["1", "4", "6"]);
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
  it("collapses consecutive older edits without a session", () => {
    const out = timelineEvents([
      ev("1", "edited", "a"),
      ev("2", "edited", "a"),
      ev("3", "edited", "a", "s1-aaaaaaaa"),
    ]);
    expect(out.map((e) => e.id)).toEqual(["2", "3"]);
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
