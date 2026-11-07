-- Apply BEFORE deploying the starter library. No existing templates/proposals are changed.
create or replace function public.replace_library_starter(
  p_workspace uuid, p_id uuid, p_expected jsonb, p_replacement jsonb, p_event jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare affected integer;
begin
  if p_replacement->>'id' is distinct from p_id::text
     or p_expected->>'starter_key' is null
     or p_replacement->>'starter_key' is distinct from p_expected->>'starter_key' then
    raise exception 'Invalid starter replacement';
  end if;
  update public.templates set data=p_replacement
    where workspace_id=p_workspace and id=p_id and data=p_expected
      and data->>'starter_key' is not null;
  get diagnostics affected = row_count;
  if affected=0 then return false; end if;
  insert into public.workspace_events(id,workspace_id,data)
    values ((p_event->>'id')::uuid,p_workspace,p_event);
  return true;
end $$;
revoke all on function public.replace_library_starter(uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.replace_library_starter(uuid,uuid,jsonb,jsonb,jsonb) to service_role;
