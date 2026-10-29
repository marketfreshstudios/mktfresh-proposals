import { MemoryRepository } from "../src/lib/repository";
import { seed, seedIds } from "../seed/marketfresh";
import { ProposalService } from "../src/lib/service";
import { ClientSchema, type Actor } from "../src/lib/model";
import { signatoryVersion } from "../src/lib/company-signatory";
import type { WorkspaceSettings } from "../src/lib/workspace";
// A one-pixel test fixture, never a production signature.
export const testSignatureImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5uQAAAAASUVORK5CYII=";
export const testSignatory = {
  user_id: "00000000-0000-4000-8000-000000000001",
  name: "Alex Morgan",
  title: "Owner",
  email: "staff@example.test",
  image: testSignatureImage,
  authorized_user_ids: ["00000000-0000-4000-8000-000000000001"],
};
export const companyConsent = (
  revision: number,
  settings: WorkspaceSettings,
) => ({
  revision,
  consent: true as const,
  signatory_version: signatoryVersion(settings),
});
export const staff: Actor = {
  staff_name: "Alex Morgan",
  staff_email: "staff@example.test",
  staff_role: "owner",
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
  const settings = (
    await repo.entities<WorkspaceSettings>("workspace_settings")
  )[0];
  settings.company_name = "Example Studio";
  settings.company_signatory = structuredClone(testSignatory);
  await repo.put("workspace_settings", settings);
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
  return { repo, service, draft, settings };
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
