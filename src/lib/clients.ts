import { canonical } from "./content";
import {
  AppError,
  check,
  ClientSchema,
  type Client,
  type Proposal,
} from "./model";
import { AddressSchema, PhoneInputSchema, countryCode } from "./client-contact";
import type { Repository } from "./repository";
export class DuplicateClient extends AppError {
  constructor(public existing: Client) {
    super(409, "A client with this email already exists.");
  }
}
export function sameClientContact(a: Client, b: Client) {
  return canonical(a) === canonical(b);
}
/** Signed/frozen and imported records retain their copied contact forever. */
export function unsignedClientProposal(p: Proposal, clientId: string) {
  return (
    p.client.id === clientId &&
    p.source === "native" &&
    !["signed_by_client", "completed"].includes(p.status) &&
    !p.signers.length &&
    !p.versions.some((v) => v.frozen)
  );
}
export async function saveClient(
  repo: Repository,
  raw: unknown,
  write: (client: Client) => Promise<Client> = (client) =>
    repo.saveClientContact(client),
) {
  const candidate = ClientSchema.parse(raw);
  if (candidate.address.country)
    candidate.address.country = countryCode(candidate.address.country);
  const client = ClientSchema.extend({
    phone: PhoneInputSchema,
    address: AddressSchema.default({
      line1: "",
      line2: "",
      city: "",
      region: "",
      postal_code: "",
      country: "US",
    }),
  }).parse(candidate);
  client.email = client.email.trim().toLowerCase();
  const existing = (await repo.entities<Client>("clients")).find(
    (c) =>
      c.id !== client.id &&
      c.email.toLowerCase() === client.email.toLowerCase(),
  );
  if (existing) throw new DuplicateClient(existing);
  try {
    return await write(client);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      const duplicate = (await repo.entities<Client>("clients")).find(
        (c) => c.email.toLowerCase() === client.email.toLowerCase(),
      );
      if (duplicate) throw new DuplicateClient(duplicate);
    }
    throw error;
  }
}

export async function linkStripeCustomer(
  repo: Repository,
  clientId: string,
  customerId: string | null,
  expected: string | null,
  actor: import("./model").Actor,
  api?: import("./catalog").StripeTransport,
) {
  check(
    actor.actor.startsWith("staff:"),
    "Only staff can choose a Stripe customer",
    403,
  );
  const client = (await repo.entities<Client>("clients")).find(
    (c) => c.id === clientId,
  );
  check(client, "Client not found", 404);
  check(
    client.stripe_customer_id === expected,
    "Customer link changed; reload and try again",
    409,
  );
  if (customerId) {
    check(api, "Stripe test credentials required", 503);
    check(/^cus_[A-Za-z0-9]+$/.test(customerId), "Invalid Stripe customer ID");
    const candidate = await api.get<{
      livemode: boolean;
      deleted?: boolean;
      email: string | null;
    }>(`/v1/customers/${customerId}`, {});
    check(
      candidate.livemode === false && !candidate.deleted,
      "Test-mode customer required",
    );
    check(
      candidate.email?.toLowerCase() === client.email.toLowerCase(),
      "Stripe customer email does not match this client",
    );
  }
  await repo.linkClientStripe(
    client.id,
    expected,
    client.email,
    customerId,
    actor,
  );
  return { ...client, stripe_customer_id: customerId };
}
