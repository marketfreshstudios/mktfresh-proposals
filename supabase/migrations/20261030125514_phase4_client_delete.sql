-- Client deletion and its workspace audit entry are one transaction. FK key-share
-- locks serialize new proposals against the locked client, including imports.
create function public.delete_unused_client(target_workspace uuid, target_client uuid, audit_event jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare client_name text; proposal_count integer;
begin
  select data->>'company' into client_name from public.clients
    where workspace_id=target_workspace and id=target_client for update;
  if not found then raise exception 'Client not found' using errcode='P0002'; end if;
  select count(*) into proposal_count from public.proposals where workspace_id=target_workspace and client_id=target_client;
  if proposal_count > 0 then
    raise exception 'Has % proposals — archive them or keep the client', proposal_count using errcode='23503';
  end if;
  if audit_event->>'type' <> 'client_deleted' or audit_event->>'actor' not like 'staff:%' then
    raise exception 'Staff deletion audit required' using errcode='42501';
  end if;
  delete from public.clients where workspace_id=target_workspace and id=target_client;
  insert into public.workspace_events(id,workspace_id,data) values(
    (audit_event->>'id')::uuid,target_workspace,
    audit_event || jsonb_build_object('metadata',jsonb_build_object('client_id',target_client,'company',client_name)));
end $$;
revoke all on function public.delete_unused_client(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.delete_unused_client(uuid,uuid,jsonb) to service_role;
