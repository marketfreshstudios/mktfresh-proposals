import { AppError } from "./model";
import { supabase } from "./repository";
import { appOrigin, workspaceOrigin } from "./links";
import { requestHost, workspaceSlugFromHost } from "./workspace-address";
export type WorkspaceAddressLookup = {
  idForSlug(slug: string): Promise<string | null>;
  slugForId(id: string): Promise<string | null>;
};
const ttl = 60_000;
const cache = new Map<string, { value: string | null; at: number }>();
async function cached(key: string, load: () => Promise<string | null>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await load();
  cache.set(key, { value, at: Date.now() });
  return value;
}
export function forgetWorkspaceAddresses() {
  cache.clear();
}
export const databaseAddresses: WorkspaceAddressLookup = {
  idForSlug: (slug) =>
    cached("slug:" + slug, async () => {
      const { data, error } = await supabase()
        .from("workspaces")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw new AppError(503, "Workspace lookup is unavailable");
      return data?.id ?? null;
    }),
  slugForId: (id) =>
    cached("id:" + id, async () => {
      const { data, error } = await supabase()
        .from("workspaces")
        .select("slug")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new AppError(503, "Workspace lookup is unavailable");
      return data?.slug ?? null;
    }),
};
// APP_URL keeps working for workspaces without an address, even when its host
// looks like one (marketfresh.yeswell.co before that workspace claims it).
function unclaimedAppHost(host: string, owner: string | null) {
  return owner === null && new URL(appOrigin()).host === host.toLowerCase();
}
function lookupFor(lookup?: WorkspaceAddressLookup) {
  return lookup ?? (process.env.APP_MODE === "local" ? null : databaseAddresses);
}
// Staff on another workspace's address are sent to their own. `origin` is
// null when there is nowhere better to send them.
export class WorkspaceHostMismatch extends AppError {
  constructor(public origin: string | null) {
    super(403, "This account belongs to a different workspace address.");
  }
}
export async function checkStaffWorkspaceHost(
  request: Request,
  workspaceId: string,
  lookup?: WorkspaceAddressLookup,
) {
  const host = requestHost(request);
  const slug = workspaceSlugFromHost(host);
  const addresses = lookupFor(lookup);
  if (!slug || !addresses) return;
  const owner = await addresses.idForSlug(slug);
  if (owner === workspaceId || unclaimedAppHost(host, owner)) return;
  const origin = workspaceOrigin(await addresses.slugForId(workspaceId));
  throw new WorkspaceHostMismatch(
    origin === new URL(request.url).origin ? null : origin,
  );
}
// A proposal link only opens on its own workspace's address (or on hosts that
// are not workspace addresses, such as APP_URL before addresses are set).
export async function publicHostAllows(
  host: string | null | undefined,
  workspaceId: string,
  lookup?: WorkspaceAddressLookup,
) {
  const slug = workspaceSlugFromHost(host);
  const addresses = lookupFor(lookup);
  if (!host || !slug || !addresses) return true;
  const owner = await addresses.idForSlug(slug);
  return owner === workspaceId || unclaimedAppHost(host, owner);
}
