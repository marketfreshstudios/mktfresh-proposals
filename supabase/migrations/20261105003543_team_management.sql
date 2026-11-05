-- Workspace membership is authoritative on every staff and connector request.
alter table public.staff_users
 add column status text not null default 'active' check(status in ('active','invited','deactivated')),
 add column invited_at timestamptz,
 add column invited_by uuid,
 add column deactivated_at timestamptz,
 add column password_change_required boolean not null default false,
 add column session_version integer not null default 0 check(session_version >= 0);
create table public.team_audit (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 actor text not null, actor_name text not null,
 target_user_id uuid not null, target_name text not null,
 action text not null,
 before jsonb, after jsonb,
 created_at timestamptz not null default now()
);
create index team_audit_workspace_time on public.team_audit(workspace_id,created_at desc);
alter table public.team_audit enable row level security;
revoke all on public.team_audit from anon,authenticated;
grant select on public.team_audit to authenticated;
grant all on public.team_audit to service_role;
create policy workspace_read on public.team_audit for select to authenticated
 using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid()) and status='active' and not password_change_required));
create trigger immutable_team_audit before update or delete on public.team_audit for each row execute function public.reject_mutation();
-- All ordinary Data API reads must cease immediately on deactivation as well.
do $$ declare p record; begin
 for p in select tablename,policyname,qual from pg_policies
 where schemaname='public' and cmd='SELECT' and tablename <> 'staff_users'
 and qual like '%staff_users%' loop
  execute format('alter policy %I on public.%I using ((%s) and exists(select 1 from public.staff_users where user_id=(select auth.uid()) and status=''active'' and not password_change_required))',p.policyname,p.tablename,p.qual);
 end loop;
