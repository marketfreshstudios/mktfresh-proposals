-- A closed workspace's data is deleted 90 days after it closes (Terms 12,
-- Privacy 5). Closing marks the time and makes the plan canceled; a daily
-- job purges what has been closed for 90 days. The append-only and frozen
-- record guards allow a delete only inside that purge, for that workspace.

alter table public.workspaces add column if not exists closed_at timestamptz;

create or replace function public.reject_mutation() returns trigger
language plpgsql set search_path to '' as $$
begin
  if tg_op = 'DELETE'
     and current_setting('yeswell.purge_workspace', true) = old.workspace_id::text then
    return old;
  end if;
  raise exception 'Append-only record';
end $$;

create or replace function public.protect_version() returns trigger
language plpgsql set search_path to '' as $$
begin
  if tg_op = 'DELETE'
     and current_setting('yeswell.purge_workspace', true) = old.workspace_id::text then
    return old;
  end if;
  if tg_op = 'DELETE' or (old.data->>'frozen')::boolean then
    raise exception 'Frozen version is immutable';
  end if;
  return new;
end $$;

-- Close a workspace: read-only now, deleted 90 days from now. Idempotent.
create or replace function public.close_workspace(target_workspace uuid)
returns timestamptz language sql security definer set search_path to '' as $$
  update public.workspaces
     set closed_at = coalesce(closed_at, now()), plan_status = 'canceled'
   where id = target_workspace
  returning closed_at;
$$;

-- Workspaces closed for 90 days or more, oldest first.
create or replace function public.workspaces_due_for_deletion()
returns setof uuid language sql stable security definer set search_path to '' as $$
  select id from public.workspaces
   where closed_at is not null and closed_at <= now() - interval '90 days'
   order by closed_at;
$$;

-- Delete everything a closed workspace holds in the database. Storage files
-- and sign-in identities are removed by the app around this call. Returns the
-- staff user ids that belonged to it.
create or replace function public.purge_workspace(target_workspace uuid)
returns setof uuid language plpgsql security definer set search_path to '' as $$
declare
  members uuid[];
begin
  if not exists (
    select 1 from public.workspaces
     where id = target_workspace
       and closed_at is not null
       and closed_at <= now() - interval '90 days'
  ) then
    raise exception 'Workspace is not due for deletion';
  end if;
  select coalesce(array_agg(user_id), '{}') into members
    from public.staff_users where workspace_id = target_workspace;
  perform set_config('yeswell.purge_workspace', target_workspace::text, true);
  delete from public.proposal_question_mail where workspace_id = target_workspace;
  delete from public.proposal_questions where workspace_id = target_workspace;
  delete from public.proposal_engagement where workspace_id = target_workspace;
  delete from public.proposal_engagement_totals where workspace_id = target_workspace;
  delete from public.signers where workspace_id = target_workspace;
  delete from public.billing_links where workspace_id = target_workspace;
  delete from public.jobs where workspace_id = target_workspace;
  delete from public.proposal_versions where workspace_id = target_workspace;
  delete from public.events where workspace_id = target_workspace;
  delete from public.files where workspace_id = target_workspace;
  delete from public.proposals where workspace_id = target_workspace;
  delete from public.proposal_evidence_ids where workspace_id = target_workspace;
  delete from public.clients where workspace_id = target_workspace;
  delete from public.pricing_items where workspace_id = target_workspace;
  delete from public.templates where workspace_id = target_workspace;
  delete from public.content_library where workspace_id = target_workspace;
  delete from public.custom_families where workspace_id = target_workspace;
  delete from public.provider_actions where workspace_id = target_workspace;
  delete from public.provider_credentials where workspace_id = target_workspace;
  delete from public.webhook_events where workspace_id = target_workspace;
  delete from public.oauth_records where workspace_id = target_workspace;
  delete from public.workspace_events where workspace_id = target_workspace;
  delete from public.email_templates where workspace_id = target_workspace;
  delete from public.email_log where workspace_id = target_workspace;
  delete from public.team_audit where workspace_id = target_workspace;
  delete from public.workspace_documents where workspace_id = target_workspace;
  delete from public.workspace_settings where workspace_id = target_workspace;
  delete from public.staff_accounts where workspace_id = target_workspace;
  delete from public.staff_users where workspace_id = target_workspace;
  delete from public.workspaces where id = target_workspace;
  perform set_config('yeswell.purge_workspace', '', true);
  return query select unnest(members);
end $$;

revoke all on function public.close_workspace(uuid) from public, anon, authenticated;
revoke all on function public.workspaces_due_for_deletion() from public, anon, authenticated;
revoke all on function public.purge_workspace(uuid) from public, anon, authenticated;
grant execute on function public.close_workspace(uuid) to service_role;
grant execute on function public.workspaces_due_for_deletion() to service_role;
grant execute on function public.purge_workspace(uuid) to service_role;
