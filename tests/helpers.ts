import { MemoryRepository } from "../src/lib/repository";
import { seed, seedIds } from "../src/lib/seed";
import { ProposalService } from "../src/lib/service";
import { ClientSchema, type Actor } from "../src/lib/model";
export const staff: Actor = {
  actor: "staff:00000000-0000-4000-8000-000000000001",
  ip: "127.0.0.1",
  user_agent: "Vitest",
};
export const clientActor: Actor = {
  actor: "client",
  ip: "203.0.113.10",
  user_agent: "Test browser",
};
export async function setup() {
  const repo = new MemoryRepository();
  await seed(repo, true);
  await repo.put(
    "clients",
    ClientSchema.parse({
      id: seedIds.client,
      company: "Acme & Sons",
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.test",
    }),
  );
  const service = new ProposalService(repo);
  const draft = await service.create(
    {
      client_id: seedIds.client,
      template_id: seedIds.template,
      title: "Website for Acme",
      valid_until: new Date(Date.now() + 86400000 * 30).toISOString(),
    },
    staff,
  );
  return { repo, service, draft };
}
export const signature = (revision: number, email = "jane@example.test") => ({
  revision,
  name: "Jane Doe",
  email,
  title: "Owner",
  consent: true as const,
  kind: "typed" as const,
  typed_name: "Jane Doe",
});
