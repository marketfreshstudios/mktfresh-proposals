"use client";
import { createContext, useContext } from "react";
import type { PlanState } from "../lib/plan";
import { Banner } from "./ui";

const PlanContext = createContext<PlanState | null>(null);
export const WorkspacePlanProvider = PlanContext.Provider;
export const useWorkspacePlan = () => useContext(PlanContext);
export const useReadOnly = () => useContext(PlanContext)?.mode === "read_only";

const shortDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { weekday: "long" }) : "soon";
const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "soon";

/** Sidebar note for a trial that still has time left. */
export function PlanNote({ plan }: { plan: PlanState | null }) {
  if (!plan || (plan.notice !== "trial" && plan.notice !== "trial_ending"))
    return null;
  const days = plan.days_left ?? 0;
  return (
    <div className="plan-note">
      <strong>Free trial</strong>
      <span>{days === 1 ? "1 day left" : `${days} days left`}</span>
      <a className="btn plan-note-action" href="/billing">
        Choose a plan
      </a>
    </div>
  );
}

/** Banner across the top of every staff screen when the plan needs action. */
export function PlanBanner({ plan }: { plan: PlanState | null }) {
  if (!plan) return null;
  const choose = (filled = false) => (
    <a className={`btn ${filled ? "action" : ""}`} href="/billing">
      Choose a plan
    </a>
  );
  const card = (
    <a className="btn" href="/billing">
      Update card
    </a>
  );
  switch (plan.notice) {
    case "trial_ending":
      return (
        <Banner
          tone="warning"
          title={
            plan.days_left === 1
              ? "Your trial ends tomorrow"
              : `Your trial ends ${shortDay(plan.trial_ends_at)}`
          }
          action={choose()}
        >
          Choose a plan to keep creating and sending proposals.
        </Banner>
      );
    case "payment_failed":
      return (
        <Banner
          tone="danger"
          title="Your last payment didn't go through"
          action={card}
        >
          Update your card by {shortDate(plan.grace_ends_at)} to keep sending.
        </Banner>
      );
    case "trial_ended":
    case "payment_overdue":
    case "canceled":
      return (
        <Banner
          tone="info"
          title={
            plan.notice === "trial_ended"
              ? "Your trial has ended"
              : plan.notice === "canceled"
                ? "Your plan was canceled"
                : "Your payment is overdue"
          }
          action={choose(true)}
        >
          Your proposals and client links still work. Choose a plan to create
          and send again.
        </Banner>
      );
    default:
      return null;
  }
}
