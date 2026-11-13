-- When a proposal's billing succeeds, the customer it used becomes the client's
-- linked Stripe or QuickBooks customer. Only the system may do this, only when
-- the client has no link yet, and only for the client the billing ran for.
create function public.link_client_billing_customer(target_workspace uuid, target_client uuid, provider text, customer text, expected_email text, audit_event jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare saved jsonb; field text;
begin
  if provider not in ('stripe', 'qbo') or coalesce(customer, '') = '' then
    raise exception 'Unknown billing provider or customer' using errcode = '22023';
  end if;
  field := case provider when 'stripe' then 'stripe_customer_id' else 'qbo_customer_id' end;
  if coalesce(audit_event->>'actor', '') <> 'system'
    or audit_event->>'type' is distinct from (case provider when 'stripe' then 'client_stripe_linked' else 'client_qbo_linked' end) then
    raise exception 'System linking audit required' using errcode = '42501';
  end if;
  select data into saved from public.clients where workspace_id = target_workspace and id = target_client for update;
  if not found then raise exception 'Client not found' using errcode = 'P0002'; end if;
  -- Never replace a link a person chose, and skip a client whose email changed.
  if nullif(saved->>field, '') is not null or lower(saved->>'email') is distinct from lower(expected_email) then
    return false;
  end if;
  update public.clients set data = jsonb_set(saved, array[field], to_jsonb(customer))
    where workspace_id = target_workspace and id = target_client;
  insert into public.workspace_events(id, workspace_id, data)
    values ((audit_event->>'id')::uuid, target_workspace,
      audit_event || jsonb_build_object('metadata', coalesce(audit_event->'metadata', '{}'::jsonb) || jsonb_build_object(
        'client_id', target_client, 'name', saved->>'company', 'provider', provider,
        'previous_customer_id', null, 'customer_id', customer)));
  return true;
end $$;
revoke all on function public.link_client_billing_customer(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.link_client_billing_customer(uuid, uuid, text, text, text, jsonb) to service_role;

-- Backfill: clients whose proposals already billed through exactly one
-- customer per provider get that customer, with the same audit entry.
do $$
declare r record;
begin
  for r in
    select c.workspace_id, c.id as client_id, c.data->>'email' as email, b.provider,
      min(b.data->>'external_customer_id') as customer,
      min(p.id::text) as proposal_id
    from public.clients c
    join public.proposals p on p.client_id = c.id and p.workspace_id = c.workspace_id
    join public.billing_links b on b.proposal_id = p.id and b.workspace_id = c.workspace_id
    where b.provider in ('stripe', 'qbo') and b.status = 'succeeded'
      and coalesce(b.data->>'external_customer_id', '') <> ''
      and nullif(c.data->>(case b.provider when 'stripe' then 'stripe_customer_id' else 'qbo_customer_id' end), '') is null
    group by c.workspace_id, c.id, c.data->>'email', b.provider
    having count(distinct b.data->>'external_customer_id') = 1
  loop
    perform public.link_client_billing_customer(r.workspace_id, r.client_id, r.provider, r.customer, r.email,
      jsonb_build_object('id', gen_random_uuid(), 'actor', 'system', 'ip', '', 'user_agent', '',
        'type', case r.provider when 'stripe' then 'client_stripe_linked' else 'client_qbo_linked' end,
        'created_at', now(), 'metadata', jsonb_build_object('proposal_id', r.proposal_id, 'source', 'backfill')));
  end loop;
end $$;
