-- Preserve concurrent contact edits and commit the reviewed link with its audit entry.
create function public.link_client_stripe(target_workspace uuid, target_client uuid, expected_customer text, expected_email text, customer text, audit_event jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare saved jsonb;
begin
  select data into saved from public.clients where workspace_id=target_workspace and id=target_client for update;
  if not found then raise exception 'Client not found' using errcode='P0002'; end if;
  if (saved->>'stripe_customer_id') is distinct from expected_customer or lower(saved->>'email') is distinct from lower(expected_email) then
    raise exception 'Customer link or email changed; reload and try again' using errcode='40001';
  end if;
  if coalesce(audit_event->>'actor','') not like 'staff:%' or audit_event->>'type' is distinct from (case when customer is null then 'client_stripe_unlinked' else 'client_stripe_linked' end) then
    raise exception 'Staff linking audit required' using errcode='42501';
  end if;
  update public.clients set data = jsonb_set(saved,'{stripe_customer_id}',coalesce(to_jsonb(customer),'null'::jsonb)) where workspace_id=target_workspace and id=target_client;
  insert into public.workspace_events(id,workspace_id,data) values((audit_event->>'id')::uuid,target_workspace,audit_event || jsonb_build_object('metadata',jsonb_build_object('client_id',target_client,'name',saved->>'company','previous_customer_id',expected_customer,'customer_id',customer)));
end $$;
revoke all on function public.link_client_stripe(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.link_client_stripe(uuid,uuid,text,text,text,jsonb) to service_role;

-- Ordinary contact edits cannot overwrite a concurrent explicit Stripe choice.
create function public.save_client_contact(target_workspace uuid, contact jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved jsonb;
begin
  insert into public.clients(id,workspace_id,data) values((contact->>'id')::uuid,target_workspace,contact || jsonb_build_object('stripe_customer_id',null))
  on conflict(id) do update set data=excluded.data || jsonb_build_object('stripe_customer_id',public.clients.data->'stripe_customer_id')
    where public.clients.workspace_id=target_workspace
  returning data into saved;
  if not found then raise exception 'Client not found' using errcode='P0002'; end if;
  return saved;
end $$;
revoke all on function public.save_client_contact(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_client_contact(uuid,jsonb) to service_role;
