import type { BillingLine, Item } from "./model";

export const proposalInvoiceRef = (id: string) =>
  "YW-" + id.slice(0, 8).toUpperCase();
export const qboBillingEmail = (client: {
  email: string;
  billing_email?: string | null;
}) => client.billing_email || client.email;

export function qboItemMapping(
  line: BillingLine,
  catalog: Item[],
  fallback: string | null | undefined,
  realm?: string,
) {
  const product = catalog.find((item) => item.id === line.pricing_item_id);
  const oneTime =
    product?.sublines?.filter((s) => s.interval === "one_time") ?? [];
  const mapped = product
    ? (product.qbo_item_ref ??
      oneTime.find((s) => s.id === line.id)?.qbo_item_ref ??
      (oneTime.length === 1 ? oneTime[0].qbo_item_ref : null))
    : line.pricing_item_id
      ? line.qbo_item_ref
      : null;
  return (
    [mapped, fallback].find(
      (ref) => !!ref && (!realm || ref.startsWith(realm + ":")),
    ) ?? null
  );
}