end $$;
-- Serialize membership changes by workspace; simultaneous demotions cannot remove both admins.
create function public.change_team_member(target_workspace uuid, actor_id uuid, target_id uuid, operation text, changes jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare admin public.staff_users; previous public.staff_users; current_member public.staff_users; old_json jsonb; new_json jsonb; admin_name text;
begin
 perform 1 from public.workspaces where id=target_workspace for update;
 select * into admin from public.staff_users where user_id=actor_id and workspace_id=target_workspace and (status='active' or (status='invited' and operation='password_changed' and actor_id=target_id)) and (not password_change_required or (operation='password_changed' and actor_id=target_id));
 if not found or (admin.role <> 'owner' and not(actor_id=target_id and operation in ('name','password_changed'))) then
  raise exception 'Only a super admin can manage users' using errcode='42501';
 end if;
 select * into previous from public.staff_users where user_id=target_id and workspace_id=target_workspace for update;
 if operation <> 'invite' and not found then raise exception 'Staff member not found in this workspace' using errcode='P0002'; end if;
 if operation='invite' and exists(select 1 from public.staff_users where user_id=target_id) then raise exception 'User already belongs to a workspace' using errcode='23505'; end if;
 if operation not in ('invite','name','role','password_set','password_changed','reset_sent','invite_resent','deactivate','reactivate','remove') then raise exception 'Invalid team action'; end if;
 if actor_id=target_id and operation in ('password_set','deactivate','remove') then raise exception 'Use your profile for your own password; you cannot deactivate or remove yourself' using errcode='23514'; end if;
 if previous.role='owner' and previous.status='active' and (operation in ('deactivate','remove') or (operation='role' and changes->>'role' <> 'owner'))
 and (select count(*) from public.staff_users where workspace_id=target_workspace and role='owner' and status='active') <= 1 then
  raise exception 'The workspace must keep at least one active super admin' using errcode='23514'; end if;
 if operation='remove' and exists(select 1 from public.proposals where workspace_id=target_workspace and source <> 'proposify_import' and status not in ('completed','declined','expired','archived') and (state->'sender'->>'user_id'=target_id::text or (status='draft' and state->>'created_by'='staff:'||target_id))) then
  raise exception 'This person has unfinished proposals. Finish this work or use Deactivate instead.' using errcode='23514'; end if;
 if operation in ('deactivate','remove','reactivate') then perform team_private.revoke_staff_sessions(target_workspace,actor_id,target_id); end if;
 old_json=case when operation='invite' then null else to_jsonb(previous)-'session_version' end;
 if operation='invite' then
  insert into public.staff_users(user_id,workspace_id,role,display_name,status,invited_at,invited_by,password_change_required)
  values(target_id,target_workspace,coalesce(changes->>'role','member'),changes->>'display_name','invited',now(),actor_id,true);
 elsif operation='remove' then
  delete from public.staff_users where user_id=target_id and workspace_id=target_workspace;
 else
  update public.staff_users set
   display_name=case when operation='name' then changes->>'display_name' else display_name end,
   role=case when operation='role' then changes->>'role' else role end,
   status=case when operation='deactivate' then 'deactivated' when operation in ('reactivate','password_set','password_changed') then 'active' else status end,
   invited_at=case when operation='invite_resent' then now() else invited_at end,
   deactivated_at=case when operation='deactivate' then now() when operation='reactivate' then null else deactivated_at end,
   password_change_required=case when operation='password_set' then coalesce((changes->>'password_change_required')::boolean,true) when operation='password_changed' then false else password_change_required end,
   session_version=session_version+case when operation in ('password_set','password_changed','deactivate','reactivate') then 1 else 0 end
  where user_id=target_id and workspace_id=target_workspace;
 end if;
 select * into current_member from public.staff_users where user_id=target_id and workspace_id=target_workspace;
 new_json=case when operation='remove' then null else to_jsonb(current_member)-'session_version' end;
 admin_name=admin.display_name;
 insert into public.team_audit(workspace_id,actor,actor_name,target_user_id,target_name,action,before,after)
 values(target_workspace,'staff:'||actor_id,admin_name,target_id,coalesce(current_member.display_name,previous.display_name),operation,old_json,new_json);
 return to_jsonb(current_member);
end $$;
revoke all on function public.change_team_member(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.change_team_member(uuid,uuid,uuid,text,jsonb) to service_role;
-- A password update revokes refresh tokens at Auth; also reject surviving JWTs immediately.
-- Preflight invitations without modifying an identity that belongs to another workspace.
-- Auth tables are private to Supabase. This narrowly scoped definer is outside
-- the exposed schema, checks the caller's membership again, and is service-only.
create schema if not exists team_private;
revoke all on schema team_private from public,anon,authenticated;
grant usage on schema team_private to service_role;
create function team_private.revoke_staff_sessions(target_workspace uuid,actor_id uuid,target_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.staff_users where user_id=actor_id and workspace_id=target_workspace and role='owner' and status='active' and not password_change_required)
 or not exists(select 1 from public.staff_users where user_id=target_id and workspace_id=target_workspace) then
  raise exception 'Only a super admin can revoke this workspace session' using errcode='42501';
 end if;
 update public.oauth_records set data=jsonb_set(data,'{revoked}','true'::jsonb) where workspace_id=target_workspace and kind='grant' and data->>'user_id'=target_id::text;
 delete from auth.refresh_tokens where user_id::text=target_id::text;
 delete from auth.sessions where user_id=target_id;
end $$;
revoke all on function team_private.revoke_staff_sessions(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function team_private.revoke_staff_sessions(uuid,uuid,uuid) to service_role;

create function team_private.staff_session_exists(target_user uuid,target_session uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin return exists(select 1 from auth.sessions where user_id=target_user and id=target_session); end $$;
revoke all on function team_private.staff_session_exists(uuid,uuid) from public,anon,authenticated;
grant execute on function team_private.staff_session_exists(uuid,uuid) to service_role;
create function public.staff_session_exists(target_user uuid,target_session uuid) returns boolean
language sql security invoker set search_path='' as $$select team_private.staff_session_exists(target_user,target_session)$$;
revoke all on function public.staff_session_exists(uuid,uuid) from public,anon,authenticated;
grant execute on function public.staff_session_exists(uuid,uuid) to service_role;

create function team_private.team_auth_identity(target_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('id',u.id,'workspace_id',s.workspace_id,'confirmed',u.email_confirmed_at is not null)
 into result from auth.users u left join public.staff_users s on s.user_id=u.id
 where lower(u.email)=lower(target_email) limit 1;
 return result;
end $$;
revoke all on function team_private.team_auth_identity(text) from public,anon,authenticated;
grant execute on function team_private.team_auth_identity(text) to service_role;

create function public.team_auth_identity(target_email text) returns jsonb
language sql security invoker set search_path='' as $$select team_private.team_auth_identity(target_email)$$;
revoke all on function public.team_auth_identity(text) from public,anon,authenticated;
grant execute on function public.team_auth_identity(text) to service_role;
