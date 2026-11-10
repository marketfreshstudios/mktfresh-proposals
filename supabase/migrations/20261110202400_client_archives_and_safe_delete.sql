-- Keep immutable evidence anchored to its original proposal ID after an eligible
-- draft is deleted. Existing event and file rows, triggers, and grants stay intact.
create table public.proposal_evidence_ids (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  unique (workspace_id, id)
);
alter table public.proposal_evidence_ids enable row level security;
revoke all on public.proposal_evidence_ids from public, anon, authenticated;
grant select, insert on public.proposal_evidence_ids to service_role;

insert into public.proposal_evidence_ids(id, workspace_id)
select id, workspace_id from public.proposals;

create function public.anchor_proposal_evidence()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.proposal_evidence_ids(id, workspace_id) values(new.id, new.workspace_id)
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.anchor_proposal_evidence() from public, anon, authenticated;
grant execute on function public.anchor_proposal_evidence() to service_role;
create trigger proposal_evidence_anchor before insert on public.proposals
for each row execute function public.anchor_proposal_evidence();

alter table public.events
  drop constraint events_proposal_id_fkey,
  drop constraint events_workspace_id_proposal_id_fkey,
  add foreign key (workspace_id, proposal_id)
    references public.proposal_evidence_ids(workspace_id, id);
alter table public.files
  drop constraint files_proposal_id_fkey,
  drop constraint files_workspace_id_proposal_id_fkey,
  add foreign key (workspace_id, proposal_id)
    references public.proposal_evidence_ids(workspace_id, id);

alter table public.clients add column archived_at timestamptz;

create function public.set_client_archived(
  target_workspace uuid, target_client uuid, archived boolean, audit_event jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current_client public.clients%rowtype; action text := case when archived then 'client_archived' else 'client_restored' end;
begin
  if audit_event->>'type' is distinct from action or coalesce(audit_event->>'actor', '') not like 'staff:%' then
    raise exception 'Staff archive audit required' using errcode='42501';
  end if;
  select * into current_client from public.clients
    where workspace_id=target_workspace and id=target_client for update;
  if not found then raise exception 'Client not found' using errcode='P0002'; end if;
  if archived is distinct from (current_client.archived_at is not null) then
    update public.clients set archived_at=case when archived then now() else null end
      where workspace_id=target_workspace and id=target_client returning * into current_client;
    insert into public.workspace_events(id, workspace_id, data) values(
      (audit_event->>'id')::uuid, target_workspace,
      audit_event || jsonb_build_object('metadata', jsonb_build_object('client_id', target_client, 'company', current_client.data->>'company')));
  end if;
  return current_client.data || jsonb_build_object('archived_at', current_client.archived_at);
end $$;
revoke all on function public.set_client_archived(uuid,uuid,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.set_client_archived(uuid,uuid,boolean,jsonb) to service_role;

create or replace function public.delete_unused_client(target_workspace uuid, target_client uuid, audit_event jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare client_name text; proposal_ids uuid[];
begin
  if audit_event->>'type' is distinct from 'client_deleted'
    or audit_event->>'staff_role' is distinct from 'owner'
    or coalesce(audit_event->>'actor', '') not like 'staff:%' then
    raise exception 'Only super admins can delete clients' using errcode='42501';
  end if;
  select data->>'company' into client_name from public.clients
    where workspace_id=target_workspace and id=target_client for update;
  if not found then raise exception 'Client not found' using errcode='P0002'; end if;

  -- The client FK lock blocks new references. Lock existing drafts against a
  -- concurrent send or restore before evaluating eligibility.
  select array(select id from public.proposals
    where workspace_id=target_workspace and client_id=target_client order by id for update)
  into proposal_ids;
  if exists (
    select 1 from public.proposals p
    where p.workspace_id=target_workspace and p.id=any(proposal_ids)
      and (p.source <> 'native' or p.status not in ('draft','archived') or p.token is not null
        or coalesce(p.state->>'token', p.state->>'sent_at', p.state->>'first_viewed_at',
          p.state->>'client_signed_at', p.state->>'completed_at') is not null
        or coalesce(jsonb_array_length(p.state->'versions'), 0) > 0
        or coalesce(jsonb_array_length(p.state->'signers'), 0) > 0
        or coalesce(jsonb_array_length(p.state->'billing_links'), 0) > 0
        or exists (select 1 from public.proposal_versions v where v.workspace_id=target_workspace and v.proposal_id=p.id)
        or exists (select 1 from public.signers s where s.workspace_id=target_workspace and s.proposal_id=p.id)
        or exists (select 1 from public.billing_links b where b.workspace_id=target_workspace and b.proposal_id=p.id)
        or exists (select 1 from public.files f where f.workspace_id=target_workspace and f.proposal_id=p.id and f.kind <> 'render')
        or exists (select 1 from public.jobs j where j.workspace_id=target_workspace and j.proposal_id=p.id and j.data->>'kind'='billing')
        or exists (select 1 from public.events e where e.workspace_id=target_workspace and e.proposal_id=p.id
          and e.type in ('sent','reopened','viewed','signed','counter_signed','countersigned','declined','invoice_created','subscription_created','billing_completed'))
        or exists (select 1 from public.proposal_engagement_totals e where e.workspace_id=target_workspace and e.id=p.id)
        or exists (select 1 from public.proposal_engagement e where e.workspace_id=target_workspace and e.proposal_id=p.id)
        or exists (select 1 from public.proposal_questions q where q.workspace_id=target_workspace and q.proposal_id=p.id))
  ) then
    raise exception 'This client has proposal history that must be kept. Archive the client instead.' using errcode='23503';
  end if;
  if exists (select 1 from public.proposals where workspace_id=target_workspace
    and id=any(proposal_ids) and status<>'archived' and nullif(state->>'archived_at','') is null) then
    raise exception 'Archive this client’s unsent drafts before deleting it.' using errcode='23503';
  end if;
  delete from public.jobs where workspace_id=target_workspace and proposal_id=any(proposal_ids);
  delete from public.proposals where workspace_id=target_workspace and id=any(proposal_ids);
  delete from public.clients where workspace_id=target_workspace and id=target_client;
  insert into public.workspace_events(id, workspace_id, data) values(
    (audit_event->>'id')::uuid, target_workspace,
    audit_event || jsonb_build_object('metadata', jsonb_build_object(
      'client_id', target_client, 'company', client_name, 'deleted_draft_ids', to_jsonb(proposal_ids))));
end $$;
revoke all on function public.delete_unused_client(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.delete_unused_client(uuid,uuid,jsonb) to service_role;
