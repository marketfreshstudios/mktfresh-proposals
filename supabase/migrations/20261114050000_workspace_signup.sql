-- Self-serve signup. A pending signup holds its address for 24 hours while
-- the person confirms their email; confirming creates the workspace and makes
-- them its owner. Service role only.
create table public.workspace_signups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' and slug !~ '--'),
  business_name text not null check (length(btrim(business_name)) between 1 and 200 and business_name !~ '[\r\n]'),
  display_name text not null check (length(btrim(display_name)) between 1 and 200 and display_name !~ '[\r\n]'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index workspace_signups_slug on public.workspace_signups (slug);
alter table public.workspace_signups enable row level security;
revoke all on public.workspace_signups from public, anon, authenticated;
grant all on public.workspace_signups to service_role;

-- 'reserved', 'address_taken' or 'member' (the person already has a workspace).
create function public.reserve_workspace_signup(target_user uuid, target_slug text, target_business text, target_name text)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(94140, pg_catalog.hashtext(target_slug));
  if exists (select 1 from public.staff_users where user_id = target_user) then return 'member'; end if;
  delete from public.workspace_signups where expires_at < now();
  if exists (select 1 from public.workspaces where slug = target_slug)
    or exists (select 1 from public.workspace_signups where slug = target_slug and user_id <> target_user) then
    return 'address_taken';
  end if;
  insert into public.workspace_signups (user_id, slug, business_name, display_name, expires_at)
    values (target_user, target_slug, btrim(target_business), btrim(target_name), now() + interval '24 hours')
    on conflict (user_id) do update set slug = excluded.slug, business_name = excluded.business_name,
      display_name = excluded.display_name, created_at = now(), expires_at = excluded.expires_at;
  return 'reserved';
end $$;
revoke all on function public.reserve_workspace_signup(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_workspace_signup(uuid, text, text, text) to service_role;

-- Free for signup: no workspace has it and no one else is holding it.
create function public.workspace_address_free(target_slug text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select not exists (select 1 from public.workspaces where slug = target_slug)
    and not exists (select 1 from public.workspace_signups where slug = target_slug and expires_at > now())
$$;
revoke all on function public.workspace_address_free(text) from public, anon, authenticated;
grant execute on function public.workspace_address_free(text) to service_role;

-- Returns the workspace id and its address. Repeating it after success returns
-- the same workspace, so a second click on the email link still signs in.
create function public.complete_workspace_signup(target_user uuid)
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
  insert into public.workspaces (id, name, slug) values (ws, pending.business_name, pending.slug);
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
