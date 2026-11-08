-- BEFORE deploy. Small service-only transaction; no data backfill or seed payload.
create function public.save_linked_block(p_workspace uuid,p_change jsonb,p_event jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare old jsonb; next jsonb; current_data jsonb; target uuid; pair jsonb; e jsonb;
begin
  perform 1 from public.workspaces where id=p_workspace for update;
  old=p_change->'before'; next=p_change->'after';
  target=coalesce(nullif(old,'null'::jsonb)->>'id',nullif(next,'null'::jsonb)->>'id')::uuid;
  select data into current_data from public.content_library where workspace_id=p_workspace and id=target for update;
  if coalesce(current_data,'null'::jsonb) is distinct from old then return false; end if;
  -- Validate every participant before committing any write. A stale editor aborts all.
  for pair in select value from jsonb_array_elements(p_change->'templates') loop
    select data into current_data from public.templates where workspace_id=p_workspace and id=(pair->'before'->>'id')::uuid for update;
    if current_data is distinct from pair->'before' or current_data->>'starter_key' is not null then return false; end if;
    if pair->'before'->>'id' is distinct from pair->'after'->>'id' then raise exception 'Template identity changed'; end if;
    if ((pair->'before')-array['content','pagination']) is distinct from ((pair->'after')-array['content','pagination']) then raise exception 'Linked update only changes template content'; end if;
  end loop;
  for pair in select value from jsonb_array_elements(p_change->'proposals') loop
    select state into current_data from public.proposals where workspace_id=p_workspace and id=(pair->'before'->>'id')::uuid for update;
    if current_data is distinct from pair->'before' then return false; end if;
    if current_data->>'status' is distinct from 'draft' or current_data->>'source' is distinct from 'native' or coalesce(current_data->>'archived_at','')<>'' or coalesce(current_data->>'token','')<>'' or coalesce(jsonb_array_length(current_data->'signers'),0)>0 or exists(select 1 from jsonb_array_elements(current_data->'versions') v where (v->>'frozen')::boolean) then raise exception 'Only unsigned unsent drafts can update' using errcode='40001'; end if;
    if ((pair->'before')-array['content','pagination','revision','updated_at','events']) is distinct from ((pair->'after')-array['content','pagination','revision','updated_at','events']) then raise exception 'Linked update cannot change signing, versions or billing'; end if;
    if jsonb_array_length(pair->'after'->'events')<>jsonb_array_length(current_data->'events')+1 or ((pair->'after'->'events')-(jsonb_array_length(current_data->'events'))) is distinct from current_data->'events' then raise exception 'Append-only history required';end if;
  end loop;
  if next='null'::jsonb then delete from public.content_library where workspace_id=p_workspace and id=target;
  else
    if (next->>'id')::uuid is distinct from target then raise exception 'Saved block identity changed'; end if;
    insert into public.content_library(id,workspace_id,data) values(target,p_workspace,next) on conflict(id) do update set data=excluded.data where content_library.workspace_id=p_workspace;
    if not found then raise exception 'Workspace mismatch'; end if;
  end if;
  for pair in select value from jsonb_array_elements(p_change->'templates') loop
    update public.templates set data=pair->'after' where workspace_id=p_workspace and id=(pair->'before'->>'id')::uuid;
  end loop;
  for pair in select value from jsonb_array_elements(p_change->'proposals') loop
    perform public.save_proposal(pair->'after',(pair->'before'->>'revision')::integer);
  end loop;
  for e in select value from jsonb_array_elements((p_change->'events')||jsonb_build_array(p_event)) loop
    insert into public.workspace_events(id,workspace_id,data) values((e->>'id')::uuid,p_workspace,e);
  end loop;
  return true;
end $$;
revoke all on function public.save_linked_block(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_linked_block(uuid,jsonb,jsonb) to service_role;
