create table public.staff_security (
  user_id uuid primary key references public.staff_users(user_id) on delete cascade,
  revision uuid not null default gen_random_uuid(),
  totp_secret text,
  backup_hashes text[] not null default '{}',
  last_totp_step bigint,
  enrollment jsonb
);

create table public.staff_security_sessions (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references public.staff_users(user_id) on delete cascade,
  verified boolean not null default false,
  user_agent text,
  location text
);

create table public.staff_email_changes (
  user_id uuid primary key references public.staff_users(user_id) on delete cascade,
  old_email text not null,
  new_email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  keep_session uuid
);

create table public.staff_security_limits (
  user_id uuid not null references public.staff_users(user_id) on delete cascade,
  kind text not null check (kind in ('verification', 'email', 'password')),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1,
  primary key (user_id, kind)
);

alter table public.staff_security enable row level security;
alter table public.staff_security_sessions enable row level security;
alter table public.staff_email_changes enable row level security;
alter table public.staff_security_limits enable row level security;
revoke all on public.staff_security, public.staff_security_sessions, public.staff_email_changes,
  public.staff_security_limits from public, anon, authenticated;
grant select, insert, update, delete on public.staff_security, public.staff_security_sessions,
  public.staff_email_changes, public.staff_security_limits to service_role;

create function team_private.staff_session_security(target_user uuid, target_session uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when exists (
        select from public.staff_email_changes e join auth.users u on u.id = e.user_id
        where e.user_id = target_user and e.claimed_at is not null
          and e.keep_session is distinct from target_session and lower(u.email) = e.new_email
      ) then 'signed_out'
      when exists (select from public.staff_security where user_id = target_user and totp_secret is not null)
        and not exists (
          select from public.staff_security_sessions
          where session_id = target_session and user_id = target_user and verified
        ) then case when s.created_at <= now() - interval '10 minutes'
          then 'signed_out' else 'two_step' end
      else 'ok'
    end
    from auth.sessions s
    where s.id = target_session and s.user_id = target_user and (s.not_after is null or s.not_after > now())
  ), 'signed_out')
$$;

create function public.staff_session_security(target_user uuid, target_session uuid)
returns text language sql stable security invoker set search_path = '' as $$
  select team_private.staff_session_security(target_user, target_session)
$$;

-- Direct Supabase workspace policies also read staff_users. Keep their existing
-- membership rules and require the same live, verified session for that read.
create function team_private.staff_database_session_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select team_private.staff_session_security(auth.uid(), (auth.jwt()->>'session_id')::uuid) = 'ok'
$$;
revoke all on function team_private.staff_database_session_ok() from public, anon, authenticated;
grant usage on schema team_private to authenticated;
grant execute on function team_private.staff_database_session_ok() to authenticated;
create policy verified_staff_session on public.staff_users as restrictive for select to authenticated
  using ((select team_private.staff_database_session_ok()));

create function public.admit_staff_security_attempt(target_user uuid, attempt_kind text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  insert into public.staff_security_limits as l (user_id, kind) values (target_user, attempt_kind)
  on conflict (user_id, kind) do update
    set attempts = case when l.window_started_at <= now() - interval '15 minutes'
      then 1 else least(l.attempts + 1, 100) end,
        window_started_at = case when l.window_started_at <= now() - interval '15 minutes'
          then now() else l.window_started_at end
  returning attempts into n;
  return n <= case attempt_kind when 'email' then 3 when 'password' then 5 else 10 end;
end
$$;

create function team_private.manage_staff_sessions(target_user uuid, current_session uuid,
  operation text, target_session uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not exists (select from public.staff_users where user_id = target_user and status = 'active') then
    raise exception 'Active staff membership required' using errcode = '42501';
  end if;
  if operation = 'list' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'current', s.id = current_session,
      'user_agent', left(coalesce(c.user_agent, s.user_agent, ''), 1000),
      'location', c.location, 'last_active', coalesce(s.refreshed_at at time zone 'UTC', s.updated_at, s.created_at)
    ) order by (s.id = current_session) desc, coalesce(s.refreshed_at at time zone 'UTC', s.updated_at, s.created_at) desc), '[]')
    into result from auth.sessions s left join public.staff_security_sessions c on c.session_id = s.id
    where s.user_id = target_user and (s.not_after is null or s.not_after > now());
    return result;
  end if;
  if operation = 'others' then
    delete from auth.sessions where user_id = target_user and id is distinct from current_session;
  elsif operation = 'one' and target_session is not null and target_session is distinct from current_session then
    delete from auth.sessions where user_id = target_user and id = target_session;
  else
    raise exception 'Invalid staff session operation';
  end if;
  return 'true';
end
$$;

create function public.manage_staff_sessions(target_user uuid, current_session uuid,
  operation text, target_session uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select team_private.manage_staff_sessions(target_user, current_session, operation, target_session)
$$;

-- Compare-and-swap the entire factor state and mark the same Auth session verified
-- in one transaction. In particular a backup code cannot be used twice.
create function team_private.save_staff_factor(target_user uuid, target_session uuid,
  expected_revision uuid, replacement jsonb, verify_session boolean, revoke_others boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.staff_users where user_id = target_user and status = 'active' for update;
  if not found then return false; end if;
  perform 1 from auth.sessions where id = target_session and user_id = target_user
    and (not_after is null or not_after > now()) for update;
  if not found then return false; end if;
  update public.staff_security set
    revision = gen_random_uuid(),
    totp_secret = replacement->>'totp_secret',
    backup_hashes = array(select jsonb_array_elements_text(replacement->'backup_hashes')),
    last_totp_step = (replacement->>'last_totp_step')::bigint,
    enrollment = nullif(replacement->'enrollment', 'null'::jsonb)
  where user_id = target_user and revision = expected_revision;
  if not found then return false; end if;
  if revoke_others then
    delete from auth.sessions where user_id = target_user and id <> target_session;
  end if;
  if verify_session then
    insert into public.staff_security_sessions (session_id, user_id, verified)
    values (target_session, target_user, true)
    on conflict (session_id) do update set verified = true;
  end if;
  return true;
end
$$;

create function public.save_staff_factor(target_user uuid, target_session uuid,
  expected_revision uuid, replacement jsonb, verify_session boolean, revoke_others boolean)
returns boolean language sql security invoker set search_path = '' as $$
  select team_private.save_staff_factor(target_user, target_session, expected_revision,
    replacement, verify_session, revoke_others)
$$;

revoke all on function team_private.staff_session_security(uuid, uuid),
  public.staff_session_security(uuid, uuid), public.admit_staff_security_attempt(uuid, text),
  team_private.manage_staff_sessions(uuid, uuid, text, uuid), public.manage_staff_sessions(uuid, uuid, text, uuid),
  team_private.save_staff_factor(uuid, uuid, uuid, jsonb, boolean, boolean),
  public.save_staff_factor(uuid, uuid, uuid, jsonb, boolean, boolean)
  from public, anon, authenticated;
grant execute on function team_private.staff_session_security(uuid, uuid),
  public.staff_session_security(uuid, uuid), public.admit_staff_security_attempt(uuid, text),
  team_private.manage_staff_sessions(uuid, uuid, text, uuid), public.manage_staff_sessions(uuid, uuid, text, uuid),
  team_private.save_staff_factor(uuid, uuid, uuid, jsonb, boolean, boolean),
  public.save_staff_factor(uuid, uuid, uuid, jsonb, boolean, boolean)
  to service_role;
