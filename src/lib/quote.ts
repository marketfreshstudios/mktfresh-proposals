import { BillingLineSchema, type Item, type Proposal } from "./model";
import { quoteSublines, cloneQuote, validateItems } from "./quote-model";
import { pendingSections } from "./ai-review";
import { renderBlocks, variables } from "./presentation";

/** One shared readiness result for the editor, send endpoint and MCP. */
export function readiness(
  p: Proposal,
  catalog: Item[],
  now = new Date(),
  confirmAiReview = false,
) {
  const errors: string[] = [],
    warnings: string[] = [];
  if (p.archived_at) errors.push("Unarchive this proposal before sending");
  if (p.valid_until && Date.parse(p.valid_until) <= now.getTime())
    errors.push("Proposal expired");
  if (!p.valid_until && /proposal\.valid_until/.test(JSON.stringify(p.content)))
    warnings.push(
      "Valid until is used in the text but this proposal never expires — use {{proposal.validity}} instead",
    );
  const pending = pendingSections(p);
  if (pending.length && !confirmAiReview)
    errors.push(
      `Confirm review of AI changes before sending: ${pending.join(", ")}`,
    );
  try {
    validateItems(p.quote);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Invalid quote items");
  }
  for (const i of cloneQuote(p.quote)) {
    if (
      i.choice_group_id &&
      !cloneQuote(p.quote).some(
        (v) => v.choice_group_id === i.choice_group_id && v.default_selected,
      )
    )
      warnings.push(
        `${i.name}: choice group has no default; client must choose`,
      );
    for (const s of i.sublines)
      if (
        (i.ai_entered || p.ai_unreviewed) &&
        s.list_amount !== null &&
        s.amount !== s.list_amount &&
        !i.price_review?.[s.id]
      )
        errors.push(`${i.name}: review AI price with Use list price or Keep`);
  }
  for (const block of p.content) {
    if (block.type === "contract") {
      if (block.contract_edited)
        warnings.push("Contract edited for this proposal");
      for (const c of block.clauses ?? [])
        if (c.draft)
          warnings.push(
            `Contract clause ${c.heading.match(/^[0-9.]+/)?.[0] ?? c.heading} is draft wording`,
          );
    }
  }
  if (!p.quote.length) errors.push("Quote required");
  if (new Set(p.quote.map((l) => l.id)).size !== p.quote.length)
    errors.push("Duplicate line IDs");
  for (const role of ["client", "company"])
    if (
      p.content.filter((b) => b.type === "signature_block" && b.role === role)
        .length !== 1
    )
      errors.push(`Exactly one ${role} signature block required`);
  for (const raw of quoteSublines(p.quote)) {
    const parsed = BillingLineSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`${raw.name}: invalid quote line`);
      continue;
    }
    const l = parsed.data;
    const item = catalog.find((i) => i.id === l.pricing_item_id);
    if (!l.optional && !l.selected)
      errors.push(`${l.name}: required items must be selected`);
    if (
      item?.legacy ||
      catalog.some(
        (i) =>
          i.legacy &&
          i.stripe_lookup_key &&
          i.stripe_lookup_key === l.stripe_lookup_key,
      )
    ) {
      errors.push(`${l.name}: legacy lookup key cannot be sent`);
      warnings.push(`${l.name}: legacy lookup key`);
    }
    if (item && !item.active && !item.legacy)
      errors.push(`${l.name}: inactive product`);
    if (l.list_amount !== null && l.amount !== l.list_amount)
      warnings.push(`${l.name}: amount differs from list`);
    if (!l.pricing_item_id)
      warnings.push(`${l.name}: custom — check scope and price`);
    if (
      l.interval === "one_time" &&
      !l.qbo_item_ref &&
      !p.workspace_settings?.qbo_custom_item_ref
    )
      warnings.push(
        `${l.name}: Invoice manually if QuickBooks is not connected or mapped`,
      );
    if (l.interval !== "one_time") {
      if (!l.stripe_lookup_key && !l.custom_family_id)
        errors.push(
          `${l.name}: recurring line needs a lookup key or custom family`,
        );
      if (
        l.stripe_lookup_key &&
        !catalog.some((i) => i.stripe_lookup_key === l.stripe_lookup_key)
      )
        warnings.push(`${l.name}: unknown lookup key`);
    }
    const t = l.plan_terms;
    if (
      t &&
      [t.kickoff_qbo, t.payoff_months, t.build_credit_mo, t.full_price].every(
        (v) => typeof v === "number",
      ) &&
      Number(t.kickoff_qbo) +
        Number(t.payoff_months) * Number(t.build_credit_mo) !==
        t.full_price
    )
      warnings.push(
        `${l.name}: kickoff plus build credits differs from full price`,
      );
  }
  try {
    renderBlocks(p.content, p.quote, variables(p), p.currency);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Invalid proposal content");
  }
  return { ready: !errors.length, errors, warnings };
}
