-- Plan state per workspace. Existing workspaces are active; workspaces created
-- by signup start a 14-day trial. Read-only is derived in the app from these
-- columns (trial over, or past due for more than 7 days, or canceled).
alter table public.workspaces
  add column plan_status text not null default 'active'
    check (plan_status in ('trial', 'active', 'past_due', 'canceled')),
  add column trial_ends_at timestamptz,
  add column past_due_since timestamptz,
  add column trial_reminder_sent_at timestamptz,
  add column trial_ended_sent_at timestamptz,
  add constraint workspaces_trial_has_end check (plan_status <> 'trial' or trial_ends_at is not null);

-- Signup now starts the trial clock when the workspace is created.
create or replace function public.complete_workspace_signup(target_user uuid)
returns table (workspace_id uuid, slug text) language plpgsql security invoker set search_path = '' as $$
declare pending public.workspace_signups; ws uuid;
begin
  select * into pending from public.workspace_signups s where s.user_id = target_user and s.expires_at > now() for update;
  if not found then
    return query select w.id, w.slug from public.staff_users m join public.workspaces w on w.id = m.workspace_id
      where m.user_id = target_user and m.role = 'owner' and m.status = 'active';
    if not found then raise exception 'Signup not found or expired' using errcode = 'P0002'; end if;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(94140, pg_catalog.hashtext(pending.slug));
  if exists (select 1 from public.staff_users where user_id = target_user) then
    raise exception 'User already belongs to a workspace' using errcode = '23505';
  end if;
  if exists (select 1 from public.workspaces w where w.slug = pending.slug) then
    raise exception 'Address taken' using errcode = '23505';
  end if;
  ws := gen_random_uuid();
  insert into public.workspaces (id, name, slug, plan_status, trial_ends_at)
    values (ws, pending.business_name, pending.slug, 'trial', now() + interval '14 days');
  insert into public.staff_users (user_id, workspace_id, role, display_name, status, password_change_required)
    values (target_user, ws, 'owner', pending.display_name, 'active', false);
  insert into public.team_audit (workspace_id, actor, actor_name, target_user_id, target_name, action, before, after)
    values (ws, 'staff:' || target_user, pending.display_name, target_user, pending.display_name, 'workspace_created', null,
      jsonb_build_object('name', pending.business_name, 'slug', pending.slug));
  delete from public.workspace_signups s where s.user_id = target_user;
  return query select ws, pending.slug;
end $$;
revoke all on function public.complete_workspace_signup(uuid) from public, anon, authenticated;
grant execute on function public.complete_workspace_signup(uuid) to service_role;

-- Marks a trial email as sent exactly once; returns false if it already was.
create function public.claim_trial_email(target_workspace uuid, kind text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if kind = 'reminder' then
    update public.workspaces set trial_reminder_sent_at = now()
      where id = target_workspace and plan_status = 'trial' and trial_reminder_sent_at is null;
  elsif kind = 'ended' then
    update public.workspaces set trial_ended_sent_at = now()
      where id = target_workspace and plan_status = 'trial' and trial_ended_sent_at is null;
  else
    raise exception 'Unknown trial email' using errcode = '22023';
  end if;
  return found;
end $$;
revoke all on function public.claim_trial_email(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_trial_email(uuid, text) to service_role;
