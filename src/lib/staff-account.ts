import { sha256 } from "./content";
import { signatoryVersion, validateSignatureImage } from "./company-signatory";
import { AppError, check, type Actor, type Proposal } from "./model";
import { proposalOwnerId } from "./proposal-owner";
import { SupabaseRepository, supabase, type Repository } from "./repository";
import type { Storage } from "./storage";
import {
  staffName,
  type AccountNotification,
  type StaffAccount,
  type StaffAccountPatch,
} from "./staff-account-model";
import type { WorkspaceSettings } from "./workspace";
import { updateStaffDisplayName, workspaceStaff } from "./auth";

type SavedAccount = StaffAccountPatch & {
  id: string;
  photo_path?: string | null;
};
type AccountActor = Actor & {
  workspace_id: string;
  staff_name: string;
  staff_email: string;
};

async function savedAccount(repo: Repository, id: string) {
  if (repo instanceof SupabaseRepository) {
    const { data, error } = await supabase()
      .from("staff_accounts")
      .select("data")
      .eq("workspace_id", repo.workspaceId)
      .eq("id", id)
      .maybeSingle();
    if (error)
      throw new AppError(503, "Account settings are unavailable. Try again.");
    return (data?.data ?? null) as SavedAccount | null;
  }
  return (
    (await repo.entities<SavedAccount>("staff_accounts")).find(
      (account) => account.id === id,
    ) ?? null
  );
}

function accountNames(saved: SavedAccount | null, displayName: string) {
  if (
    saved?.first_name &&
    staffName(saved.first_name, saved.last_name ?? "") === displayName
  )
    return { first_name: saved.first_name, last_name: saved.last_name ?? "" };
  if (displayName.includes("@")) return { first_name: "", last_name: "" };
  const [first = "", ...last] = displayName.trim().split(/\s+/);
  return { first_name: first, last_name: last.join(" ") };
}
function accountView(saved: SavedAccount | null, name: string): StaffAccount {
  return {
    ...accountNames(saved, name),
    job_title: saved?.job_title ?? "",
    phone: saved?.phone ?? "",
    theme: saved?.theme ?? null,
    timezone: saved?.timezone ?? null,
    date_format: saved?.date_format ?? null,
    notifications: saved?.notifications ?? {},
    own_proposals_only: saved?.own_proposals_only ?? false,
    photo_url: saved?.photo_path
      ? staffPhotoUrl(saved.id, saved.photo_path)
      : null,
  };
}
function accountId(repo: Repository, actor: AccountActor) {
  check(
    actor.actor.startsWith("staff:") && actor.workspace_id === repo.workspaceId,
    "Staff authorization required",
    403,
  );
  return actor.actor.slice(6);
}
export async function readStaffAccount(repo: Repository, actor: AccountActor) {
  const saved = await savedAccount(repo, accountId(repo, actor));
  return accountView(saved, actor.staff_name);
}
export async function staffProfileForProposal(repo: Repository, id: string) {
  const saved = await savedAccount(repo, id);
  if (!saved) return {};
  return {
    ...(saved.job_title ? { job_title: saved.job_title } : {}),
    ...(saved.phone ? { phone: saved.phone } : {}),
    ...(saved.photo_path ? { photo_path: saved.photo_path } : {}),
  };
}

