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
export async function staff(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(
    /^Bearer /,
    "",
  );
  if (
    process.env.APP_MODE === "local" &&
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL &&
    equalSecret(token, process.env.DEV_STAFF_TOKEN ?? "")
  )
    return actor(request, "staff:00000000-0000-4000-8000-000000000001");
  if (!token || !process.env.SUPABASE_URL)
    throw new AppError(401, "Staff login required");
  const db = supabase(),
    { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new AppError(401, "Invalid session");
  const member = await db
    .from("staff_users")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (member.error || !member.data)
    throw new AppError(403, "Staff access required");
  return actor(request, "staff:" + data.user.id);
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
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (member.error || !member.data)
    throw new AppError(403, "Staff access required");
  return data.session;
}
