"use client";
import { useEffect, useState } from "react";
import { DialogActions } from "./dialog-actions";
import { Sheet } from "./foundation";
import { api, post, Banner, Button } from "./ui";

export type Seats = {
  limit: number | null;
  in_use: number;
  trial: boolean;
  can_add: boolean;
};
export const seatsFull = (s: Seats | null) =>
  !!s && s.limit !== null && s.in_use >= s.limit;

export function useSeats(owner: boolean, reload: unknown) {
  const [seats, setSeats] = useState<Seats | null>(null);
  useEffect(() => {
    if (!owner) return;
    api<Seats>("/api/billing/seats")
      .then(setSeats)
      .catch(() => setSeats(null));
  }, [owner, reload]);
  return [seats, setSeats] as const;
}

/** One line under the Team heading: how many people the plan covers. */
export function SeatLine({ seats }: { seats: Seats | null }) {
  if (!seats || seats.limit === null) return null;
  return (
    <p className="team-seats">
      <span>
        {seats.in_use} of {seats.limit} people{" "}
        {seats.trial ? "during your trial" : "on your plan"}
      </span>
      <a href="/billing">{seats.trial ? "Choose a plan" : "Change plan"}</a>
    </p>
  );
}

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 ? 2 : 0,
  });

/** Adds a person to the plan; Stripe works out today's prorated charge. */
export function AddSeatSheet({
  seats,
  onClose,
  onAdded,
}: {
  seats: Seats;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [preview, setPreview] = useState<{
      plan: "studio" | "agency";
      interval: "month" | "year";
      due_today_cents: number;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!seats.can_add) return;
    post("/api/billing/seats/preview")
      .then(setPreview)
      .catch((e) => setError((e as Error).message));
  }, [seats.can_add]);
  const unit = preview?.interval === "year" ? "$150/yr" : "$15/mo";
  return (
    <Sheet
      title={seats.can_add ? "Add a person to your plan" : "Your trial is full"}
      className="add-seat-sheet"
      onClose={onClose}
    >
      {seats.can_add ? (
        <>
          <p className="muted">
            All {seats.limit} people on your{" "}
            {preview ? (preview.plan === "agency" ? "Agency" : "Studio") : ""}{" "}
            plan are in use. Add one more to invite someone.
          </p>
          {error && (
            <Banner tone="danger" title="Couldn't add a person">
              {error}
            </Banner>
          )}
          <dl className="add-seat-facts">
            <dt>Extra person</dt>
            <dd>{preview ? unit : " "}</dd>
            <dt>
              Due today (prorated for the rest of this{" "}
              {preview?.interval === "year" ? "year" : "month"})
            </dt>
            <dd>{preview ? money(preview.due_today_cents) : " "}</dd>
          </dl>
          <DialogActions>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="action"
              busy={busy}
              disabled={!preview}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await post("/api/billing/seats");
                  onAdded();
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              Add a person
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <p className="muted">
            {seats.trial
              ? `Your trial includes ${seats.limit} people, and all are in use. Choose a plan to add more.`
              : "Every person on your plan is in use. Change your plan to add more."}
          </p>
          <DialogActions>
            <Button onClick={onClose}>Close</Button>
            <a className="btn primary action" href="/billing">
              {seats.trial ? "Choose a plan" : "Change plan"}
            </a>
          </DialogActions>
        </>
      )}
    </Sheet>
  );
}