const localWrites = new Map<string, Promise<unknown>>();
async function serializeLocal<T>(key: string, write: () => Promise<T>) {
  const operation = (localWrites.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(write);
  localWrites.set(key, operation);
  try {
    return await operation;
  } finally {
    if (localWrites.get(key) === operation) localWrites.delete(key);
  }
}

export async function saveStaffAccount(
  repo: Repository,
  actor: AccountActor,
  patch: StaffAccountPatch & { photo_path?: string | null },
) {
  const id = accountId(repo, actor);
  const changesName =
    patch.first_name !== undefined || patch.last_name !== undefined;
  async function save() {
    const before = await savedAccount(repo, id);
    const names = accountNames(before, actor.staff_name);
    const after: SavedAccount = {
      ...before,
      ...(changesName ? names : {}),
      ...patch,
      id,
      notifications: { ...before?.notifications, ...patch.notifications },
    };
    const nextName = changesName
      ? staffName(after.first_name!, after.last_name ?? "")
      : null;
    if (changesName) check(after.first_name, "Enter your first name.");
    if (repo instanceof SupabaseRepository) {
      const { data, error } = await supabase().rpc("save_staff_account", {
        target_workspace: repo.workspaceId,
        target_user: id,
        expected: before,
        replacement: after,
        expected_name: actor.staff_name,
        next_name: nextName,
      });
      if (error)
        throw new AppError(503, "Could not save your settings. Try again.");
      check(
        data,
        "Your account changed in another tab. Reload and try again.",
        409,
      );
    } else {
      if (nextName) await updateStaffDisplayName(actor, id, nextName);
      await repo.put("staff_accounts", after);
    }
    return accountView(after, nextName ?? actor.staff_name);
  }
  return repo instanceof SupabaseRepository
    ? save()
    : serializeLocal(`${repo.workspaceId}:${id}`, save);
}

function staffPhotoUrl(id: string, path: string) {
  return `/api/account/photo/${id}?v=${path.split("/").at(-1)?.slice(0, 12)}`;
}
export async function workspaceStaffPhotos(repo: Repository) {
  const accounts = await repo.entities<SavedAccount>("staff_accounts");
  return new Map(
    accounts.flatMap((row) =>
      row.photo_path
        ? [[row.id, staffPhotoUrl(row.id, row.photo_path)] as const]
        : [],
    ),
  );
}
export async function saveStaffPhoto(
  repo: Repository,
  storage: Storage,
  actor: AccountActor,
  input: unknown,
) {
  const id = accountId(repo, actor);
  check(
    typeof input === "string" &&
      input.length < 1500000 &&
      /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(input),
    "Choose a JPG or PNG photo under 1 MB.",
  );
  const bytes = Buffer.from(input.split(",")[1], "base64");
  check(bytes.length <= 1000000, "Choose a JPG or PNG photo under 1 MB.");
  let image: Buffer;
  try {
    const sharp = (await import("sharp")).default;
    const photo = sharp(bytes, {
      limitInputPixels: 16777216,
      failOn: "warning",
    });
    const meta = await photo.metadata();
    check(
      ["png", "jpeg"].includes(meta.format) && (meta.pages ?? 1) === 1,
      "Choose a single JPG or PNG photo.",
    );
    check(
      meta.width === meta.height && meta.width >= 256,
      "Choose a square photo at least 256 × 256 pixels.",
    );
    image = await photo.rotate().resize(256, 256).png().toBuffer();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      400,
      "Could not read this photo. Choose a valid JPG or PNG.",
    );
  }
  const path = `${repo.workspaceId}/staff-photos/${id}/${sha256(image)}.png`;
  await storage.put(path, image);
  return saveStaffAccount(repo, actor, { photo_path: path });
}
export async function readStaffPhoto(
  storage: Storage,
  workspaceId: string,
  id: string,
  path?: string | null,
) {
  check(
    path &&
      path.startsWith(`${workspaceId}/staff-photos/${id}/`) &&
      /^[a-f0-9]{64}\.png$/.test(path.split("/").at(-1) ?? ""),
    "Photo unavailable",
    404,
  );
  return storage.get(path);
}
export async function staffPhoto(
  repo: Repository,
  storage: Storage,
  id: string,
) {
  return readStaffPhoto(
    storage,
    repo.workspaceId,
    id,
    (await savedAccount(repo, id))?.photo_path,
  );
}

export async function saveAccountSignature(
  repo: Repository,
  actor: AccountActor,
  version: string,
  image: string,
) {
  const id = accountId(repo, actor);
  await validateSignatureImage(image);
  async function save() {
    const settings = (
      await repo.entities<WorkspaceSettings>("workspace_settings")
    )[0];
    const signatory = settings?.company_signatory;
    check(
      signatory?.user_id === id,
      "Only the designated signatory can change this signature here.",
      403,
    );
    check(
      signatoryVersion(settings) === version,
      "The company signature changed. Reload and try again.",
      409,
    );
    if (repo instanceof SupabaseRepository) {
      const { data, error } = await supabase().rpc("save_account_signature", {
        target_workspace: repo.workspaceId,
        target_user: id,
        expected: signatory,
        signature_image: image,
      });
      if (error)
        throw new AppError(503, "Could not save the signature. Try again.");
      check(data, "The company signature changed. Reload and try again.", 409);
    } else {
      await repo.put("workspace_settings", {
        ...settings,
        company_signatory: { ...signatory, image },
      });
    }
    const next = { ...signatory, image };
    return {
      signature: next,
      version: signatoryVersion({ ...settings, company_signatory: next }),
    };
  }
  return repo instanceof SupabaseRepository
    ? save()
    : serializeLocal(`${repo.workspaceId}:signature`, save);
}

export async function allowStaffNotification(
  repo: Repository,
  proposal: Proposal,
  to: string,
  key: AccountNotification,
  memberId?: string,
) {
  const address = to.toLowerCase();
  const id =
    memberId ??
    (proposal.owner?.email?.toLowerCase() === address
      ? proposalOwnerId(proposal)
      : undefined) ??
    (proposal.sender?.email.toLowerCase() === address
      ? proposal.sender.user_id
      : undefined);
  const eligible =
    id ??
    (repo instanceof SupabaseRepository
      ? (await workspaceStaff(repo.workspaceId)).find(
          (member) => member.email.toLowerCase() === address,
        )?.user_id
      : undefined);
  if (!eligible) return true;
  const account = await savedAccount(repo, eligible);
  return (
    account?.notifications?.[key] !== false &&
    (!account?.own_proposals_only || proposalOwnerId(proposal) === eligible)
  );
}
