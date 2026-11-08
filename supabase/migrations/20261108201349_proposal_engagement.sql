-- Apply BEFORE deploying engagement tracking. No client/Auth role may read or write.
create table public.proposal_engagement_totals (
  id uuid primary key references public.proposals(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id),
  data jsonb not null,
  rate_window bigint not null default 0,
  rate_count integer not null default 0
);
create table public.proposal_engagement (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  started_at timestamptz not null,
  data jsonb not null
);
create index proposal_engagement_record on public.proposal_engagement(workspace_id,proposal_id,started_at desc);
create index proposal_engagement_retention on public.proposal_engagement(workspace_id,started_at);
create index proposal_engagement_totals_workspace on public.proposal_engagement_totals(workspace_id);
alter table public.proposal_engagement enable row level security;
alter table public.proposal_engagement_totals enable row level security;
revoke all on public.proposal_engagement, public.proposal_engagement_totals from public, anon, authenticated;
grant select, insert, update, delete on public.proposal_engagement, public.proposal_engagement_totals to service_role;

-- Optimistic aggregate revision + session sequence make retries/concurrent beacons
-- atomic without ever changing proposal content, versions, hashes or PagePlan.
create function public.record_proposal_engagement(p_workspace uuid,p_expected integer,p_session jsonb,p_summary jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  p_id uuid := (p_summary->>'id')::uuid;
  doc jsonb;
  current_row public.proposal_engagement_totals;
  old_session jsonb;
  bucket bigint := floor(extract(epoch from clock_timestamp()) / 600);
  requests integer;
begin
  select state into doc from public.proposals where id=p_id and workspace_id=p_workspace for share;
  if doc is null or doc->>'token' is null or doc->>'archived_at' is not null
     or doc->>'status' not in ('sent','viewed','signed_by_client','completed') then return 'stale'; end if;
  if (p_session->>'proposal_id')::uuid <> p_id or (p_summary->>'revision')::int <> p_expected+1 then
    raise exception 'Invalid engagement identity/revision';
  end if;
  insert into public.proposal_engagement_totals(id,workspace_id,data)
    values(p_id,p_workspace,jsonb_build_object('id',p_id,'revision',0,'views',0,'viewers','[]'::jsonb,'last_viewed_at',null,'total_ms',0,'downloads',0,'choices',0,'targets','{}'::jsonb)) on conflict do nothing;
  select * into current_row from public.proposal_engagement_totals where id=p_id and workspace_id=p_workspace for update;
  if not found then raise exception 'Workspace mismatch'; end if;
  requests := case when current_row.rate_window=bucket then current_row.rate_count+1 else 1 end;
  update public.proposal_engagement_totals set rate_window=bucket,rate_count=least(requests,601) where id=p_id;
  if requests>600 then return 'limited'; end if;
  if (current_row.data->>'revision')::int <> p_expected then return 'stale'; end if;
  select data into old_session from public.proposal_engagement where id=(p_session->>'id')::uuid;
  if old_session is null and (p_session->>'count_view')::boolean and doc->>'status' not in ('sent','viewed') then return 'stale'; end if;
  if old_session is not null and ((old_session->>'proposal_id')::uuid <> p_id
      or (old_session->>'seq')::int >= (p_session->>'seq')::int) then return 'stale'; end if;
  insert into public.proposal_engagement(id,workspace_id,proposal_id,started_at,data)
    values((p_session->>'id')::uuid,p_workspace,p_id,(p_session->>'started_at')::timestamptz,p_session)
    on conflict(id) do update set data=excluded.data;
  update public.proposal_engagement_totals set data=p_summary where id=p_id;
  return 'saved';
end $$;
revoke all on function public.record_proposal_engagement(uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.record_proposal_engagement(uuid,integer,jsonb,jsonb) to service_role;
