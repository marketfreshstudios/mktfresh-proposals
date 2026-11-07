-- Apply BEFORE deploying connector template/block tools. No existing rows are changed.
-- Revisions live in append-only workspace_events; no new table or client grants.
create or replace function public.save_studio_entity(
  p_workspace uuid,p_table text,p_id uuid,p_expected jsonb,p_replacement jsonb,p_event jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare affected integer;
begin
  if p_table not in ('templates','content_library') or p_replacement->>'id' is distinct from p_id::text then
    raise exception 'Invalid Studio entity';
  end if;
  if p_table='templates' and (p_replacement->>'starter_key' is not null or p_expected->>'starter_key' is not null) then
    raise exception 'Starters are read-only; duplicate_template first';
  end if;
  if p_expected is null then
    execute format('insert into public.%I(id,workspace_id,data) values($1,$2,$3) on conflict(id) do nothing',p_table)
      using p_id,p_workspace,p_replacement;
  else
    execute format('update public.%I set data=$1 where id=$2 and workspace_id=$3 and data=$4',p_table)
      using p_replacement,p_id,p_workspace,p_expected;
  end if;
  get diagnostics affected=row_count;
  if affected=0 then return false;end if;
  insert into public.workspace_events(id,workspace_id,data) values((p_event->>'id')::uuid,p_workspace,p_event);
  return true;
end $$;
revoke all on function public.save_studio_entity(uuid,text,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_studio_entity(uuid,text,uuid,jsonb,jsonb,jsonb) to service_role;
