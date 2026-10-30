import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { LOCAL_WORKSPACE_ID } from "./workspace";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { AppError, type Actor } from "./model";
import { supabase } from "./repository";
export function equalSecret(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length > 0 && aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function actor(request: Request, name = "client"): Actor {
  return {
    actor: name,
    ip: process.env.VERCEL
      ? (request.headers.get("x-vercel-forwarded-for") ?? "")
          .split(",")[0]
          .slice(0, 100)
      : "",
    user_agent: (request.headers.get("user-agent") ?? "").slice(0, 1000),
  };
}
export function cookie(request: Request, name: string) {
  return (
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1) ?? ""
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Browsers send "Origin: null" (or omit it) for some same-origin form posts,
  // e.g. under a strict referrer policy. Fetch Metadata is the reliable signal then.
  if (!origin || origin === "null")
    return request.headers.get("sec-fetch-site") === "same-origin";
  return [
    new URL(request.url).origin,
    process.env.APP_URL,
    process.env.OAUTH_ISSUER,
  ]
    .filter(Boolean)
    .some((value) => {
      try {
        return new URL(value!).origin === origin;
      } catch {
        return false;
      }
    });
}
export async function staff(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization && !["GET", "HEAD"].includes(request.method)) {
    if (!sameOrigin(request))
      throw new AppError(403, "Same-origin request required");
  }
  const token = (authorization ?? cookie(request, "proposal_session")).replace(
    /^Bearer /,
    "",
  );
  if (
    process.env.APP_MODE === "local" &&
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL &&
    equalSecret(token, process.env.DEV_STAFF_TOKEN ?? "")
  )
    return {
      ...actor(request, "staff:00000000-0000-4000-8000-000000000001"),
      workspace_id: LOCAL_WORKSPACE_ID,
      staff_role: "owner" as const,
      staff_name: await localDisplayName(),
      staff_email: "staff@example.test",
    };
  if (!token || !process.env.SUPABASE_URL)
    throw new AppError(401, "Staff login required");
  const db = supabase(),
    { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new AppError(401, "Invalid session");
  const member = await db
    .from("staff_users")
    .select("user_id,workspace_id,role,display_name")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (member.error || !member.data)
    throw new AppError(403, "Staff access required");
  return {
    ...actor(request, "staff:" + data.user.id),
    workspace_id: member.data.workspace_id,
    staff_role: member.data.role as "owner" | "member",
    staff_name: member.data.display_name || data.user.email || "Staff",
    staff_email: data.user.email ?? "",
  };
}
export async function login(email: string, password: string) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)
    throw new AppError(503, "Configure Supabase Auth");
  const db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new AppError(401, "Invalid credentials");
  const member = await supabase()
    .from("staff_users")
    .select("user_id,workspace_id,role,display_name")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (member.error || !member.data)
    throw new AppError(403, "Staff access required");
  return data.session;
}

export async function workspaceStaff(workspaceId: string) {
  if (
    process.env.APP_MODE === "local" &&
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL
  )
    return [
      {
        user_id: "00000000-0000-4000-8000-000000000001",
        name: await localDisplayName(),
        display_name: await localDisplayName(),
        email: "staff@example.test",
        role: "owner",
      },
    ];
  const db = supabase();
  const { data, error } = await db
    .from("staff_users")
    .select("user_id,role,display_name")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return Promise.all(
    data.map(async (member) => {
      const { data, error } = await db.auth.admin.getUserById(member.user_id);
      if (error || !data.user?.email)
        throw new AppError(503, "Unable to load staff identity");
      return {
        ...member,
        email: data.user.email,
        display_name: member.display_name || data.user.email,
        name: member.display_name || data.user.email,
      };
    }),
  );
}

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (value) => !/[\r\n]/.test(value),
    "Display name cannot contain line breaks",
  );
async function localDisplayName() {
  try {
    return DisplayNameSchema.parse(
      JSON.parse(
        await readFile(
          join(process.env.DATA_DIR ?? ".data", "staff-profile.json"),
          "utf8",
        ),
      ).display_name,
    );
  } catch {
    return "Local Staff";
  }
}
export async function updateStaffDisplayName(
  actor: Actor,
  userId: string,
  name: unknown,
) {
  if (!actor.actor.startsWith("staff:"))
    throw new AppError(403, "Staff authorization required");
  const display_name = DisplayNameSchema.parse(name);
  if (actor.staff_role !== "owner" && actor.actor !== "staff:" + userId)
    throw new AppError(403, "Only owners can edit another staff member's name");
  const members = await workspaceStaff(actor.workspace_id!);
  if (!members.some((m) => m.user_id === userId))
    throw new AppError(404, "Staff member not found in this workspace");
  if (
    process.env.APP_MODE === "local" &&
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL
  ) {
    const dir = process.env.DATA_DIR ?? ".data";
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "staff-profile.json"),
      JSON.stringify({ display_name }),
    );
  } else {
    const { data, error } = await supabase()
      .from("staff_users")
      .update({ display_name })
      .eq("workspace_id", actor.workspace_id!)
      .eq("user_id", userId)
      .select("user_id,display_name")
      .single();
    if (error || !data)
      throw new AppError(400, "Unable to update staff display name");
  }
  return { user_id: userId, display_name };
}
