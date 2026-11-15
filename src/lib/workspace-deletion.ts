import { supabase } from "./repository";

// A closed workspace's data is deleted 90 days after it closes (Terms 12,
// Privacy 5). The database purge itself checks the 90 days; this removes the
// workspace's stored files first and its staff sign-ins after.

export type DeletionDeps = {
  due(): Promise<string[]>;
  /** Every stored file path under the workspace's folder. */
  files(workspace: string): Promise<string[]>;
  removeFiles(paths: string[]): Promise<void>;
  /** Deletes the workspace's rows; returns its staff user ids. */
  purge(workspace: string): Promise<string[]>;
  deleteUser(id: string): Promise<void>;
};

/** Deletes up to `limit` workspaces closed for 90 days. Cron only. */
export async function deleteClosedWorkspaces(
  deps: DeletionDeps = supabaseDeletionDeps(),
  limit = 3,
) {
  let deleted = 0;
  for (const workspace of (await deps.due()).slice(0, limit)) {
    try {
      const paths = await deps.files(workspace);
      for (let i = 0; i < paths.length; i += 100)
        await deps.removeFiles(paths.slice(i, i + 100));
      const users = await deps.purge(workspace);
      for (const user of users)
        await deps.deleteUser(user).catch(() => {
          console.error("Unable to delete a closed workspace's sign-in");
        });
      deleted++;
    } catch {
      // Retried on the next run; the purge is all-or-nothing in the database.
      console.error("Unable to delete a closed workspace");
    }
  }
  return deleted;
}

export function supabaseDeletionDeps(): DeletionDeps {
  const db = supabase();
  const bucket = process.env.STORAGE_BUCKET ?? "proposal-files";
  async function list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.storage
        .from(bucket)
        .list(prefix, { limit: 1000, offset });
      if (error) throw new Error("Unable to list stored files");
      for (const entry of data ?? []) {
        const path = `${prefix}/${entry.name}`;
        // Folders come back without an id.
        if (entry.id) out.push(path);
        else out.push(...(await list(path)));
      }
      if ((data ?? []).length < 1000) return out;
    }
  }
  return {
    async due() {
      const { data, error } = await db.rpc("workspaces_due_for_deletion");
      if (error) throw new Error("Unable to load closed workspaces");
      return (data ?? []) as string[];
    },
    files: (workspace) => list(workspace),
    async removeFiles(paths) {
      const { error } = await db.storage.from(bucket).remove(paths);
      if (error) throw new Error("Unable to remove stored files");
    },
    async purge(workspace) {
      const { data, error } = await db.rpc("purge_workspace", {
        target_workspace: workspace,
      });
      if (error) throw new Error("Unable to delete workspace data");
      return (data ?? []) as string[];
    },
    async deleteUser(id) {
      const { error } = await db.auth.admin.deleteUser(id);
      if (error) throw new Error("Unable to delete sign-in");
    },
  };
}
