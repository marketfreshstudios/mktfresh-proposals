// The proposal Timeline shows what a person would want to know happened, not
// every stored event. Stored events and evidence are unchanged; this only
// decides which ones to show.

/** Bookkeeping that never needs its own Timeline row. */
const HIDDEN = new Set([
  "quote_changed", // each client choice; "Client opened the proposal" is enough
  "consent_given", // always immediately followed by the signature
  "document_version",
  "editing_new_version",
  "webhook_received",
  "pdf_print_recovered",
  "qbo_token_refreshed",
]);
/** Saves that change the proposal's content. Consecutive ones read as one. */
const EDITS = new Set(["edited", "updated_after_send"]);
/** Events written by one save land within this many milliseconds. */
const SAME_SAVE_MS = 5000;

type TimelineEvent = {
  type: string;
  actor?: unknown;
  metadata?: unknown;
  created_at?: string;
};

const meta = (e: TimelineEvent) =>
  (e.metadata ?? {}) as Record<string, unknown>;
const time = (e: TimelineEvent) =>
  e.created_at ? Date.parse(e.created_at) : NaN;
const day = (e: TimelineEvent) => e.created_at?.slice(0, 10) ?? "";

export function timelineEvents<T extends TimelineEvent>(events: T[]): T[] {
  const visible = events.filter(
    (e) =>
      !HIDDEN.has(e.type) &&
      // A retry is scheduled automatically; only the final outcome matters.
      !(e.type === "sync_failed" && meta(e).terminal === false),
  );
  // A contact change also re-publishes the live proposal and logs an edit.
  // Show it once: as the email change, or as "Client contact updated".
  const contactSaves = visible.filter(
    (e) =>
      e.type === "recipient_email_changed" ||
      (e.type === "edited" && meta(e).client_contact_updated),
  );
  const sameSave = (a: T, b: T) =>
    a.actor === b.actor && Math.abs(time(a) - time(b)) <= SAME_SAVE_MS;
  const shown = visible.filter((e) => {
    if (e.type === "updated_after_send")
      return !contactSaves.some((c) => sameSave(c, e));
    if (e.type === "edited" && meta(e).client_contact_updated)
      return !contactSaves.some(
        (c) => c.type === "recipient_email_changed" && sameSave(c, e),
      );
    return true;
  });

  const out: T[] = [];
  for (const e of shown) {
    const last = out[out.length - 1];
    const plainEdit = (x: T) =>
      EDITS.has(x.type) && !meta(x).client_contact_updated;
    if (
      last &&
      plainEdit(e) &&
      plainEdit(last) &&
      last.actor === e.actor &&
      day(last) === day(e)
    ) {
      // One row per person per day of editing, stamped with the last save.
      // Once any of the saves changed the live link, the row says so.
      const live =
        last.type === "updated_after_send" || e.type === "updated_after_send";
      out[out.length - 1] = live ? { ...e, type: "updated_after_send" } : e;
    } else out.push(e);
  }
  return out;
}
