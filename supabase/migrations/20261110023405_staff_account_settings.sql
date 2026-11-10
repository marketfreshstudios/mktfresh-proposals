create table public.staff_accounts (
  id uuid primary key references public.staff_users(user_id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id),
  data jsonb not null default '{}'::jsonb
);

create index staff_accounts_workspace on public.staff_accounts(workspace_id);
alter table public.staff_accounts enable row level security;
revoke all on public.staff_accounts from public, anon, authenticated;
grant select, insert, update, delete on public.staff_accounts to service_role;

create function public.save_staff_account(
  target_workspace uuid, target_user uuid, expected jsonb, replacement jsonb,
  expected_name text, next_name text
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  member_name text;
  current_data jsonb;
begin
  select display_name into member_name
    from public.staff_users
    where user_id = target_user and workspace_id = target_workspace and status = 'active'
    for update;
  if not found then return false; end if;

  select data into current_data
    from public.staff_accounts
    where id = target_user and workspace_id = target_workspace;
  if current_data is distinct from expected
    or (next_name is not null and coalesce(nullif(member_name, ''), expected_name) is distinct from expected_name)
  then return false; end if;

  insert into public.staff_accounts(id, workspace_id, data)
    values (target_user, target_workspace, replacement)
    on conflict (id) do update set data = excluded.data;

  if next_name is not null then
    update public.staff_users set display_name = next_name
      where user_id = target_user and workspace_id = target_workspace;
  end if;
  return true;
end
$$;
revoke all on function public.save_staff_account(uuid, uuid, jsonb, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.save_staff_account(uuid, uuid, jsonb, jsonb, text, text)
  to service_role;

create function public.save_account_signature(
  target_workspace uuid, target_user uuid, expected jsonb, signature_image text
) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.staff_users
    where user_id = target_user and workspace_id = target_workspace and status = 'active'
    for update;
  if not found then return false; end if;

  update public.workspace_settings
    set data = jsonb_set(data, '{company_signatory,image}', to_jsonb(signature_image))
    where workspace_id = target_workspace
      and data->'company_signatory' = expected
      and data->'company_signatory'->>'user_id' = target_user::text;
  return found;
end
$$;
revoke all on function public.save_account_signature(uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.save_account_signature(uuid, uuid, jsonb, text)
  to service_role;
