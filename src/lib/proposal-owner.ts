import type { Actor, Proposal } from "./model";
export type ProposalOwner = {
  user_id: string;
  display_name: string;
  email: string;
};
export function proposalOwnerId(
  p: Pick<Proposal, "owner" | "sender" | "created_by">,
) {
  return (
    p.owner?.user_id ??
    p.sender?.user_id ??
    (p.created_by.startsWith("staff:") ? p.created_by.slice(6) : null)
  );
}
export function canReassign(p: Proposal, actor: Actor) {
  return (
    actor.actor.startsWith("staff:") &&
    (actor.staff_role === "owner" ||
      proposalOwnerId(p) === actor.actor.slice(6))
  );
}
export function unfinishedAssignment(p: Proposal, id: string) {
  return (
    p.source === "native" &&
    !p.archived_at &&
    !["completed", "declined", "expired", "archived"].includes(p.status) &&
    proposalOwnerId(p) === id
  );
}
export function liveSenderAssignment(p: Proposal) {
  return (
    !p.archived_at &&
    !p.signers.length &&
    !p.versions.some((v) => v.frozen) &&
    ["sent", "viewed"].includes(p.status)
  );
}
