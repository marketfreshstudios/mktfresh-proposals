// Autosaves record an "edited" event each time. The Timeline shows one entry
// per editing session (one open editor), stamped with its last save. Older
// events without a session collapse when consecutive and by the same person.
export function timelineEvents<
  T extends { type: string; actor?: unknown; metadata?: unknown },
>(events: T[]): T[] {
  const out: T[] = [];
  const session = (e: T) => {
    const m = e.metadata as { editor_session?: unknown } | undefined;
    return typeof m?.editor_session === "string" ? m.editor_session : null;
  };
  for (const e of events) {
    const last = out[out.length - 1];
    if (
      e.type === "edited" &&
      last?.type === "edited" &&
      last.actor === e.actor &&
      session(last) === session(e)
    )
      out[out.length - 1] = e;
    else out.push(e);
  }
  return out;
}
