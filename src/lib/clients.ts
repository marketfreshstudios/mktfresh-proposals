import { AppError, ClientSchema, type Client } from "./model";
import type { Repository } from "./repository";
export class DuplicateClient extends AppError {
  constructor(public existing: Client) {
    super(409, "A client with this email already exists.");
  }
}
export async function saveClient(repo: Repository, raw: unknown) {
  const client = ClientSchema.parse(raw);
  const existing = (await repo.entities<Client>("clients")).find(
    (c) =>
      c.id !== client.id &&
      c.email.toLowerCase() === client.email.toLowerCase(),
  );
  if (existing) throw new DuplicateClient(existing);
  client.email = client.email.trim().toLowerCase();
  try {
    await repo.put("clients", client);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      const duplicate = (await repo.entities<Client>("clients")).find(
        (c) => c.email.toLowerCase() === client.email.toLowerCase(),
      );
      if (duplicate) throw new DuplicateClient(duplicate);
    }
    throw error;
  }
  return client;
}
