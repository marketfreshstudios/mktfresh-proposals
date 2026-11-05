-- Staff contact saves and every unsigned native proposal update commit together.
-- Existing save_client_contact remains available for the connector's client-only writes.
create or replace function public.save_client_and_proposals(target_workspace uuid, contact jsonb, documents jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved jsonb; row record; document jsonb; applied integer := 0;
begin
 if jsonb_typeof(documents) <> 'array' then raise exception 'Proposal updates required'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(documents)) <> jsonb_array_length(documents) then
  raise exception 'Duplicate proposal updates' using errcode='40001';
 end if;
 -- The client lock protects the contact and concurrent explicit Stripe linking.
 perform 1 from public.clients where id=(contact->>'id')::uuid and workspace_id=target_workspace for update;
 saved := public.save_client_contact(target_workspace,contact);
 for row in select id,state from public.proposals
   where workspace_id=target_workspace and state->'client'->>'id'=saved->>'id'
   order by id for update loop
  if row.state->>'source'='native'
    and row.state->>'status' not in ('signed_by_client','completed')
    and jsonb_array_length(coalesce(row.state->'signers','[]'::jsonb))=0
    and not exists(select 1 from jsonb_array_elements(coalesce(row.state->'versions','[]'::jsonb)) v where coalesce((v->>'frozen')::boolean,false))
    and row.state->'client' is distinct from saved then
   select value into document from jsonb_array_elements(documents) where value->>'id'=row.id::text;
   if document is null or document->>'workspace_id' is distinct from target_workspace::text
     or document->'client'->>'id' is distinct from saved->>'id'
     or (document->>'revision')::integer is distinct from (row.state->>'revision')::integer+1 then
    raise exception 'Client proposals changed; retry saving the client' using errcode='40001';
   end if;
   document := jsonb_set(document,'{client}',saved);
   perform public.save_proposal(document,(row.state->>'revision')::integer);
   applied := applied+1;
  end if;
 end loop;
 if applied <> jsonb_array_length(documents) then
  raise exception 'Proposal signed or changed; retry saving the client' using errcode='40001';
 end if;
 return saved;
end $$;
revoke all on function public.save_client_and_proposals(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_client_and_proposals(uuid,jsonb,jsonb) to service_role;
